import { ProtocolError } from "../cdp/errors.js";
/**
 * CDP domain served by the engine (`src/protocols/cdp/domains/koko.zig`).
 * Anything else returns UnknownDomain.
 */
const DOMAIN = "Koko";
const method = (name) => `${DOMAIN}.${name}`;
/**
 * Koko-namespaced semantic and locator API.
 *
 * Selector actions (`clickSelector`, `fillSelector`, `selectOptionSelector`)
 * keep selector polling, SPA frame changes and actionability inside the engine,
 * so callers do not reproduce visibility/retry policy with Runtime.evaluate.
 */
export class KokoClient {
    page;
    session;
    constructor(page, session) {
        this.page = page;
        this.session = session;
    }
    tools() {
        return [
            {
                name: "semanticTree",
                description: "Return the current page semantic tree.",
                inputSchema: { type: "object", properties: { format: { type: "string" } } },
                execute: (input) => this.semanticTree((input ?? {})),
            },
            {
                name: "markdown",
                description: "Return token-efficient page markdown.",
                inputSchema: { type: "object", properties: {} },
                execute: () => this.markdown(),
            },
            {
                name: "forms",
                description: "Detect forms and fields on the current page.",
                inputSchema: { type: "object", properties: {} },
                execute: () => this.detectForms(),
            },
            {
                name: "links",
                description: "Extract unique absolute links from the current page.",
                inputSchema: { type: "object", properties: {} },
                execute: () => this.links(),
            },
        ];
    }
    async snapshot(options = {}) {
        const include = new Set(options.include ?? [
            "semanticTree",
            "interactiveElements",
            "forms",
            "links",
        ]);
        const snapshot = {
            generation: this.page.generation,
            capturedAt: new Date().toISOString(),
        };
        await Promise.all([
            include.has("semanticTree")
                ? this.semanticTree({ ...options.semanticTree, timeout: options.timeout ?? options.semanticTree?.timeout })
                    .then((value) => { snapshot.semanticTree = value; })
                : undefined,
            include.has("markdown")
                ? this.markdown({ ...options.markdown, timeout: options.timeout ?? options.markdown?.timeout })
                    .then((value) => { snapshot.markdown = value; })
                : undefined,
            include.has("interactiveElements")
                ? this.getInteractiveElements({ timeout: options.timeout })
                    .then((value) => { snapshot.interactiveElements = value; })
                : undefined,
            include.has("structuredData")
                ? this.getStructuredData({ timeout: options.timeout })
                    .then((value) => { snapshot.structuredData = value; })
                : undefined,
            include.has("forms")
                ? this.detectForms({ timeout: options.timeout })
                    .then((value) => { snapshot.forms = value; })
                : undefined,
            include.has("links")
                ? this.links({ timeout: options.timeout }).then((value) => { snapshot.links = value; })
                : undefined,
        ]);
        return snapshot;
    }
    async markdown(options = {}) {
        const result = await this.session.send(method("getMarkdown"), options.nodeId != null ? { nodeId: options.nodeId } : {}, options.timeout);
        return result.markdown;
    }
    async semanticTree(options = {}) {
        const params = {};
        if (options.format === "text")
            params.format = "text";
        if (options.prune != null)
            params.prune = options.prune;
        if (options.interactiveOnly != null)
            params.interactiveOnly = options.interactiveOnly;
        if (options.backendNodeId != null)
            params.backendNodeId = options.backendNodeId;
        if (options.maxDepth != null)
            params.maxDepth = options.maxDepth;
        const result = await this.session.send(method("getSemanticTree"), params, options.timeout);
        return result.semanticTree;
    }
    async getInteractiveElements(options = {}) {
        const result = await this.session.send(method("getInteractiveElements"), options.nodeId != null ? { nodeId: options.nodeId } : {}, options.timeout);
        return result.elements ?? [];
    }
    async getStructuredData(options = {}) {
        const result = await this.session.send(method("getStructuredData"), {}, options.timeout);
        return result.structuredData;
    }
    async detectForms(options = {}) {
        const result = await this.session.send(method("detectForms"), {}, options.timeout);
        return result.forms ?? [];
    }
    /** Canonical Koko extension name; detectForms remains backwards compatible. */
    forms(options = {}) {
        return this.detectForms(options);
    }
    async getNodeDetails(backendNodeId, options = {}) {
        const result = await this.session.send(method("getNodeDetails"), { backendNodeId }, options.timeout);
        return result.nodeDetails;
    }
    async findElement(options) {
        if (!options.role && !options.name) {
            throw new ProtocolError("findElement: at least one of role or name is required");
        }
        const elements = await this.getInteractiveElements({ timeout: options.timeout });
        return elements.filter((el) => {
            if (options.role && (!el.role || !equalsIgnoreCase(el.role, options.role)))
                return false;
            if (options.name && (!el.name || !containsIgnoreCase(el.name, options.name)))
                return false;
            return el.backendNodeId != null;
        });
    }
    async links(options = {}) {
        await this.page.init();
        const links = await this.page.evaluate(`(() => {
      const out = [];
      const seen = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href;
        if (!href || seen.has(href)) continue;
        seen.add(href);
        out.push({
          url: href,
          text: (a.textContent || '').trim(),
          title: a.getAttribute('title'),
          rel: (a.getAttribute('rel') || '').split(/\\s+/).filter(Boolean),
          target: a.getAttribute('target'),
          internal: a.origin === location.origin,
        });
      }
      return out;
    })()`, { timeout: options.timeout });
        const filtered = links.filter((link) => {
            if (options.internalOnly && !link.internal)
                return false;
            if (options.externalOnly && link.internal)
                return false;
            return true;
        });
        return options.details ? filtered : filtered.map((link) => link.url);
    }
    async waitForSelectorNode(selector, options = {}) {
        const result = await this.session.send(method("waitForSelector"), { selector, timeout: options.timeout ?? 5000 }, options.timeout);
        return result.backendNodeId;
    }
    /**
     * Pre-arm the next window.alert/confirm/prompt response.
     *
     * Koko dialogs do not suspend V8, so this must be called *before* the
     * script that opens the dialog — a reactive Page.handleJavaScriptDialog
     * would arrive after JS already returned.
     */
    async armDialog(options) {
        await this.session.send(method("handleJavaScriptDialog"), { accept: options.accept, promptText: options.promptText }, options.timeout);
    }
    async clickNode(backendNodeId, options = {}) {
        await this.session.send(method("clickNode"), { backendNodeId }, options.timeout);
    }
    async fillNode(backendNodeId, text, options = {}) {
        await this.session.send(method("fillNode"), { backendNodeId, text }, options.timeout);
    }
    async clickSelector(selector, options = {}) {
        await this.session.send(method("clickSelector"), { selector, timeout: options.selectorTimeout ?? 5000 }, options.timeout);
    }
    async fillSelector(selector, text, options = {}) {
        await this.session.send(method("fillSelector"), { selector, text, timeout: options.selectorTimeout ?? 5000 }, options.timeout);
    }
    async selectOptionSelector(selector, value, options = {}) {
        await this.session.send(method("selectOptionSelector"), { selector, value, timeout: options.selectorTimeout ?? 5000 }, options.timeout);
    }
    async scrollNode(backendNodeId, options = {}) {
        const params = {};
        if (backendNodeId != null)
            params.backendNodeId = backendNodeId;
        if (options.x != null)
            params.x = options.x;
        if (options.y != null)
            params.y = options.y;
        await this.session.send(method("scrollNode"), params, options.timeout);
    }
    async hoverNode(backendNodeId, options = {}) {
        await this.session.send(method("hoverNode"), { backendNodeId }, options.timeout);
    }
    async pressKey(key, options = {}) {
        const params = { key };
        if (options.backendNodeId != null)
            params.backendNodeId = options.backendNodeId;
        await this.session.send(method("pressKey"), params, options.timeout);
    }
    async selectOptionNode(backendNodeId, value, options = {}) {
        await this.session.send(method("selectOptionNode"), { backendNodeId, value }, options.timeout);
    }
    async setCheckedNode(backendNodeId, checked, options = {}) {
        await this.session.send(method("setCheckedNode"), { backendNodeId, checked }, options.timeout);
    }
}
/** @deprecated Renamed to `KokoClient`; the engine domain is `Koko`, not `LP`. */
export { KokoClient as LPClient };
function equalsIgnoreCase(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}
function containsIgnoreCase(haystack, needle) {
    return haystack.toLowerCase().includes(needle.toLowerCase());
}
//# sourceMappingURL=lp-client.js.map