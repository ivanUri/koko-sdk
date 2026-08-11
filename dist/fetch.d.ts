import type { ExtractResult } from "./browser/page.js";
import type { LogLevel } from "./browser/engine-options.js";
import type { WaitUntil } from "./browser/waiter.js";
export type FetchFormat = "html" | "md" | "json";
export interface FetchOptions {
    /** Output format (default: html). */
    format?: FetchFormat;
    /** Start koko automatically (default: true). */
    launch?: boolean;
    /** CDP endpoint when launch is false. */
    endpoint?: string;
    waitUntil?: WaitUntil;
    timeout?: number;
    logger?: boolean;
    /** Write result to this file path. */
    output?: string;
    /** Passed to `launchKoko` when `launch` is true. */
    profile?: string;
    profilePool?: string[];
    userDataDir?: string;
    /** Self-contained fingerprint folder (`--fingerprint-folder`). */
    fingerprintFolder?: string;
    /** Portable `.koko-profile` bundle directory. */
    profileBundle?: string;
    /** Installed fingerprint id under `browser/fingerprints/`. */
    fingerprint?: string;
    cookieJar?: string;
    /** Outbound proxy for the launched engine. */
    httpProxy?: string;
    binary?: string;
    install?: string;
    dataRoot?: string;
    /** @deprecated Use `dataRoot`. */
    repoRoot?: string;
    logLevel?: LogLevel;
}
export interface FetchResult {
    url: string;
    title: string;
    format: FetchFormat;
    /** HTML, Markdown, or JSON string. */
    body: string;
    /** Parsed extract payload when format is json. */
    data?: ExtractResult;
}
export declare function fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
