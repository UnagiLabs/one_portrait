import { describe, expect, it, vi } from "vitest";

import type { PreparedFinalizeInput } from "../src";
import { createDefaultFinalizeRunner, createFinalizeRunner } from "../src";

describe("createFinalizeRunner", () => {
  it("absorbs units that are already finalized before any heavy work starts", async () => {
    const readUnitSnapshot = vi.fn(async () => ({
      ...snapshot(),
      status: "finalized" as const,
      masterId: "0xmaster",
    }));
    const prepareInput = vi.fn();

    const runner = createFinalizeRunner({
      readUnitSnapshot,
      prepareInput,
      extractTargetTiles: vi.fn(),
      assignPlacements: vi.fn(),
      composeMosaicPng: vi.fn(),
      putMosaic: vi.fn(),
      finalizeTransaction: vi.fn(),
    });

    await expect(runner.run("0xunit-1")).resolves.toEqual({
      status: "ignored_finalized",
      unitId: "0xunit-1",
    });
    expect(prepareInput).not.toHaveBeenCalled();
  });

  it("runs prepare -> assignment -> compose -> walrus put -> finalize in order", async () => {
    const callOrder: string[] = [];
    const prepared = preparedInput();
    const targetTiles = [
      {
        index: 0,
        x: 0,
        y: 0,
        averageColor: { red: 1, green: 2, blue: 3 },
      },
    ];
    const placements = [
      {
        walrusBlobId: "submission-1",
        submissionNo: 1,
        submitter: "0xsubmitter",
        x: 0,
        y: 0,
        targetColor: { red: 1, green: 2, blue: 3 },
      },
    ];
    const composeMosaicPng = vi.fn(async () => {
      callOrder.push("compose");
      return new Uint8Array([9, 9, 9]);
    });
    const putMosaic = vi.fn(async () => {
      callOrder.push("put");
      return {
        blobId: "mosaic-blob",
        aggregatorUrl: "https://agg/v1/blobs/mosaic-blob",
      };
    });
    const finalizeTransaction = vi.fn(async () => {
      callOrder.push("finalize");
      return { digest: "0xdigest" };
    });

    const runner = createFinalizeRunner({
      readUnitSnapshot: vi.fn(async () => ({
        ...snapshot(),
        status: "filled" as const,
        masterId: null,
      })),
      prepareInput: vi.fn(async () => {
        callOrder.push("prepare");
        return prepared;
      }),
      extractTargetTiles: vi.fn(async () => {
        callOrder.push("targetTiles");
        return targetTiles;
      }),
      assignPlacements: vi.fn(() => {
        callOrder.push("assign");
        return placements;
      }),
      composeMosaicPng,
      putMosaic,
      finalizeTransaction,
    });

    await expect(runner.run("0xunit-1")).resolves.toEqual({
      status: "finalized",
      unitId: "0xunit-1",
      mosaicBlobId: "mosaic-blob",
      digest: "0xdigest",
      placementCount: 1,
    });
    expect(callOrder).toEqual([
      "prepare",
      "targetTiles",
      "assign",
      "compose",
      "put",
      "finalize",
    ]);
    expect(composeMosaicPng).toHaveBeenCalledWith({
      submissions: prepared.submissions,
      placements,
    });
    expect(putMosaic).toHaveBeenCalledWith(new Uint8Array([9, 9, 9]));
    expect(finalizeTransaction).toHaveBeenCalledWith({
      unitId: "0xunit-1",
      mosaicBlobId: "mosaic-blob",
      placements,
    });
  });
});

describe("createDefaultFinalizeRunner", () => {
  it("uses the improved mosaic generator result for walrus put and finalize", async () => {
    const generateFinalizeMosaic = vi.fn(async () => ({
      image: new Uint8Array([7, 8, 9]),
      placements: [
        {
          walrusBlobId: "submission-1",
          submissionNo: 1,
          submitter: "0xsubmitter",
          targetColor: { red: 1, green: 2, blue: 3 },
          x: 0,
          y: 0,
        },
      ],
    }));
    const putBlob = vi.fn(async () => ({
      blobId: "mosaic-blob",
      aggregatorUrl: "https://agg/v1/blobs/mosaic-blob",
    }));
    const finalizeTransaction = vi.fn(async () => ({ digest: "0xdigest" }));

    const runner = createDefaultFinalizeRunner({
      readUnitSnapshot: vi.fn(async () => ({
        ...snapshot(),
        status: "filled" as const,
        masterId: null,
      })),
      walrusRead: {
        getBlob: vi.fn(async (blobId: string) =>
          new TextEncoder().encode(blobId),
        ),
      },
      walrusWrite: {
        putBlob,
      },
      finalizeTransaction,
      sampleAverageColor: vi.fn(() => ({ red: 1, green: 2, blue: 3 })),
      generateFinalizeMosaic,
    });

    await expect(runner.run("0xunit-1")).resolves.toEqual({
      status: "finalized",
      unitId: "0xunit-1",
      mosaicBlobId: "mosaic-blob",
      digest: "0xdigest",
      placementCount: 1,
    });
    expect(generateFinalizeMosaic).toHaveBeenCalledTimes(1);
    expect(putBlob).toHaveBeenCalledWith(new Uint8Array([7, 8, 9]));
    expect(finalizeTransaction).toHaveBeenCalledWith({
      unitId: "0xunit-1",
      mosaicBlobId: "mosaic-blob",
      placements: [
        expect.objectContaining({
          walrusBlobId: "submission-1",
          submissionNo: 1,
        }),
      ],
    });
  });
});

function snapshot() {
  return {
    athleteId: 1,
    displayMaxSlots: 1,
    targetWalrusBlobId: "target-blob",
    unitId: "0xunit-1",
    submissions: [
      {
        submissionNo: 1,
        submitter: "0xsubmitter",
        submittedAtMs: 1_700_000_000_000,
        walrusBlobId: "submission-1",
      },
    ],
  };
}

function preparedInput(): PreparedFinalizeInput {
  return {
    athleteId: 1,
    unitId: "0xunit-1",
    targetWalrusBlobId: "target-blob",
    targetImageBytes: new Uint8Array([1, 2, 3]),
    submissions: [
      {
        submissionNo: 1,
        submitter: "0xsubmitter",
        submittedAtMs: 1_700_000_000_000,
        walrusBlobId: "submission-1",
        averageColor: { red: 10, green: 20, blue: 30 },
        imageBytes: new Uint8Array([4, 5, 6]),
      },
    ],
  };
}
