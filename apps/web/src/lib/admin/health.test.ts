import { afterEach, describe, expect, it, vi } from "vitest";

import testnetDeploymentManifest from "../../../../../ops/deployments/testnet.json";
import { getAdminHealth } from "./health";

const MANIFEST_PACKAGE_ID = testnetDeploymentManifest.packageId;

const EXPECTED_DEPLOYMENT = {
  network: testnetDeploymentManifest.network,
  packageId: MANIFEST_PACKAGE_ID,
};

describe("getAdminHealth", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("returns the resolved runtime URL and source", async () => {
    vi.stubEnv("OP_FINALIZE_DISPATCH_SECRET", "shared-secret");
    vi.stubEnv(
      "OP_GENERATOR_RUNTIME_URL_OVERRIDE",
      "https://generator.example.com",
    );
    fetchMock.mockImplementation(async (request: Request) => {
      if (request.url === "https://generator.example.com/health") {
        return Response.json({
          adminCapId: "0xadmincap",
          network: "testnet",
          packageId: MANIFEST_PACKAGE_ID,
          status: "ok",
        });
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdminHealth()).resolves.toEqual({
      currentUrl: "https://generator.example.com",
      dispatchAuthorization: {
        httpStatus: 200,
        status: "ok",
      },
      expectedDeployment: EXPECTED_DEPLOYMENT,
      generatorReadiness: {
        adminCapId: "0xadmincap",
        httpStatus: 200,
        network: "testnet",
        packageId: MANIFEST_PACKAGE_ID,
        status: "ok",
      },
      resolutionStatus: "ok",
      source: "override",
    });
  });

  it("surfaces a misconfigured runtime without probing external endpoints", async () => {
    vi.stubEnv("OP_FINALIZE_DISPATCH_SECRET", "shared-secret");
    vi.stubEnv("OP_FINALIZE_DISPATCH_URL", "https://dispatch.example.com");
    vi.stubEnv("OP_GENERATOR_BASE_URL", "https://generator.example.com");
    vi.stubEnv(
      "OP_GENERATOR_RUNTIME_STATE_PATH",
      "/tmp/one-portrait-missing-generator-runtime.json",
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdminHealth()).resolves.toEqual({
      currentUrl: null,
      dispatchAuthorization: {
        httpStatus: null,
        status: "misconfigured",
      },
      expectedDeployment: EXPECTED_DEPLOYMENT,
      generatorReadiness: {
        httpStatus: null,
        status: "misconfigured",
      },
      resolutionStatus: "misconfigured",
      source: "none",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the current url from worker kv when request env is provided", async () => {
    fetchMock.mockImplementation(async (request: Request) => {
      if (request.url === "https://worker-kv.example.com/health") {
        return Response.json({
          adminCapId: "0xadmincap",
          network: "testnet",
          packageId: MANIFEST_PACKAGE_ID,
          status: "ok",
        });
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getAdminHealth({
        env: {
          OP_FINALIZE_DISPATCH_SECRET: "shared-secret",
          OP_GENERATOR_RUNTIME_KV: {
            get: async () => ({
              mode: "quick",
              updatedAt: new Date().toISOString(),
              url: "https://worker-kv.example.com/",
              version: 1,
            }),
          },
        },
      }),
    ).resolves.toEqual({
      currentUrl: "https://worker-kv.example.com",
      dispatchAuthorization: {
        httpStatus: 200,
        status: "ok",
      },
      expectedDeployment: EXPECTED_DEPLOYMENT,
      generatorReadiness: {
        adminCapId: "0xadmincap",
        httpStatus: 200,
        network: "testnet",
        packageId: MANIFEST_PACKAGE_ID,
        status: "ok",
      },
      resolutionStatus: "ok",
      source: "worker_kv",
    });
  });

  it("marks health misconfigured when the generator package differs", async () => {
    vi.stubEnv("OP_FINALIZE_DISPATCH_SECRET", "shared-secret");
    vi.stubEnv(
      "OP_GENERATOR_RUNTIME_URL_OVERRIDE",
      "https://generator.example.com",
    );
    fetchMock.mockImplementation(async (request: Request) => {
      if (request.url === "https://generator.example.com/health") {
        return Response.json({
          adminCapId: "0xadmincap",
          network: "testnet",
          packageId:
            "0x9999999999999999999999999999999999999999999999999999999999999999",
          status: "ok",
        });
      }

      return Response.json({ status: "ok" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdminHealth()).resolves.toMatchObject({
      expectedDeployment: EXPECTED_DEPLOYMENT,
      generatorReadiness: {
        packageId:
          "0x9999999999999999999999999999999999999999999999999999999999999999",
        status: "misconfigured",
      },
      resolutionStatus: "misconfigured",
    });
  });
});
