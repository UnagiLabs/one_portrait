import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_FALLBACK_URL = "http://127.0.0.1:8080";
const DEFAULT_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const RUNTIME_STATE_VERSION = 1;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultAppRootPath = path.resolve(__dirname, "..", "..");

type EnvSource = Readonly<Record<string, string | undefined>>;

export type GeneratorRuntimeSource =
  | "fallback"
  | "legacy_env"
  | "override"
  | "runtime_state";

export type GeneratorRuntimeMode = "named" | "quick";

export type GeneratorRuntimeState = {
  readonly mode: GeneratorRuntimeMode;
  readonly pid: number;
  readonly updatedAt: string;
  readonly url: string;
  readonly version: number;
};

export type GeneratorRuntimeResolution =
  | {
      readonly source: GeneratorRuntimeSource;
      readonly status: "ok";
      readonly url: string;
    }
  | {
      readonly message: string;
      readonly source: "none";
      readonly status: "misconfigured";
      readonly url: null;
    };

type LegacyRuntimeResolution =
  | {
      readonly status: "ok";
      readonly url: string | null;
    }
  | {
      readonly message: string;
      readonly source: "none";
      readonly status: "misconfigured";
      readonly url: null;
    };

type ResolveGeneratorRuntimeDeps = {
  readonly appRootPath?: string;
  readonly env?: EnvSource;
  readonly existsSync?: typeof fs.existsSync;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly now?: number;
  readonly readFileSync?: typeof fs.readFileSync;
  readonly stateMaxAgeMs?: number;
};

export function resolveGeneratorRuntime(
  deps: ResolveGeneratorRuntimeDeps = {},
): GeneratorRuntimeResolution {
  const env = deps.env ?? process.env;
  const overrideUrl = normalizeUrl(env.OP_GENERATOR_RUNTIME_URL_OVERRIDE);
  if (overrideUrl !== null) {
    return {
      source: "override",
      status: "ok",
      url: overrideUrl,
    };
  }

  const appRootPath = deps.appRootPath ?? defaultAppRootPath;
  const runtimeState = readGeneratorRuntimeState({
    appRootPath,
    existsSync: deps.existsSync,
    isProcessAlive: deps.isProcessAlive,
    now: deps.now,
    readFileSync: deps.readFileSync,
    stateMaxAgeMs: deps.stateMaxAgeMs,
  });
  if (runtimeState !== null) {
    return {
      source: "runtime_state",
      status: "ok",
      url: runtimeState.url,
    };
  }

  const legacyUrl = resolveLegacyRuntimeUrl(env);
  if (legacyUrl.status === "misconfigured") {
    return legacyUrl;
  }
  if (legacyUrl.url !== null) {
    return {
      source: "legacy_env",
      status: "ok",
      url: legacyUrl.url,
    };
  }

  return {
    source: "fallback",
    status: "ok",
    url: DEFAULT_FALLBACK_URL,
  };
}

export function resolveGeneratorRuntimeStatePath(
  appRootPath = defaultAppRootPath,
) {
  return path.join(appRootPath, ".cache", "generator-runtime.json");
}

type ReadGeneratorRuntimeStateDeps = {
  readonly appRootPath?: string;
  readonly existsSync?: typeof fs.existsSync;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly now?: number;
  readonly readFileSync?: typeof fs.readFileSync;
  readonly stateMaxAgeMs?: number;
};

export function readGeneratorRuntimeState(
  deps: ReadGeneratorRuntimeStateDeps = {},
): GeneratorRuntimeState | null {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const readFileSync = deps.readFileSync ?? fs.readFileSync;
  const isProcessAlive = deps.isProcessAlive ?? defaultIsProcessAlive;
  const now = deps.now ?? Date.now();
  const stateMaxAgeMs = deps.stateMaxAgeMs ?? DEFAULT_STATE_MAX_AGE_MS;
  const statePath = resolveGeneratorRuntimeStatePath(
    deps.appRootPath ?? defaultAppRootPath,
  );

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

function resolveLegacyRuntimeUrl(env: EnvSource): LegacyRuntimeResolution {
  const generatorBaseUrl = normalizeUrl(env.OP_GENERATOR_BASE_URL);
  const finalizeDispatchUrl = normalizeUrl(env.OP_FINALIZE_DISPATCH_URL);

  if (
    generatorBaseUrl !== null &&
    finalizeDispatchUrl !== null &&
    generatorBaseUrl !== finalizeDispatchUrl
  ) {
    return {
      message:
        "`OP_GENERATOR_BASE_URL` と `OP_FINALIZE_DISPATCH_URL` の値が一致していません。",
      source: "none",
      status: "misconfigured",
      url: null,
    };
  }

  return {
    status: "ok",
    url: generatorBaseUrl ?? finalizeDispatchUrl,
  };
}

function normalizeRuntimeState(input: unknown): GeneratorRuntimeState | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const mode = record.mode;
  const pid = record.pid;
  const updatedAt = record.updatedAt;
  const url = normalizeUrl(
    typeof record.url === "string" ? record.url : undefined,
  );
  const version = record.version;

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
    pid: pid as number,
    updatedAt,
    url,
    version,
  };
}

function normalizeUrl(value: string | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
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

function defaultIsProcessAlive(pid: number): boolean {
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
