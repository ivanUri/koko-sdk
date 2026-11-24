import { launchKoko, } from "../launch.js";
import { PoolAcquireTimeoutError, PoolClosedError, PoolQueueFullError, } from "./errors.js";
export { PoolAcquireTimeoutError, PoolClosedError, PoolQueueFullError } from "./errors.js";
const defaultFactory = (options) => launchKoko(options);
/**
 * Bounded process pool for Koko browsers.
 *
 * A lease owns one Browser connection until `release()` is called. The pool
 * deliberately recycles only after a lease is returned, so an in-flight page
 * is never interrupted by a maintenance policy.
 */
export class KokoPool {
    minReady;
    maxWorkers;
    maxQueue;
    maxJobs;
    maxLifetime;
    acquireTimeout;
    launchOptions;
    factory;
    workers = new Map();
    queued = [];
    inFlight = new Set();
    retiring = new Set();
    nextWorkerId = 0;
    launching = 0;
    closed = false;
    closePromise;
    constructor(options = {}) {
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
    async prewarm() {
        this.ensureOpen();
        const starts = [];
        while (this.idleCount() + this.launching < this.minReady) {
            starts.push(this.track(this.spawnWorker()));
        }
        await Promise.all(starts);
        this.pump();
    }
    /** Acquire one worker lease, waiting only within the bounded queue. */
    acquire(options = {}) {
        this.ensureOpen();
        const timeout = options.timeout ?? this.acquireTimeout;
        if (!Number.isFinite(timeout) || timeout < 0) {
            throw new RangeError("acquire timeout must be a non-negative finite number");
        }
        this.compactQueue();
        if (this.queued.length >= this.maxQueue
            && !this.findAssignableWorker()
            && this.capacityInUse() >= this.maxWorkers) {
            throw new PoolQueueFullError();
        }
        return new Promise((resolve, reject) => {
            const request = {
                resolve,
                reject,
                settled: false,
                signal: options.signal,
            };
            request.onAbort = () => {
                if (request.settled)
                    return;
                request.settled = true;
                if (request.timeout)
                    clearTimeout(request.timeout);
                reject(options.signal?.reason ?? new Error("Acquire aborted"));
            };
            if (options.signal?.aborted) {
                request.onAbort();
                return;
            }
            options.signal?.addEventListener("abort", request.onAbort, { once: true });
            if (timeout > 0) {
                request.timeout = setTimeout(() => {
                    if (request.settled)
                        return;
                    request.settled = true;
                    this.detachRequest(request);
                    options.signal?.removeEventListener("abort", request.onAbort);
                    reject(new PoolAcquireTimeoutError());
                }, timeout);
            }
            this.queued.push(request);
            this.pump();
        });
    }
    /** Snapshot of workers currently managed by the pool. */
    workersInfo() {
        return [...this.workers.values()]
            .filter((worker) => worker.state === "ready")
            .map((worker) => this.workerInfo(worker));
    }
    async close() {
        if (this.closePromise)
            return this.closePromise;
        this.closePromise = this.closeImpl();
        return this.closePromise;
    }
    async closeImpl() {
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
    pump() {
        if (this.closed)
            return;
        this.compactQueue();
        this.ensureMinReady();
        while (true) {
            const request = this.queued.find((candidate) => !candidate.settled);
            if (!request)
                break;
            const worker = this.takeIdleWorker();
            if (worker) {
                this.queued.splice(this.queued.indexOf(request), 1);
                this.assign(request, worker);
                continue;
            }
            if (this.capacityInUse() >= this.maxWorkers)
                break;
            this.queued.splice(this.queued.indexOf(request), 1);
            this.startForRequest(request);
        }
    }
    ensureMinReady() {
        while (!this.closed && this.idleCount() + this.launching < this.minReady) {
            const promise = this.track(this.spawnWorker());
            promise.catch(() => undefined).then(() => this.pump()).catch(() => undefined);
        }
    }
    startForRequest(request) {
        const promise = this.spawnWorker();
        const handled = promise.then(async (worker) => {
            if (request.settled || this.closed) {
                if (!request.settled)
                    this.settleRequest(request, new PoolClosedError());
                await this.retire(worker);
                this.pump();
                return;
            }
            this.assign(request, worker);
        }, (error) => {
            this.settleRequest(request, error);
            this.pump();
        });
        this.track(handled).catch(() => undefined);
    }
    async spawnWorker() {
        this.ensureOpen();
        const id = this.nextWorkerId++;
        this.launching++;
        try {
            const launched = await this.factory({ ...this.launchOptions }, id);
            if (this.closed) {
                await launched.close().catch(() => undefined);
                throw new PoolClosedError();
            }
            const worker = {
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
        }
        finally {
            this.launching--;
        }
    }
    assign(request, worker) {
        if (request.settled || this.closed) {
            void this.retire(worker);
            return;
        }
        worker.busy = true;
        worker.jobs++;
        this.settleRequest(request, undefined, this.createLease(worker));
    }
    createLease(worker) {
        let released = false;
        let releasePromise;
        const release = async () => {
            if (releasePromise)
                return releasePromise;
            releasePromise = (async () => {
                if (released)
                    return;
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
    shouldRecycle(worker) {
        if (worker.recycleRequested)
            return true;
        if (this.maxJobs != null && worker.jobs >= this.maxJobs)
            return true;
        if (this.maxLifetime != null && Date.now() - worker.createdAt >= this.maxLifetime)
            return true;
        return false;
    }
    expireWorker(worker) {
        if (this.closed || worker.state !== "ready")
            return;
        worker.recycleRequested = true;
        if (!worker.busy)
            void this.retire(worker);
    }
    attachProcessHealth(worker) {
        const child = worker.launched.process;
        if (!child || typeof child.on !== "function")
            return;
        const onError = (error) => {
            this.markWorkerDead(worker, error);
        };
        const onExit = (code, signal) => {
            this.markWorkerDead(worker, new Error(`Koko worker ${worker.id} exited${code == null ? "" : ` with code ${code}`}`
                + `${signal == null ? "" : ` (${signal})`}`));
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
    markWorkerDead(worker, _reason) {
        if (worker.state !== "ready")
            return;
        worker.state = "dead";
        worker.detachProcessListeners?.();
        worker.detachProcessListeners = undefined;
        this.workers.delete(worker.id);
        // The process is already unusable. Close the CDP/browser wrapper now so a
        // busy lease cannot pin a dead worker forever; the user's next acquire is
        // served by a replacement once this cleanup completes.
        void this.retire(worker).catch(() => undefined);
    }
    takeIdleWorker() {
        for (const worker of this.workers.values()) {
            if (worker.state !== "ready" || worker.busy)
                continue;
            if (this.shouldRecycle(worker)) {
                void this.retire(worker);
                continue;
            }
            return worker;
        }
        return undefined;
    }
    async retire(worker) {
        if (worker.closePromise)
            return worker.closePromise;
        worker.state = "closing";
        if (worker.lifetimeTimer)
            clearTimeout(worker.lifetimeTimer);
        worker.detachProcessListeners?.();
        worker.detachProcessListeners = undefined;
        this.workers.delete(worker.id);
        const closePromise = worker.launched.close().catch(() => undefined);
        worker.closePromise = closePromise;
        this.retiring.add(closePromise);
        closePromise.finally(() => this.retiring.delete(closePromise)).catch(() => undefined);
        await closePromise;
        if (!this.closed)
            this.pump();
    }
    findAssignableWorker() {
        return [...this.workers.values()].find((worker) => worker.state === "ready" && !worker.busy && !this.shouldRecycle(worker));
    }
    idleCount() {
        return [...this.workers.values()].filter((worker) => worker.state === "ready" && !worker.busy).length;
    }
    capacityInUse() {
        return this.workers.size + this.launching + this.retiring.size;
    }
    compactQueue() {
        for (let index = this.queued.length - 1; index >= 0; index--) {
            if (this.queued[index].settled)
                this.queued.splice(index, 1);
        }
    }
    detachRequest(request) {
        const index = this.queued.indexOf(request);
        if (index >= 0)
            this.queued.splice(index, 1);
    }
    settleRequest(request, error, lease) {
        if (request.settled)
            return;
        request.settled = true;
        if (request.timeout)
            clearTimeout(request.timeout);
        request.signal?.removeEventListener("abort", request.onAbort);
        if (error !== undefined)
            request.reject(error);
        else if (lease)
            request.resolve(lease);
    }
    workerInfo(worker) {
        return {
            id: worker.id,
            createdAt: worker.createdAt,
            jobs: worker.jobs,
            busy: worker.busy,
        };
    }
    track(promise) {
        this.inFlight.add(promise);
        promise.then(() => this.inFlight.delete(promise), () => this.inFlight.delete(promise));
        return promise;
    }
    ensureOpen() {
        if (this.closed)
            throw new PoolClosedError();
    }
}
export { KokoPool as BrowserPool };
function positiveInteger(value, name, allowZero) {
    if (!Number.isInteger(value) || (allowZero ? value < 0 : value <= 0)) {
        throw new RangeError(`${name} must be an ${allowZero ? "non-negative" : "positive"} integer`);
    }
    return value;
}
function positiveIntegerOrUndefined(value, name) {
    if (value == null)
        return undefined;
    return positiveInteger(value, name, false);
}
function nonNegativeInteger(value, name) {
    return positiveInteger(value, name, true);
}
//# sourceMappingURL=pool.js.map