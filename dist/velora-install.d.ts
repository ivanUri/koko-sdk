export type VeloraInstallSource = "explicit" | "velora_bin" | "homebrew" | "path" | "zig_dev" | "preset";
/** Built-in install keys for `install` / `$VELORA_INSTALL`. */
export type VeloraInstallPreset = "auto" | "homebrew" | "path";
export interface VeloraInstall {
    /** Stable id for `Browser.launch({ install: id })`. */
    id: string;
    label: string;
    binary: string;
    dataRoot: string;
    source: VeloraInstallSource;
}
export interface ResolveVeloraInstallOptions {
    binary?: string;
    dataRoot?: string;
    /** @deprecated Use `dataRoot`. */
    repoRoot?: string;
    /**
     * Pick a local engine build:
     * - `auto` — Homebrew → PATH (default when omitted)
     * - `homebrew` | `path` — force a preset
     * - absolute path to `velora` binary or engine repo root
     * - custom name — resolved from `$VELORA_INSTALL_<NAME>`
     *
     * Also reads `$VELORA_INSTALL` when `install` is omitted.
     */
    install?: VeloraInstallPreset | string;
}
/**
 * List engine installs detected on this machine (for picking `install` in tests).
 */
export declare function listVeloraInstalls(): VeloraInstall[];
/**
 * Resolve velora binary + engine data root (`share/velora` or git checkout).
 * Priority: `binary` → `install` / `$VELORA_INSTALL` → `$VELORA_BIN` → auto discovery.
 */
export declare function resolveVeloraInstall(options?: ResolveVeloraInstallOptions): VeloraInstall;
/** Default engine data root (Homebrew `share/velora` when installed). */
export declare function defaultVeloraDataRoot(): string;
