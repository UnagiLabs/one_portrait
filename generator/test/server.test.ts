import type http from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/env", () => ({
  loadGeneratorRuntimeEnv: vi.fn(() => ({
    adminCapId: "0xadmincap",
    adminPrivateKey: "suiprivkey",
    packageId: "0xpkg",
    suiNetwork: "testnet",
    walrusAggregatorBaseUrl: "https://aggregator.example",
    walrusPublisherBaseUrl: "https://publisher.example",
  })),
}));

const runMock = vi.fn(async () => ({
  status: "ignored_finalized" as const,
  unitId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
}));

vi.mock("../src/runtime", () => ({
  createFinalizeRunnerFromEndpoints: vi.fn(() => ({
    run: runMock,
  })),
}));

vi.mock("../src/sui", () => ({
  createFinalizeTransactionExecutor: vi.fn(() => vi.fn()),
  createSuiClient: vi.fn(() => ({ mocked: true })),
  createUnitSnapshotLoader: vi.fn(() => vi.fn()),
}));

import { createGeneratorServer, DISPATCH_SECRET_HEADER } from "../src/server";

const VALID_UNIT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

afterEach(() => {
  delete process.env.OP_FINALIZE_DISPATCH_SECRET;
  runMock.mockClear();
});

describe("generator server", () => {
  it("returns 401 for /dispatch when the shared secret is missing", async () => {
    process.env.OP_FINALIZE_DISPATCH_SECRET = "shared-secret";

    const server = createGeneratorServer();
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/dispatch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ unitId: VALID_UNIT_ID }),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "unauthorized",
        message: "Dispatch secret is invalid.",
      });
      expect(runMock).not.toHaveBeenCalled();
    } finally {
      await close(server);
    }
  });

  it("accepts /dispatch when the shared secret matches", async () => {
    process.env.OP_FINALIZE_DISPATCH_SECRET = "shared-secret";

    const server = createGeneratorServer();
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/dispatch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [DISPATCH_SECRET_HEADER]: "shared-secret",
        },
        body: JSON.stringify({ unitId: VALID_UNIT_ID }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "ignored_finalized",
        unitId: VALID_UNIT_ID,
      });
      expect(runMock).toHaveBeenCalledWith(VALID_UNIT_ID);
    } finally {
      await close(server);
    }
  });
});

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server.");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
