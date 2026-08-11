/**
 * Profile preferences written by the engine
 * (`src/runtime/profile/ProfilePaths.zig`). Version 3 references a
 * fingerprint id; the engine rejects any other version.
 */
export interface PreferencesV3 {
    version: 3;
    name: string;
    /** Fingerprint folder id, e.g. `koko`, `chrome-macos-sonoma`. */
    fingerprint: string;
    created?: string;
}
/** Folder name of a fingerprint embedded in a profile instance. */
export declare const FINGERPRINT_DIR = "fingerprint";
/** Fingerprint definition file inside a fingerprint folder. */
export declare const FINGERPRINT_FILE = "fingerprint.json";
/**
 * Fingerprint id used when a profile folder has no Preferences.json.
 * Mirrors `ProfileManager.defaultFingerprintForName`.
 */
export declare function defaultFingerprintForName(profileName: string): string;
/** Installed fingerprint folder: `<dataRoot>/browser/fingerprints/<id>/`. */
export declare function fingerprintDir(dataRoot: string, fingerprintId: string): string;
export declare function fingerprintDefinitionPath(dataRoot: string, fingerprintId: string): string;
/** Installed fingerprint ids under `<dataRoot>/browser/fingerprints/`. */
export declare function listFingerprints(dataRoot: string): string[];
/** Named browser profile folder inside user-data-dir. */
export declare function profileDir(userDataDir: string, profileName: string): string;
export declare function profilePreferencesPath(userDataDir: string, profileName: string): string;
/** Fingerprint embedded in a profile instance (`<profile>/fingerprint/`). */
export declare function profileFingerprintDir(userDataDir: string, profileName: string): string;
/** Portable `.koko-profile` bundle directory. */
export declare function bundleDir(name: string, userDataDir?: string): string;
/**
 * Fingerprint folder inside an exported bundle.
 * `koko profile export` writes `<bundle>/fingerprint/fingerprint.json`;
 * flat bundles (fingerprint.json at the root) are accepted too.
 */
export declare function bundleFingerprintDir(bundlePath: string): string;
export declare function readPreferences(userDataDir: string, profileName: string): PreferencesV3 | null;
export interface ResolveFingerprintOptions {
    /** Engine install root that owns `browser/fingerprints/`. */
    dataRoot: string;
    profile?: string;
    userDataDir?: string;
    /** Explicit fingerprint folder (`--fingerprint-folder`). */
    fingerprintFolder?: string;
    /** Portable `.koko-profile` bundle directory. */
    profileBundle?: string;
    /** Installed fingerprint id under `browser/fingerprints/`. */
    fingerprint?: string;
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
export declare function resolveFingerprintFolder(options: ResolveFingerprintOptions): string | undefined;
