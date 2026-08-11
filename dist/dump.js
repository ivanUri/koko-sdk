import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolveFingerprintFolder } from "./profile.js";
import { resolveKokoInstall } from "./koko-install.js";
import { toEngineArgs } from "./browser/engine-options.js";
import { ProtocolError } from "./cdp/errors.js";
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
export async function dump(url, options = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new ProtocolError(`url must be http:// or https://, got ${parsed.protocol}`);
    }
    const install = resolveKokoInstall(options);
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
    if (options.strip?.length)
        args.push("--strip-mode", options.strip.join(","));
    if (options.withBase)
        args.push("--with-base");
    if (options.withFrames)
        args.push("--with-frames");
    if (options.waitMs != null)
        args.push("--wait-ms", String(options.waitMs));
    if (options.waitUntil)
        args.push("--wait-until", options.waitUntil);
    if (options.waitSelector)
        args.push("--wait-selector", options.waitSelector);
    if (options.waitScript)
        args.push("--wait-script", options.waitScript);
    if (options.waitScriptFile)
        args.push("--wait-script-file", options.waitScriptFile);
    if (options.clickSelector)
        args.push("--click-selector", options.clickSelector);
    if (options.clickOffsetX != null)
        args.push("--click-offset-x", String(options.clickOffsetX));
    if (options.clickOffsetY != null)
        args.push("--click-offset-y", String(options.clickOffsetY));
    if (options.terminateMs != null)
        args.push("--terminate-ms", String(options.terminateMs));
    if (options.profile)
        args.push("--browser-profile", options.profile);
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
    const result = await new Promise((resolveResult, reject) => {
        const out = [];
        const err = [];
        const proc = spawn(binary, args, {
            cwd: dataRoot,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, KOKO_ROOT: dataRoot, KOKO_DATA: dataRoot },
        });
        const timer = setTimeout(() => proc.kill("SIGKILL"), timeout);
        timer.unref?.();
        proc.stdout?.on("data", (d) => out.push(d));
        proc.stderr?.on("data", (d) => err.push(d));
        proc.on("error", (e) => {
            clearTimeout(timer);
            reject(new ProtocolError(`failed to spawn koko: ${e.message}`));
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
    });
    if (!result.body) {
        // The engine advertises the semantic_tree formats in `fetch --help` but its
        // CLI path emits nothing for them (verified against koko 1.0.2); only the
        // CDP path renders them. Say so instead of reporting an empty dump.
        if (format === "semantic_tree" || format === "semantic_tree_text") {
            throw new ProtocolError(`koko fetch --dump ${format} produced no output: the engine only renders `
                + "semantic trees over CDP. Use page.agent.semanticTree({ format: \"text\" }) "
                + "via launchKoko(), or dump 'html' / 'markdown' here.");
        }
        throw new ProtocolError(`koko fetch produced no output (exit ${result.exitCode}${result.signal ? `, ${result.signal}` : ""})`
            + `\n${result.log.slice(-2000)}`);
    }
    if (options.output)
        await writeFile(options.output, result.body);
    return { url: parsed.href, format, args, ...result };
}
//# sourceMappingURL=dump.js.map