import { describe, expect, it } from "vitest";
import { parseKokoVersionResponse } from "../src/browser/diagnostics.js";

describe("Koko diagnostics", () => {
  it("parses version metadata and inferred capabilities", () => {
    const parsed = parseKokoVersionResponse({
      Browser: "Koko/1.0.3",
      "Protocol-Version": "1.3",
      "User-Agent": "koko-test",
      webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/id",
      kokoBuild: { version: "1.0.3" },
      kokoStartup: { total_ms: 42 },
      capabilities: ["resource-policy"],
    });

    expect(parsed.browser).toBe("Koko/1.0.3");
    expect(parsed.capabilities).toEqual(expect.arrayContaining([
      "cdp",
      "cdp-protocol",
      "koko",
      "koko-build",
      "koko-startup-metrics",
      "resource-policy",
    ]));
    expect(parsed.raw).toHaveProperty("Browser", "Koko/1.0.3");
  });

  it("accepts explicit boolean capability maps", () => {
    const parsed = parseKokoVersionResponse({
      capabilities: { "worker-recycle": true, "disabled-feature": false },
    });

    expect(parsed.capabilities).toContain("worker-recycle");
    expect(parsed.capabilities).not.toContain("disabled-feature");
  });
});
