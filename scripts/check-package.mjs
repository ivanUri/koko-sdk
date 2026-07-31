import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const workDir = await mkdtemp(join(tmpdir(), "velora-sdk-package-"));

try {
  await run("npm", ["pack", "--pack-destination", workDir], process.cwd());
  const tarball = (await import("node:fs/promises"))
    .readdir(workDir)
    .then((files) => join(workDir, files.find((file) => file.endsWith(".tgz"))));
  const packageFile = await tarball;
  await run("npm", ["init", "-y"], workDir);
  await run("npm", ["install", packageFile], workDir);
  await run("node", [
    "--input-type=module",
    "-e",
    "await import('velora-sdk'); await import('velora-sdk/driver'); await import('velora-sdk/agent'); await import('velora-sdk/workflow');",
  ], workDir);
} finally {
  await rm(workDir, { recursive: true, force: true });
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        npm_config_cache: join(workDir, ".npm-cache"),
      },
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}
