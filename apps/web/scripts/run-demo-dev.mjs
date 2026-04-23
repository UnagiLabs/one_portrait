import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const demoRegistryObjectId =
  "0x00000000000000000000000000000000000000000000000000000000000000d1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const lockPath = path.join(webRoot, ".next", "dev", "lock");
const nextBin = path.join(webRoot, "node_modules", ".bin", "next");

export function startDemoDev({
  cwd = webRoot,
  env = process.env,
  nextDevBin = path.join(cwd, "node_modules", ".bin", "next"),
  spawnImpl = spawn,
}) {
  return spawnImpl(nextDevBin, ["dev"], {
    cwd,
    env: {
      ...env,
      NEXT_PUBLIC_DEMO_MODE: "1",
      NEXT_PUBLIC_REGISTRY_OBJECT_ID: demoRegistryObjectId,
      NEXT_PUBLIC_SUI_NETWORK: "testnet",
      OP_LOCAL_GENERATOR_RUNTIME: env.OP_LOCAL_GENERATOR_RUNTIME ?? "1",
      OP_GENERATOR_RUNTIME_STATE_PATH:
        env.OP_GENERATOR_RUNTIME_STATE_PATH ??
        path.join(cwd, ".cache", "generator-runtime.json"),
    },
    stdio: "inherit",
  });
}

if (isExecutedDirectly()) {
  cleanupStaleNextDevLock(lockPath);

  const child = startDemoDev({
    cwd: webRoot,
    env: process.env,
    nextDevBin: nextBin,
    spawnImpl: spawn,
  });

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
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EPERM"
    );
  }
}

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return path.resolve(entry) === __filename;
}
