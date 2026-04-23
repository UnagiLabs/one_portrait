import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..", "..");
const generatorRoot = path.join(repoRoot, "generator");
const generatorTsxBin = path.join(generatorRoot, "node_modules", ".bin", "tsx");

export function loadWebScriptEnv({ env = process.env } = {}) {
  return {
    ...readEnvFile(path.join(webRoot, ".env")),
    ...readEnvFile(path.join(webRoot, ".env.local")),
    ...env,
  };
}

export function startLocalGenerator({
  env = process.env,
  spawnImpl = spawn,
  generatorBin = generatorTsxBin,
  cwd = generatorRoot,
} = {}) {
  const mergedEnv = loadWebScriptEnv({ env });

  const child = spawnImpl(generatorBin, ["./src/server.ts"], {
    cwd,
    env: {
      ...env,
      ...mergedEnv,
      PORT: env.OP_LOCAL_GENERATOR_PORT ?? mergedEnv.PORT ?? "8080",
      SUI_NETWORK: mergedEnv.SUI_NETWORK ?? mergedEnv.NEXT_PUBLIC_SUI_NETWORK,
      PACKAGE_ID: mergedEnv.PACKAGE_ID ?? mergedEnv.NEXT_PUBLIC_PACKAGE_ID,
      WALRUS_PUBLISHER:
        mergedEnv.WALRUS_PUBLISHER ?? mergedEnv.NEXT_PUBLIC_WALRUS_PUBLISHER,
      WALRUS_AGGREGATOR:
        mergedEnv.WALRUS_AGGREGATOR ?? mergedEnv.NEXT_PUBLIC_WALRUS_AGGREGATOR,
    },
    stdio: "inherit",
  });

  return { child };
}

if (isExecutedDirectly()) {
  const { child } = startLocalGenerator({
    env: process.env,
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

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const entries = {};

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    entries[key] = stripQuotes(rawValue);
  }

  return entries;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return path.resolve(entry) === __filename;
}
