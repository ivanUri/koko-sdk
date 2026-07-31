import { AbortError, TimeoutError } from "../cdp/errors.js";
export function withTimeout(promise, options = {}) {
    const timeout = options.timeout ?? 30_000;
    if (options.signal?.aborted) {
        return Promise.reject(new AbortError(options.label ?? "Operation aborted", {
            method: options.method,
            sessionId: options.sessionId,
        }));
    }
    let timer;
    let abortHandler;
    const timeoutPromise = new Promise((_, reject) => {
        if (timeout > 0 && Number.isFinite(timeout)) {
            timer = setTimeout(() => {
                reject(new TimeoutError(options.label ?? "Operation timed out", {
                    timeout,
                    method: options.method,
                    sessionId: options.sessionId,
                }));
            }, timeout);
        }
        if (options.signal) {
            abortHandler = () => reject(new AbortError(options.label ?? "Operation aborted", {
                method: options.method,
                sessionId: options.sessionId,
            }));
            options.signal.addEventListener("abort", abortHandler, { once: true });
        }
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timer)
            clearTimeout(timer);
        if (abortHandler)
            options.signal?.removeEventListener("abort", abortHandler);
    });
}
export function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=timeout.js.map