import { Browser } from "../browser.js";
import { type KokoLaunchOptions, type LaunchedKoko } from "../launch.js";
export { PoolAcquireTimeoutError, PoolClosedError, PoolQueueFullError } from "./errors.js";
export type KokoPoolFactory = (options: KokoLaunchOptions, workerId: number) => Promise<LaunchedKoko>;
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
/**
 * Bounded process pool for Koko browsers.
 *
 * A lease owns one Browser connection until `release()` is called. The pool
 * deliberately recycles only after a lease is returned, so an in-flight page
 * is never interrupted by a maintenance policy.
 */
export declare class KokoPool {
    readonly minReady: number;
    readonly maxWorkers: number;
    readonly maxQueue: number;
    readonly maxJobs?: number;
    readonly maxLifetime?: number;
    readonly acquireTimeout: number;
    private readonly launchOptions;
    private readonly factory;
    private readonly workers;
    private readonly queued;
    private readonly inFlight;
    private readonly retiring;
    private nextWorkerId;
    private launching;
    private closed;
    private closePromise?;
    constructor(options?: KokoPoolOptions);
    /** Start enough idle workers to satisfy `minReady`. */
    prewarm(): Promise<void>;
    /** Acquire one worker lease, waiting only within the bounded queue. */
    acquire(options?: AcquireOptions): Promise<KokoPoolLease>;
    /** Snapshot of workers currently managed by the pool. */
    workersInfo(): KokoPoolWorkerInfo[];
    close(): Promise<void>;
    private closeImpl;
    private pump;
    private ensureMinReady;
    private startForRequest;
    private spawnWorker;
    private assign;
    private createLease;
    private shouldRecycle;
    private expireWorker;
    private attachProcessHealth;
    private markWorkerDead;
    private takeIdleWorker;
    private retire;
    private findAssignableWorker;
    private idleCount;
    private capacityInUse;
    private compactQueue;
    private detachRequest;
    private settleRequest;
    private workerInfo;
    private track;
    private ensureOpen;
}
export { KokoPool as BrowserPool };
