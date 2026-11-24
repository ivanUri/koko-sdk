import { ProtocolError, TimeoutError } from "../cdp/errors.js";
import { delay, withTimeout } from "../utils/timeout.js";
export class PageWaiter {
    session;
    network;
    constructor(session, network) {
        this.session = session;
        this.network = network;
    }
    async waitForNavigation(options = {}) {
        const waitUntil = options.waitUntil ?? "done";
        if (waitUntil === "none" || waitUntil === "commit")
            return;
        const timeout = options.timeout ?? 30_000;
        if (waitUntil === "domcontentloaded") {
            await this.session.waitFor("Page.domContentEventFired", { timeout, signal: options.signal });
            return;
        }
        if (waitUntil === "load") {
            await this.session.waitFor("Page.loadEventFired", { timeout, signal: options.signal });
            return;
        }
        // Stable snapshots start after load so parser/resource pauses do not look
        // like a completed visual state. DOM stability intentionally ignores
        // background network activity.
        await this.session.waitFor("Page.loadEventFired", { timeout, signal: options.signal }).catch(() => undefined);
        if (waitUntil === "domstable") {
            await this.waitForDomStable(options.domStableMs ?? 500, timeout, options.signal);
            return;
        }
        // Koko and Chromium both expose the browser's lifecycle ledger through
        // Page.lifecycleEvent. Prefer that signal over reconstructing idleness
        // from Network.* events: it includes queued/intercepted host work and is
        // the same boundary used by the engine's Runner.
        if (options.networkIdleMs != null) {
            // An explicit quiet window is an SDK-level override. Keep the tracker
            // path for callers that intentionally request a non-Chromium interval.
            await this.network.waitForIdle({ idleMs: options.networkIdleMs, timeout, signal: options.signal });
        }
        else {
            await this.session.waitFor("Page.lifecycleEvent", {
                timeout,
                signal: options.signal,
                predicate: (event) => event.name === "networkIdle"
                    && (options.frameId == null || event.frameId == null || event.frameId === options.frameId)
                    && (options.loaderId == null || event.loaderId == null || event.loaderId === options.loaderId),
            });
        }
        if (waitUntil === "done") {
            await this.pollExpression("document.readyState === 'complete'", timeout, "Waiting for document complete");
            await delay(32);
        }
    }
    async waitForDomStable(stableMs = 500, timeout = 30_000, signal) {
        const expression = `(() => new Promise((resolve) => {
      const stableMs = ${JSON.stringify(stableMs)};
      const timeoutMs = ${JSON.stringify(timeout)};
      let quietTimer;
      let deadlineTimer;
      let observer;
      const finish = (stable) => {
        clearTimeout(quietTimer);
        clearTimeout(deadlineTimer);
        observer?.disconnect();
        resolve(stable);
      };
      const arm = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => finish(true), stableMs);
      };
      observer = new MutationObserver(arm);
      observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      deadlineTimer = setTimeout(() => finish(false), timeoutMs);
      arm();
    }))()`;
        const result = await this.session.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
        }, timeout + 250, signal);
        if (!result.result?.value) {
            throw new TimeoutError("Waiting for DOM stability", { timeout });
        }
    }
    async waitForSelector(selector, options = {}) {
        const timeout = options.timeout ?? 30_000;
        const label = `Waiting for selector ${selector}`;
        if (!options.visible) {
            await this.pollDomSearch(selector, timeout, label);
            return;
        }
        const expression = `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    })()`;
        await this.pollExpression(expression, timeout, label);
    }
    async waitForFunction(fn, options = {}) {
        const source = typeof fn === "function" ? `(${fn.toString()})()` : `(${fn})`;
        await this.pollExpression(source, options.timeout, "Waiting for function", options.pollingMs);
    }
    /** Poll until a return-by-value expression is truthy (adaptive interval). */
    async pollUntilTruthy(expression, options = {}) {
        await this.pollExpression(expression, options.timeout ?? 30_000, options.label ?? "Waiting for condition");
    }
    async waitForURL(url, options = {}) {
        const timeout = options.timeout ?? 30_000;
        const label = "Waiting for URL";
        const expression = `(() => ${buildUrlExpression(url)})()`;
        await this.pollExpression(expression, timeout, label);
    }
    async pollDomSearch(selector, timeout, label) {
        const started = Date.now();
        let interval = 16;
        await withTimeout((async () => {
            while (true) {
                const result = await this.session.send("DOM.performSearch", {
                    query: selector,
                    includeUserAgentShadowDOM: false,
                });
                const searchId = result?.searchId;
                const count = result?.resultCount ?? 0;
                if (searchId) {
                    await this.session.send("DOM.discardSearchResults", { searchId }).catch(() => undefined);
                }
                if (count > 0)
                    return;
                if (Date.now() - started > timeout)
                    throw new TimeoutError(label, { timeout });
                await delay(interval);
                interval = Math.min(Math.round(interval * 1.4), 100);
            }
        })(), { timeout, label });
    }
    async pollExpression(expression, timeout = 30_000, label, pollingMs) {
        const started = Date.now();
        let interval = pollingMs ?? 16;
        await withTimeout((async () => {
            while (true) {
                const result = await this.session.send("Runtime.evaluate", {
                    expression,
                    returnByValue: true,
                    awaitPromise: true,
                });
                if (result.exceptionDetails) {
                    const ex = result.exceptionDetails;
                    const desc = ex?.exception?.description ?? ex?.text ?? `${label} failed`;
                    throw new ProtocolError(desc, { payload: result.exceptionDetails });
                }
                if (result.result?.value)
                    return;
                if (Date.now() - started > timeout)
                    throw new TimeoutError(label, { timeout });
                await delay(interval);
                if (pollingMs == null)
                    interval = Math.min(Math.round(interval * 1.4), 100);
            }
        })(), { timeout, label });
    }
}
function buildUrlExpression(url) {
    if (typeof url === "function") {
        throw new ProtocolError("waitForURL: function matchers are not supported; use string or RegExp");
    }
    if (url instanceof RegExp) {
        return `new RegExp(${JSON.stringify(url.source)}, ${JSON.stringify(url.flags)}).test(location.href)`;
    }
    return `location.href === ${JSON.stringify(url)} || location.href.startsWith(${JSON.stringify(url)})`;
}
//# sourceMappingURL=waiter.js.map