/**
 * Engine CLI options shared by `koko serve`, `koko fetch` and `koko mcp`.
 *
 * Field names mirror the flags in `src/runtime/Config.zig`; `toEngineArgs`
 * is the single place that renders them, so `serve` and `fetch` cannot drift.
 */
export interface EngineCommonOptions {
    /** Chrome-style user data root (`--user-data-dir`). */
    userDataDir?: string;
    /** Profile folder name inside user-data-dir (`--browser-profile`). */
    profile?: string;
    /** Random profile from this list when `profile` is omitted (`--browser-profile-pool`). */
    profilePool?: string[];
    /** Self-contained fingerprint folder (`--fingerprint-folder`). Must be a folder, not a .json file. */
    fingerprintFolder?: string;
    /** Seed cookies from a JSON file (`--cookie`). */
    cookie?: string;
    /** Runtime cookie jar path (`--cookie-jar`). */
    cookieJar?: string;
    /** HTTP cache directory (`--http-cache-dir`). Defaults to the profile's Cache/. */
    httpCacheDir?: string;
    /** Outbound proxy, optionally `user:pass@host:port` (`--http-proxy`). Mutually exclusive with `proxyFile`. */
    httpProxy?: string;
    /** File containing one proxy per line; one entry is selected at engine startup (`--proxy-file`). Mutually exclusive with `httpProxy`. */
    proxyFile?: string;
    /** `Proxy-Authorization: Bearer <token>` (`--proxy-bearer-token`). */
    proxyBearerToken?: string;
    /** Max concurrent HTTP requests (`--http-max-concurrent`, Core default 32). */
    httpMaxConcurrent?: number;
    /** Max open connections per host:port (`--http-max-host-open`, Core default 16). */
    httpMaxHostOpen?: number;
    /** Connect timeout in ms; 0 disables (`--http-connect-timeout`). */
    httpConnectTimeout?: number;
    /** Whole-transfer timeout in ms; 0 disables (`--http-timeout`, default 10000). */
    httpTimeout?: number;
    /** Response size cap in bytes (`--http-max-response-size`). */
    httpMaxResponseSize?: number;
    /** Max concurrent WebSocket connections (`--ws-max-concurrent`, default 8). */
    wsMaxConcurrent?: number;
    /** Resource loading policy (`--resource-policy`). */
    resourcePolicy?: ResourcePolicy;
    /** Fetch and obey robots.txt (`--obey-robots`). */
    obeyRobots?: boolean;
    /** Block requests to private/internal IPs after DNS resolution (`--block-private-networks`). */
    blockPrivateNetworks?: boolean;
    /** Extra CIDRs to block; prefix an entry with `-` to exempt it (`--block-cidrs`). */
    blockCidrs?: string[];
    /**
     * Disable TLS host verification (`--insecure-disable-tls-host-verification`).
     * Only set this if you accept the risk.
     */
    insecureDisableTlsHostVerification?: boolean;
    /** Route google.com/search document navigations through real Chrome (`--google-chrome-transport`). */
    googleChromeTransport?: boolean;
    /**
     * Replace the User-Agent entirely (`--user-agent`).
     * The engine rejects values containing "Mozilla" unless the profile is antidetect.
     * Mutually exclusive with `userAgentSuffix`.
     */
    userAgent?: string;
    /** Suffix appended to the default Koko User-Agent (`--user-agent-suffix`). */
    userAgentSuffix?: string;
    /** Ed25519 private key PEM for Web Bot Auth (`--web-bot-auth-key-file`). */
    webBotAuthKeyFile?: string;
    /** JWK thumbprint of the public key (`--web-bot-auth-keyid`). */
    webBotAuthKeyId?: string;
    /** Signing domain (`--web-bot-auth-domain`). */
    webBotAuthDomain?: string;
    /** Persistent storage engine (`--storage-engine`). */
    storageEngine?: "none" | "sqlite";
    /** SQLite file path, or `:memory:` (`--storage-sqlite-path`). */
    storageSqlitePath?: string;
    logLevel?: LogLevel;
    /** Log output format (`--log-format`). */
    logFormat?: "pretty" | "logfmt";
    /** Silence noisy scopes, e.g. `["http", "event"]` (`--log-filter-scopes`). */
    logFilterScopes?: string[];
    /** Write structured logs under `<dir>/<run-id>/` (`--log-dir`). */
    logDir?: string;
    /** Override the per-run log folder name (`--log-run-id`). */
    logRunId?: string;
    /** Skip combined.log in the run folder (`--log-no-combined`). */
    logNoCombined?: boolean;
    /** Dump raw CDP wire messages to protocol/cdp-wire.log (`--log-cdp-trace`). */
    logCdpTrace?: boolean;
    /** Per-channel log level overrides (`--log-level-js` and friends). */
    logLevels?: Partial<Record<LogChannel, LogLevel>>;
}
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type LogChannel = "js" | "core" | "network" | "protocol" | "system";
export type ResourcePolicy = "full" | "no-images" | "no-css" | "text-only" | "defer-images";
/** Options accepted only by the long-running `koko serve` command. */
export interface KokoServeOptions {
    /** Native stack reservation per CDP worker in MiB (`--cdp-thread-stack-mb`; Core default 4). */
    cdpThreadStackMb?: number;
    /** Recycle a CDP worker after this many browser contexts (`--worker-max-pages`; Core default 1). */
    workerMaxPages?: number;
    /** Recycle a CDP worker after this RSS growth in bytes (`--worker-max-rss`; Core default 2 GiB). */
    workerMaxRss?: number;
    /** Process-wide current RSS admission budget in bytes (`--resource-max-rss`; 0 disables it). */
    resourceMaxRss?: number;
    /** Process-wide current VMS admission budget in bytes (`--resource-max-vms`; 0 disables it). */
    resourceMaxVms?: number;
}
/** Options accepted only by the one-shot `koko fetch` command. */
export interface FetchOnlyEngineOptions {
    /** UTF-8 file containing fixed request headers (`--extra-headers-file`). */
    extraHeadersFile?: string;
}
/** Render shared engine options as CLI arguments, in a stable order. */
export declare function toEngineArgs(options: EngineCommonOptions & FetchOnlyEngineOptions): string[];
/** Render options that are valid only for `koko serve`. */
export declare function toServeArgs(options: KokoServeOptions): string[];
