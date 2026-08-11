import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultUserDataDir } from "./profile-paths.js";
/** Folder name of a fingerprint embedded in a profile instance. */
export const FINGERPRINT_DIR = "fingerprint";
/** Fingerprint definition file inside a fingerprint folder. */
export const FINGERPRINT_FILE = "fingerprint.json";
/**
 * Fingerprint id used when a profile folder has no Preferences.json.
 * Mirrors `ProfileManager.defaultFingerprintForName`.
 */
export function defaultFingerprintForName(profileName) {
    return profileName === "Default" ? "koko" : profileName;
}
/** Installed fingerprint folder: `<dataRoot>/browser/fingerprints/<id>/`. */
export function fingerprintDir(dataRoot, fingerprintId) {
    return join(dataRoot, "browser", "fingerprints", fingerprintId);
}
export function fingerprintDefinitionPath(dataRoot, fingerprintId) {
    return join(fingerprintDir(dataRoot, fingerprintId), FINGERPRINT_FILE);
}
/** Installed fingerprint ids under `<dataRoot>/browser/fingerprints/`. */
export function listFingerprints(dataRoot) {
    const root = join(dataRoot, "browser", "fingerprints");
    if (!existsSync(root))
        return [];
    return readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(root, e.name, FINGERPRINT_FILE)))
        .map((e) => e.name)
        .sort();
}
/** Named browser profile folder inside user-data-dir. */
export function profileDir(userDataDir, profileName) {
    return join(userDataDir, profileName);
}
export function profilePreferencesPath(userDataDir, profileName) {
    return join(profileDir(userDataDir, profileName), "Preferences.json");
}
/** Fingerprint embedded in a profile instance (`<profile>/fingerprint/`). */
export function profileFingerprintDir(userDataDir, profileName) {
    return join(profileDir(userDataDir, profileName), FINGERPRINT_DIR);
}
/** Portable `.koko-profile` bundle directory. */
export function bundleDir(name, userDataDir = defaultUserDataDir()) {
    return join(userDataDir, `${name}.koko-profile`);
}
/**
 * Fingerprint folder inside an exported bundle.
 * `koko profile export` writes `<bundle>/fingerprint/fingerprint.json`;
 * flat bundles (fingerprint.json at the root) are accepted too.
 */
export function bundleFingerprintDir(bundlePath) {
    const nested = join(bundlePath, FINGERPRINT_DIR);
    if (existsSync(join(nested, FINGERPRINT_FILE)))
        return nested;
    if (existsSync(join(bundlePath, FINGERPRINT_FILE)))
        return bundlePath;
    throw new Error(`Bundle missing ${FINGERPRINT_DIR}/${FINGERPRINT_FILE}: ${bundlePath}`);
}
export function readPreferences(userDataDir, profileName) {
    const path = profilePreferencesPath(userDataDir, profileName);
    if (!existsSync(path))
        return null;
    const prefs = JSON.parse(readFileSync(path, "utf8"));
    return prefs.version === 3 && prefs.fingerprint ? prefs : null;
}
/**
 * Resolve the folder to pass to `koko --fingerprint-folder`.
 *
 * Order: explicit folder → bundle → profile-embedded → installed fingerprint
 * (explicit id, else the id recorded in the profile's Preferences.json).
 * Returns undefined when the engine should resolve the fingerprint itself
 * from the profile's Preferences.json.
 *
 * The engine rejects a path ending in `.json` (`FingerprintMustBeFolder`), so
 * a definition file is normalised to its containing folder.
 */
export function resolveFingerprintFolder(options) {
    if (options.fingerprintFolder) {
        const p = options.fingerprintFolder;
        if (existsSync(join(p, FINGERPRINT_FILE)))
            return p;
        if (p.endsWith(FINGERPRINT_FILE) && existsSync(p))
            return join(p, "..");
        throw new Error(`fingerprintFolder not found: ${p}`);
    }
    if (options.profileBundle) {
        return bundleFingerprintDir(options.profileBundle);
    }
    const userDataDir = options.userDataDir ?? defaultUserDataDir();
    if (options.profile) {
        const embedded = profileFingerprintDir(userDataDir, options.profile);
        if (existsSync(join(embedded, FINGERPRINT_FILE)))
            return embedded;
    }
    const id = options.fingerprint
        ?? (options.profile ? readPreferences(userDataDir, options.profile)?.fingerprint : undefined);
    if (id) {
        const installed = fingerprintDir(options.dataRoot, id);
        if (existsSync(join(installed, FINGERPRINT_FILE)))
            return installed;
        if (options.fingerprint) {
            throw new Error(`Fingerprint not installed: ${installed}`);
        }
    }
    return undefined;
}
//# sourceMappingURL=profile.js.map