import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/cdp/events.js";

describe("EventBus", () => {
  it("delivers emitted payloads to matching listeners only", () => {
    const bus = new EventBus();
    const onFoo = vi.fn();
    const onBar = vi.fn();
    bus.on("foo", onFoo);
    bus.on("bar", onBar);

    bus.emit("foo", { x: 1 });

    expect(onFoo).toHaveBeenCalledWith({ x: 1 });
    expect(onBar).not.toHaveBeenCalled();
  });

  it("off() removes only the given handler", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("evt", a);
    bus.on("evt", b);
    bus.off("evt", a);

    bus.emit("evt", null);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("on() returns an unsubscribe function", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on("evt", handler);

    unsubscribe();
    bus.emit("evt", null);

    expect(handler).not.toHaveBeenCalled();
  });

  it("once() fires exactly one time", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once("evt", handler);

    bus.emit("evt", 1);
    bus.emit("evt", 2);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it("onAny() receives every event with its name", () => {
    const bus = new EventBus();
    const wildcard = vi.fn();
    bus.onAny(wildcard);

    bus.emit("foo", 1);
    bus.emit("bar", 2);

    expect(wildcard).toHaveBeenNthCalledWith(1, "foo", 1);
    expect(wildcard).toHaveBeenNthCalledWith(2, "bar", 2);
  });

  it("removeAll() clears both specific and wildcard listeners", () => {
    const bus = new EventBus();
    const specific = vi.fn();
    const wildcard = vi.fn();
    bus.on("evt", specific);
    bus.onAny(wildcard);

    bus.removeAll();
    bus.emit("evt", null);

    expect(specific).not.toHaveBeenCalled();
    expect(wildcard).not.toHaveBeenCalled();
  });
});
