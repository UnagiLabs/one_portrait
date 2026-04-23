import { afterEach, describe, expect, it, vi } from "vitest";

import { getAdminHealth } from "./health";

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
        return new Response("ok", { status: 200 });
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
      generatorReadiness: {
        httpStatus: 200,
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
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdminHealth()).resolves.toEqual({
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the current url from worker kv when request env is provided", async () => {
    fetchMock.mockImplementation(async (request: Request) => {
      if (request.url === "https://worker-kv.example.com/health") {
        return new Response("ok", { status: 200 });
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
      generatorReadiness: {
        httpStatus: 200,
        status: "ok",
      },
      resolutionStatus: "ok",
      source: "worker_kv",
    });
  });
});
