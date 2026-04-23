import { afterEach, describe, expect, it, vi } from "vitest";

const { getAdminHealthMock } = vi.hoisted(() => ({
  getAdminHealthMock: vi.fn(),
}));

vi.mock("../../../../lib/admin/health", () => ({
  getAdminHealth: getAdminHealthMock,
}));

import { GET } from "./route";

describe("GET /api/admin/health", () => {
  afterEach(() => {
    getAdminHealthMock.mockReset();
  });

  it("returns readiness, dispatch probe, and runtime source data", async () => {
    getAdminHealthMock.mockResolvedValue({
      currentUrl: "https://generator.example.com",
      dispatchAuthorization: {
        httpStatus: 200,
        status: "ok",
      },
      generatorReadiness: {
        httpStatus: 200,
        status: "ok",
      },
      resolutionStatus: "ok",
      source: "runtime_state",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      currentUrl: "https://generator.example.com",
      dispatchAuthorization: {
        httpStatus: 200,
        status: "ok",
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
    getAdminHealthMock.mockResolvedValue({
      currentUrl: null,
      dispatchAuthorization: {
        httpStatus: null,
        status: "misconfigured",
      },
      generatorReadiness: {
        httpStatus: null,
        status: "misconfigured",
      },
      resolutionStatus: "misconfigured",
      source: "none",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dispatchAuthorization: {
        httpStatus: null,
        status: "misconfigured",
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
