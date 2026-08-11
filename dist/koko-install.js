import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { ProtocolError } from "./cdp/errors.js";
function shellQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function tryBrewPrefix(formula = "koko") {
    try {
        const out = execSync(`brew --prefix ${shellQuote(formula)} 2>/dev/null`, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return out || undefined;
    }
    catch {
        return undefined;
    }
}
function tryWhich(command) {
    try {
        const out = execSync(`command -v ${shellQuote(command)}`, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return out || undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * An install root is usable when it ships the fingerprint store the engine
 * resolves identities from (`FingerprintStore.installedFolder`). The built-in
 * `koko` identity is the marker; a store with other fingerprints still counts.
 */
function hasEngineBundle(dataRoot) {
    const store = join(dataRoot, "browser", "fingerprints");
    if (existsSync(join(store, "koko", "fingerprint.json")))
        return true;
    if (!existsSync(store))
        return false;
    return readdirSync(store, { withFileTypes: true }).some((entry) => entry.isDirectory() && existsSync(join(store, entry.name, "fingerprint.json")));
}
function brewInstall() {
    const prefix = tryBrewPrefix("koko");
    if (!prefix)
        return undefined;
    const binary = join(prefix, "bin/koko");
    const dataRoot = join(prefix, "share/koko");
    if (!existsSync(binary) || !hasEngineBundle(dataRoot)) {
        return undefined;
    }
    return {
        id: "homebrew",
        label: `Homebrew (${prefix})`,
        binary,
        dataRoot,
        source: "homebrew",
    };
}
function pathInstall() {
    const onPath = tryWhich("koko");
    if (!onPath)
        return undefined;
    const dataRoot = inferDataRootFromBinary(onPath);
    if (!dataRoot)
        return undefined;
    return {
        id: "path",
        label: `PATH (${onPath})`,
        binary: onPath,
        dataRoot,
        source: "path",
    };
}
function zigDevInstall(dataRoot) {
    const binary = join(dataRoot, "zig-out/bin/koko");
    if (!existsSync(binary) || !hasEngineBundle(dataRoot)) {
        return undefined;
    }
    return {
        id: "zig-out",
        label: `zig-out (${dataRoot})`,
        binary,
        dataRoot,
        source: "zig_dev",
    };
}
function inferDataRootFromBinary(binary) {
    if (binary.includes("/zig-out/bin/koko")) {
        const root = resolve(dirname(binary), "../..");
        if (hasEngineBundle(root))
            return root;
    }
    for (const rel of ["../share/koko", "../../share/koko"]) {
        const candidate = resolve(dirname(binary), rel);
        if (hasEngineBundle(candidate))
            return candidate;
    }
    return brewInstall()?.dataRoot;
}
function installFromRepoRoot(dataRoot, id, label, source = "preset") {
    const resolved = resolve(dataRoot);
    const zig = zigDevInstall(resolved);
    if (zig)
        return { ...zig, id, label, source };
    const binOnly = join(resolved, "bin/koko");
    if (existsSync(binOnly) && hasEngineBundle(resolved)) {
        return {
            id,
            label,
            binary: binOnly,
            dataRoot: resolved,
            source,
        };
    }
    return undefined;
}
function installFromExplicitPath(path, id, label) {
    const resolved = resolve(path);
    if (!existsSync(resolved))
        return undefined;
    // Must test for a *file*: a source checkout is itself named `koko`, so a
    // name-only check misreads the repo root as the binary.
    if (basename(resolved) === "koko" && statSync(resolved).isFile()) {
        const dataRoot = inferDataRootFromBinary(resolved);
        if (!dataRoot)
            return undefined;
        return {
            id,
            label,
            binary: resolved,
            dataRoot,
            source: "explicit",
        };
    }
    return installFromRepoRoot(resolved, id, label, "explicit");
}
function envPresetInstall(name) {
    const key = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const envPath = process.env[`KOKO_INSTALL_${key}`];
    if (!envPath)
        return undefined;
    return installFromExplicitPath(envPath, name, `${name} (${envPath})`);
}
const BUILTIN_PRESETS = {
    homebrew: brewInstall,
    path: pathInstall,
};
function resolvePreset(preset) {
    const install = BUILTIN_PRESETS[preset]();
    if (!install) {
        throw new ProtocolError(`Koko install preset "${preset}" not found on this machine`);
    }
    return install;
}
function resolveInstallKey(key) {
    if (key in BUILTIN_PRESETS) {
        return resolvePreset(key);
    }
    const fromEnv = envPresetInstall(key);
    if (fromEnv)
        return fromEnv;
    const fromPath = installFromExplicitPath(key, key, key);
    if (fromPath)
        return fromPath;
    const envHint = `KOKO_INSTALL_${key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    throw new ProtocolError(`Unknown Koko install "${key}". Use a preset (homebrew, path), an absolute path, or set ${envHint}.`);
}
function applyDataRootOverride(install, explicitDataRoot) {
    if (!explicitDataRoot)
        return install;
    const dataRoot = resolve(explicitDataRoot);
    if (!hasEngineBundle(dataRoot)) {
        throw new ProtocolError(`Koko data not found: ${dataRoot}`);
    }
    return { ...install, dataRoot };
}
function autoResolve(explicitDataRoot) {
    if (process.env.KOKO_BIN) {
        const dataRoot = explicitDataRoot ?? inferDataRootFromBinary(process.env.KOKO_BIN);
        if (!dataRoot)
            throw new ProtocolError("Koko data not found for KOKO_BIN");
        return {
            id: "koko_bin",
            label: `KOKO_BIN (${process.env.KOKO_BIN})`,
            binary: process.env.KOKO_BIN,
            dataRoot,
            source: "koko_bin",
        };
    }
    // A dataRoot pointing at a source checkout is self-describing: prefer its own
    // zig-out build over an unrelated system install, so a dev tree needs no
    // Homebrew koko on PATH.
    if (explicitDataRoot) {
        const dev = zigDevInstall(resolve(explicitDataRoot));
        if (dev)
            return dev;
    }
    const brew = brewInstall();
    if (brew)
        return applyDataRootOverride(brew, explicitDataRoot);
    const onPath = pathInstall();
    if (onPath)
        return applyDataRootOverride(onPath, explicitDataRoot);
    throw new ProtocolError("Koko not found. Install: brew tap ivanUri/tap && brew install koko "
        + "— or set binary / install / dataRoot to an absolute path "
        + "(a source checkout needs zig-out/bin/koko built).");
}
/**
 * List engine installs detected on this machine (for picking `install` in tests).
 */
export function listKokoInstalls() {
    const seen = new Set();
    const out = [];
    const push = (install) => {
        if (!install)
            return;
        const key = `${install.binary}\0${install.dataRoot}`;
        if (seen.has(key))
            return;
        seen.add(key);
        out.push(install);
    };
    push(brewInstall());
    push(pathInstall());
    if (process.env.KOKO_BIN) {
        push(installFromExplicitPath(process.env.KOKO_BIN, "koko_bin", `KOKO_BIN (${process.env.KOKO_BIN})`));
    }
    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith("KOKO_INSTALL_") || !value)
            continue;
        const name = key.slice("KOKO_INSTALL_".length).toLowerCase().replace(/_/g, "-");
        push(envPresetInstall(name));
    }
    return out;
}
/**
 * Resolve koko binary + engine data root (`share/koko` or git checkout).
 * Priority: `binary` → `install` / `$KOKO_INSTALL` → `$KOKO_BIN` → auto discovery.
 */
export function resolveKokoInstall(options = {}) {
    const explicitDataRoot = options.dataRoot ?? options.repoRoot
        ?? process.env.KOKO_DATA
        ?? process.env.KOKO_ROOT
        ?? undefined;
    if (options.binary) {
        const dataRoot = explicitDataRoot ?? inferDataRootFromBinary(options.binary);
        if (!dataRoot)
            throw new ProtocolError(`Koko data not found for ${options.binary}`);
        return {
            id: "explicit",
            label: `explicit (${options.binary})`,
            binary: options.binary,
            dataRoot,
            source: "explicit",
        };
    }
    const installKey = options.install ?? process.env.KOKO_INSTALL;
    if (installKey && installKey !== "auto") {
        return applyDataRootOverride(resolveInstallKey(installKey), explicitDataRoot);
    }
    return autoResolve(explicitDataRoot);
}
/** Default engine data root (Homebrew `share/koko` when installed). */
export function defaultKokoDataRoot() {
    return resolveKokoInstall().dataRoot;
}
//# sourceMappingURL=koko-install.js.map