import { NavigationError, ProtocolError, TargetClosedError } from "../cdp/errors.js";
import { delay } from "../utils/timeout.js";
import { PageWaiter } from "./waiter.js";
import { NetworkTracker } from "./network.js";
import { RouteRegistry } from "./route.js";
import { Locator } from "./locator.js";
import { KokoClient } from "./lp-client.js";
import { NodeHandle } from "./node-handle.js";
import { searchGoogle } from "./google-search.js";
import { Keyboard, Mouse } from "./input.js";
import { waitForDownload } from "./download.js";
import { Frame, PageFrameLocator, flattenFrameTree } from "./frame.js";
import { consoleMessageFromCdp, pageErrorFromCdp, } from "./console-message.js";
const DEFAULT_TTFX = `(() => {
  const body = document.body;
  return body && (body.innerText?.trim().length || body.childElementCount > 0);
})()`;
const DEFAULT_EXTRACT = `(() => {
  const links = document.querySelectorAll('a[href]');
  const title = document.querySelector("h1")?.textContent?.trim()
    || document.title.trim();
  return {
    title,
    linkCount: links.length,
    htmlBytes: document.documentElement?.outerHTML?.length ?? 0,
  };
})()`;
const CONTENT_EXPR = `(() => {
  const html = document.documentElement ? document.documentElement.outerHTML : '';
  if (/^\\s*<!doctype/i.test(html)) return html;
  const dt = document.doctype ? new XMLSerializer().serializeToString(document.doctype) : '';
  return (dt || '<!DOCTYPE html>') + '\\n' + html;
})()`;
function validateExtractSchema(value, schema, path = "$") {
    const errors = [];
    const actualType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    if (schema.type && actualType !== schema.type) {
        return [`${path} must be ${schema.type}, got ${actualType}`];
    }
    if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
        errors.push(`${path} must be one of the declared enum values`);
    }
    if (actualType === "object" && value) {
        const record = value;
        for (const key of schema.required ?? []) {
            if (!(key in record))
                errors.push(`${path}.${key} is required`);
        }
        for (const [key, child] of Object.entries(schema.properties ?? {})) {
            if (key in record)
                errors.push(...validateExtractSchema(record[key], child, `${path}.${key}`));
        }
        if (schema.additionalProperties === false && schema.properties) {
            for (const key of Object.keys(record)) {
                if (!(key in schema.properties))
                    errors.push(`${path}.${key} is not allowed`);
            }
        }
    }
    if (actualType === "array" && schema.items) {
        value.forEach((item, index) => {
            errors.push(...validateExtractSchema(item, schema.items, `${path}[${index}]`));
        });
    }
    return errors;
}
export class Page {
    session;
    network;
    waiter;
    keyboard;
    mouse;
    /** Koko LP domain — AI extraction and backend-node agent actions. */
    agent;
    /** Stable Koko extension namespace; `agent` remains as a compatibility alias. */
    koko;
    routes;
    initialized = false;
    closePromise;
    mainFrameId;
    documentGeneration = 0;
    currentPageUrl = "about:blank";
    closeHooks = new Set();
    constructor(session) {
        this.session = session;
        this.routes = new RouteRegistry(session);
        this.network = new NetworkTracker(session);
        this.waiter = new PageWaiter(session, this.network);
        this.keyboard = new Keyboard(session);
        this.mouse = new Mouse(session);
        this.agent = new KokoClient(this, session);
        this.koko = this.agent;
    }
    /** Register cleanup when page.close() runs (used by Browser/Context). */
    onClose(hook) {
        this.closeHooks.add(hook);
    }
    on(event, handler) {
        void this.init();
        if (event === "lifecycle") {
            return this.session.on("Page.lifecycleEvent", handler);
        }
        if (event === "request"
            || event === "response"
            || event === "requestfailed"
            || event === "requestfinished") {
            return this.network.on(event, handler);
        }
        if (event === "console") {
            return this.session.on("Runtime.consoleAPICalled", (payload) => {
                handler(consoleMessageFromCdp(payload));
            });
        }
        return this.session.on("Runtime.exceptionThrown", (payload) => {
            handler(pageErrorFromCdp(payload));
        });
    }
    async init() {
        if (this.initialized)
            return;
        this.initialized = true;
        this.session.on("Page.frameNavigated", (event) => {
            const frame = event?.frame;
            if (frame && !frame.parentId) {
                this.mainFrameId = frame.id;
                if (typeof frame.url === "string")
                    this.currentPageUrl = frame.url;
                this.documentGeneration++;
            }
        });
        this.session.on("Inspector.detached", (event) => {
            this.session.markClosed(new TargetClosedError(event?.reason ?? "Inspector detached", { sessionId: this.session.sessionId }));
        });
        await this.session.send("Page.enable").catch(() => undefined);
        // Core and Chromium expose networkIdle/networkAlmostIdle through the
        // lifecycle stream. Enabling it here keeps Page.goto() and consumers of
        // page.on("lifecycle") on the same source of truth.
        await this.session.send("Page.setLifecycleEventsEnabled", { enabled: true }).catch(() => undefined);
        await this.session.send("Runtime.enable").catch(() => undefined);
        const tree = await this.session.send("Page.getFrameTree").catch(() => undefined);
        const rootFrame = tree?.frameTree?.frame;
        this.mainFrameId = rootFrame?.id ?? this.mainFrameId;
        if (typeof rootFrame?.url === "string")
            this.currentPageUrl = rootFrame.url;
    }
    async goto(url, options = {}) {
        await this.init();
        this.network.reset();
        await this.network.ensureEnabled();
        let navigationResponse = null;
        const offResponse = this.network.on("response", (response) => {
            if (response.request.isNavigationRequest())
                navigationResponse = response;
        });
        const waitPromise = this.waiter.waitForNavigation({
            ...options,
            frameId: this.mainFrameId,
        });
        waitPromise.catch(() => undefined);
        const documentGenerationBefore = this.documentGeneration;
        try {
            let result;
            try {
                result = await this.session.send("Page.navigate", { url }, options.timeout, options.signal);
            }
            catch (error) {
                if (error instanceof ProtocolError) {
                    throw new NavigationError(error.message, {
                        method: "Page.navigate",
                        sessionId: this.session.sessionId,
                        payload: error.payload,
                        cause: error,
                        retryable: error.retryable,
                        url,
                        details: { reason: error.message },
                    });
                }
                throw error;
            }
            if (result.errorText) {
                throw new NavigationError(result.errorText, {
                    method: "Page.navigate",
                    sessionId: this.session.sessionId,
                    payload: result,
                    url,
                });
            }
            if (result.frameId)
                this.mainFrameId = result.frameId;
            // Preserve a URL already reported by frameNavigated (for example after
            // a redirect). The fallback supports runtimes that omit that event.
            if (this.documentGeneration === documentGenerationBefore)
                this.currentPageUrl = url;
            await waitPromise;
            return {
                response: navigationResponse,
                url: this.currentPageUrl,
                frameId: result.frameId ?? this.mainFrameId,
                loaderId: result.loaderId,
            };
        }
        finally {
            offResponse();
        }
    }
    async evaluate(expressionOrFunction, options = {}) {
        await this.init();
        const expression = typeof expressionOrFunction === "function"
            ? `(${expressionOrFunction.toString()})()`
            : expressionOrFunction;
        // After clean-slate re-nav, CDP may briefly lack a default execution context.
        // One cheap retry avoids empty title/snapshot without slowing the happy path.
        const maxAttempts = 2;
        let lastErr;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                if (attempt > 0)
                    await delay(50);
                const result = await this.session.send("Runtime.evaluate", {
                    expression,
                    returnByValue: true,
                    awaitPromise: true,
                }, options.timeout, options.signal);
                if (result.exceptionDetails) {
                    const ex = result.exceptionDetails;
                    const desc = ex?.exception?.description ?? ex?.exception?.value ?? ex?.text ?? "Runtime.evaluate failed";
                    throw new ProtocolError(typeof desc === "string" ? desc : JSON.stringify(desc), {
                        method: "Runtime.evaluate",
                        sessionId: this.session.sessionId,
                        payload: ex,
                    });
                }
                return result.result?.value;
            }
            catch (err) {
                lastErr = err;
                const msg = err instanceof Error ? err.message : String(err);
                const retryable = /execution context|Cannot find default|context was destroyed|Inspected target/i.test(msg);
                if (!retryable || attempt === maxAttempts - 1)
                    throw err;
            }
        }
        throw lastErr;
    }
    /** Single round-trip HTML snapshot (doctype + outerHTML). */
    async content() {
        await this.init();
        return this.evaluate(CONTENT_EXPR);
    }
    /**
     * Read the engine's Performance Timeline, including Koko's native paint,
     * LCP and Event Timing entries. Unknown optional fields are omitted by
     * Chromium and remain undefined for portable callers.
     */
    async performanceEntries(entryType, options = {}) {
        const selector = entryType == null
            ? "performance.getEntries()"
            : `performance.getEntriesByType(${JSON.stringify(entryType)})`;
        return this.evaluate(`(() => ${selector}.map((entry) => ({
      name: entry.name,
      entryType: entry.entryType,
      startTime: entry.startTime,
      duration: entry.duration,
      ...(entry.value !== undefined ? { value: entry.value } : {}),
      ...(entry.hadRecentInput !== undefined ? { hadRecentInput: entry.hadRecentInput } : {}),
      ...(entry.interactionId !== undefined ? { interactionId: entry.interactionId } : {}),
      ...(entry.processingStart !== undefined ? { processingStart: entry.processingStart } : {}),
      ...(entry.processingEnd !== undefined ? { processingEnd: entry.processingEnd } : {}),
      ...(entry.renderTime !== undefined ? { renderTime: entry.renderTime } : {}),
      ...(entry.loadTime !== undefined ? { loadTime: entry.loadTime } : {}),
      ...(entry.size !== undefined ? { size: entry.size } : {}),
    })))()`, options);
    }
    /**
     * Crawler helper: wait for a TTFX probe then run a structured extract expression.
     * Defaults are site-independent; pass expressions for domain-specific schemas.
     */
    async extract(options = {}) {
        await this.init();
        const timeout = options.timeout ?? 30_000;
        const ttfx = options.ttfx ?? DEFAULT_TTFX;
        const expression = options.expression ?? DEFAULT_EXTRACT;
        await this.waiter.pollUntilTruthy(ttfx, { timeout, label: "Waiting for extractable content" });
        const value = await this.evaluate(expression, { timeout });
        if (!value || typeof value !== "object") {
            throw new ProtocolError("extract returned invalid payload", { method: "Page.extract" });
        }
        if (options.schema) {
            const errors = validateExtractSchema(value, options.schema);
            if (errors.length) {
                throw new ProtocolError(`extract schema validation failed: ${errors.join("; ")}`, {
                    method: "Page.extract",
                    payload: { errors },
                });
            }
        }
        return value;
    }
    waitForSelector(selector, options) {
        return this.waiter.waitForSelector(selector, options);
    }
    waitForFunction(fn, options) {
        return this.waiter.waitForFunction(fn, options);
    }
    waitForNavigation(options = {}) {
        return this.waiter.waitForNavigation(options);
    }
    waitForURL(url, options) {
        return this.waiter.waitForURL(url, options);
    }
    // --- Playwright-style locators ---
    locator(selector, options) {
        return new Locator(this, [{ kind: "css", selector }], options);
    }
    getByRole(role, options = {}) {
        return new Locator(this, [{ kind: "role", role, name: options.name, exact: options.exact }]);
    }
    getByText(text, options = {}) {
        return new Locator(this, [{ kind: "text", text, exact: options.exact }]);
    }
    getByLabel(text, options = {}) {
        return new Locator(this, [{ kind: "label", text, exact: options.exact }]);
    }
    getByPlaceholder(text, options = {}) {
        return new Locator(this, [{ kind: "placeholder", text, exact: options.exact }]);
    }
    getByAltText(text, options = {}) {
        return new Locator(this, [{ kind: "alt", text, exact: options.exact }]);
    }
    getByTitle(text, options = {}) {
        return new Locator(this, [{ kind: "title", text, exact: options.exact }]);
    }
    getByTestId(testId) {
        return new Locator(this, [{ kind: "testId", testId }]);
    }
    // --- Element actions (selector sugar over Locator) ---
    async click(selector, options = {}) {
        const nav = options.waitForNavigation
            ? this.waitForNavigation(typeof options.waitForNavigation === "object" ? options.waitForNavigation : {})
            : undefined;
        nav?.catch(() => undefined);
        await this.locator(selector).click(options);
        if (nav)
            await nav;
    }
    async fill(selector, text, options = {}) {
        return this.locator(selector).fill(text, options);
    }
    async hover(selector, options = {}) {
        return this.locator(selector).hover(options);
    }
    async check(selector, options = {}) {
        return this.locator(selector).check(options);
    }
    async uncheck(selector, options = {}) {
        return this.locator(selector).uncheck(options);
    }
    async selectOption(selector, values, options = {}) {
        return this.locator(selector).selectOption(values, options);
    }
    // --- Page metadata & navigation ---
    async title() {
        await this.init();
        return this.evaluate("document.title");
    }
    async url() {
        await this.init();
        return this.evaluate("location.href");
    }
    /** Last main-frame URL observed by the driver, without a protocol round-trip. */
    currentUrl() {
        return this.currentPageUrl;
    }
    async reload(options = {}) {
        await this.init();
        this.network.reset();
        const waitPromise = this.waiter.waitForNavigation(options);
        waitPromise.catch(() => undefined);
        await this.session.send("Page.reload", { ignoreCache: false }, options.timeout, options.signal);
        await waitPromise;
        return { response: null, url: this.currentPageUrl, frameId: this.mainFrameId };
    }
    async goBack(options = {}) {
        return this.historyStep(-1, options);
    }
    async goForward(options = {}) {
        return this.historyStep(1, options);
    }
    async screenshot(options = {}) {
        await this.init();
        const format = options.type === "jpeg" ? "jpeg" : "png";
        const result = await this.session.send("Page.captureScreenshot", {
            format,
            quality: options.quality,
            fromSurface: true,
            captureBeyondViewport: options.fullPage ?? false,
        }, options.timeout);
        return Buffer.from(result.data, "base64");
    }
    async pdf(options = {}) {
        await this.init();
        const result = await this.session.send("Page.printToPDF", {}, options.timeout);
        return Buffer.from(result.data, "base64");
    }
    async addInitScript(source) {
        await this.init();
        const script = typeof source === "function" ? `(${source.toString()})();` : source;
        await this.session.send("Page.addScriptToEvaluateOnNewDocument", { source: script });
    }
    async setViewportSize(size) {
        await this.init();
        await this.session.send("Emulation.setDeviceMetricsOverride", {
            width: size.width,
            height: size.height,
            deviceScaleFactor: 1,
            mobile: false,
        });
    }
    async scrollBy(x, y, options = {}) {
        await this.evaluate(`window.scrollBy({ left: ${x}, top: ${y}, behavior: ${JSON.stringify(options.behavior ?? "auto")} })`, { timeout: options.timeout });
    }
    async scrollTo(x, y, options = {}) {
        await this.evaluate(`window.scrollTo({ left: ${x}, top: ${y}, behavior: ${JSON.stringify(options.behavior ?? "auto")} })`, { timeout: options.timeout });
    }
    async setContent(html, options = {}) {
        await this.init();
        if (!this.mainFrameId) {
            throw new ProtocolError("setContent requires a main frame", { method: "Page.setDocumentContent" });
        }
        await this.session.send("Page.setDocumentContent", { frameId: this.mainFrameId, html }, options.timeout);
    }
    async waitForLoadState(state = "load", options = {}) {
        if (state === "networkidle" || state === "done") {
            await this.network.waitForIdle({ timeout: options.timeout });
            if (state === "done") {
                await this.waitForFunction('document.readyState === "complete"', { timeout: options.timeout });
                await delay(32);
            }
            return;
        }
        if (state === "domstable") {
            const timeout = options.timeout ?? 30_000;
            await this.waitForFunction('document.readyState === "complete"', { timeout });
            await this.waiter.waitForDomStable(500, timeout);
            return;
        }
        await this.waitForFunction(state === "load"
            ? 'document.readyState === "complete"'
            : 'document.readyState === "interactive" || document.readyState === "complete"', { timeout: options.timeout });
    }
    async waitForTimeout(timeout) {
        await delay(timeout);
    }
    async waitForDownload(options = {}) {
        await this.init();
        return waitForDownload(this.session, options);
    }
    async bringToFront(options = {}) {
        await this.session.send("Page.bringToFront", {}, options.timeout);
    }
    async frames(options = {}) {
        await this.init();
        const result = await this.session.send("Page.getFrameTree", {}, options.timeout);
        return flattenFrameTree(result.frameTree).map((info) => new Frame(this.session, info));
    }
    async mainFrame(options = {}) {
        const frames = await this.frames(options);
        const frame = frames.find((candidate) => !candidate.info.parentId);
        if (!frame)
            throw new ProtocolError("main frame not found", { method: "Page.getFrameTree" });
        return frame;
    }
    async frame(selector, options = {}) {
        const frames = await this.frames(options);
        return frames.find((candidate) => {
            if (selector.name != null && candidate.name !== selector.name)
                return false;
            if (selector.url != null) {
                if (typeof selector.url === "string" && candidate.url !== selector.url)
                    return false;
                if (selector.url instanceof RegExp) {
                    selector.url.lastIndex = 0;
                    const matched = selector.url.test(candidate.url);
                    selector.url.lastIndex = 0;
                    if (!matched)
                        return false;
                }
            }
            return true;
        }) ?? null;
    }
    frameLocator(selector) {
        return new PageFrameLocator(this, selector);
    }
    async waitForPopup(options = {}) {
        await this.init();
        const openerId = this.session.targetId;
        const event = await this.session.client.waitFor("Target.targetCreated", {
            timeout: options.timeout,
            signal: options.signal,
            predicate: ({ targetInfo }) => targetInfo.type === "page" && (!openerId || targetInfo.openerId === openerId),
        });
        const session = await this.session.client.attachToTarget(event.targetInfo.targetId);
        const popup = new Page(session);
        await popup.init();
        return popup;
    }
    async emulateMedia(options = {}) {
        const features = [];
        if (options.colorScheme)
            features.push({ name: "prefers-color-scheme", value: options.colorScheme });
        if (options.reducedMotion)
            features.push({ name: "prefers-reduced-motion", value: options.reducedMotion });
        await this.session.send("Emulation.setEmulatedMedia", {
            media: options.media ?? "",
            features,
        });
    }
    /** Intercept network requests (Playwright-style `page.route`). */
    async route(pattern, handler) {
        await this.init();
        await this.routes.route(pattern, handler);
    }
    async unroute(pattern, handler) {
        await this.routes.unroute(pattern, handler);
    }
    async type(selector, text, options = {}) {
        await this.init();
        const timeout = options.timeout;
        if (options.clear)
            await this.fill(selector, "", { timeout });
        await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("type target not found: " + ${JSON.stringify(selector)});
      if (typeof el.focus === "function") el.focus();
      return true;
    })()`, { timeout });
        await this.keyboard.type(text, { timeout });
    }
    async press(key, options = {}) {
        await this.init();
        const timeout = options.timeout ?? 30_000;
        const spec = keySpec(key);
        await this.session.send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: spec.key,
            code: spec.code,
            windowsVirtualKeyCode: spec.vk,
            nativeVirtualKeyCode: spec.vk,
        }, timeout);
        await this.session.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: spec.key,
            code: spec.code,
            windowsVirtualKeyCode: spec.vk,
            nativeVirtualKeyCode: spec.vk,
        }, timeout);
    }
    // --- Koko-specific (LP domain + agent workflows) ---
    markdown(options) {
        return this.agent.markdown(options);
    }
    semanticTree(options) {
        return this.agent.semanticTree(options);
    }
    getInteractiveElements(options) {
        return this.agent.getInteractiveElements(options);
    }
    getStructuredData(options) {
        return this.agent.getStructuredData(options);
    }
    detectForms(options) {
        return this.agent.detectForms(options);
    }
    forms(options) {
        return this.agent.forms(options);
    }
    findElement(options) {
        return this.agent.findElement(options);
    }
    getNodeDetails(backendNodeId, options) {
        return this.agent.getNodeDetails(backendNodeId, options);
    }
    links(options) {
        return this.agent.links(options);
    }
    node(backendNodeId) {
        return new NodeHandle(this, backendNodeId);
    }
    async waitForSelectorHandle(selector, options) {
        const id = await this.agent.waitForSelectorNode(selector, options);
        return new NodeHandle(this, id);
    }
    armDialog(options) {
        return this.agent.armDialog(options);
    }
    /** Google SERP agent workflow: navigate + TTFX probe + top-N organic extract + block detection. */
    searchGoogle(options) {
        return searchGoogle(this, options);
    }
    async search(searchPageUrl, query, options = {}) {
        await this.init();
        const timeout = options.timeout ?? 30_000;
        const inputSelector = options.inputSelector ?? 'textarea[name="q"], input[name="q"]';
        const waitUntil = options.waitUntil ?? "domcontentloaded";
        await this.goto(searchPageUrl, { waitUntil: "load", timeout });
        if (options.settleMs)
            await delay(options.settleMs);
        const nav = this.waiter.waitForNavigation({ waitUntil, timeout, networkIdleMs: options.networkIdleMs });
        nav.catch(() => undefined);
        await this.type(inputSelector, query, { timeout });
        await this.press("Enter", { timeout });
        await nav;
    }
    async close() {
        if (this.closePromise)
            return this.closePromise;
        this.closePromise = this.closeImpl();
        return this.closePromise;
    }
    get frameId() {
        return this.mainFrameId;
    }
    get generation() {
        return this.documentGeneration;
    }
    async historyStep(delta, options = {}) {
        await this.init();
        this.network.reset();
        const waitPromise = this.waiter.waitForNavigation(options);
        waitPromise.catch(() => undefined);
        await this.evaluate(delta === -1 ? "history.back()" : "history.forward()");
        await waitPromise;
        return { response: null, url: this.currentPageUrl, frameId: this.mainFrameId };
    }
    async closeImpl() {
        this.routes.dispose();
        this.network.dispose();
        if (this.session.targetId)
            await this.session.client.closeTarget(this.session.targetId).catch(() => undefined);
        await this.session.detach().catch(() => undefined);
        const hooks = [...this.closeHooks];
        this.closeHooks.clear();
        for (const hook of hooks)
            hook();
    }
}
function keySpec(key) {
    switch (key) {
        case "Enter": return { key: "Enter", code: "Enter", vk: 13 };
        case "Tab": return { key: "Tab", code: "Tab", vk: 9 };
        case "Escape": return { key: "Escape", code: "Escape", vk: 27 };
        case "Backspace": return { key: "Backspace", code: "Backspace", vk: 8 };
        default:
            if (key.length === 1) {
                const upper = key.toUpperCase();
                return { key, code: `Key${upper}`, vk: upper.charCodeAt(0) };
            }
            return { key, code: key, vk: 0 };
    }
}
//# sourceMappingURL=page.js.map