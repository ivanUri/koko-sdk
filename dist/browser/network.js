import { EventBus } from "../cdp/events.js";
import { withTimeout } from "../utils/timeout.js";
import { Request, Response } from "./request.js";
const DEFAULT_MAX_REQUESTS = 2048;
/**
 * Tracks the CDP Network domain: exposes an idle barrier, a live request map,
 * Playwright-style Request/Response objects, and request/response events.
 * Enabling is lazy — the domain is only turned on when something needs it.
 */
export class NetworkTracker {
    session;
    requests = new Map();
    inflight = new Set();
    cleanup = [];
    idleListeners = new Set();
    bus = new EventBus();
    maxRequests = DEFAULT_MAX_REQUESTS;
    enabled = false;
    enabling;
    constructor(session) {
        this.session = session;
    }
    setMaxRequests(max) {
        this.maxRequests = Math.max(64, max);
        this.pruneCompleted();
    }
    on(event, handler) {
        // Subscribing implies wanting the events; enable in the background.
        void this.ensureEnabled();
        return this.bus.on(event, handler);
    }
    off(event, handler) {
        this.bus.off(event, handler);
    }
    notify() {
        for (const listener of this.idleListeners)
            listener();
    }
    /** Enable CDP Network domain and start tracking requests (idempotent). */
    async enable() {
        return this.ensureEnabled();
    }
    /** Lazily enable Network — avoids koko SIGTRAP on simple multi-page goto. */
    async ensureEnabled() {
        if (this.enabled)
            return;
        if (this.enabling)
            return this.enabling;
        this.enabling = this.doEnable();
        try {
            await this.enabling;
        }
        finally {
            this.enabling = undefined;
        }
    }
    async doEnable() {
        if (this.enabled)
            return;
        this.cleanup.push(this.session.on("Network.requestWillBeSent", (event) => this.onRequest(event)), this.session.on("Network.responseReceived", (event) => this.onResponse(event)), this.session.on("Network.loadingFinished", (event) => this.onDone(event.requestId)), this.session.on("Network.loadingFailed", (event) => this.onFailed(event)));
        await this.session.send("Network.enable").catch(() => undefined);
        this.enabled = true;
    }
    dispose() {
        for (const off of this.cleanup)
            off();
        this.cleanup = [];
        this.bus.removeAll();
        this.reset();
    }
    /** Clear tracked requests (e.g. at navigation start). */
    reset() {
        this.requests.clear();
        this.inflight.clear();
    }
    waitForIdle(options = {}) {
        return this.ensureEnabled().then(() => this.waitForIdleAfterEnabled(options));
    }
    waitForIdleAfterEnabled(options = {}) {
        const idleMs = options.idleMs ?? 500;
        let cleanup = () => undefined;
        const promise = new Promise((resolve) => {
            let timer;
            const finish = () => {
                this.idleListeners.delete(listener);
                if (timer)
                    clearTimeout(timer);
                resolve();
            };
            const listener = () => {
                if (this.inflight.size === 0) {
                    if (!timer)
                        timer = setTimeout(finish, idleMs);
                }
                else if (timer) {
                    clearTimeout(timer);
                    timer = undefined;
                }
            };
            this.idleListeners.add(listener);
            cleanup = () => {
                this.idleListeners.delete(listener);
                if (timer)
                    clearTimeout(timer);
            };
            listener();
        });
        return withTimeout(promise, {
            timeout: options.timeout,
            signal: options.signal,
            label: "Waiting for network idle",
        })
            .finally(cleanup);
    }
    /**
     * Resolve with the first request whose URL matches. Subscribes before
     * returning, so a request already in flight when called still counts only if
     * it has not yet been sent; prefer calling this before the triggering action.
     */
    waitForRequest(match, options = {}) {
        return this.waitForNetworkEvent("request", match, options, "Waiting for request");
    }
    /** Resolve with the first response whose URL (or whose request) matches. */
    waitForResponse(match, options = {}) {
        return this.waitForNetworkEvent("response", match, options, "Waiting for response");
    }
    waitForNetworkEvent(event, match, options, label) {
        const predicate = compileMatch(match);
        let off = () => undefined;
        const promise = new Promise((resolve, reject) => {
            off = this.on(event, (payload) => {
                const value = payload;
                Promise.resolve(predicate(value)).then((ok) => {
                    if (!ok)
                        return;
                    off();
                    resolve(value);
                }, (error) => {
                    off();
                    reject(error);
                });
            });
        });
        return withTimeout(promise, {
            timeout: options.timeout ?? 30_000,
            signal: options.signal,
            label,
        }).finally(() => off());
    }
    onRequest(event) {
        const previous = this.requests.get(event.requestId);
        const request = new Request(event.requestId, event.request?.url ?? "", event.request?.method ?? "GET", normalizeHeaders(event.request?.headers), (event.type ?? "Other"), event.request?.postData, event.timestamp);
        // A redirect reuses the requestId; the CDP event carries the prior response.
        if (previous)
            request._redirectedFrom = previous;
        this.requests.set(event.requestId, request);
        this.inflight.add(event.requestId);
        this.pruneCompleted();
        this.bus.emit("request", request);
        this.notify();
    }
    onResponse(event) {
        const request = this.requests.get(event.requestId);
        if (!request)
            return;
        const raw = event.response ?? {};
        const response = new Response(this.session, request, raw.url ?? request.url(), raw.status ?? 0, raw.statusText ?? "", normalizeHeaders(raw.headers), raw.mimeType ?? "", Boolean(raw.fromDiskCache || raw.fromPrefetchCache));
        request._response = response;
        this.bus.emit("response", response);
    }
    onDone(requestId) {
        const request = this.requests.get(requestId);
        this.inflight.delete(requestId);
        this.pruneCompleted();
        if (request)
            this.bus.emit("requestfinished", request);
        this.notify();
    }
    onFailed(event) {
        const request = this.requests.get(event.requestId);
        if (request) {
            request._failure = { errorText: event.errorText ?? "net::ERR_FAILED", canceled: event.canceled };
        }
        this.inflight.delete(event.requestId);
        this.pruneCompleted();
        if (request)
            this.bus.emit("requestfailed", request);
        this.notify();
    }
    pruneCompleted() {
        if (this.requests.size <= this.maxRequests)
            return;
        for (const [id, req] of this.requests) {
            if (this.inflight.has(id))
                continue;
            void req;
            this.requests.delete(id);
            if (this.requests.size <= this.maxRequests)
                break;
        }
    }
}
function normalizeHeaders(headers) {
    if (!headers || typeof headers !== "object")
        return {};
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        out[key.toLowerCase()] = String(value);
    }
    return out;
}
/** Compile a UrlMatch into a predicate over the Request/Response. */
function compileMatch(match) {
    if (typeof match === "function")
        return match;
    if (match instanceof RegExp)
        return (value) => match.test(value.url());
    const regex = globToRegExp(match);
    return (value) => regex.test(value.url());
}
/** Glob (`*` single-segment-ish, `**` any) → RegExp, anchored to the full URL. */
function globToRegExp(glob) {
    let out = "";
    for (let i = 0; i < glob.length; i += 1) {
        const ch = glob[i];
        if (ch === "*") {
            if (glob[i + 1] === "*") {
                out += ".*";
                i += 1;
            }
            else {
                out += "[^/]*";
            }
        }
        else if ("\\^$+?.()|[]{}".includes(ch)) {
            out += `\\${ch}`;
        }
        else {
            out += ch;
        }
    }
    return new RegExp(`^${out}$`);
}
//# sourceMappingURL=network.js.map