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

  /** Outbound proxy, optionally `user:pass@host:port` (`--http-proxy`). */
  httpProxy?: string;
  /** `Proxy-Authorization: Bearer <token>` (`--proxy-bearer-token`). */
  proxyBearerToken?: string;

  /** Max concurrent HTTP requests (`--http-max-concurrent`, default 10). */
  httpMaxConcurrent?: number;
  /** Max open connections per host:port (`--http-max-host-open`, default 4). */
  httpMaxHostOpen?: number;
  /** Connect timeout in ms; 0 disables (`--http-connect-timeout`). */
  httpConnectTimeout?: number;
  /** Whole-transfer timeout in ms; 0 disables (`--http-timeout`, default 10000). */
  httpTimeout?: number;
  /** Response size cap in bytes (`--http-max-response-size`). */
  httpMaxResponseSize?: number;
  /** Max concurrent WebSocket connections (`--ws-max-concurrent`, default 8). */
  wsMaxConcurrent?: number;

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

const LOG_CHANNELS: LogChannel[] = ["js", "core", "network", "protocol", "system"];

/** Render shared engine options as CLI arguments, in a stable order. */
export function toEngineArgs(options: EngineCommonOptions): string[] {
  const args: string[] = [];
  const flag = (name: string, value: string | undefined | null): void => {
    if (value != null && value !== "") args.push(name, value);
  };
  const num = (name: string, value: number | undefined): void => {
    if (value != null) args.push(name, String(value));
  };
  const bool = (name: string, value: boolean | undefined): void => {
    if (value) args.push(name);
  };

  flag("--user-data-dir", options.userDataDir);
  flag("--fingerprint-folder", options.fingerprintFolder);
  flag("--cookie", options.cookie);
  flag("--cookie-jar", options.cookieJar);
  flag("--http-cache-dir", options.httpCacheDir);

  flag("--http-proxy", options.httpProxy);
  flag("--proxy-bearer-token", options.proxyBearerToken);

  num("--http-max-concurrent", options.httpMaxConcurrent);
  num("--http-max-host-open", options.httpMaxHostOpen);
  num("--http-connect-timeout", options.httpConnectTimeout);
  num("--http-timeout", options.httpTimeout);
  num("--http-max-response-size", options.httpMaxResponseSize);
  num("--ws-max-concurrent", options.wsMaxConcurrent);

  bool("--obey-robots", options.obeyRobots);
  bool("--block-private-networks", options.blockPrivateNetworks);
  if (options.blockCidrs?.length) args.push("--block-cidrs", options.blockCidrs.join(","));
  bool("--insecure-disable-tls-host-verification", options.insecureDisableTlsHostVerification);
  bool("--google-chrome-transport", options.googleChromeTransport);

  if (options.userAgent && options.userAgentSuffix) {
    throw new Error("userAgent and userAgentSuffix are mutually exclusive");
  }
  flag("--user-agent", options.userAgent);
  flag("--user-agent-suffix", options.userAgentSuffix);

  flag("--web-bot-auth-key-file", options.webBotAuthKeyFile);
  flag("--web-bot-auth-keyid", options.webBotAuthKeyId);
  flag("--web-bot-auth-domain", options.webBotAuthDomain);

  flag("--storage-engine", options.storageEngine);
  flag("--storage-sqlite-path", options.storageSqlitePath);

  flag("--log-level", options.logLevel);
  flag("--log-format", options.logFormat);
  if (options.logFilterScopes?.length) {
    args.push("--log-filter-scopes", options.logFilterScopes.join(","));
  }
  flag("--log-dir", options.logDir);
  flag("--log-run-id", options.logRunId);
  bool("--log-no-combined", options.logNoCombined);
  bool("--log-cdp-trace", options.logCdpTrace);
  for (const channel of LOG_CHANNELS) {
    flag(`--log-level-${channel}`, options.logLevels?.[channel]);
  }

  return args;
}
