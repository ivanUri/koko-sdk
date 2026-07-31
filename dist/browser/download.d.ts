export interface DownloadInfo {
    guid: string;
    url: string;
    suggestedFilename: string;
    path(): Promise<string>;
    saveAs(destination: string): Promise<void>;
}
export declare class Download implements DownloadInfo {
    private readonly directory;
    readonly guid: string;
    readonly url: string;
    readonly suggestedFilename: string;
    private readonly waitForCompletion;
    private finished?;
    constructor(directory: string, guid: string, url: string, suggestedFilename: string, waitForCompletion: () => Promise<string>);
    path(): Promise<string>;
    saveAs(destination: string): Promise<void>;
}
export declare function waitForDownload(session: {
    send<T = unknown>(method: string, params?: unknown, timeout?: number): Promise<T>;
    waitFor<T = unknown>(event: string, options?: {
        timeout?: number;
        predicate?: (payload: T) => boolean;
    }): Promise<T>;
}, options?: {
    path?: string;
    timeout?: number;
}): Promise<Download>;
