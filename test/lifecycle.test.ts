import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { CDPClient } from "../src/cdp/client.js";
import { Page } from "../src/browser/page.js";
import { terminateChildProcess, waitForCdp } from "../src/browser/launch.js";
import type { CDPSession } from "../src/cdp/session.js";
import { PageWaiter } from "../src/browser/waiter.js";

describe("event wait lifecycle", () => {
  it("unsubscribes a client event listener when waitFor times out", async () => {
    const off = vi.fn();
    const client = {
      on: vi.fn(() => off),
    };

    await expect(
      CDPClient.prototype.waitFor.call(client, "Page.loadEventFired", { timeout: 5 }),
    ).rejects.toThrow("Waiting for Page.loadEventFired");

    expect(off).toHaveBeenCalledOnce();
  });

  it("unsubscribes a session event listener when waitForSession times out", async () => {
    const off = vi.fn();
    const client = {
      onSession: vi.fn(() => off),
    };

    await expect(
      CDPClient.prototype.waitForSession.call(client, "S1", "Page.loadEventFired", { timeout: 5 }),
    ).rejects.toThrow("Waiting for Page.loadEventFired");

    expect(off).toHaveBeenCalledOnce();
  });

  it("waits for DOM quiet after load without waiting for network idle", async () => {
    const session = {
      waitFor: vi.fn().mockResolvedValue({}),
      send: vi.fn().mockResolvedValue({ result: { value: true } }),
    } as unknown as CDPSession;
    const network = { waitForIdle: vi.fn() };
    const waiter = new PageWaiter(session, network as never);

    await waiter.waitForNavigation({ waitUntil: "domstable", timeout: 1000, domStableMs: 250 });

    expect(session.waitFor).toHaveBeenCalledWith("Page.loadEventFired", expect.objectContaining({ timeout: 1000 }));
    expect(network.waitForIdle).not.toHaveBeenCalled();
    expect(session.send).toHaveBeenCalledWith(
      "Runtime.evaluate",
      expect.objectContaining({ expression: expect.stringContaining("MutationObserver") }),
      1250,
      undefined,
    );
  });

  it("uses the engine lifecycle ledger for network idle", async () => {
    const session = {
      waitFor: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ name: "networkIdle", frameId: "FRAME-1" }),
    } as unknown as CDPSession;
    const network = { waitForIdle: vi.fn() };
    const waiter = new PageWaiter(session, network as never);

    await waiter.waitForNavigation({ waitUntil: "networkidle", timeout: 1000, frameId: "FRAME-1" });

    expect(network.waitForIdle).not.toHaveBeenCalled();
    expect(session.waitFor).toHaveBeenLastCalledWith(
      "Page.lifecycleEvent",
      expect.objectContaining({ timeout: 1000, predicate: expect.any(Function) }),
    );
  });

  it("filters load events by the requested frame", async () => {
    let waitOptions: any;
    const session = {
      waitFor: vi.fn((_event: string, options: unknown) => {
        waitOptions = options;
        return Promise.resolve({});
      }),
      send: vi.fn(),
    } as unknown as CDPSession;
    const waiter = new PageWaiter(session, { waitForIdle: vi.fn() } as never);

    await waiter.waitForNavigation({ waitUntil: "load", frameId: "MAIN" });

    expect(waitOptions.predicate({ frameId: "CHILD" })).toBe(false);
    expect(waitOptions.predicate({ frameId: "MAIN" })).toBe(true);
  });

  it("scopes reload lifecycle waits to the current main frame", async () => {
    let lifecycleWaitOptions: any;
    const session = {
      targetId: "TARGET-1",
      client: { closeTarget: vi.fn().mockResolvedValue(undefined) },
      on: vi.fn(() => () => undefined),
      waitFor: vi.fn((event: string, options: unknown) => {
        if (event === "Page.loadEventFired") lifecycleWaitOptions = options;
        return Promise.resolve({});
      }),
      send: vi.fn((method: string) => {
        if (method === "Page.getFrameTree") {
          return Promise.resolve({ frameTree: { frame: { id: "MAIN", url: "https://example.com" } } });
        }
        return Promise.resolve({});
      }),
      detach: vi.fn().mockResolvedValue(undefined),
      markClosed: vi.fn(),
    } as unknown as CDPSession;
    const page = new Page(session);

    await page.reload({ waitUntil: "load" });

    expect(lifecycleWaitOptions.predicate({ frameId: "CHILD" })).toBe(false);
    expect(lifecycleWaitOptions.predicate({ frameId: "MAIN" })).toBe(true);
  });
});

describe("Page close lifecycle", () => {
  it("runs terminal cleanup exactly once across concurrent close calls", async () => {
    const closeTarget = vi.fn().mockResolvedValue(undefined);
    const detach = vi.fn().mockResolvedValue(undefined);
    const session = {
      targetId: "TARGET-1",
      client: { closeTarget },
      detach,
      on: vi.fn(() => vi.fn()),
      send: vi.fn().mockResolvedValue({}),
    } as unknown as CDPSession;
    const page = new Page(session);
    const hook = vi.fn();
    page.onClose(hook);

    await Promise.all([page.close(), page.close(), page.close()]);

    expect(closeTarget).toHaveBeenCalledOnce();
    expect(detach).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledOnce();
  });

  it("returns a correlated navigation result for a commit navigation", async () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    const session = {
      sessionId: "SESSION-1",
      targetId: "TARGET-1",
      client: { closeTarget: vi.fn().mockResolvedValue(undefined) },
      on: vi.fn((event: string, handler: (payload: unknown) => void) => {
        listeners.set(event, handler);
        return () => listeners.delete(event);
      }),
      send: vi.fn((method: string) => {
        if (method === "Page.getFrameTree") {
          return Promise.resolve({ frameTree: { frame: { id: "FRAME-1", url: "about:blank" } } });
        }
        if (method === "Page.navigate") {
          listeners.get("Page.frameNavigated")?.({ frame: { id: "FRAME-1", url: "https://example.com" } });
          return Promise.resolve({ frameId: "FRAME-1", loaderId: "LOADER-1" });
        }
        return Promise.resolve({});
      }),
      detach: vi.fn().mockResolvedValue(undefined),
      markClosed: vi.fn(),
    } as unknown as CDPSession;
    const page = new Page(session);

    const result = await page.goto("https://example.com", { waitUntil: "commit" });

    expect(result).toMatchObject({
      url: "https://example.com",
      frameId: "FRAME-1",
      loaderId: "LOADER-1",
    });
  });
});

describe("launch lifecycle", () => {
  it("rejects a process spawn error through the launch promise", async () => {
    const proc = new EventEmitter() as ChildProcess;
    Object.defineProperty(proc, "exitCode", { value: null, configurable: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not listening")));

    const pending = waitForCdp("http://127.0.0.1:9222", proc, 5_000);
    proc.emit("error", new Error("ENOENT"));

    await expect(pending).rejects.toThrow("failed to spawn koko: ENOENT");
    expect(proc.listenerCount("error")).toBe(0);
    vi.unstubAllGlobals();
  });

  it("waits for a spawned process to exit after SIGTERM", async () => {
    const proc = new EventEmitter() as ChildProcess;
    Object.defineProperty(proc, "exitCode", { value: null, writable: true, configurable: true });
    Object.defineProperty(proc, "signalCode", { value: null, writable: true, configurable: true });
    proc.kill = vi.fn(() => {
      proc.exitCode = 0;
      queueMicrotask(() => proc.emit("exit", 0, "SIGTERM"));
      return true;
    });

    await terminateChildProcess(proc, 100);

    expect(proc.kill).toHaveBeenCalledOnce();
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
