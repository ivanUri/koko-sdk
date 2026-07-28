import type { CDPSession } from "../cdp/session.js";
import { ProtocolError } from "../cdp/errors.js";
import type {
  DetectedForm,
  DialogOptions,
  FindElementOptions,
  InteractiveElement,
  MarkdownOptions,
  NodeDetails,
  ScrollOptions,
  SelectorActionOptions,
  SemanticNode,
  SemanticTreeOptions,
  StructuredData,
} from "./lp-types.js";
import type { Page } from "./page.js";

/**
 * CDP domain served by the engine (`src/protocols/cdp/domains/velora.zig`).
 * Anything else returns UnknownDomain.
 */
const DOMAIN = "Velora";

const method = (name: string): string => `${DOMAIN}.${name}`;

/**
 * Velora-namespaced semantic and locator API.
 *
 * Selector actions (`clickSelector`, `fillSelector`, `selectOptionSelector`)
 * keep selector polling, SPA frame changes and actionability inside the engine,
 * so callers do not reproduce visibility/retry policy with Runtime.evaluate.
 */
export class VeloraClient {
  constructor(
    private readonly page: Page,
    private readonly session: CDPSession,
  ) {}

  async markdown(options: MarkdownOptions = {}): Promise<string> {
    const result = await this.session.send<{ markdown: string }>(
      method("getMarkdown"),
      options.nodeId != null ? { nodeId: options.nodeId } : {},
      options.timeout,
    );
    return result.markdown;
  }

  async semanticTree(options: SemanticTreeOptions = {}): Promise<string | SemanticNode> {
    const params: Record<string, unknown> = {};
    if (options.format === "text") params.format = "text";
    if (options.prune != null) params.prune = options.prune;
    if (options.interactiveOnly != null) params.interactiveOnly = options.interactiveOnly;
    if (options.backendNodeId != null) params.backendNodeId = options.backendNodeId;
    if (options.maxDepth != null) params.maxDepth = options.maxDepth;

    const result = await this.session.send<{ semanticTree: string | SemanticNode }>(
      method("getSemanticTree"),
      params,
      options.timeout,
    );
    return result.semanticTree;
  }

  async getInteractiveElements(options: { nodeId?: number; timeout?: number } = {}): Promise<InteractiveElement[]> {
    const result = await this.session.send<{ elements: InteractiveElement[] }>(
      method("getInteractiveElements"),
      options.nodeId != null ? { nodeId: options.nodeId } : {},
      options.timeout,
    );
    return result.elements ?? [];
  }

  async getStructuredData(options: { timeout?: number } = {}): Promise<StructuredData> {
    const result = await this.session.send<{ structuredData: StructuredData }>(
      method("getStructuredData"),
      {},
      options.timeout,
    );
    return result.structuredData;
  }

  async detectForms(options: { timeout?: number } = {}): Promise<DetectedForm[]> {
    const result = await this.session.send<{ forms: DetectedForm[] }>(
      method("detectForms"),
      {},
      options.timeout,
    );
    return result.forms ?? [];
  }

  async getNodeDetails(backendNodeId: number, options: { timeout?: number } = {}): Promise<NodeDetails> {
    const result = await this.session.send<{ nodeDetails: NodeDetails }>(
      method("getNodeDetails"),
      { backendNodeId },
      options.timeout,
    );
    return result.nodeDetails;
  }

  async findElement(options: FindElementOptions): Promise<InteractiveElement[]> {
    if (!options.role && !options.name) {
      throw new ProtocolError("findElement: at least one of role or name is required");
    }
    const elements = await this.getInteractiveElements({ timeout: options.timeout });
    return elements.filter((el) => {
      if (options.role && (!el.role || !equalsIgnoreCase(el.role, options.role))) return false;
      if (options.name && (!el.name || !containsIgnoreCase(el.name, options.name))) return false;
      return el.backendNodeId != null;
    });
  }

  async links(options: { timeout?: number } = {}): Promise<string[]> {
    await this.page.init();
    return this.page.evaluate<string[]>(`(() => {
      const out = [];
      const seen = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href;
        if (!href || seen.has(href)) continue;
        seen.add(href);
        out.push(href);
      }
      return out;
    })()`, { timeout: options.timeout });
  }

  async waitForSelectorNode(selector: string, options: { timeout?: number } = {}): Promise<number> {
    const result = await this.session.send<{ backendNodeId: number }>(
      method("waitForSelector"),
      { selector, timeout: options.timeout ?? 5000 },
      options.timeout,
    );
    return result.backendNodeId;
  }

  /**
   * Pre-arm the next window.alert/confirm/prompt response.
   *
   * Velora dialogs do not suspend V8, so this must be called *before* the
   * script that opens the dialog — a reactive Page.handleJavaScriptDialog
   * would arrive after JS already returned.
   */
  async armDialog(options: DialogOptions): Promise<void> {
    await this.session.send(
      method("handleJavaScriptDialog"),
      { accept: options.accept, promptText: options.promptText },
      options.timeout,
    );
  }

  async clickNode(backendNodeId: number, options: { timeout?: number } = {}): Promise<void> {
    await this.session.send(method("clickNode"), { backendNodeId }, options.timeout);
  }

  async fillNode(backendNodeId: number, text: string, options: { timeout?: number } = {}): Promise<void> {
    await this.session.send(method("fillNode"), { backendNodeId, text }, options.timeout);
  }

  async clickSelector(selector: string, options: SelectorActionOptions = {}): Promise<void> {
    await this.session.send(
      method("clickSelector"),
      { selector, timeout: options.selectorTimeout ?? 5000 },
      options.timeout,
    );
  }

  async fillSelector(selector: string, text: string, options: SelectorActionOptions = {}): Promise<void> {
    await this.session.send(
      method("fillSelector"),
      { selector, text, timeout: options.selectorTimeout ?? 5000 },
      options.timeout,
    );
  }

  async selectOptionSelector(
    selector: string,
    value: string,
    options: SelectorActionOptions = {},
  ): Promise<void> {
    await this.session.send(
      method("selectOptionSelector"),
      { selector, value, timeout: options.selectorTimeout ?? 5000 },
      options.timeout,
    );
  }

  async scrollNode(backendNodeId: number | undefined, options: ScrollOptions = {}): Promise<void> {
    const params: Record<string, unknown> = {};
    if (backendNodeId != null) params.backendNodeId = backendNodeId;
    if (options.x != null) params.x = options.x;
    if (options.y != null) params.y = options.y;
    await this.session.send(method("scrollNode"), params, options.timeout);
  }

  async hoverNode(backendNodeId: number, options: { timeout?: number } = {}): Promise<void> {
    await this.session.send(method("hoverNode"), { backendNodeId }, options.timeout);
  }

  async pressKey(key: string, options: { backendNodeId?: number; timeout?: number } = {}): Promise<void> {
    const params: Record<string, unknown> = { key };
    if (options.backendNodeId != null) params.backendNodeId = options.backendNodeId;
    await this.session.send(method("pressKey"), params, options.timeout);
  }

  async selectOptionNode(backendNodeId: number, value: string, options: { timeout?: number } = {}): Promise<void> {
    await this.session.send(method("selectOptionNode"), { backendNodeId, value }, options.timeout);
  }

  async setCheckedNode(backendNodeId: number, checked: boolean, options: { timeout?: number } = {}): Promise<void> {
    await this.session.send(method("setCheckedNode"), { backendNodeId, checked }, options.timeout);
  }
}

/** @deprecated Renamed to `VeloraClient`; the engine domain is `Velora`, not `LP`. */
export { VeloraClient as LPClient };

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function containsIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
