import type { CDPClient } from "./client.js";
import { CDPError } from "./errors.js";
import type { EventHandler } from "./events.js";
export declare class CDPSession {
    readonly client: CDPClient;
    readonly sessionId: string;
    readonly targetId?: string | undefined;
    private _closed?;
    private readonly _pending;
    private readonly _subscriptions;
    constructor(client: CDPClient, sessionId: string, targetId?: string | undefined);
    get closed(): CDPError | undefined;
    send<T = unknown>(method: string, params?: unknown, timeout?: number, signal?: AbortSignal): Promise<T>;
    on<T = unknown>(event: string, handler: EventHandler<T>): () => void;
    once<T = unknown>(event: string, handler: EventHandler<T>): () => void;
    waitFor<T = unknown>(event: string, options?: {
        timeout?: number;
        signal?: AbortSignal;
        predicate?: (payload: T) => boolean;
    }): Promise<T>;
    /** Internal: mark session as closed and reject all in-flight requests. */
    markClosed(reason?: CDPError): void;
    detach(): Promise<void>;
    private trackSubscription;
}
