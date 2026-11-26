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
  localStorage: Array<{ name: string; value: string }>;
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
export class BrowserContext {
  private readonly _pages = new Set<Page>();
  private closePromise?: Promise<void>;
  private readonly initScripts: string[] = [];
  private viewport?: ViewportSize;
  private readonly opts: BrowserContextOptions;
  private storageStateCookiesApplied = false;

  constructor(
    private readonly browser: Browser,
    options: BrowserContextOptions = {},
  ) {
    this.viewport = options.viewport;
    this.opts = options;
    if (options.storageState?.origins?.length) {
      this.initScripts.push(buildStorageStateInitScript(options.storageState.origins));
    }
  }

  async newPage(url = "about:blank"): Promise<Page> {
    // Always create blank first: context options (UA/locale/geolocation/init scripts/...) must be
    // applied BEFORE the first real navigation, not after — a page created directly at `url` would
    // already have loaded (and even navigated twice, see Browser.newPage) before we get a chance.
    const page = await this.browser.newPage("about:blank");
    this._pages.add(page);
    page.onClose(() => this._pages.delete(page));

    for (const script of this.initScripts) {
      await page.addInitScript(script);
    }
    try {
      await this.applyOptionsTo(page);
      await this.applyStorageStateCookies(page);

      if (url !== "about:blank") await page.goto(url);
      return page;
    } catch (error) {
      await page.close().catch(() => undefined);
      throw error;
    }
  }

  async cookies(urls?: string[]): Promise<CookieState[]> {
    const page = await this.ensurePage();
    await page.network.ensureEnabled();
    const result = await page.session.send<{ cookies: CookieState[] }>(
      urls?.length ? "Network.getCookies" : "Network.getAllCookies",
      urls?.length ? { urls } : undefined,
    );
    return result.cookies ?? [];
  }

  async addCookies(cookies: CookieState[]): Promise<void> {
    if (!cookies.length) return;
    const page = await this.ensurePage();
    await page.network.ensureEnabled();
    await page.session.send("Network.setCookies", { cookies });
  }

  async clearCookies(): Promise<void> {
    const page = await this.ensurePage();
    await page.network.ensureEnabled();
    const all = await page.session.send<{ cookies: CookieState[] }>("Network.getAllCookies");
    for (const cookie of all.cookies ?? []) {
      await page.session.send("Network.deleteCookies", {
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
      }).catch(() => undefined);
    }
  }

  /**
   * Playwright-compatible snapshot: cookies (context-wide) + localStorage for every origin currently
   * open in this context. Unlike Playwright, origins are only captured from pages presently open —
   * visit each origin you care about before calling this (a page you've already closed won't appear).
   */
  async storageState(): Promise<StorageState> {
    const cookies = await this.cookies();
    const merged = new Map<string, Map<string, string>>();
    for (const page of this._pages) {
      const origin = await page.evaluate<string>("location.origin").catch(() => undefined);
      if (!origin || origin === "null") continue;
      const entries = await page
        .evaluate<Array<{ name: string; value: string }>>(
          "Object.entries(localStorage).map(([name, value]) => ({ name, value: String(value) }))",
        )
        .catch(() => [] as Array<{ name: string; value: string }>);
      if (!entries.length) continue;
      const bucket = merged.get(origin) ?? new Map<string, string>();
      for (const entry of entries) bucket.set(entry.name, entry.value);
      merged.set(origin, bucket);
    }
    const origins: StorageStateOrigin[] = [...merged.entries()].map(([origin, values]) => ({
      origin,
      localStorage: [...values.entries()].map(([name, value]) => ({ name, value })),
    }));
    return { cookies, origins };
  }

  async addInitScript(source: string | Function): Promise<void> {
    const script = typeof source === "function" ? `(${source.toString()})();` : source;
    this.initScripts.push(script);
    await Promise.all([...this._pages].map((page) => page.addInitScript(script)));
  }

  async setViewportSize(size: ViewportSize): Promise<void> {
    this.viewport = size;
    await Promise.all([...this._pages].map((page) => page.setViewportSize(size)));
  }

  pages(): Page[] {
    return [...this._pages];
  }

  async waitForPage(options: { timeout?: number; signal?: AbortSignal } = {}): Promise<Page> {
    const page = await this.browser.waitForPage(options);
    this._pages.add(page);
    page.onClose(() => this._pages.delete(page));
    try {
      for (const script of this.initScripts) await page.addInitScript(script);
      await this.applyOptionsTo(page);
      await this.applyStorageStateCookies(page);
      return page;
    } catch (error) {
      await page.close().catch(() => undefined);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = this.closeImpl();
    return this.closePromise;
  }

  private async closeImpl(): Promise<void> {
    await Promise.all([...this._pages].map((page) => page.close().catch(() => undefined)));
    this._pages.clear();
    this.browser.releaseContext(this);
  }

  private async applyOptionsTo(page: Page): Promise<void> {
    const o = this.opts;

    if (this.viewport || o.isMobile != null) {
      await page.session.send("Emulation.setDeviceMetricsOverride", {
        width: this.viewport?.width ?? 1280,
        height: this.viewport?.height ?? 720,
        deviceScaleFactor: 1,
        mobile: o.isMobile ?? false,
      });
    }
    if (o.hasTouch != null) {
      await page.session.send("Emulation.setTouchEmulationEnabled", { enabled: o.hasTouch });
    }
    if (o.userAgent) {
      await page.session.send("Network.setUserAgentOverride", {
        userAgent: o.userAgent,
        acceptLanguage: o.acceptLanguage,
        platform: o.platform,
      });
    }
    if (o.locale) {
      await page.session.send("Emulation.setLocaleOverride", { locale: o.locale });
    }
    if (o.timezoneId) {
      await page.session.send("Emulation.setTimezoneOverride", { timezoneId: o.timezoneId });
    }
    if (o.geolocation) {
      await page.session.send("Emulation.setGeolocationOverride", o.geolocation);
    }
    if (o.permissions?.length) {
      await page.session.send("Browser.grantPermissions", { permissions: o.permissions });
    }
    if (o.extraHTTPHeaders) {
      await page.session.send("Network.setExtraHTTPHeaders", { headers: o.extraHTTPHeaders });
    }
  }

  private async applyStorageStateCookies(page: Page): Promise<void> {
    if (this.storageStateCookiesApplied) return;
    const cookies = this.opts.storageState?.cookies;
    if (cookies?.length) {
      await page.session.send("Network.setCookies", { cookies });
    }
    this.storageStateCookiesApplied = true;
  }

  private async ensurePage(): Promise<Page> {
    const existing = this._pages.values().next().value as Page | undefined;
    if (existing) return existing;
    return this.newPage();
  }
}

/** Origin-conditional restore: runs on every new document, applies only if the origin matches. */
function buildStorageStateInitScript(origins: StorageStateOrigin[]): string {
  const map: Record<string, Array<{ name: string; value: string }>> = {};
  for (const entry of origins) map[entry.origin] = entry.localStorage;
  const json = JSON.stringify(map);
  return `(() => {
    try {
      const map = ${json};
      const entries = map[location.origin];
      if (entries) {
        for (const e of entries) localStorage.setItem(e.name, e.value);
      }
    } catch (err) {}
  })();`;
}
