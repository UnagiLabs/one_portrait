import fs from "node:fs";
import path from "node:path";

const DEFAULT_FALLBACK_URL = "http://127.0.0.1:8080";
const DEFAULT_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const DEFAULT_REMOTE_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const RUNTIME_STATE_VERSION = 1;

type EnvSource = Readonly<Record<string, string | undefined>>;
type RuntimeEnvValue = string | GeneratorRuntimeKvNamespace | undefined;
type RuntimeEnvSource = Readonly<Record<string, RuntimeEnvValue>>;

export const GENERATOR_RUNTIME_KV_BINDING = "OP_GENERATOR_RUNTIME_KV";
export const GENERATOR_RUNTIME_KV_KEY = "generator-runtime/current";

export type GeneratorRuntimeSource =
  | "fallback"
  | "legacy_env"
  | "override"
  | "runtime_state"
  | "worker_kv";

export type GeneratorRuntimeMode = "named" | "quick";

export type GeneratorRuntimeState = {
  readonly mode: GeneratorRuntimeMode;
  readonly pid: number;
  readonly updatedAt: string;
  readonly url: string;
  readonly version: number;
};

export type GeneratorRuntimeKvState = {
  readonly mode: GeneratorRuntimeMode;
  readonly updatedAt: string;
  readonly url: string;
  readonly version: number;
};

export type GeneratorRuntimeKvNamespace = {
  get(key: string, type: "json"): Promise<Record<string, unknown> | null>;
};

export type GeneratorRuntimeCloudflareEnv = RuntimeEnvSource & {
  readonly [GENERATOR_RUNTIME_KV_BINDING]?:
    | GeneratorRuntimeKvNamespace
    | undefined;
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

  const appRootPath = deps.appRootPath ?? process.cwd();
  const runtimeState = readGeneratorRuntimeState({
    appRootPath,
    env,
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
  input:
    | string
    | {
        readonly appRootPath?: string;
        readonly env?: EnvSource;
      } = {},
) {
  if (typeof input === "string") {
    return path.join(input, ".cache", "generator-runtime.json");
  }

  const appRootPath = input.appRootPath ?? process.cwd();
  const explicitStatePath = normalizeStatePath(
    (input.env ?? process.env).OP_GENERATOR_RUNTIME_STATE_PATH,
    appRootPath,
  );

  return (
    explicitStatePath ??
    path.join(appRootPath, ".cache", "generator-runtime.json")
  );
}

type ReadGeneratorRuntimeStateDeps = {
  readonly appRootPath?: string;
  readonly env?: EnvSource;
  readonly existsSync?: typeof fs.existsSync;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly now?: number;
  readonly readFileSync?: typeof fs.readFileSync;
  readonly stateMaxAgeMs?: number;
};

type ResolveCloudflareGeneratorRuntimeDeps = {
  readonly env: GeneratorRuntimeCloudflareEnv;
};

export function readGeneratorRuntimeState(
  deps: ReadGeneratorRuntimeStateDeps = {},
): GeneratorRuntimeState | null {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const readFileSync = deps.readFileSync ?? fs.readFileSync;
  const isProcessAlive = deps.isProcessAlive ?? defaultIsProcessAlive;
  const now = deps.now ?? Date.now();
  const stateMaxAgeMs = deps.stateMaxAgeMs ?? DEFAULT_STATE_MAX_AGE_MS;
  const statePath = resolveGeneratorRuntimeStatePath({
    appRootPath: deps.appRootPath ?? process.cwd(),
    env: deps.env ?? process.env,
  });

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

export async function resolveCloudflareGeneratorRuntime({
  env,
}: ResolveCloudflareGeneratorRuntimeDeps): Promise<GeneratorRuntimeResolution> {
  const overrideUrl = normalizeUrl(
    readEnvString(env.OP_GENERATOR_RUNTIME_URL_OVERRIDE),
  );
  if (overrideUrl !== null) {
    return {
      source: "override",
      status: "ok",
      url: overrideUrl,
    };
  }

  const kvRuntime = await readGeneratorRuntimeKvState(env);
  if (kvRuntime !== null) {
    return {
      source: "worker_kv",
      status: "ok",
      url: kvRuntime.url,
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

function resolveLegacyRuntimeUrl(
  env: RuntimeEnvSource,
): LegacyRuntimeResolution {
  const generatorBaseUrl = normalizeUrl(
    readEnvString(env.OP_GENERATOR_BASE_URL),
  );
  const finalizeDispatchUrl = normalizeUrl(
    readEnvString(env.OP_FINALIZE_DISPATCH_URL),
  );

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

async function readGeneratorRuntimeKvState(
  env: GeneratorRuntimeCloudflareEnv,
): Promise<GeneratorRuntimeKvState | null> {
  const kv = env[GENERATOR_RUNTIME_KV_BINDING];
  if (!kv) {
    return null;
  }

  try {
    const parsed = await kv.get(GENERATOR_RUNTIME_KV_KEY, "json");
    return normalizeRuntimeKvState(parsed, {
      now: Date.now(),
    });
  } catch {
    return null;
  }
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

function normalizeRuntimeKvState(
  input: unknown,
  { now }: { now: number },
): GeneratorRuntimeKvState | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const mode = record.mode;
  const updatedAt = record.updatedAt;
  const url = normalizeUrl(
    typeof record.url === "string" ? record.url : undefined,
  );
  const version = record.version;

  if (
    version !== RUNTIME_STATE_VERSION ||
    (mode !== "named" && mode !== "quick") ||
    typeof updatedAt !== "string" ||
    url === null
  ) {
    return null;
  }

  const updatedAtMs = Date.parse(updatedAt);
  if (
    !Number.isFinite(updatedAtMs) ||
    now - updatedAtMs > DEFAULT_REMOTE_STATE_MAX_AGE_MS
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

function readEnvString(value: RuntimeEnvValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeStatePath(
  value: string | undefined,
  appRootPath: string,
): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
    return null;
  }

  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(appRootPath, normalized);
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
