import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as SDK from "../src/index.js";

describe("public package API", () => {
  it("keeps the primary browser, CDP and Koko entry points exported", () => {
    for (const name of [
      "Browser",
      "BrowserContext",
      "Page",
      "Locator",
      "CDPClient",
      "CDPSession",
      "KokoClient",
      "LPClient",
      "launchKoko",
      "KokoPool",
      "BrowserPool",
      "parseKokoVersionResponse",
      "toEngineArgs",
      "createCrawlWorker",
      "fetch",
      "dump",
    ]) {
      expect(SDK, `missing public export: ${name}`).toHaveProperty(name);
    }
  });

  it("keeps the package subpath export map aligned with the supported modules", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      exports?: Record<string, { import?: string; types?: string }>;
    };
    const exports = packageJson.exports ?? {};

    for (const subpath of [
      ".",
      "./driver",
      "./agent",
      "./workflow",
      "./cdp",
      "./profile",
      "./pool",
      "./diagnostics",
    ]) {
      expect(exports, `missing package export: ${subpath}`).toHaveProperty(subpath);
      expect(exports[subpath]?.import).toMatch(/^\.\/dist\/.+\.js$/);
      expect(exports[subpath]?.types).toMatch(/^\.\/dist\/.+\.d\.ts$/);
    }
  });
});
