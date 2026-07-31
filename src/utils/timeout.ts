import { AbortError, TimeoutError } from "../cdp/errors.js";

export interface TimeoutOptions {
  timeout?: number;
  label?: string;
  method?: string;
  sessionId?: string;
  signal?: AbortSignal;
}

export function withTimeout<T>(promise: Promise<T>, options: TimeoutOptions = {}): Promise<T> {
  const timeout = options.timeout ?? 30_000;
  if (options.signal?.aborted) {
    return Promise.reject(new AbortError(options.label ?? "Operation aborted", {
      method: options.method,
      sessionId: options.sessionId,
    }));
  }

  let timer: NodeJS.Timeout | undefined;
  let abortHandler: (() => void) | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
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
    if (timer) clearTimeout(timer);
    if (abortHandler) options.signal?.removeEventListener("abort", abortHandler);
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
