// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { findKakeraMock } = vi.hoisted(() => ({
  findKakeraMock: vi.fn(),
}));

vi.mock("./kakera", () => ({
  findKakeraForSubmission: findKakeraMock,
}));

import type { KakeraOwnedClient, OwnedKakera } from "./kakera";
import { useOwnedKakera } from "./use-owned-kakera";

const FAKE_CLIENT = {
  getOwnedObjects: vi.fn(),
} as unknown as KakeraOwnedClient;

const PACKAGE_ID = "0xpkg";
const OWNER = "0xowner";
const UNIT_ID = "0xunit-1";
const WALRUS_BLOB_ID = "walrus-blob-xyz";

function makeKakera(): OwnedKakera {
  return {
    objectId: "0xkakera-1",
    unitId: UNIT_ID,
    walrusBlobId: WALRUS_BLOB_ID,
    submissionNo: 42,
    mintedAtMs: 1700000000000,
  };
}

type FakeTimers = {
  readonly schedule: (ms: number, fn: () => void) => number;
  readonly clear: (handle: number) => void;
  readonly advance: () => Promise<void>;
};

function createFakeTimers(): FakeTimers {
  type Scheduled = { readonly handle: number; readonly fn: () => void };
  let queue: Scheduled[] = [];
  let nextHandle = 1;

  return {
    schedule(_ms, fn) {
      const handle = nextHandle;
      nextHandle += 1;
      queue.push({ handle, fn });
      return handle;
    },
    clear(handle) {
      queue = queue.filter((item) => item.handle !== handle);
    },
    advance: async () => {
      const snapshot = queue;
      queue = [];
      for (const item of snapshot) {
        item.fn();
      }
      // Yield so any awaited promises triggered by the timer fire.
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

afterEach(() => {
  findKakeraMock.mockReset();
});

describe("useOwnedKakera", () => {
  it("starts in 'searching' and transitions to 'found' when the Kakera is discovered on the second poll", async () => {
    const timers = createFakeTimers();
    const kakera = makeKakera();

    findKakeraMock.mockResolvedValueOnce(null).mockResolvedValueOnce(kakera);

    const { result } = renderHook(() =>
      useOwnedKakera({
        suiClient: FAKE_CLIENT,
        ownerAddress: OWNER,
        unitId: UNIT_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        packageId: PACKAGE_ID,
        intervalMs: 1_500,
        maxAttempts: 20,
        scheduleTimeout: timers.schedule,
        clearTimeout: timers.clear,
      }),
    );

    // First poll is kicked off synchronously. Wait for it to settle.
    await waitFor(() => {
      expect(findKakeraMock).toHaveBeenCalledTimes(1);
    });
    expect(result.current.status).toBe("searching");
    expect(result.current.kakera).toBeNull();

    // Fire the scheduled retry.
    await act(async () => {
      await timers.advance();
    });

    await waitFor(() => {
      expect(findKakeraMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.status).toBe("found");
    });
    expect(result.current.kakera).toEqual(kakera);
  });

  it("stops polling once a Kakera is found", async () => {
    const timers = createFakeTimers();
    const kakera = makeKakera();

    findKakeraMock.mockResolvedValue(kakera);

    renderHook(() =>
      useOwnedKakera({
        suiClient: FAKE_CLIENT,
        ownerAddress: OWNER,
        unitId: UNIT_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        packageId: PACKAGE_ID,
        intervalMs: 1_500,
        maxAttempts: 20,
        scheduleTimeout: timers.schedule,
        clearTimeout: timers.clear,
      }),
    );

    await waitFor(() => {
      expect(findKakeraMock).toHaveBeenCalledTimes(1);
    });

    // Advancing timers a few times should not trigger additional lookups.
    await act(async () => {
      await timers.advance();
      await timers.advance();
      await timers.advance();
    });

    expect(findKakeraMock).toHaveBeenCalledTimes(1);
  });

  it("transitions to 'timeout' after the configured maximum attempts", async () => {
    const timers = createFakeTimers();
    findKakeraMock.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useOwnedKakera({
        suiClient: FAKE_CLIENT,
        ownerAddress: OWNER,
        unitId: UNIT_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        packageId: PACKAGE_ID,
        intervalMs: 1_500,
        maxAttempts: 3,
        scheduleTimeout: timers.schedule,
        clearTimeout: timers.clear,
      }),
    );

    // Attempt 1 (synchronous kick-off).
    await waitFor(() => {
      expect(findKakeraMock).toHaveBeenCalledTimes(1);
    });

    // Attempt 2.
    await act(async () => {
      await timers.advance();
    });
    await waitFor(() => {
      expect(findKakeraMock).toHaveBeenCalledTimes(2);
    });

    // Attempt 3 (final).
    await act(async () => {
      await timers.advance();
    });
    await waitFor(() => {
      expect(findKakeraMock).toHaveBeenCalledTimes(3);
    });

    await waitFor(() => {
      expect(result.current.status).toBe("timeout");
    });

    // No further polls after timeout.
    await act(async () => {
      await timers.advance();
      await timers.advance();
    });
    expect(findKakeraMock).toHaveBeenCalledTimes(3);
  });

  it("stays idle when ownerAddress is missing", async () => {
    const timers = createFakeTimers();

    const { result } = renderHook(() =>
      useOwnedKakera({
        suiClient: FAKE_CLIENT,
        ownerAddress: null,
        unitId: UNIT_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        packageId: PACKAGE_ID,
        intervalMs: 1_500,
        maxAttempts: 3,
        scheduleTimeout: timers.schedule,
        clearTimeout: timers.clear,
      }),
    );

    expect(result.current.status).toBe("idle");
    expect(findKakeraMock).not.toHaveBeenCalled();
  });
});
