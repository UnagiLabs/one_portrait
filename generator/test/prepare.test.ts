import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    expect(prepared.finalizeWalrusBlobIds).toEqual([
      "submission-a",
      "submission-b",
    ]);
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

  it("mixes local mock tiles into demo finalize input while keeping finalize placements scoped to actual submissions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "one-portrait-demo-finalize-"));
    const manifestPath = join(dir, "manifest.json");

    try {
      await writeFile(join(dir, "mock-a.png"), encode("mock-a"));
      await writeFile(join(dir, "mock-b.png"), encode("mock-b"));
      await writeFile(
        manifestPath,
        JSON.stringify({
          entries: [
            { imageKey: "mock-b", filePath: "./mock-b.png" },
            { imageKey: "mock-a", filePath: "./mock-a.png" },
          ],
        }),
        "utf8",
      );

      const getBlob = vi.fn(async (blobId: string) => encode(blobId));
      const sampleAverageColor = vi.fn((imageBytes: Uint8Array) => ({
        red: imageBytes[0] ?? 0,
        green: imageBytes[1] ?? 0,
        blue: imageBytes[2] ?? 0,
      }));

      const prepared = await prepareFinalizeInput(
        snapshot({
          displayMaxSlots: 4,
          maxSlots: 2,
        }),
        {
          demoFinalizeManifestPath: manifestPath,
          readDemoFile: readFile,
          sampleAverageColor,
          walrus: { getBlob },
        },
      );

      expect(prepared.finalizeWalrusBlobIds).toEqual([
        "submission-a",
        "submission-b",
      ]);
      expect(prepared.submissions.map((entry) => entry.walrusBlobId)).toEqual([
        "demo-mock:mock-a",
        "demo-mock:mock-b",
        "submission-a",
        "submission-b",
      ]);
      expect(getBlob.mock.calls.map(([blobId]) => blobId)).toEqual([
        "target-blob",
        "submission-a",
        "submission-b",
      ]);
      expect(sampleAverageColor).toHaveBeenCalledTimes(4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails demo finalize explicitly when the manifest env is missing", async () => {
    await expect(
      prepareFinalizeInput(
        snapshot({
          displayMaxSlots: 4,
          maxSlots: 2,
        }),
        {
          sampleAverageColor: vi.fn(() => ({ red: 1, green: 2, blue: 3 })),
          walrus: {
            getBlob: vi.fn(async (blobId: string) => encode(blobId)),
          },
        },
      ),
    ).rejects.toThrow(/OP_DEMO_FINALIZE_MANIFEST/);
  });
});

function snapshot(
  overrides: Partial<GeneratorUnitSnapshot> = {},
): GeneratorUnitSnapshot {
  return {
    athleteId: overrides.athleteId ?? 1,
    displayMaxSlots: overrides.displayMaxSlots ?? 2,
    maxSlots: overrides.maxSlots ?? 2,
    targetWalrusBlobId: overrides.targetWalrusBlobId ?? "target-blob",
    unitId: overrides.unitId ?? "0xunit-1",
    submissions: overrides.submissions ?? [
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
