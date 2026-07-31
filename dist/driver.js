import { Browser } from "./browser/browser.js";
import { launchVelora } from "./browser/launch.js";
export const VELORA_CAPABILITIES = Object.freeze({
    navigation: true,
    evaluation: true,
    locators: true,
    network: true,
    routing: true,
    storage: true,
    screenshots: true,
    semanticTree: true,
    markdown: true,
    structuredExtraction: true,
    isolatedContexts: false,
});
export const CHROME_CDP_CAPABILITIES = Object.freeze({
    navigation: true,
    evaluation: true,
    locators: true,
    network: true,
    routing: true,
    storage: true,
    screenshots: true,
    semanticTree: false,
    markdown: false,
    structuredExtraction: false,
    // The current portable Context implementation does not yet call
    // Target.createBrowserContext even though Chrome supports it.
    isolatedContexts: false,
});
/**
 * The first concrete driver adapter. Keeping this behind the contract makes
 * it possible to add Chrome or remote implementations without changing the
 * Browser/Context/Page object model.
 */
export class VeloraDriver {
    name = "velora";
    capabilities() {
        return VELORA_CAPABILITIES;
    }
    connect(endpoint, options = {}) {
        return Browser.connect(endpoint, options);
    }
    launch(options = {}) {
        return launchVelora(options);
    }
}
/**
 * Experimental adapter for an already-running Chromium CDP endpoint.
 * Velora extension methods are intentionally reported as unsupported.
 */
export class ChromeCdpDriver {
    name = "chrome-cdp";
    capabilities() {
        return CHROME_CDP_CAPABILITIES;
    }
    connect(endpoint, options = {}) {
        return Browser.connect(endpoint, options);
    }
}
export function createVeloraDriver() {
    return new VeloraDriver();
}
export function createChromeCdpDriver() {
    return new ChromeCdpDriver();
}
//# sourceMappingURL=driver.js.map