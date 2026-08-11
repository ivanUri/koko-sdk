import { Browser } from "./browser/browser.js";
import type { BrowserConnectOptions } from "./browser/browser.js";
import { type LaunchedKoko, type KokoLaunchOptions } from "./browser/launch.js";
import type { Page } from "./browser/page.js";
import type { LocatorQuery } from "./browser/locator-query.js";
import type { ActionOptions } from "./browser/actions.js";
/**
 * Stable backend capabilities. Portable API code should feature-detect optional
 * behavior instead of checking a browser name or protocol implementation.
 */
export interface DriverCapabilities {
    navigation: boolean;
    evaluation: boolean;
    locators: boolean;
    network: boolean;
    routing: boolean;
    storage: boolean;
    screenshots: boolean;
    semanticTree: boolean;
    markdown: boolean;
    structuredExtraction: boolean;
    isolatedContexts: boolean;
}
export interface BrowserDriver {
    readonly name: string;
    capabilities(): DriverCapabilities;
    connect(endpoint: string, options?: BrowserConnectOptions): Promise<Browser>;
    launch?(options?: unknown): Promise<LaunchedKoko>;
}
export interface PageDriver {
    navigate(url: string, options?: unknown): Promise<unknown>;
    evaluate<T = unknown>(expression: string | Function, options?: unknown): Promise<T>;
    close(): Promise<void>;
}
export interface ElementDriver {
    resolve(query: LocatorQuery): Promise<unknown[]>;
    click(element: unknown, options?: ActionOptions): Promise<void>;
    fill(element: unknown, value: string, options?: ActionOptions): Promise<void>;
}
export interface KokoPageDriver extends PageDriver {
    readonly page: Page;
}
export declare const KOKO_CAPABILITIES: DriverCapabilities;
export declare const CHROME_CDP_CAPABILITIES: DriverCapabilities;
/**
 * The first concrete driver adapter. Keeping this behind the contract makes
 * it possible to add Chrome or remote implementations without changing the
 * Browser/Context/Page object model.
 */
export declare class KokoDriver implements BrowserDriver {
    readonly name = "koko";
    capabilities(): DriverCapabilities;
    connect(endpoint: string, options?: BrowserConnectOptions): Promise<Browser>;
    launch(options?: KokoLaunchOptions): Promise<LaunchedKoko>;
}
/**
 * Experimental adapter for an already-running Chromium CDP endpoint.
 * Koko extension methods are intentionally reported as unsupported.
 */
export declare class ChromeCdpDriver implements BrowserDriver {
    readonly name = "chrome-cdp";
    capabilities(): DriverCapabilities;
    connect(endpoint: string, options?: BrowserConnectOptions): Promise<Browser>;
}
export declare function createKokoDriver(): BrowserDriver;
export declare function createChromeCdpDriver(): BrowserDriver;
