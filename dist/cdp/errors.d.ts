export type ErrorCode = "CDP_ERROR" | "TIMEOUT" | "ABORTED" | "PROTOCOL_ERROR" | "NAVIGATION_ERROR" | "TARGET_CLOSED" | "WEBSOCKET_CLOSED" | "STALE_ELEMENT" | "DRIVER_ERROR";
export interface ProtocolErrorContext {
    code?: ErrorCode;
    method?: string;
    sessionId?: string;
    timeout?: number;
    payload?: unknown;
    cause?: unknown;
    retryable?: boolean;
    operation?: string;
    driver?: string;
    pageId?: string;
    url?: string;
    deadline?: number;
    details?: Record<string, unknown>;
}
export declare class CDPError extends Error {
    readonly code: ErrorCode;
    readonly method?: string;
    readonly sessionId?: string;
    readonly timeout?: number;
    readonly payload?: unknown;
    readonly retryable: boolean;
    readonly operation?: string;
    readonly driver?: string;
    readonly pageId?: string;
    readonly url?: string;
    readonly deadline?: number;
    readonly details?: Record<string, unknown>;
    constructor(message: string, context?: ProtocolErrorContext);
}
export declare class TimeoutError extends CDPError {
    constructor(message: string, context?: ProtocolErrorContext);
}
export declare class ProtocolError extends CDPError {
    constructor(message: string, context?: ProtocolErrorContext);
}
export declare class NavigationError extends CDPError {
    constructor(message: string, context?: ProtocolErrorContext);
}
export declare class TargetClosedError extends CDPError {
    constructor(message: string, context?: ProtocolErrorContext);
}
export declare class WebSocketClosedError extends CDPError {
    constructor(message: string, context?: ProtocolErrorContext);
}
export declare class StaleElementError extends CDPError {
    constructor(message: string, context?: ProtocolErrorContext);
}
export declare class AbortError extends CDPError {
    constructor(message: string, context?: ProtocolErrorContext);
}
