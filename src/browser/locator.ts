import type { Page } from "./page.js";
import type { GotoWaitOptions } from "./waiter.js";
import {
  locatorCheck,
  locatorClick,
  locatorFill,
  locatorHover,
  locatorSelectOption,
  type ActionOptions,
  type FillOptions,
  type SelectOptions,
} from "./actions.js";
import {
  buildAllExpression,
  buildCountExpression,
  buildResolveExpression,
  type LocatorQuery,
} from "./locator-query.js";

export interface LocatorOptions {
  /** When true, fail if locator resolves to more than one element. */
  strict?: boolean;
  /** @deprecated Use `strict`; `has` never represented a nested locator. */
  has?: boolean;
}

export interface LocatorFilterOptions {
  hasText?: string | RegExp;
  has?: Locator;
}

export interface GetByRoleOptions {
  name?: string | RegExp;
  exact?: boolean;
}

export interface GetByTextOptions {
  exact?: boolean;
}

export interface LocatorPressOptions extends ActionOptions {
  /** Wait for navigation after key press (e.g. Enter on a form). */
  waitForNavigation?: boolean | GotoWaitOptions;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Locator {
  constructor(
    readonly page: Page,
    readonly queries: LocatorQuery[],
    readonly options: LocatorOptions = {},
  ) {}

  locator(selector: string): Locator {
    return new Locator(this.page, [...this.queries, { kind: "css", selector }], this.options);
  }

  getByRole(role: string, options: GetByRoleOptions = {}): Locator {
    return new Locator(this.page, [...this.queries, { kind: "role", role, name: options.name, exact: options.exact }], this.options);
  }

  getByText(text: string | RegExp, options: GetByTextOptions = {}): Locator {
    return new Locator(this.page, [...this.queries, { kind: "text", text, exact: options.exact }], this.options);
  }

  getByLabel(text: string | RegExp, options: GetByTextOptions = {}): Locator {
    return new Locator(this.page, [...this.queries, { kind: "label", text, exact: options.exact }], this.options);
  }

  getByPlaceholder(text: string | RegExp, options: GetByTextOptions = {}): Locator {
    return new Locator(this.page, [...this.queries, { kind: "placeholder", text, exact: options.exact }], this.options);
  }

  getByAltText(text: string | RegExp, options: GetByTextOptions = {}): Locator {
    return new Locator(this.page, [...this.queries, { kind: "alt", text, exact: options.exact }], this.options);
  }

  getByTitle(text: string | RegExp, options: GetByTextOptions = {}): Locator {
    return new Locator(this.page, [...this.queries, { kind: "title", text, exact: options.exact }], this.options);
  }

  getByTestId(testId: string | RegExp): Locator {
    return new Locator(this.page, [...this.queries, { kind: "testId", testId }], this.options);
  }

  filter(options: LocatorFilterOptions): Locator {
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

  and(locator: Locator): Locator {
    if (locator.page !== this.page) throw new Error("locator.and() requires the same page");
    return new Locator(this.page, [...this.queries, ...locator.queries], this.options);
  }

  or(locator: Locator): Locator {
    if (locator.page !== this.page) throw new Error("locator.or() requires the same page");
    return new Locator(this.page, [{
      kind: "union",
      branches: [this.queries, locator.queries],
    }], this.options);
  }

  first(): Locator {
    return this.nth(0);
  }

  last(): Locator {
    return this.nth(-1);
  }

  nth(index: number): Locator {
    const clone = new Locator(this.page, this.queries, this.options);
    clone._index = index;
    return clone;
  }

  private _index?: number;

  private resolveOptions(): { index?: number; strict?: boolean } {
    return {
      index: this._index,
      strict: this.options.strict ?? this.options.has ?? this._index == null,
    };
  }

  async click(options: ActionOptions = {}): Promise<void> {
    await this.page.init();
    await locatorClick(this.page, this.queries, options, this.resolveOptions());
  }

  async hover(options: ActionOptions = {}): Promise<void> {
    await this.page.init();
    await locatorHover(this.page, this.queries, options, this.resolveOptions());
  }

  async dblclick(options: ActionOptions = {}): Promise<void> {
    const box = await this.boundingBox(options);
    if (!box) throw new Error("dblclick target is not visible");
    await this.page.mouse.click(
      box.x + box.width / 2,
      box.y + box.height / 2,
      { clickCount: 2, timeout: options.timeout },
    );
  }

  async tap(options: ActionOptions = {}): Promise<void> {
    const box = await this.boundingBox(options);
    if (!box) throw new Error("tap target is not visible");
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

  async dragTo(target: Locator, options: ActionOptions = {}): Promise<void> {
    if (target.page !== this.page) throw new Error("dragTo() requires a locator from the same page");
    const [sourceBox, targetBox] = await Promise.all([
      this.boundingBox(options),
      target.boundingBox(options),
    ]);
    if (!sourceBox || !targetBox) throw new Error("dragTo source or target is not visible");
    await this.page.mouse.move(
      sourceBox.x + sourceBox.width / 2,
      sourceBox.y + sourceBox.height / 2,
      { timeout: options.timeout },
    );
    await this.page.mouse.down({ timeout: options.timeout });
    await this.page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      { steps: 10, timeout: options.timeout },
    );
    await this.page.mouse.up({ timeout: options.timeout });
  }

  async screenshot(options: ActionOptions = {}): Promise<Buffer> {
    const box = await this.boundingBox(options);
    if (!box) throw new Error("screenshot target is not visible");
    const result = await this.page.session.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      clip: { ...box, scale: 1 },
    }, options.timeout);
    return Buffer.from(result.data, "base64");
  }

  async focus(options: ActionOptions = {}): Promise<void> {
    await this.evaluate("(el) => el.focus()", options);
  }

  async blur(options: ActionOptions = {}): Promise<void> {
    await this.evaluate("(el) => el.blur()", options);
  }

  async clear(options: ActionOptions = {}): Promise<void> {
    await this.fill("", options);
  }

  async scrollIntoViewIfNeeded(options: ActionOptions = {}): Promise<void> {
    await this.evaluate(`(el) => {
      const rect = el.getBoundingClientRect();
      const visible = rect.top >= 0 && rect.left >= 0
        && rect.bottom <= innerHeight && rect.right <= innerWidth;
      if (!visible) el.scrollIntoView({ block: "center", inline: "center" });
    }`, options);
  }

  async selectText(options: ActionOptions = {}): Promise<void> {
    await this.evaluate(`(el) => {
      if (typeof el.select === "function") return el.select();
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }`, options);
  }

  async dispatchEvent(
    type: string,
    eventInit: Record<string, unknown> = {},
    options: ActionOptions = {},
  ): Promise<void> {
    await this.evaluate(`(el) => {
      el.dispatchEvent(new Event(${JSON.stringify(type)}, {
        bubbles: true,
        cancelable: true,
        ...${JSON.stringify(eventInit)}
      }));
    }`, options);
  }

  async boundingBox(options: ActionOptions = {}): Promise<BoundingBox | null> {
    return this.evaluate<BoundingBox | null>(`(el) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) return null;
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }`, options);
  }

  async evaluate<T = unknown>(
    pageFunction: string | ((element: Element) => T),
    options: ActionOptions = {},
  ): Promise<T> {
    const resolve = buildResolveExpression(this.queries, this.resolveOptions());
    const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
    return this.page.evaluate<T>(`(() => {
      const el = ${resolve};
      return (${source})(el);
    })()`, { timeout: options.timeout });
  }

  async evaluateAll<T = unknown>(
    pageFunction: string | ((elements: Element[]) => T),
    options: ActionOptions = {},
  ): Promise<T> {
    const all = buildAllExpression(this.queries);
    const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
    return this.page.evaluate<T>(`(() => (${source})(${all}))()`, { timeout: options.timeout });
  }

  async allTextContents(options: ActionOptions = {}): Promise<string[]> {
    return this.evaluateAll<string[]>("(elements) => elements.map((el) => el.textContent ?? '')", options);
  }

  async setInputFiles(files: string | string[], options: ActionOptions = {}): Promise<void> {
    await this.page.init();
    const expression = buildResolveExpression(this.queries, this.resolveOptions());
    const result = await this.page.session.send<{
      result?: { objectId?: string };
      exceptionDetails?: unknown;
    }>("Runtime.evaluate", { expression, returnByValue: false, awaitPromise: true }, options.timeout);
    const objectId = result.result?.objectId;
    if (result.exceptionDetails || !objectId) {
      throw new Error("setInputFiles could not resolve the file input");
    }
    try {
      const described = await this.page.session.send<{ node?: { backendNodeId?: number } }>(
        "DOM.describeNode",
        { objectId },
        options.timeout,
      );
      const backendNodeId = described.node?.backendNodeId;
      if (!backendNodeId) throw new Error("setInputFiles target has no backend node");
      await this.page.session.send("DOM.setFileInputFiles", {
        files: Array.isArray(files) ? files : [files],
        backendNodeId,
      }, options.timeout);
    } finally {
      await this.page.session.send("Runtime.releaseObject", { objectId }, options.timeout)
        .catch(() => undefined);
    }
  }

  async fill(text: string, options: FillOptions = {}): Promise<void> {
    await this.page.init();
    await locatorFill(this.page, this.queries, text, options, this.resolveOptions());
  }

  /** Alias for fill(). */
  async type(text: string, options: FillOptions = {}): Promise<void> {
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

  async press(key: string, options: LocatorPressOptions = {}): Promise<void> {
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
    if (nav) await nav;
  }

  async check(options: ActionOptions = {}): Promise<void> {
    await locatorCheck(this.page, this.queries, true, options, this.resolveOptions());
  }

  async uncheck(options: ActionOptions = {}): Promise<void> {
    await locatorCheck(this.page, this.queries, false, options, this.resolveOptions());
  }

  async selectOption(values: SelectOptions["values"], options: SelectOptions = {}): Promise<string[]> {
    await this.page.init();
    return locatorSelectOption(this.page, this.queries, values, options, this.resolveOptions());
  }

  async textContent(options: ActionOptions = {}): Promise<string | null> {
    const resolve = buildResolveExpression(this.queries, this.resolveOptions());
    return this.page.evaluate<string | null>(`(() => {
      const el = ${resolve};
      return el.textContent?.trim() ?? null;
    })()`, { timeout: options.timeout });
  }

  async innerText(options: ActionOptions = {}): Promise<string> {
    const resolve = buildResolveExpression(this.queries, this.resolveOptions());
    return this.page.evaluate<string>(`(() => {
      const el = ${resolve};
      return (el.innerText ?? el.textContent ?? '').trim();
    })()`, { timeout: options.timeout });
  }

  async innerHTML(options: ActionOptions = {}): Promise<string> {
    const resolve = buildResolveExpression(this.queries, this.resolveOptions());
    return this.page.evaluate<string>(`(() => {
      const el = ${resolve};
      return el.innerHTML ?? '';
    })()`, { timeout: options.timeout });
  }

  async inputValue(options: ActionOptions = {}): Promise<string> {
    const resolve = buildResolveExpression(this.queries, this.resolveOptions());
    return this.page.evaluate<string>(`(() => {
      const el = ${resolve};
      if (!('value' in el)) throw new Error('locator does not resolve to an input element');
      return String(el.value ?? '');
    })()`, { timeout: options.timeout });
  }

  async getAttribute(name: string, options: ActionOptions = {}): Promise<string | null> {
    const resolve = buildResolveExpression(this.queries, this.resolveOptions());
    const attr = JSON.stringify(name);
    return this.page.evaluate<string | null>(`(() => {
      const el = ${resolve};
      return el.getAttribute(${attr});
    })()`, { timeout: options.timeout });
  }

  async isVisible(options: ActionOptions = {}): Promise<boolean> {
    const resolve = buildResolveExpression(this.queries, this.resolveOptions());
    return this.page.evaluate<boolean>(`(() => {
      const el = ${resolve};
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    })()`, { timeout: options.timeout }).catch(() => false);
  }

  async isHidden(options: ActionOptions = {}): Promise<boolean> {
    return !(await this.isVisible(options));
  }

  async isEnabled(options: ActionOptions = {}): Promise<boolean> {
    const resolve = buildResolveExpression(this.queries, this.resolveOptions());
    return this.page.evaluate<boolean>(`(() => {
      const el = ${resolve};
      return !el.hasAttribute('disabled') && !el.closest('[disabled]');
    })()`, { timeout: options.timeout }).catch(() => false);
  }

  async isChecked(options: ActionOptions = {}): Promise<boolean> {
    const resolve = buildResolveExpression(this.queries, this.resolveOptions());
    return this.page.evaluate<boolean>(`(() => {
      const el = ${resolve};
      return 'checked' in el ? !!el.checked : false;
    })()`, { timeout: options.timeout }).catch(() => false);
  }

  async count(): Promise<number> {
    await this.page.init();
    return this.page.evaluate<number>(buildCountExpression(this.queries));
  }

  async all(): Promise<Locator[]> {
    const count = await this.count();
    return Array.from({ length: count }, (_, index) => this.nth(index));
  }

  async waitFor(options: { state?: "attached" | "visible" | "hidden"; timeout?: number } = {}): Promise<void> {
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
