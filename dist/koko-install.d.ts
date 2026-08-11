export type KokoInstallSource = "explicit" | "koko_bin" | "homebrew" | "path" | "zig_dev" | "preset";
/** Built-in install keys for `install` / `$KOKO_INSTALL`. */
export type KokoInstallPreset = "auto" | "homebrew" | "path";
export interface KokoInstall {
    /** Stable id for `Browser.launch({ install: id })`. */
    id: string;
    label: string;
    binary: string;
    dataRoot: string;
    source: KokoInstallSource;
}
export interface ResolveKokoInstallOptions {
    binary?: string;
    dataRoot?: string;
    /** @deprecated Use `dataRoot`. */
    repoRoot?: string;
    /**
     * Pick a local engine build:
     * - `auto` — Homebrew → PATH (default when omitted)
     * - `homebrew` | `path` — force a preset
     * - absolute path to `koko` binary or engine repo root
     * - custom name — resolved from `$KOKO_INSTALL_<NAME>`
     *
     * Also reads `$KOKO_INSTALL` when `install` is omitted.
     */
    install?: KokoInstallPreset | string;
}
/**
 * List engine installs detected on this machine (for picking `install` in tests).
 */
export declare function listKokoInstalls(): KokoInstall[];
/**
 * Resolve koko binary + engine data root (`share/koko` or git checkout).
 * Priority: `binary` → `install` / `$KOKO_INSTALL` → `$KOKO_BIN` → auto discovery.
 */
export declare function resolveKokoInstall(options?: ResolveKokoInstallOptions): KokoInstall;
/** Default engine data root (Homebrew `share/koko` when installed). */
export declare function defaultKokoDataRoot(): string;
