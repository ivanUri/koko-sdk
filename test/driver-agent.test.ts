import { describe, expect, it, vi } from "vitest";
import {
  CHROME_CDP_CAPABILITIES,
  ChromeCdpDriver,
  VeloraDriver,
  VELORA_CAPABILITIES,
} from "../src/driver.js";
import { VeloraClient } from "../src/browser/lp-client.js";
import { NodeHandle } from "../src/browser/node-handle.js";
import { StaleElementError } from "../src/cdp/errors.js";
import { Workflow } from "../src/workflow.js";
import { AgentSession } from "../src/agent.js";
import { Browser } from "../src/browser/browser.js";
import { definePersona } from "../src/browser/identity.js";
import { Page } from "../src/browser/page.js";

describe("driver capabilities", () => {
  it("reports Velora extensions without claiming isolated contexts", () => {
    const driver = new VeloraDriver();
    expect(driver.name).toBe("velora");
    expect(driver.capabilities()).toBe(VELORA_CAPABILITIES);
    expect(driver.capabilities()).toMatchObject({
      navigation: true,
      semanticTree: true,
      isolatedContexts: false,
    });
  });

  it("does not advertise Velora semantic domains for Chrome CDP", () => {
    const driver = new ChromeCdpDriver();
    expect(driver.name).toBe("chrome-cdp");
    expect(driver.capabilities()).toBe(CHROME_CDP_CAPABILITIES);
    expect(driver.capabilities()).toMatchObject({
      navigation: true,
      semanticTree: false,
      markdown: false,
    });
  });
});

describe("Velora agent snapshot", () => {
  it("captures selected semantic resources with a document generation", async () => {
    const page = {
      generation: 7,
      init: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue([{
        url: "https://example.com/a",
        text: "A",
        rel: [],
        internal: true,
      }]),
    };
    const session = {
      send: vi.fn((method: string) => {
        if (method === "Velora.getSemanticTree") return Promise.resolve({ semanticTree: { role: "document" } });
        if (method === "Velora.detectForms") return Promise.resolve({ forms: [] });
        return Promise.resolve({});
      }),
    };
    const client = new VeloraClient(page as never, session as never);

    const snapshot = await client.snapshot({
      include: ["semanticTree", "forms", "links"],
    });

    expect(snapshot.generation).toBe(7);
    expect(snapshot.semanticTree).toEqual({ role: "document" });
    expect(snapshot.forms).toEqual([]);
    expect(snapshot.links).toEqual(["https://example.com/a"]);
  });

  it("returns structured link metadata and supports origin filtering", async () => {
    const page = {
      init: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue([
        { url: "https://example.com/a", text: "A", rel: [], internal: true },
        { url: "https://other.test/b", text: "B", rel: ["nofollow"], internal: false },
      ]),
    };
    const client = new VeloraClient(page as never, { send: vi.fn() } as never);

    await expect(client.links({ details: true, externalOnly: true })).resolves.toEqual([
      { url: "https://other.test/b", text: "B", rel: ["nofollow"], internal: false },
    ]);
    await expect(client.links({ internalOnly: true })).resolves.toEqual([
      "https://example.com/a",
    ]);
  });
});

describe("backend node generations", () => {
  it("rejects actions after the page navigates to another document", async () => {
    const page = {
      generation: 1,
      init: vi.fn().mockResolvedValue(undefined),
      waitForNavigation: vi.fn(),
      agent: { clickNode: vi.fn() },
    };
    const handle = new NodeHandle(page as never, 42);
    page.generation = 2;

    await expect(handle.click()).rejects.toThrow(StaleElementError);
    expect(page.agent.clickNode).not.toHaveBeenCalled();
  });
});

describe("agent tools and workflow", () => {
  it("exposes deterministic tool schemas from VeloraClient", () => {
    const client = new VeloraClient({ generation: 1 } as never, { send: vi.fn() } as never);
    expect(client.tools().map((tool) => tool.name)).toEqual([
      "semanticTree",
      "markdown",
      "forms",
      "links",
    ]);
  });

  it("ships a runtime AgentSession with validated selector actions", async () => {
    const click = vi.fn().mockResolvedValue(undefined);
    const page = {
      velora: { tools: () => [], snapshot: vi.fn() },
      locator: vi.fn(() => ({ click })),
      node: vi.fn(),
      press: vi.fn(),
    };
    const agent = new AgentSession(page as never);

    await agent.perform({ type: "click", target: "#submit" });

    expect(page.locator).toHaveBeenCalledWith("#submit");
    expect(click).toHaveBeenCalledOnce();
    expect(agent.tools().map((tool) => tool.name)).toEqual(["snapshot", "click", "fill"]);
  });

  it("rejects unsupported agent actions before touching the page", async () => {
    const page = {
      velora: { tools: () => [], snapshot: vi.fn() },
      locator: vi.fn(),
      node: vi.fn(),
      press: vi.fn(),
    };
    const agent = new AgentSession(page as never);

    await expect(agent.perform({ type: "purchase", target: "#buy" }))
      .rejects.toThrow("unsupported agent action");
    expect(page.locator).not.toHaveBeenCalled();
  });

  it("runs workflow steps in order and passes previous outputs", async () => {
    const workflow = new Workflow("smoke")
      .add({ name: "first", run: async () => 2 })
      .add({ name: "second", run: async ({ outputs }) => (outputs.first as number) + 3 });

    await expect(workflow.run()).resolves.toEqual([
      { name: "first", value: 2, attempts: 1 },
      { name: "second", value: 5, attempts: 1 },
    ]);
  });

  it("uses an injected reasoner and converts a validated plan into a workflow", async () => {
    const click = vi.fn().mockResolvedValue("clicked");
    const audit = vi.fn();
    const page = {
      velora: { tools: () => [], snapshot: vi.fn().mockResolvedValue({ generation: 1 }) },
      locator: vi.fn(() => ({ click })),
      node: vi.fn(),
      press: vi.fn(),
    };
    const reasoner = {
      reason: vi.fn().mockResolvedValue({ summary: "click submit" }),
      planning: vi.fn().mockResolvedValue({
        goal: "submit",
        steps: [{ name: "click", action: { type: "click", target: "#submit" } }],
      }),
    };
    const agent = new AgentSession(page as never, { reasoner, audit });

    await expect(agent.reason("submit")).resolves.toEqual({ summary: "click submit" });
    const plan = await agent.planning("submit");
    await expect(agent.workflow(plan).run()).resolves.toEqual([
      { name: "click", value: "clicked", attempts: 1 },
    ]);
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it("retries workflow steps according to the step policy", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("ok");
    const workflow = new Workflow("retry").add({ name: "step", retries: 1, run });

    await expect(workflow.run()).resolves.toEqual([
      { name: "step", value: "ok", attempts: 2 },
    ]);
  });
});

describe("Velora exclusive APIs", () => {
  it("validates structured extraction results against the declared schema", async () => {
    const session = { send: vi.fn() };
    const page = new Page(session as never);
    (page as any).initialized = true;
    vi.spyOn(page.waiter, "pollUntilTruthy").mockResolvedValue(undefined);
    vi.spyOn(page, "evaluate").mockResolvedValue({ title: 42 });

    await expect(page.extract({
      expression: "({ title: 42 })",
      schema: {
        type: "object",
        required: ["title"],
        properties: { title: { type: "string" } },
      },
    })).rejects.toThrow("$.title must be string");
  });

  it("exposes immutable launch profile metadata and rejects persona identity switching", () => {
    const browser = Object.create(Browser.prototype) as Browser;
    browser.setProfileInfo({
      source: "local",
      known: true,
      name: "alice",
      fingerprint: "mac",
    });
    const info = browser.browserProfile();

    expect(info).toMatchObject({ name: "alice", fingerprint: "mac", known: true });
    expect(() => browser.persona(definePersona({
      name: "Bob",
      profile: "bob",
    }))).toThrow("Launch a separate browser process");
  });
});
