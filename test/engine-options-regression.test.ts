import { describe, expect, it } from "vitest";
import { toEngineArgs } from "../src/browser/engine-options.js";

describe("toEngineArgs regression contract", () => {
  it("renders supported common engine flags in a stable order", () => {
    expect(toEngineArgs({
      userDataDir: "profiles/root",
      fingerprintFolder: "fingerprints/koko",
      cookie: "seed.json",
      cookieJar: "runtime/cookies.json",
      httpCacheDir: "cache/http",
      httpProxy: "http://proxy.test:8080",
      proxyBearerToken: "token",
      httpMaxConcurrent: 20,
      httpMaxHostOpen: 6,
      httpConnectTimeout: 1500,
      httpTimeout: 20_000,
      httpMaxResponseSize: 2_000_000,
      wsMaxConcurrent: 12,
      obeyRobots: true,
      blockPrivateNetworks: true,
      blockCidrs: ["169.254.169.254/32", "-10.0.0.42/32"],
      insecureDisableTlsHostVerification: true,
      googleChromeTransport: true,
      userAgentSuffix: " sdk-test",
      webBotAuthKeyFile: "auth/key.pem",
      webBotAuthKeyId: "key-1",
      webBotAuthDomain: "bot.example.test",
      storageEngine: "sqlite",
      storageSqlitePath: ":memory:",
      logLevel: "warn",
      logFormat: "logfmt",
      logFilterScopes: ["http", "event"],
      logDir: "logs",
      logRunId: "regression",
      logNoCombined: true,
      logCdpTrace: true,
      logLevels: {
        js: "error",
        core: "warn",
        network: "info",
        protocol: "debug",
        system: "fatal",
      },
    })).toEqual([
      "--user-data-dir", "profiles/root",
      "--fingerprint-folder", "fingerprints/koko",
      "--cookie", "seed.json",
      "--cookie-jar", "runtime/cookies.json",
      "--http-cache-dir", "cache/http",
      "--http-proxy", "http://proxy.test:8080",
      "--proxy-bearer-token", "token",
      "--http-max-concurrent", "20",
      "--http-max-host-open", "6",
      "--http-connect-timeout", "1500",
      "--http-timeout", "20000",
      "--http-max-response-size", "2000000",
      "--ws-max-concurrent", "12",
      "--obey-robots",
      "--block-private-networks",
      "--block-cidrs", "169.254.169.254/32,-10.0.0.42/32",
      "--insecure-disable-tls-host-verification",
      "--google-chrome-transport",
      "--user-agent-suffix", " sdk-test",
      "--web-bot-auth-key-file", "auth/key.pem",
      "--web-bot-auth-keyid", "key-1",
      "--web-bot-auth-domain", "bot.example.test",
      "--storage-engine", "sqlite",
      "--storage-sqlite-path", ":memory:",
      "--log-level", "warn",
      "--log-format", "logfmt",
      "--log-filter-scopes", "http,event",
      "--log-dir", "logs",
      "--log-run-id", "regression",
      "--log-no-combined",
      "--log-cdp-trace",
      "--log-level-js", "error",
      "--log-level-core", "warn",
      "--log-level-network", "info",
      "--log-level-protocol", "debug",
      "--log-level-system", "fatal",
    ]);
  });

  it("omits unset, empty and false options without leaving dangling argv values", () => {
    expect(toEngineArgs({
      userDataDir: "",
      httpMaxConcurrent: 0,
      blockCidrs: [],
      obeyRobots: false,
      logFilterScopes: [],
      logNoCombined: false,
      logCdpTrace: false,
    })).toEqual(["--http-max-concurrent", "0"]);
  });

  it("rejects mutually exclusive user-agent options before rendering argv", () => {
    expect(() => toEngineArgs({
      userAgent: "KokoBot/1.0",
      userAgentSuffix: " sdk-test",
    })).toThrow("userAgent and userAgentSuffix are mutually exclusive");
  });
});
