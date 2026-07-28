import type { Page } from "./page.js";
import { buildResolveExpression, type LocatorQuery, type LocatorResolveOptions } from "./locator-query.js";
import { delay } from "../utils/timeout.js";

export interface ActionOptions {
  timeout?: number;
}

export interface FillOptions extends ActionOptions {
  /** Clear existing value before filling (default: true). */
  clear?: boolean;
}

export interface SelectOptionValue {
  value?: string;
  label?: string;
  index?: number;
}

export interface SelectOptions extends ActionOptions {
  values?: string | string[] | SelectOptionValue | SelectOptionValue[];
}

/** Which actionability conditions must hold before the action body runs. */
interface ActionabilityChecks {
  /** Reject disabled elements (native `disabled`, `aria-disabled`, or an ancestor `[disabled]`). */
  requireEnabled?: boolean;
  /** Reject elements whose center point is covered by a different element (e.g. an overlay/spinner). */
  requirePointerTarget?: boolean;
}

/** Inline snippet: throws (caught by the poll loop in `runOnLocator`) when a condition fails. */
function actionabilitySnippet(checks: ActionabilityChecks): string {
  return `
    {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const visible = style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      if (!visible) throw new Error('element is not visible');
      ${checks.requireEnabled ? `
      const disabled = el.disabled === true
        || (typeof el.hasAttribute === 'function' && el.hasAttribute('disabled'))
        || el.getAttribute?.('aria-disabled') === 'true'
        || !!el.closest?.('[disabled]');
      if (disabled) throw new Error('element is disabled');
      ` : ""}
      ${checks.requirePointerTarget ? `
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const atPoint = document.elementFromPoint(cx, cy);
      const covered = !atPoint || (atPoint !== el && !el.contains(atPoint) && !atPoint.contains(el));
      if (covered) throw new Error('element is covered by another element and would not receive the event');
      ` : ""}
    }
  `;
}

/**
 * Resolve the locator and run `body` against it, polling until both the element resolves
 * AND the actionability checks pass (or `options.timeout` elapses) — mirrors Playwright's
 * auto-waiting instead of a single-shot resolve-and-dispatch.
 *
 * Polls with one discrete `Runtime.evaluate` round-trip per attempt, sleeping on the Node side
 * between attempts (same pattern as `waiter.ts`'s `pollExpression`) — NOT a single evaluate call
 * that sleeps internally via an in-page `setTimeout`. Velora treats a script evaluation as "host
 * nested" for its entire duration (see `EventLoop.zig`'s `isHostNested`), which blocks other
 * pending macrotasks — including a page's own already-scheduled timers — from running until that
 * evaluate returns. An in-page poll loop would therefore never observe outside state changes (e.g.
 * an overlay whose removal is scheduled via the page's own `setTimeout`) while it's polling.
 */
/** `body` must end with an explicit `return <value>;`. */
async function runOnLocator<T = true>(
  page: Page,
  queries: LocatorQuery[],
  body: string,
  options: ActionOptions = {},
  resolveOptions: LocatorResolveOptions = {},
  checks: ActionabilityChecks = {},
): Promise<T> {
  const resolve = buildResolveExpression(queries, resolveOptions);
  const timeout = options.timeout ?? 30_000;
  const check = actionabilitySnippet(checks);
  const attempt = `(() => {
    const el = ${resolve};
    ${check}
    ${body}
  })()`;

  const deadline = Date.now() + timeout;
  let lastError: Error | undefined;
  while (true) {
    try {
      return await page.evaluate<T>(attempt, { timeout: Math.min(5_000, Math.max(1_000, timeout)) });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (/strict mode violation/.test(lastError.message)) throw lastError;
    }
    if (Date.now() >= deadline) throw lastError;
    await delay(50);
  }
}

export async function locatorClick(
  page: Page,
  queries: LocatorQuery[],
  options: ActionOptions = {},
  resolveOptions: LocatorResolveOptions = {},
): Promise<void> {
  await runOnLocator(page, queries, `
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    if (typeof el.click === 'function') el.click();
    else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  `, options, resolveOptions, { requireEnabled: true, requirePointerTarget: true });
}

export async function locatorHover(
  page: Page,
  queries: LocatorQuery[],
  options: ActionOptions = {},
  resolveOptions: LocatorResolveOptions = {},
): Promise<void> {
  await runOnLocator(page, queries, `
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: false }));
    return true;
  `, options, resolveOptions, { requirePointerTarget: true });
}

export async function locatorFill(
  page: Page,
  queries: LocatorQuery[],
  text: string,
  options: FillOptions = {},
  resolveOptions: LocatorResolveOptions = {},
): Promise<void> {
  const clearFirst = options.clear !== false;
  const value = JSON.stringify(text);
  await runOnLocator(page, queries, `
    if ('focus' in el && typeof el.focus === 'function') el.focus();
    if (el.tagName === 'SELECT') {
      const wanted = ${value};
      const opt = [...el.options].find((o) => o.value === wanted || o.text === wanted);
      if (!opt) throw new Error('selectOption: no matching option');
      el.value = opt.value;
    } else if ('value' in el) {
      if (${clearFirst ? "true" : "false"}) el.value = '';
      el.value = ${value};
    } else if (el.isContentEditable) {
      if (${clearFirst ? "true" : "false"}) el.textContent = '';
      el.textContent = ${value};
    } else {
      throw new Error('fill: element is not fillable');
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `, options, resolveOptions, { requireEnabled: true });
}

export async function locatorCheck(
  page: Page,
  queries: LocatorQuery[],
  checked: boolean,
  options: ActionOptions = {},
  resolveOptions: LocatorResolveOptions = {},
): Promise<void> {
  await runOnLocator(page, queries, `
    if (!('checked' in el)) throw new Error('check: not a checkbox/radio');
    if (el.checked === ${checked ? "true" : "false"}) return;
    el.checked = ${checked ? "true" : "false"};
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `, options, resolveOptions, { requireEnabled: true, requirePointerTarget: true });
}

export async function locatorSelectOption(
  page: Page,
  queries: LocatorQuery[],
  values: SelectOptions["values"],
  options: ActionOptions = {},
  resolveOptions: LocatorResolveOptions = {},
): Promise<string[]> {
  const payload = JSON.stringify(normalizeSelectValues(values));
  return runOnLocator<string[]>(page, queries, `
    if (el.tagName !== 'SELECT') throw new Error('selectOption: not a select element');
    const specs = ${payload};
    const selected = [];
    for (const spec of specs) {
      let opt = null;
      if (spec.value != null) opt = [...el.options].find((o) => o.value === spec.value);
      else if (spec.label != null) opt = [...el.options].find((o) => o.text === spec.label);
      else if (spec.index != null) opt = el.options[spec.index] ?? null;
      if (!opt) throw new Error('selectOption: no matching option');
      if (el.multiple) opt.selected = true;
      else el.value = opt.value;
      selected.push(opt.value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return selected;
  `, options, resolveOptions, { requireEnabled: true });
}

function normalizeSelectValues(values: SelectOptions["values"]): SelectOptionValue[] {
  if (values == null) return [];
  const list = Array.isArray(values) ? values : [values];
  return list.map((item) => {
    if (typeof item === "string") return { value: item };
    return item;
  });
}