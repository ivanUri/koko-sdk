import type { CDPSession } from "../cdp/session.js";
import type { DetectedForm, DialogOptions, FindElementOptions, InteractiveElement, MarkdownOptions, NodeDetails, ScrollOptions, SelectorActionOptions, SemanticNode, SemanticTreeOptions, StructuredData } from "./lp-types.js";
import type { Page } from "./page.js";
/**
 * Velora-namespaced semantic and locator API.
 *
 * Selector actions (`clickSelector`, `fillSelector`, `selectOptionSelector`)
 * keep selector polling, SPA frame changes and actionability inside the engine,
 * so callers do not reproduce visibility/retry policy with Runtime.evaluate.
 */
export declare class VeloraClient {
    private readonly page;
    private readonly session;
    constructor(page: Page, session: CDPSession);
    markdown(options?: MarkdownOptions): Promise<string>;
    semanticTree(options?: SemanticTreeOptions): Promise<string | SemanticNode>;
    getInteractiveElements(options?: {
        nodeId?: number;
        timeout?: number;
    }): Promise<InteractiveElement[]>;
    getStructuredData(options?: {
        timeout?: number;
    }): Promise<StructuredData>;
    detectForms(options?: {
        timeout?: number;
    }): Promise<DetectedForm[]>;
    getNodeDetails(backendNodeId: number, options?: {
        timeout?: number;
    }): Promise<NodeDetails>;
    findElement(options: FindElementOptions): Promise<InteractiveElement[]>;
    links(options?: {
        timeout?: number;
    }): Promise<string[]>;
    waitForSelectorNode(selector: string, options?: {
        timeout?: number;
    }): Promise<number>;
    /**
     * Pre-arm the next window.alert/confirm/prompt response.
     *
     * Velora dialogs do not suspend V8, so this must be called *before* the
     * script that opens the dialog — a reactive Page.handleJavaScriptDialog
     * would arrive after JS already returned.
     */
    armDialog(options: DialogOptions): Promise<void>;
    clickNode(backendNodeId: number, options?: {
        timeout?: number;
    }): Promise<void>;
    fillNode(backendNodeId: number, text: string, options?: {
        timeout?: number;
    }): Promise<void>;
    clickSelector(selector: string, options?: SelectorActionOptions): Promise<void>;
    fillSelector(selector: string, text: string, options?: SelectorActionOptions): Promise<void>;
    selectOptionSelector(selector: string, value: string, options?: SelectorActionOptions): Promise<void>;
    scrollNode(backendNodeId: number | undefined, options?: ScrollOptions): Promise<void>;
    hoverNode(backendNodeId: number, options?: {
        timeout?: number;
    }): Promise<void>;
    pressKey(key: string, options?: {
        backendNodeId?: number;
        timeout?: number;
    }): Promise<void>;
    selectOptionNode(backendNodeId: number, value: string, options?: {
        timeout?: number;
    }): Promise<void>;
    setCheckedNode(backendNodeId: number, checked: boolean, options?: {
        timeout?: number;
    }): Promise<void>;
}
/** @deprecated Renamed to `VeloraClient`; the engine domain is `Velora`, not `LP`. */
export { VeloraClient as LPClient };
