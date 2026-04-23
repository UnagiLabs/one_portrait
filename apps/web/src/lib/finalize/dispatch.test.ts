import { describe, expect, it, vi } from "vitest";

import { createFinalizeDispatcher, DISPATCH_SECRET_HEADER } from "./dispatch";

const VALID_UNIT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

describe("createFinalizeDispatcher", () => {
  it("dispatches to the external generator when runtime resolution succeeds", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        status: "finalized",
        unitId: VALID_UNIT_ID,
        mosaicBlobId: "mosaic-blob",
        digest: "0xdigest",
        placementCount: 980,
      }),
    );
    const dispatchFinalize = createFinalizeDispatcher({
      fetchImpl,
      dispatchSecret: "  shared-secret  ",
      resolveRuntime: () => ({
        source: "runtime_state",
        status: "ok",
        url: "http://127.0.0.1:8080/",
      }),
    });

    await expect(
      dispatchFinalize({
        unitId: VALID_UNIT_ID,
      }),
    ).resolves.toEqual({
      status: "finalized",
      unitId: VALID_UNIT_ID,
      mosaicBlobId: "mosaic-blob",
      digest: "0xdigest",
      placementCount: 980,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const request = (fetchImpl.mock.calls[0] as unknown as [Request])[0];
    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://127.0.0.1:8080/dispatch");
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(request.headers.get(DISPATCH_SECRET_HEADER)).toBe("shared-secret");
    await expect(request.json()).resolves.toEqual({
      unitId: VALID_UNIT_ID,
    });
  });

  it("resolves the target URL on each call", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        status: "ignored_pending",
        unitId: VALID_UNIT_ID,
      }),
    );
    const resolveRuntime = vi
      .fn<() => { source: "runtime_state"; status: "ok"; url: string }>()
      .mockReturnValueOnce({
        source: "runtime_state",
        status: "ok",
        url: "https://generator-a.example.com",
      })
      .mockReturnValueOnce({
        source: "runtime_state",
        status: "ok",
        url: "https://generator-b.example.com",
      });
    const dispatchFinalize = createFinalizeDispatcher({
      fetchImpl,
      dispatchSecret: "shared-secret",
      resolveRuntime,
    });

    await dispatchFinalize({ unitId: VALID_UNIT_ID });
    await dispatchFinalize({ unitId: VALID_UNIT_ID });

    const firstRequest = (fetchImpl.mock.calls[0] as unknown as [Request])[0];
    const secondRequest = (fetchImpl.mock.calls[1] as unknown as [Request])[0];
    expect(resolveRuntime).toHaveBeenCalledTimes(2);
    expect(firstRequest.url).toBe("https://generator-a.example.com/dispatch");
    expect(secondRequest.url).toBe("https://generator-b.example.com/dispatch");
  });

  it("throws when runtime resolution is misconfigured", async () => {
    const dispatchFinalize = createFinalizeDispatcher({
      fetchImpl: vi.fn(),
      dispatchSecret: "shared-secret",
      resolveRuntime: () => ({
        message: "generator runtime is misconfigured",
        source: "none",
        status: "misconfigured",
        url: null,
      }),
    });

    await expect(
      dispatchFinalize({
        unitId: VALID_UNIT_ID,
      }),
    ).rejects.toMatchObject({
      name: "FinalizeApiError",
      message: expect.stringContaining("misconfigured"),
    });
  });

  it("throws when OP_FINALIZE_DISPATCH_SECRET is missing", async () => {
    const dispatchFinalize = createFinalizeDispatcher({
      fetchImpl: vi.fn(),
      dispatchSecret: "   ",
      resolveRuntime: () => ({
        source: "runtime_state",
        status: "ok",
        url: "https://generator.example",
      }),
    });

    await expect(
      dispatchFinalize({
        unitId: VALID_UNIT_ID,
      }),
    ).rejects.toMatchObject({
      name: "FinalizeApiError",
      message: expect.stringContaining("OP_FINALIZE_DISPATCH_SECRET"),
    });
  });

  it("uses request-scoped worker kv and secret when provided", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        status: "ignored_pending",
        unitId: VALID_UNIT_ID,
      }),
    );
    const dispatchFinalize = createFinalizeDispatcher({
      fetchImpl,
      dispatchSecret: "shared-secret-from-process-env",
    });

    await expect(
      dispatchFinalize(
        {
          unitId: VALID_UNIT_ID,
        },
        {
          env: {
            OP_FINALIZE_DISPATCH_SECRET: "request-scoped-secret",
            OP_GENERATOR_RUNTIME_KV: {
              get: async () => ({
                mode: "quick",
                updatedAt: new Date().toISOString(),
                url: "https://worker-kv.example.com",
                version: 1,
              }),
            },
          },
        },
      ),
    ).resolves.toEqual({
      status: "ignored_pending",
      unitId: VALID_UNIT_ID,
    });

    const request = (fetchImpl.mock.calls[0] as unknown as [Request])[0];
    expect(request.url).toBe("https://worker-kv.example.com/dispatch");
    expect(request.headers.get(DISPATCH_SECRET_HEADER)).toBe(
      "request-scoped-secret",
    );
  });
});
