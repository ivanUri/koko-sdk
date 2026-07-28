import type { CDPSession } from "../cdp/session.js";
/** CDP resource types surfaced on requests (`Network.ResourceType`). */
export type ResourceType = "Document" | "Stylesheet" | "Image" | "Media" | "Font" | "Script" | "TextTrack" | "XHR" | "Fetch" | "Prefetch" | "EventSource" | "WebSocket" | "Manifest" | "SignedExchange" | "Ping" | "CSPViolationReport" | "Preflight" | "Other";
export interface RequestFailure {
    errorText: string;
    canceled?: boolean;
}
/**
 * A network request observed on the page, modelled after Playwright's
 * `Request`. Built by `NetworkTracker` from `Network.requestWillBeSent`;
 * mutated in place as the response and completion events arrive.
 */
export declare class Request {
    readonly requestId: string;
    private readonly _url;
    private readonly _method;
    private readonly _headers;
    private readonly _resourceType;
    private readonly _postData;
    private readonly _timestamp;
    /** @internal */
    _response?: Response;
    /** @internal */
    _failure?: RequestFailure;
    /** @internal */
    _redirectedFrom?: Request;
    constructor(requestId: string, _url: string, _method: string, _headers: Record<string, string>, _resourceType: ResourceType, _postData: string | undefined, _timestamp: number | undefined);
    url(): string;
    method(): string;
    headers(): Record<string, string>;
    resourceType(): ResourceType;
    postData(): string | undefined;
    /** Monotonic CDP timestamp (seconds) when the request was sent, if known. */
    timestamp(): number | undefined;
    /** True for the top-level document navigation request. */
    isNavigationRequest(): boolean;
    /** The response, once `Network.responseReceived` has arrived. */
    response(): Response | null;
    /** Failure detail when the request errored, else null. */
    failure(): RequestFailure | null;
    /** The request this one was redirected from, walking the redirect chain. */
    redirectedFrom(): Request | null;
    redirectChain(): Request[];
}
/**
 * A network response, modelled after Playwright's `Response`. Body accessors
 * lazily call `Network.getResponseBody`, which the engine only answers after
 * `Network.loadingFinished`; read bodies inside a `response`/`requestfinished`
 * handler or after `waitForResponse`, not in a bare `request` handler.
 */
export declare class Response {
    private readonly session;
    readonly request: Request;
    private readonly _url;
    private readonly _status;
    private readonly _statusText;
    private readonly _headers;
    private readonly _mimeType;
    private readonly _fromCache;
    /** @internal */
    _bodyPromise?: Promise<Buffer>;
    constructor(session: CDPSession, request: Request, _url: string, _status: number, _statusText: string, _headers: Record<string, string>, _mimeType: string, _fromCache: boolean);
    url(): string;
    status(): number;
    statusText(): string;
    ok(): boolean;
    headers(): Record<string, string>;
    mimeType(): string;
    fromCache(): boolean;
    /** Raw response body. Cached, so repeated `body`/`text`/`json` cost one fetch. */
    body(): Promise<Buffer>;
    text(): Promise<string>;
    json<T = unknown>(): Promise<T>;
}
