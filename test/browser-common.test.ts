import { describe, expect, it, vi } from "vitest";
import { Page } from "../src/browser/page.js";
import { Frame, flattenFrameTree } from "../src/browser/frame.js";
import { waitForDownload } from "../src/browser/download.js";

describe("common browser APIs", () => {
  it("dispatches portable page scroll, wheel, media and content commands", async () => {
    const send = vi.fn((method: string) => {
      if (method === "Page.getFrameTree") {
        return Promise.resolve({ frameTree: { frame: { id: "MAIN", url: "about:blank" } } });
      }
      return Promise.resolve({});
    });
    const session = {
      sessionId: "S",
      targetId: "T",
      client: {},
      send,
      on: vi.fn(() => () => undefined),
    };
    const page = new Page(session as never);
    await page.init();
    vi.spyOn(page, "evaluate").mockResolvedValue(undefined);

    await page.scrollBy(0, 500);
    await page.scrollTo(10, 20, { behavior: "instant" });
    await page.mouse.wheel(0, 120);
    await page.setContent("<main>hello</main>");
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });

    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(
      "Input.synthesizeScrollGesture",
      expect.objectContaining({ yDistance: -120 }),
      undefined,
    );
    expect(send).toHaveBeenCalledWith(
      "Page.setDocumentContent",
      { frameId: "MAIN", html: "<main>hello</main>" },
      undefined,
    );
  });

  it("flattens frame trees and evaluates in a frame execution context", async () => {
    const infos = flattenFrameTree({
      frame: { id: "MAIN", url: "https://example.test" },
      childFrames: [{ frame: { id: "CHILD", parentId: "MAIN", name: "checkout", url: "https://pay.test" } }],
    });
    expect(infos.map((frame) => frame.id)).toEqual(["MAIN", "CHILD"]);

    const send = vi.fn((method: string) => {
      if (method === "Page.createIsolatedWorld") return Promise.resolve({ executionContextId: 9 });
      return Promise.resolve({ result: { value: "frame title" } });
    });
    const frame = new Frame({ send } as never, infos[1]!);
    await expect(frame.evaluate("document.title")).resolves.toBe("frame title");
    expect(send).toHaveBeenLastCalledWith(
      "Runtime.evaluate",
      expect.objectContaining({ contextId: 9, expression: "document.title" }),
      undefined,
    );
  });

  it("pre-arms completion tracking after a download begins", async () => {
    let progressResolve!: (value: unknown) => void;
    const waitFor = vi.fn((event: string) => {
      if (event === "Page.downloadWillBegin") {
        return Promise.resolve({
          guid: "G",
          url: "https://example.test/file",
          suggestedFilename: "file.txt",
        });
      }
      return new Promise((resolve) => { progressResolve = resolve; });
    });
    const pending = waitForDownload({
      send: vi.fn().mockResolvedValue(undefined),
      waitFor,
    }, { path: "/private/tmp", timeout: 100 });
    const download = await pending;
    expect(waitFor).toHaveBeenCalledWith("Page.downloadProgress", expect.anything());
    progressResolve({ guid: "G", state: "canceled" });
    await expect(download.path()).rejects.toThrow("Download canceled");
  });
});
