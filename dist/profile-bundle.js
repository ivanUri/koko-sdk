import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { ProtocolError } from "./cdp/errors.js";
import { defaultUserDataDir } from "./profile-paths.js";
import { resolveKokoInstall } from "./koko-install.js";
function resolveInstall(options) {
    return resolveKokoInstall({
        binary: options.binary,
        dataRoot: options.dataRoot,
    });
}
async function runProcess(command, args, cwd) {
    return new Promise((resolveResult, reject) => {
        const chunksOut = [];
        const chunksErr = [];
        const proc = spawn(command, args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
        });
        proc.stdout?.on("data", (d) => chunksOut.push(d));
        proc.stderr?.on("data", (d) => chunksErr.push(d));
        proc.on("error", reject);
        proc.on("close", (code) => {
            const stdout = Buffer.concat(chunksOut).toString("utf8");
            const stderr = Buffer.concat(chunksErr).toString("utf8");
            const exitCode = code ?? 1;
            if (exitCode !== 0) {
                reject(new ProtocolError(`${command} ${args.join(" ")} failed (exit ${exitCode})\n${stderr || stdout}`.trim()));
                return;
            }
            resolveResult({ stdout, stderr, exitCode });
        });
    });
}
async function runKokoProfile(subArgs, options) {
    const { binary, dataRoot } = resolveInstall(options);
    const userDataDir = options.userDataDir ?? defaultUserDataDir();
    const args = ["profile", ...subArgs, "--user-data-dir", userDataDir];
    return runProcess(binary, args, dataRoot);
}
/**
 * List profiles in user-data-dir.
 *
 * `koko profile list` renders fixed-width columns via `std.debug.print`, so
 * the table arrives on **stderr**, and a name wider than its column shifts the
 * later fields. Rows are therefore anchored on the profile path (always
 * `<user-data-dir>/<name>`) rather than split on whitespace.
 */
export async function listProfiles(options = {}) {
    const result = await runKokoProfile(["list"], options);
    const text = `${result.stderr}\n${result.stdout}`;
    const lines = text.split("\n");
    const root = lines
        .find((l) => l.startsWith("user-data-dir:"))
        ?.slice("user-data-dir:".length)
        .trim()
        ?? options.userDataDir
        ?? defaultUserDataDir();
    const entries = [];
    for (const line of lines) {
        if (line.startsWith("user-data-dir:") || line.startsWith("last-created:"))
            continue;
        const idx = line.indexOf(`${root}/`);
        if (idx < 0)
            continue;
        let rest = line.slice(idx).trimEnd();
        const active = rest.endsWith("*");
        if (active)
            rest = rest.slice(0, -1).trimEnd();
        const name = rest.slice(root.length + 1);
        if (!name)
            continue;
        const head = line.slice(0, idx).trim();
        const fingerprint = head.startsWith(name) ? head.slice(name.length).trim() : head;
        entries.push({ name, fingerprint, profileDir: rest, active });
    }
    return entries;
}
/** Create a profile folder bound to an installed fingerprint id. */
export async function createProfile(options) {
    const args = ["create", "--name", options.name];
    if (options.fingerprint)
        args.push("--fingerprint", options.fingerprint);
    return runKokoProfile(args, options);
}
export async function deleteProfile(options) {
    return runKokoProfile(["delete", "--name", options.name], options);
}
/** Seed a profile's Cookies.json from an exported cookie file. */
export async function importCookies(options) {
    const args = ["import-cookies"];
    if (options.name)
        args.push("--name", options.name);
    args.push("--from", resolve(options.from));
    return runKokoProfile(args, options);
}
/**
 * Export a profile to a portable `.koko-profile` bundle
 * (`fingerprint/`, `Preferences.json`, `session/`).
 */
export async function exportProfile(options) {
    const args = ["export", "--name", options.name];
    if (options.out)
        args.push("--to", resolve(options.out));
    return runKokoProfile(args, options);
}
/** Import a bundle into user-data-dir as a named profile. */
export async function importProfile(options) {
    return runKokoProfile([
        "import",
        "--name",
        options.name,
        "--from",
        resolve(options.from),
    ], options);
}
//# sourceMappingURL=profile-bundle.js.map