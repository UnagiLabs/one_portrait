import { describe, expect, it, vi } from "vitest";

vi.mock("@cloudflare/containers", () => ({
  getContainer: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

import { FinalizeApiError } from "./api";
import { createFinalizeDispatcher } from "./dispatch";

const VALID_UNIT_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

describe("createFinalizeDispatcher", () => {
  it("throws when the container binding is missing", async () => {
    const dispatchFinalize = createFinalizeDispatcher({
      getContext: (() => ({ env: {} })) as typeof import("@opennextjs/cloudflare").getCloudflareContext,
      getNamedContainer: vi.fn() as typeof import("@cloudflare/containers").getContainer,
    });

    await expect(
      dispatchFinalize({
        unitId: VALID_UNIT_ID,
      }),
    ).rejects.toBeInstanceOf(FinalizeApiError);
  });

  it("dispatches to the named container for the matching unit id", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        accepted: true,
        state: "running",
        unitId: VALID_UNIT_ID,
      }),
    );
    const getNamedContainer = vi.fn(() => ({ fetch }));
    const dispatchFinalize = createFinalizeDispatcher({
      getContext: ((() => ({
        env: {
          MOSAIC_GENERATOR: { stub: true },
        },
      })) as unknown) as typeof import("@opennextjs/cloudflare").getCloudflareContext,
      getNamedContainer: getNamedContainer as typeof import("@cloudflare/containers").getContainer,
    });

    await expect(
      dispatchFinalize({
        unitId: VALID_UNIT_ID,
      }),
    ).resolves.toEqual({
      accepted: true,
      state: "running",
      unitId: VALID_UNIT_ID,
    });

    expect(getNamedContainer).toHaveBeenCalledWith(
      { stub: true },
      VALID_UNIT_ID,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = (fetch.mock.calls[0] as unknown as [Request])[0];
    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://mosaic-generator.internal/dispatch");
    await expect(request.json()).resolves.toEqual({
      unitId: VALID_UNIT_ID,
    });
  });
});
