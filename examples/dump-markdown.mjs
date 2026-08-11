#!/usr/bin/env node
// One-shot `koko fetch` dump — the CLI path, no CDP session.
//
//   node examples/dump-markdown.mjs https://example.com
//   node examples/dump-markdown.mjs https://example.com --format html -o page.html
//   KOKO_PROFILE=my-session node examples/dump-markdown.mjs https://example.com
import { dump } from "../dist/index.js";

function parseArgs(argv) {
  const out = {
    url: null,
    format: "markdown",
    strip: [],
    output: undefined,
    waitSelector: undefined,
    profile: process.env.KOKO_PROFILE,
    install: process.env.KOKO_INSTALL,
    dataRoot: process.env.KOKO_ROOT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return argv[i];
    };
    if (arg === "--format") out.format = next();
    else if (arg === "--strip") out.strip = next().split(",");
    else if (arg === "-o" || arg === "--output") out.output = next();
    else if (arg === "--wait-selector") out.waitSelector = next();
    else if (arg === "--profile") out.profile = next();
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else out.url = arg;
  }
  if (!out.url) {
    console.error("Usage: node examples/dump-markdown.mjs <url> [--format markdown|html|semantic_tree|semantic_tree_text]");
    process.exit(1);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const result = await dump(args.url, {
  format: args.format,
  strip: args.strip.length ? args.strip : undefined,
  output: args.output,
  waitUntil: "done",
  waitSelector: args.waitSelector,
  waitMs: 15_000,
  terminateMs: 30_000,
  profile: args.profile,
  install: args.install,
  dataRoot: args.dataRoot,
  logLevel: "error",
});

// A non-zero exit can still carry a complete document: the engine may crash
// during teardown after the serializer has already written it.
if (result.exitCode !== 0) {
  console.error(`[warn] koko exited ${result.exitCode}${result.signal ? ` (${result.signal})` : ""} after dumping`);
}
if (args.output) console.log(`wrote ${result.body.length} bytes to ${args.output}`);
else process.stdout.write(result.body);
