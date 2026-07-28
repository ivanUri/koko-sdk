import type { CDPSession } from "../cdp/session.js";
import { EventBus } from "../cdp/events.js";
import { withTimeout } from "../utils/timeout.js";
import { Request, Response, type ResourceType } from "./request.js";

type IdleListener = () => void;

/**
 * Matcher for `waitForRequest`/`waitForResponse`. A string is matched with
 * glob semantics (`*` and `**` wildcards); a RegExp tests the full URL; a
 * predicate receives the Request/Response.
 */
export type UrlMatch<T> = string | RegExp | ((value: T) => boolean | Promise<boolean>);

export interface WaitForNetworkOptions {
  timeout?: number;
}

const DEFAULT_MAX_REQUESTS = 2048;

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
export class NetworkTracker {
  readonly requests = new Map<string, Request>();
  readonly inflight = new Set<string>();
  private cleanup: Array<() => void> = [];
  private readonly idleListeners = new Set<IdleListener>();
  private readonly bus = new EventBus();
  private maxRequests = DEFAULT_MAX_REQUESTS;
  private enabled = false;
  private enabling?: Promise<void>;

  constructor(private readonly session: CDPSession) {}

  setMaxRequests(max: number): void {
    this.maxRequests = Math.max(64, max);
    this.pruneCompleted();
  }

  on<K extends keyof NetworkEventMap>(event: K, handler: (payload: NetworkEventMap[K]) => void): () => void {
    // Subscribing implies wanting the events; enable in the background.
    void this.ensureEnabled();
    return this.bus.on(event, handler as (p: unknown) => void);
  }

  off<K extends keyof NetworkEventMap>(event: K, handler: (payload: NetworkEventMap[K]) => void): void {
    this.bus.off(event, handler as (p: unknown) => void);
  }

  private notify(): void {
    for (const listener of this.idleListeners) listener();
  }

  /** Enable CDP Network domain and start tracking requests (idempotent). */
  async enable(): Promise<void> {
    return this.ensureEnabled();
  }

  /** Lazily enable Network — avoids velora SIGTRAP on simple multi-page goto. */
  async ensureEnabled(): Promise<void> {
    if (this.enabled) return;
    if (this.enabling) return this.enabling;
    this.enabling = this.doEnable();
    try {
      await this.enabling;
    } finally {
      this.enabling = undefined;
    }
  }

  private async doEnable(): Promise<void> {
    if (this.enabled) return;
    this.cleanup.push(
      this.session.on<any>("Network.requestWillBeSent", (event) => this.onRequest(event)),
      this.session.on<any>("Network.responseReceived", (event) => this.onResponse(event)),
      this.session.on<any>("Network.loadingFinished", (event) => this.onDone(event.requestId)),
      this.session.on<any>("Network.loadingFailed", (event) => this.onFailed(event)),
    );
    await this.session.send("Network.enable").catch(() => undefined);
    this.enabled = true;
  }

  dispose(): void {
    for (const off of this.cleanup) off();
    this.cleanup = [];
    this.bus.removeAll();
    this.reset();
  }

  /** Clear tracked requests (e.g. at navigation start). */
  reset(): void {
    this.requests.clear();
    this.inflight.clear();
  }

  waitForIdle(options: { idleMs?: number; timeout?: number } = {}): Promise<void> {
    return this.ensureEnabled().then(() => this.waitForIdleAfterEnabled(options));
  }

  private waitForIdleAfterEnabled(options: { idleMs?: number; timeout?: number } = {}): Promise<void> {
    const idleMs = options.idleMs ?? 500;
    const promise = new Promise<void>((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      const finish = () => {
        this.idleListeners.delete(listener);
        if (timer) clearTimeout(timer);
        resolve();
      };
      const listener: IdleListener = () => {
        if (this.inflight.size === 0) {
          if (!timer) timer = setTimeout(finish, idleMs);
        } else if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
      this.idleListeners.add(listener);
      listener();
    });
    return withTimeout(promise, { timeout: options.timeout, label: "Waiting for network idle" });
  }

  /**
   * Resolve with the first request whose URL matches. Subscribes before
   * returning, so a request already in flight when called still counts only if
   * it has not yet been sent; prefer calling this before the triggering action.
   */
  waitForRequest(match: UrlMatch<Request>, options: WaitForNetworkOptions = {}): Promise<Request> {
    return this.waitForNetworkEvent("request", match, options, "Waiting for request");
  }

  /** Resolve with the first response whose URL (or whose request) matches. */
  waitForResponse(match: UrlMatch<Response>, options: WaitForNetworkOptions = {}): Promise<Response> {
    return this.waitForNetworkEvent("response", match, options, "Waiting for response");
  }

  private waitForNetworkEvent<K extends keyof NetworkEventMap, V extends Request | Response>(
    event: K,
    match: UrlMatch<V>,
    options: WaitForNetworkOptions,
    label: string,
  ): Promise<V> {
    const predicate = compileMatch(match);
    const promise = new Promise<V>((resolve, reject) => {
      const off = this.on(event, (payload) => {
        const value = payload as unknown as V;
        Promise.resolve(predicate(value)).then(
          (ok) => {
            if (!ok) return;
            off();
            resolve(value);
          },
          (error) => {
            off();
            reject(error);
          },
        );
      });
    });
    return withTimeout(promise, { timeout: options.timeout ?? 30_000, label });
  }

  private onRequest(event: any): void {
    const previous = this.requests.get(event.requestId);
    const request = new Request(
      event.requestId,
      event.request?.url ?? "",
      event.request?.method ?? "GET",
      normalizeHeaders(event.request?.headers),
      (event.type ?? "Other") as ResourceType,
      event.request?.postData,
      event.timestamp,
    );
    // A redirect reuses the requestId; the CDP event carries the prior response.
    if (previous) request._redirectedFrom = previous;
    this.requests.set(event.requestId, request);
    this.inflight.add(event.requestId);
    this.pruneCompleted();
    this.bus.emit("request", request);
    this.notify();
  }

  private onResponse(event: any): void {
    const request = this.requests.get(event.requestId);
    if (!request) return;
    const raw = event.response ?? {};
    const response = new Response(
      this.session,
      request,
      raw.url ?? request.url(),
      raw.status ?? 0,
      raw.statusText ?? "",
      normalizeHeaders(raw.headers),
      raw.mimeType ?? "",
      Boolean(raw.fromDiskCache || raw.fromPrefetchCache),
    );
    request._response = response;
    this.bus.emit("response", response);
  }

  private onDone(requestId: string): void {
    const request = this.requests.get(requestId);
    this.inflight.delete(requestId);
    this.pruneCompleted();
    if (request) this.bus.emit("requestfinished", request);
    this.notify();
  }

  private onFailed(event: any): void {
    const request = this.requests.get(event.requestId);
    if (request) {
      request._failure = { errorText: event.errorText ?? "net::ERR_FAILED", canceled: event.canceled };
    }
    this.inflight.delete(event.requestId);
    this.pruneCompleted();
    if (request) this.bus.emit("requestfailed", request);
    this.notify();
  }

  private pruneCompleted(): void {
    if (this.requests.size <= this.maxRequests) return;
    for (const [id, req] of this.requests) {
      if (this.inflight.has(id)) continue;
      void req;
      this.requests.delete(id);
      if (this.requests.size <= this.maxRequests) break;
    }
  }
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    out[key.toLowerCase()] = String(value);
  }
  return out;
}

/** Compile a UrlMatch into a predicate over the Request/Response. */
function compileMatch<T extends Request | Response>(
  match: UrlMatch<T>,
): (value: T) => boolean | Promise<boolean> {
  if (typeof match === "function") return match;
  if (match instanceof RegExp) return (value) => match.test(value.url());
  const regex = globToRegExp(match);
  return (value) => regex.test(value.url());
}

/** Glob (`*` single-segment-ish, `**` any) → RegExp, anchored to the full URL. */
function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
    } else if ("\\^$+?.()|[]{}".includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return new RegExp(`^${out}$`);
}
