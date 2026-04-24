import { afterEach, describe, expect, it, vi } from "vitest";

const { getAdminHealthMock, getRequestCloudflareEnvMock } = vi.hoisted(() => ({
  getAdminHealthMock: vi.fn(),
  getRequestCloudflareEnvMock: vi.fn(),
}));

vi.mock("../../../../lib/admin/health", () => ({
  getAdminHealth: getAdminHealthMock,
}));

vi.mock("../../../../lib/cloudflare-context", () => ({
  getRequestCloudflareEnv: getRequestCloudflareEnvMock,
}));

import { GET } from "./route";

describe("GET /api/admin/health", () => {
  afterEach(() => {
    getAdminHealthMock.mockReset();
    getRequestCloudflareEnvMock.mockReset();
  });

  it("returns readiness, dispatch probe, and runtime source data", async () => {
    getRequestCloudflareEnvMock.mockReturnValue({
      OP_GENERATOR_RUNTIME_KV: {
        get: vi.fn(),
      },
    });
    getAdminHealthMock.mockResolvedValue({
      currentUrl: "https://generator.example.com",
      dispatchAuthorization: {
        httpStatus: 200,
        status: "ok",
      },
      expectedDeployment: {
        network: "testnet",
        packageId: "0xpkg",
      },
      generatorReadiness: {
        httpStatus: 200,
        status: "ok",
      },
      resolutionStatus: "ok",
      source: "runtime_state",
    });

    const response = await GET();

    expect(getAdminHealthMock).toHaveBeenCalledWith({
      env: {
        OP_GENERATOR_RUNTIME_KV: {
          get: expect.any(Function),
        },
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      currentUrl: "https://generator.example.com",
      dispatchAuthorization: {
        httpStatus: 200,
        status: "ok",
      },
      expectedDeployment: {
        network: "testnet",
        packageId: "0xpkg",
      },
      generatorReadiness: {
        httpStatus: 200,
        status: "ok",
      },
      resolutionStatus: "ok",
      source: "runtime_state",
    });
  });

  it("surfaces a misconfigured runtime payload", async () => {
    getRequestCloudflareEnvMock.mockReturnValue(null);
    getAdminHealthMock.mockResolvedValue({
      currentUrl: null,
      dispatchAuthorization: {
        httpStatus: null,
        status: "misconfigured",
      },
      expectedDeployment: {
        network: "testnet",
        packageId: "0xpkg",
      },
      generatorReadiness: {
        httpStatus: null,
        status: "misconfigured",
      },
      resolutionStatus: "misconfigured",
      source: "none",
    });

    const response = await GET();

    expect(getAdminHealthMock).toHaveBeenCalledWith({
      env: undefined,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dispatchAuthorization: {
        httpStatus: null,
        status: "misconfigured",
      },
      expectedDeployment: {
        network: "testnet",
        packageId: "0xpkg",
      },
      generatorReadiness: {
        httpStatus: null,
        status: "misconfigured",
      },
      currentUrl: null,
      resolutionStatus: "misconfigured",
      source: "none",
    });
  });
});
