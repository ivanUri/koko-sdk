import type { CDPSession } from "../cdp/session.js";
import type { GotoWaitOptions, LifecycleEvent } from "./waiter.js";
import { PageWaiter } from "./waiter.js";
import { NetworkTracker } from "./network.js";
import { type RouteHandler, type RoutePattern } from "./route.js";
import { Locator, type GetByRoleOptions, type GetByTextOptions, type LocatorOptions } from "./locator.js";
import type { ActionOptions, FillOptions, SelectOptions } from "./actions.js";
import { KokoClient } from "./lp-client.js";
import { NodeHandle } from "./node-handle.js";
import { Keyboard, Mouse } from "./input.js";
import { type Download } from "./download.js";
import { Frame, PageFrameLocator } from "./frame.js";
import { ConsoleMessage, PageError } from "./console-message.js";
import type { Request, Response } from "./request.js";
import type { DetectedForm, DialogOptions, FindElementOptions, GoogleExtractResult, GoogleSearchOptions, InteractiveElement, LinkInfo, LinksOptions, MarkdownOptions, NodeDetails, SemanticNode, SemanticTreeOptions, StructuredData } from "./lp-types.js";
export interface EvaluateOptions {
    timeout?: number;
    signal?: AbortSignal;
}
export interface ExtractOptions {
    /** Expression that must become truthy before extract runs (TTFX probe). */
    ttfx?: string;
    /** Final extract expression; must returnByValue. */
    expression?: string;
    /** Optional JSON-Schema subset validated after evaluation. */
    schema?: ExtractSchema;
    timeout?: number;
    pollMs?: number;
}
export interface ExtractSchema {
    type?: "object" | "array" | "string" | "number" | "boolean" | "null";
    properties?: Record<string, ExtractSchema>;
    items?: ExtractSchema;
    required?: string[];
    enum?: unknown[];
    additionalProperties?: boolean;
}
export interface ExtractResult {
    title?: string;
    linkCount?: number;
    htmlBytes?: number;
    [key: string]: unknown;
}
export interface TypeOptions {
    timeout?: number;
    clear?: boolean;
}
export interface PressOptions {
    timeout?: number;
}
export interface SearchOptions extends GotoWaitOptions {
    inputSelector?: string;
    settleMs?: number;
}
export interface ScreenshotOptions {
    timeout?: number;
    type?: "png" | "jpeg";
    quality?: number;
    fullPage?: boolean;
}
export interface PdfOptions {
    timeout?: number;
}
export interface ScrollPageOptions {
    timeout?: number;
    behavior?: "auto" | "instant" | "smooth";
}
export interface EmulateMediaOptions {
    media?: "screen" | "print" | "";
    colorScheme?: "dark" | "light" | "no-preference";
    reducedMotion?: "reduce" | "no-preference";
}
export interface ViewportSize {
    width: number;
    height: number;
}
export interface ClickOptions extends ActionOptions {
    waitForNavigation?: boolean | GotoWaitOptions;
}
export interface NavigationResult {
    response: Response | null;
    url: string;
    frameId?: string;
    loaderId?: string;
}
export interface PerformanceEntrySnapshot {
    name: string;
    entryType: string;
    startTime: number;
    duration: number;
    value?: number;
    hadRecentInput?: boolean;
    interactionId?: number;
    processingStart?: number;
    processingEnd?: number;
    renderTime?: number;
    loadTime?: number;
    size?: number;
}
export interface PageEventMap {
    console: ConsoleMessage;
    pageerror: PageError;
    lifecycle: LifecycleEvent;
    request: Request;
    response: Response;
    requestfailed: Request;
    requestfinished: Request;
}
export declare class Page {
    readonly session: CDPSession;
    readonly network: NetworkTracker;
    readonly waiter: PageWaiter;
    readonly keyboard: Keyboard;
    readonly mouse: Mouse;
    /** Koko LP domain — AI extraction and backend-node agent actions. */
    readonly agent: KokoClient;
    /** Stable Koko extension namespace; `agent` remains as a compatibility alias. */
    readonly koko: KokoClient;
    private readonly routes;
    private initialized;
    private closePromise?;
    private mainFrameId?;
    private documentGeneration;
    private currentPageUrl;
    private readonly closeHooks;
    constructor(session: CDPSession);
    /** Register cleanup when page.close() runs (used by Browser/Context). */
    onClose(hook: () => void): void;
    on<K extends keyof PageEventMap>(event: K, handler: (payload: PageEventMap[K]) => void): () => void;
    init(): Promise<void>;
    goto(url: string, options?: GotoWaitOptions): Promise<NavigationResult>;
    evaluate<T = unknown>(expressionOrFunction: string | Function, options?: EvaluateOptions): Promise<T>;
    /** Single round-trip HTML snapshot (doctype + outerHTML). */
    content(): Promise<string>;
    /**
     * Read the engine's Performance Timeline, including Koko's native paint,
     * LCP and Event Timing entries. Unknown optional fields are omitted by
     * Chromium and remain undefined for portable callers.
     */
    performanceEntries(entryType?: string, options?: EvaluateOptions): Promise<PerformanceEntrySnapshot[]>;
    /**
     * Crawler helper: wait for a TTFX probe then run a structured extract expression.
     * Defaults are site-independent; pass expressions for domain-specific schemas.
     */
    extract<T extends Record<string, unknown> = ExtractResult>(options?: ExtractOptions): Promise<T>;
    waitForSelector(selector: string, options?: {
        timeout?: number;
        visible?: boolean;
    }): Promise<void>;
    waitForFunction(fn: string | Function, options?: {
        timeout?: number;
        pollingMs?: number;
    }): Promise<void>;
    waitForNavigation(options?: GotoWaitOptions): Promise<void>;
    waitForURL(url: string | RegExp | ((current: string) => boolean), options?: {
        timeout?: number;
    }): Promise<void>;
    locator(selector: string, options?: LocatorOptions): Locator;
    getByRole(role: string, options?: GetByRoleOptions): Locator;
    getByText(text: string | RegExp, options?: GetByTextOptions): Locator;
    getByLabel(text: string | RegExp, options?: GetByTextOptions): Locator;
    getByPlaceholder(text: string | RegExp, options?: GetByTextOptions): Locator;
    getByAltText(text: string | RegExp, options?: GetByTextOptions): Locator;
    getByTitle(text: string | RegExp, options?: GetByTextOptions): Locator;
    getByTestId(testId: string | RegExp): Locator;
    click(selector: string, options?: ClickOptions): Promise<void>;
    fill(selector: string, text: string, options?: FillOptions): Promise<void>;
    hover(selector: string, options?: ActionOptions): Promise<void>;
    check(selector: string, options?: ActionOptions): Promise<void>;
    uncheck(selector: string, options?: ActionOptions): Promise<void>;
    selectOption(selector: string, values: SelectOptions["values"], options?: SelectOptions): Promise<string[]>;
    title(): Promise<string>;
    url(): Promise<string>;
    /** Last main-frame URL observed by the driver, without a protocol round-trip. */
    currentUrl(): string;
    reload(options?: GotoWaitOptions): Promise<NavigationResult>;
    goBack(options?: GotoWaitOptions): Promise<NavigationResult>;
    goForward(options?: GotoWaitOptions): Promise<NavigationResult>;
    screenshot(options?: ScreenshotOptions): Promise<Buffer>;
    pdf(options?: PdfOptions): Promise<Buffer>;
    addInitScript(source: string | Function): Promise<void>;
    setViewportSize(size: ViewportSize): Promise<void>;
    scrollBy(x: number, y: number, options?: ScrollPageOptions): Promise<void>;
    scrollTo(x: number, y: number, options?: ScrollPageOptions): Promise<void>;
    setContent(html: string, options?: {
        timeout?: number;
    }): Promise<void>;
    waitForLoadState(state?: "domcontentloaded" | "load" | "networkidle" | "domstable" | "done", options?: {
        timeout?: number;
    }): Promise<void>;
    waitForTimeout(timeout: number): Promise<void>;
    waitForDownload(options?: {
        path?: string;
        timeout?: number;
    }): Promise<Download>;
    bringToFront(options?: {
        timeout?: number;
    }): Promise<void>;
    frames(options?: {
        timeout?: number;
    }): Promise<Frame[]>;
    mainFrame(options?: {
        timeout?: number;
    }): Promise<Frame>;
    frame(selector: {
        name?: string;
        url?: string | RegExp;
    }, options?: {
        timeout?: number;
    }): Promise<Frame | null>;
    frameLocator(selector: string): PageFrameLocator;
    waitForPopup(options?: {
        timeout?: number;
        signal?: AbortSignal;
    }): Promise<Page>;
    emulateMedia(options?: EmulateMediaOptions): Promise<void>;
    /** Intercept network requests (Playwright-style `page.route`). */
    route(pattern: RoutePattern, handler: RouteHandler): Promise<void>;
    unroute(pattern?: RoutePattern, handler?: RouteHandler): Promise<void>;
    type(selector: string, text: string, options?: TypeOptions): Promise<void>;
    press(key: string, options?: PressOptions): Promise<void>;
    markdown(options?: MarkdownOptions): Promise<string>;
    semanticTree(options?: SemanticTreeOptions): Promise<string | SemanticNode>;
    getInteractiveElements(options?: {
        nodeId?: number;
        timeout?: number;
    }): Promise<InteractiveElement[]>;
    getStructuredData(options?: {
        timeout?: number;
    }): Promise<StructuredData>;
    detectForms(options?: {
        timeout?: number;
    }): Promise<DetectedForm[]>;
    forms(options?: {
        timeout?: number;
    }): Promise<DetectedForm[]>;
    findElement(options: FindElementOptions): Promise<InteractiveElement[]>;
    getNodeDetails(backendNodeId: number, options?: {
        timeout?: number;
    }): Promise<NodeDetails>;
    links(options?: LinksOptions & {
        details?: false;
    }): Promise<string[]>;
    links(options: LinksOptions & {
        details: true;
    }): Promise<LinkInfo[]>;
    node(backendNodeId: number): NodeHandle;
    waitForSelectorHandle(selector: string, options?: {
        timeout?: number;
    }): Promise<NodeHandle>;
    armDialog(options: DialogOptions): Promise<void>;
    /** Google SERP agent workflow: navigate + TTFX probe + top-N organic extract + block detection. */
    searchGoogle(options: GoogleSearchOptions): Promise<GoogleExtractResult>;
    search(searchPageUrl: string, query: string, options?: SearchOptions): Promise<void>;
    close(): Promise<void>;
    get frameId(): string | undefined;
    get generation(): number;
    private historyStep;
    private closeImpl;
}
