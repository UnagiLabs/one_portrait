import type http from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFinalizeRunnerFromEndpointsMock: vi.fn(),
}));

vi.mock("../src/env", () => ({
  generatorRuntimeEnvKeys: [
    "SUI_NETWORK",
    "PACKAGE_ID",
    "ADMIN_CAP_ID",
    "ADMIN_SUI_PRIVATE_KEY",
    "WALRUS_PUBLISHER",
    "WALRUS_AGGREGATOR",
  ],
  loadGeneratorRuntimeEnv: vi.fn(() => {
    const manifestPath = process.env.OP_DEMO_FINALIZE_MANIFEST?.trim() ?? "";

    return {
      adminCapId: "0xadmincap",
      adminPrivateKey: "suiprivkey",
      demoFinalizeManifestPath: manifestPath.length > 0 ? manifestPath : null,
      packageId: "0xpkg",
      suiNetwork: "testnet",
      walrusAggregatorBaseUrl: "https://aggregator.example",
      walrusPublisherBaseUrl: "https://publisher.example",
    };
  }),
}));

const runMock = vi.fn(async () => ({
  status: "ignored_finalized" as const,
  unitId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
}));
const createUnitMock = vi.fn(async () => ({
  digest: "0xcreate",
  unitId: VALID_UNIT_ID,
}));
mocks.createFinalizeRunnerFromEndpointsMock.mockImplementation(() => ({
  run: runMock,
}));

vi.mock("../src/runtime", () => ({
  createFinalizeRunnerFromEndpoints:
    mocks.createFinalizeRunnerFromEndpointsMock,
}));

vi.mock("../src/sui", () => ({
  createCreateUnitTransactionExecutor: vi.fn(() => createUnitMock),
  createFinalizeTransactionExecutor: vi.fn(() => vi.fn()),
  createSuiClient: vi.fn(() => ({ mocked: true })),
  createUnitSnapshotLoader: vi.fn(() => vi.fn()),
}));

import { createGeneratorServer, DISPATCH_SECRET_HEADER } from "../src/server";

const VALID_UNIT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const VALID_REGISTRY_ID =
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";

afterEach(() => {
  for (const key of [
    "ADMIN_CAP_ID",
    "ADMIN_SUI_PRIVATE_KEY",
    "OP_FINALIZE_DISPATCH_SECRET",
    "PACKAGE_ID",
    "SUI_NETWORK",
    "WALRUS_AGGREGATOR",
    "WALRUS_PUBLISHER",
    "OP_DEMO_FINALIZE_MANIFEST",
  ]) {
    delete process.env[key];
  }
  runMock.mockClear();
  createUnitMock.mockClear();
  mocks.createFinalizeRunnerFromEndpointsMock.mockClear();
});

describe("generator server", () => {
  it("returns 503 on /health when dispatch readiness is incomplete", async () => {
    const server = createGeneratorServer();
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/health`);

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "server_misconfigured",
        message:
          "Missing required generator env variable(s): SUI_NETWORK, PACKAGE_ID, ADMIN_CAP_ID, ADMIN_SUI_PRIVATE_KEY, WALRUS_PUBLISHER, WALRUS_AGGREGATOR.",
      });
    } finally {
      await close(server);
    }
  });

  it("returns deployment metadata on /health when ready", async () => {
    setReadyGeneratorEnv();

    const server = createGeneratorServer();
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/health`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        adminCapId: "0xadmincap",
        network: "testnet",
        packageId: "0xpkg",
        status: "ok",
      });
    } finally {
      await close(server);
    }
  });

  it("returns 401 for /dispatch when the shared secret is missing", async () => {
    setReadyGeneratorEnv();

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
    setReadyGeneratorEnv();

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
      expect(mocks.createFinalizeRunnerFromEndpointsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          demoFinalizeManifestPath: "/tmp/demo-finalize-manifest.json",
        }),
      );
    } finally {
      await close(server);
    }
  });

  it("logs dispatch start and done lines for /dispatch", async () => {
    setReadyGeneratorEnv();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
      await response.json();

      const logLines = logSpy.mock.calls.map((call) => String(call[0] ?? ""));
      expect(
        logLines.some((line) =>
          /\[req [0-9a-f]{8}\] dispatch start/.test(line),
        ),
      ).toBe(true);
      expect(
        logLines.some((line) => /\[req [0-9a-f]{8}\] dispatch done/.test(line)),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
      await close(server);
    }
  });

  it("accepts /admin/create-unit when the payload is valid", async () => {
    setReadyGeneratorEnv();

    const server = createGeneratorServer();
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/admin/create-unit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [DISPATCH_SECRET_HEADER]: "shared-secret",
        },
        body: JSON.stringify({
          blobId: "target-blob-12",
          displayMaxSlots: 2000,
          displayName: "Demo Athlete Twelve",
          maxSlots: 2000,
          registryObjectId: VALID_REGISTRY_ID,
          thumbnailUrl: "https://example.com/12.png",
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        digest: "0xcreate",
        status: "created",
        unitId: VALID_UNIT_ID,
      });
      expect(createUnitMock).toHaveBeenCalledWith({
        blobId: "target-blob-12",
        displayMaxSlots: 2000,
        displayName: "Demo Athlete Twelve",
        maxSlots: 2000,
        registryObjectId: VALID_REGISTRY_ID,
        thumbnailUrl: "https://example.com/12.png",
      });
    } finally {
      await close(server);
    }
  });

  it("accepts /admin/create-unit with zero real upload slots", async () => {
    setReadyGeneratorEnv();

    const server = createGeneratorServer();
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/admin/create-unit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [DISPATCH_SECRET_HEADER]: "shared-secret",
        },
        body: JSON.stringify({
          blobId: "target-blob-zero",
          displayMaxSlots: 2000,
          displayName: "Demo Athlete Zero",
          maxSlots: 0,
          registryObjectId: VALID_REGISTRY_ID,
          thumbnailUrl: "https://example.com/0.png",
        }),
      });

      expect(response.status).toBe(200);
      expect(createUnitMock).toHaveBeenCalledWith({
        blobId: "target-blob-zero",
        displayMaxSlots: 2000,
        displayName: "Demo Athlete Zero",
        maxSlots: 0,
        registryObjectId: VALID_REGISTRY_ID,
        thumbnailUrl: "https://example.com/0.png",
      });
    } finally {
      await close(server);
    }
  });

  it("rejects /admin/create-unit when displayMaxSlots is zero", async () => {
    setReadyGeneratorEnv();

    const server = createGeneratorServer();
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/admin/create-unit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [DISPATCH_SECRET_HEADER]: "shared-secret",
        },
        body: JSON.stringify({
          blobId: "target-blob-zero",
          displayMaxSlots: 0,
          displayName: "Demo Athlete Zero",
          maxSlots: 0,
          registryObjectId: VALID_REGISTRY_ID,
          thumbnailUrl: "https://example.com/0.png",
        }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "invalid_args",
      });
    } finally {
      await close(server);
    }
  });

  it("accepts /dispatch-auth-probe with the shared secret and does not run finalize", async () => {
    setReadyGeneratorEnv();

    const server = createGeneratorServer();
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/dispatch-auth-probe`, {
        method: "GET",
        headers: {
          [DISPATCH_SECRET_HEADER]: "shared-secret",
        },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "ok",
      });
      expect(runMock).not.toHaveBeenCalled();
    } finally {
      await close(server);
    }
  });
});

function setReadyGeneratorEnv(): void {
  process.env.SUI_NETWORK = "testnet";
  process.env.PACKAGE_ID = "0xpkg";
  process.env.ADMIN_CAP_ID = "0xadmincap";
  process.env.ADMIN_SUI_PRIVATE_KEY = "suiprivkey";
  process.env.WALRUS_PUBLISHER = "https://publisher.example";
  process.env.WALRUS_AGGREGATOR = "https://aggregator.example";
  process.env.OP_FINALIZE_DISPATCH_SECRET = "shared-secret";
  process.env.OP_DEMO_FINALIZE_MANIFEST = "/tmp/demo-finalize-manifest.json";
}

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
