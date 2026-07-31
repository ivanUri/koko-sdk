import { type ChildProcess } from "node:child_process";
import { Browser } from "./browser.js";
import type { BrowserConnectOptions } from "./browser.js";
import { type VeloraInstallPreset } from "../velora-install.js";
import { type EngineCommonOptions } from "./engine-options.js";
export interface VeloraLaunchOptions extends BrowserConnectOptions, EngineCommonOptions {
    /** Portable `.velora-profile` bundle directory (uses `fingerprint/` inside). */
    profileBundle?: string;
    /** Installed fingerprint id under `browser/fingerprints/`, e.g. `chrome-macos-sonoma`. */
    fingerprint?: string;
    /** SaaS profile id — hydrate fingerprint + session from control plane API. */
    profileId?: string;
    /** Control plane base URL when using `profileId`. */
    veloraApi?: string;
    /** Optional API key (`Authorization: Bearer`). */
    apiKey?: string;
    /** CDP port (default: auto free port). */
    port?: number;
    host?: string;
    /** Host advertised in /json/version, e.g. when `host` is 0.0.0.0 (`--advertise-host`). */
    advertiseHost?: string;
    /** Max simultaneous CDP connections (`--cdp-max-connections`, default 16). */
    cdpMaxConnections?: number;
    /** Max pending connections in the accept queue (`--cdp-max-pending-connections`, default 128). */
    cdpMaxPendingConnections?: number;
    /** Path to velora binary. */
    binary?: string;
    /**
     * Local engine build: `homebrew`, `path`, repo/binary path, or custom
     * name via `$VELORA_INSTALL_<NAME>`. Default / `$VELORA_INSTALL`: auto discovery.
     */
    install?: VeloraInstallPreset | string;
    /**
     * Engine install root (`share/velora` from Homebrew, or git checkout).
     * Sets VELORA_ROOT / VELORA_DATA for the child process.
     */
    dataRoot?: string;
    /** @deprecated Use `dataRoot`. */
    repoRoot?: string;
    /** How long to wait for the CDP endpoint to accept connections (default 15000ms). */
    launchTimeout?: number;
    /** Inherit engine stdio instead of discarding it. Useful when debugging startup. */
    stdio?: "ignore" | "inherit";
}
export interface LaunchedVelora {
    browser: Browser;
    endpoint: string;
    port: number;
    profile?: string;
    /** Resolved `--fingerprint-folder` passed to velora, if any. */
    fingerprintFolder?: string;
    profileId?: string;
    veloraApi?: string;
    /** Temp hydration dir when launched via API (cleaned on close). */
    hydratedWorkDir?: string;
    binary: string;
    dataRoot: string;
    installSource: string;
    /** Full argv handed to the engine — useful for reproducing a run. */
    args: string[];
    process: ChildProcess;
    close(): Promise<void>;
}
export declare function waitForCdp(endpoint: string, proc: ChildProcess, timeoutMs: number): Promise<void>;
export declare function terminateChildProcess(proc: ChildProcess, timeoutMs?: number): Promise<void>;
export declare function launchVelora(options?: VeloraLaunchOptions): Promise<LaunchedVelora>;
