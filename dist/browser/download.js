import { copyFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { withTimeout } from "../utils/timeout.js";
import { ProtocolError } from "../cdp/errors.js";
export class Download {
    directory;
    guid;
    url;
    suggestedFilename;
    waitForCompletion;
    finished;
    constructor(directory, guid, url, suggestedFilename, waitForCompletion) {
        this.directory = directory;
        this.guid = guid;
        this.url = url;
        this.suggestedFilename = suggestedFilename;
        this.waitForCompletion = waitForCompletion;
    }
    path() {
        if (!this.finished)
            this.finished = this.waitForCompletion();
        return this.finished;
    }
    async saveAs(destination) {
        await copyFile(await this.path(), destination);
    }
}
export async function waitForDownload(session, options = {}) {
    const directory = options.path ?? join(process.cwd(), ".koko-downloads");
    await mkdir(directory, { recursive: true });
    await session.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: directory,
    }, options.timeout);
    const started = await session.waitFor("Page.downloadWillBegin", { timeout: options.timeout });
    const progress = session.waitFor("Page.downloadProgress", {
        timeout: options.timeout,
        predicate: (event) => event.guid === started.guid && (event.state === "completed" || event.state === "canceled"),
    });
    const completion = async () => {
        const state = await withTimeout(progress, { timeout: options.timeout, label: `Waiting for download: ${started.suggestedFilename}` });
        if (state.state === "canceled") {
            throw new ProtocolError(`Download canceled: ${started.suggestedFilename}`, {
                method: "Page.downloadProgress",
            });
        }
        const file = join(directory, started.suggestedFilename);
        await access(file);
        return file;
    };
    return new Download(directory, started.guid, started.url, started.suggestedFilename, completion);
}
//# sourceMappingURL=download.js.map