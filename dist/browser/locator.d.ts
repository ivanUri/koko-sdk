import type { Page } from "./page.js";
import type { GotoWaitOptions } from "./waiter.js";
import { type ActionOptions, type FillOptions, type SelectOptions } from "./actions.js";
import { type LocatorQuery } from "./locator-query.js";
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
export declare class Locator {
    readonly page: Page;
    readonly queries: LocatorQuery[];
    readonly options: LocatorOptions;
    constructor(page: Page, queries: LocatorQuery[], options?: LocatorOptions);
    locator(selector: string): Locator;
    getByRole(role: string, options?: GetByRoleOptions): Locator;
    getByText(text: string | RegExp, options?: GetByTextOptions): Locator;
    getByLabel(text: string | RegExp, options?: GetByTextOptions): Locator;
    getByPlaceholder(text: string | RegExp, options?: GetByTextOptions): Locator;
    getByAltText(text: string | RegExp, options?: GetByTextOptions): Locator;
    getByTitle(text: string | RegExp, options?: GetByTextOptions): Locator;
    getByTestId(testId: string | RegExp): Locator;
    filter(options: LocatorFilterOptions): Locator;
    and(locator: Locator): Locator;
    or(locator: Locator): Locator;
    first(): Locator;
    last(): Locator;
    nth(index: number): Locator;
    private _index?;
    private resolveOptions;
    click(options?: ActionOptions): Promise<void>;
    hover(options?: ActionOptions): Promise<void>;
    dblclick(options?: ActionOptions): Promise<void>;
    tap(options?: ActionOptions): Promise<void>;
    dragTo(target: Locator, options?: ActionOptions): Promise<void>;
    screenshot(options?: ActionOptions): Promise<Buffer>;
    focus(options?: ActionOptions): Promise<void>;
    blur(options?: ActionOptions): Promise<void>;
    clear(options?: ActionOptions): Promise<void>;
    scrollIntoViewIfNeeded(options?: ActionOptions): Promise<void>;
    selectText(options?: ActionOptions): Promise<void>;
    dispatchEvent(type: string, eventInit?: Record<string, unknown>, options?: ActionOptions): Promise<void>;
    boundingBox(options?: ActionOptions): Promise<BoundingBox | null>;
    evaluate<T = unknown>(pageFunction: string | ((element: Element) => T), options?: ActionOptions): Promise<T>;
    evaluateAll<T = unknown>(pageFunction: string | ((elements: Element[]) => T), options?: ActionOptions): Promise<T>;
    allTextContents(options?: ActionOptions): Promise<string[]>;
    setInputFiles(files: string | string[], options?: ActionOptions): Promise<void>;
    fill(text: string, options?: FillOptions): Promise<void>;
    /** Alias for fill(). */
    type(text: string, options?: FillOptions): Promise<void>;
    press(key: string, options?: LocatorPressOptions): Promise<void>;
    check(options?: ActionOptions): Promise<void>;
    uncheck(options?: ActionOptions): Promise<void>;
    selectOption(values: SelectOptions["values"], options?: SelectOptions): Promise<string[]>;
    textContent(options?: ActionOptions): Promise<string | null>;
    innerText(options?: ActionOptions): Promise<string>;
    innerHTML(options?: ActionOptions): Promise<string>;
    inputValue(options?: ActionOptions): Promise<string>;
    getAttribute(name: string, options?: ActionOptions): Promise<string | null>;
    isVisible(options?: ActionOptions): Promise<boolean>;
    isHidden(options?: ActionOptions): Promise<boolean>;
    isEnabled(options?: ActionOptions): Promise<boolean>;
    isChecked(options?: ActionOptions): Promise<boolean>;
    count(): Promise<number>;
    all(): Promise<Locator[]>;
    waitFor(options?: {
        state?: "attached" | "visible" | "hidden";
        timeout?: number;
    }): Promise<void>;
}
