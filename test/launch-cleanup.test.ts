import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { terminateChildProcess } from "../src/browser/launch.js";

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn(() => {
    this.exitCode = 0;
    this.emit("exit", 0, null);
    return true;
  });
}

describe("launch cleanup", () => {
  it("terminates a child process and resolves after exit", async () => {
    const child = new FakeChild();
    await terminateChildProcess(child as unknown as ChildProcess);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
