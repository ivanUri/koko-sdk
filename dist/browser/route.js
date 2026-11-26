export class Route {
    session;
    requestId;
    request;
    handled = false;
    constructor(session, requestId, request) {
        this.session = session;
        this.requestId = requestId;
        this.request = request;
    }
    async continue(options = {}) {
        this.ensureOnce();
        const headers = options.headers
            ? Object.entries(options.headers).map(([name, value]) => ({ name, value }))
            : undefined;
        await this.session.send("Fetch.continueRequest", {
            requestId: this.requestId,
            url: options.url,
            postData: options.postData,
            headers,
        });
    }
    async abort(errorReason = "Aborted") {
        this.ensureOnce();
        await this.session.send("Fetch.failRequest", { requestId: this.requestId, errorReason });
    }
    async fulfill(options = {}) {
        this.ensureOnce();
        const headers = options.headers
            ? Object.entries(options.headers).map(([name, value]) => ({ name, value }))
            : options.contentType
                ? [{ name: "Content-Type", value: options.contentType }]
                : undefined;
        const body = options.body == null
            ? undefined
            : typeof options.body === "string"
                ? Buffer.from(options.body).toString("base64")
                : options.body.toString("base64");
        await this.session.send("Fetch.fulfillRequest", {
            requestId: this.requestId,
            responseCode: options.status ?? 200,
            responseHeaders: headers,
            body,
        });
    }
    /** Whether this paused request has reached a terminal Fetch action. */
    get isHandled() {
        return this.handled;
    }
    ensureOnce() {
        if (this.handled)
            throw new Error("Route already handled");
        this.handled = true;
    }
}
export function matchesRoutePattern(url, pattern) {
    if (typeof pattern === "string") {
        if (pattern === "*" || pattern === "**")
            return true;
        if (!pattern.includes("*") && !pattern.includes("?"))
            return url.includes(pattern);
        return globToRegExp(pattern).test(url);
    }
    if (pattern instanceof RegExp) {
        pattern.lastIndex = 0;
        const matched = pattern.test(url);
        pattern.lastIndex = 0;
        return matched;
    }
    return pattern(url);
}
function globToRegExp(pattern) {
    let source = "";
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        if (char === "*" && pattern[i + 1] === "*") {
            source += ".*";
            i++;
        }
        else if (char === "*") {
            source += "[^/]*";
        }
        else if (char === "?") {
            source += "[^/]";
        }
        else {
            source += char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
        }
    }
    return new RegExp(`^${source}$`);
}
export class RouteRegistry {
    session;
    fetchEnabled = false;
    handlers = [];
    unsubscribe;
    constructor(session) {
        this.session = session;
    }
    async route(pattern, handler) {
        this.handlers.push({ pattern, handler });
        await this.ensureFetchEnabled();
    }
    async unroute(pattern, handler) {
        if (pattern == null && handler == null) {
            this.handlers.length = 0;
            await this.disableFetch();
            return;
        }
        for (let i = this.handlers.length - 1; i >= 0; i--) {
            const entry = this.handlers[i];
            if (pattern != null && entry.pattern !== pattern)
                continue;
            if (handler != null && entry.handler !== handler)
                continue;
            this.handlers.splice(i, 1);
        }
        if (this.handlers.length === 0) {
            await this.disableFetch();
        }
    }
    dispose() {
        this.handlers.length = 0;
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.fetchEnabled = false;
    }
    async ensureFetchEnabled() {
        if (this.fetchEnabled)
            return;
        this.unsubscribe = this.session.on("Fetch.requestPaused", (event) => {
            void this.onRequestPaused(event);
        });
        try {
            await this.session.send("Fetch.enable", {
                patterns: [{ urlPattern: "*", requestStage: "Request" }],
            });
            this.fetchEnabled = true;
        }
        catch (error) {
            this.unsubscribe();
            this.unsubscribe = undefined;
            throw error;
        }
    }
    async onRequestPaused(event) {
        const url = event?.request?.url ?? "";
        const requestId = event?.requestId;
        if (!requestId)
            return;
        for (const { pattern, handler } of this.handlers) {
            if (!matchesRoutePattern(url, pattern))
                continue;
            const headers = {};
            const raw = event?.request?.headers ?? {};
            for (const [name, value] of Object.entries(raw)) {
                if (typeof value === "string")
                    headers[name] = value;
            }
            const route = new Route(this.session, requestId, {
                url,
                method: event?.request?.method ?? "GET",
                headers,
                postData: event?.request?.postData,
            });
            try {
                await handler(route);
            }
            catch {
                if (!route.isHandled)
                    await route.continue().catch(() => undefined);
            }
            // A handler that returns without choosing a terminal action must not
            // leave the browser request paused forever.
            if (!route.isHandled)
                await route.continue().catch(() => undefined);
            return;
        }
        await this.session.send("Fetch.continueRequest", { requestId }).catch(() => undefined);
    }
    async disableFetch() {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        if (this.fetchEnabled) {
            await this.session.send("Fetch.disable").catch(() => undefined);
        }
        this.fetchEnabled = false;
    }
}
//# sourceMappingURL=route.js.map