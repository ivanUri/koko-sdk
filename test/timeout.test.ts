import { describe, expect, it } from "vitest";
import { delay, withTimeout } from "../src/utils/timeout.js";
import { AbortError, TimeoutError } from "../src/cdp/errors.js";

describe("withTimeout", () => {
  it("resolves with the wrapped value when it settles first", async () => {
    const result = await withTimeout(delay(5).then(() => "done"), { timeout: 1000 });
    expect(result).toBe("done");
  });

  it("rejects with TimeoutError once the timeout elapses", async () => {
    const never = new Promise(() => {});
    await expect(withTimeout(never, { timeout: 10, label: "waiting for x" })).rejects.toThrow(TimeoutError);
    await expect(withTimeout(never, { timeout: 10, label: "waiting for x" })).rejects.toThrow("waiting for x");
  });

  it("passes through untouched when timeout <= 0", async () => {
    const result = await withTimeout(Promise.resolve("no-race"), { timeout: 0 });
    expect(result).toBe("no-race");
  });

  it("propagates the wrapped promise's rejection (not a timeout)", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), { timeout: 1000 })).rejects.toThrow("boom");
  });

  it("rejects with AbortError and removes the abort listener", async () => {
    const controller = new AbortController();
    const pending = withTimeout(new Promise(() => {}), {
      timeout: 1000,
      signal: controller.signal,
      label: "cancel me",
    });
    controller.abort();
    await expect(pending).rejects.toThrow(AbortError);
  });

  it("exposes stable error metadata", () => {
    const error = new TimeoutError("timed out", { operation: "navigation" });
    expect(error.code).toBe("TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(error.operation).toBe("navigation");
  });
});

describe("delay", () => {
  it("resolves after roughly the requested duration", async () => {
    const start = Date.now();
    await delay(15);
    expect(Date.now() - start).toBeGreaterThanOrEqual(10);
  });
});
