#!/usr/bin/env node

import { Browser } from "../dist/index.js";

const input = process.argv[2] ?? "https://example.com";

let url;
try {
  url = new URL(input);
} catch {
  console.error(`URL không hợp lệ: ${input}`);
  console.error("Cách dùng: node scripts/access-web.mjs <url>");
  process.exit(1);
}

let launched;

try {
  launched = await Browser.launch({
    install: process.env.KOKO_INSTALL,
    profile: process.env.KOKO_PROFILE,
    logLevel: "error",
  });

  const page = await launched.browser.newPage();
  await page.goto(url.href, {
    waitUntil: "done",
    timeout: 30_000,
  });

  const markdown = await page.markdown();

  console.log(`Tiêu đề: ${await page.title()}`);
  console.log(`URL cuối: ${await page.url()}`);
  console.log("\nNội dung:");
  console.log(markdown.slice(0, 2_000));

  if (markdown.length > 2_000) {
    console.log(`\n... còn ${markdown.length - 2_000} ký tự`);
  }
} catch (error) {
  console.error("Không thể truy cập trang web:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await launched?.close().catch(() => undefined);
}
