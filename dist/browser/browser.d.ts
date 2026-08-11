import { CDPClient } from "../cdp/client.js";
import type { WebSocketTransportOptions } from "../transport/websocket.js";
import { BrowserContext, type BrowserContextOptions } from "./context.js";
import { Page } from "./page.js";
import { type LaunchedKoko, type KokoLaunchOptions } from "./launch.js";
import { type BrowserProfileInfo, type Persona } from "./identity.js";
export interface BrowserConnectOptions extends WebSocketTransportOptions {
    /** Enable Target.setDiscoverTargets + setAutoAttach (default: true). */
    enableTargetTracking?: boolean;
}
export declare class Browser {
    readonly client: CDPClient;
    private readonly _pages;
    private readonly _contexts;
    private closePromise?;
    private profileInfo;
    private constructor();
    static connect(endpoint: string, options?: BrowserConnectOptions): Promise<Browser>;
    /**
     * Spawn `koko serve` and connect over CDP.
     * Default: Homebrew `koko` (`brew install koko`) + `share/koko/browser/koko.json`.
     * Antidetect: pass `profileId` + `kokoApi`. Override with `binary` / `dataRoot`.
     */
    static launch(options?: KokoLaunchOptions): Promise<LaunchedKoko>;
    newSession(url?: string): Promise<import("../index.js").CDPSession>;
    newPage(url?: string): Promise<Page>;
    pages(): Page[];
    waitForPage(options?: {
        timeout?: number;
        signal?: AbortSignal;
    }): Promise<Page>;
    attachPage(targetId: string): Promise<Page>;
    newContext(options?: BrowserContextOptions): BrowserContext;
    browserProfile(): Readonly<BrowserProfileInfo>;
    persona(input: Persona): BrowserContext;
    /** @internal Metadata supplied by the SDK launcher. */
    setProfileInfo(info: BrowserProfileInfo): void;
    contexts(): BrowserContext[];
    releaseContext(context: BrowserContext): void;
    close(): Promise<void>;
    private closeImpl;
}
