import http from "node:http";
import { pathToFileURL } from "node:url";

import { isValidSuiObjectId } from "@mysten/sui/utils";

import { generatorRuntimeEnvKeys, loadGeneratorRuntimeEnv } from "./env";
import {
  createFinalizeRunnerFromEndpoints,
  type FinalizeRunResult,
} from "./runtime";
import {
  createFinalizeTransactionExecutor,
  createSuiClient,
  createUnitSnapshotLoader,
} from "./sui";

export const DISPATCH_SECRET_HEADER = "x-op-finalize-dispatch-secret";

export function createGeneratorServer(): http.Server {
  return http.createServer((request, response) => {
    void handleRequest(request, response);
  });
}

export async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (request.method === "GET" && request.url === "/health") {
    const readiness = getDispatchReadiness(process.env);
    if (!readiness.ready) {
      writeJson(response, 503, {
        error: "server_misconfigured",
        message: `Missing required generator env variable(s): ${readiness.missing.join(", ")}.`,
      });
      return;
    }

    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }

  if (request.method === "POST" && request.url === "/dispatch") {
    const authorizationError = validateDispatchAuthorization(request);
    if (authorizationError !== null) {
      writeJson(
        response,
        authorizationError.status,
        authorizationError.payload,
      );
      return;
    }

    try {
      const input = parseDispatchInput(await readJsonBody(request));
      const env = loadGeneratorRuntimeEnv(process.env);
      const client = createSuiClient({
        network: env.suiNetwork,
      });
      const runner = createFinalizeRunnerFromEndpoints({
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

      writeJson(response, 200, result);
      return;
    } catch (error) {
      writeJson(response, 500, {
        error: "finalize_failed",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

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

function writeJson(
  response: http.ServerResponse,
  status: number,
  payload:
    | FinalizeRunResult
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
  const readiness = getDispatchReadiness(process.env);
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

function getDispatchReadiness(
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
  server.listen(port, "0.0.0.0");
}
