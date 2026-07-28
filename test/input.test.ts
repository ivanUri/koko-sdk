import { describe, expect, it } from "vitest";
import { Keyboard, Mouse } from "../src/browser/input.js";

function fakeSession() {
  const calls: Array<{ method: string; params: any }> = [];
  return {
    calls,
    send: async (method: string, params: any) => {
      calls.push({ method, params });
      return {};
    },
  } as any;
}

describe("low-level input", () => {
  it("dispatches named keys and text through CDP", async () => {
    const session = fakeSession();
    const keyboard = new Keyboard(session);
    await keyboard.press("Enter");
    await keyboard.type("ok");

    expect(session.calls.map((c: any) => c.method)).toEqual([
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
    ]);
    expect(session.calls[0].params).toMatchObject({ type: "keyDown", key: "Enter", code: "Enter" });
    expect(session.calls[2].params).toMatchObject({ type: "char", text: "o" });
  });

  it("moves and clicks with interpolated coordinates", async () => {
    const session = fakeSession();
    const mouse = new Mouse(session);
    await mouse.click(30, 20, { steps: 2, clickCount: 2 });

    const moves = session.calls.filter((c: any) => c.params.type === "mouseMoved");
    expect(moves).toHaveLength(2);
    expect(moves[0].params).toMatchObject({ x: 15, y: 10 });
    expect(moves[1].params).toMatchObject({ x: 30, y: 20 });
    expect(session.calls.filter((c: any) => c.params.type === "mousePressed")).toHaveLength(2);
    expect(session.calls.filter((c: any) => c.params.type === "mouseReleased")).toHaveLength(2);
  });
});
