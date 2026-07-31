# Velora SDK (`velora-sdk`)

TypeScript CDP client for the [Velora](https://github.com/ivanUri/velora) engine. Standalone repo — sibling of the engine checkout:

```
Desktop/
  velora/       # Zig engine (zig build)
  velora-sdk/   # this repo (npm: velora-sdk)
```

`Browser.launch()` with no options uses **Homebrew** when installed (`brew tap ivanUri/tap && brew install velora`).

Engine data: `$(brew --prefix velora)/share/velora`, whose fingerprint store lives at
`browser/fingerprints/<id>/fingerprint.json`. A source checkout works as a `dataRoot` too,
as long as `zig-out/bin/velora` is built.

### Pick a local build (testing)

```ts
import { Browser, listVeloraInstalls } from "velora-sdk";

// List binaries found on this machine
for (const i of listVeloraInstalls()) {
  console.log(i.id, i.binary);
}

// Presets: homebrew | path ($PATH velora)
const launched = await Browser.launch({ install: "homebrew" });

// Dev build: absolute path to binary or repo root
await Browser.launch({ install: "/Users/you/Desktop/velora/zig-out/bin/velora" });

// Named custom build via env (e.g. VELORA_INSTALL_DEV=/path/to/bin/velora)
await Browser.launch({ install: "dev" });

// Default for all scripts in a shell session
// export VELORA_INSTALL=homebrew
```

Also: `VELORA_BIN`, `VELORA_ROOT` / `dataRoot`, or `binary` for full control.

TypeScript-first; talks directly to Chrome DevTools Protocol over WebSocket. No Playwright or Puppeteer internals.

### Driver and extension layers

Portable automation remains on `Browser`, `BrowserContext`, `Page` and
`Locator`. Backend selection and optional features are explicit:

```ts
import { VeloraDriver } from "velora-sdk/driver";

const driver = new VeloraDriver();
console.log(driver.capabilities());
const browser = await driver.connect("http://127.0.0.1:9222");
```

`ChromeCdpDriver` is an experimental connect-only adapter for an existing
Chromium CDP endpoint. It does not advertise Velora semantic capabilities.

Velora-native functionality is namespaced under `page.velora`:

```ts
const snapshot = await page.velora.snapshot({
  include: ["semanticTree", "forms", "links"],
});
```

`page.agent` remains available as a compatibility alias.

For a runtime agent facade with validated actions and tool schemas:

```ts
import { createAgentSession } from "velora-sdk/agent";

const agent = createAgentSession(page);
const snapshot = await agent.snapshot({
  include: ["semantic", "forms", "links"],
  maxDepth: 6,
});

await agent.perform({ type: "click", target: "#submit" });
await agent.perform({ type: "fill", target: "#email", input: "me@example.com" });

const tools = agent.tools(); // semanticTree, markdown, forms, links, snapshot, click, fill
```

The public API is modeled after [Playwright](https://playwright.dev/docs/api/class-playwright) so automation scripts port with minimal changes.

```ts
import { Browser } from "velora-sdk";

const browser = await Browser.connect("http://127.0.0.1:9222");
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();

await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
console.log(await page.title(), await page.url());

// Locators (Playwright-style)
await page.getByRole("link", { name: "More information" }).click();
await page.getByLabel("Search").fill("velora browser");
await page.getByRole("button", { name: "Search" }).click();

// Selector shortcuts
await page.click("button.submit");
await page.fill('textarea[name="q"]', "velora browser");
await page.press("Enter");

// Low-level input is available for canvas/custom controls that have no locator.
await page.mouse.move(320, 180, { steps: 8 });
await page.mouse.click(320, 180);
await page.keyboard.type("hello");
await page.keyboard.press("Enter");

await browser.close();
```

### Browser context options

```ts
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: "VeloraBot/1.0 (+https://example.com/bot)", // see note below if you need a Chrome-style UA
  acceptLanguage: "en-US,en;q=0.9",
  locale: "en-US",
  timezoneId: "Asia/Ho_Chi_Minh",
  geolocation: { latitude: 10.762622, longitude: 106.660172 },
  permissions: ["geolocation"],
  extraHTTPHeaders: { "X-Client": "velora-sdk" },
});
```

> `userAgent` is rejected **silently** (the call succeeds, but nothing changes) if the value contains
> `"Mozilla"` and the active profile doesn't allow it — that's an engine guardrail against naively
> spoofing a full browser UA string. For real antidetect identity spoofing, use `fingerprint`/`profile`
> on `Browser.launch()` instead of a manual `userAgent` override.
>
> **Isolation caveat**: Velora currently supports a single CDP browser context per `velora serve`
> connection (a second `Target.createBrowserContext` errors). These options are applied per-page, but
> the underlying engine state (user agent, locale, timezone, geolocation, permissions, extra headers) is
> connection-wide — multiple `browser.newContext()` calls on the **same** `Browser` are not isolated
> from each other for these fields. For true per-identity isolation, use a separate `Browser.connect()`
> / `Browser.launch()` per identity.

### Session persistence (`storageState`)

```ts
// After logging in on `context`...
const state = await context.storageState(); // { cookies, origins: [{ origin, localStorage }] }
writeFileSync("state.json", JSON.stringify(state));

// ...later, or in a different run:
const state = JSON.parse(readFileSync("state.json", "utf8"));
const context = await browser.newContext({ storageState: state });
const page = await context.newPage();
await page.goto("https://example.com/dashboard"); // already logged in
```

`storageState()` only captures localStorage for origins currently open in the context — visit each
origin you care about before calling it. Restored localStorage is applied via an origin-conditional
init script (runs before page scripts on every matching navigation); cookies are restored immediately
since they aren't origin-execution-dependent.

## Velora-only features (not in Playwright)

Velora adds a **`Velora` CDP domain** and **agent-oriented APIs** for AI automation and high-density crawling.

### Launch (default)

```ts
const launched = await Browser.launch();
// Homebrew binary + the built-in `velora` fingerprint
console.log(launched.installSource); // "homebrew"
await launched.close();
```

### Launch with antidetect profile

Velora uses a Chrome-style **user-data-dir** for session state (cookies, localStorage, cache).
Identity comes from a **fingerprint folder** — installed under
`browser/fingerprints/<id>/`, embedded in a profile at `<profile>/fingerprint/`, or carried
in a **portable bundle** (`.velora-profile/`).

```ts
import {
  Browser,
  defaultUserDataDir,
  profileCookiesPath,
  listFingerprints,
  listProfiles,
  createProfile,
  exportProfile,
  importProfile,
} from "velora-sdk";

// Installed fingerprint id (no local profile folder required)
const launched = await Browser.launch({
  profile: "my-session",
  fingerprint: "chrome-macos-sonoma",
  dataRoot: "/path/to/velora-engine",
});

// Or launch from a portable bundle
await Browser.launch({
  profile: "my-tenant-profile",
  profileBundle: "/path/to/my-tenant-profile.velora-profile",
});

const page = await launched.browser.newPage();
// Cookies persist to profileCookiesPath(defaultUserDataDir(), launched.profile!)
await launched.close();
```

**Profile CLI** (wraps `velora profile`):

```ts
listFingerprints("/path/to/velora-engine"); // ["chrome-macos-sonoma", "velora", ...]
await listProfiles({ dataRoot: "..." });    // [{ name, fingerprint, profileDir, active }]
await createProfile({ name: "my-profile", fingerprint: "chrome-macos-sonoma", dataRoot: "..." });
await exportProfile({ name: "my-profile", dataRoot: "..." });
await importProfile({ name: "restored", from: "/path/to/bundle.velora-profile", dataRoot: "..." });
```

On first launch, Velora creates `~/Library/Application Support/velora/<profile>/` with
`Preferences.json` **v3** (`{ version: 3, name, fingerprint }`). Any other version is rejected
by the engine before the CDP server starts.

Resolution order for `--fingerprint-folder`: explicit folder → bundle → profile-embedded
`fingerprint/` → installed `browser/fingerprints/<id>/`. The engine rejects a path ending in
`.json` — always pass the folder.

### Engine options

Every `velora serve` flag is reachable from `Browser.launch()` / `launchVelora()` — proxying,
HTTP tuning, network guards, storage and the full logging surface:

```ts
const launched = await Browser.launch({
  httpProxy: "http://user:pass@host:8080",
  httpTimeout: 20_000,
  httpMaxConcurrent: 20,
  blockPrivateNetworks: true,
  blockCidrs: ["169.254.169.254/32", "-10.0.0.42/32"],
  obeyRobots: true,
  storageEngine: "sqlite",
  storageSqlitePath: ":memory:",
  logLevel: "warn",
  logLevels: { network: "debug" },
  logDir: "logs",
  logCdpTrace: true,
});
console.log(launched.args); // exact argv, for reproducing a run
```

### One-shot dump (`velora fetch`)

`dump()` drives the engine's CLI path, which reaches renderers and wait conditions the CDP
path does not expose — markdown/semantic-tree output, `--strip-mode`, iframe inlining,
script/selector waits, and the hard `--terminate-ms` deadline.

```ts
import { dump } from "velora-sdk";

const result = await dump("https://example.com", {
  format: "markdown",          // html | markdown (see note below)
  strip: ["js", "css"],
  withFrames: true,
  waitUntil: "done",
  waitSelector: "#results",
  terminateMs: 30_000,
  profile: "my-session",
});
console.log(result.body, result.exitCode);
```

> The engine lists `semantic_tree` / `semantic_tree_text` under `fetch --dump`, but its CLI
> path emits nothing for them (velora 1.0.2). Use `page.agent.semanticTree()` over CDP for
> those; `dump()` raises a clear error rather than returning an empty document.
>
> `dump()` reports a non-zero `exitCode` instead of throwing when the document itself is
> complete — the engine can crash during teardown after the serializer has already written it.

### SaaS / remote profile (control plane API)

```ts
await Browser.launch({
  profileId: "prof_demo",
  veloraApi: "http://127.0.0.1:3940",
  apiKey: process.env.VELORA_API_KEY, // optional
});
```

SDK fetches snapshot + session from the API, hydrates to a temp dir, launches velora, and flushes
session back on `close()`. Use the sibling `velora-api` mock server for local dev.

### AI extraction (token-efficient)

```ts
const md = await page.markdown();
const tree = await page.semanticTree({ format: "text", maxDepth: 4 });
const meta = await page.getStructuredData();
const forms = await page.detectForms();
const links = await page.links();
```

### Backend-node agent actions

Semantic tree / interactive scans return stable `backendNodeId` handles. Use `NodeHandle` instead of fragile CSS when driving agents:

```ts
const [search] = await page.findElement({ role: "combobox", name: "search" });
const input = page.node(search.backendNodeId!);
await input.fill("velora browser");

const submit = await page.waitForSelectorHandle('input[name="btnK"]');
await submit.click();
```

### Google SERP agent workflow

```ts
const serp = await page.searchGoogle({ query: "zig language tutorial", limit: 5 });
console.log(serp.results); // top organic { title, url }
```

Includes TTFX probe, block detection (`/sorry`, captcha), and `pathHint` diagnostics.

### Crawl extract + session persistence

```ts
import { createCrawlWorker, captureSessionState, restoreSessionState } from "velora-sdk";

const worker = await createCrawlWorker("http://127.0.0.1:9222");
const result = await worker.crawl({ url: "https://en.wikipedia.org/wiki/Earth" });
// result.ttfexMs, result.extractMs, result.title, ...

const state = await captureSessionState(page, "https://example.com");
await restoreSessionState(page, state);
```

### Velora `waitUntil: "done"`

Default navigation wait (also MCP default): load + network idle + document complete. Stricter than Playwright `networkidle`.

```ts
await page.goto(url, { waitUntil: "done" });
```

### Request interception

Playwright-style `page.route()` over the CDP `Fetch` domain — continue, fulfill, or abort matched requests.

```ts
await page.route("**/*.png", (route) => route.abort());
await page.route(/\/api\/.+/, async (route) => {
  if (route.request.method !== "GET") return route.continue();
  await route.fulfill({ status: 200, contentType: "application/json", body: '{"mocked":true}' });
});

await page.unroute(); // remove all handlers, disables Fetch domain
```

### Proactive JavaScript dialogs

Pre-arm alert/confirm/prompt responses before triggering JS (Velora headless auto-dismiss breaks reactive CDP):

```ts
await page.armDialog({ accept: true, promptText: "hello" });
await page.evaluate("prompt('Name?')");
```

## API map (Playwright → Velora SDK)

| Playwright | Velora SDK | Notes |
|------------|------------|-------|
| `chromium.connectOverCDP()` | `Browser.connect()` | WebSocket CDP endpoint |
| `browser.newContext()` | `browser.newContext()` | Client-side page grouping |
| `context.newPage()` | `context.newPage()` | |
| `context.cookies()` | `context.cookies()` | |
| `context.addCookies()` | `context.addCookies()` | |
| `context.clearCookies()` | `context.clearCookies()` | |
| `context.addInitScript()` | `context.addInitScript()` | |
| `page.goto()` | `page.goto()` | `waitUntil`: none, commit, domcontentloaded, load, networkidle |
| `page.reload()` | `page.reload()` | |
| `page.goBack()` / `goForward()` | `page.goBack()` / `goForward()` | Via `history.back()` / `forward()` |
| `page.title()` / `url()` | `page.title()` / `url()` | |
| `page.locator()` | `page.locator()` | CSS selector |
| `page.getByRole()` | `page.getByRole()` | |
| `page.getByText()` | `page.getByText()` | |
| `page.getByLabel()` | `page.getByLabel()` | |
| `page.getByPlaceholder()` | `page.getByPlaceholder()` | |
| `page.getByAltText()` | `page.getByAltText()` | |
| `page.getByTitle()` | `page.getByTitle()` | |
| `page.getByTestId()` | `page.getByTestId()` | `data-testid` attribute |
| `locator.click()` | `locator.click()` | Auto-waits: visible, enabled, not covered by another element |
| `locator.fill()` | `locator.fill()` | Auto-waits: visible, enabled |
| `locator.hover()` | `locator.hover()` | Auto-waits: visible, not covered by another element |
| `locator.check()` / `uncheck()` | `locator.check()` / `uncheck()` | Auto-waits: visible, enabled, not covered |
| `locator.selectOption()` | `locator.selectOption()` | Auto-waits: visible, enabled |
| `locator.textContent()` | `locator.textContent()` | |
| `locator.count()` / `first()` / `nth()` | same | |
| `page.click()` / `fill()` | `page.click()` / `fill()` | Selector sugar |
| `page.type()` | `page.type()` | Alias: `locator.fill()` |
| `page.press()` | `page.press()` | CDP `Input.dispatchKeyEvent` |
| `page.keyboard` / `page.mouse` | `page.keyboard` / `page.mouse` | Low-level CDP input for canvas and custom controls |
| `page.waitForSelector()` | `page.waitForSelector()` | |
| `page.waitForNavigation()` | `page.waitForNavigation()` | |
| `page.waitForURL()` | `page.waitForURL()` | string or RegExp |
| `page.waitForFunction()` | `page.waitForFunction()` | |
| `page.evaluate()` | `page.evaluate()` | |
| `page.content()` | `page.content()` | Single round-trip HTML |
| `page.screenshot()` | `page.screenshot()` | PNG/JPEG via CDP |
| `page.pdf()` | `page.pdf()` | |
| `page.addInitScript()` | `page.addInitScript()` | |
| `page.setViewportSize()` | `page.setViewportSize()` | |
| `page.search()` | `page.search()` | Velora helper: goto search page + type + Enter |
| `page.extract()` | `page.extract()` | Velora crawler helper (TTFX + structured extract) |
| `page.route()` | `page.route()` | `Fetch` domain: continue/fulfill/abort |
| `page.unroute()` | `page.unroute()` | |
| `captureSessionState()` | `captureSessionState()` | Cookies + storage snapshot |
| `restoreSessionState()` | `restoreSessionState()` | |

### Velora-only SDK APIs

| API | Description |
|-----|-------------|
| `Browser.launch()` | Spawn Velora with a profile, fingerprint id, folder, or bundle |
| `listFingerprints()` | Installed fingerprint ids under `browser/fingerprints/` |
| `resolveFingerprintFolder()` | Resolve the folder passed as `--fingerprint-folder` |
| `listProfiles()` / `createProfile()` / `deleteProfile()` | Profile management via `velora profile` |
| `importCookies()` / `exportProfile()` / `importProfile()` | Cookie seeding and portable bundles |
| `defaultUserDataDir()` | OS default user-data-dir path |
| `profileCookiesPath()` | `Cookies.json` path for a named profile |
| `fetch()` | Programmatic CDP fetch (html / md / json) |
| `dump()` | One-shot `velora fetch` (markdown, semantic tree, strip, waits) |
| `toEngineArgs()` | Render engine options as CLI argv |
| `page.agent` / `VeloraClient` | Low-level `Velora.*` CDP namespace |
| `page.markdown()` | Token-efficient page text |
| `page.semanticTree()` | Pruned a11y DOM for LLMs |
| `page.getStructuredData()` | JSON-LD, OpenGraph, meta |
| `page.detectForms()` | Form schema + field `backendNodeId` |
| `page.getInteractiveElements()` | Clickable/focusable inventory |
| `page.findElement()` | Find by role/name → `backendNodeId` |
| `page.node()` / `NodeHandle` | Stable backend-node actions |
| `page.waitForSelectorHandle()` | CSS wait → `NodeHandle` |
| `page.searchGoogle()` | Google SERP extract + block detect |
| `page.armDialog()` | `Velora.handleJavaScriptDialog` pre-arm |
| `page.agent.clickSelector()` | Engine-side click: selector poll + actionability |
| `page.agent.fillSelector()` | Engine-side fill (survives SPA frame swaps) |
| `page.agent.selectOptionSelector()` | Engine-side `<select>` option pick |
| `waitUntil: "done"` | Velora parse + network idle wait |
| `page.route()` / `Route` | Request interception via CDP `Fetch` domain |

### Not in SDK (use CDP client or MCP)

- `expect()` assertions — use your test runner (Node `assert`, Vitest, etc.)
- `frameLocator()` / iframe switching
- `keyboard` / `mouse` standalone objects
- `browser.newBrowserCDPSession()` tracing APIs
- `getByRole` with full accessibility tree parity (SDK uses DOM heuristics)

## Performance notes

- `Browser.connect()` enables flattened target tracking by default.
- `page.content()` uses a single `Runtime.evaluate` round-trip.
- `page.extract()` is optimized for crawler workloads (TTFX probe + structured extract).
- `waitForSelector()` uses `DOM.performSearch` when visibility is not required.
- `NetworkTracker` prunes completed requests and resets on navigation.
- `page.type()` / `page.press()` / `page.search()` avoid `form.submit()` context-destroy races.

## CLI

```bash
# HTML (default wait: domcontentloaded)
VELORA_CDP=http://127.0.0.1:9222 npx velora-fetch https://example.com

# Launch with antidetect profile
npx velora-fetch https://example.com --launch --profile chrome-local-huys-macbook-pro

# Structured extract (JSON)
VELORA_CDP=http://127.0.0.1:9222 npx velora-fetch https://en.wikipedia.org/wiki/Earth --extract
```

## Modules

- `transport/`: WebSocket CDP transport with request ids, timeout handling and pending rejection on close.
- `cdp/`: client/session/event/error layer, including flattened session routing.
- `browser/`: Browser/Page/Context/Locator, wait strategies, network tracking, crawl helpers.
- `cli/`: `velora-fetch` built on the SDK.

## Build

```bash
npm run build
# or from repo root:
npm run build
```

## Testing

Unit tests run against `locator-query`'s resolver via a real DOM (jsdom) and against faked
CDP transports/sessions — no live `velora serve` connection or browser required, so they're safe
to run in CI.

```bash
npm test          # vitest run
npm run test:watch
```
## Velora-exclusive APIs

Velora keeps portable browser automation separate from semantic and agent
features:

```ts
const tree = await page.velora.semanticTree({ maxDepth: 6 });
const markdown = await page.velora.markdown();
const forms = await page.velora.forms();
const links = await page.velora.links({ details: true, internalOnly: true });

const article = await page.extract<{ title: string }>({
  expression: `({ title: document.querySelector("h1")?.textContent?.trim() })`,
  schema: {
    type: "object",
    required: ["title"],
    properties: { title: { type: "string" } },
  },
});
```

## Common browser interactions

```ts
await page.scrollBy(0, 600);
await page.mouse.wheel(0, 300);
await page.getByText("Checkout").scrollIntoViewIfNeeded();
await page.getByLabel("Email").focus();
await page.getByLabel("Email").clear();
await page.getByLabel("Avatar").setInputFiles("/absolute/path/avatar.png");

const downloadPromise = page.waitForDownload({ path: "./downloads" });
await page.getByText("Export").click();
const download = await downloadPromise;
await download.saveAs("./report.csv");

const payment = page.frameLocator("iframe[name=payment]");
await payment.locator("#card-number").fill("4242424242424242");

const popupPromise = page.waitForPopup();
await page.getByText("Open details").click();
const popup = await popupPromise;
```

Other portable helpers include `dblclick()`, `selectText()`, `dispatchEvent()`,
`boundingBox()`, `evaluate()`, `evaluateAll()`, `allTextContents()`,
`page.setContent()`, `waitForLoadState()`, `bringToFront()` and
`emulateMedia()`.

Browser identity is process-bound. A persona may configure context-level
locale, timezone, geolocation, viewport and headers, but cannot silently switch
the active process profile:

```ts
const launched = await Browser.launch({ profile: "research" });
console.log(launched.browser.browserProfile());
const context = launched.browser.persona({
  name: "US researcher",
  profile: "research",
  locale: "en-US",
  timezoneId: "America/New_York",
});
```

Reasoning is provider-neutral and opt-in. Implement `AgentReasoner` for the
model provider you use; Velora supplies snapshots, deterministic tools, policy,
audit, plan validation and workflow execution:

```ts
const agent = createAgentSession(page, {
  reasoner,
  authorize: (action) => action.risk !== "destructive",
  audit: (event) => auditLog.push(event),
});
const plan = await agent.planning("Complete the contact form");
const results = await agent.workflow(plan).run();
```
