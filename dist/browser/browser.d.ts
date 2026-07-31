import { CDPClient } from "../cdp/client.js";
import type { WebSocketTransportOptions } from "../transport/websocket.js";
import { BrowserContext, type BrowserContextOptions } from "./context.js";
import { Page } from "./page.js";
import { type LaunchedVelora, type VeloraLaunchOptions } from "./launch.js";
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
     * Spawn `velora serve` and connect over CDP.
     * Default: Homebrew `velora` (`brew install velora`) + `share/velora/browser/velora.json`.
     * Antidetect: pass `profileId` + `veloraApi`. Override with `binary` / `dataRoot`.
     */
    static launch(options?: VeloraLaunchOptions): Promise<LaunchedVelora>;
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
