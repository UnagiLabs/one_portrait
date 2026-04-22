import { describe, expect, it, vi } from "vitest";

import { createFinalizeDispatcher, DISPATCH_SECRET_HEADER } from "./dispatch";

const VALID_UNIT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

describe("createFinalizeDispatcher", () => {
  it("dispatches to the external generator when env is set", async () => {
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
      dispatchBaseUrl: "http://127.0.0.1:8080/",
      dispatchSecret: "  shared-secret  ",
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

  it("throws when OP_FINALIZE_DISPATCH_URL is missing", async () => {
    const dispatchFinalize = createFinalizeDispatcher({
      fetchImpl: vi.fn(),
      dispatchBaseUrl: undefined,
      dispatchSecret: "shared-secret",
    });

    await expect(
      dispatchFinalize({
        unitId: VALID_UNIT_ID,
      }),
    ).rejects.toMatchObject({
      name: "FinalizeApiError",
      message: expect.stringContaining("OP_FINALIZE_DISPATCH_URL"),
    });
  });

  it("throws when OP_FINALIZE_DISPATCH_SECRET is missing", async () => {
    const dispatchFinalize = createFinalizeDispatcher({
      fetchImpl: vi.fn(),
      dispatchBaseUrl: "https://generator.example",
      dispatchSecret: "   ",
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
});
