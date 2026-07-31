import { TargetClosedError } from "./errors.js";
export class CDPSession {
    client;
    sessionId;
    targetId;
    _closed;
    _pending = new Set();
    _subscriptions = new Set();
    constructor(client, sessionId, targetId) {
        this.client = client;
        this.sessionId = sessionId;
        this.targetId = targetId;
    }
    get closed() {
        return this._closed;
    }
    send(method, params, timeout, signal) {
        if (this._closed)
            return Promise.reject(this._closed);
        return new Promise((resolve, reject) => {
            const tracker = { reject };
            this._pending.add(tracker);
            this.client.send(method, params, this.sessionId, timeout, signal).then((value) => { this._pending.delete(tracker); resolve(value); }, (error) => { this._pending.delete(tracker); reject(error); });
        });
    }
    on(event, handler) {
        const unsubscribe = this.client.onSession(this.sessionId, event, handler);
        return this.trackSubscription(unsubscribe);
    }
    once(event, handler) {
        let off = () => undefined;
        const unsubscribe = this.client.onceSession(this.sessionId, event, (payload) => {
            off();
            handler(payload);
        });
        off = this.trackSubscription(unsubscribe);
        return off;
    }
    waitFor(event, options) {
        if (this._closed)
            return Promise.reject(this._closed);
        return this.client.waitForSession(this.sessionId, event, options);
    }
    /** Internal: mark session as closed and reject all in-flight requests. */
    markClosed(reason) {
        if (this._closed)
            return;
        this._closed = reason ?? new TargetClosedError("Session closed", { sessionId: this.sessionId });
        for (const tracker of this._pending)
            tracker.reject(this._closed);
        this._pending.clear();
        for (const unsubscribe of [...this._subscriptions])
            unsubscribe();
        this._subscriptions.clear();
    }
    async detach() {
        if (this._closed)
            return;
        try {
            await this.client.detachSession(this.sessionId);
        }
        finally {
            this.markClosed(new TargetClosedError("Session detached", { sessionId: this.sessionId }));
        }
    }
    trackSubscription(unsubscribe) {
        let active = true;
        const tracked = () => {
            if (!active)
                return;
            active = false;
            this._subscriptions.delete(tracked);
            unsubscribe();
        };
        this._subscriptions.add(tracked);
        return tracked;
    }
}
//# sourceMappingURL=session.js.map