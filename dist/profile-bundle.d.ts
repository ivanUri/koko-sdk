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
/**
 * List profiles in user-data-dir.
 *
 * `velora profile list` renders fixed-width columns via `std.debug.print`, so
 * the table arrives on **stderr**, and a name wider than its column shifts the
 * later fields. Rows are therefore anchored on the profile path (always
 * `<user-data-dir>/<name>`) rather than split on whitespace.
 */
export declare function listProfiles(options?: ProfileBundleCommonOptions): Promise<ProfileListEntry[]>;
/** Create a profile folder bound to an installed fingerprint id. */
export declare function createProfile(options: CreateProfileOptions): Promise<ProfileBundleResult>;
export declare function deleteProfile(options: DeleteProfileOptions): Promise<ProfileBundleResult>;
/** Seed a profile's Cookies.json from an exported cookie file. */
export declare function importCookies(options: ImportCookiesOptions): Promise<ProfileBundleResult>;
/**
 * Export a profile to a portable `.velora-profile` bundle
 * (`fingerprint/`, `Preferences.json`, `session/`).
 */
export declare function exportProfile(options: ExportProfileOptions): Promise<ProfileBundleResult>;
/** Import a bundle into user-data-dir as a named profile. */
export declare function importProfile(options: ImportProfileOptions): Promise<ProfileBundleResult>;
