import { describe, expect, it } from "vitest";

import type { PreparedSubmission } from "../src";
import { assignGreedyPlacements } from "../src";

describe("assignGreedyPlacements", () => {
  it("uses each submission exactly once and returns placements in tile order", () => {
    const placements = assignGreedyPlacements({
      submissions: [
        submission({
          submissionNo: 3,
          walrusBlobId: "blob-blue",
          averageColor: rgb(10, 10, 250),
        }),
        submission({
          submissionNo: 2,
          walrusBlobId: "blob-green",
          averageColor: rgb(10, 250, 10),
        }),
        submission({
          submissionNo: 1,
          walrusBlobId: "blob-red",
          averageColor: rgb(250, 10, 10),
        }),
      ],
      targetTiles: [
        tile(0, 0, rgb(245, 10, 10)),
        tile(1, 0, rgb(10, 245, 10)),
        tile(0, 1, rgb(10, 10, 245)),
      ],
    });

    expect(placements).toEqual([
      placement("blob-red", 1, 0, 0, rgb(245, 10, 10)),
      placement("blob-green", 2, 1, 0, rgb(10, 245, 10)),
      placement("blob-blue", 3, 0, 1, rgb(10, 10, 245)),
    ]);
  });

  it("breaks equal-distance ties by submissionNo", () => {
    const placements = assignGreedyPlacements({
      submissions: [
        submission({
          submissionNo: 2,
          walrusBlobId: "blob-b",
          averageColor: rgb(0, 0, 0),
        }),
        submission({
          submissionNo: 1,
          walrusBlobId: "blob-a",
          averageColor: rgb(0, 0, 0),
        }),
      ],
      targetTiles: [tile(0, 0, rgb(0, 0, 0)), tile(1, 0, rgb(255, 255, 255))],
    });

    expect(placements[0]).toMatchObject({
      walrusBlobId: "blob-a",
      submissionNo: 1,
      x: 0,
      y: 0,
    });
  });

  it("breaks remaining exact ties by walrusBlobId", () => {
    const placements = assignGreedyPlacements({
      submissions: [
        submission({
          submissionNo: 1,
          walrusBlobId: "blob-b",
          averageColor: rgb(0, 0, 0),
        }),
        submission({
          submissionNo: 1,
          walrusBlobId: "blob-a",
          averageColor: rgb(0, 0, 0),
        }),
        submission({
          submissionNo: 2,
          walrusBlobId: "blob-c",
          averageColor: rgb(255, 255, 255),
        }),
      ],
      targetTiles: [
        tile(0, 0, rgb(0, 0, 0)),
        tile(1, 0, rgb(0, 0, 0)),
        tile(2, 0, rgb(255, 255, 255)),
      ],
    });

    expect(placements[0]).toMatchObject({
      walrusBlobId: "blob-a",
      submissionNo: 1,
      x: 0,
      y: 0,
    });
  });
});

function submission(
  overrides: Partial<PreparedSubmission> = {},
): PreparedSubmission {
  return {
    submissionNo: overrides.submissionNo ?? 1,
    submitter: overrides.submitter ?? "0xsubmitter",
    submittedAtMs: overrides.submittedAtMs ?? 1_700_000_000_000,
    walrusBlobId: overrides.walrusBlobId ?? "blob-id",
    averageColor: overrides.averageColor ?? rgb(0, 0, 0),
    imageBytes: overrides.imageBytes ?? new Uint8Array([1, 2, 3]),
  };
}

function tile(x: number, y: number, averageColor: ReturnType<typeof rgb>) {
  return {
    index: y * 10 + x,
    x,
    y,
    averageColor,
  };
}

function placement(
  walrusBlobId: string,
  submissionNo: number,
  x: number,
  y: number,
  targetColor: ReturnType<typeof rgb>,
) {
  return {
    walrusBlobId,
    submissionNo,
    submitter: "0xsubmitter",
    x,
    y,
    targetColor,
  };
}

function rgb(red: number, green: number, blue: number) {
  return { red, green, blue };
}
