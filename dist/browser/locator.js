import { locatorCheck, locatorClick, locatorFill, locatorHover, locatorSelectOption, } from "./actions.js";
import { buildAllExpression, buildCountExpression, buildResolveExpression, } from "./locator-query.js";
export class Locator {
    page;
    queries;
    options;
    constructor(page, queries, options = {}) {
        this.page = page;
        this.queries = queries;
        this.options = options;
    }
    locator(selector) {
        return new Locator(this.page, [...this.queries, { kind: "css", selector }], this.options);
    }
    getByRole(role, options = {}) {
        return new Locator(this.page, [...this.queries, { kind: "role", role, name: options.name, exact: options.exact }], this.options);
    }
    getByText(text, options = {}) {
        return new Locator(this.page, [...this.queries, { kind: "text", text, exact: options.exact }], this.options);
    }
    getByLabel(text, options = {}) {
        return new Locator(this.page, [...this.queries, { kind: "label", text, exact: options.exact }], this.options);
    }
    getByPlaceholder(text, options = {}) {
        return new Locator(this.page, [...this.queries, { kind: "placeholder", text, exact: options.exact }], this.options);
    }
    getByAltText(text, options = {}) {
        return new Locator(this.page, [...this.queries, { kind: "alt", text, exact: options.exact }], this.options);
    }
    getByTitle(text, options = {}) {
        return new Locator(this.page, [...this.queries, { kind: "title", text, exact: options.exact }], this.options);
    }
    getByTestId(testId) {
        return new Locator(this.page, [...this.queries, { kind: "testId", testId }], this.options);
    }
    filter(options) {
        if (options.has && options.has.page !== this.page) {
            throw new Error("locator.filter({ has }) requires a locator from the same page");
        }
        return new Locator(this.page, [
            ...this.queries,
            {
                kind: "filter",
                hasText: options.hasText,
                has: options.has?.queries,
            },
        ], this.options);
    }
    and(locator) {
        if (locator.page !== this.page)
            throw new Error("locator.and() requires the same page");
        return new Locator(this.page, [...this.queries, ...locator.queries], this.options);
    }
    or(locator) {
        if (locator.page !== this.page)
            throw new Error("locator.or() requires the same page");
        return new Locator(this.page, [{
                kind: "union",
                branches: [this.queries, locator.queries],
            }], this.options);
    }
    first() {
        return this.nth(0);
    }
    last() {
        return this.nth(-1);
    }
    nth(index) {
        const clone = new Locator(this.page, this.queries, this.options);
        clone._index = index;
        return clone;
    }
    _index;
    resolveOptions() {
        return {
            index: this._index,
            strict: this.options.strict ?? this.options.has ?? this._index == null,
        };
    }
    async click(options = {}) {
        await this.page.init();
        await locatorClick(this.page, this.queries, options, this.resolveOptions());
    }
    async hover(options = {}) {
        await this.page.init();
        await locatorHover(this.page, this.queries, options, this.resolveOptions());
    }
    async dblclick(options = {}) {
        const box = await this.boundingBox(options);
        if (!box)
            throw new Error("dblclick target is not visible");
        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 2, timeout: options.timeout });
    }
    async tap(options = {}) {
        const box = await this.boundingBox(options);
        if (!box)
            throw new Error("tap target is not visible");
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await this.page.session.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [point],
        }, options.timeout);
        await this.page.session.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
        }, options.timeout);
    }
    async dragTo(target, options = {}) {
        if (target.page !== this.page)
            throw new Error("dragTo() requires a locator from the same page");
        const [sourceBox, targetBox] = await Promise.all([
            this.boundingBox(options),
            target.boundingBox(options),
        ]);
        if (!sourceBox || !targetBox)
            throw new Error("dragTo source or target is not visible");
        await this.page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2, { timeout: options.timeout });
        await this.page.mouse.down({ timeout: options.timeout });
        await this.page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10, timeout: options.timeout });
        await this.page.mouse.up({ timeout: options.timeout });
    }
    async screenshot(options = {}) {
        const box = await this.boundingBox(options);
        if (!box)
            throw new Error("screenshot target is not visible");
        const result = await this.page.session.send("Page.captureScreenshot", {
            format: "png",
            fromSurface: true,
            clip: { ...box, scale: 1 },
        }, options.timeout);
        return Buffer.from(result.data, "base64");
    }
    async focus(options = {}) {
        await this.evaluate("(el) => el.focus()", options);
    }
    async blur(options = {}) {
        await this.evaluate("(el) => el.blur()", options);
    }
    async clear(options = {}) {
        await this.fill("", options);
    }
    async scrollIntoViewIfNeeded(options = {}) {
        await this.evaluate(`(el) => {
      const rect = el.getBoundingClientRect();
      const visible = rect.top >= 0 && rect.left >= 0
        && rect.bottom <= innerHeight && rect.right <= innerWidth;
      if (!visible) el.scrollIntoView({ block: "center", inline: "center" });
    }`, options);
    }
    async selectText(options = {}) {
        await this.evaluate(`(el) => {
      if (typeof el.select === "function") return el.select();
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }`, options);
    }
    async dispatchEvent(type, eventInit = {}, options = {}) {
        await this.evaluate(`(el) => {
      el.dispatchEvent(new Event(${JSON.stringify(type)}, {
        bubbles: true,
        cancelable: true,
        ...${JSON.stringify(eventInit)}
      }));
    }`, options);
    }
    async boundingBox(options = {}) {
        return this.evaluate(`(el) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) return null;
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }`, options);
    }
    async evaluate(pageFunction, options = {}) {
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
        return this.page.evaluate(`(() => {
      const el = ${resolve};
      return (${source})(el);
    })()`, { timeout: options.timeout });
    }
    async evaluateAll(pageFunction, options = {}) {
        const all = buildAllExpression(this.queries);
        const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
        return this.page.evaluate(`(() => (${source})(${all}))()`, { timeout: options.timeout });
    }
    async allTextContents(options = {}) {
        return this.evaluateAll("(elements) => elements.map((el) => el.textContent ?? '')", options);
    }
    async setInputFiles(files, options = {}) {
        await this.page.init();
        const expression = buildResolveExpression(this.queries, this.resolveOptions());
        const result = await this.page.session.send("Runtime.evaluate", { expression, returnByValue: false, awaitPromise: true }, options.timeout);
        const objectId = result.result?.objectId;
        if (result.exceptionDetails || !objectId) {
            throw new Error("setInputFiles could not resolve the file input");
        }
        try {
            const described = await this.page.session.send("DOM.describeNode", { objectId }, options.timeout);
            const backendNodeId = described.node?.backendNodeId;
            if (!backendNodeId)
                throw new Error("setInputFiles target has no backend node");
            await this.page.session.send("DOM.setFileInputFiles", {
                files: Array.isArray(files) ? files : [files],
                backendNodeId,
            }, options.timeout);
        }
        finally {
            await this.page.session.send("Runtime.releaseObject", { objectId }, options.timeout)
                .catch(() => undefined);
        }
    }
    async fill(text, options = {}) {
        await this.page.init();
        await locatorFill(this.page, this.queries, text, options, this.resolveOptions());
    }
    /** Alias for fill(). */
    async type(text, options = {}) {
        await this.page.init();
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        if (options.clear) {
            await this.fill("", options);
        }
        await this.page.evaluate(`(() => {
      const el = ${resolve};
      if (typeof el.focus === "function") el.focus();
      return true;
    })()`, { timeout: options.timeout });
        await this.page.keyboard.type(text, { timeout: options.timeout });
    }
    async press(key, options = {}) {
        await this.page.init();
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        await this.page.evaluate(`(() => {
      const el = ${resolve};
      if ('focus' in el && typeof el.focus === 'function') el.focus();
      return true;
    })()`, { timeout: options.timeout });
        const nav = options.waitForNavigation
            ? this.page.waitForNavigation(typeof options.waitForNavigation === "object" ? options.waitForNavigation : {})
            : undefined;
        nav?.catch(() => undefined);
        await this.page.press(key, { timeout: options.timeout });
        if (nav)
            await nav;
    }
    async check(options = {}) {
        await locatorCheck(this.page, this.queries, true, options, this.resolveOptions());
    }
    async uncheck(options = {}) {
        await locatorCheck(this.page, this.queries, false, options, this.resolveOptions());
    }
    async selectOption(values, options = {}) {
        await this.page.init();
        return locatorSelectOption(this.page, this.queries, values, options, this.resolveOptions());
    }
    async textContent(options = {}) {
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        return this.page.evaluate(`(() => {
      const el = ${resolve};
      return el.textContent?.trim() ?? null;
    })()`, { timeout: options.timeout });
    }
    async innerText(options = {}) {
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        return this.page.evaluate(`(() => {
      const el = ${resolve};
      return (el.innerText ?? el.textContent ?? '').trim();
    })()`, { timeout: options.timeout });
    }
    async innerHTML(options = {}) {
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        return this.page.evaluate(`(() => {
      const el = ${resolve};
      return el.innerHTML ?? '';
    })()`, { timeout: options.timeout });
    }
    async inputValue(options = {}) {
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        return this.page.evaluate(`(() => {
      const el = ${resolve};
      if (!('value' in el)) throw new Error('locator does not resolve to an input element');
      return String(el.value ?? '');
    })()`, { timeout: options.timeout });
    }
    async getAttribute(name, options = {}) {
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        const attr = JSON.stringify(name);
        return this.page.evaluate(`(() => {
      const el = ${resolve};
      return el.getAttribute(${attr});
    })()`, { timeout: options.timeout });
    }
    async isVisible(options = {}) {
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        return this.page.evaluate(`(() => {
      const el = ${resolve};
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    })()`, { timeout: options.timeout }).catch(() => false);
    }
    async isHidden(options = {}) {
        return !(await this.isVisible(options));
    }
    async isEnabled(options = {}) {
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        return this.page.evaluate(`(() => {
      const el = ${resolve};
      return !el.hasAttribute('disabled') && !el.closest('[disabled]');
    })()`, { timeout: options.timeout }).catch(() => false);
    }
    async isChecked(options = {}) {
        const resolve = buildResolveExpression(this.queries, this.resolveOptions());
        return this.page.evaluate(`(() => {
      const el = ${resolve};
      return 'checked' in el ? !!el.checked : false;
    })()`, { timeout: options.timeout }).catch(() => false);
    }
    async count() {
        await this.page.init();
        return this.page.evaluate(buildCountExpression(this.queries));
    }
    async all() {
        const count = await this.count();
        return Array.from({ length: count }, (_, index) => this.nth(index));
    }
    async waitFor(options = {}) {
        const state = options.state ?? "visible";
        const timeout = options.timeout ?? 30_000;
        if (state === "hidden") {
            await this.page.waitForFunction(`!(() => { try { return (${buildCountExpression(this.queries)}) > 0; } catch { return false; } })()`, { timeout });
            return;
        }
        const expr = state === "attached"
            ? `(() => { try { return (${buildCountExpression(this.queries)}) > 0; } catch { return false; } })()`
            : `(() => {
          try {
            const el = ${buildResolveExpression(this.queries, this.resolveOptions())};
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
          } catch { return false; }
        })()`;
        await this.page.waitForFunction(expr, { timeout });
    }
}
//# sourceMappingURL=locator.js.map