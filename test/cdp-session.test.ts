import { describe, expect, it, vi } from "vitest";
import { CDPSession } from "../src/cdp/session.js";
import { TargetClosedError } from "../src/cdp/errors.js";
import type { CDPClient } from "../src/cdp/client.js";

function fakeClient(overrides: Partial<{
  send: any;
  detachSession: any;
  onSession: any;
  onceSession: any;
}> = {}): CDPClient {
  return {
    send: overrides.send ?? vi.fn().mockResolvedValue({ ok: true }),
    detachSession: overrides.detachSession ?? vi.fn().mockResolvedValue(undefined),
    onSession: overrides.onSession ?? vi.fn(() => vi.fn()),
    onceSession: overrides.onceSession ?? vi.fn(() => vi.fn()),
    waitForSession: vi.fn(),
  } as unknown as CDPClient;
}

describe("CDPSession", () => {
  it("forwards send() to the client with its own sessionId", async () => {
    const send = vi.fn().mockResolvedValue({ value: 42 });
    const client = fakeClient({ send });
    const session = new CDPSession(client, "SESSION-1", "TARGET-1");

    const result = await session.send("Runtime.evaluate", { expression: "1+1" }, 5000);

    expect(result).toEqual({ value: 42 });
    expect(send).toHaveBeenCalledWith("Runtime.evaluate", { expression: "1+1" }, "SESSION-1", 5000, undefined);
  });

  it("rejects send() immediately once closed", async () => {
    const client = fakeClient();
    const session = new CDPSession(client, "SESSION-1");
    session.markClosed(new TargetClosedError("gone"));

    await expect(session.send("Page.navigate", {})).rejects.toThrow("gone");
  });

  it("rejects in-flight sends as soon as markClosed() fires, without waiting on the transport", async () => {
    const send = vi.fn(() => new Promise(() => {})); // never settles on its own
    const client = fakeClient({ send });
    const session = new CDPSession(client, "SESSION-1");

    const pending = session.send("Page.navigate", {});
    session.markClosed(new TargetClosedError("target closed mid-flight"));

    await expect(pending).rejects.toThrow("target closed mid-flight");
  });

  it("detach() marks the session closed even when the underlying client call fails", async () => {
    const client = fakeClient({ detachSession: vi.fn().mockRejectedValue(new Error("ws down")) });
    const session = new CDPSession(client, "SESSION-1");

    await expect(session.detach()).rejects.toThrow("ws down");
    expect(session.closed).toBeInstanceOf(TargetClosedError);
  });

  it("detach() is a no-op once already closed", async () => {
    const detachSession = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ detachSession });
    const session = new CDPSession(client, "SESSION-1");
    session.markClosed(new TargetClosedError("already gone"));

    await session.detach();

    expect(detachSession).not.toHaveBeenCalled();
  });

  it("releases session-owned event listeners when closed", () => {
    const unsubscribe = vi.fn();
    const client = fakeClient({ onSession: vi.fn(() => unsubscribe) });
    const session = new CDPSession(client, "SESSION-1");
    session.on("Page.loadEventFired", vi.fn());

    session.markClosed(new TargetClosedError("gone"));
    session.markClosed(new TargetClosedError("again"));

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
