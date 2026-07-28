import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { ProtocolError } from "./cdp/errors.js";
import { defaultUserDataDir } from "./profile-paths.js";
import { resolveVeloraInstall } from "./velora-install.js";

export interface ProfileBundleCommonOptions {
  /** Engine install root (VELORA_ROOT). */
  dataRoot?: string;
  /** Chrome-style session root. */
  userDataDir?: string;
  /** Path to velora binary. */
  binary?: string;
}

export interface ExportProfileOptions extends ProfileBundleCommonOptions {
  name: string;
  /** Output bundle directory (default: `<userDataDir>/<name>.velora-profile`). */
  out?: string;
}

export interface ImportProfileOptions extends ProfileBundleCommonOptions {
  name: string;
  /** Bundle directory containing `fingerprint/fingerprint.json`. */
  from: string;
}

export interface CreateProfileOptions extends ProfileBundleCommonOptions {
  name: string;
  /**
   * Installed fingerprint id under `browser/fingerprints/`.
   * Defaults to `velora` for a profile named `Default`, otherwise the profile name.
   */
  fingerprint?: string;
}

export interface DeleteProfileOptions extends ProfileBundleCommonOptions {
  name: string;
}

export interface ImportCookiesOptions extends ProfileBundleCommonOptions {
  /** Target profile (defaults to the engine's active profile). */
  name?: string;
  /** Source Cookies.json. */
  from: string;
}

export interface ProfileBundleResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProfileListEntry {
  name: string;
  fingerprint: string;
  profileDir: string;
  /** Marked as last used by the engine's Local State.json. */
  active: boolean;
}

function resolveInstall(options: ProfileBundleCommonOptions) {
  return resolveVeloraInstall({
    binary: options.binary,
    dataRoot: options.dataRoot,
  });
}

async function runProcess(
  command: string,
  args: string[],
  cwd: string,
): Promise<ProfileBundleResult> {
  return new Promise((resolveResult, reject) => {
    const chunksOut: Buffer[] = [];
    const chunksErr: Buffer[] = [];
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
        reject(new ProtocolError(
          `${command} ${args.join(" ")} failed (exit ${exitCode})\n${stderr || stdout}`.trim(),
        ));
        return;
      }
      resolveResult({ stdout, stderr, exitCode });
    });
  });
}

async function runVeloraProfile(
  subArgs: string[],
  options: ProfileBundleCommonOptions,
): Promise<ProfileBundleResult> {
  const { binary, dataRoot } = resolveInstall(options);
  const userDataDir = options.userDataDir ?? defaultUserDataDir();
  const args = ["profile", ...subArgs, "--user-data-dir", userDataDir];
  return runProcess(binary, args, dataRoot);
}

/**
 * List profiles in user-data-dir.
 *
 * `velora profile list` renders fixed-width columns via `std.debug.print`, so
 * the table arrives on **stderr**, and a name wider than its column shifts the
 * later fields. Rows are therefore anchored on the profile path (always
 * `<user-data-dir>/<name>`) rather than split on whitespace.
 */
export async function listProfiles(
  options: ProfileBundleCommonOptions = {},
): Promise<ProfileListEntry[]> {
  const result = await runVeloraProfile(["list"], options);
  const text = `${result.stderr}\n${result.stdout}`;
  const lines = text.split("\n");

  const root = lines
    .find((l) => l.startsWith("user-data-dir:"))
    ?.slice("user-data-dir:".length)
    .trim()
    ?? options.userDataDir
    ?? defaultUserDataDir();

  const entries: ProfileListEntry[] = [];
  for (const line of lines) {
    if (line.startsWith("user-data-dir:") || line.startsWith("last-created:")) continue;
    const idx = line.indexOf(`${root}/`);
    if (idx < 0) continue;

    let rest = line.slice(idx).trimEnd();
    const active = rest.endsWith("*");
    if (active) rest = rest.slice(0, -1).trimEnd();

    const name = rest.slice(root.length + 1);
    if (!name) continue;

    const head = line.slice(0, idx).trim();
    const fingerprint = head.startsWith(name) ? head.slice(name.length).trim() : head;

    entries.push({ name, fingerprint, profileDir: rest, active });
  }
  return entries;
}

/** Create a profile folder bound to an installed fingerprint id. */
export async function createProfile(
  options: CreateProfileOptions,
): Promise<ProfileBundleResult> {
  const args = ["create", "--name", options.name];
  if (options.fingerprint) args.push("--fingerprint", options.fingerprint);
  return runVeloraProfile(args, options);
}

export async function deleteProfile(
  options: DeleteProfileOptions,
): Promise<ProfileBundleResult> {
  return runVeloraProfile(["delete", "--name", options.name], options);
}

/** Seed a profile's Cookies.json from an exported cookie file. */
export async function importCookies(
  options: ImportCookiesOptions,
): Promise<ProfileBundleResult> {
  const args = ["import-cookies"];
  if (options.name) args.push("--name", options.name);
  args.push("--from", resolve(options.from));
  return runVeloraProfile(args, options);
}

/**
 * Export a profile to a portable `.velora-profile` bundle
 * (`fingerprint/`, `Preferences.json`, `session/`).
 */
export async function exportProfile(
  options: ExportProfileOptions,
): Promise<ProfileBundleResult> {
  const args = ["export", "--name", options.name];
  if (options.out) args.push("--to", resolve(options.out));
  return runVeloraProfile(args, options);
}

/** Import a bundle into user-data-dir as a named profile. */
export async function importProfile(
  options: ImportProfileOptions,
): Promise<ProfileBundleResult> {
  return runVeloraProfile([
    "import",
    "--name",
    options.name,
    "--from",
    resolve(options.from),
  ], options);
}
