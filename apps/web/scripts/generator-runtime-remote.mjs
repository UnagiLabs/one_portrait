import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");

const GENERATOR_RUNTIME_KV_BINDING = "OP_GENERATOR_RUNTIME_KV";
const GENERATOR_RUNTIME_KV_KEY = "generator-runtime/current";
const RUNTIME_STATE_VERSION = 1;

export async function readRemoteGeneratorRuntime({
  cwd = webRoot,
  env = process.env,
  logger = console,
  runCommand = defaultRunCommand,
} = {}) {
  try {
    const { stdout } = await runWranglerKvCommand({
      args: [
        "key",
        "get",
        GENERATOR_RUNTIME_KV_KEY,
        "--binding",
        GENERATOR_RUNTIME_KV_BINDING,
        "--remote",
        "--text",
      ],
      cwd,
      env,
      runCommand,
    });
    const payload = typeof stdout === "string" ? stdout.trim() : "";
    if (!payload) {
      return null;
    }

    const normalized = normalizeRuntimeState(JSON.parse(payload));
    if (normalized !== null) {
      return normalized;
    }

    logger?.warn?.("[generator-runtime][remote-kv][invalid-payload]");
    return null;
  } catch (error) {
    logger?.warn?.(
      `[generator-runtime][remote-kv][read-failed] message=${formatError(error)}`,
    );
    return null;
  }
}

export async function writeRemoteGeneratorRuntime({
  cwd = webRoot,
  env = process.env,
  logger = console,
  mode,
  runCommand = defaultRunCommand,
  updatedAt = new Date().toISOString(),
  url,
} = {}) {
  const normalizedUrl = normalizeUrl(url);
  if (normalizedUrl === null || (mode !== "named" && mode !== "quick")) {
    throw new Error("generator runtime state requires a valid mode and URL");
  }

  try {
    await runWranglerKvCommand({
      args: [
        "key",
        "put",
        GENERATOR_RUNTIME_KV_KEY,
        JSON.stringify({
          mode,
          updatedAt,
          url: normalizedUrl,
          version: RUNTIME_STATE_VERSION,
        }),
        "--binding",
        GENERATOR_RUNTIME_KV_BINDING,
        "--remote",
      ],
      cwd,
      env,
      runCommand,
    });
    logger?.info?.(
      `[generator-runtime][remote-kv][written] url=${normalizedUrl}`,
    );
    return {
      marker: "[generator-runtime][remote-kv][written]",
      ok: true,
    };
  } catch (error) {
    logger?.warn?.(
      `[generator-runtime][remote-kv][write-failed] message=${formatError(error)}`,
    );
    return {
      marker: "[generator-runtime][remote-kv][write-failed]",
      ok: false,
    };
  }
}

async function runWranglerKvCommand({ args, cwd, env, runCommand }) {
  return runCommand("corepack", ["pnpm", "exec", "wrangler", "kv", ...args], {
    cwd,
    env,
  });
}

async function defaultRunCommand(command, args, options = {}) {
  const { stdout, stderr } = await execFile(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });

  return {
    stderr: stderr ?? "",
    stdout: stdout ?? "",
  };
}

function normalizeRuntimeState(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const mode = input.mode;
  const updatedAt = input.updatedAt;
  const url = normalizeUrl(typeof input.url === "string" ? input.url : "");
  const version = input.version;

  if (
    version !== RUNTIME_STATE_VERSION ||
    (mode !== "named" && mode !== "quick") ||
    typeof updatedAt !== "string" ||
    url === null
  ) {
    return null;
  }

  return {
    mode,
    updatedAt,
    url,
    version,
  };
}

function normalizeUrl(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (!parsed.protocol || !parsed.hostname) {
      return null;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
