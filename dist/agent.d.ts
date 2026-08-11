import type { Page } from "./browser/page.js";
import type { AgentSnapshot } from "./browser/lp-types.js";
import { Workflow } from "./workflow.js";
export interface AgentSnapshotOptions {
    include?: Array<"semantic" | "markdown" | "interactive" | "forms" | "links">;
    maxDepth?: number;
    timeout?: number;
}
export interface AgentAction {
    type: string;
    target?: string | number;
    input?: unknown;
    timeout?: number;
    risk?: "safe" | "external-effect" | "destructive";
}
export interface AgentTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute(input: unknown): Promise<unknown>;
}
export interface AgentCapability {
    snapshot(options?: AgentSnapshotOptions): Promise<AgentSnapshot>;
    tools(): AgentTool[];
    perform(action: AgentAction): Promise<unknown>;
}
export interface AgentPlanStep {
    name: string;
    action: AgentAction;
    timeout?: number;
    retries?: number;
}
export interface AgentPlan {
    goal: string;
    steps: AgentPlanStep[];
}
export interface AgentReasoningContext {
    page: Page;
    snapshot?: AgentSnapshot;
    tools: AgentTool[];
}
export interface AgentReasoner {
    reason(goal: string, context: AgentReasoningContext): Promise<unknown>;
    planning(goal: string, context: AgentReasoningContext): Promise<AgentPlan>;
}
export interface AgentAuditEvent {
    phase: "before" | "after" | "error";
    action: AgentAction;
    result?: unknown;
    error?: unknown;
    timestamp: string;
}
export interface AgentSessionOptions {
    reasoner?: AgentReasoner;
    authorize?: (action: AgentAction) => boolean | Promise<boolean>;
    audit?: (event: AgentAuditEvent) => void | Promise<void>;
}
/**
 * Runtime agent facade over deterministic Koko browser primitives.
 * It performs no LLM reasoning and validates actions before dispatch.
 */
export declare class AgentSession implements AgentCapability {
    readonly page: Page;
    private readonly options;
    constructor(page: Page, options?: AgentSessionOptions);
    snapshot(options?: AgentSnapshotOptions): Promise<AgentSnapshot>;
    tools(): AgentTool[];
    perform(action: AgentAction): Promise<unknown>;
    reason(goal: string, options?: AgentSnapshotOptions): Promise<unknown>;
    planning(goal: string, options?: AgentSnapshotOptions): Promise<AgentPlan>;
    workflow(plan: AgentPlan): Workflow;
    private dispatch;
    private requireReasoner;
    private emitAudit;
}
export declare function createAgentSession(page: Page, options?: AgentSessionOptions): AgentSession;
