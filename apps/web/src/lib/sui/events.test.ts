import { unitTileCount } from "@one-portrait/shared";
import { describe, expect, it, vi } from "vitest";

import type { SuiSubscriptionClient } from "./client";
import { subscribeToUnitEvents } from "./events";

const PACKAGE_ID = "0xpkg";
const UNIT_ID = "0xunit-1";
const OTHER_UNIT_ID = "0xunit-2";

type QueryEventsArgs = Parameters<SuiSubscriptionClient["queryEvents"]>[0];

function makeSuiEvent(opts: {
  type: string;
  parsedJson: Record<string, unknown>;
  txDigest?: string;
  eventSeq?: string;
}) {
  return {
    id: { txDigest: opts.txDigest ?? "tx", eventSeq: opts.eventSeq ?? "0" },
    packageId: PACKAGE_ID,
    transactionModule: "events",
    sender: "0xsender",
    type: opts.type,
    parsedJson: opts.parsedJson,
    bcs: "",
    bcsEncoding: "base64" as const,
    timestampMs: "0",
  };
}

function submittedSuiEvent(unitId: string, submissionNo = "1") {
  return makeSuiEvent({
    type: `${PACKAGE_ID}::events::SubmittedEvent`,
    parsedJson: {
      unit_id: unitId,
      submitter: "0xsender",
      walrus_blob_id: [1, 2, 3],
      submission_no: submissionNo,
      submitted_count: submissionNo,
      max_slots: String(unitTileCount),
    },
    eventSeq: submissionNo,
  });
}

function unitFilledSuiEvent(unitId: string) {
  return makeSuiEvent({
    type: `${PACKAGE_ID}::events::UnitFilledEvent`,
    parsedJson: {
      unit_id: unitId,
      filled_count: String(unitTileCount),
      max_slots: String(unitTileCount),
    },
  });
}

function mosaicReadySuiEvent(unitId: string) {
  return makeSuiEvent({
    type: `${PACKAGE_ID}::events::MosaicReadyEvent`,
    parsedJson: {
      unit_id: unitId,
      master_id: "0xmaster",
      mosaic_walrus_blob_id: [9, 8, 7],
    },
  });
}

function makeClient(
  pages: ReadonlyArray<{
    data: unknown[];
    nextCursor?: { txDigest: string; eventSeq: string } | null;
    hasNextPage?: boolean;
  }>,
): {
  client: SuiSubscriptionClient;
  queryEvents: ReturnType<typeof vi.fn>;
} {
  let call = 0;
  const queryEvents = vi.fn(async (_args: QueryEventsArgs) => {
    const page = pages[Math.min(call, pages.length - 1)];
    call += 1;
    return {
      data: page.data,
      nextCursor: page.nextCursor ?? null,
      hasNextPage: page.hasNextPage ?? false,
    } as Awaited<ReturnType<SuiSubscriptionClient["queryEvents"]>>;
  });

  const client = {
    network: "testnet",
    queryEvents,
  } as unknown as SuiSubscriptionClient;

  return { client, queryEvents };
}

describe("subscribeToUnitEvents", () => {
  it("queries events with the events MoveEventModule filter for the given package", async () => {
    const { client, queryEvents } = makeClient([
      { data: [], nextCursor: null, hasNextPage: false },
    ]);

    const unsubscribe = subscribeToUnitEvents({
      packageId: PACKAGE_ID,
      unitId: UNIT_ID,
      handlers: {},
      client,
      intervalMs: 1_000_000,
    });

    // Wait one microtask cycle so the initial poll runs.
    await Promise.resolve();
    await Promise.resolve();

    expect(queryEvents).toHaveBeenCalled();
    const args = queryEvents.mock.calls[0]?.[0] as QueryEventsArgs;
    expect(args.query).toEqual({
      MoveEventModule: { module: "events", package: PACKAGE_ID },
    });

    unsubscribe();
  });

  it("dispatches Submitted/Filled/MosaicReady handlers for matching unit id", async () => {
    const { client } = makeClient([
      {
        data: [
          submittedSuiEvent(UNIT_ID, "1"),
          unitFilledSuiEvent(UNIT_ID),
          mosaicReadySuiEvent(UNIT_ID),
        ],
        nextCursor: { txDigest: "tx", eventSeq: "2" },
        hasNextPage: false,
      },
      { data: [], nextCursor: null, hasNextPage: false },
    ]);

    const onSubmitted = vi.fn();
    const onFilled = vi.fn();
    const onMosaicReady = vi.fn();

    const unsubscribe = subscribeToUnitEvents({
      packageId: PACKAGE_ID,
      unitId: UNIT_ID,
      handlers: { onSubmitted, onFilled, onMosaicReady },
      client,
      intervalMs: 1_000_000,
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(onSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "submitted", unitId: UNIT_ID }),
    );
    expect(onFilled).toHaveBeenCalledTimes(1);
    expect(onFilled).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "filled", unitId: UNIT_ID }),
    );
    expect(onMosaicReady).toHaveBeenCalledTimes(1);
    expect(onMosaicReady).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "mosaicReady", unitId: UNIT_ID }),
    );

    unsubscribe();
  });

  it("filters out events whose unit_id does not match", async () => {
    const { client } = makeClient([
      {
        data: [
          submittedSuiEvent(OTHER_UNIT_ID, "1"),
          submittedSuiEvent(UNIT_ID, "2"),
        ],
        nextCursor: null,
        hasNextPage: false,
      },
    ]);

    const onSubmitted = vi.fn();

    const unsubscribe = subscribeToUnitEvents({
      packageId: PACKAGE_ID,
      unitId: UNIT_ID,
      handlers: { onSubmitted },
      client,
      intervalMs: 1_000_000,
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(onSubmitted.mock.calls[0]?.[0]).toMatchObject({
      kind: "submitted",
      unitId: UNIT_ID,
    });

    unsubscribe();
  });

  it("calls onError when queryEvents throws and keeps the subscription alive", async () => {
    const failure = new Error("rpc blip");
    const queryEvents = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue({
        data: [],
        nextCursor: null,
        hasNextPage: false,
      });
    const client = {
      network: "testnet",
      queryEvents,
    } as unknown as SuiSubscriptionClient;

    const onError = vi.fn();

    const unsubscribe = subscribeToUnitEvents({
      packageId: PACKAGE_ID,
      unitId: UNIT_ID,
      handlers: {},
      client,
      intervalMs: 1_000_000,
      onError,
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);

    unsubscribe();
  });

  it("breaks out of a page loop when the fullnode fails to advance the cursor", async () => {
    // Simulate a misbehaving fullnode: hasNextPage=true but nextCursor is
    // identical across pages. Without a guard the helper would spin forever.
    const stuckPage = {
      data: [],
      nextCursor: { txDigest: "tx", eventSeq: "1" },
      hasNextPage: true,
    };
    const queryEvents = vi.fn().mockResolvedValue(stuckPage);
    const client = {
      network: "testnet",
      queryEvents,
    } as unknown as SuiSubscriptionClient;

    const unsubscribe = subscribeToUnitEvents({
      packageId: PACKAGE_ID,
      unitId: UNIT_ID,
      handlers: {},
      client,
      intervalMs: 1_000_000,
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Two calls max: first one consumes the page, second would loop forever
    // without the guard. We allow up to 3 to account for the initial poll.
    expect(queryEvents.mock.calls.length).toBeLessThanOrEqual(3);

    unsubscribe();
  });

  it("returns an unsubscribe function that prevents further polling", async () => {
    vi.useFakeTimers();
    try {
      const { client, queryEvents } = makeClient([
        { data: [], nextCursor: null, hasNextPage: false },
        { data: [], nextCursor: null, hasNextPage: false },
      ]);

      const unsubscribe = subscribeToUnitEvents({
        packageId: PACKAGE_ID,
        unitId: UNIT_ID,
        handlers: {},
        client,
        intervalMs: 1000,
      });

      // initial poll runs synchronously (via microtask)
      await Promise.resolve();
      await Promise.resolve();

      const initialCallCount = queryEvents.mock.calls.length;
      unsubscribe();

      // Advance well beyond the interval; no further polls should occur.
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();

      expect(queryEvents.mock.calls.length).toBe(initialCallCount);
    } finally {
      vi.useRealTimers();
    }
  });
});
