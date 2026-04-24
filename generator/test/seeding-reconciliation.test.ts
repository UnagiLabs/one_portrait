import { describe, expect, it, vi } from "vitest";

import {
  type GeneratorSeedingSnapshot,
  reconcileSeedingLedger,
  type SeedingLedger,
  type SeedingLedgerRow,
} from "../src";

describe("reconcileSeedingLedger", () => {
  it("prefers on-chain submission matches and fills submissionNo", async () => {
    const ledger = makeLedger([
      row({
        imageKey: "tiles/unit-1-row-1.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        txDigest: "0xdigest-1",
        status: "uploaded",
      }),
    ]);
    const checkDigestStatus = vi.fn(
      async (_txDigest: string) => "unknown" as const,
    );

    const result = await reconcileSeedingLedger({
      ledger,
      snapshot: snapshot({
        submissions: [
          submission({
            submissionNo: 17,
            submitter: "0xsender-1",
            walrusBlobId: "blob-1",
          }),
        ],
      }),
      checkDigestStatus,
    });

    expect(result.rows[0]).toEqual(
      row({
        imageKey: "tiles/unit-1-row-1.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        txDigest: "0xdigest-1",
        submissionNo: 17,
        status: "submitted",
      }),
    );
    expect(result.summary).toEqual({
      submitted: 1,
      recovered: 0,
      failed: 0,
      unresolved: 0,
    });
    expect(checkDigestStatus).not.toHaveBeenCalled();
  });

  it("marks digest-confirmed success as recovered when the submission is not yet visible on-chain", async () => {
    const ledger = makeLedger([
      row({
        imageKey: "tiles/unit-1-row-1.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        txDigest: "0xdigest-1",
        status: "uploaded",
      }),
    ]);
    const checkDigestStatus = vi.fn(
      async (_txDigest: string) => "success" as const,
    );

    const result = await reconcileSeedingLedger({
      ledger,
      snapshot: snapshot(),
      checkDigestStatus,
    });

    expect(result.rows[0]).toEqual(
      row({
        imageKey: "tiles/unit-1-row-1.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        txDigest: "0xdigest-1",
        submissionNo: null,
        status: "recovered",
      }),
    );
    expect(result.summary).toEqual({
      submitted: 0,
      recovered: 1,
      failed: 0,
      unresolved: 0,
    });
    expect(checkDigestStatus).toHaveBeenCalledWith("0xdigest-1");
  });

  it("marks digest-confirmed failure as failed", async () => {
    const ledger = makeLedger([
      row({
        imageKey: "tiles/unit-1-row-1.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        txDigest: "0xdigest-1",
        status: "uploaded",
      }),
    ]);
    const checkDigestStatus = vi.fn(
      async (_txDigest: string) => "failed" as const,
    );

    const result = await reconcileSeedingLedger({
      ledger,
      snapshot: snapshot(),
      checkDigestStatus,
    });

    expect(result.rows[0]).toEqual(
      row({
        imageKey: "tiles/unit-1-row-1.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        txDigest: "0xdigest-1",
        submissionNo: null,
        status: "failed",
        failureReason: "Digest 0xdigest-1 reported failure.",
      }),
    );
    expect(result.summary).toEqual({
      submitted: 0,
      recovered: 0,
      failed: 1,
      unresolved: 0,
    });
  });

  it("leaves unknown digest status unresolved and recoverable", async () => {
    const ledger = makeLedger([
      row({
        imageKey: "tiles/unit-1-row-1.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        txDigest: "0xdigest-1",
        status: "uploaded",
      }),
    ]);
    const checkDigestStatus = vi.fn(
      async (_txDigest: string) => "unknown" as const,
    );

    const result = await reconcileSeedingLedger({
      ledger,
      snapshot: snapshot(),
      checkDigestStatus,
    });

    expect(result.rows[0]).toEqual(
      row({
        imageKey: "tiles/unit-1-row-1.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        txDigest: "0xdigest-1",
        submissionNo: null,
        status: "uploaded",
      }),
    );
    expect(result.summary).toEqual({
      submitted: 0,
      recovered: 0,
      failed: 0,
      unresolved: 1,
    });
  });

  it("detects duplicate sender/blob success rows without reusing the same pair", async () => {
    const ledger = makeLedger([
      row({
        imageKey: "tiles/unit-1-row-1.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        submissionNo: null,
        status: "submitted",
      }),
      row({
        imageKey: "tiles/unit-1-row-2.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        submissionNo: null,
        status: "submitted",
      }),
    ]);

    const result = await reconcileSeedingLedger({
      ledger,
      snapshot: snapshot({
        submissions: [
          submission({
            submissionNo: 9,
            submitter: "0xsender-1",
            walrusBlobId: "blob-1",
          }),
        ],
      }),
      checkDigestStatus: vi.fn(),
    });

    expect(result.rows).toEqual([
      row({
        imageKey: "tiles/unit-1-row-1.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        submissionNo: 9,
        status: "submitted",
      }),
      row({
        imageKey: "tiles/unit-1-row-2.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        submissionNo: null,
        status: "failed",
        failureReason:
          "Duplicate sender/blob pair already reconciled for 0xsender-1 + blob-1.",
      }),
    ]);
    expect(result.summary).toEqual({
      submitted: 1,
      recovered: 0,
      failed: 1,
      unresolved: 0,
    });
  });
});

function makeLedger(rows: SeedingLedgerRow[]): SeedingLedger {
  return { rows };
}

function row(overrides: Partial<SeedingLedgerRow> = {}): SeedingLedgerRow {
  return {
    imageKey: overrides.imageKey ?? "tiles/unit-1-row-1.png",
    senderAddress: overrides.senderAddress ?? "0xsender-1",
    blobId: overrides.blobId ?? "blob-1",
    aggregatorUrl: overrides.aggregatorUrl ?? null,
    txDigest: overrides.txDigest ?? null,
    submissionNo: overrides.submissionNo ?? null,
    status: overrides.status ?? "pending_upload",
    preprocessLog: overrides.preprocessLog ?? null,
    observedSubmittedCount: overrides.observedSubmittedCount ?? null,
    observedUnitStatus: overrides.observedUnitStatus ?? null,
    failureReason: overrides.failureReason ?? null,
  };
}

function snapshot(
  overrides: Partial<GeneratorSeedingSnapshot> = {},
): GeneratorSeedingSnapshot {
  return {
    displayName: overrides.displayName ?? "Demo Athlete",
    displayMaxSlots: overrides.displayMaxSlots ?? overrides.maxSlots ?? 5,
    targetWalrusBlobId: overrides.targetWalrusBlobId ?? "target-blob",
    unitId: overrides.unitId ?? "0xunit-1",
    submissions: overrides.submissions ?? [],
    submittedCount:
      overrides.submittedCount ?? overrides.submissions?.length ?? 0,
    maxSlots: overrides.maxSlots ?? 5,
    status: overrides.status ?? "pending",
    masterId: overrides.masterId ?? null,
    submitterAddresses:
      overrides.submitterAddresses ??
      Array.from(
        new Set((overrides.submissions ?? []).map((entry) => entry.submitter)),
      ),
  };
}

function submission(
  overrides: Partial<{
    readonly submissionNo: number;
    readonly submitter: string;
    readonly submittedAtMs: number;
    readonly walrusBlobId: string;
  }> = {},
) {
  return {
    submissionNo: overrides.submissionNo ?? 1,
    submitter: overrides.submitter ?? "0xsender-1",
    submittedAtMs: overrides.submittedAtMs ?? 1_700_000_000_000,
    walrusBlobId: overrides.walrusBlobId ?? "blob-1",
  };
}
