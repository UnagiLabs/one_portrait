import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertNormalDevEnvironment } from "./dev-mode.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const nextBin = path.join(webRoot, "node_modules", ".bin", "next");

export async function startSmokeDev({
  cwd = webRoot,
  env = process.env,
  spawnImpl = spawn,
  nextDevBin = path.join(cwd, "node_modules", ".bin", "next"),
}) {
  cleanupStaleNextDevLock(path.join(cwd, ".next", "dev", "lock"));
  assertNormalDevEnvironment({ cwd, env });

  const child = spawnImpl(nextDevBin, ["dev"], {
    cwd,
    env: {
      ...env,
      OP_LOCAL_GENERATOR_RUNTIME: env.OP_LOCAL_GENERATOR_RUNTIME ?? "1",
    },
    stdio: "inherit",
  });

  return { child };
}

if (isExecutedDirectly()) {
  try {
    const { child } = await startSmokeDev({
      cwd: webRoot,
      env: process.env,
      nextDevBin: nextBin,
    });
    forwardChildExit(child);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return path.resolve(entry) === __filename;
}

function forwardChildExit(child) {
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function cleanupStaleNextDevLock(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const pid = Number(payload?.pid);

    if (Number.isInteger(pid) && pid > 0 && isProcessAlive(pid)) {
      return;
    }
  } catch {
    // If the lock file is malformed, removing it is the safest recovery.
  }

  fs.rmSync(filePath, { force: true });
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}
