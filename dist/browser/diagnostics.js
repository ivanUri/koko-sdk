import { performance } from "node:perf_hooks";
import { ProtocolError } from "../cdp/errors.js";
function normalizeCapability(value) {
    return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}
function objectValue(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    return value;
}
function numericRecord(value) {
    const object = objectValue(value);
    if (!object)
        return undefined;
    const result = {};
    for (const [key, item] of Object.entries(object)) {
        if (typeof item === "number" && Number.isFinite(item))
            result[key] = item;
    }
    return result;
}
function collectCapabilities(raw) {
    const capabilities = new Set();
    const add = (value) => {
        if (typeof value === "string" && value.trim())
            capabilities.add(normalizeCapability(value));
    };
    const addList = (value) => {
        if (Array.isArray(value)) {
            for (const item of value)
                add(item);
            return;
        }
        const object = objectValue(value);
        if (object) {
            for (const [name, enabled] of Object.entries(object)) {
                if (enabled === true)
                    add(name);
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
    if (typeof raw.webSocketDebuggerUrl === "string")
        capabilities.add("cdp");
    if (typeof raw["Protocol-Version"] === "string")
        capabilities.add("cdp-protocol");
    if (typeof raw.Browser === "string" && /^koko(?:\/|$)/i.test(raw.Browser)) {
        capabilities.add("koko");
    }
    if (objectValue(raw.kokoBuild))
        capabilities.add("koko-build");
    if (numericRecord(raw.kokoStartup))
        capabilities.add("koko-startup-metrics");
    return [...capabilities].sort();
}
export function parseKokoVersionResponse(value) {
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
export async function readKokoDiagnostics(endpoint, marks) {
    const readStarted = performance.now();
    try {
        const response = await fetch(`${endpoint.replace(/\/$/, "")}/json/version`);
        if (!response.ok)
            return undefined;
        const version = parseKokoVersionResponse(await response.json());
        const readFinished = performance.now();
        const hasCapability = (feature) => {
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
            requireCapability(feature) {
                if (hasCapability(feature))
                    return;
                throw new ProtocolError(`Koko capability is unavailable: ${feature}`, {
                    payload: { capabilities: version.capabilities, browser: version.browser },
                });
            },
        };
    }
    catch {
        // Diagnostics are additive. A CDP-ready server must remain usable even if
        // this optional metadata request is unavailable or has an older shape.
        return undefined;
    }
}
function elapsed(start, end) {
    return Math.max(0, Math.round((end - start) * 100) / 100);
}
//# sourceMappingURL=diagnostics.js.map