import { CDPClient } from "../cdp/client.js";
import type { WebSocketTransportOptions } from "../transport/websocket.js";
import { BrowserContext, type BrowserContextOptions } from "./context.js";
import { Page } from "./page.js";
import { launchKoko, type LaunchedKoko, type KokoLaunchOptions } from "./launch.js";
import {
  definePersona,
  personaContextOptions,
  type BrowserProfileInfo,
  type Persona,
} from "./identity.js";

export interface BrowserConnectOptions extends WebSocketTransportOptions {
  /** Enable Target.setDiscoverTargets + setAutoAttach (default: true). */
  enableTargetTracking?: boolean;
}

export class Browser {
  private readonly _pages = new Set<Page>();
  private readonly _contexts = new Set<BrowserContext>();
  private closePromise?: Promise<void>;
  private profileInfo: BrowserProfileInfo = { source: "connected", known: false };

  private constructor(readonly client: CDPClient) {}

  static async connect(endpoint: string, options: BrowserConnectOptions = {}): Promise<Browser> {
    const client = await CDPClient.connect(endpoint, options);
    if (options.enableTargetTracking !== false) {
      await client.enableTargetTracking();
    }
    return new Browser(client);
  }

  /**
   * Spawn `koko serve` and connect over CDP.
   * Default: Homebrew `koko` (`brew install koko`) + `share/koko/browser/koko.json`.
   * Antidetect: pass `profileId` + `kokoApi`. Override with `binary` / `dataRoot`.
   */
  static async launch(options: KokoLaunchOptions = {}): Promise<LaunchedKoko> {
    return launchKoko(options);
  }

  async newSession(url = "about:blank") {
    return this.client.newSession(url);
  }

  async newPage(url = "about:blank"): Promise<Page> {
    // Create a blank target first so callers can install page setup before
    // the first real navigation. Creating it at `url` would load the page
    // once and then navigate to it a second time below.
    const session = await this.client.newSession("about:blank");
    const page = new Page(session);
    page.onClose(() => this._pages.delete(page));
    await page.init();
    if (url !== "about:blank") await page.goto(url);
    this._pages.add(page);
    return page;
  }

  pages(): Page[] {
    return [...this._pages];
  }

  async waitForPage(options: { timeout?: number; signal?: AbortSignal } = {}): Promise<Page> {
    const event = await this.client.waitFor<{
      targetInfo: { targetId: string; type: string };
    }>("Target.targetCreated", {
      timeout: options.timeout,
      signal: options.signal,
      predicate: ({ targetInfo }) => targetInfo.type === "page",
    });
    return this.attachPage(event.targetInfo.targetId);
  }

  async attachPage(targetId: string): Promise<Page> {
    const session = await this.client.attachToTarget(targetId);
    const page = new Page(session);
    page.onClose(() => this._pages.delete(page));
    await page.init();
    this._pages.add(page);
    return page;
  }

  newContext(options: BrowserContextOptions = {}): BrowserContext {
    const context = new BrowserContext(this, options);
    this._contexts.add(context);
    return context;
  }

  browserProfile(): Readonly<BrowserProfileInfo> {
    return Object.freeze({ ...this.profileInfo });
  }

  persona(input: Persona): BrowserContext {
    const persona = definePersona(input);
    const requestedProfile = persona.profileId ?? persona.profile;
    const activeProfile = this.profileInfo.profileId ?? this.profileInfo.name;
    if (this.profileInfo.known && requestedProfile && requestedProfile !== activeProfile) {
      throw new Error(
        `persona ${persona.name} requires profile ${requestedProfile}; `
          + `active browser profile is ${activeProfile ?? "unknown"}. Launch a separate browser process.`,
      );
    }
    if (
      this.profileInfo.known
      && persona.fingerprint
      && this.profileInfo.fingerprint
      && persona.fingerprint !== this.profileInfo.fingerprint
    ) {
      throw new Error(
        `persona ${persona.name} requires fingerprint ${persona.fingerprint}; `
          + `active fingerprint is ${this.profileInfo.fingerprint}`,
      );
    }
    return this.newContext(personaContextOptions(persona));
  }

  /** @internal Metadata supplied by the SDK launcher. */
  setProfileInfo(info: BrowserProfileInfo): void {
    this.profileInfo = Object.freeze({ ...info });
  }

  contexts(): BrowserContext[] {
    return [...this._contexts];
  }

  releaseContext(context: BrowserContext): void {
    this._contexts.delete(context);
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = this.closeImpl();
    return this.closePromise;
  }

  private async closeImpl(): Promise<void> {
    await Promise.all([...this._contexts].map((ctx) => ctx.close().catch(() => undefined)));
    this._contexts.clear();
    await Promise.all([...this._pages].map((page) => page.close().catch(() => undefined)));
    this._pages.clear();
    this.client.close();
  }
}
