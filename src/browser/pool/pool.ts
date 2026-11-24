import { Browser } from "../browser.js";
import {
  launchKoko,
  type KokoLaunchOptions,
  type LaunchedKoko,
} from "../launch.js";
import {
  PoolAcquireTimeoutError,
  PoolClosedError,
  PoolQueueFullError,
} from "./errors.js";

export { PoolAcquireTimeoutError, PoolClosedError, PoolQueueFullError } from "./errors.js";

export type KokoPoolFactory = (
  options: KokoLaunchOptions,
  workerId: number,
) => Promise<LaunchedKoko>;

export interface KokoPoolOptions {
  /** Options passed to each `launchKoko` invocation. */
  launch?: KokoLaunchOptions;
  /** Injectable launcher for tests or an application-specific worker supervisor. */
  factory?: KokoPoolFactory;
  /** Number of idle workers to maintain after `prewarm()` or an acquire. */
  minReady?: number;
  /** Maximum number of active or starting workers. */
  maxWorkers?: number;
  /** Maximum number of queued acquire requests. Defaults to `maxWorkers * 2`. */
  maxQueue?: number;
  /** Recycle a worker after this many completed leases. */
  maxJobs?: number;
  /** Recycle a worker after this lifetime in milliseconds; busy workers retire on release. */
  maxLifetime?: number;
  /** Default timeout for queued acquire requests. `0` disables the timeout. */
  acquireTimeout?: number;
}

export interface AcquireOptions {
  timeout?: number;
  signal?: AbortSignal;
}

export interface KokoPoolWorkerInfo {
  readonly id: number;
  readonly createdAt: number;
  readonly jobs: number;
  readonly busy: boolean;
}

export interface KokoPoolLease {
  readonly worker: KokoPoolWorkerInfo;
  readonly browser: Browser;
  readonly launched: LaunchedKoko;
  /** Return the worker to the pool. Safe to call more than once. */
  release(): Promise<void>;
  /** Recycle the worker after this lease is returned. Safe to call more than once. */
  recycle(): Promise<void>;
}

interface Worker {
  id: number;
  launched: LaunchedKoko;
  createdAt: number;
  jobs: number;
  busy: boolean;
  recycleRequested: boolean;
  state: "ready" | "dead" | "closing";
  closePromise?: Promise<void>;
  lifetimeTimer?: ReturnType<typeof setTimeout>;
  detachProcessListeners?: () => void;
}

interface AcquireRequest {
  resolve: (lease: KokoPoolLease) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  timeout?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
}

const defaultFactory: KokoPoolFactory = (options) => launchKoko(options);

/**
 * Bounded process pool for Koko browsers.
 *
 * A lease owns one Browser connection until `release()` is called. The pool
 * deliberately recycles only after a lease is returned, so an in-flight page
 * is never interrupted by a maintenance policy.
 */
export class KokoPool {
  readonly minReady: number;
  readonly maxWorkers: number;
  readonly maxQueue: number;
  readonly maxJobs?: number;
  readonly maxLifetime?: number;
  readonly acquireTimeout: number;

  private readonly launchOptions: KokoLaunchOptions;
  private readonly factory: KokoPoolFactory;
  private readonly workers = new Map<number, Worker>();
  private readonly queued: AcquireRequest[] = [];
  private readonly inFlight = new Set<Promise<unknown>>();
  private readonly retiring = new Set<Promise<void>>();
  private nextWorkerId = 0;
  private launching = 0;
  private closed = false;
  private closePromise?: Promise<void>;

  constructor(options: KokoPoolOptions = {}) {
    this.launchOptions = { ...(options.launch ?? {}) };
    this.factory = options.factory ?? defaultFactory;
    this.minReady = positiveInteger(options.minReady ?? 0, "minReady", true);
    this.maxWorkers = positiveInteger(options.maxWorkers ?? 1, "maxWorkers", false);
    this.maxQueue = nonNegativeInteger(options.maxQueue ?? this.maxWorkers * 2, "maxQueue");
    this.maxJobs = positiveIntegerOrUndefined(options.maxJobs, "maxJobs");
    this.maxLifetime = positiveIntegerOrUndefined(options.maxLifetime, "maxLifetime");
    this.acquireTimeout = nonNegativeInteger(options.acquireTimeout ?? 0, "acquireTimeout");

    if (this.minReady > this.maxWorkers) {
      throw new RangeError("minReady cannot exceed maxWorkers");
    }
  }

  /** Start enough idle workers to satisfy `minReady`. */
  async prewarm(): Promise<void> {
    this.ensureOpen();
    const starts: Promise<Worker>[] = [];
    while (this.idleCount() + this.launching < this.minReady) {
      starts.push(this.track(this.spawnWorker()));
    }
    await Promise.all(starts);
    this.pump();
  }

  /** Acquire one worker lease, waiting only within the bounded queue. */
  acquire(options: AcquireOptions = {}): Promise<KokoPoolLease> {
    this.ensureOpen();

    const timeout = options.timeout ?? this.acquireTimeout;
    if (!Number.isFinite(timeout) || timeout < 0) {
      throw new RangeError("acquire timeout must be a non-negative finite number");
    }

    this.compactQueue();
    if (
      this.queued.length >= this.maxQueue
      && !this.findAssignableWorker()
      && this.capacityInUse() >= this.maxWorkers
    ) {
      throw new PoolQueueFullError();
    }

    return new Promise<KokoPoolLease>((resolve, reject) => {
      const request: AcquireRequest = {
        resolve,
        reject,
        settled: false,
        signal: options.signal,
      };
      request.onAbort = () => {
        if (request.settled) return;
        request.settled = true;
        if (request.timeout) clearTimeout(request.timeout);
        reject(options.signal?.reason ?? new Error("Acquire aborted"));
      };
      if (options.signal?.aborted) {
        request.onAbort();
        return;
      }
      options.signal?.addEventListener("abort", request.onAbort, { once: true });
      if (timeout > 0) {
        request.timeout = setTimeout(() => {
          if (request.settled) return;
          request.settled = true;
          this.detachRequest(request);
          options.signal?.removeEventListener("abort", request.onAbort!);
          reject(new PoolAcquireTimeoutError());
        }, timeout);
      }
      this.queued.push(request);
      this.pump();
    });
  }

  /** Snapshot of workers currently managed by the pool. */
  workersInfo(): KokoPoolWorkerInfo[] {
    return [...this.workers.values()]
      .filter((worker) => worker.state === "ready")
      .map((worker) => this.workerInfo(worker));
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = this.closeImpl();
    return this.closePromise;
  }

  private async closeImpl(): Promise<void> {
    this.closed = true;
    const error = new PoolClosedError();
    for (const request of this.queued.splice(0)) {
      this.settleRequest(request, error);
    }

    await Promise.allSettled([...this.inFlight]);
    const workers = [...this.workers.values()];
    await Promise.allSettled(workers.map((worker) => this.retire(worker)));
    await Promise.allSettled([...this.retiring]);
  }

  private pump(): void {
    if (this.closed) return;
    this.compactQueue();
    this.ensureMinReady();

    while (true) {
      const request = this.queued.find((candidate) => !candidate.settled);
      if (!request) break;
      const worker = this.takeIdleWorker();
      if (worker) {
        this.queued.splice(this.queued.indexOf(request), 1);
        this.assign(request, worker);
        continue;
      }
      if (this.capacityInUse() >= this.maxWorkers) break;
      this.queued.splice(this.queued.indexOf(request), 1);
      this.startForRequest(request);
    }
  }

  private ensureMinReady(): void {
    while (!this.closed && this.idleCount() + this.launching < this.minReady) {
      const promise = this.track(this.spawnWorker());
      promise.catch(() => undefined).then(() => this.pump()).catch(() => undefined);
    }
  }

  private startForRequest(request: AcquireRequest): void {
    const promise = this.spawnWorker();
    const handled = promise.then(
      async (worker) => {
        if (request.settled || this.closed) {
          if (!request.settled) this.settleRequest(request, new PoolClosedError());
          await this.retire(worker);
          this.pump();
          return;
        }
        this.assign(request, worker);
      },
      (error) => {
        this.settleRequest(request, error);
        this.pump();
      },
    );
    this.track(handled).catch(() => undefined);
  }

  private async spawnWorker(): Promise<Worker> {
    this.ensureOpen();
    const id = this.nextWorkerId++;
    this.launching++;
    try {
      const launched = await this.factory({ ...this.launchOptions }, id);
      if (this.closed) {
        await launched.close().catch(() => undefined);
        throw new PoolClosedError();
      }
      const worker: Worker = {
        id,
        launched,
        createdAt: Date.now(),
        jobs: 0,
        busy: false,
        recycleRequested: false,
        state: "ready",
      };
      this.workers.set(id, worker);
      this.attachProcessHealth(worker);
      if (this.maxLifetime != null) {
        worker.lifetimeTimer = setTimeout(() => this.expireWorker(worker), this.maxLifetime);
      }
      if (worker.state !== "ready") {
        await worker.closePromise;
        throw new Error(`Koko worker ${id} exited before it became ready`);
      }
      return worker;
    } finally {
      this.launching--;
    }
  }

  private assign(request: AcquireRequest, worker: Worker): void {
    if (request.settled || this.closed) {
      void this.retire(worker);
      return;
    }
    worker.busy = true;
    worker.jobs++;
    this.settleRequest(request, undefined, this.createLease(worker));
  }

  private createLease(worker: Worker): KokoPoolLease {
    let released = false;
    let releasePromise: Promise<void> | undefined;

    const release = async (): Promise<void> => {
      if (releasePromise) return releasePromise;
      releasePromise = (async () => {
        if (released) return;
        released = true;
        worker.busy = false;
        if (worker.recycleRequested || this.shouldRecycle(worker) || this.closed) {
          await this.retire(worker);
        }
        this.pump();
      })();
      return releasePromise;
    };

    return {
      worker: this.workerInfo(worker),
      browser: worker.launched.browser,
      launched: worker.launched,
      release,
      recycle: async () => {
        worker.recycleRequested = true;
        return release();
      },
    };
  }

  private shouldRecycle(worker: Worker): boolean {
    if (worker.recycleRequested) return true;
    if (this.maxJobs != null && worker.jobs >= this.maxJobs) return true;
    if (this.maxLifetime != null && Date.now() - worker.createdAt >= this.maxLifetime) return true;
    return false;
  }

  private expireWorker(worker: Worker): void {
    if (this.closed || worker.state !== "ready") return;
    worker.recycleRequested = true;
    if (!worker.busy) void this.retire(worker);
  }

  private attachProcessHealth(worker: Worker): void {
    const child = worker.launched.process;
    if (!child || typeof child.on !== "function") return;

    const onError = (error: Error): void => {
      this.markWorkerDead(worker, error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      this.markWorkerDead(worker, new Error(
        `Koko worker ${worker.id} exited${code == null ? "" : ` with code ${code}`}`
          + `${signal == null ? "" : ` (${signal})`}`,
      ));
    };
    child.on("error", onError);
    child.on("exit", onExit);
    worker.detachProcessListeners = () => {
      child.off("error", onError);
      child.off("exit", onExit);
    };
    if (child.exitCode != null || child.signalCode != null) {
      this.markWorkerDead(worker, new Error(`Koko worker ${worker.id} was already exited`));
    }
  }

  private markWorkerDead(worker: Worker, _reason: unknown): void {
    if (worker.state !== "ready") return;
    worker.state = "dead";
    worker.detachProcessListeners?.();
    worker.detachProcessListeners = undefined;
    this.workers.delete(worker.id);
    // The process is already unusable. Close the CDP/browser wrapper now so a
    // busy lease cannot pin a dead worker forever; the user's next acquire is
    // served by a replacement once this cleanup completes.
    void this.retire(worker).catch(() => undefined);
  }

  private takeIdleWorker(): Worker | undefined {
    for (const worker of this.workers.values()) {
      if (worker.state !== "ready" || worker.busy) continue;
      if (this.shouldRecycle(worker)) {
        void this.retire(worker);
        continue;
      }
      return worker;
    }
    return undefined;
  }

  private async retire(worker: Worker): Promise<void> {
    if (worker.closePromise) return worker.closePromise;
    worker.state = "closing";
    if (worker.lifetimeTimer) clearTimeout(worker.lifetimeTimer);
    worker.detachProcessListeners?.();
    worker.detachProcessListeners = undefined;
    this.workers.delete(worker.id);
    const closePromise = worker.launched.close().catch(() => undefined);
    worker.closePromise = closePromise;
    this.retiring.add(closePromise);
    closePromise.finally(() => this.retiring.delete(closePromise)).catch(() => undefined);
    await closePromise;
    if (!this.closed) this.pump();
  }

  private findAssignableWorker(): Worker | undefined {
    return [...this.workers.values()].find((worker) =>
      worker.state === "ready" && !worker.busy && !this.shouldRecycle(worker));
  }

  private idleCount(): number {
    return [...this.workers.values()].filter((worker) => worker.state === "ready" && !worker.busy).length;
  }

  private capacityInUse(): number {
    return this.workers.size + this.launching + this.retiring.size;
  }

  private compactQueue(): void {
    for (let index = this.queued.length - 1; index >= 0; index--) {
      if (this.queued[index].settled) this.queued.splice(index, 1);
    }
  }

  private detachRequest(request: AcquireRequest): void {
    const index = this.queued.indexOf(request);
    if (index >= 0) this.queued.splice(index, 1);
  }

  private settleRequest(
    request: AcquireRequest,
    error?: unknown,
    lease?: KokoPoolLease,
  ): void {
    if (request.settled) return;
    request.settled = true;
    if (request.timeout) clearTimeout(request.timeout);
    request.signal?.removeEventListener("abort", request.onAbort!);
    if (error !== undefined) request.reject(error);
    else if (lease) request.resolve(lease);
  }

  private workerInfo(worker: Worker): KokoPoolWorkerInfo {
    return {
      id: worker.id,
      createdAt: worker.createdAt,
      jobs: worker.jobs,
      busy: worker.busy,
    };
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.inFlight.add(promise);
    promise.then(
      () => this.inFlight.delete(promise),
      () => this.inFlight.delete(promise),
    );
    return promise;
  }

  private ensureOpen(): void {
    if (this.closed) throw new PoolClosedError();
  }
}

export { KokoPool as BrowserPool };

function positiveInteger(value: number, name: string, allowZero: boolean): number {
  if (!Number.isInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(`${name} must be an ${allowZero ? "non-negative" : "positive"} integer`);
  }
  return value;
}

function positiveIntegerOrUndefined(value: number | undefined, name: string): number | undefined {
  if (value == null) return undefined;
  return positiveInteger(value, name, false);
}

function nonNegativeInteger(value: number, name: string): number {
  return positiveInteger(value, name, true);
}
