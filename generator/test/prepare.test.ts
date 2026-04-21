import type { GeneratorUnitSnapshot } from "@one-portrait/shared";
import { describe, expect, it, vi } from "vitest";

import { prepareFinalizeInput, sortSubmissions } from "../src";

describe("sortSubmissions", () => {
  it("sorts by submission_no and uses walrus_blob_id as a stable tie-breaker", () => {
    expect(
      sortSubmissions([
        submission({
          submissionNo: 2,
          walrusBlobId: "z-blob",
        }),
        submission({
          submissionNo: 1,
          walrusBlobId: "b-blob",
        }),
        submission({
          submissionNo: 1,
          walrusBlobId: "a-blob",
        }),
      ]),
    ).toEqual([
      submission({
        submissionNo: 1,
        walrusBlobId: "a-blob",
      }),
      submission({
        submissionNo: 1,
        walrusBlobId: "b-blob",
      }),
      submission({
        submissionNo: 2,
        walrusBlobId: "z-blob",
      }),
    ]);
  });
});

describe("prepareFinalizeInput", () => {
  it("loads the target blob and re-calculates submission colors in deterministic order", async () => {
    const getBlob = vi.fn(async (blobId: string) => encode(blobId));
    const sampleAverageColor = vi.fn((imageBytes: Uint8Array) => ({
      red: imageBytes[0] ?? 0,
      green: imageBytes[1] ?? 0,
      blue: imageBytes[2] ?? 0,
    }));

    const prepared = await prepareFinalizeInput(snapshot(), {
      sampleAverageColor,
      walrus: { getBlob },
    });

    expect(getBlob.mock.calls.map(([blobId]) => blobId)).toEqual([
      "target-blob",
      "submission-a",
      "submission-b",
    ]);
    expect(prepared.targetWalrusBlobId).toBe("target-blob");
    expect(prepared.submissions.map((entry) => entry.walrusBlobId)).toEqual([
      "submission-a",
      "submission-b",
    ]);
    expect(sampleAverageColor).toHaveBeenCalledTimes(2);
    expect(prepared.submissions[0]?.averageColor).toEqual({
      red: "s".charCodeAt(0),
      green: "u".charCodeAt(0),
      blue: "b".charCodeAt(0),
    });
  });
});

function snapshot(): GeneratorUnitSnapshot {
  return {
    athleteId: 1,
    targetWalrusBlobId: "target-blob",
    unitId: "0xunit-1",
    submissions: [
      submission({
        submissionNo: 2,
        walrusBlobId: "submission-b",
      }),
      submission({
        submissionNo: 1,
        walrusBlobId: "submission-a",
      }),
    ],
  };
}

function submission(
  overrides: Partial<GeneratorUnitSnapshot["submissions"][number]> = {},
) {
  return {
    submissionNo: overrides.submissionNo ?? 1,
    submitter: overrides.submitter ?? "0xsubmitter",
    submittedAtMs: overrides.submittedAtMs ?? 1_700_000_000_000,
    walrusBlobId: overrides.walrusBlobId ?? "blob-id",
  };
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
