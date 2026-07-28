import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Browser } from "./browser.js";
import { cleanupHydratedProfile, flushRemoteSession, hydrateRemoteProfile, } from "../profile-api.js";
import { FINGERPRINT_FILE, fingerprintDir, resolveFingerprintFolder, } from "../profile.js";
import { resolveVeloraInstall } from "../velora-install.js";
import { toEngineArgs } from "./engine-options.js";
import { delay } from "../utils/timeout.js";
import { ProtocolError } from "../cdp/errors.js";
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
async function waitForCdp(endpoint, proc, timeoutMs) {
    const started = Date.now();
    const exited = () => new ProtocolError(`velora exited before CDP was ready (code ${proc.exitCode}). `
        + `Re-run with stdio: "inherit" to see why.`);
    while (Date.now() - started < timeoutMs) {
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
}
export async function launchVelora(options = {}) {
    const install = resolveVeloraInstall(options);
    const { binary, dataRoot } = install;
    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? await getFreePort();
    let hydrated;
    let profile = pickProfile(options);
    let userDataDir = options.userDataDir;
    let fingerprintFolder;
    const profileId = options.profileId;
    const veloraApi = options.veloraApi ?? (profileId ? process.env.VELORA_API_URL : undefined);
    const apiKey = options.apiKey ?? process.env.VELORA_API_KEY;
    if (profileId) {
        if (!veloraApi) {
            throw new ProtocolError("profileId requires veloraApi (or VELORA_API_URL)");
        }
        hydrated = await hydrateRemoteProfile({ veloraApi, profileId, apiKey });
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
        // built-in identity so a bare launchVelora() works out of the box.
        if (!fingerprintFolder && !profile) {
            profile = "Default";
            const builtin = fingerprintDir(dataRoot, "velora");
            if (!existsSync(join(builtin, FINGERPRINT_FILE))) {
                throw new ProtocolError(`Built-in fingerprint not found: ${join(builtin, FINGERPRINT_FILE)}. `
                    + "Pass fingerprint, fingerprintFolder, or profileBundle.");
            }
            fingerprintFolder = builtin;
        }
    }
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
    const proc = spawn(binary, args, {
        cwd: dataRoot,
        stdio: options.stdio ?? "ignore",
        env: {
            ...process.env,
            VELORA_ROOT: dataRoot,
            VELORA_DATA: dataRoot,
        },
    });
    const endpoint = `http://${host}:${port}`;
    proc.on("error", (err) => {
        throw new ProtocolError(`failed to spawn velora: ${err.message}`);
    });
    await waitForCdp(endpoint, proc, options.launchTimeout ?? 15_000);
    // Launched browsers create targets explicitly; auto-attach is unstable on velora 1.0.x.
    const browser = await Browser.connect(endpoint, {
        ...options,
        enableTargetTracking: options.enableTargetTracking ?? false,
    });
    return {
        browser,
        endpoint,
        port,
        profile,
        fingerprintFolder,
        profileId: profileId ?? undefined,
        veloraApi: veloraApi ?? undefined,
        hydratedWorkDir: hydrated?.workDir,
        binary,
        dataRoot,
        installSource: install.source,
        args,
        process: proc,
        async close() {
            await browser.close().catch(() => undefined);
            if (!proc.killed)
                proc.kill("SIGTERM");
            if (hydrated && veloraApi) {
                await flushRemoteSession({
                    veloraApi,
                    apiKey,
                    profileId: hydrated.profileId,
                    profileDir: hydrated.profileDir,
                    record: hydrated.record,
                }).catch(() => undefined);
                cleanupHydratedProfile(hydrated.workDir);
            }
        },
    };
}
//# sourceMappingURL=launch.js.map