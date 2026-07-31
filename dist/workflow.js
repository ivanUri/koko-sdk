import { AbortError } from "./cdp/errors.js";
import { delay, withTimeout } from "./utils/timeout.js";
/**
 * Deterministic workflow execution for browser/agent tools.
 * It deliberately contains no model reasoning; callers provide the steps.
 */
export class Workflow {
    name;
    steps = [];
    constructor(name = "workflow") {
        this.name = name;
    }
    add(step) {
        this.steps.push(step);
        return this;
    }
    async run(options = {}) {
        const outputs = {};
        const results = [];
        for (const step of this.steps) {
            if (options.signal?.aborted) {
                throw new AbortError(`Workflow aborted: ${this.name}`, { operation: this.name });
            }
            let attempts = 0;
            while (true) {
                attempts++;
                try {
                    const value = await withTimeout(step.run({ signal: options.signal, outputs }), {
                        timeout: step.timeout ?? 30_000,
                        signal: options.signal,
                        label: `Workflow step timed out: ${step.name}`,
                        method: `${this.name}.${step.name}`,
                    });
                    outputs[step.name] = value;
                    results.push({ name: step.name, value, attempts });
                    break;
                }
                catch (error) {
                    if (attempts <= (step.retries ?? 0)) {
                        if (step.retryDelay)
                            await delay(step.retryDelay);
                        continue;
                    }
                    results.push({ name: step.name, error, attempts });
                    if (options.stopOnError ?? true)
                        throw error;
                    break;
                }
            }
        }
        return results;
    }
}
//# sourceMappingURL=workflow.js.map