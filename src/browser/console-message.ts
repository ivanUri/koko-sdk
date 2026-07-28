/** Console message type (`Runtime.consoleAPICalled.type`). */
export type ConsoleMessageType =
  | "log"
  | "debug"
  | "info"
  | "error"
  | "warning"
  | "dir"
  | "dirxml"
  | "table"
  | "trace"
  | "clear"
  | "startGroup"
  | "startGroupCollapsed"
  | "endGroup"
  | "assert"
  | "profile"
  | "profileEnd"
  | "count"
  | "timeEnd";

export interface SourceLocation {
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

/**
 * A `console.*` call made by the page, modelled after Playwright's
 * `ConsoleMessage`. Arguments are pre-serialised to primitives by the engine's
 * `Runtime.consoleAPICalled` payload; complex objects render as their CDP
 * preview/description rather than a live handle.
 */
export class ConsoleMessage {
  constructor(
    private readonly _type: ConsoleMessageType,
    private readonly _text: string,
    private readonly _args: unknown[],
    private readonly _location: SourceLocation,
  ) {}

  type(): ConsoleMessageType {
    return this._type;
  }

  text(): string {
    return this._text;
  }

  /** Best-effort primitive values of the logged arguments. */
  args(): unknown[] {
    return this._args;
  }

  location(): SourceLocation {
    return this._location;
  }
}

/**
 * An uncaught error / rejection in the page (`Runtime.exceptionThrown`),
 * modelled after the value Playwright passes to `page.on('pageerror')`.
 */
export class PageError extends Error {
  readonly location: SourceLocation;

  constructor(message: string, stack: string | undefined, location: SourceLocation) {
    super(message);
    this.name = "PageError";
    if (stack) this.stack = stack;
    this.location = location;
  }
}

/** Flatten a `Runtime.consoleAPICalled` payload into a ConsoleMessage. */
export function consoleMessageFromCdp(event: any): ConsoleMessage {
  const args = Array.isArray(event?.args) ? event.args : [];
  const values = args.map(remoteObjectValue);
  const text = values
    .map((v: unknown) => (typeof v === "string" ? v : safeStringify(v)))
    .join(" ");
  const frame = event?.stackTrace?.callFrames?.[0];
  return new ConsoleMessage(event?.type ?? "log", text, values, {
    url: frame?.url,
    lineNumber: frame?.lineNumber,
    columnNumber: frame?.columnNumber,
  });
}

/** Flatten a `Runtime.exceptionThrown` payload into a PageError. */
export function pageErrorFromCdp(event: any): PageError {
  const details = event?.exceptionDetails ?? {};
  const exception = details.exception;
  const message =
    exception?.description
    ?? exception?.value
    ?? details.text
    ?? "Uncaught exception";
  const stack = typeof exception?.description === "string" ? exception.description : undefined;
  return new PageError(String(message), stack, {
    url: details.url,
    lineNumber: details.lineNumber,
    columnNumber: details.columnNumber,
  });
}

function remoteObjectValue(arg: any): unknown {
  if (arg == null) return arg;
  if ("value" in arg) return arg.value;
  if (arg.unserializableValue != null) return arg.unserializableValue;
  return arg.description ?? arg.className ?? arg.type;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
