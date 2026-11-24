import { describe, expect, it } from "vitest";
import { toEngineArgs, toServeArgs, type EngineCommonOptions, type KokoServeOptions } from "../src/browser/engine-options.js";

describe("engine resource options", () => {
  it("renders Core resource, recycle, proxy and header flags", () => {
    const options: EngineCommonOptions = {
      proxyFile: "proxies.txt",
      resourcePolicy: "defer-images",
      extraHeadersFile: "headers.txt",
    };

    expect(toEngineArgs(options)).toEqual([
      "--proxy-file", "proxies.txt",
      "--resource-policy", "defer-images",
      "--extra-headers-file", "headers.txt",
    ]);

    const serveOptions: KokoServeOptions = {
      cdpThreadStackMb: 8,
      workerMaxPages: 12,
      workerMaxRss: 3_000_000_000,
      resourceMaxRss: 4_000_000_000,
      resourceMaxVms: 8_000_000_000,
    };
    expect(toServeArgs(serveOptions)).toEqual([
      "--cdp-thread-stack-mb", "8",
      "--worker-max-pages", "12",
      "--worker-max-rss", "3000000000",
      "--resource-max-rss", "4000000000",
      "--resource-max-vms", "8000000000",
    ]);
  });

  it("preserves zero values for Core policies that use zero to disable a limit", () => {
    expect(toServeArgs({
      workerMaxPages: 0,
      workerMaxRss: 0,
      resourceMaxRss: 0,
      resourceMaxVms: 0,
    })).toEqual([
      "--worker-max-pages", "0",
      "--worker-max-rss", "0",
      "--resource-max-rss", "0",
      "--resource-max-vms", "0",
    ]);
  });

  it("rejects mutually exclusive HTTP proxy options", () => {
    expect(() => toEngineArgs({
      httpProxy: "http://proxy-a:8080",
      proxyFile: "proxies.txt",
    })).toThrow("httpProxy and proxyFile are mutually exclusive");
  });
});
