#!/usr/bin/env node
import { fetch } from "../fetch.js";
const LOG_LEVELS = ["debug", "info", "warn", "error", "fatal"];
function parseLogLevel(value) {
    if (LOG_LEVELS.includes(value))
        return value;
    throw new Error(`Unknown log level: ${value} (expected ${LOG_LEVELS.join(", ")})`);
}
function parseArgs(argv) {
    let url;
    let format = "html";
    let launch = false;
    let output;
    let endpoint = process.env.KOKO_CDP;
    let waitUntil = "domcontentloaded";
    let timeout = 30_000;
    let logger = false;
    let injectScriptFile;
    let profile;
    let userDataDir;
    let fingerprintFolder;
    let profileBundle;
    let fingerprint;
    let httpProxy;
    let dataRoot;
    let logLevel;
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            if (i + 1 >= argv.length)
                throw new Error(`Missing value for ${arg}`);
            i += 1;
            return argv[i];
        };
        switch (arg) {
            case "--endpoint":
                endpoint = next();
                break;
            case "-o":
            case "--output":
                output = next();
                break;
            case "--wait-until":
                waitUntil = next();
                break;
            case "--timeout":
                timeout = Number(next());
                break;
            case "--logger":
                logger = true;
                break;
            case "--inject-script-file":
                injectScriptFile = next();
                break;
            case "--launch":
                launch = true;
                break;
            case "--profile":
            case "--browser-profile":
                profile = next();
                break;
            case "--user-data-dir":
                userDataDir = next();
                break;
            case "--fingerprint-folder":
                fingerprintFolder = next();
                break;
            case "--profile-bundle":
                profileBundle = next();
                break;
            case "--fingerprint":
                fingerprint = next();
                break;
            case "--http-proxy":
                httpProxy = next();
                break;
            case "--data-root":
            case "--koko-root":
                dataRoot = next();
                break;
            case "--log-level":
                logLevel = parseLogLevel(next());
                break;
            case "--format": {
                const fmt = next();
                if (fmt === "html" || fmt === "md" || fmt === "markdown" || fmt === "json") {
                    format = fmt === "markdown" ? "md" : fmt;
                }
                else {
                    throw new Error(`Unknown format: ${fmt}`);
                }
                break;
            }
            case "--md":
            case "--markdown":
                format = "md";
                break;
            case "--html":
                format = "html";
                break;
            case "--json":
            case "--extract":
                format = "json";
                break;
            case "--help":
                usage(0);
                break;
            default:
                if (arg.startsWith("--"))
                    throw new Error(`Unknown option: ${arg}`);
                url = arg;
        }
    }
    if (!url)
        usage(1);
    return {
        url, format, launch, output, endpoint, waitUntil, timeout, logger,
        profile, userDataDir, fingerprintFolder, profileBundle, fingerprint,
        httpProxy, dataRoot, logLevel, injectScriptFile,
    };
}
function usage(exitCode) {
    console.error(`Usage: koko-fetch <url> [options]

  koko-fetch https://example.com --launch -o page.html
  koko-fetch https://example.com --launch --md -o page.md
  koko-fetch https://example.com --launch --profile huynew
  koko-fetch https://example.com --launch --fingerprint chrome-macos-sonoma
  koko-fetch https://example.com --launch --profile-bundle ~/my.koko-profile
  koko-fetch https://example.com --launch --http-proxy http://user:pass@host:8080
  koko-fetch https://example.com --launch --inject-script-file ./probe.js
`);
    process.exit(exitCode);
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const result = await fetch(args.url, {
        format: args.format,
        launch: args.launch,
        endpoint: args.endpoint,
        waitUntil: args.waitUntil,
        timeout: args.timeout,
        logger: args.logger,
        injectScriptFile: args.injectScriptFile,
        output: args.output,
        profile: args.profile,
        userDataDir: args.userDataDir,
        fingerprintFolder: args.fingerprintFolder,
        profileBundle: args.profileBundle,
        fingerprint: args.fingerprint,
        httpProxy: args.httpProxy,
        dataRoot: args.dataRoot,
        logLevel: args.logLevel,
    });
    if (!args.output)
        process.stdout.write(result.body);
}
main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
//# sourceMappingURL=fetch.js.map