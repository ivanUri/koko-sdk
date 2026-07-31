#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Browser } from "../dist/index.js";
import { spawnChrome } from "../scripts/lib/chrome-cdp.mjs";

const url = process.argv[2] ?? "https://example.com";
const output = resolve(process.argv[3] ?? "exports/chrome-page.md");
const port = Number(process.env.CHROME_CDP_PORT || 9334);
const chrome = await spawnChrome({
  port,
  profileDir: `/tmp/velora-sdk-chrome-markdown-${port}`,
  url: "about:blank",
});
const browser = await Browser.connect(chrome.endpoint);

try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  const markdown = await page.evaluate(`(() => {
    const escapeText = (value) => value
      .replace(/\\\\/g, "\\\\\\\\")
      .replace(/([*_~])/g, "\\\\$1")
      .replace(/[ \\t]+/g, " ");
    const render = (node, depth = 0) => {
      if (node.nodeType === Node.TEXT_NODE) return escapeText(node.nodeValue || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const el = node;
      const tag = el.tagName.toLowerCase();
      if (["script", "style", "noscript", "template", "svg"].includes(tag)) return "";
      const children = () => [...el.childNodes].map((child) => render(child, depth)).join("");
      if (/^h[1-6]$/.test(tag)) return "\\n\\n" + "#".repeat(Number(tag[1])) + " " + children().trim() + "\\n\\n";
      if (tag === "p") return "\\n\\n" + children().trim() + "\\n\\n";
      if (tag === "br") return "  \\n";
      if (tag === "strong" || tag === "b") return "**" + children().trim() + "**";
      if (tag === "em" || tag === "i") return "*" + children().trim() + "*";
      if (tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") return "\`" + children().trim() + "\`";
      if (tag === "pre") return "\\n\\n\`\`\`\\n" + (el.textContent || "").trim() + "\\n\`\`\`\\n\\n";
      if (tag === "a") {
        const text = children().trim();
        const href = el.href;
        return href && text ? "[" + text + "](" + href + ")" : text;
      }
      if (tag === "img") {
        const src = el.src;
        return src ? "![" + escapeText(el.alt || "") + "](" + src + ")" : "";
      }
      if (tag === "blockquote") {
        return "\\n\\n" + children().trim().split("\\n").map((line) => "> " + line).join("\\n") + "\\n\\n";
      }
      if (tag === "li") {
        const ordered = el.parentElement?.tagName.toLowerCase() === "ol";
        const index = ordered ? [...el.parentElement.children].indexOf(el) + 1 + ". " : "- ";
        return "\\n" + "  ".repeat(depth) + index + [...el.childNodes].map((child) => render(child, depth + 1)).join("").trim();
      }
      if (tag === "ul" || tag === "ol") return "\\n" + [...el.childNodes].map((child) => render(child, depth)).join("") + "\\n";
      if (tag === "hr") return "\\n\\n---\\n\\n";
      return children();
    };
    const title = document.title.trim();
    const body = render(document.querySelector("main, article") || document.body)
      .replace(/\\n{3,}/g, "\\n\\n")
      .trim();
    return (title ? "---\\ntitle: " + JSON.stringify(title) + "\\nsource: " + JSON.stringify(location.href) + "\\n---\\n\\n" : "") + body + "\\n";
  })()`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, markdown, "utf8");
  console.log(JSON.stringify({
    url: page.currentUrl(),
    title: await page.title(),
    output,
    bytes: Buffer.byteLength(markdown),
    lines: markdown.split("\n").length,
  }, null, 2));
} finally {
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000)),
  ]);
}
