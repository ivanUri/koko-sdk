export type ErrorCode =
  | "CDP_ERROR"
  | "TIMEOUT"
  | "ABORTED"
  | "PROTOCOL_ERROR"
  | "NAVIGATION_ERROR"
  | "TARGET_CLOSED"
  | "WEBSOCKET_CLOSED"
  | "STALE_ELEMENT"
  | "DRIVER_ERROR";

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

export class CDPError extends Error {
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

  constructor(message: string, context: ProtocolErrorContext = {}) {
    super(message);
    this.name = new.target.name;
    this.code = context.code ?? "CDP_ERROR";
    this.method = context.method;
    this.sessionId = context.sessionId;
    this.timeout = context.timeout;
    this.payload = context.payload;
    this.retryable = context.retryable ?? false;
    this.operation = context.operation;
    this.driver = context.driver;
    this.pageId = context.pageId;
    this.url = context.url;
    this.deadline = context.deadline;
    this.details = context.details;
    if (context.cause !== undefined) this.cause = context.cause;
  }
}

export class TimeoutError extends CDPError { constructor(message: string, context: ProtocolErrorContext = {}) { super(message, { ...context, code: "TIMEOUT", retryable: true }); } }
export class ProtocolError extends CDPError { constructor(message: string, context: ProtocolErrorContext = {}) { super(message, { ...context, code: context.code ?? "PROTOCOL_ERROR" }); } }
export class NavigationError extends CDPError { constructor(message: string, context: ProtocolErrorContext = {}) { super(message, { ...context, code: "NAVIGATION_ERROR", operation: context.operation ?? "navigation" }); } }
export class TargetClosedError extends CDPError { constructor(message: string, context: ProtocolErrorContext = {}) { super(message, { ...context, code: "TARGET_CLOSED" }); } }
export class WebSocketClosedError extends CDPError { constructor(message: string, context: ProtocolErrorContext = {}) { super(message, { ...context, code: "WEBSOCKET_CLOSED", retryable: true }); } }
export class StaleElementError extends CDPError { constructor(message: string, context: ProtocolErrorContext = {}) { super(message, { ...context, code: "STALE_ELEMENT", retryable: true }); } }
export class AbortError extends CDPError { constructor(message: string, context: ProtocolErrorContext = {}) { super(message, { ...context, code: "ABORTED" }); } }
