/** Console message type (`Runtime.consoleAPICalled.type`). */
export type ConsoleMessageType = "log" | "debug" | "info" | "error" | "warning" | "dir" | "dirxml" | "table" | "trace" | "clear" | "startGroup" | "startGroupCollapsed" | "endGroup" | "assert" | "profile" | "profileEnd" | "count" | "timeEnd";
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
export declare class ConsoleMessage {
    private readonly _type;
    private readonly _text;
    private readonly _args;
    private readonly _location;
    constructor(_type: ConsoleMessageType, _text: string, _args: unknown[], _location: SourceLocation);
    type(): ConsoleMessageType;
    text(): string;
    /** Best-effort primitive values of the logged arguments. */
    args(): unknown[];
    location(): SourceLocation;
}
/**
 * An uncaught error / rejection in the page (`Runtime.exceptionThrown`),
 * modelled after the value Playwright passes to `page.on('pageerror')`.
 */
export declare class PageError extends Error {
    readonly location: SourceLocation;
    constructor(message: string, stack: string | undefined, location: SourceLocation);
}
/** Flatten a `Runtime.consoleAPICalled` payload into a ConsoleMessage. */
export declare function consoleMessageFromCdp(event: any): ConsoleMessage;
/** Flatten a `Runtime.exceptionThrown` payload into a PageError. */
export declare function pageErrorFromCdp(event: any): PageError;
