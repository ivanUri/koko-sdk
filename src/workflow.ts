import { AbortError } from "./cdp/errors.js";
import { delay, withTimeout } from "./utils/timeout.js";

export interface WorkflowStepContext {
  signal?: AbortSignal;
  outputs: Record<string, unknown>;
}

export interface WorkflowStep<T = unknown> {
  name: string;
  run(context: WorkflowStepContext): Promise<T>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface WorkflowRunOptions {
  signal?: AbortSignal;
  stopOnError?: boolean;
}

export interface WorkflowStepResult {
  name: string;
  value?: unknown;
  error?: unknown;
  attempts: number;
}

/**
 * Deterministic workflow execution for browser/agent tools.
 * It deliberately contains no model reasoning; callers provide the steps.
 */
export class Workflow {
  private readonly steps: WorkflowStep[] = [];

  constructor(readonly name = "workflow") {}

  add<T>(step: WorkflowStep<T>): this {
    this.steps.push(step);
    return this;
  }

  async run(options: WorkflowRunOptions = {}): Promise<WorkflowStepResult[]> {
    const outputs: Record<string, unknown> = {};
    const results: WorkflowStepResult[] = [];
    for (const step of this.steps) {
      if (options.signal?.aborted) {
        throw new AbortError(`Workflow aborted: ${this.name}`, { operation: this.name });
      }
      let attempts = 0;
      while (true) {
        attempts++;
        try {
          const value = await withTimeout(
            step.run({ signal: options.signal, outputs }),
            {
              timeout: step.timeout ?? 30_000,
              signal: options.signal,
              label: `Workflow step timed out: ${step.name}`,
              method: `${this.name}.${step.name}`,
            },
          );
          outputs[step.name] = value;
          results.push({ name: step.name, value, attempts });
          break;
        } catch (error) {
          if (attempts <= (step.retries ?? 0)) {
            if (step.retryDelay) await delay(step.retryDelay);
            continue;
          }
          results.push({ name: step.name, error, attempts });
          if (options.stopOnError ?? true) throw error;
          break;
        }
      }
    }
    return results;
  }
}
