import http from "node:http";

import { isValidSuiObjectId } from "@mysten/sui/utils";

import { loadGeneratorRuntimeEnv } from "./env";
import {
  createFinalizeRunnerFromEndpoints,
  type FinalizeRunResult,
} from "./runtime";
import {
  createFinalizeTransactionExecutor,
  createSuiClient,
  createUnitSnapshotLoader,
} from "./sui";

const port = Number(process.env.PORT ?? "8080");

const server = http.createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(port, "0.0.0.0");

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }

  if (request.method === "POST" && request.url === "/dispatch") {
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
