import WebSocket from "ws";
import { EventBus } from "../cdp/events.js";
import { AbortError, ProtocolError, TimeoutError, WebSocketClosedError } from "../cdp/errors.js";
import { Logger } from "../utils/logger.js";
export class WebSocketTransport {
    socket;
    nextId = 1;
    pending = new Map();
    events = new EventBus();
    defaultTimeout;
    logger;
    closed = false;
    constructor(socket, options = {}) {
        this.socket = socket;
        this.defaultTimeout = options.defaultTimeout ?? 30_000;
        this.logger = Logger.from(options.logger)?.child("transport");
        this.bindSocket();
    }
    static async connect(endpoint, options = {}) {
        const wsEndpoint = await resolveWebSocketEndpoint(endpoint, options.defaultTimeout);
        const socket = new WebSocket(wsEndpoint);
        await new Promise((resolve, reject) => {
            const cleanup = () => {
                socket.off("open", onOpen);
                socket.off("error", onError);
            };
            const onOpen = () => {
                cleanup();
                resolve();
            };
            const onError = (error) => {
                cleanup();
                socket.close();
                reject(error);
            };
            socket.once("open", onOpen);
            socket.once("error", onError);
        });
        return new WebSocketTransport(socket, options);
    }
    send(method, params, options = {}) {
        if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new WebSocketClosedError("WebSocket is not open", { method, sessionId: options.sessionId }));
        }
        const id = this.nextId++;
        const payload = { id, method };
        if (params !== undefined)
            payload.params = params;
        if (options.sessionId)
            payload.sessionId = options.sessionId;
        return new Promise((resolve, reject) => {
            const timeout = options.timeout ?? this.defaultTimeout;
            const finish = (error) => {
                const pending = this.takePending(id);
                if (!pending)
                    return;
                if (error)
                    pending.reject(error);
            };
            const timer = timeout > 0 && Number.isFinite(timeout)
                ? setTimeout(() => {
                    finish(new TimeoutError(`CDP command timed out: ${method}`, {
                        method,
                        sessionId: options.sessionId,
                        timeout,
                        payload,
                    }));
                }, timeout)
                : undefined;
            const abortHandler = options.signal
                ? () => finish(new AbortError(`CDP command aborted: ${method}`, {
                    method,
                    sessionId: options.sessionId,
                    payload,
                }))
                : undefined;
            this.pending.set(id, {
                method,
                sessionId: options.sessionId,
                payload,
                timer,
                signal: options.signal,
                abortHandler,
                resolve: resolve,
                reject,
            });
            if (options.signal?.aborted) {
                abortHandler?.();
                return;
            }
            if (abortHandler)
                options.signal?.addEventListener("abort", abortHandler, { once: true });
            this.logger?.log("send", payload);
            this.socket.send(JSON.stringify(payload), (error) => {
                if (error)
                    finish(new WebSocketClosedError(error.message, {
                        method,
                        sessionId: options.sessionId,
                    }));
            });
        });
    }
    on(event, handler) {
        return this.events.on(event, handler);
    }
    once(event, handler) {
        return this.events.once(event, handler);
    }
    onAny(handler) {
        return this.events.onAny(handler);
    }
    off(event, handler) {
        this.events.off(event, handler);
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.socket.close();
        this.rejectAll(new WebSocketClosedError("WebSocket closed"));
        this.events.removeAll();
    }
    bindSocket() {
        this.socket.on("message", (data) => this.handleMessage(data.toString()));
        this.socket.on("close", () => {
            this.closed = true;
            this.rejectAll(new WebSocketClosedError("WebSocket closed"));
            this.events.emit("__close", {});
        });
        this.socket.on("error", (error) => {
            this.rejectAll(new WebSocketClosedError(error.message));
            this.events.emit("__error", error);
        });
    }
    handleMessage(raw) {
        let message;
        try {
            message = JSON.parse(raw);
        }
        catch (error) {
            this.events.emit("__parseError", { raw, error });
            return;
        }
        this.logger?.log("recv", message);
        if (message.id !== undefined) {
            const pending = this.takePending(message.id);
            if (!pending)
                return;
            if (message.error) {
                pending.reject(new ProtocolError(message.error.message, {
                    method: pending.method,
                    sessionId: pending.sessionId,
                    payload: message,
                }));
            }
            else {
                pending.resolve(message.result ?? {});
            }
            return;
        }
        if (message.method) {
            this.events.emit(message.method, message);
            if (message.sessionId)
                this.events.emit(`${message.sessionId}:${message.method}`, message);
        }
    }
    rejectAll(error) {
        for (const id of [...this.pending.keys()]) {
            const pending = this.takePending(id);
            if (!pending)
                continue;
            pending.reject(error);
        }
    }
    takePending(id) {
        const pending = this.pending.get(id);
        if (!pending)
            return undefined;
        this.pending.delete(id);
        if (pending.timer)
            clearTimeout(pending.timer);
        if (pending.abortHandler) {
            pending.signal?.removeEventListener("abort", pending.abortHandler);
        }
        return pending;
    }
}
async function resolveWebSocketEndpoint(endpoint, timeoutMs = 30_000) {
    if (endpoint.startsWith("ws://") || endpoint.startsWith("wss://"))
        return endpoint;
    const base = endpoint.replace(/\/$/, "");
    const controller = new AbortController();
    const timer = timeoutMs > 0 && Number.isFinite(timeoutMs)
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;
    let res;
    try {
        res = await fetch(`${base}/json/version`, { signal: controller.signal });
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
    if (!res.ok)
        throw new Error(`Unable to resolve CDP endpoint: ${res.status} ${res.statusText}`);
    const json = await res.json();
    if (!json.webSocketDebuggerUrl)
        throw new Error("CDP /json/version did not include webSocketDebuggerUrl");
    return json.webSocketDebuggerUrl;
}
//# sourceMappingURL=websocket.js.map