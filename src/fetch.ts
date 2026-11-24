import { readFile, writeFile } from "node:fs/promises";
import { Browser } from "./browser/browser.js";
import type { ExtractResult } from "./browser/page.js";
import { launchKoko, type KokoLaunchOptions } from "./browser/launch.js";
import type { LogLevel } from "./browser/engine-options.js";
import type { WaitUntil } from "./browser/waiter.js";

export type FetchFormat = "html" | "md" | "json";

export interface FetchOptions {
  /** Output format (default: html). */
  format?: FetchFormat;
  /** Start koko automatically (default: true). */
  launch?: boolean;
  /** CDP endpoint when launch is false. */
  endpoint?: string;
  waitUntil?: WaitUntil;
  timeout?: number;
  logger?: boolean;
  /** Read and register a script before each document parse. */
  injectScriptFile?: string;
  /** Write result to this file path. */
  output?: string;
  /** Passed to `launchKoko` when `launch` is true. */
  profile?: string;
  profilePool?: string[];
  userDataDir?: string;
  /** Self-contained fingerprint folder (`--fingerprint-folder`). */
  fingerprintFolder?: string;
  /** Portable `.koko-profile` bundle directory. */
  profileBundle?: string;
  /** Installed fingerprint id under `browser/fingerprints/`. */
  fingerprint?: string;
  cookieJar?: string;
  /** Outbound proxy for the launched engine. */
  httpProxy?: string;
  binary?: string;
  install?: string;
  dataRoot?: string;
  /** @deprecated Use `dataRoot`. */
  repoRoot?: string;
  logLevel?: LogLevel;
}

export interface FetchResult {
  url: string;
  title: string;
  format: FetchFormat;
  /** HTML, Markdown, or JSON string. */
  body: string;
  /** Parsed extract payload when format is json. */
  data?: ExtractResult;
}

export async function fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const format = options.format ?? "html";
  const launch = options.launch !== false;
  const endpoint = options.endpoint ?? process.env.KOKO_CDP ?? "http://127.0.0.1:9222";
  const waitUntil = options.waitUntil ?? "domcontentloaded";
  const timeout = options.timeout ?? 30_000;

  const launchOpts: KokoLaunchOptions = {
    logger: options.logger,
    profile: options.profile,
    profilePool: options.profilePool,
    userDataDir: options.userDataDir,
    fingerprintFolder: options.fingerprintFolder,
    profileBundle: options.profileBundle,
    fingerprint: options.fingerprint,
    cookieJar: options.cookieJar,
    httpProxy: options.httpProxy,
    binary: options.binary,
    install: options.install,
    dataRoot: options.dataRoot ?? options.repoRoot,
    repoRoot: options.repoRoot,
    logLevel: options.logLevel,
  };
  const launched = launch ? await launchKoko(launchOpts) : null;

  try {
    const browser = launched?.browser ?? await Browser.connect(endpoint, { logger: options.logger });
    const ownsBrowser = !launched;

    try {
      const page = await browser.newPage();
      if (options.injectScriptFile) {
        await page.addInitScript(await readFile(options.injectScriptFile, "utf8"));
      }
      await page.goto(url, { waitUntil, timeout });

      let body: string;
      let data: ExtractResult | undefined;

      if (format === "md") {
        body = await page.markdown();
      } else if (format === "json") {
        data = await page.extract({ timeout });
        body = JSON.stringify(data, null, 2);
      } else {
        body = await page.content();
      }

      const result: FetchResult = {
        url: await page.url(),
        title: await page.title(),
        format,
        body,
        data,
      };

      if (options.output) await writeFile(options.output, body);
      return result;
    } finally {
      if (ownsBrowser) await browser.close();
    }
  } finally {
    if (launched) await launched.close();
  }
}
