import { Browser } from "./browser/browser.js";
import type { BrowserConnectOptions } from "./browser/browser.js";
import { type LaunchedVelora, type VeloraLaunchOptions } from "./browser/launch.js";
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
    launch?(options?: unknown): Promise<LaunchedVelora>;
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
export interface VeloraPageDriver extends PageDriver {
    readonly page: Page;
}
export declare const VELORA_CAPABILITIES: DriverCapabilities;
export declare const CHROME_CDP_CAPABILITIES: DriverCapabilities;
/**
 * The first concrete driver adapter. Keeping this behind the contract makes
 * it possible to add Chrome or remote implementations without changing the
 * Browser/Context/Page object model.
 */
export declare class VeloraDriver implements BrowserDriver {
    readonly name = "velora";
    capabilities(): DriverCapabilities;
    connect(endpoint: string, options?: BrowserConnectOptions): Promise<Browser>;
    launch(options?: VeloraLaunchOptions): Promise<LaunchedVelora>;
}
/**
 * Experimental adapter for an already-running Chromium CDP endpoint.
 * Velora extension methods are intentionally reported as unsupported.
 */
export declare class ChromeCdpDriver implements BrowserDriver {
    readonly name = "chrome-cdp";
    capabilities(): DriverCapabilities;
    connect(endpoint: string, options?: BrowserConnectOptions): Promise<Browser>;
}
export declare function createVeloraDriver(): BrowserDriver;
export declare function createChromeCdpDriver(): BrowserDriver;
