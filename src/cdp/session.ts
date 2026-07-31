import type { CDPClient } from "./client.js";
import { CDPError, TargetClosedError } from "./errors.js";
import type { EventHandler } from "./events.js";

interface PendingTracker {
  reject(reason: unknown): void;
}

export class CDPSession {
  private _closed?: CDPError;
  private readonly _pending = new Set<PendingTracker>();
  private readonly _subscriptions = new Set<() => void>();

  constructor(
    readonly client: CDPClient,
    readonly sessionId: string,
    readonly targetId?: string,
  ) {}

  get closed(): CDPError | undefined {
    return this._closed;
  }

  send<T = unknown>(method: string, params?: unknown, timeout?: number, signal?: AbortSignal): Promise<T> {
    if (this._closed) return Promise.reject(this._closed);
    return new Promise<T>((resolve, reject) => {
      const tracker: PendingTracker = { reject };
      this._pending.add(tracker);
      this.client.send<T>(method, params, this.sessionId, timeout, signal).then(
        (value) => { this._pending.delete(tracker); resolve(value); },
        (error) => { this._pending.delete(tracker); reject(error); },
      );
    });
  }

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const unsubscribe = this.client.onSession(this.sessionId, event, handler);
    return this.trackSubscription(unsubscribe);
  }

  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    let off: () => void = () => undefined;
    const unsubscribe = this.client.onceSession<T>(this.sessionId, event, (payload) => {
      off();
      handler(payload);
    });
    off = this.trackSubscription(unsubscribe);
    return off;
  }

  waitFor<T = unknown>(
    event: string,
    options?: { timeout?: number; signal?: AbortSignal; predicate?: (payload: T) => boolean },
  ): Promise<T> {
    if (this._closed) return Promise.reject(this._closed);
    return this.client.waitForSession<T>(this.sessionId, event, options);
  }

  /** Internal: mark session as closed and reject all in-flight requests. */
  markClosed(reason?: CDPError): void {
    if (this._closed) return;
    this._closed = reason ?? new TargetClosedError("Session closed", { sessionId: this.sessionId });
    for (const tracker of this._pending) tracker.reject(this._closed);
    this._pending.clear();
    for (const unsubscribe of [...this._subscriptions]) unsubscribe();
    this._subscriptions.clear();
  }

  async detach(): Promise<void> {
    if (this._closed) return;
    try {
      await this.client.detachSession(this.sessionId);
    } finally {
      this.markClosed(new TargetClosedError("Session detached", { sessionId: this.sessionId }));
    }
  }

  private trackSubscription(unsubscribe: () => void): () => void {
    let active = true;
    const tracked = () => {
      if (!active) return;
      active = false;
      this._subscriptions.delete(tracked);
      unsubscribe();
    };
    this._subscriptions.add(tracked);
    return tracked;
  }
}
