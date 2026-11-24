import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Browser } from "./browser.js";
import { cleanupHydratedProfile, flushRemoteSession, hydrateRemoteProfile, } from "../profile-api.js";
import { FINGERPRINT_FILE, fingerprintDir, resolveFingerprintFolder, } from "../profile.js";
import { resolveKokoInstall } from "../koko-install.js";
import { toEngineArgs, toServeArgs, } from "./engine-options.js";
import { delay } from "../utils/timeout.js";
import { ProtocolError } from "../cdp/errors.js";
import { performance } from "node:perf_hooks";
import { readKokoDiagnostics } from "./diagnostics.js";
function pickProfile(options) {
    if (options.profile)
        return options.profile;
    if (options.profilePool?.length) {
        const idx = Math.floor(Math.random() * options.profilePool.length);
        return options.profilePool[idx];
    }
    return undefined;
}
async function getFreePort() {
    return new Promise((resolvePort, reject) => {
        const server = createServer();
        server.unref();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            const port = typeof addr === "object" && addr ? addr.port : 0;
            server.close(() => resolvePort(port));
        });
    });
}
export async function waitForCdp(endpoint, proc, timeoutMs) {
    let spawnError;
    const pollEndpoint = async () => {
        const started = Date.now();
        const exited = () => new ProtocolError(`koko exited before CDP was ready (code ${proc.exitCode}). `
            + `Re-run with stdio: "inherit" to see why.`);
        while (Date.now() - started < timeoutMs) {
            if (spawnError)
                throw spawnError;
            if (proc.exitCode != null)
                throw exited();
            try {
                const res = await fetch(`${endpoint}/json/version`);
                if (res.ok)
                    return;
            }
            catch {
                // endpoint not listening yet
            }
            await delay(100);
        }
        if (proc.exitCode != null)
            throw exited();
        throw new ProtocolError(`CDP endpoint not ready: ${endpoint}`, { timeout: timeoutMs });
    };
    let onSpawnError;
    const spawnFailure = new Promise((_, reject) => {
        onSpawnError = (error) => {
            spawnError = new ProtocolError(`failed to spawn koko: ${error.message}`, {
                payload: error,
            });
            reject(spawnError);
        };
        proc.once("error", onSpawnError);
    });
    try {
        await Promise.race([pollEndpoint(), spawnFailure]);
    }
    finally {
        if (onSpawnError)
            proc.off("error", onSpawnError);
    }
}
export async function terminateChildProcess(proc, timeoutMs = 2_000) {
    if (proc.exitCode != null || proc.signalCode != null)
        return;
    const waitForExit = () => new Promise((resolve) => {
        if (proc.exitCode != null || proc.signalCode != null) {
            resolve(true);
            return;
        }
        const timer = setTimeout(() => {
            proc.off("exit", onExit);
            resolve(false);
        }, timeoutMs);
        const onExit = () => {
            clearTimeout(timer);
            resolve(true);
        };
        proc.once("exit", onExit);
    });
    const firstExit = waitForExit();
    proc.kill("SIGTERM");
    if (await firstExit)
        return;
    const secondExit = waitForExit();
    proc.kill("SIGKILL");
    await secondExit;
}
export async function launchKoko(options = {}) {
    const launchStartedAt = Date.now();
    const launchStartedClock = performance.now();
    const install = resolveKokoInstall(options);
    const { binary, dataRoot } = install;
    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? await getFreePort();
    let hydrated;
    let profile = pickProfile(options);
    let userDataDir = options.userDataDir;
    let fingerprintFolder;
    const profileId = options.profileId;
    const kokoApi = options.kokoApi ?? (profileId ? process.env.KOKO_API_URL : undefined);
    const apiKey = options.apiKey ?? process.env.KOKO_API_KEY;
    if (profileId) {
        if (!kokoApi) {
            throw new ProtocolError("profileId requires kokoApi (or KOKO_API_URL)");
        }
        hydrated = await hydrateRemoteProfile({ kokoApi, profileId, apiKey });
        profile = profileId;
        userDataDir = hydrated.userDataDir;
        fingerprintFolder = hydrated.fingerprintDir;
    }
    else {
        fingerprintFolder = resolveFingerprintFolder({
            dataRoot,
            profile,
            userDataDir,
            fingerprintFolder: options.fingerprintFolder,
            profileBundle: options.profileBundle,
            fingerprint: options.fingerprint,
        });
        // No profile and nothing to resolve from: fall back to the engine's own
        // built-in identity so a bare launchKoko() works out of the box.
        if (!fingerprintFolder && !profile) {
            profile = "Default";
            const builtin = fingerprintDir(dataRoot, "koko");
            if (!existsSync(join(builtin, FINGERPRINT_FILE))) {
                throw new ProtocolError(`Built-in fingerprint not found: ${join(builtin, FINGERPRINT_FILE)}. `
                    + "Pass fingerprint, fingerprintFolder, or profileBundle.");
            }
            fingerprintFolder = builtin;
        }
    }
    let proc;
    let browser;
    try {
        const args = ["serve", "--host", host, "--port", String(port)];
        if (options.advertiseHost)
            args.push("--advertise-host", options.advertiseHost);
        if (options.cdpMaxConnections != null) {
            args.push("--cdp-max-connections", String(options.cdpMaxConnections));
        }
        if (options.cdpMaxPendingConnections != null) {
            args.push("--cdp-max-pending-connections", String(options.cdpMaxPendingConnections));
        }
        if (profile)
            args.push("--browser-profile", profile);
        if (options.profilePool?.length && !options.profile) {
            args.push("--browser-profile-pool", options.profilePool.join(","));
        }
        args.push(...toEngineArgs({
            ...options,
            userDataDir,
            fingerprintFolder,
            // Rendered above so the profile flags stay adjacent in the argv.
            profile: undefined,
            profilePool: undefined,
        }));
        args.push(...toServeArgs(options));
        const child = spawn(binary, args, {
            cwd: dataRoot,
            stdio: options.stdio ?? "ignore",
            env: {
                ...process.env,
                KOKO_ROOT: dataRoot,
                KOKO_DATA: dataRoot,
            },
        });
        proc = child;
        const endpoint = `http://${host}:${port}`;
        await waitForCdp(endpoint, child, options.launchTimeout ?? 15_000);
        const cdpReadyClock = performance.now();
        // Launched browsers create targets explicitly; auto-attach is unstable on koko 1.0.x.
        const connectedBrowser = await Browser.connect(endpoint, {
            ...options,
            enableTargetTracking: options.enableTargetTracking ?? false,
        });
        browser = connectedBrowser;
        const browserConnectedClock = performance.now();
        const diagnostics = await readKokoDiagnostics(endpoint, {
            launchStartedAt,
            launchStartedClock,
            cdpReadyClock,
            browserConnectedClock,
        });
        connectedBrowser.setProfileInfo({
            source: profileId ? "remote" : options.profileBundle ? "bundle" : "local",
            name: profile,
            profileId,
            fingerprint: options.fingerprint,
            fingerprintFolder,
            userDataDir,
            known: true,
        });
        let closePromise;
        const launched = {
            browser: connectedBrowser,
            endpoint,
            port,
            profile,
            fingerprintFolder,
            profileId: profileId ?? undefined,
            kokoApi: kokoApi ?? undefined,
            hydratedWorkDir: hydrated?.workDir,
            binary,
            dataRoot,
            installSource: install.source,
            args,
            process: child,
            diagnostics,
            async close() {
                if (closePromise)
                    return closePromise;
                closePromise = (async () => {
                    await connectedBrowser.close().catch(() => undefined);
                    await terminateChildProcess(child).catch(() => undefined);
                    if (hydrated && kokoApi) {
                        try {
                            await flushRemoteSession({
                                kokoApi,
                                apiKey,
                                profileId: hydrated.profileId,
                                profileDir: hydrated.profileDir,
                                record: hydrated.record,
                            });
                        }
                        finally {
                            cleanupHydratedProfile(hydrated.workDir);
                        }
                    }
                })();
                return closePromise;
            },
        };
        return launched;
    }
    catch (error) {
        // A launch is transactional: readiness or CDP connection failures must
        // not leave a child process or hydrated profile behind.
        await browser?.close().catch(() => undefined);
        if (proc)
            await terminateChildProcess(proc).catch(() => undefined);
        if (hydrated)
            cleanupHydratedProfile(hydrated.workDir);
        throw error;
    }
}
//# sourceMappingURL=launch.js.map