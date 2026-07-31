import type { BrowserContextOptions } from "./context.js";
export interface BrowserProfileInfo {
    source: "connected" | "local" | "bundle" | "remote";
    name?: string;
    profileId?: string;
    fingerprint?: string;
    fingerprintFolder?: string;
    userDataDir?: string;
    known: boolean;
}
export interface Persona {
    name: string;
    profile?: string;
    profileId?: string;
    fingerprint?: string;
    userDataDir?: string;
    locale?: string;
    timezoneId?: string;
    geolocation?: BrowserContextOptions["geolocation"];
    viewport?: BrowserContextOptions["viewport"];
    extraHTTPHeaders?: Record<string, string>;
}
export declare function definePersona(persona: Persona): Readonly<Persona>;
export declare function personaContextOptions(persona: Persona): BrowserContextOptions;
