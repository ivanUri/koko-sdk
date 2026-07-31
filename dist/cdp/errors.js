export class CDPError extends Error {
    code;
    method;
    sessionId;
    timeout;
    payload;
    retryable;
    operation;
    driver;
    pageId;
    url;
    deadline;
    details;
    constructor(message, context = {}) {
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
        if (context.cause !== undefined)
            this.cause = context.cause;
    }
}
export class TimeoutError extends CDPError {
    constructor(message, context = {}) { super(message, { ...context, code: "TIMEOUT", retryable: true }); }
}
export class ProtocolError extends CDPError {
    constructor(message, context = {}) { super(message, { ...context, code: context.code ?? "PROTOCOL_ERROR" }); }
}
export class NavigationError extends CDPError {
    constructor(message, context = {}) { super(message, { ...context, code: "NAVIGATION_ERROR", operation: context.operation ?? "navigation" }); }
}
export class TargetClosedError extends CDPError {
    constructor(message, context = {}) { super(message, { ...context, code: "TARGET_CLOSED" }); }
}
export class WebSocketClosedError extends CDPError {
    constructor(message, context = {}) { super(message, { ...context, code: "WEBSOCKET_CLOSED", retryable: true }); }
}
export class StaleElementError extends CDPError {
    constructor(message, context = {}) { super(message, { ...context, code: "STALE_ELEMENT", retryable: true }); }
}
export class AbortError extends CDPError {
    constructor(message, context = {}) { super(message, { ...context, code: "ABORTED" }); }
}
//# sourceMappingURL=errors.js.map