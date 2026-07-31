/** Velora LP CDP domain types — AI/agent-oriented extraction and backend-node actions. */
export interface SemanticTreeOptions {
    format?: "json" | "text";
    prune?: boolean;
    interactiveOnly?: boolean;
    backendNodeId?: number;
    maxDepth?: number;
    timeout?: number;
}
export interface SemanticNode {
    id: number;
    role: string;
    name?: string | null;
    value?: string | null;
    xpath: string;
    interactive: boolean;
    disabled: boolean;
    tagName: string;
    children?: SemanticNode[];
}
export interface AgentSnapshotOptions {
    include?: Array<"semanticTree" | "markdown" | "interactiveElements" | "structuredData" | "forms" | "links">;
    semanticTree?: SemanticTreeOptions;
    markdown?: MarkdownOptions;
    timeout?: number;
}
export interface AgentSnapshot {
    generation: number;
    capturedAt: string;
    semanticTree?: string | SemanticNode;
    markdown?: string;
    interactiveElements?: InteractiveElement[];
    structuredData?: StructuredData;
    forms?: DetectedForm[];
    links?: string[];
}
export interface MarkdownOptions {
    nodeId?: number;
    timeout?: number;
}
export interface InteractiveElement {
    backendNodeId?: number;
    tagName: string;
    role?: string | null;
    name?: string | null;
    type: string;
    listeners?: string[];
    disabled: boolean;
    tabIndex: number;
    id?: string | null;
    class?: string | null;
    href?: string | null;
    inputType?: string | null;
    value?: string | null;
    elementName?: string | null;
    placeholder?: string | null;
}
export interface StructuredDataProperty {
    key: string;
    value: string;
}
export interface StructuredData {
    jsonLd: string[];
    openGraph: StructuredDataProperty[];
    twitterCard: StructuredDataProperty[];
    meta: StructuredDataProperty[];
    links: StructuredDataProperty[];
    alternate: Array<{
        href: string;
        hreflang?: string | null;
        type?: string | null;
        title?: string | null;
    }>;
}
export interface FormSelectOption {
    value: string;
    text: string;
}
export interface FormField {
    backendNodeId?: number;
    tagName: string;
    name?: string | null;
    inputType?: string | null;
    required: boolean;
    disabled: boolean;
    value?: string | null;
    placeholder?: string | null;
    options: FormSelectOption[];
}
export interface DetectedForm {
    backendNodeId?: number;
    action?: string | null;
    method?: string | null;
    name?: string | null;
    id?: string | null;
    fields: FormField[];
}
export interface LinkInfo {
    url: string;
    text: string;
    title?: string | null;
    rel: string[];
    target?: string | null;
    backendNodeId?: number;
    internal: boolean;
}
export interface LinksOptions {
    timeout?: number;
    /** Return link metadata instead of the backwards-compatible URL list. */
    details?: boolean;
    internalOnly?: boolean;
    externalOnly?: boolean;
}
export interface NodeDetails {
    backendNodeId: number;
    tagName: string;
    role?: string | null;
    name?: string | null;
    interactive: boolean;
    disabled: boolean;
    value?: string | null;
    inputType?: string | null;
    placeholder?: string | null;
    href?: string | null;
    checked?: boolean | null;
    options?: FormSelectOption[];
}
export interface FindElementOptions {
    role?: string;
    name?: string;
    timeout?: number;
}
export interface DialogOptions {
    accept: boolean;
    promptText?: string;
    timeout?: number;
}
export interface ScrollOptions {
    x?: number;
    y?: number;
    timeout?: number;
}
/**
 * Engine-side selector action (`Velora.clickSelector` and friends).
 *
 * `selectorTimeout` bounds the engine's actionability polling; `timeout`
 * bounds the CDP round-trip and should be the larger of the two.
 */
export interface SelectorActionOptions {
    /** Engine actionability polling budget in ms (default: 5000). */
    selectorTimeout?: number;
    /** CDP request timeout in ms. */
    timeout?: number;
}
export interface GoogleSearchResult {
    title: string;
    url: string;
}
export interface GoogleExtractResult {
    title?: string;
    resultCount: number;
    results: GoogleSearchResult[];
    linkCount: number;
    htmlBytes: number;
    pathHint?: {
        bodyLen: number;
        hasKnitsail: boolean;
        hasSclm: boolean;
        blocked: boolean;
        shortSerp: boolean;
    };
}
export interface GoogleSearchOptions {
    query: string;
    limit?: number;
    hl?: string;
    timeout?: number;
    waitUntil?: import("./waiter.js").WaitUntil;
}
