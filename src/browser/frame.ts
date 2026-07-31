import type { CDPSession } from "../cdp/session.js";
import { ProtocolError } from "../cdp/errors.js";
import type { Page } from "./page.js";

export interface FrameInfo {
  id: string;
  parentId?: string;
  name?: string;
  url: string;
}

export class Frame {
  constructor(readonly session: CDPSession, readonly info: FrameInfo) {}

  get id(): string {
    return this.info.id;
  }

  get name(): string {
    return this.info.name ?? "";
  }

  get url(): string {
    return this.info.url;
  }

  async evaluate<T = unknown>(expressionOrFunction: string | Function, options: { timeout?: number } = {}): Promise<T> {
    const world = await this.session.send<{ executionContextId: number }>(
      "Page.createIsolatedWorld",
      { frameId: this.id, worldName: "velora-sdk", grantUniveralAccess: false },
      options.timeout,
    );
    const expression = typeof expressionOrFunction === "function"
      ? `(${expressionOrFunction.toString()})()`
      : expressionOrFunction;
    const result = await this.session.send<{
      result?: { value?: T };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>("Runtime.evaluate", {
      expression,
      contextId: world.executionContextId,
      returnByValue: true,
      awaitPromise: true,
    }, options.timeout);
    if (result.exceptionDetails) {
      throw new ProtocolError(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Frame.evaluate failed",
        { method: "Runtime.evaluate", payload: result.exceptionDetails },
      );
    }
    return result.result?.value as T;
  }

  locator(selector: string): FrameLocator {
    return new FrameLocator(this, selector);
  }

  content(options: { timeout?: number } = {}): Promise<string> {
    return this.evaluate<string>(
      "document.documentElement ? document.documentElement.outerHTML : ''",
      options,
    );
  }
}

export class FrameLocator {
  constructor(readonly frame: Frame, readonly selector: string) {}

  locator(selector: string): FrameLocator {
    return new FrameLocator(this.frame, `${this.selector} ${selector}`);
  }

  async click(options: { timeout?: number } = {}): Promise<void> {
    await this.run(`(el) => {
      el.scrollIntoView({ block: "center", inline: "center" });
      if (typeof el.click === "function") el.click();
      else el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }`, options);
  }

  async fill(value: string, options: { timeout?: number } = {}): Promise<void> {
    await this.run(`(el) => {
      if (!("value" in el) && !el.isContentEditable) throw new Error("frame locator is not fillable");
      if ("value" in el) el.value = ${JSON.stringify(value)};
      else el.textContent = ${JSON.stringify(value)};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }`, options);
  }

  textContent(options: { timeout?: number } = {}): Promise<string | null> {
    return this.frame.evaluate<string | null>(`(() => {
      const el = document.querySelector(${JSON.stringify(this.selector)});
      if (!el) throw new Error("frame locator resolved to 0 elements");
      return el.textContent;
    })()`, options);
  }

  private run(body: string, options: { timeout?: number }): Promise<void> {
    return this.frame.evaluate<void>(`(() => {
      const el = document.querySelector(${JSON.stringify(this.selector)});
      if (!el) throw new Error("frame locator resolved to 0 elements");
      return (${body})(el);
    })()`, options);
  }
}

/** Playwright-style lazy iframe selector. The owner is re-resolved for every action. */
export class PageFrameLocator {
  constructor(readonly page: Page, readonly ownerSelector: string) {}

  locator(selector: string): DeferredFrameLocator {
    return new DeferredFrameLocator(this, selector);
  }

  async resolve(options: { timeout?: number } = {}): Promise<Frame> {
    await this.page.init();
    const result = await this.page.session.send<{ result?: { objectId?: string } }>(
      "Runtime.evaluate",
      {
        expression: `document.querySelector(${JSON.stringify(this.ownerSelector)})`,
        returnByValue: false,
      },
      options.timeout,
    );
    const objectId = result.result?.objectId;
    if (!objectId) throw new ProtocolError("frameLocator resolved to 0 iframe elements");
    try {
      const described = await this.page.session.send<{
        node?: { frameId?: string; contentDocument?: { frameId?: string } };
      }>("DOM.describeNode", { objectId, depth: 1 }, options.timeout);
      const frameId = described.node?.frameId ?? described.node?.contentDocument?.frameId;
      if (!frameId) throw new ProtocolError("frameLocator target is not a frame owner");
      const frames = await this.page.frames(options);
      const frame = frames.find((candidate) => candidate.id === frameId);
      if (!frame) throw new ProtocolError(`frameLocator frame not found: ${frameId}`);
      return frame;
    } finally {
      await this.page.session.send("Runtime.releaseObject", { objectId }, options.timeout)
        .catch(() => undefined);
    }
  }
}

export class DeferredFrameLocator {
  constructor(readonly owner: PageFrameLocator, readonly selector: string) {}

  locator(selector: string): DeferredFrameLocator {
    return new DeferredFrameLocator(this.owner, `${this.selector} ${selector}`);
  }

  async click(options: { timeout?: number } = {}): Promise<void> {
    await (await this.owner.resolve(options)).locator(this.selector).click(options);
  }

  async fill(value: string, options: { timeout?: number } = {}): Promise<void> {
    await (await this.owner.resolve(options)).locator(this.selector).fill(value, options);
  }

  async textContent(options: { timeout?: number } = {}): Promise<string | null> {
    return (await this.owner.resolve(options)).locator(this.selector).textContent(options);
  }
}

export function flattenFrameTree(tree: any): FrameInfo[] {
  if (!tree?.frame) return [];
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
