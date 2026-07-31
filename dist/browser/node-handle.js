import { StaleElementError } from "../cdp/errors.js";
/**
 * Stable backend-node handle for Velora agent actions.
 * Unlike CSS locators, backendNodeId survives semantic tree / interactive element scans.
 */
export class NodeHandle {
    page;
    backendNodeId;
    documentGeneration;
    constructor(page, backendNodeId, documentGeneration = page.generation) {
        this.page = page;
        this.backendNodeId = backendNodeId;
        this.documentGeneration = documentGeneration;
    }
    async click(options = {}) {
        this.assertCurrentDocument();
        await this.page.init();
        await this.page.agent.clickNode(this.backendNodeId, options);
    }
    async fill(text, options = {}) {
        this.assertCurrentDocument();
        await this.page.init();
        await this.page.agent.fillNode(this.backendNodeId, text, options);
    }
    async hover(options = {}) {
        this.assertCurrentDocument();
        await this.page.init();
        await this.page.agent.hoverNode(this.backendNodeId, options);
    }
    async scroll(options = {}) {
        this.assertCurrentDocument();
        await this.page.init();
        await this.page.agent.scrollNode(this.backendNodeId, options);
    }
    async selectOption(value, options = {}) {
        this.assertCurrentDocument();
        await this.page.init();
        await this.page.agent.selectOptionNode(this.backendNodeId, value, options);
    }
    async check(options = {}) {
        await this.setChecked(true, options);
    }
    async uncheck(options = {}) {
        await this.setChecked(false, options);
    }
    async setChecked(checked, options = {}) {
        this.assertCurrentDocument();
        await this.page.init();
        await this.page.agent.setCheckedNode(this.backendNodeId, checked, options);
    }
    async press(key, options = {}) {
        this.assertCurrentDocument();
        await this.page.init();
        const nav = options.waitForNavigation
            ? this.page.waitForNavigation(typeof options.waitForNavigation === "object" ? options.waitForNavigation : {})
            : undefined;
        nav?.catch(() => undefined);
        await this.page.agent.pressKey(key, { backendNodeId: this.backendNodeId, timeout: options.timeout });
        if (nav)
            await nav;
    }
    async details(options = {}) {
        this.assertCurrentDocument();
        await this.page.init();
        return this.page.agent.getNodeDetails(this.backendNodeId, options);
    }
    assertCurrentDocument() {
        if (this.documentGeneration != null
            && this.page.generation != null
            && this.documentGeneration !== this.page.generation) {
            throw new StaleElementError(`Backend node ${this.backendNodeId} belongs to an earlier document generation`, { payload: { expected: this.documentGeneration, actual: this.page.generation } });
        }
    }
}
//# sourceMappingURL=node-handle.js.map