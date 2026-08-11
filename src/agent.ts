import { ProtocolError } from "./cdp/errors.js";
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
export class AgentSession implements AgentCapability {
  constructor(readonly page: Page, private readonly options: AgentSessionOptions = {}) {}

  snapshot(options: AgentSnapshotOptions = {}): Promise<AgentSnapshot> {
    const includeMap = {
      semantic: "semanticTree",
      markdown: "markdown",
      interactive: "interactiveElements",
      forms: "forms",
      links: "links",
    } as const;
    return this.page.koko.snapshot({
      include: options.include?.map((name) => includeMap[name]),
      semanticTree: options.maxDepth != null ? { maxDepth: options.maxDepth } : undefined,
      timeout: options.timeout,
    });
  }

  tools(): AgentTool[] {
    return [
      ...this.page.koko.tools(),
      {
        name: "snapshot",
        description: "Capture a generation-bound semantic page snapshot.",
        inputSchema: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            maxDepth: { type: "number" },
          },
        },
        execute: (input) => this.snapshot(asRecord(input) as AgentSnapshotOptions),
      },
      {
        name: "click",
        description: "Click a selector or backend node.",
        inputSchema: {
          type: "object",
          required: ["target"],
          properties: {
            target: { anyOf: [{ type: "string" }, { type: "number" }] },
          },
        },
        execute: (input) => this.perform({ type: "click", ...asRecord(input) }),
      },
      {
        name: "fill",
        description: "Fill a selector or backend node with text.",
        inputSchema: {
          type: "object",
          required: ["target", "input"],
          properties: {
            target: { anyOf: [{ type: "string" }, { type: "number" }] },
            input: { type: "string" },
          },
        },
        execute: (input) => this.perform({ type: "fill", ...asRecord(input) }),
      },
    ];
  }

  async perform(action: AgentAction): Promise<unknown> {
    if (this.options.authorize && !await this.options.authorize(action)) {
      throw invalidAction(action, "agent action denied by policy");
    }
    await this.emitAudit({ phase: "before", action, timestamp: new Date().toISOString() });
    try {
      const result = await this.dispatch(action);
      await this.emitAudit({
        phase: "after",
        action,
        result,
        timestamp: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      await this.emitAudit({
        phase: "error",
        action,
        error,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async reason(goal: string, options: AgentSnapshotOptions = {}): Promise<unknown> {
    const reasoner = this.requireReasoner();
    return reasoner.reason(goal, {
      page: this.page,
      snapshot: await this.snapshot(options),
      tools: this.tools(),
    });
  }

  async planning(goal: string, options: AgentSnapshotOptions = {}): Promise<AgentPlan> {
    const reasoner = this.requireReasoner();
    const plan = await reasoner.planning(goal, {
      page: this.page,
      snapshot: await this.snapshot(options),
      tools: this.tools(),
    });
    if (!plan || plan.goal !== goal || !Array.isArray(plan.steps)) {
      throw new ProtocolError("reasoner returned an invalid agent plan", {
        operation: "agent.planning",
        payload: plan,
      });
    }
    for (const [index, step] of plan.steps.entries()) {
      if (!step?.name || !step.action?.type) {
        throw new ProtocolError(`invalid agent plan step at index ${index}`, {
          operation: "agent.planning",
          payload: step,
        });
      }
    }
    return plan;
  }

  workflow(plan: AgentPlan): Workflow {
    const workflow = new Workflow(plan.goal);
    for (const step of plan.steps) {
      workflow.add({
        name: step.name,
        timeout: step.timeout,
        retries: step.retries,
        run: () => this.perform(step.action),
      });
    }
    return workflow;
  }

  private async dispatch(action: AgentAction): Promise<unknown> {
    switch (action.type) {
      case "click": {
        if (typeof action.target === "number") return this.page.node(action.target).click({ timeout: action.timeout });
        if (typeof action.target === "string" && action.target) {
          return this.page.locator(action.target).click({ timeout: action.timeout });
        }
        throw invalidAction(action, "click requires a selector or backend node target");
      }
      case "fill": {
        if (typeof action.input !== "string") throw invalidAction(action, "fill requires string input");
        if (typeof action.target === "number") {
          return this.page.node(action.target).fill(action.input, { timeout: action.timeout });
        }
        if (typeof action.target === "string" && action.target) {
          return this.page.locator(action.target).fill(action.input, { timeout: action.timeout });
        }
        throw invalidAction(action, "fill requires a selector or backend node target");
      }
      case "press": {
        if (typeof action.input !== "string" || !action.input) {
          throw invalidAction(action, "press requires a key in input");
        }
        if (typeof action.target === "number") {
          return this.page.node(action.target).press(action.input, { timeout: action.timeout });
        }
        if (typeof action.target === "string" && action.target) {
          return this.page.locator(action.target).press(action.input, { timeout: action.timeout });
        }
        return this.page.press(action.input, { timeout: action.timeout });
      }
      case "snapshot":
        return this.snapshot(asRecord(action.input) as AgentSnapshotOptions);
      default:
        throw invalidAction(action, `unsupported agent action: ${action.type}`);
    }
  }

  private requireReasoner(): AgentReasoner {
    if (!this.options.reasoner) {
      throw new ProtocolError(
        "agent reason/planning requires an AgentReasoner adapter",
        { operation: "agent.reasoner" },
      );
    }
    return this.options.reasoner;
  }

  private async emitAudit(event: AgentAuditEvent): Promise<void> {
    await this.options.audit?.(event);
  }
}

export function createAgentSession(page: Page, options: AgentSessionOptions = {}): AgentSession {
  return new AgentSession(page, options);
}

function asRecord(value: unknown): Record<string, any> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ProtocolError("agent input must be an object", {
      code: "PROTOCOL_ERROR",
      operation: "agent.validate",
    });
  }
  return value as Record<string, any>;
}

function invalidAction(action: AgentAction, message: string): ProtocolError {
  return new ProtocolError(message, {
    operation: "agent.perform",
    payload: action,
  });
}
