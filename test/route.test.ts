import { describe, expect, it, vi } from "vitest";
import { matchesRoutePattern, RouteRegistry } from "../src/browser/route.js";
import type { CDPSession } from "../src/cdp/session.js";

describe("matchesRoutePattern", () => {
  it("matches substrings for string patterns", () => {
    expect(matchesRoutePattern("https://example.com/api/x", "/api/")).toBe(true);
    expect(matchesRoutePattern("https://example.com/other", "/api/")).toBe(false);
  });

  it("\"*\" matches any url even without a literal asterisk", () => {
    expect(matchesRoutePattern("https://example.com/anything", "*")).toBe(true);
  });

  it("supports Playwright-style glob patterns", () => {
    expect(matchesRoutePattern("https://example.com/assets/logo.png", "**/*.png")).toBe(true);
    expect(matchesRoutePattern("https://example.com/assets/logo.jpg", "**/*.png")).toBe(false);
    expect(matchesRoutePattern("https://example.com/api/v1", "**/api/*")).toBe(true);
  });

  it("matches via RegExp", () => {
    const pattern = /\.png$/g;
    expect(matchesRoutePattern("https://example.com/x.png", pattern)).toBe(true);
    expect(matchesRoutePattern("https://example.com/x.png", pattern)).toBe(true);
    expect(matchesRoutePattern("https://example.com/x.jpg", pattern)).toBe(false);
  });

  it("matches via predicate function", () => {
    const pattern = (url: string) => url.includes("block-me");
    expect(matchesRoutePattern("https://example.com/block-me", pattern)).toBe(true);
    expect(matchesRoutePattern("https://example.com/ok", pattern)).toBe(false);
  });
});

function fakeRouteSession() {
  let pausedHandler: ((event: unknown) => void) | undefined;
  const unsubscribe = vi.fn();
  const send = vi.fn().mockResolvedValue({});
  const session = {
    send,
    on: vi.fn((_event: string, handler: (event: unknown) => void) => {
      pausedHandler = handler;
      return unsubscribe;
    }),
  } as unknown as CDPSession;
  return {
    session,
    send,
    unsubscribe,
    pause(event: unknown) {
      pausedHandler?.(event);
    },
  };
}

async function flushAsyncHandler(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("RouteRegistry lifecycle", () => {
  it("continues a matching request when its handler returns without handling it", async () => {
    const fake = fakeRouteSession();
    const registry = new RouteRegistry(fake.session);
    await registry.route("*", vi.fn());

    fake.pause({
      requestId: "REQUEST-1",
      request: { url: "https://example.com", method: "GET", headers: {} },
    });
    await flushAsyncHandler();

    expect(fake.send).toHaveBeenCalledWith("Fetch.continueRequest", { requestId: "REQUEST-1" });
  });

  it("does not continue a request after the handler already fulfilled it", async () => {
    const fake = fakeRouteSession();
    const registry = new RouteRegistry(fake.session);
    await registry.route("*", async (route) => route.fulfill({ body: "ok" }));

    fake.pause({
      requestId: "REQUEST-2",
      request: { url: "https://example.com", method: "GET", headers: {} },
    });
    await flushAsyncHandler();

    expect(fake.send).toHaveBeenCalledWith("Fetch.fulfillRequest", expect.objectContaining({
      requestId: "REQUEST-2",
    }));
    expect(fake.send).not.toHaveBeenCalledWith("Fetch.continueRequest", expect.anything());
  });

  it("unroute() without arguments disables Fetch and removes the listener", async () => {
    const fake = fakeRouteSession();
    const registry = new RouteRegistry(fake.session);
    await registry.route("*", vi.fn());

    await registry.unroute();

    expect(fake.unsubscribe).toHaveBeenCalledOnce();
    expect(fake.send).toHaveBeenCalledWith("Fetch.disable");
  });

  it("rolls back the listener if Fetch.enable fails", async () => {
    const fake = fakeRouteSession();
    fake.send.mockRejectedValueOnce(new Error("unsupported"));
    const registry = new RouteRegistry(fake.session);

    await expect(registry.route("*", vi.fn())).rejects.toThrow("unsupported");

    expect(fake.unsubscribe).toHaveBeenCalledOnce();
  });
});
