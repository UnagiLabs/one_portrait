import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");

const DEFAULT_FALLBACK_URL = "http://127.0.0.1:8080";
const DEFAULT_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const RUNTIME_STATE_VERSION = 1;

export function resolveGeneratorRuntimeStatePath({
  env = process.env,
  appRootPath = webRoot,
} = {}) {
  const explicitStatePath = normalizeStatePath(
    env.OP_GENERATOR_RUNTIME_STATE_PATH,
    appRootPath,
  );

  return (
    explicitStatePath ??
    path.join(appRootPath, ".cache", "generator-runtime.json")
  );
}

export function readGeneratorRuntimeState({
  appRootPath = webRoot,
  env = process.env,
  existsSync = fs.existsSync,
  isProcessAlive = defaultIsProcessAlive,
  now = Date.now(),
  readFileSync = fs.readFileSync,
  stateMaxAgeMs = DEFAULT_STATE_MAX_AGE_MS,
} = {}) {
  const statePath = resolveGeneratorRuntimeStatePath({ appRootPath, env });
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    const normalized = normalizeRuntimeState(parsed);
    if (normalized === null) {
      return null;
    }

    const updatedAtMs = Date.parse(normalized.updatedAt);
    if (!Number.isFinite(updatedAtMs)) {
      return null;
    }

    if (isProcessAlive(normalized.pid)) {
      return normalized;
    }

    if (now - updatedAtMs > stateMaxAgeMs) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

export function resolveScriptGeneratorRuntime({
  appRootPath = webRoot,
  env = process.env,
  existsSync,
  isProcessAlive,
  now,
  readFileSync,
  stateMaxAgeMs,
} = {}) {
  const overrideUrl = normalizeUrl(env.OP_GENERATOR_RUNTIME_URL_OVERRIDE);
  if (overrideUrl !== null) {
    return {
      source: "override",
      status: "ok",
      url: overrideUrl,
    };
  }

  const runtimeState = readGeneratorRuntimeState({
    appRootPath,
    env,
    existsSync,
    isProcessAlive,
    now,
    readFileSync,
    stateMaxAgeMs,
  });
  if (runtimeState !== null) {
    return {
      source: "runtime_state",
      status: "ok",
      url: runtimeState.url,
    };
  }

  const generatorBaseUrl = normalizeUrl(env.OP_GENERATOR_BASE_URL);
  const dispatchUrl = normalizeUrl(env.OP_FINALIZE_DISPATCH_URL);
  if (
    generatorBaseUrl !== null &&
    dispatchUrl !== null &&
    generatorBaseUrl !== dispatchUrl
  ) {
    return {
      message:
        "`OP_GENERATOR_BASE_URL` and `OP_FINALIZE_DISPATCH_URL` must match.",
      source: "none",
      status: "misconfigured",
      url: null,
    };
  }

  if (generatorBaseUrl ?? dispatchUrl) {
    return {
      source: "legacy_env",
      status: "ok",
      url: generatorBaseUrl ?? dispatchUrl,
    };
  }

  return {
    source: "fallback",
    status: "ok",
    url: DEFAULT_FALLBACK_URL,
  };
}

export function writeGeneratorRuntimeState({
  appRootPath = webRoot,
  env = process.env,
  mkdirSync = fs.mkdirSync,
  pid = process.pid,
  rmSync = fs.rmSync,
  updatedAt = new Date().toISOString(),
  url,
  mode,
  writeFileSync = fs.writeFileSync,
} = {}) {
  const normalizedUrl = normalizeUrl(url);
  if (normalizedUrl === null || (mode !== "named" && mode !== "quick")) {
    throw new Error("generator runtime state requires a valid mode and URL");
  }

  const statePath = resolveGeneratorRuntimeStatePath({ appRootPath, env });
  mkdirSync(path.dirname(statePath), { recursive: true });
  rmSync(statePath, { force: true });
  writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        mode,
        pid,
        updatedAt,
        url: normalizedUrl,
        version: RUNTIME_STATE_VERSION,
      },
      null,
      2,
    )}\n`,
  );

  return statePath;
}

export function removeGeneratorRuntimeState({
  appRootPath = webRoot,
  env = process.env,
  rmSync = fs.rmSync,
} = {}) {
  rmSync(resolveGeneratorRuntimeStatePath({ appRootPath, env }), {
    force: true,
  });
}

function normalizeRuntimeState(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const mode = input.mode;
  const pid = input.pid;
  const updatedAt = input.updatedAt;
  const url = normalizeUrl(typeof input.url === "string" ? input.url : "");
  const version = input.version;

  if (
    version !== RUNTIME_STATE_VERSION ||
    (mode !== "named" && mode !== "quick") ||
    typeof pid !== "number" ||
    !Number.isInteger(pid) ||
    pid <= 0 ||
    typeof updatedAt !== "string" ||
    url === null
  ) {
    return null;
  }

  return {
    mode,
    pid,
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

function normalizeStatePath(value, appRootPath) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return null;
  }

  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(appRootPath, normalized);
}

function defaultIsProcessAlive(pid) {
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
