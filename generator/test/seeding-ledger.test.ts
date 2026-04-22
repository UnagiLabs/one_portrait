import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createEmptySeedingLedger,
  readSeedingLedger,
  type SeedingLedger,
  type SeedingLedgerRow,
  writeSeedingLedger,
} from "../src";

describe("seeding ledger file I/O", () => {
  it("loads a missing ledger as an empty ledger", async () => {
    const dir = await mkdtemp(join(tmpdir(), "one-portrait-ledger-"));
    const ledgerPath = join(dir, "ledger.json");

    try {
      await expect(readSeedingLedger(ledgerPath)).resolves.toEqual(
        createEmptySeedingLedger(),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("saves and reloads rows without losing data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "one-portrait-ledger-"));
    const ledgerPath = join(dir, "ledger.json");
    const ledger: SeedingLedger = {
      rows: [
        row({
          imageKey: "tiles/unit-1-row-1.png",
          senderAddress: "0xsender-1",
          blobId: "blob-1",
          aggregatorUrl: "https://aggregator.example/v1/blobs/blob-1",
          txDigest: "0xdigest-1",
          submissionNo: 7,
          status: "submitted",
          preprocessLog: {
            imageKey: "tiles/unit-1-row-1.png",
            filePath: "/tmp/tiles/unit-1-row-1.png",
            sourceByteSize: 123,
            outputByteSize: 456,
            originalWidth: 10,
            originalHeight: 20,
            originalFormat: "jpeg",
            normalizedWidth: 10,
            normalizedHeight: 20,
            normalizedFormat: "png",
          },
          observedSubmittedCount: 7,
          observedUnitStatus: "pending",
        }),
        row({
          imageKey: "tiles/unit-1-row-2.png",
          senderAddress: "0xsender-2",
          blobId: null,
          aggregatorUrl: null,
          txDigest: null,
          submissionNo: null,
          status: "pending_upload",
          preprocessLog: null,
          observedSubmittedCount: null,
          observedUnitStatus: null,
          failureReason: "waiting for upload",
        }),
      ],
    };

    try {
      await writeSeedingLedger(ledgerPath, ledger);

      await expect(readSeedingLedger(ledgerPath)).resolves.toEqual(ledger);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

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
