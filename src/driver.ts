import { Browser } from "./browser/browser.js";
import type { BrowserConnectOptions } from "./browser/browser.js";
import { launchKoko, type LaunchedKoko, type KokoLaunchOptions } from "./browser/launch.js";
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

export const KOKO_CAPABILITIES: DriverCapabilities = Object.freeze({
  navigation: true,
  evaluation: true,
  locators: true,
  network: true,
  routing: true,
  storage: true,
  screenshots: true,
  semanticTree: true,
  markdown: true,
  structuredExtraction: true,
  isolatedContexts: false,
});

export const CHROME_CDP_CAPABILITIES: DriverCapabilities = Object.freeze({
  navigation: true,
  evaluation: true,
  locators: true,
  network: true,
  routing: true,
  storage: true,
  screenshots: true,
  semanticTree: false,
  markdown: false,
  structuredExtraction: false,
  // The current portable Context implementation does not yet call
  // Target.createBrowserContext even though Chrome supports it.
  isolatedContexts: false,
});

/**
 * The first concrete driver adapter. Keeping this behind the contract makes
 * it possible to add Chrome or remote implementations without changing the
 * Browser/Context/Page object model.
 */
export class KokoDriver implements BrowserDriver {
  readonly name = "koko";

  capabilities(): DriverCapabilities {
    return KOKO_CAPABILITIES;
  }

  connect(endpoint: string, options: BrowserConnectOptions = {}): Promise<Browser> {
    return Browser.connect(endpoint, options);
  }

  launch(options: KokoLaunchOptions = {}): Promise<LaunchedKoko> {
    return launchKoko(options);
  }
}

/**
 * Experimental adapter for an already-running Chromium CDP endpoint.
 * Koko extension methods are intentionally reported as unsupported.
 */
export class ChromeCdpDriver implements BrowserDriver {
  readonly name = "chrome-cdp";

  capabilities(): DriverCapabilities {
    return CHROME_CDP_CAPABILITIES;
  }

  connect(endpoint: string, options: BrowserConnectOptions = {}): Promise<Browser> {
    return Browser.connect(endpoint, options);
  }
}

export function createKokoDriver(): BrowserDriver {
  return new KokoDriver();
}

export function createChromeCdpDriver(): BrowserDriver {
  return new ChromeCdpDriver();
}
