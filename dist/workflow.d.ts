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
export declare class Workflow {
    readonly name: string;
    private readonly steps;
    constructor(name?: string);
    add<T>(step: WorkflowStep<T>): this;
    run(options?: WorkflowRunOptions): Promise<WorkflowStepResult[]>;
}
