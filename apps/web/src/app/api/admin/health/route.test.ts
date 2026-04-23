import { afterEach, describe, expect, it, vi } from "vitest";

const { loadAdminRelayEnvMock } = vi.hoisted(() => ({
  loadAdminRelayEnvMock: vi.fn(),
}));

vi.mock("../../../../lib/admin/env", () => ({
  loadAdminRelayEnv: loadAdminRelayEnvMock,
}));

import { GET } from "./route";

describe("GET /api/admin/health", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    loadAdminRelayEnvMock.mockReset();
  });

  it("returns readiness and dispatch probe states separately", async () => {
    loadAdminRelayEnvMock.mockReturnValue({
      generatorBaseUrl: "https://generator.example.com",
      sharedSecret: "shared-secret",
    });
    fetchMock.mockImplementation(async (request: Request) => {
      if (request.url === "https://generator.example.com/health") {
        return new Response("ok", { status: 200 });
      }

      if (request.url === "https://generator.example.com/dispatch-auth-probe") {
        expect(request.headers.get("x-op-finalize-dispatch-secret")).toBe(
          "shared-secret",
        );
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }

      throw new Error(`Unexpected URL: ${request.url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dispatchAuthorization: {
        httpStatus: 200,
        status: "ok",
      },
      generatorReadiness: {
        httpStatus: 200,
        status: "ok",
      },
    });
  });

  it("surfaces a dispatch authorization failure without hiding readiness", async () => {
    loadAdminRelayEnvMock.mockReturnValue({
      generatorBaseUrl: "https://generator.example.com",
      sharedSecret: "shared-secret",
    });
    fetchMock.mockImplementation(async (request: Request) => {
      if (request.url === "https://generator.example.com/health") {
        return new Response("ok", { status: 200 });
      }

      return new Response(
        JSON.stringify({
          error: "unauthorized",
          message: "Dispatch secret is invalid.",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 401,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dispatchAuthorization: {
        httpStatus: 401,
        status: "unauthorized",
      },
      generatorReadiness: {
        httpStatus: 200,
        status: "ok",
      },
    });
  });
});
