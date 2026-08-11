Senior Architecture Review – Koko SDK
Executive summary
Tôi đã đọc toàn bộ repository koko-sdk, gồm 45 file TypeScript, source, tests, examples, scripts, cấu hình build/package; đồng thời dựng dependency/call graph và chạy lại baseline.
Kết quả xác minh:
npm test: 36/36 test pass.
npm run typecheck: pass.
npm run build: pass.
npm pack --dry-run: pass.
Branch main sạch và đồng bộ origin/main.
HEAD: 064fc99 feat: complete product SDK APIs and tests.
Kết luận ngắn:
Koko SDK hiện là một TypeScript client tốt cho Koko qua CDP, có các primitive browser automation tương đối quen thuộc và một tập API semantic/agent rất có tiềm năng. Tuy nhiên, nó chưa phải một browser automation framework độc lập, ổn định và đa-driver.

Rào cản kiến trúc lớn nhất là public API đang gắn trực tiếp với CDP và đặc điểm riêng của Koko ở hầu hết các tầng. Driver boundary chưa tồn tại; Page đang mang quá nhiều trách nhiệm; cancellation, lifecycle và event API còn thiếu.
Điểm hiện tại: 6.4/10.
Tiềm năng sau khi hoàn thành Driver Interface, lifecycle model và Koko Extension layer: 8.5–9/10.
1. Repository Overview
Cấu trúc
koko-sdk/
├── src/
│   ├── browser/
│   │   ├── browser.ts
│   │   ├── context.ts
│   │   ├── page.ts
│   │   ├── locator.ts
│   │   ├── locator-query.ts
│   │   ├── actions.ts
│   │   ├── network.ts
│   │   ├── request.ts
│   │   ├── route.ts
│   │   ├── waiter.ts
│   │   ├── input.ts
│   │   ├── node-handle.ts
│   │   ├── lp-client.ts
│   │   ├── lp-types.ts
│   │   ├── launch.ts
│   │   ├── crawl.ts
│   │   └── ...
│   ├── cdp/
│   │   ├── client.ts
│   │   ├── session.ts
│   │   ├── events.ts
│   │   └── errors.ts
│   ├── transport/
│   │   └── websocket.ts
│   ├── profile*.ts
│   ├── koko-install.ts
│   ├── fetch.ts
│   ├── dump.ts
│   └── index.ts
├── tests/
├── examples/
├── scripts/
├── dist/
├── package.json
└── tsconfig.json
Kiến trúc hiện tại
Public API
    │
    ├── Browser / Context / Page / Locator
    │             │
    │             ├── Network / Route / Input / Waiter
    │             └── KokoClient – semantic/agent APIs
    │
    ├── Profile / Install / Launch / Dump / Fetch
    │
    ▼
CDPClient / CDPSession
    │
    ▼
WebSocketTransport
    │
    ▼
Koko Runtime
Đây là kiến trúc phân lớp hợp lý cho một CDP SDK, nhưng chưa phải kiến trúc driver-neutral.
Dependency graph cho thấy:
browser → cdp: coupling mạnh và trực tiếp.
transport → cdp: transport tạo trực tiếp các CDP error.
Page là điểm hội tụ của navigation, input, locator, network, routing, extraction và agent API.
KokoClient.method() là điểm hội tụ của gần như toàn bộ Koko domain.
Page.init(), locator resolution và timeout utility là các hotspot có fan-in cao.
Build và package
Package dùng:
TypeScript strict.
ESM.
Node.js >=20.
ws là runtime dependency duy nhất.
Vitest cho test.
tsc cho build.
Cấu hình nhìn chung đơn giản và dễ duy trì tại [package.json (line 1)](/Users/huydev/Desktop/koko/koko-sdk/package.json:1).
Những vấn đề packaging:
Chưa có exports map.
Root package xuất gần như toàn bộ low-level internals.
Package chứa cả dist lẫn src.
dist được commit vào Git.
Chưa có API snapshot hay public-surface compatibility test.
Chưa có CI workflow trong SDK repository.
Tests và examples
Hiện có 36 unit test, tập trung vào:
CDP session.
Event bus.
Context.
Input.
Locator query.
Route matcher.
Timeout.
Thiếu test quan trọng cho:
Page.
Browser.
WebSocket lifecycle.
Launch/termination.
Navigation correlation.
Network tracking.
Route handler lifecycle.
Koko semantic APIs.
Profile/control-plane.
Integration với Koko Runtime thật.
Compatibility với Chrome.
Package consumer smoke test.
Examples hiện khá hữu ích: crawl, semantic agent và markdown dump. Nhưng chúng chưa được chạy như một phần CI.
2. SDK Architecture
Trách nhiệm hiện tại
Module	Trách nhiệm	Đánh giá
Browser	Kết nối CDP, quản lý target/page/context	Nhỏ, dễ hiểu nhưng phụ thuộc trực tiếp CDP
BrowserContext	Gom page, áp dụng UA/storage/locale/permissions	API tốt nhưng không thật sự isolated
Page	Navigation, evaluate, content, locator, input, route, agent	Quá nhiều trách nhiệm
Locator	Query, chaining, actionability và element actions	DX tốt, semantics chưa hoàn toàn giống Playwright
NodeHandle	Thao tác bằng backend node ID	Có giá trị cho agent, thiếu generation safety
NetworkTracker	Theo dõi request/response/in-flight/idle	Cohesion tốt
RouteRegistry	Request interception	Ý tưởng đúng, còn lỗi lifecycle
PageWaiter	Navigation/load/network-idle waiting	Cần correlation và deadline model tốt hơn
CDPClient	Browser-level protocol, target/session tracking	Là protocol facade, chưa phải Driver
CDPSession	Session-scoped commands/events	Gọn, nhưng thiếu cancellation
WebSocketTransport	Request ID, timeout, message dispatch	Hợp lý nhưng lifecycle chưa production-grade
KokoClient	Semantic tree, markdown, forms, structured data	Lợi thế cạnh tranh rõ
Profile/install	Local/remote profile và binary discovery	Có giá trị nhưng không nên nằm chung root namespace

Cohesion
Điểm tốt:
NetworkTracker, CDPSession, EventBus, input và profile helpers tương đối cohesive.
Semantic features được tập trung qua KokoClient.
Transport, protocol và browser facade đã được tách thành thư mục riêng.
Điểm yếu:
[Page (line 105)](/Users/huydev/Desktop/koko/koko-sdk/src/browser/page.ts:105) là god object hơn 500 dòng.
Page vừa là portable browser API, vừa là Koko extension, vừa chứa các helper cụ thể như Google search và generic extraction có logic Wikipedia.
Root export trộn API consumer, low-level protocol, utility, profile filesystem và product-control-plane tại [index.ts (line 1)](/Users/huydev/Desktop/koko/koko-sdk/src/index.ts:1).
Coupling
Coupling với Koko Runtime là cao:
Browser giữ concrete CDPClient.
Page, Context, Locator, Network, Route giữ hoặc gọi concrete CDPSession.
Các module gọi trực tiếp method string như Page.navigate, Runtime.evaluate, Koko.*.
Launch mirror trực tiếp CLI flags, filesystem layout, fingerprints và profile control plane.
Một số semantics phụ thuộc riêng vào Koko: waitUntil: "done", dialog behavior, profile restrictions và Koko.*.
Extensibility
Có thể mở rộng thêm method trên Koko hiện tại khá dễ. Nhưng việc thêm Chrome, Firefox hoặc remote driver sẽ khó vì protocol đã xuyên qua object model.
Đánh giá:
Mở rộng tính năng cho Koko: 8/10.
Mở rộng backend/driver mới: 3.5/10.
Maintainability khi API tăng gấp đôi: 5.5/10.
3. Public API Review
API thiết kế tốt
Các API quen thuộc và dễ khám phá:
const browser = await Browser.launch();
const context = browser.newContext();
const page = await context.newPage();

await page.goto(url);
await page.getByRole("button", { name: "Submit" }).click();
await page.getByLabel("Email").fill("user@example.com");
Điểm tốt:
Browser → Context → Page → Locator là mental model đã được thị trường kiểm chứng.
first(), last(), nth(), getByRole(), getByText() dễ dùng.
storageState() dùng shape gần Playwright.
page.agent.semanticTree(), markdown(), forms() thể hiện đúng thế mạnh Koko.
Request/Response wrappers tốt hơn việc trả raw CDP payload.
NodeHandle tạo nền móng tốt cho stable agent actions.
API quá phức tạp hoặc đặt sai tầng
Root namespace quá rộng
[index.ts (line 1)](/Users/huydev/Desktop/koko/koko-sdk/src/index.ts:1) export cùng lúc:
Browser APIs.
CDP internals.
Transport.
Timeout/deferred/logger.
Fingerprint filesystem.
Remote profile APIs.
Google-specific helpers.
Crawl helpers.
Dump/fetch CLI abstraction.
Hệ quả:
Autocomplete nhiễu.
Khó xác định API nào stable.
Thay đổi internals trở thành semver-breaking.
Người dùng không biết entry point khuyến nghị.
Nên chia:
koko-sdk
koko-sdk/agent
koko-sdk/profile
koko-sdk/cdp
koko-sdk/driver
koko-sdk/testing
Page.extract() không thật sự generic
Default expression đang tìm #firstHeading và /wiki/ tại [page.ts (line 82)](/Users/huydev/Desktop/koko/koko-sdk/src/browser/page.ts:82).
Một method có tên generic không được chứa mặc định riêng của Wikipedia.
Nên đổi thành một trong hai:
await page.extract({
  schema: ArticleSchema,
  from: "semantic",
});
hoặc chuyển helper hiện tại sang example:
extractWikipediaSummary(page)
page.type() thực chất là fill()
Typing và filling có semantics khác nhau:
fill() thay toàn bộ value.
type() phát sinh chuỗi keyboard event.
Nếu type() chỉ alias fill(), người chuyển từ Playwright sẽ nhận behavior sai. Nên implement typing thật hoặc deprecate method.
page.url() là async
Playwright trả URL đồng bộ từ cached page state. Koko hiện buộc người dùng await page.url().
Đề xuất:
page.url(): string;
await page.currentUrl(): Promise<string>; // chỉ khi cần hỏi driver
Navigation không trả response
goto, reload, goBack, goForward trả void.
Nên trả:
Promise<Response | null>
Điều này quan trọng cho status, headers, redirect chain và lỗi navigation.
Context isolation gây hiểu nhầm
Code đã document trung thực rằng multiple contexts không isolated và last write wins tại [context.ts (line 49)](/Users/huydev/Desktop/koko/koko-sdk/src/browser/context.ts:49).
Đây là vấn đề semantic, không chỉ documentation. Nếu chưa thể thực hiện isolation thật, nên:
Expose capability isolatedContexts: false.
Chặn tạo context thứ hai với identity options xung đột; hoặc
Đổi tên abstraction tạm thời thành BrowserSession.
Khuyến nghị một runtime process cho một identity.
4. Developer Experience
Naming
Naming tốt:
Browser, BrowserContext, Page, Locator.
waitForRequest, waitForResponse, storageState.
semanticTree, markdown, interactiveElements.
Naming cần đổi:
LPClient: “LP” không tự mô tả. Nên dùng KokoAgent, SemanticPage hoặc KokoPageExtensions.
fetch: xung đột mental model với global fetch.
dump: quá chung.
search: không rõ là web search, form search hay site search.
extract: generic nhưng implementation cụ thể.
LocatorOptions.has?: boolean: nếu được dùng như strictness thì phải đổi thành strict; has trong Playwright thường nhận một locator.
Discoverability và autocomplete
TypeScript types tốt, nhưng root exports quá rộng. Nên hướng người dùng tới surface nhỏ:
import { koko } from "koko-sdk";

const browser = await koko.launch();
Advanced API:
import { CDPClient } from "koko-sdk/cdp";
import { profiles } from "koko-sdk/profile";
Fluent API
Locator API có tính fluent tốt. Agent API cũng tương đối dễ dùng:
await page.agent.markdown();
await page.agent.semanticTree();
Không nên duplicate toàn bộ agent methods trực tiếp lên Page. Chọn một canonical form là page.koko.* hoặc page.agent.*.
Error messages
Một số protocol error có method/session/payload, đây là nền tảng tốt. Nhưng lỗi launch, timeout và lifecycle chưa đưa đủ thông tin hành động:
Endpoint.
Driver.
Browser/page state.
URL.
Remaining deadline.
Retryability.
Cause.
Suggested remediation.
5. Driver Architecture
Coupling hiện tại
SDK phụ thuộc trực tiếp Koko Runtime ở ba mức:
Protocol:
Page/Locator/Network → CDPSession → method strings
Extension:
Page.agent → Koko.* CDP domain
Product/runtime:
launchKoko → binary discovery → CLI flags → profiles → runtime process
[launch.ts (line 129)](/Users/huydev/Desktop/koko/koko-sdk/src/browser/launch.ts:129) vừa resolve installation, hydrate profile, dựng argv, spawn process, poll endpoint, connect và cleanup. Đây là coupling rất mạnh.
Kiến trúc Driver đề xuất
Không nên tạo một interface khổng lồ. Nên dùng capability-based interfaces:
interface BrowserDriver {
  readonly name: string;
  capabilities(): Promise<DriverCapabilities>;
  connect(options: ConnectOptions): Promise<DriverBrowser>;
  launch?(options: LaunchOptions): Promise<DriverBrowser>;
}

interface PageDriver {
  navigate(url: string, options?: NavigationOptions): Promise<NavigationResult>;
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  close(): Promise<void>;
}

interface ElementDriver {
  resolve(query: LocatorQuery): Promise<ElementReference[]>;
  click(ref: ElementReference, options?: ActionOptions): Promise<void>;
  fill(ref: ElementReference, value: string): Promise<void>;
}

interface AgentCapability {
  semanticTree(options?: SemanticTreeOptions): Promise<SemanticTree>;
  markdown(options?: MarkdownOptions): Promise<string>;
  forms(): Promise<Form[]>;
}
Luồng:
Portable Browser API
        │
        ▼
Capability-based Driver Contracts
        │
        ├── Koko CDP Driver
        ├── Chrome CDP Driver
        ├── Remote Koko Driver
        └── WebDriver BiDi Driver
Firefox không nên được gọi là “Firefox CDP Driver”. Nếu hỗ trợ Firefox hiện đại, nên đi qua WebDriver BiDi hoặc adapter riêng.
Khả năng mở rộng
Sau khi tách driver:
Chrome support: khả thi cao.
Remote Koko: rất tự nhiên.
Firefox/BiDi: khả thi nhưng cần abstraction đủ cao.
Embedded/in-process Zig driver trong tương lai: có thể triển khai mà không đổi public API.
Testing driver/fake driver: giúp unit test Page mà không cần browser thật.
6. Playwright Compatibility
API nên tương thích
Nên tương thích về tên và behavior cho portable layer:
browser.newContext().
context.newPage().
page.goto().
page.locator().
getByRole, getByText, getByLabel.
locator.click/fill/press/selectOption.
waitForRequest/Response.
route/unroute.
storageState.
screenshot.
page.on("console" | "pageerror" | "request" | "response").
Timeout và AbortSignal.
Compatibility cần là semantic compatibility, không chỉ giống tên.
API không cần clone
Không cần clone:
Playwright test runner.
Browser download manager.
Trace viewer.
Device registry toàn bộ.
Mọi selector engine và edge case.
Exact class hierarchy.
Koko nên ưu tiên runtime nhỏ, semantic extraction, deterministic agent actions và browser profiles.
Khác biệt hiện tại làm migration khó
page.url() async.
Navigation trả void.
type() có behavior của fill().
Locator chaining chưa chắc là descendant scoping giống Playwright.
Locator resolver luôn lọc visibility, có thể làm count() khác.
getByRole() là heuristic DOM, không phải accessibility semantics đầy đủ.
Context không isolated.
Route string chỉ kiểm tra substring hoặc "*" tại [route.ts (line 74)](/Users/huydev/Desktop/koko/koko-sdk/src/browser/route.ts:74), trong khi pattern kiểu "**/*.png" dễ khiến người dùng nghĩ là glob.
Event API công khai chưa đầy đủ.
Migration cost hiện tại:
Script crawl đơn giản: thấp, 2–3/10.
Form automation: trung bình, 4–6/10.
Test suite Playwright lớn: cao, 7–9/10.
7. Koko Exclusive Features
Đây nên là vùng khác biệt chính.
Nên giữ và phát triển
await page.agent.semanticTree();
await page.agent.markdown();
await page.agent.interactiveElements();
await page.agent.structuredData();
await page.agent.forms();
await page.agent.findElement(...);
Lợi thế:
Giảm token cho AI agent.
Không bắt agent đọc raw DOM hàng megabyte.
Tạo reference ổn định hơn CSS selector.
Giảm số round-trip giữa model và browser.
Structured output dễ validate, cache và audit.
Cho phép runtime tối ưu extraction ở native layer.
API mới nên có
const snapshot = await page.agent.snapshot({
  include: ["semantics", "forms", "links"],
  budget: { maxTokens: 8_000 },
});

const result = await page.agent.extract(ProductSchema);

const action = await page.agent.resolveAction({
  intent: "submit checkout form",
});

await page.agent.perform(action, {
  requireConfirmation: ["purchase", "external-message"],
});
Các API hợp lý:
snapshot(): snapshot thống nhất, có generation ID.
extract(schema): structured extraction có validation.
links().
forms().
readability().
changesSince(snapshotId).
resolveAction(intent).
perform(action).
workflow.run().
persona() và browserProfile() nên thuộc identity/profile extension.
reason() và planning() không nên nằm trong low-level browser package. Đây là trách nhiệm của AI orchestration package riêng.
8. AI Agent Readiness
Điểm mạnh
Koko đã có nền móng tốt hơn nhiều browser SDK thông thường:
Semantic tree.
Markdown.
Structured data.
Form detection.
Interactive element discovery.
Backend node actions.
Dialog pre-arming.
Stable-ish node references.
Mức AI readiness hiện tại: 7/10.
Phần còn thiếu
Snapshot generation
NodeHandle chỉ giữ backend node ID, chưa gắn:
Document generation.
Navigation generation.
Session ID.
Realm.
Staleness contract.
Cần:
interface ElementRef {
  backendNodeId: number;
  pageId: string;
  documentGeneration: number;
}
Action trên stale reference phải trả StaleElementError, không retry mù.
Tool contract
Cần API phù hợp cho MCP/tool calling:
browser.tools()
page.agent.toToolSet()
workflow.toMcpServer()
Tool output cần:
JSON schema.
Bounded payload.
Stable error code.
Observability metadata.
Risk classification.
Confirmation policy.
Workflow abstraction
Nên hỗ trợ:
Step.
Preconditions.
Postconditions.
Timeout budget.
Retry policy.
Compensation.
Artifact/output.
Audit log.
Không nên để SDK tự “reason” bằng LLM. SDK nên cung cấp deterministic tools; model orchestration nằm ở package @koko/agent.
9. API Layering
Tôi khuyến nghị ba tầng rõ ràng.
Level 1 – Portable Browser API
Browser
Context
Page
Locator
Request/Response
Events
Storage
Navigation
Input
Mục tiêu: quen thuộc với người dùng Playwright và chạy được trên nhiều driver.
Level 2 – Koko Extensions
page.koko.semanticTree()
page.koko.markdown()
page.koko.forms()
browser.koko.profile()
Mục tiêu: expose capability riêng mà không làm ô nhiễm portable surface.
Level 3 – Agent API
AgentSession
Workflow
ToolSet
Structured extraction
Policy/confirmation
MCP adapters
Mục tiêu: phục vụ AI agent và automation cấp cao.
Ưu điểm:
Semver boundary rõ.
Portable API không bị khóa vào Koko.
Chrome driver dễ triển khai.
AI API có thể phát triển nhanh mà không phá browser primitive.
Documentation dễ phân luồng.
Nhược điểm:
Nhiều package/subpath hơn.
Cần capability negotiation.
Một số user phải hiểu họ đang ở layer nào.
Lợi ích vượt xa chi phí.
10. Error Model
Hiện có:
CDPError
TimeoutError
ProtocolError
NavigationError
TargetClosedError
WebSocketClosedError
Xem [errors.ts (line 1)](/Users/huydev/Desktop/koko/koko-sdk/src/cdp/errors.ts:1).
Đây là khởi đầu tốt nhưng quá CDP-centric.
Error hierarchy đề xuất
KokoError
├── ConfigurationError
├── DriverError
│   ├── DriverConnectionError
│   ├── DriverProtocolError
│   └── UnsupportedCapabilityError
├── BrowserError
│   ├── BrowserClosedError
│   ├── ContextClosedError
│   ├── PageClosedError
│   └── StaleElementError
├── NavigationError
├── NetworkError
├── TimeoutError
├── AbortError
├── LaunchError
└── ValidationError
Mỗi error nên có:
code: string;
cause?: unknown;
retryable: boolean;
operation?: string;
driver?: string;
pageId?: string;
url?: string;
deadline?: number;
details?: Record<string, unknown>;
Retry strategy không nên đặt ngầm trong mọi method. Cần phân biệt:
Protocol retryable.
Navigation retryable.
Action retryable vì stale layout.
Không retry side-effect như submit/payment nếu chưa có idempotency contract.
11. Async Model
SDK dùng Promise, phù hợp TypeScript.
Vấn đề hiện tại
Không có AbortSignal.
Timeout không cancel underlying operation.
Một số event wait có thể để lại listener sau timeout.
Timeout được áp riêng theo từng stage, có thể làm tổng thời gian vượt quá timeout người dùng truyền.
Navigation chưa correlate đầy đủ theo frame/loader.
Có magic delay trong evaluate retry và done waiting.
close() của một số tầng không đợi WebSocket/process kết thúc thật.
Launch dùng async process error handler rồi throw tại [launch.ts (line 198)](/Users/huydev/Desktop/koko/koko-sdk/src/browser/launch.ts:198); lỗi kiểu này có thể thoát khỏi promise launch và trở thành uncaught exception.
Mô hình đề xuất
Mọi async operation quan trọng nên nhận:
interface OperationOptions {
  timeout?: number;
  signal?: AbortSignal;
}
Nội bộ tạo một deadline chung:
const deadline = Deadline.from(options);
await stepA({ deadline });
await stepB({ deadline });
Không reset timeout sau mỗi step.
Lifecycle nên có state machine:
created → connecting → ready → closing → closed
                         └────→ failed
Close phải:
Idempotent.
Awaitable.
Reject pending operations bằng typed closed error.
Unsubscribe listeners.
Detach session.
Close transport.
Đợi child process thoát.
Flush/cleanup profile theo một terminal ownership path.
12. Testing
Hiện trạng
36 test pass cho thấy project có baseline sạch. Locator resolver có test JSDOM khá có giá trị.
Nhưng coverage theo architectural risk còn thấp.
Test pyramid đề xuất
Unit
Deadline/cancellation.
Event unsubscribe after timeout.
Error mapping.
Locator AST/compiler.
Route lifecycle.
Request/response correlation.
Capability negotiation.
State transitions.
Contract tests
Một bộ test chạy cho mọi driver:
driverContract("koko", kokoDriver);
driverContract("chrome", chromeDriver);
Kiểm tra:
Navigation.
Evaluate.
Locator.
Input.
Events.
Routing.
Storage.
Close/cancel.
Integration
Koko runtime fixture local.
Chrome local.
WebSocket disconnect.
Browser crash.
Navigation during action.
Close while command pending.
Profile hydrate/flush failure.
Public API stability
API Extractor hoặc .d.ts snapshot.
Package import smoke test.
Compile examples.
Test exports subpaths.
Semver diff trong CI.
13. Documentation
README hiện khá tốt:
Quick start rõ.
Có feature mapping.
Có caveat context isolation.
Có examples.
Có API overview.
Nhưng để production release cần thêm:
docs/
├── quick-start.md
├── concepts/
│   ├── browser-context-page.md
│   ├── locator-semantics.md
│   ├── lifecycle.md
│   └── timeouts-cancellation.md
├── drivers/
│   ├── capabilities.md
│   ├── koko.md
│   └── chrome.md
├── agent/
│   ├── semantic-tree.md
│   ├── element-references.md
│   └── mcp.md
├── migration/
│   └── playwright.md
├── api/
└── architecture.md
Cần thêm:
Compatibility matrix.
Known semantic differences với Playwright.
Changelog.
Deprecation policy.
API reference generated từ TSDoc.
Recipes cho auth, crawling, forms, routing, agent.
Security model cho remote profiles và AI actions.
14. Production Readiness
Hạng mục	Điểm hiện tại
API stability	5.5/10
Maintainability	6.5/10
Developer experience	7.0/10
Architecture	6.0/10
Modularity	5.5/10
Testability	6.0/10
Documentation	6.5/10
Future scalability	6.0/10
AI readiness	7.0/10
Browser compatibility	4.5/10
Tổng thể	6.4/10

SDK dùng được cho:
Internal automation.
Early adopters.
Koko-specific crawling/extraction.
AI agent prototype.
Controlled production workloads có wrapper và monitoring.
Chưa nên tuyên bố:
Playwright-compatible hoàn chỉnh.
Isolated contexts.
Multi-browser SDK.
Production-grade cancellation/lifecycle.
Stable public API 1.0.
15. Roadmap đề xuất
Phase 1 – API and lifecycle correctness
Mục tiêu: sửa invariant trước khi mở rộng API.
Phạm vi:
Route auto-continue hoặc typed failure khi handler không xử lý.
unroute() phải disable Fetch và unsubscribe.
Process spawn error phải reject promise đúng cách.
Listener cleanup sau timeout.
Close idempotent.
Navigation deadline/frame/loader correlation.
Stale node generation.
Rủi ro: thay đổi behavior hiện tại.
Kết quả: core deterministic và không leak lifecycle.
Phase 2 – Public API stabilization
Mục tiêu: định nghĩa API portable 1.0 candidate.
Phạm vi:
Navigation trả Response | null.
url() đồng bộ.
Tách fill() và type().
Chuẩn hóa timeout/options.
Public page events.
Loại Wikipedia/Google specifics khỏi core.
Tạo API snapshot.
Rủi ro: breaking change.
Kết quả: surface nhỏ, nhất quán, có semver contract.
Phase 3 – Driver Interface
Mục tiêu: tách object model khỏi CDP.
Phạm vi:
Capability model.
Browser/Page/Element driver contracts.
KokoCdpDriver.
Fake driver cho unit test.
Không expose CDPSession trong high-level classes.
Rủi ro: over-abstraction.
Kết quả: Koko trở thành một backend thay vì toàn bộ kiến trúc.
Phase 4 – Chrome Driver
Mục tiêu: chứng minh abstraction portable.
Phạm vi:
Connect Chrome qua CDP.
Chạy portable contract suite.
Capability matrix.
Đánh dấu Koko-only features rõ ràng.
Rủi ro: CDP differences, locator semantics.
Kết quả: core API chạy được trên Koko và Chrome.
Phase 5 – Koko Extensions
Mục tiêu: productize lợi thế riêng.
Phạm vi:
page.koko.
Semantic snapshot generation.
Stable element references.
Schema extraction.
Changes/diff API.
Profile capability.
Rủi ro: extension surface phát triển quá rộng.
Kết quả: khác biệt cạnh tranh rõ mà portable API vẫn sạch.
Phase 6 – AI Agent Layer
Mục tiêu: hỗ trợ agent theo cách deterministic và audit được.
Phạm vi:
@koko/agent.
Tool schemas.
MCP adapter.
Workflow runner.
Confirmation policy.
Action risk metadata.
Token-budgeted snapshots.
Rủi ro: trộn orchestration LLM vào browser core.
Kết quả: AI layer độc lập, có thể dùng nhiều model/framework.
Phase 7 – Testing and documentation
Mục tiêu: biến behavior thành contract.
Phạm vi:
Driver contract tests.
Koko/Chrome integration.
Cancellation/crash tests.
API docs.
Migration guide.
CI matrix.
Package smoke tests.
Rủi ro: integration tests không ổn định.
Kết quả: release có bằng chứng tương thích và regression protection.
Phase 8 – Production release
Mục tiêu: SDK 1.0.
Phạm vi:
Semver/deprecation policy.
Telemetry hooks.
Security review.
Performance benchmark.
Compatibility matrix.
Release automation.
Support policy.
Rủi ro: tuyên bố stability quá sớm.
Kết quả: SDK 1.0 có portable core, Koko extensions và production lifecycle.
16. Final Verdict
Điểm mạnh lớn nhất
Koko không chỉ expose raw DOM automation. Semantic tree, markdown, structured data, forms và backend-node actions tạo một nền tảng thực sự phù hợp với AI agent.
Đây là hướng khác biệt đáng theo đuổi hơn việc clone Playwright toàn bộ.
Điểm yếu lớn nhất
Protocol và runtime details đang xuyên qua object model. Vì chưa có Driver Interface, mọi thay đổi backend có thể ảnh hưởng Browser, Page, Locator, navigation, events và profile APIs cùng lúc.
Có nên hướng theo Playwright?
Có, nhưng chỉ ở portable developer-facing semantics.
Nên tương thích:
Mental model.
Naming.
Locator behavior.
Navigation response.
Events.
Timeout/cancellation.
Storage/routing.
Không nên clone:
Toàn bộ test framework.
Mọi browser-specific edge case.
Product architecture.
Những phần làm Koko mất lợi thế semantic/agent.
Có nên hỗ trợ Chrome Driver?
Có.
Chrome Driver là bài kiểm tra kiến trúc quan trọng hơn là một feature marketing. Nếu portable layer chạy được cả Koko và Chrome, Driver boundary mới thực sự đúng.
Có nên tách Driver Interface?
Có, đây là ưu tiên kiến trúc số một sau lifecycle correctness.
Nhưng phải dùng capability-based interfaces, không tạo một Driver khổng lồ chứa hàng trăm method.
Có nên xây AI Layer riêng?
Có.
Tách rõ:
Browser primitive.
Koko semantic extensions.
AI workflow/orchestration.
Browser core phải deterministic. Reasoning, planning, MCP và workflow policy nên nằm ở package riêng.
Khả năng trở thành browser automation SDK thế hệ mới
Khả thi cao, nếu Koko không dừng ở “Playwright API trên CDP”.
Công thức phù hợp là:
Playwright-grade portable ergonomics
+
Koko-native semantic runtime
+
Stable agent references
+
Capability-based multi-driver architecture
+
Separate AI workflow layer
Nếu thực hiện đúng roadmap, Koko có thể cạnh tranh ở phân khúc browser runtime cho crawling, structured extraction và AI agents—một vùng mà các automation SDK truyền thống chưa tối ưu từ kiến trúc gốc.