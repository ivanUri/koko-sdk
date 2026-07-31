import type { CDPSession } from "../cdp/session.js";
import { ProtocolError } from "../cdp/errors.js";

/** CDP resource types surfaced on requests (`Network.ResourceType`). */
export type ResourceType =
  | "Document"
  | "Stylesheet"
  | "Image"
  | "Media"
  | "Font"
  | "Script"
  | "TextTrack"
  | "XHR"
  | "Fetch"
  | "Prefetch"
  | "EventSource"
  | "WebSocket"
  | "Manifest"
  | "SignedExchange"
  | "Ping"
  | "CSPViolationReport"
  | "Preflight"
  | "Other";

export interface RequestFailure {
  errorText: string;
  canceled?: boolean;
}

/**
 * A network request observed on the page, modelled after Playwright's
 * `Request`. Built by `NetworkTracker` from `Network.requestWillBeSent`;
 * mutated in place as the response and completion events arrive.
 */
export class Request {
  /** @internal */
  _response?: Response;
  /** @internal */
  _failure?: RequestFailure;
  /** @internal */
  _redirectedFrom?: Request;

  constructor(
    readonly requestId: string,
    private readonly _url: string,
    private readonly _method: string,
    private readonly _headers: Record<string, string>,
    private readonly _resourceType: ResourceType,
    private readonly _postData: string | undefined,
    private readonly _timestamp: number | undefined,
  ) {}

  url(): string {
    return this._url;
  }

  method(): string {
    return this._method;
  }

  headers(): Record<string, string> {
    return this._headers;
  }

  resourceType(): ResourceType {
    return this._resourceType;
  }

  postData(): string | undefined {
    return this._postData;
  }

  /** Monotonic CDP timestamp (seconds) when the request was sent, if known. */
  timestamp(): number | undefined {
    return this._timestamp;
  }

  /** True for the top-level document navigation request. */
  isNavigationRequest(): boolean {
    return this._resourceType === "Document";
  }

  /** The response, once `Network.responseReceived` has arrived. */
  response(): Response | null {
    return this._response ?? null;
  }

  /** Failure detail when the request errored, else null. */
  failure(): RequestFailure | null {
    return this._failure ?? null;
  }

  /** The request this one was redirected from, walking the redirect chain. */
  redirectedFrom(): Request | null {
    return this._redirectedFrom ?? null;
  }

  redirectChain(): Request[] {
    const chain: Request[] = [];
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
  /** @internal */
  _bodyPromise?: Promise<Buffer>;

  constructor(
    private readonly session: CDPSession,
    readonly request: Request,
    private readonly _url: string,
    private readonly _status: number,
    private readonly _statusText: string,
    private readonly _headers: Record<string, string>,
    private readonly _mimeType: string,
    private readonly _fromCache: boolean,
  ) {}

  url(): string {
    return this._url;
  }

  status(): number {
    return this._status;
  }

  statusText(): string {
    return this._statusText;
  }

  ok(): boolean {
    return this._status >= 200 && this._status < 300;
  }

  headers(): Record<string, string> {
    return this._headers;
  }

  mimeType(): string {
    return this._mimeType;
  }

  fromCache(): boolean {
    return this._fromCache;
  }

  /** Raw response body. Cached, so repeated `body`/`text`/`json` cost one fetch. */
  async body(): Promise<Buffer> {
    if (!this._bodyPromise) {
      this._bodyPromise = this.session
        .send<{ body: string; base64Encoded: boolean }>(
          "Network.getResponseBody",
          { requestId: this.request.requestId },
        )
        .then((result) =>
          Buffer.from(result.body, result.base64Encoded ? "base64" : "utf8"),
        )
        .catch((error) => {
          this._bodyPromise = undefined;
          throw new ProtocolError(
            `response body unavailable for ${this._url} `
              + "(body is only retrievable after the request finishes): "
              + (error instanceof Error ? error.message : String(error)),
          );
        });
    }
    return this._bodyPromise;
  }

  async text(): Promise<string> {
    return (await this.body()).toString("utf8");
  }

  async json<T = unknown>(): Promise<T> {
    return JSON.parse(await this.text()) as T;
  }
}
