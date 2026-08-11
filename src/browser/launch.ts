import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Browser } from "./browser.js";
import type { BrowserConnectOptions } from "./browser.js";
import {
  cleanupHydratedProfile,
  flushRemoteSession,
  hydrateRemoteProfile,
  type HydratedRemoteProfile,
} from "../profile-api.js";
import {
  FINGERPRINT_FILE,
  fingerprintDir,
  resolveFingerprintFolder,
} from "../profile.js";
import { resolveKokoInstall, type KokoInstallPreset } from "../koko-install.js";
import { toEngineArgs, type EngineCommonOptions } from "./engine-options.js";
import { delay } from "../utils/timeout.js";
import { ProtocolError } from "../cdp/errors.js";

export interface KokoLaunchOptions extends BrowserConnectOptions, EngineCommonOptions {
  /** Portable `.koko-profile` bundle directory (uses `fingerprint/` inside). */
  profileBundle?: string;
  /** Installed fingerprint id under `browser/fingerprints/`, e.g. `chrome-macos-sonoma`. */
  fingerprint?: string;
  /** SaaS profile id — hydrate fingerprint + session from control plane API. */
  profileId?: string;
  /** Control plane base URL when using `profileId`. */
  kokoApi?: string;
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
  /** Path to koko binary. */
  binary?: string;
  /**
   * Local engine build: `homebrew`, `path`, repo/binary path, or custom
   * name via `$KOKO_INSTALL_<NAME>`. Default / `$KOKO_INSTALL`: auto discovery.
   */
  install?: KokoInstallPreset | string;
  /**
   * Engine install root (`share/koko` from Homebrew, or git checkout).
   * Sets KOKO_ROOT / KOKO_DATA for the child process.
   */
  dataRoot?: string;
  /** @deprecated Use `dataRoot`. */
  repoRoot?: string;
  /** How long to wait for the CDP endpoint to accept connections (default 15000ms). */
  launchTimeout?: number;
  /** Inherit engine stdio instead of discarding it. Useful when debugging startup. */
  stdio?: "ignore" | "inherit";
}

export interface LaunchedKoko {
  browser: Browser;
  endpoint: string;
  port: number;
  profile?: string;
  /** Resolved `--fingerprint-folder` passed to koko, if any. */
  fingerprintFolder?: string;
  profileId?: string;
  kokoApi?: string;
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

function pickProfile(options: KokoLaunchOptions): string | undefined {
  if (options.profile) return options.profile;
  if (options.profilePool?.length) {
    const idx = Math.floor(Math.random() * options.profilePool.length);
    return options.profilePool[idx];
  }
  return undefined;
}

async function getFreePort(): Promise<number> {
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

export async function waitForCdp(
  endpoint: string,
  proc: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  let spawnError: ProtocolError | undefined;
  const pollEndpoint = async (): Promise<void> => {
    const started = Date.now();
    const exited = (): ProtocolError => new ProtocolError(
      `koko exited before CDP was ready (code ${proc.exitCode}). `
        + `Re-run with stdio: "inherit" to see why.`,
    );
    while (Date.now() - started < timeoutMs) {
      if (spawnError) throw spawnError;
      if (proc.exitCode != null) throw exited();
      try {
        const res = await fetch(`${endpoint}/json/version`);
        if (res.ok) return;
      } catch {
        // endpoint not listening yet
      }
      await delay(100);
    }
    if (proc.exitCode != null) throw exited();
    throw new ProtocolError(`CDP endpoint not ready: ${endpoint}`, { timeout: timeoutMs });
  };

  let onSpawnError: ((error: Error) => void) | undefined;
  const spawnFailure = new Promise<never>((_, reject) => {
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
  } finally {
    if (onSpawnError) proc.off("error", onSpawnError);
  }
}

export async function terminateChildProcess(proc: ChildProcess, timeoutMs = 2_000): Promise<void> {
  if (proc.exitCode != null || proc.signalCode != null) return;
  const waitForExit = (): Promise<boolean> => new Promise((resolve) => {
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

  proc.kill("SIGTERM");
  if (await waitForExit()) return;
  proc.kill("SIGKILL");
  await waitForExit();
}

export async function launchKoko(options: KokoLaunchOptions = {}): Promise<LaunchedKoko> {
  const install = resolveKokoInstall(options);
  const { binary, dataRoot } = install;
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? await getFreePort();

  let hydrated: HydratedRemoteProfile | undefined;
  let profile = pickProfile(options);
  let userDataDir = options.userDataDir;
  let fingerprintFolder: string | undefined;

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
  } else {
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
        throw new ProtocolError(
          `Built-in fingerprint not found: ${join(builtin, FINGERPRINT_FILE)}. `
            + "Pass fingerprint, fingerprintFolder, or profileBundle.",
        );
      }
      fingerprintFolder = builtin;
    }
  }

  const args = ["serve", "--host", host, "--port", String(port)];
  if (options.advertiseHost) args.push("--advertise-host", options.advertiseHost);
  if (options.cdpMaxConnections != null) {
    args.push("--cdp-max-connections", String(options.cdpMaxConnections));
  }
  if (options.cdpMaxPendingConnections != null) {
    args.push("--cdp-max-pending-connections", String(options.cdpMaxPendingConnections));
  }
  if (profile) args.push("--browser-profile", profile);
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
      KOKO_ROOT: dataRoot,
      KOKO_DATA: dataRoot,
    },
  });
  const endpoint = `http://${host}:${port}`;

  await waitForCdp(endpoint, proc, options.launchTimeout ?? 15_000);
  // Launched browsers create targets explicitly; auto-attach is unstable on koko 1.0.x.
  const browser = await Browser.connect(endpoint, {
    ...options,
    enableTargetTracking: options.enableTargetTracking ?? false,
  });
  browser.setProfileInfo({
    source: profileId ? "remote" : options.profileBundle ? "bundle" : "local",
    name: profile,
    profileId,
    fingerprint: options.fingerprint,
    fingerprintFolder,
    userDataDir,
    known: true,
  });

  let closePromise: Promise<void> | undefined;
  const launched: LaunchedKoko = {
    browser,
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
    process: proc,
    async close() {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        await browser.close().catch(() => undefined);
        await terminateChildProcess(proc).catch(() => undefined);
        if (hydrated && kokoApi) {
          try {
            await flushRemoteSession({
              kokoApi,
              apiKey,
              profileId: hydrated.profileId,
              profileDir: hydrated.profileDir,
              record: hydrated.record,
            });
          } finally {
            cleanupHydratedProfile(hydrated.workDir);
          }
        }
      })();
      return closePromise;
    },
  };
  return launched;
}
