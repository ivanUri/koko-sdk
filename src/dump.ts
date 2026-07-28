import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolveFingerprintFolder } from "./profile.js";
import { resolveVeloraInstall } from "./velora-install.js";
import { toEngineArgs, type EngineCommonOptions } from "./browser/engine-options.js";
import { ProtocolError } from "./cdp/errors.js";

/**
 * `--dump` formats accepted by `velora fetch`.
 *
 * Only `html` and `markdown` actually render on the CLI path. The engine
 * accepts the `semantic_tree` variants but emits nothing for them — reach
 * those through `page.agent.semanticTree()` over CDP instead.
 */
export type DumpFormat = "html" | "markdown" | "semantic_tree" | "semantic_tree_text";

/** `--strip-mode` tag groups. */
export type StripMode = "js" | "ui" | "css" | "full";

/** `--wait-until` events. */
export type DumpWaitUntil = "load" | "domcontentloaded" | "networkidle" | "done";

export interface DumpOptions extends EngineCommonOptions {
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

  /** Portable `.velora-profile` bundle directory. */
  profileBundle?: string;
  /** Installed fingerprint id under `browser/fingerprints/`. */
  fingerprint?: string;

  /** Path to velora binary. */
  binary?: string;
  /** Engine install preset or path. */
  install?: string;
  /** Engine install root (VELORA_ROOT / VELORA_DATA). */
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
 * One-shot document dump via `velora fetch`.
 *
 * Covers the parts of the engine that the CDP path does not expose: markdown
 * and semantic-tree rendering, `--strip-mode`, iframe inlining, script/selector
 * wait conditions, and the hard `--terminate-ms` deadline.
 *
 * A non-zero exit code is reported rather than thrown when the dump itself is
 * complete: the engine can crash during teardown after the serializer has
 * already written the document.
 */
export async function dump(url: string, options: DumpOptions = {}): Promise<DumpResult> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProtocolError(`url must be http:// or https://, got ${parsed.protocol}`);
  }

  const install = resolveVeloraInstall(options);
  const { binary, dataRoot } = install;

  const fingerprintFolder = resolveFingerprintFolder({
    dataRoot,
    profile: options.profile,
    userDataDir: options.userDataDir,
    fingerprintFolder: options.fingerprintFolder,
    profileBundle: options.profileBundle,
    fingerprint: options.fingerprint,
  });

  const format = options.format ?? "html";
  const args = ["fetch", "--dump", format];

  if (options.strip?.length) args.push("--strip-mode", options.strip.join(","));
  if (options.withBase) args.push("--with-base");
  if (options.withFrames) args.push("--with-frames");

  if (options.waitMs != null) args.push("--wait-ms", String(options.waitMs));
  if (options.waitUntil) args.push("--wait-until", options.waitUntil);
  if (options.waitSelector) args.push("--wait-selector", options.waitSelector);
  if (options.waitScript) args.push("--wait-script", options.waitScript);
  if (options.waitScriptFile) args.push("--wait-script-file", options.waitScriptFile);

  if (options.clickSelector) args.push("--click-selector", options.clickSelector);
  if (options.clickOffsetX != null) args.push("--click-offset-x", String(options.clickOffsetX));
  if (options.clickOffsetY != null) args.push("--click-offset-y", String(options.clickOffsetY));

  if (options.terminateMs != null) args.push("--terminate-ms", String(options.terminateMs));

  if (options.profile) args.push("--browser-profile", options.profile);
  if (options.profilePool?.length && !options.profile) {
    args.push("--browser-profile-pool", options.profilePool.join(","));
  }
  args.push(...toEngineArgs({
    ...options,
    fingerprintFolder,
    profile: undefined,
    profilePool: undefined,
  }));

  args.push(parsed.href);

  const timeout = options.processTimeout
    ?? (options.terminateMs != null ? options.terminateMs + 30_000 : 120_000);

  const result = await new Promise<Omit<DumpResult, "url" | "format" | "args">>(
    (resolveResult, reject) => {
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      const proc = spawn(binary, args, {
        cwd: dataRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, VELORA_ROOT: dataRoot, VELORA_DATA: dataRoot },
      });

      const timer = setTimeout(() => proc.kill("SIGKILL"), timeout);
      timer.unref?.();

      proc.stdout?.on("data", (d: Buffer) => out.push(d));
      proc.stderr?.on("data", (d: Buffer) => err.push(d));
      proc.on("error", (e) => {
        clearTimeout(timer);
        reject(new ProtocolError(`failed to spawn velora: ${e.message}`));
      });
      proc.on("close", (code, signal) => {
        clearTimeout(timer);
        resolveResult({
          body: Buffer.concat(out).toString("utf8"),
          log: Buffer.concat(err).toString("utf8"),
          exitCode: code ?? 1,
          signal,
        });
      });
    },
  );

  if (!result.body) {
    // The engine advertises the semantic_tree formats in `fetch --help` but its
    // CLI path emits nothing for them (verified against velora 1.0.2); only the
    // CDP path renders them. Say so instead of reporting an empty dump.
    if (format === "semantic_tree" || format === "semantic_tree_text") {
      throw new ProtocolError(
        `velora fetch --dump ${format} produced no output: the engine only renders `
          + "semantic trees over CDP. Use page.agent.semanticTree({ format: \"text\" }) "
          + "via launchVelora(), or dump 'html' / 'markdown' here.",
      );
    }
    throw new ProtocolError(
      `velora fetch produced no output (exit ${result.exitCode}${result.signal ? `, ${result.signal}` : ""})`
        + `\n${result.log.slice(-2000)}`,
    );
  }

  if (options.output) await writeFile(options.output, result.body);

  return { url: parsed.href, format, args, ...result };
}
