import type { CDPSession } from "../cdp/session.js";
import { Request, Response } from "./request.js";
/**
 * Matcher for `waitForRequest`/`waitForResponse`. A string is matched with
 * glob semantics (`*` and `**` wildcards); a RegExp tests the full URL; a
 * predicate receives the Request/Response.
 */
export type UrlMatch<T> = string | RegExp | ((value: T) => boolean | Promise<boolean>);
export interface WaitForNetworkOptions {
    timeout?: number;
}
/** Network domain events emitted by the tracker (Playwright-compatible names). */
export interface NetworkEventMap {
    request: Request;
    response: Response;
    requestfailed: Request;
    requestfinished: Request;
}
/**
 * Tracks the CDP Network domain: exposes an idle barrier, a live request map,
 * Playwright-style Request/Response objects, and request/response events.
 * Enabling is lazy — the domain is only turned on when something needs it.
 */
export declare class NetworkTracker {
    private readonly session;
    readonly requests: Map<string, Request>;
    readonly inflight: Set<string>;
    private cleanup;
    private readonly idleListeners;
    private readonly bus;
    private maxRequests;
    private enabled;
    private enabling?;
    constructor(session: CDPSession);
    setMaxRequests(max: number): void;
    on<K extends keyof NetworkEventMap>(event: K, handler: (payload: NetworkEventMap[K]) => void): () => void;
    off<K extends keyof NetworkEventMap>(event: K, handler: (payload: NetworkEventMap[K]) => void): void;
    private notify;
    /** Enable CDP Network domain and start tracking requests (idempotent). */
    enable(): Promise<void>;
    /** Lazily enable Network — avoids velora SIGTRAP on simple multi-page goto. */
    ensureEnabled(): Promise<void>;
    private doEnable;
    dispose(): void;
    /** Clear tracked requests (e.g. at navigation start). */
    reset(): void;
    waitForIdle(options?: {
        idleMs?: number;
        timeout?: number;
    }): Promise<void>;
    private waitForIdleAfterEnabled;
    /**
     * Resolve with the first request whose URL matches. Subscribes before
     * returning, so a request already in flight when called still counts only if
     * it has not yet been sent; prefer calling this before the triggering action.
     */
    waitForRequest(match: UrlMatch<Request>, options?: WaitForNetworkOptions): Promise<Request>;
    /** Resolve with the first response whose URL (or whose request) matches. */
    waitForResponse(match: UrlMatch<Response>, options?: WaitForNetworkOptions): Promise<Response>;
    private waitForNetworkEvent;
    private onRequest;
    private onResponse;
    private onDone;
    private onFailed;
    private pruneCompleted;
}
