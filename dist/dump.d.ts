import { type EngineCommonOptions, type FetchOnlyEngineOptions } from "./browser/engine-options.js";
/**
 * `--dump` formats accepted by `koko fetch`.
 *
 * Only `html` and `markdown` actually render on the CLI path. The engine
 * accepts the `semantic_tree` variants but emits nothing for them — reach
 * those through `page.agent.semanticTree()` over CDP instead.
 */
export type DumpFormat = "html" | "markdown" | "semantic_tree" | "semantic_tree_text";
/** `--strip-mode` tag groups. */
export type StripMode = "js" | "ui" | "css" | "full";
/** `--wait-until` events. */
export type DumpWaitUntil = "load" | "domcontentloaded" | "networkidle" | "domstable" | "done";
export interface DumpOptions extends EngineCommonOptions, FetchOnlyEngineOptions {
    /** Output format (default: html). */
    format?: DumpFormat;
    /** Tag groups to remove from the dump (`--strip-mode`). */
    strip?: StripMode[];
    /** Emit a `<base>` tag (`--with-base`). */
    withBase?: boolean;
    /** Inline iframe contents (`--with-frames`). */
    withFrames?: boolean;
    /** Wait budget in ms; supersedes the other wait options (`--wait-ms`, default 5000). */
    waitMs?: number;
    /** Wait for a lifecycle event before the other wait options (`--wait-until`). */
    waitUntil?: DumpWaitUntil;
    /** Wait for a CSS selector, checked after `waitUntil` (`--wait-selector`). */
    waitSelector?: string;
    /** Wait for a JS expression to go truthy, checked after `waitUntil` (`--wait-script`). */
    waitScript?: string;
    /** Like `waitScript`, read from a file (`--wait-script-file`). */
    waitScriptFile?: string;
    /** Click inside this element after the wait conditions (`--click-selector`). */
    clickSelector?: string;
    /** X offset from the element's left edge (`--click-offset-x`, default 28). */
    clickOffsetX?: number;
    /** Y offset from the element's top edge (`--click-offset-y`, default: vertical center). */
    clickOffsetY?: number;
    /**
     * Hard deadline in ms (`--terminate-ms`). Unlike `waitMs`, which only stops
     * waiting, this aborts the page — use it for endless scripts.
     */
    terminateMs?: number;
    /** Portable `.koko-profile` bundle directory. */
    profileBundle?: string;
    /** Installed fingerprint id under `browser/fingerprints/`. */
    fingerprint?: string;
    /** Path to koko binary. */
    binary?: string;
    /** Engine install preset or path. */
    install?: string;
    /** Engine install root (KOKO_ROOT / KOKO_DATA). */
    dataRoot?: string;
    /** Write the dump to this path. */
    output?: string;
    /** Kill the process after this many ms (default: terminateMs + 30s, or 120s). */
    processTimeout?: number;
}
export interface DumpResult {
    url: string;
    format: DumpFormat;
    /** Document dump on stdout. */
    body: string;
    /** Engine stderr — structured logs, kept even on success. */
    log: string;
    /** Exit code; non-zero can still accompany a complete dump (teardown crashes). */
    exitCode: number;
    signal: NodeJS.Signals | null;
    /** Full argv handed to the engine. */
    args: string[];
}
/**
 * One-shot document dump via `koko fetch`.
 *
 * Covers the parts of the engine that the CDP path does not expose: markdown
 * and semantic-tree rendering, `--strip-mode`, iframe inlining, script/selector
 * wait conditions, and the hard `--terminate-ms` deadline.
 *
 * A non-zero exit code is reported rather than thrown when the dump itself is
 * complete: the engine can crash during teardown after the serializer has
 * already written the document.
 */
export declare function dump(url: string, options?: DumpOptions): Promise<DumpResult>;
