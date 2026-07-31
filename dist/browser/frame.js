import { ProtocolError } from "../cdp/errors.js";
export class Frame {
    session;
    info;
    constructor(session, info) {
        this.session = session;
        this.info = info;
    }
    get id() {
        return this.info.id;
    }
    get name() {
        return this.info.name ?? "";
    }
    get url() {
        return this.info.url;
    }
    async evaluate(expressionOrFunction, options = {}) {
        const world = await this.session.send("Page.createIsolatedWorld", { frameId: this.id, worldName: "velora-sdk", grantUniveralAccess: false }, options.timeout);
        const expression = typeof expressionOrFunction === "function"
            ? `(${expressionOrFunction.toString()})()`
            : expressionOrFunction;
        const result = await this.session.send("Runtime.evaluate", {
            expression,
            contextId: world.executionContextId,
            returnByValue: true,
            awaitPromise: true,
        }, options.timeout);
        if (result.exceptionDetails) {
            throw new ProtocolError(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Frame.evaluate failed", { method: "Runtime.evaluate", payload: result.exceptionDetails });
        }
        return result.result?.value;
    }
    locator(selector) {
        return new FrameLocator(this, selector);
    }
    content(options = {}) {
        return this.evaluate("document.documentElement ? document.documentElement.outerHTML : ''", options);
    }
}
export class FrameLocator {
    frame;
    selector;
    constructor(frame, selector) {
        this.frame = frame;
        this.selector = selector;
    }
    locator(selector) {
        return new FrameLocator(this.frame, `${this.selector} ${selector}`);
    }
    async click(options = {}) {
        await this.run(`(el) => {
      el.scrollIntoView({ block: "center", inline: "center" });
      if (typeof el.click === "function") el.click();
      else el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }`, options);
    }
    async fill(value, options = {}) {
        await this.run(`(el) => {
      if (!("value" in el) && !el.isContentEditable) throw new Error("frame locator is not fillable");
      if ("value" in el) el.value = ${JSON.stringify(value)};
      else el.textContent = ${JSON.stringify(value)};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }`, options);
    }
    textContent(options = {}) {
        return this.frame.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(this.selector)});
      if (!el) throw new Error("frame locator resolved to 0 elements");
      return el.textContent;
    })()`, options);
    }
    run(body, options) {
        return this.frame.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(this.selector)});
      if (!el) throw new Error("frame locator resolved to 0 elements");
      return (${body})(el);
    })()`, options);
    }
}
/** Playwright-style lazy iframe selector. The owner is re-resolved for every action. */
export class PageFrameLocator {
    page;
    ownerSelector;
    constructor(page, ownerSelector) {
        this.page = page;
        this.ownerSelector = ownerSelector;
    }
    locator(selector) {
        return new DeferredFrameLocator(this, selector);
    }
    async resolve(options = {}) {
        await this.page.init();
        const result = await this.page.session.send("Runtime.evaluate", {
            expression: `document.querySelector(${JSON.stringify(this.ownerSelector)})`,
            returnByValue: false,
        }, options.timeout);
        const objectId = result.result?.objectId;
        if (!objectId)
            throw new ProtocolError("frameLocator resolved to 0 iframe elements");
        try {
            const described = await this.page.session.send("DOM.describeNode", { objectId, depth: 1 }, options.timeout);
            const frameId = described.node?.frameId ?? described.node?.contentDocument?.frameId;
            if (!frameId)
                throw new ProtocolError("frameLocator target is not a frame owner");
            const frames = await this.page.frames(options);
            const frame = frames.find((candidate) => candidate.id === frameId);
            if (!frame)
                throw new ProtocolError(`frameLocator frame not found: ${frameId}`);
            return frame;
        }
        finally {
            await this.page.session.send("Runtime.releaseObject", { objectId }, options.timeout)
                .catch(() => undefined);
        }
    }
}
export class DeferredFrameLocator {
    owner;
    selector;
    constructor(owner, selector) {
        this.owner = owner;
        this.selector = selector;
    }
    locator(selector) {
        return new DeferredFrameLocator(this.owner, `${this.selector} ${selector}`);
    }
    async click(options = {}) {
        await (await this.owner.resolve(options)).locator(this.selector).click(options);
    }
    async fill(value, options = {}) {
        await (await this.owner.resolve(options)).locator(this.selector).fill(value, options);
    }
    async textContent(options = {}) {
        return (await this.owner.resolve(options)).locator(this.selector).textContent(options);
    }
}
export function flattenFrameTree(tree) {
    if (!tree?.frame)
        return [];
    return [
        {
            id: tree.frame.id,
            parentId: tree.frame.parentId,
            name: tree.frame.name,
            url: tree.frame.url ?? "about:blank",
        },
        ...(tree.childFrames ?? []).flatMap(flattenFrameTree),
    ];
}
//# sourceMappingURL=frame.js.map