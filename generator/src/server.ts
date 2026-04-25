import { randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

import { isValidSuiObjectId } from "@mysten/sui/utils";

import { generatorRuntimeEnvKeys, loadGeneratorRuntimeEnv } from "./env";
import {
  createFinalizeRunnerFromEndpoints,
  type FinalizeRunResult,
} from "./runtime";
import {
  createCreateUnitTransactionExecutor,
  createFinalizeTransactionExecutor,
  createSuiClient,
  createUnitSnapshotLoader,
} from "./sui";

export const DISPATCH_SECRET_HEADER = "x-op-finalize-dispatch-secret";

type LogLevel = "info" | "warn" | "error";

function logLine(level: LogLevel, tag: string, message: string): void {
  const prefix =
    level === "info" ? "[INFO]" : level === "warn" ? "[WARN]" : "[ERR ]";
  const raw = `${prefix} ${new Date().toISOString()} [${tag}] ${message}`;
  const line = raw.replace(/[\r\n]+/g, " ");

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function shortenObjectId(value: string): string {
  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 10)}..${value.slice(-4)}`;
}

class InvalidPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPayloadError";
  }
}

export function createGeneratorServer(): http.Server {
  return http.createServer((request, response) => {
    void handleRequest(request, response);
  });
}

export async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const reqId = randomUUID().slice(0, 8);
  const reqTag = `req ${reqId}`;
  const startedAt = Date.now();

  if (request.method === "GET" && request.url === "/health") {
    const readiness = getGeneratorReadiness(process.env);
    if (!readiness.ready) {
      logLine(
        "warn",
        reqTag,
        `health misconfigured missing=${readiness.missing.join(",")}`,
      );
      writeJson(response, 503, {
        error: "server_misconfigured",
        message: `Missing required generator env variable(s): ${readiness.missing.join(", ")}.`,
      });
      return;
    }

    writeJson(response, 200, {
      adminCapId: readiness.adminCapId,
      network: readiness.network,
      packageId: readiness.packageId,
      status: "ok",
    });
    return;
  }

  if (request.method === "POST" && request.url === "/dispatch") {
    logLine("info", reqTag, `POST /dispatch`);
    const authorizationError = validateDispatchAuthorization(request);
    if (authorizationError !== null) {
      logLine(
        "warn",
        reqTag,
        `dispatch unauthorized status=${authorizationError.status}`,
      );
      writeJson(
        response,
        authorizationError.status,
        authorizationError.payload,
      );
      return;
    }

    try {
      const input = parseDispatchInput(await readJsonBody(request));
      logLine(
        "info",
        reqTag,
        `dispatch start unitId=${shortenObjectId(input.unitId)}`,
      );
      const env = loadGeneratorRuntimeEnv(process.env);
      const client = createSuiClient({
        network: env.suiNetwork,
      });
      const runner = createFinalizeRunnerFromEndpoints({
        demoFinalizeManifestPath: env.demoFinalizeManifestPath,
        readUnitSnapshot: createUnitSnapshotLoader(client),
        finalizeTransaction: createFinalizeTransactionExecutor({
          client,
          packageId: env.packageId,
          adminCapId: env.adminCapId,
          privateKey: env.adminPrivateKey,
        }),
        walrusAggregatorBaseUrl: env.walrusAggregatorBaseUrl,
        walrusPublisherBaseUrl: env.walrusPublisherBaseUrl,
      });
      const result = await runner.run(input.unitId);
      const elapsedMs = Date.now() - startedAt;

      if (result.status === "finalized") {
        logLine(
          "info",
          reqTag,
          `dispatch done status=${result.status} ms=${elapsedMs} mosaicBlobId=${result.mosaicBlobId} digest=${result.digest} placements=${result.placementCount}`,
        );
      } else {
        logLine(
          "info",
          reqTag,
          `dispatch done status=${result.status} ms=${elapsedMs}`,
        );
      }

      writeJson(response, 200, result);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logLine("error", reqTag, `dispatch failed message=${message}`);
      writeJson(response, 500, {
        error: "finalize_failed",
        message,
      });
      return;
    }
  }

  if (request.method === "GET" && request.url === "/dispatch-auth-probe") {
    const authorizationError = validateDispatchAuthorization(request);
    if (authorizationError !== null) {
      logLine(
        "warn",
        reqTag,
        `auth probe unauthorized status=${authorizationError.status}`,
      );
      writeJson(
        response,
        authorizationError.status,
        authorizationError.payload,
      );
      return;
    }

    writeJson(response, 200, {
      status: "ok",
    });
    return;
  }

  if (request.method === "POST" && request.url === "/admin/create-unit") {
    logLine("info", reqTag, `POST /admin/create-unit`);
    const authorizationError = validateDispatchAuthorization(request);
    if (authorizationError !== null) {
      logLine(
        "warn",
        reqTag,
        `create-unit unauthorized status=${authorizationError.status}`,
      );
      writeJson(
        response,
        authorizationError.status,
        authorizationError.payload,
      );
      return;
    }

    try {
      const input = parseCreateUnitInput(await readJsonBody(request));
      logLine(
        "info",
        reqTag,
        `create-unit start displayName=${JSON.stringify(input.displayName)} maxSlots=${input.maxSlots} displayMaxSlots=${input.displayMaxSlots}`,
      );
      const env = loadGeneratorRuntimeEnv(process.env);
      const client = createSuiClient({
        network: env.suiNetwork,
      });
      const executeCreateUnit = createCreateUnitTransactionExecutor({
        adminCapId: env.adminCapId,
        client,
        packageId: env.packageId,
        privateKey: env.adminPrivateKey,
      });
      const result = await executeCreateUnit(input);
      const elapsedMs = Date.now() - startedAt;
      logLine(
        "info",
        reqTag,
        `create-unit done unitId=${shortenObjectId(result.unitId)} digest=${result.digest} ms=${elapsedMs}`,
      );

      writeJson(response, 200, {
        digest: result.digest,
        status: "created",
        unitId: result.unitId,
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof InvalidPayloadError) {
        logLine("warn", reqTag, `create-unit invalid_args message=${message}`);
        writeJson(response, 400, {
          error: "invalid_args",
          message,
        });
        return;
      }

      logLine("error", reqTag, `create-unit failed message=${message}`);
      writeJson(response, 500, {
        error: "create_unit_failed",
        message,
      });
      return;
    }
  }

  logLine(
    "warn",
    reqTag,
    `not_found method=${request.method ?? "?"} url=${request.url ?? "?"}`,
  );
  writeJson(response, 404, {
    error: "not_found",
    message: "Unknown route.",
  });
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(
      typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk,
    );
  }

  if (chunks.length === 0) {
    return {};
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  return JSON.parse(new TextDecoder().decode(buffer));
}

function parseDispatchInput(input: unknown): { readonly unitId: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Dispatch payload must be an object.");
  }

  const unitId =
    typeof (input as Record<string, unknown>).unitId === "string"
      ? (input as Record<string, string>).unitId.trim()
      : "";

  if (!isValidSuiObjectId(unitId)) {
    throw new Error("Dispatch payload requires a valid unitId.");
  }

  return {
    unitId,
  };
}

function parseCreateUnitInput(input: unknown): {
  readonly blobId: string;
  readonly displayMaxSlots: number;
  readonly displayName: string;
  readonly maxSlots: number;
  readonly registryObjectId: string;
  readonly thumbnailUrl: string;
} {
  const record = parseJsonRecord(input);
  const maxSlots = parseNonNegativeInteger(record.maxSlots, "maxSlots");
  const displayMaxSlots = parsePositiveInteger(
    record.displayMaxSlots,
    "displayMaxSlots",
  );
  if (displayMaxSlots < maxSlots) {
    throw new InvalidPayloadError(
      "Payload requires displayMaxSlots to be greater than or equal to maxSlots.",
    );
  }

  return {
    blobId: parseNonEmptyString(record.blobId, "blobId"),
    displayMaxSlots,
    displayName: parseNonEmptyString(record.displayName, "displayName"),
    maxSlots,
    registryObjectId: parseObjectId(
      record.registryObjectId,
      "registryObjectId",
    ),
    thumbnailUrl: parseNonEmptyString(record.thumbnailUrl, "thumbnailUrl"),
  };
}

function parseJsonRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvalidPayloadError("Payload must be an object.");
  }

  return input as Record<string, unknown>;
}

function parsePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = parseNonNegativeInteger(value, fieldName);

  if (parsed === 0) {
    throw new InvalidPayloadError(
      `Payload requires ${fieldName} as a positive integer.`,
    );
  }

  return parsed;
}

function parseNonNegativeInteger(value: unknown, fieldName: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[0-9]+$/.test(value)
        ? Number(value)
        : NaN;

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidPayloadError(
      `Payload requires ${fieldName} as a non-negative integer.`,
    );
  }

  return parsed;
}

function parseNonEmptyString(value: unknown, fieldName: string): string {
  const parsed = typeof value === "string" ? value.trim() : "";

  if (parsed.length === 0) {
    throw new InvalidPayloadError(
      `Payload requires ${fieldName} as a non-empty string.`,
    );
  }

  return parsed;
}

function parseObjectId(value: unknown, fieldName: string): string {
  const parsed = typeof value === "string" ? value.trim() : "";

  if (!isValidSuiObjectId(parsed)) {
    throw new InvalidPayloadError(`Payload requires a valid ${fieldName}.`);
  }

  return parsed;
}

function writeJson(
  response: http.ServerResponse,
  status: number,
  payload:
    | FinalizeRunResult
    | {
        readonly digest: string;
        readonly status: "created" | "rotated";
        readonly unitId: string;
      }
    | {
        readonly adminCapId: string;
        readonly network: string;
        readonly packageId: string;
        readonly status: "ok";
      }
    | {
        readonly status: "ok";
      }
    | { readonly error: string; readonly message: string },
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function validateDispatchAuthorization(request: http.IncomingMessage): {
  readonly status: 401 | 500;
  readonly payload: { readonly error: string; readonly message: string };
} | null {
  const readiness = getDispatchAuthorizationReadiness(process.env);
  if (!readiness.ready) {
    return {
      status: 500,
      payload: {
        error: "server_misconfigured",
        message: `Missing required generator env variable(s): ${readiness.missing.join(", ")}.`,
      },
    };
  }

  const configuredSecret = normalizeHeaderValue(
    process.env.OP_FINALIZE_DISPATCH_SECRET,
  );
  const providedSecret = normalizeHeaderValue(
    request.headers[DISPATCH_SECRET_HEADER],
  );
  if (providedSecret !== configuredSecret) {
    return {
      status: 401,
      payload: {
        error: "unauthorized",
        message: "Dispatch secret is invalid.",
      },
    };
  }

  return null;
}

function normalizeHeaderValue(
  value: string | string[] | undefined,
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = typeof candidate === "string" ? candidate.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function getGeneratorReadiness(source: NodeJS.ProcessEnv):
  | {
      readonly adminCapId: string;
      readonly network: string;
      readonly packageId: string;
      readonly ready: true;
    }
  | { readonly ready: false; readonly missing: readonly string[] } {
  const missing = [...generatorRuntimeEnvKeys].filter(
    (key) => normalizeHeaderValue(source[key]) === null,
  );

  if (missing.length > 0) {
    return {
      ready: false,
      missing,
    };
  }

  return {
    adminCapId: normalizeHeaderValue(source.ADMIN_CAP_ID) ?? "",
    network: normalizeHeaderValue(source.SUI_NETWORK) ?? "",
    packageId: normalizeHeaderValue(source.PACKAGE_ID) ?? "",
    ready: true,
  };
}

function getDispatchAuthorizationReadiness(
  source: NodeJS.ProcessEnv,
):
  | { readonly ready: true }
  | { readonly ready: false; readonly missing: readonly string[] } {
  const missing = [
    ...generatorRuntimeEnvKeys,
    "OP_FINALIZE_DISPATCH_SECRET",
  ].filter((key) => normalizeHeaderValue(source[key]) === null);

  if (missing.length > 0) {
    return {
      ready: false,
      missing,
    };
  }

  return {
    ready: true,
  };
}

function isMainModule() {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryPoint).href;
}

if (isMainModule()) {
  const port = Number(process.env.PORT ?? "8080");
  const server = createGeneratorServer();
  server.listen(port, "0.0.0.0", () => {
    logLine(
      "info",
      "boot",
      `ONE Portrait generator listening port=${port} routes=/health,/dispatch,/dispatch-auth-probe,/admin/create-unit`,
    );
  });
}
