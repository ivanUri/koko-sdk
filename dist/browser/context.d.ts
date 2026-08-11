import type { Browser } from "./browser.js";
import type { Page } from "./page.js";
import type { CookieState } from "./session-state.js";
import type { ViewportSize } from "./page.js";
export interface Geolocation {
    latitude: number;
    longitude: number;
    /** Meters. Engine default is 1 when omitted. */
    accuracy?: number;
}
export interface StorageStateOrigin {
    origin: string;
    localStorage: Array<{
        name: string;
        value: string;
    }>;
}
/** Playwright-compatible `storageState()` shape: cookies + per-origin localStorage. */
export interface StorageState {
    cookies: CookieState[];
    origins: StorageStateOrigin[];
}
export interface BrowserContextOptions {
    viewport?: ViewportSize;
    /**
     * Overrides `navigator.userAgent` and the HTTP User-Agent header (CDP `Network.setUserAgentOverride`).
     * Koko accepts the call but SILENTLY skips the override if `userAgent` contains "Mozilla" and the
     * active profile doesn't allow it — for full antidetect identity spoofing use `fingerprint`/`profile`
     * on `Browser.launch()` instead of a manual override here.
     */
    userAgent?: string;
    /** Only applied when `userAgent` is also set (the engine requires `userAgent` on this call). */
    acceptLanguage?: string;
    /** Only applied when `userAgent` is also set (the engine requires `userAgent` on this call). */
    platform?: string;
    locale?: string;
    timezoneId?: string;
    geolocation?: Geolocation;
    /** Permission names granted via CDP `Browser.grantPermissions` (e.g. "geolocation", "notifications"). */
    permissions?: string[];
    extraHTTPHeaders?: Record<string, string>;
    isMobile?: boolean;
    hasTouch?: boolean;
    /** Restore cookies + localStorage captured by a prior `context.storageState()`. */
    storageState?: StorageState;
}
/**
 * NOTE on isolation: Koko currently supports a single CDP browser context per `koko serve`
 * connection (`Target.createBrowserContext` errors if called twice). `userAgent`/`locale`/`timezoneId`/
 * `geolocation`/`permissions`/`extraHTTPHeaders` are applied per-page but the underlying engine state
 * is connection-wide — multiple `browser.newContext()` calls on the SAME `Browser` are NOT isolated
 * from each other for these fields (last write wins across contexts). For true per-identity isolation,
 * use a separate `Browser.connect()` / `Browser.launch()` per identity.
 */
export declare class BrowserContext {
    private readonly browser;
    private readonly _pages;
    private closePromise?;
    private readonly initScripts;
    private viewport?;
    private readonly opts;
    private storageStateCookiesApplied;
    constructor(browser: Browser, options?: BrowserContextOptions);
    newPage(url?: string): Promise<Page>;
    cookies(urls?: string[]): Promise<CookieState[]>;
    addCookies(cookies: CookieState[]): Promise<void>;
    clearCookies(): Promise<void>;
    /**
     * Playwright-compatible snapshot: cookies (context-wide) + localStorage for every origin currently
     * open in this context. Unlike Playwright, origins are only captured from pages presently open —
     * visit each origin you care about before calling this (a page you've already closed won't appear).
     */
    storageState(): Promise<StorageState>;
    addInitScript(source: string | Function): Promise<void>;
    setViewportSize(size: ViewportSize): Promise<void>;
    pages(): Page[];
    waitForPage(options?: {
        timeout?: number;
        signal?: AbortSignal;
    }): Promise<Page>;
    close(): Promise<void>;
    private closeImpl;
    private applyOptionsTo;
    private applyStorageStateCookies;
    private ensurePage;
}
