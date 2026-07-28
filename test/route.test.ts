import { describe, expect, it } from "vitest";
import { matchesRoutePattern } from "../src/browser/route.js";

describe("matchesRoutePattern", () => {
  it("matches substrings for string patterns", () => {
    expect(matchesRoutePattern("https://example.com/api/x", "/api/")).toBe(true);
    expect(matchesRoutePattern("https://example.com/other", "/api/")).toBe(false);
  });

  it("\"*\" matches any url even without a literal asterisk", () => {
    expect(matchesRoutePattern("https://example.com/anything", "*")).toBe(true);
  });

  it("matches via RegExp", () => {
    expect(matchesRoutePattern("https://example.com/x.png", /\.png$/)).toBe(true);
    expect(matchesRoutePattern("https://example.com/x.jpg", /\.png$/)).toBe(false);
  });

  it("matches via predicate function", () => {
    const pattern = (url: string) => url.includes("block-me");
    expect(matchesRoutePattern("https://example.com/block-me", pattern)).toBe(true);
    expect(matchesRoutePattern("https://example.com/ok", pattern)).toBe(false);
  });
});
