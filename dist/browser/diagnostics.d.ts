export interface KokoVersionMetadata {
    browser?: string;
    protocolVersion?: string;
    userAgent?: string;
    webSocketDebuggerUrl?: string;
    kokoBuild?: Readonly<Record<string, unknown>>;
    kokoStartup?: Readonly<Record<string, number>>;
    /** Capability names advertised by Core, plus stable capabilities inferred from the response. */
    capabilities: readonly string[];
    /** Original /json/version payload for forward-compatible fields. */
    raw: Readonly<Record<string, unknown>>;
}
export interface KokoStartupTiming {
    /** Unix epoch milliseconds when launchKoko started. */
    launchStartedAt: number;
    /** Time from process spawn to a responsive CDP HTTP endpoint. */
    cdpReadyMs: number;
    /** Time spent connecting the SDK CDP client after CDP became ready. */
    browserConnectMs: number;
    /** Time spent reading and parsing /json/version. */
    versionReadMs: number;
    /** End-to-end time until diagnostics were available. */
    totalMs: number;
}
export interface KokoDiagnostics {
    version: KokoVersionMetadata;
    startup: KokoStartupTiming;
    /** Return true when Core advertised or safely implied the requested feature. */
    hasCapability(feature: string): boolean;
    /** Throw a ProtocolError when the requested feature is unavailable. */
    requireCapability(feature: string): void;
}
export interface KokoStartupMarks {
    launchStartedAt: number;
    launchStartedClock: number;
    cdpReadyClock: number;
    browserConnectedClock: number;
}
export declare function parseKokoVersionResponse(value: unknown): KokoVersionMetadata;
export declare function readKokoDiagnostics(endpoint: string, marks: KokoStartupMarks): Promise<KokoDiagnostics | undefined>;
