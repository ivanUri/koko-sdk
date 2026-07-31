import type { CDPSession } from "../cdp/session.js";
import type { Page } from "./page.js";
export interface FrameInfo {
    id: string;
    parentId?: string;
    name?: string;
    url: string;
}
export declare class Frame {
    readonly session: CDPSession;
    readonly info: FrameInfo;
    constructor(session: CDPSession, info: FrameInfo);
    get id(): string;
    get name(): string;
    get url(): string;
    evaluate<T = unknown>(expressionOrFunction: string | Function, options?: {
        timeout?: number;
    }): Promise<T>;
    locator(selector: string): FrameLocator;
    content(options?: {
        timeout?: number;
    }): Promise<string>;
}
export declare class FrameLocator {
    readonly frame: Frame;
    readonly selector: string;
    constructor(frame: Frame, selector: string);
    locator(selector: string): FrameLocator;
    click(options?: {
        timeout?: number;
    }): Promise<void>;
    fill(value: string, options?: {
        timeout?: number;
    }): Promise<void>;
    textContent(options?: {
        timeout?: number;
    }): Promise<string | null>;
    private run;
}
/** Playwright-style lazy iframe selector. The owner is re-resolved for every action. */
export declare class PageFrameLocator {
    readonly page: Page;
    readonly ownerSelector: string;
    constructor(page: Page, ownerSelector: string);
    locator(selector: string): DeferredFrameLocator;
    resolve(options?: {
        timeout?: number;
    }): Promise<Frame>;
}
export declare class DeferredFrameLocator {
    readonly owner: PageFrameLocator;
    readonly selector: string;
    constructor(owner: PageFrameLocator, selector: string);
    locator(selector: string): DeferredFrameLocator;
    click(options?: {
        timeout?: number;
    }): Promise<void>;
    fill(value: string, options?: {
        timeout?: number;
    }): Promise<void>;
    textContent(options?: {
        timeout?: number;
    }): Promise<string | null>;
}
export declare function flattenFrameTree(tree: any): FrameInfo[];
