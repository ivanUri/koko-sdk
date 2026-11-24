import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Browser } from "../src/browser/browser.js";
import { BrowserContext } from "../src/browser/context.js";
import type { Page } from "../src/browser/page.js";

describe("browser lifecycle architecture", () => {
  it("closes a Browser only once when callers race to close it", async () => {
    const client = { close: vi.fn() };
    const browser = new (Browser as unknown as new (client: unknown) => Browser)(client);

    await Promise.all([browser.close(), browser.close(), browser.close()]);

    expect(client.close).toHaveBeenCalledOnce();
  });

  it("closes a logical context once and releases it exactly once", async () => {
    const releaseContext = vi.fn();
    const browser = { releaseContext } as never;
    const context = new BrowserContext(browser);

    await Promise.all([context.close(), context.close(), context.close()]);

    expect(releaseContext).toHaveBeenCalledOnce();
  });

  it("keeps context page bookkeeping independent while using the shared browser", async () => {
    const pages: Page[] = [];
    const browser = {
      newPage: vi.fn(async () => {
        const page = {
          onClose: vi.fn(),
          addInitScript: vi.fn().mockResolvedValue(undefined),
          session: { send: vi.fn().mockResolvedValue({}) },
          network: { ensureEnabled: vi.fn().mockResolvedValue(undefined) },
          goto: vi.fn().mockResolvedValue(undefined),
        } as unknown as Page;
        pages.push(page);
        return page;
      }),
      releaseContext: vi.fn(),
    } as never;
    const first = new BrowserContext(browser);
    const second = new BrowserContext(browser);

    await first.newPage();
    await second.newPage();

    expect(first.pages()).toHaveLength(1);
    expect(second.pages()).toHaveLength(1);
    expect(pages).toHaveLength(2);
  });
});

describe("BrowserContext isolation documentation", () => {
  it("keeps the shared-connection isolation warning in the README", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toMatch(/multiple `browser\.newContext\(\)` calls on the \*\*same\*\* `Browser` are not isolated/i);
    expect(readme).toMatch(/true per-identity isolation, use a separate `Browser\.connect\(\)`/i);
  });
});
