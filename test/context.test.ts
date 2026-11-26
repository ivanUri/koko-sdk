import { describe, expect, it, vi } from "vitest";
import { BrowserContext } from "../src/browser/context.js";
import type { Browser } from "../src/browser/browser.js";

interface Sent {
  method: string;
  params: unknown;
}

function createFakeBrowser() {
  const sent: Sent[] = [];
  const order: string[] = [];

  const fakeSession = {
    send: vi.fn((method: string, params?: unknown) => {
      sent.push({ method, params });
      order.push(`send:${method}`);
      if (method === "Network.getAllCookies") {
        return Promise.resolve({ cookies: [{ name: "a", value: "1" }] });
      }
      return Promise.resolve({});
    }),
  };

  const fakePage: any = {
    session: fakeSession,
    network: { ensureEnabled: vi.fn().mockResolvedValue(undefined) },
    onClose: vi.fn(),
    addInitScript: vi.fn(async (script: string) => {
      order.push("addInitScript");
    }),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn(async (url: string) => {
      order.push(`goto:${url}`);
    }),
    evaluate: vi.fn(async (expr: string) => {
      if (expr.includes("location.origin")) return "https://example.com";
      if (expr.includes("localStorage")) return [{ name: "k", value: "v" }];
      return undefined;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const fakeBrowser = {
    newPage: vi.fn(async (url: string) => {
      order.push(`newPage:${url}`);
      return fakePage;
    }),
    releaseContext: vi.fn(),
  };

  return { fakeBrowser: fakeBrowser as unknown as Browser, fakePage, fakeSession, sent, order };
}

describe("BrowserContext options", () => {
  it("applies every configured option via the matching CDP call on newPage()", async () => {
    const { fakeBrowser, sent } = createFakeBrowser();
    const ctx = new BrowserContext(fakeBrowser, {
      viewport: { width: 400, height: 800 },
      isMobile: true,
      hasTouch: true,
      userAgent: "KokoBot/1.0",
      acceptLanguage: "en-US",
      locale: "en-US",
      timezoneId: "Asia/Ho_Chi_Minh",
      geolocation: { latitude: 10.8, longitude: 106.6 },
      permissions: ["geolocation"],
      extraHTTPHeaders: { "X-Test": "1" },
    });

    await ctx.newPage("https://example.com");

    const methods = sent.map((s) => s.method);
    expect(methods).toEqual(
      expect.arrayContaining([
        "Emulation.setDeviceMetricsOverride",
        "Emulation.setTouchEmulationEnabled",
        "Network.setUserAgentOverride",
        "Emulation.setLocaleOverride",
        "Emulation.setTimezoneOverride",
        "Emulation.setGeolocationOverride",
        "Browser.grantPermissions",
        "Network.setExtraHTTPHeaders",
      ]),
    );

    const deviceMetrics = sent.find((s) => s.method === "Emulation.setDeviceMetricsOverride")!.params;
    expect(deviceMetrics).toEqual({ width: 400, height: 800, deviceScaleFactor: 1, mobile: true });

    const ua = sent.find((s) => s.method === "Network.setUserAgentOverride")!.params;
    expect(ua).toEqual({ userAgent: "KokoBot/1.0", acceptLanguage: "en-US", platform: undefined });
  });

  it("does not call Network.setUserAgentOverride when userAgent is unset (acceptLanguage/platform alone are not sendable)", async () => {
    const { fakeBrowser, sent } = createFakeBrowser();
    const ctx = new BrowserContext(fakeBrowser, { acceptLanguage: "fr-FR" });

    await ctx.newPage();

    expect(sent.some((s) => s.method === "Network.setUserAgentOverride")).toBe(false);
  });

  it("applies context options and init scripts before navigating to the requested url", async () => {
    const { fakeBrowser, order } = createFakeBrowser();
    const ctx = new BrowserContext(fakeBrowser, { locale: "en-US" });
    await ctx.addInitScript("window.__marked = true;");

    await ctx.newPage("https://example.com/target");

    // Page must be created blank first...
    expect(order[0]).toBe("newPage:about:blank");
    const gotoIndex = order.indexOf("goto:https://example.com/target");
    expect(gotoIndex).toBeGreaterThan(-1);
    // ...and every setup step must land before the real navigation.
    expect(order.indexOf("addInitScript")).toBeLessThan(gotoIndex);
    expect(order.indexOf("send:Emulation.setLocaleOverride")).toBeLessThan(gotoIndex);
  });

  it("restores storageState cookies once and registers an origin-conditional init script", async () => {
    const { fakeBrowser, fakePage, sent } = createFakeBrowser();
    const ctx = new BrowserContext(fakeBrowser, {
      storageState: {
        cookies: [{ name: "sid", value: "abc", domain: "example.com" }],
        origins: [{ origin: "https://example.com", localStorage: [{ name: "k", value: "v" }] }],
      },
    });

    await ctx.newPage();
    await ctx.newPage(); // a second page must not re-apply the cookie restore

    expect(fakePage.addInitScript).toHaveBeenCalledTimes(2);
    const script = fakePage.addInitScript.mock.calls[0][0] as string;
    expect(script).toContain("https://example.com");
    expect(script).toContain("localStorage.setItem");

    const setCookiesCalls = sent.filter((s) => s.method === "Network.setCookies");
    expect(setCookiesCalls).toHaveLength(1);
    expect(setCookiesCalls[0].params).toEqual({
      cookies: [{ name: "sid", value: "abc", domain: "example.com" }],
    });
  });

  it("restores storageState cookies for pages attached through waitForPage()", async () => {
    const { fakePage, sent } = createFakeBrowser();
    const fakeBrowser = {
      waitForPage: vi.fn().mockResolvedValue(fakePage),
      releaseContext: vi.fn(),
    } as unknown as Browser;
    const ctx = new BrowserContext(fakeBrowser, {
      storageState: { cookies: [{ name: "sid", value: "abc", domain: "example.com" }], origins: [] },
    });

    await ctx.waitForPage();

    expect(sent.filter((entry) => entry.method === "Network.setCookies")).toHaveLength(1);
  });

  it("retries storageState cookie restore after a transient CDP failure", async () => {
    const { fakeBrowser, fakeSession } = createFakeBrowser();
    let attempts = 0;
    fakeSession.send.mockImplementation(async (method: string, params?: unknown) => {
      if (method === "Network.setCookies" && attempts++ === 0) {
        throw new Error("temporary CDP failure");
      }
      return {};
    });
    const ctx = new BrowserContext(fakeBrowser, {
      storageState: { cookies: [{ name: "sid", value: "abc", domain: "example.com" }], origins: [] },
    });

    await expect(ctx.newPage()).rejects.toThrow("temporary CDP failure");
    await expect(ctx.newPage()).resolves.toBeDefined();
    expect(attempts).toBe(2);
  });

  it("storageState() aggregates context-wide cookies with per-open-page localStorage", async () => {
    const { fakeBrowser } = createFakeBrowser();
    const ctx = new BrowserContext(fakeBrowser);

    await ctx.newPage();
    const state = await ctx.storageState();

    expect(state.cookies).toEqual([{ name: "a", value: "1" }]);
    expect(state.origins).toEqual([
      { origin: "https://example.com", localStorage: [{ name: "k", value: "v" }] },
    ]);
  });
});
