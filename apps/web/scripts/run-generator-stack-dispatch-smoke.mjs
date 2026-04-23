import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveScriptGeneratorRuntime } from "./generator-runtime.mjs";
import { readRemoteGeneratorRuntime } from "./generator-runtime-remote.mjs";
import { loadWebScriptEnv } from "./run-local-generator.mjs";

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_DISPATCH_PATH = "/dispatch";
const DISPATCH_SECRET_HEADER = "x-op-finalize-dispatch-secret";

export async function runGeneratorStackDispatchSmoke({
  appRootPath,
  argv = process.argv,
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  readRemoteRuntime = readRemoteGeneratorRuntime,
} = {}) {
  const unitId = parseUnitId(argv);
  const dispatchSecret = normalizeRequiredValue(
    env.OP_FINALIZE_DISPATCH_SECRET,
  );
  const runtime = await resolveSmokeGeneratorRuntime({
    appRootPath,
    env,
    logger,
    readRemoteRuntime,
  });
  const dispatchUrl = runtime.status === "ok" ? runtime.url : null;

  if (!unitId || !dispatchUrl || !dispatchSecret || runtime.status !== "ok") {
    const marker = "[generator-stack][smoke][invalid-input]";
    logger?.error?.(
      `${marker} missing ${[
        !unitId ? "unitId" : null,
        runtime.status !== "ok"
          ? "generator runtime"
          : !dispatchUrl
            ? "OP_FINALIZE_DISPATCH_URL"
            : null,
        !dispatchSecret ? "OP_FINALIZE_DISPATCH_SECRET" : null,
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
    return {
      exitCode: 1,
      marker,
      ok: false,
    };
  }

  let response;
  try {
    response = await fetchImpl(
      new URL(DEFAULT_DISPATCH_PATH, `${dispatchUrl}/`),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          [DISPATCH_SECRET_HEADER]: dispatchSecret,
        },
        body: JSON.stringify({ unitId }),
      },
    );
  } catch (error) {
    const marker = "[generator-stack][smoke][failed]";
    logger?.error?.(
      `${marker} status=fetch_error message=${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {
      exitCode: 1,
      marker,
      ok: false,
    };
  }

  if (response.status !== 200) {
    const marker = "[generator-stack][smoke][failed]";
    logger?.error?.(`${marker} status=${response.status}`);
    return {
      exitCode: 1,
      marker,
      ok: false,
    };
  }

  const result = await response.json();
  const status = getResultStatus(result);
  const marker = "[generator-stack][smoke][ok]";
  logger?.info?.(`${marker} status=${status}`);

  return {
    exitCode: 0,
    marker,
    ok: true,
    resultStatus: status,
  };
}

if (isExecutedDirectly()) {
  const env = loadWebScriptEnv({ env: process.env });
  const result = await runGeneratorStackDispatchSmoke({
    argv: process.argv,
    env,
    fetchImpl: globalThis.fetch,
    logger: console,
  });

  process.exit(result.exitCode);
}

function parseUnitId(argv) {
  const candidate = typeof argv?.[2] === "string" ? argv[2].trim() : "";
  return candidate.length > 0 ? candidate : null;
}

async function resolveSmokeGeneratorRuntime({
  appRootPath,
  env,
  logger,
  readRemoteRuntime,
}) {
  const overrideUrl = normalizeOptionalUrl(
    env.OP_GENERATOR_RUNTIME_URL_OVERRIDE,
  );
  if (overrideUrl !== null) {
    return {
      source: "override",
      status: "ok",
      url: overrideUrl,
    };
  }

  const remoteRuntime = await readRemoteRuntime({
    env,
    logger,
  });
  if (remoteRuntime !== null) {
    return {
      source: "worker_kv",
      status: "ok",
      url: remoteRuntime.url,
    };
  }

  return resolveScriptGeneratorRuntime({
    appRootPath,
    env,
  });
}

function normalizeRequiredValue(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate.length > 0 ? candidate : null;
}

function normalizeOptionalUrl(value) {
  const candidate = normalizeRequiredValue(value);
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate).toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function getResultStatus(result) {
  if (typeof result === "object" && result !== null) {
    const status = result.status;
    if (typeof status === "string" && status.trim().length > 0) {
      return status;
    }
  }

  return "unknown";
}

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return path.resolve(entry) === __filename;
}
