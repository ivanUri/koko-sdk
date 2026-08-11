import { homedir } from "node:os";
import { join } from "node:path";
/** Default Koko user-data-dir (Chrome-style profile root). */
export function defaultUserDataDir() {
    if (process.platform === "darwin") {
        return join(homedir(), "Library", "Application Support", "koko");
    }
    if (process.platform === "win32") {
        return join(process.env.LOCALAPPDATA ?? homedir(), "koko");
    }
    return join(homedir(), ".config", "koko");
}
/** Cookies.json inside a named browser profile folder. */
export function profileCookiesPath(userDataDir, profileName) {
    return join(userDataDir, profileName, "Cookies.json");
}
//# sourceMappingURL=profile-paths.js.map