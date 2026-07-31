import { createServer } from "node:http";
import { ChromeCdpDriver } from "../dist/driver.js";
import { createAgentSession } from "../dist/agent.js";
import { spawnChrome } from "./lib/chrome-cdp.mjs";

const port = Number(process.env.CHROME_CDP_PORT || 9333);
const fixture = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
    <title>Velora Chrome Driver Smoke</title>
    <main>
      <h1>Chrome driver connected</h1>
      <input id="email" />
      <button id="counter" onclick="this.textContent = 'Clicked'">Click me</button>
      <div style="height: 1200px"></div>
      <button class="bottom">Bottom</button>
      <iframe name="checkout" srcdoc="<input id='card' />"></iframe>
    </main>`);
});

await new Promise((resolve, reject) => {
  fixture.once("error", reject);
  fixture.listen(0, "127.0.0.1", resolve);
});

const fixtureAddress = fixture.address();
const fixturePort = typeof fixtureAddress === "object" && fixtureAddress
  ? fixtureAddress.port
  : 0;
const chrome = await spawnChrome({
  port,
  profileDir: `/tmp/velora-sdk-chrome-smoke-${port}`,
  url: `http://127.0.0.1:${fixturePort}`,
});
console.log(`[chrome-smoke] connected endpoint ${chrome.endpoint}`);
const driver = new ChromeCdpDriver();
const browser = await driver.connect(chrome.endpoint);

try {
  console.log("[chrome-smoke] create page");
  const page = await browser.newPage();
  console.log("[chrome-smoke] navigate fixture");
  const navigation = await page.goto(`http://127.0.0.1:${fixturePort}`, {
    waitUntil: "load",
    timeout: 10_000,
  });
  const title = await page.title();
  const heading = await page.getByRole("heading", { name: "Chrome driver connected" }).count();
  const agent = createAgentSession(page);
  console.log("[chrome-smoke] agent fill");
  await agent.perform({ type: "fill", target: "#email", input: "agent@example.com", timeout: 10_000 });
  console.log("[chrome-smoke] agent click");
  await agent.perform({ type: "click", target: "#counter", timeout: 10_000 });
  console.log("[chrome-smoke] read button text");
  const buttonText = await page.locator("#counter").textContent({ timeout: 10_000 });
  console.log("[chrome-smoke] read input value");
  const email = await page.locator("#email").inputValue({ timeout: 10_000 });
  console.log("[chrome-smoke] common interactions");
  await page.scrollBy(0, 500);
  await page.mouse.wheel(0, 100);
  await page.locator(".bottom").scrollIntoViewIfNeeded();
  const bottomBox = await page.locator(".bottom").boundingBox();
  const buttonTexts = await page.locator("button").allTextContents();
  const frameCount = (await page.frames()).length;
  await page.frameLocator("iframe[name=checkout]").locator("#card").fill("4242");
  const checkoutFrame = await page.frame({ name: "checkout" });
  const card = await checkoutFrame?.evaluate("document.querySelector('#card')?.value");
  console.log("[chrome-smoke] emit result");

  console.log(JSON.stringify({
    endpoint: chrome.endpoint,
    chromePid: chrome.proc.pid,
    driver: driver.name,
    capabilities: driver.capabilities(),
    title,
    headingCount: heading,
    buttonText,
    email,
    bottomBox,
    buttonTexts,
    frameCount,
    frameCardText: card,
    currentUrl: page.currentUrl(),
    navigation: {
      url: navigation.url,
      status: navigation.response?.status() ?? null,
      frameId: navigation.frameId,
      loaderId: navigation.loaderId,
    },
  }, null, 2));
} catch (error) {
  console.error("[chrome-smoke] failed", error);
  throw error;
} finally {
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  fixture.closeAllConnections?.();
  await new Promise((resolve) => fixture.close(resolve));
}
