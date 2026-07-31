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

export function definePersona(persona: Persona): Readonly<Persona> {
  if (!persona.name.trim()) throw new TypeError("persona.name must not be empty");
  if (persona.profile && persona.profileId) {
    throw new TypeError("persona cannot define both profile and profileId");
  }
  return Object.freeze({
    ...persona,
    geolocation: persona.geolocation ? Object.freeze({ ...persona.geolocation }) : undefined,
    viewport: persona.viewport ? Object.freeze({ ...persona.viewport }) : undefined,
    extraHTTPHeaders: persona.extraHTTPHeaders
      ? Object.freeze({ ...persona.extraHTTPHeaders })
      : undefined,
  });
}

export function personaContextOptions(persona: Persona): BrowserContextOptions {
  return {
    locale: persona.locale,
    timezoneId: persona.timezoneId,
    geolocation: persona.geolocation,
    viewport: persona.viewport,
    extraHTTPHeaders: persona.extraHTTPHeaders,
  };
}
