import { beforeAll, describe, expect, it } from "vitest";
import {
  buildAllExpression,
  buildCountExpression,
  buildResolveExpression,
} from "../src/browser/locator-query.js";

// These expression strings are shipped verbatim to `Runtime.evaluate` in production (see
// browser/actions.ts / browser/locator.ts). Evaluating them here against a real DOM (jsdom)
// exercises the exact same resolver code path without needing a live engine + CDP connection.
beforeAll(() => {
  // jsdom has no layout engine — every element reports a 0x0 rect. Stub a fixed non-zero box so
  // `isVisible()`'s width/height check behaves like a real browser; the `display`/`visibility`
  // half of that check still reflects real computed style, so hidden-element filtering is still
  // genuinely exercised below.
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return { x: 0, y: 0, width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, toJSON() {} } as DOMRect;
  };
  if (!(globalThis as any).CSS?.escape) {
    (globalThis as any).CSS = { escape: (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
  }
});

function run<T>(expr: string): T {
  // Indirect eval: runs in global scope so `document`/`window` from the jsdom test environment resolve.
  return (0, eval)(expr) as T;
}

describe("locator-query resolver", () => {
  it("resolves by css selector", () => {
    document.body.innerHTML = `<button class="go">Go</button>`;
    const el = run<HTMLElement>(buildResolveExpression([{ kind: "css", selector: "button.go" }]));
    expect(el.textContent).toBe("Go");
  });

  it("resolves by role + exact accessible name", () => {
    document.body.innerHTML = `<button aria-label="Submit form">Submit</button><button>Cancel</button>`;
    const expr = buildResolveExpression([{ kind: "role", role: "button", name: "Submit form", exact: true }]);
    const el = run<HTMLElement>(expr);
    expect(el.getAttribute("aria-label")).toBe("Submit form");
  });

  it("resolves by label text via label[for=]", () => {
    document.body.innerHTML = `<label for="email">Email</label><input id="email" />`;
    const el = run<HTMLInputElement>(buildResolveExpression([{ kind: "label", text: "Email", exact: true }]));
    expect(el.id).toBe("email");
  });

  it("resolves by data-testid", () => {
    document.body.innerHTML = `<div data-testid="card-1">A</div><div data-testid="card-2">B</div>`;
    const el = run<HTMLElement>(buildResolveExpression([{ kind: "testId", testId: "card-2" }]));
    expect(el.textContent).toBe("B");
  });

  it("filters out display:none elements", () => {
    document.body.innerHTML = `<button style="display:none">Hidden</button><button>Visible</button>`;
    const el = run<HTMLElement>(buildResolveExpression([{ kind: "css", selector: "button" }]));
    expect(el.textContent).toBe("Visible");
  });

  it("nth(-1) selects the last match", () => {
    document.body.innerHTML = `<li>1</li><li>2</li><li>3</li>`;
    const expr = buildResolveExpression([{ kind: "css", selector: "li" }], { index: -1 });
    expect(run<HTMLElement>(expr).textContent).toBe("3");
  });

  it("throws a clear error when 0 elements match", () => {
    document.body.innerHTML = `<div></div>`;
    const expr = buildResolveExpression([{ kind: "css", selector: ".missing" }]);
    expect(() => run(expr)).toThrow(/resolved to 0 elements/);
  });

  it("throws a strict-mode error when multiple elements match and strict is set", () => {
    document.body.innerHTML = `<div class="x"></div><div class="x"></div>`;
    const expr = buildResolveExpression([{ kind: "css", selector: ".x" }], { strict: true });
    expect(() => run(expr)).toThrow(/strict mode violation/);
  });

  it("count() reflects the number of matches", () => {
    document.body.innerHTML = `<li>1</li><li>2</li><li>3</li>`;
    expect(run<number>(buildCountExpression([{ kind: "css", selector: "li" }]))).toBe(3);
  });

  it("filters matches by descendant text and nested locator", () => {
    document.body.innerHTML = `
      <article><h2>First</h2><button>Open</button></article>
      <article><h2>Second</h2></article>
    `;
    const expression = buildAllExpression([
      { kind: "css", selector: "article" },
      {
        kind: "filter",
        hasText: "First",
        has: [{ kind: "role", role: "button", name: "Open", exact: true }],
      },
    ]);
    expect(run<Element[]>(expression)).toHaveLength(1);
    expect(run<Element[]>(expression)[0]?.querySelector("h2")?.textContent).toBe("First");
  });

  it("unions two independent locator branches", () => {
    document.body.innerHTML = `<button>A</button><a href="#">B</a><span>C</span>`;
    const expression = buildAllExpression([{
      kind: "union",
      branches: [
        [{ kind: "role", role: "button" }],
        [{ kind: "role", role: "link" }],
      ],
    }]);
    expect(run<Element[]>(expression).map((element) => element.textContent)).toEqual(["A", "B"]);
  });
});
