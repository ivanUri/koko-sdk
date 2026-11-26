import { CDPClient } from "../cdp/client.js";
import { BrowserContext } from "./context.js";
import { Page } from "./page.js";
import { launchKoko } from "./launch.js";
import { definePersona, personaContextOptions, } from "./identity.js";
export class Browser {
    client;
    _pages = new Set();
    _contexts = new Set();
    closePromise;
    profileInfo = { source: "connected", known: false };
    constructor(client) {
        this.client = client;
    }
    static async connect(endpoint, options = {}) {
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
    static async launch(options = {}) {
        return launchKoko(options);
    }
    async newSession(url = "about:blank") {
        return this.client.newSession(url);
    }
    async newPage(url = "about:blank") {
        // Create a blank target first so callers can install page setup before
        // the first real navigation. Creating it at `url` would load the page
        // once and then navigate to it a second time below.
        const session = await this.client.newSession("about:blank");
        const page = new Page(session);
        page.onClose(() => this._pages.delete(page));
        this._pages.add(page);
        try {
            await page.init();
            if (url !== "about:blank")
                await page.goto(url);
            return page;
        }
        catch (error) {
            await page.close().catch(() => undefined);
            throw error;
        }
    }
    pages() {
        return [...this._pages];
    }
    async waitForPage(options = {}) {
        const event = await this.client.waitFor("Target.targetCreated", {
            timeout: options.timeout,
            signal: options.signal,
            predicate: ({ targetInfo }) => targetInfo.type === "page",
        });
        return this.attachPage(event.targetInfo.targetId);
    }
    async attachPage(targetId) {
        const session = await this.client.attachToTarget(targetId);
        const page = new Page(session);
        page.onClose(() => this._pages.delete(page));
        this._pages.add(page);
        try {
            await page.init();
            return page;
        }
        catch (error) {
            await page.close().catch(() => undefined);
            throw error;
        }
    }
    newContext(options = {}) {
        const context = new BrowserContext(this, options);
        this._contexts.add(context);
        return context;
    }
    browserProfile() {
        return Object.freeze({ ...this.profileInfo });
    }
    persona(input) {
        const persona = definePersona(input);
        const requestedProfile = persona.profileId ?? persona.profile;
        const activeProfile = this.profileInfo.profileId ?? this.profileInfo.name;
        if (this.profileInfo.known && requestedProfile && requestedProfile !== activeProfile) {
            throw new Error(`persona ${persona.name} requires profile ${requestedProfile}; `
                + `active browser profile is ${activeProfile ?? "unknown"}. Launch a separate browser process.`);
        }
        if (this.profileInfo.known
            && persona.fingerprint
            && this.profileInfo.fingerprint
            && persona.fingerprint !== this.profileInfo.fingerprint) {
            throw new Error(`persona ${persona.name} requires fingerprint ${persona.fingerprint}; `
                + `active fingerprint is ${this.profileInfo.fingerprint}`);
        }
        return this.newContext(personaContextOptions(persona));
    }
    /** @internal Metadata supplied by the SDK launcher. */
    setProfileInfo(info) {
        this.profileInfo = Object.freeze({ ...info });
    }
    contexts() {
        return [...this._contexts];
    }
    releaseContext(context) {
        this._contexts.delete(context);
    }
    async close() {
        if (this.closePromise)
            return this.closePromise;
        this.closePromise = this.closeImpl();
        return this.closePromise;
    }
    async closeImpl() {
        await Promise.all([...this._contexts].map((ctx) => ctx.close().catch(() => undefined)));
        this._contexts.clear();
        await Promise.all([...this._pages].map((page) => page.close().catch(() => undefined)));
        this._pages.clear();
        this.client.close();
    }
}
//# sourceMappingURL=browser.js.map