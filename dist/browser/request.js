import { ProtocolError } from "../cdp/errors.js";
/**
 * A network request observed on the page, modelled after Playwright's
 * `Request`. Built by `NetworkTracker` from `Network.requestWillBeSent`;
 * mutated in place as the response and completion events arrive.
 */
export class Request {
    requestId;
    _url;
    _method;
    _headers;
    _resourceType;
    _postData;
    _timestamp;
    /** @internal */
    _response;
    /** @internal */
    _failure;
    /** @internal */
    _redirectedFrom;
    constructor(requestId, _url, _method, _headers, _resourceType, _postData, _timestamp) {
        this.requestId = requestId;
        this._url = _url;
        this._method = _method;
        this._headers = _headers;
        this._resourceType = _resourceType;
        this._postData = _postData;
        this._timestamp = _timestamp;
    }
    url() {
        return this._url;
    }
    method() {
        return this._method;
    }
    headers() {
        return this._headers;
    }
    resourceType() {
        return this._resourceType;
    }
    postData() {
        return this._postData;
    }
    /** Monotonic CDP timestamp (seconds) when the request was sent, if known. */
    timestamp() {
        return this._timestamp;
    }
    /** True for the top-level document navigation request. */
    isNavigationRequest() {
        return this._resourceType === "Document";
    }
    /** The response, once `Network.responseReceived` has arrived. */
    response() {
        return this._response ?? null;
    }
    /** Failure detail when the request errored, else null. */
    failure() {
        return this._failure ?? null;
    }
    /** The request this one was redirected from, walking the redirect chain. */
    redirectedFrom() {
        return this._redirectedFrom ?? null;
    }
    redirectChain() {
        const chain = [];
        let current = this._redirectedFrom;
        while (current) {
            chain.unshift(current);
            current = current._redirectedFrom;
        }
        return chain;
    }
}
/**
 * A network response, modelled after Playwright's `Response`. Body accessors
 * lazily call `Network.getResponseBody`, which the engine only answers after
 * `Network.loadingFinished`; read bodies inside a `response`/`requestfinished`
 * handler or after `waitForResponse`, not in a bare `request` handler.
 */
export class Response {
    session;
    request;
    _url;
    _status;
    _statusText;
    _headers;
    _mimeType;
    _fromCache;
    /** @internal */
    _bodyPromise;
    constructor(session, request, _url, _status, _statusText, _headers, _mimeType, _fromCache) {
        this.session = session;
        this.request = request;
        this._url = _url;
        this._status = _status;
        this._statusText = _statusText;
        this._headers = _headers;
        this._mimeType = _mimeType;
        this._fromCache = _fromCache;
    }
    url() {
        return this._url;
    }
    status() {
        return this._status;
    }
    statusText() {
        return this._statusText;
    }
    ok() {
        return this._status === 0 || (this._status >= 200 && this._status < 300);
    }
    headers() {
        return this._headers;
    }
    mimeType() {
        return this._mimeType;
    }
    fromCache() {
        return this._fromCache;
    }
    /** Raw response body. Cached, so repeated `body`/`text`/`json` cost one fetch. */
    async body() {
        if (!this._bodyPromise) {
            this._bodyPromise = this.session
                .send("Network.getResponseBody", { requestId: this.request.requestId })
                .then((result) => Buffer.from(result.body, result.base64Encoded ? "base64" : "utf8"))
                .catch((error) => {
                this._bodyPromise = undefined;
                throw new ProtocolError(`response body unavailable for ${this._url} `
                    + "(body is only retrievable after the request finishes): "
                    + (error instanceof Error ? error.message : String(error)));
            });
        }
        return this._bodyPromise;
    }
    async text() {
        return (await this.body()).toString("utf8");
    }
    async json() {
        return JSON.parse(await this.text());
    }
}
//# sourceMappingURL=request.js.map