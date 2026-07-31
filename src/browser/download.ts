import { copyFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { withTimeout } from "../utils/timeout.js";
import { ProtocolError } from "../cdp/errors.js";

export interface DownloadInfo {
  guid: string;
  url: string;
  suggestedFilename: string;
  path(): Promise<string>;
  saveAs(destination: string): Promise<void>;
}

export class Download implements DownloadInfo {
  private finished?: Promise<string>;

  constructor(
    private readonly directory: string,
    readonly guid: string,
    readonly url: string,
    readonly suggestedFilename: string,
    private readonly waitForCompletion: () => Promise<string>,
  ) {}

  path(): Promise<string> {
    if (!this.finished) this.finished = this.waitForCompletion();
    return this.finished;
  }

  async saveAs(destination: string): Promise<void> {
    await copyFile(await this.path(), destination);
  }
}

export async function waitForDownload(
  session: {
    send<T = unknown>(method: string, params?: unknown, timeout?: number): Promise<T>;
    waitFor<T = unknown>(event: string, options?: { timeout?: number; predicate?: (payload: T) => boolean }): Promise<T>;
  },
  options: { path?: string; timeout?: number } = {},
): Promise<Download> {
  const directory = options.path ?? join(process.cwd(), ".velora-downloads");
  await mkdir(directory, { recursive: true });
  await session.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: directory,
  }, options.timeout);
  const started = await session.waitFor<{
    guid: string;
    url: string;
    suggestedFilename: string;
  }>("Page.downloadWillBegin", { timeout: options.timeout });
  const progress = session.waitFor<{ guid: string; state: string }>("Page.downloadProgress", {
    timeout: options.timeout,
    predicate: (event) =>
      event.guid === started.guid && (event.state === "completed" || event.state === "canceled"),
  });
  const completion = async (): Promise<string> => {
    const state = await withTimeout(
      progress,
      { timeout: options.timeout, label: `Waiting for download: ${started.suggestedFilename}` },
    );
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
