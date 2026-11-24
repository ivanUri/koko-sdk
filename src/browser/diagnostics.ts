import { performance } from "node:perf_hooks";
import { ProtocolError } from "../cdp/errors.js";

export interface KokoVersionMetadata {
  browser?: string;
  protocolVersion?: string;
  userAgent?: string;
  webSocketDebuggerUrl?: string;
  kokoBuild?: Readonly<Record<string, unknown>>;
  kokoStartup?: Readonly<Record<string, number>>;
  /** Capability names advertised by Core, plus stable capabilities inferred from the response. */
  capabilities: readonly string[];
  /** Original /json/version payload for forward-compatible fields. */
  raw: Readonly<Record<string, unknown>>;
}

export interface KokoStartupTiming {
  /** Unix epoch milliseconds when launchKoko started. */
  launchStartedAt: number;
  /** Time from process spawn to a responsive CDP HTTP endpoint. */
  cdpReadyMs: number;
  /** Time spent connecting the SDK CDP client after CDP became ready. */
  browserConnectMs: number;
  /** Time spent reading and parsing /json/version. */
  versionReadMs: number;
  /** End-to-end time until diagnostics were available. */
  totalMs: number;
}

export interface KokoDiagnostics {
  version: KokoVersionMetadata;
  startup: KokoStartupTiming;
  /** Return true when Core advertised or safely implied the requested feature. */
  hasCapability(feature: string): boolean;
  /** Throw a ProtocolError when the requested feature is unavailable. */
  requireCapability(feature: string): void;
}

export interface KokoStartupMarks {
  launchStartedAt: number;
  launchStartedClock: number;
  cdpReadyClock: number;
  browserConnectedClock: number;
}

function normalizeCapability(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
}

function numericRecord(value: unknown): Readonly<Record<string, number>> | undefined {
  const object = objectValue(value);
  if (!object) return undefined;
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(object)) {
    if (typeof item === "number" && Number.isFinite(item)) result[key] = item;
  }
  return result;
}

function collectCapabilities(raw: Readonly<Record<string, unknown>>): string[] {
  const capabilities = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === "string" && value.trim()) capabilities.add(normalizeCapability(value));
  };
  const addList = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) add(item);
      return;
    }
    const object = objectValue(value);
    if (object) {
      for (const [name, enabled] of Object.entries(object)) {
        if (enabled === true) add(name);
      }
    }
  };

  // These fields are intentionally permissive so newer Core builds can add an
  // explicit capability list without requiring an SDK release.
  addList(raw.capabilities);
  addList(raw.kokoCapabilities);
  addList(raw.features);
  addList(raw.kokoFeatures);

  // Stable capabilities that can be established from the existing response.
  if (typeof raw.webSocketDebuggerUrl === "string") capabilities.add("cdp");
  if (typeof raw["Protocol-Version"] === "string") capabilities.add("cdp-protocol");
  if (typeof raw.Browser === "string" && /^koko(?:\/|$)/i.test(raw.Browser)) {
    capabilities.add("koko");
  }
  if (objectValue(raw.kokoBuild)) capabilities.add("koko-build");
  if (numericRecord(raw.kokoStartup)) capabilities.add("koko-startup-metrics");

  return [...capabilities].sort();
}

export function parseKokoVersionResponse(value: unknown): KokoVersionMetadata {
  const raw = objectValue(value) ?? {};
  return {
    browser: typeof raw.Browser === "string" ? raw.Browser : undefined,
    protocolVersion: typeof raw["Protocol-Version"] === "string"
      ? raw["Protocol-Version"]
      : undefined,
    userAgent: typeof raw["User-Agent"] === "string" ? raw["User-Agent"] : undefined,
    webSocketDebuggerUrl: typeof raw.webSocketDebuggerUrl === "string"
      ? raw.webSocketDebuggerUrl
      : undefined,
    kokoBuild: objectValue(raw.kokoBuild),
    kokoStartup: numericRecord(raw.kokoStartup),
    capabilities: collectCapabilities(raw),
    raw,
  };
}

export async function readKokoDiagnostics(
  endpoint: string,
  marks: KokoStartupMarks,
): Promise<KokoDiagnostics | undefined> {
  const readStarted = performance.now();
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/json/version`);
    if (!response.ok) return undefined;
    const version = parseKokoVersionResponse(await response.json());
    const readFinished = performance.now();
    const hasCapability = (feature: string): boolean => {
      const requested = normalizeCapability(feature);
      return version.capabilities.some((capability) => normalizeCapability(capability) === requested);
    };
    return {
      version,
      startup: {
        launchStartedAt: marks.launchStartedAt,
        cdpReadyMs: elapsed(marks.launchStartedClock, marks.cdpReadyClock),
        browserConnectMs: elapsed(marks.cdpReadyClock, marks.browserConnectedClock),
        versionReadMs: elapsed(readStarted, readFinished),
        totalMs: elapsed(marks.launchStartedClock, readFinished),
      },
      hasCapability,
      requireCapability(feature: string): void {
        if (hasCapability(feature)) return;
        throw new ProtocolError(`Koko capability is unavailable: ${feature}`, {
          payload: { capabilities: version.capabilities, browser: version.browser },
        });
      },
    };
  } catch {
    // Diagnostics are additive. A CDP-ready server must remain usable even if
    // this optional metadata request is unavailable or has an older shape.
    return undefined;
  }
}

function elapsed(start: number, end: number): number {
  return Math.max(0, Math.round((end - start) * 100) / 100);
}
