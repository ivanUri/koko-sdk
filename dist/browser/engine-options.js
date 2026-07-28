const LOG_CHANNELS = ["js", "core", "network", "protocol", "system"];
/** Render shared engine options as CLI arguments, in a stable order. */
export function toEngineArgs(options) {
    const args = [];
    const flag = (name, value) => {
        if (value != null && value !== "")
            args.push(name, value);
    };
    const num = (name, value) => {
        if (value != null)
            args.push(name, String(value));
    };
    const bool = (name, value) => {
        if (value)
            args.push(name);
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
    if (options.blockCidrs?.length)
        args.push("--block-cidrs", options.blockCidrs.join(","));
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
//# sourceMappingURL=engine-options.js.map