import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import type { Browser } from "../../src/browser/browser.js";
import type { LaunchedKoko } from "../../src/browser/launch.js";
import {
  BrowserPool,
  KokoPool,
  PoolAcquireTimeoutError,
  PoolClosedError,
  PoolQueueFullError,
} from "../../src/browser/pool/pool.js";

function fakeFactory() {
  let next = 0;
  const closes: number[] = [];
  const factory = vi.fn(async (_options, workerId: number) => {
    const id = next++;
    const launched = {
      browser: { id } as unknown as Browser,
      endpoint: `http://fake/${id}`,
      port: id + 1,
      binary: "fake-koko",
      dataRoot: "fake-root",
      installSource: "test",
      args: [],
      process: {} as ChildProcess,
      close: vi.fn(async () => {
        closes.push(workerId);
      }),
    } as unknown as LaunchedKoko;
    return launched;
  });
  return { factory, closes };
}

describe("KokoPool", () => {
  it("prewarms minReady workers and reuses an idle worker", async () => {
    const fake = fakeFactory();
    const pool = new KokoPool({ factory: fake.factory, minReady: 2, maxWorkers: 2 });

    await pool.prewarm();
    expect(fake.factory).toHaveBeenCalledTimes(2);
    const lease = await pool.acquire();
    expect(lease.worker.id).toBe(0);
    expect(fake.factory).toHaveBeenCalledTimes(2);
    await lease.release();
    await pool.close();
    expect(fake.closes).toHaveLength(2);
  });

  it("rejects when the bounded queue is full", async () => {
    const fake = fakeFactory();
    const pool = new KokoPool({ factory: fake.factory, maxWorkers: 1, maxQueue: 1 });
    const first = await pool.acquire();
    const queued = pool.acquire();

    expect(() => pool.acquire()).toThrow(PoolQueueFullError);
    await first.release();
    const second = await queued;
    await second.release();
    await pool.close();
  });

  it("allows direct acquisition with a zero-length queue", async () => {
    const fake = fakeFactory();
    const pool = new KokoPool({ factory: fake.factory, maxWorkers: 1, maxQueue: 0 });
    const lease = await pool.acquire();
    expect(() => pool.acquire()).toThrow(PoolQueueFullError);
    await lease.release();
    await pool.close();
  });

  it("recycles after maxJobs and starts a replacement", async () => {
    const fake = fakeFactory();
    const pool = new KokoPool({ factory: fake.factory, maxWorkers: 1, maxJobs: 1 });
    const first = await pool.acquire();
    await first.release();

    const second = await pool.acquire();
    expect(fake.factory).toHaveBeenCalledTimes(2);
    expect(second.worker.id).toBe(1);
    await second.release();
    await pool.close();
  });

  it("supports explicit idempotent recycle and close", async () => {
    const fake = fakeFactory();
    const pool: KokoPool = new BrowserPool({ factory: fake.factory, maxWorkers: 1 });
    const lease = await pool.acquire();
    await Promise.all([lease.recycle(), lease.release()]);
    expect(fake.closes).toEqual([0]);
    await Promise.all([pool.close(), pool.close()]);
    expect(() => pool.acquire()).toThrow(PoolClosedError);
  });

  it("times out a queued acquire", async () => {
    const fake = fakeFactory();
    const pool = new KokoPool({ factory: fake.factory, maxWorkers: 1 });
    const first = await pool.acquire();
    await expect(pool.acquire({ timeout: 5 })).rejects.toBeInstanceOf(PoolAcquireTimeoutError);
    await first.release();
    await pool.close();
  });

  it("closes a worker that finishes launching during pool close", async () => {
    let finishLaunch!: (value: LaunchedKoko) => void;
    const launched = {
      browser: {} as Browser,
      endpoint: "http://fake/launching",
      port: 1,
      binary: "fake-koko",
      dataRoot: "fake-root",
      installSource: "test",
      args: [],
      process: {} as ChildProcess,
      close: vi.fn(async () => undefined),
    } as unknown as LaunchedKoko;
    const factory = vi.fn(() => new Promise<LaunchedKoko>((resolve) => {
      finishLaunch = resolve;
    }));
    const pool = new KokoPool({ factory, maxWorkers: 1 });
    const acquire = pool.acquire();
    const closing = pool.close();
    finishLaunch(launched);

    await expect(acquire).rejects.toBeInstanceOf(PoolClosedError);
    await closing;
    expect(launched.close).toHaveBeenCalledTimes(1);
  });

  it("detects a dead child process and replaces the worker", async () => {
    let child: EventEmitter | undefined;
    let next = 0;
    const factory = vi.fn(async () => {
      const id = next++;
      child = new EventEmitter();
      return {
        browser: { id } as unknown as Browser,
        endpoint: `http://fake/${id}`,
        port: id + 1,
        binary: "fake-koko",
        dataRoot: "fake-root",
        installSource: "test",
        args: [],
        process: child as unknown as ChildProcess,
        close: vi.fn(async () => undefined),
      } as unknown as LaunchedKoko;
    });
    const pool = new KokoPool({ factory, maxWorkers: 1 });
    const first = await pool.acquire();

    child!.emit("exit", 1, null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const replacement = await pool.acquire();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(replacement.worker.id).toBe(1);
    await first.release();
    await replacement.release();
    await pool.close();
  });

  it("recycles an idle worker when maxLifetime expires", async () => {
    const fake = fakeFactory();
    const pool = new KokoPool({ factory: fake.factory, maxWorkers: 1, maxLifetime: 5 });
    const first = await pool.acquire();
    await first.release();
    await new Promise((resolve) => setTimeout(resolve, 15));

    const replacement = await pool.acquire();
    expect(fake.factory).toHaveBeenCalledTimes(2);
    expect(replacement.worker.id).toBe(1);
    await replacement.release();
    await pool.close();
  });
});
