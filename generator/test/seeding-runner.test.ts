import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { describe, expect, it, vi } from "vitest";

import type {
  GeneratorSeedingSnapshot,
  SeedingInputEntry,
  SeedingLedger,
  SeedingLedgerRow,
  SeedingPreprocessedImage,
} from "../src";
import {
  buildSeedingLedgerRows,
  createSeedingDemoSubmissionRunner,
  deriveSeedingSenders,
  loadSeedingSenderConfig,
  parseSeedingDemoSubmissionArgs,
} from "../src";

describe("sender config parsing", () => {
  it("loads private keys from JSON and derives unique sender addresses", async () => {
    const dir = await mkdtemp(join(tmpdir(), "one-portrait-sender-config-"));
    const filePath = join(dir, "senders.json");
    const keypair = Ed25519Keypair.generate();
    const secretKey = keypair.getSecretKey();

    try {
      await writeFile(
        filePath,
        JSON.stringify(
          {
            senders: [
              {
                privateKey: secretKey,
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );

      const config = await loadSeedingSenderConfig(filePath);
      const senders = deriveSeedingSenders(config);

      expect(senders).toEqual([
        expect.objectContaining({
          address: keypair.toSuiAddress(),
        }),
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects duplicate derived sender addresses", () => {
    const keypair = Ed25519Keypair.generate();
    const secretKey = keypair.getSecretKey();

    expect(() =>
      deriveSeedingSenders([
        {
          privateKey: secretKey,
        },
        {
          privateKey: secretKey,
        },
      ]),
    ).toThrow(/duplicate/i);
  });
});

describe("buildSeedingLedgerRows", () => {
  it("preserves existing assignments and assigns remaining senders deterministically", () => {
    const existingLedger: SeedingLedger = {
      rows: [
        row({
          imageKey: "b.png",
          senderAddress: "0xsender-existing",
          blobId: "blob-existing",
          status: "submitted",
        }),
      ],
    };

    const result = buildSeedingLedgerRows({
      availableSenderAddresses: ["0xsender-1", "0xsender-2"],
      entries: [
        {
          imageKey: "a.png",
          filePath: "/tmp/a.png",
        },
        {
          imageKey: "b.png",
          filePath: "/tmp/b.png",
        },
        {
          imageKey: "c.png",
          filePath: "/tmp/c.png",
        },
      ],
      existingLedger,
      targetCount: 3,
    });

    expect(result.rows).toEqual([
      row({
        imageKey: "a.png",
        senderAddress: "0xsender-1",
        blobId: null,
        status: "pending_upload",
      }),
      row({
        imageKey: "b.png",
        senderAddress: "0xsender-existing",
        blobId: "blob-existing",
        status: "submitted",
      }),
      row({
        imageKey: "c.png",
        senderAddress: "0xsender-2",
        blobId: null,
        status: "pending_upload",
      }),
    ]);
  });

  it("rejects new assignments when on-chain used senders are not available", () => {
    expect(() =>
      buildSeedingLedgerRows({
        availableSenderAddresses: ["0xsender-2"],
        entries: [
          {
            imageKey: "a.png",
            filePath: "/tmp/a.png",
          },
          {
            imageKey: "b.png",
            filePath: "/tmp/b.png",
          },
        ],
        existingLedger: { rows: [] },
        targetCount: 2,
      }),
    ).toThrow(/not enough sender addresses available/i);
  });
});

describe("createSeedingDemoSubmissionRunner", () => {
  it("simulate mode avoids upload and submit side effects", async () => {
    const putBlob = vi.fn(async () => ({
      blobId: "blob-1",
      aggregatorUrl: "https://aggregator/v1/blobs/blob-1",
    }));
    const submitPhotoForSender = vi.fn(async () => ({
      digest: "0xdigest-1",
      senderAddress: "0xsender-1",
      snapshot: snapshot(),
      submissionNo: 1,
      submittedCount: 1,
      status: "pending" as const,
    }));
    const runner = createSeedingDemoSubmissionRunner({
      deriveSenders: (entries) =>
        entries.map((entry, index) => ({
          address: `0xsender-${index + 1}`,
          privateKey: entry.privateKey,
        })),
      loadInputEntries: vi.fn(async () => [
        {
          imageKey: "a.png",
          filePath: "/tmp/a.png",
        },
      ]),
      loadSenderConfig: vi.fn(async () => [
        {
          privateKey: new Uint8Array([1, 2, 3]),
        },
      ]),
      readLedger: vi.fn(async () => ({ rows: [] })),
      writeLedger: vi.fn(),
      readSeedingSnapshot: vi.fn(async () => snapshot()),
      checkDigestStatus: vi.fn(async () => "unknown" as const),
      preprocessSeedingImage: vi.fn(async (entry: SeedingInputEntry) =>
        preprocessed(entry),
      ),
      putBlob,
      submitPhotoForSender,
    });

    const result = await runner.run({
      unitId: "0xunit-1",
      images: "/tmp/images",
      manifest: null,
      senderConfig: "/tmp/senders.json",
      targetCount: 1,
      limit: null,
      ledger: "/tmp/ledger.json",
      mode: "simulate",
    });

    expect(putBlob).not.toHaveBeenCalled();
    expect(submitPhotoForSender).not.toHaveBeenCalled();
    expect(result.summary.mode).toBe("simulate");
    expect(result.summary.wouldSubmitRows).toBe(1);
  });

  it("live mode stops after the requested limit and persists intermediate ledger state", async () => {
    const writes: SeedingLedger[] = [];
    const putBlob = vi
      .fn()
      .mockResolvedValueOnce({
        blobId: "blob-1",
        aggregatorUrl: "https://aggregator/v1/blobs/blob-1",
      })
      .mockResolvedValueOnce({
        blobId: "blob-2",
        aggregatorUrl: "https://aggregator/v1/blobs/blob-2",
      });
    const submitPhotoForSender = vi
      .fn()
      .mockImplementation(async (senderAddress: string) => ({
        digest: `digest-${senderAddress}`,
        senderAddress,
        snapshot: snapshot({ submittedCount: 1 }),
        submissionNo: senderAddress === "0xsender-1" ? 11 : 12,
        submittedCount: 1,
        status: "pending" as const,
      }));
    const runner = createSeedingDemoSubmissionRunner({
      deriveSenders: (entries) =>
        entries.map((entry, index) => ({
          address: `0xsender-${index + 1}`,
          privateKey: entry.privateKey,
        })),
      loadInputEntries: vi.fn(async () => [
        {
          imageKey: "a.png",
          filePath: "/tmp/a.png",
        },
        {
          imageKey: "b.png",
          filePath: "/tmp/b.png",
        },
      ]),
      loadSenderConfig: vi.fn(async () => [
        {
          privateKey: new Uint8Array([1, 2, 3]),
        },
        {
          privateKey: new Uint8Array([4, 5, 6]),
        },
      ]),
      readLedger: vi.fn(async () => ({ rows: [] })),
      writeLedger: vi.fn(async (_path: string, ledger: SeedingLedger) => {
        writes.push(ledger);
      }),
      readSeedingSnapshot: vi.fn(async () => snapshot()),
      checkDigestStatus: vi.fn(async () => "unknown" as const),
      preprocessSeedingImage: vi
        .fn()
        .mockImplementation(async (entry: SeedingInputEntry) =>
          preprocessed(entry),
        ),
      putBlob,
      submitPhotoForSender,
    });

    const result = await runner.run({
      unitId: "0xunit-1",
      images: null,
      manifest: "/tmp/manifest.json",
      senderConfig: "/tmp/senders.json",
      targetCount: 2,
      limit: 1,
      ledger: "/tmp/ledger.json",
      mode: "live",
    });

    expect(result.summary.mode).toBe("live");
    expect(result.summary.processedRows).toBe(1);
    expect(result.summary.stoppedAfterLimit).toBe(true);
    expect(result.ledger.rows[0]).toEqual(
      expect.objectContaining({
        imageKey: "a.png",
        senderAddress: "0xsender-1",
        blobId: "blob-1",
        aggregatorUrl: "https://aggregator/v1/blobs/blob-1",
        txDigest: "digest-0xsender-1",
        submissionNo: 11,
        status: "submitted",
        preprocessLog: expect.objectContaining({
          imageKey: "a.png",
        }),
        observedSubmittedCount: 1,
        observedUnitStatus: "pending",
      }),
    );
    expect(result.ledger.rows[1]).toEqual(
      expect.objectContaining({
        imageKey: "b.png",
        senderAddress: "0xsender-2",
        blobId: null,
        aggregatorUrl: null,
        txDigest: null,
        status: "pending_upload",
      }),
    );
    expect(writes.length).toBeGreaterThan(0);
  });

  it("rejects runs when the ledger does not cover already-used on-chain senders", async () => {
    const runner = createSeedingDemoSubmissionRunner({
      deriveSenders: (entries) =>
        entries.map((entry, index) => ({
          address: `0xsender-${index + 1}`,
          privateKey: entry.privateKey,
        })),
      loadInputEntries: vi.fn(async () => [
        {
          imageKey: "a.png",
          filePath: "/tmp/a.png",
        },
        {
          imageKey: "b.png",
          filePath: "/tmp/b.png",
        },
      ]),
      loadSenderConfig: vi.fn(async () => [
        {
          privateKey: new Uint8Array([1, 2, 3]),
        },
        {
          privateKey: new Uint8Array([4, 5, 6]),
        },
      ]),
      readLedger: vi.fn(async () => ({ rows: [] })),
      writeLedger: vi.fn(),
      readSeedingSnapshot: vi.fn(async () =>
        snapshot({
          submittedCount: 1,
          submitterAddresses: ["0xsender-1"],
        }),
      ),
      checkDigestStatus: vi.fn(async () => "unknown" as const),
      preprocessSeedingImage: vi.fn(async (entry: SeedingInputEntry) =>
        preprocessed(entry),
      ),
      putBlob: vi.fn(async () => ({
        blobId: "blob-1",
        aggregatorUrl: "https://aggregator/v1/blobs/blob-1",
      })),
      submitPhotoForSender: vi.fn(),
    });

    await expect(
      runner.run({
        unitId: "0xunit-1",
        images: "/tmp/images",
        manifest: null,
        senderConfig: "/tmp/senders.json",
        targetCount: 2,
        limit: null,
        ledger: "/tmp/ledger.json",
        mode: "simulate",
      }),
    ).rejects.toThrow(/not enough sender addresses available/i);
  });

  it("persists failure reasons when submit execution fails", async () => {
    const writes: SeedingLedger[] = [];
    const runner = createSeedingDemoSubmissionRunner({
      deriveSenders: (entries) =>
        entries.map((entry, index) => ({
          address: `0xsender-${index + 1}`,
          privateKey: entry.privateKey,
        })),
      loadInputEntries: vi.fn(async () => [
        {
          imageKey: "a.png",
          filePath: "/tmp/a.png",
        },
      ]),
      loadSenderConfig: vi.fn(async () => [
        {
          privateKey: new Uint8Array([1, 2, 3]),
        },
      ]),
      readLedger: vi.fn(async () => ({ rows: [] })),
      writeLedger: vi.fn(async (_path: string, ledger: SeedingLedger) => {
        writes.push({
          rows: ledger.rows.map((entry) => ({ ...entry })),
        });
      }),
      readSeedingSnapshot: vi.fn(async () => snapshot()),
      checkDigestStatus: vi.fn(async () => "unknown" as const),
      preprocessSeedingImage: vi.fn(async (entry: SeedingInputEntry) =>
        preprocessed(entry),
      ),
      putBlob: vi.fn(async () => ({
        blobId: "blob-1",
        aggregatorUrl: "https://aggregator/v1/blobs/blob-1",
      })),
      submitPhotoForSender: vi.fn(async () => {
        throw new Error("submit failed");
      }),
    });

    await expect(
      runner.run({
        unitId: "0xunit-1",
        images: "/tmp/images",
        manifest: null,
        senderConfig: "/tmp/senders.json",
        targetCount: 1,
        limit: null,
        ledger: "/tmp/ledger.json",
        mode: "live",
      }),
    ).rejects.toThrow(/submit failed/i);

    expect(writes.at(-1)?.rows[0]).toEqual(
      expect.objectContaining({
        blobId: "blob-1",
        status: "uploaded",
        failureReason: "submit failed",
      }),
    );
  });
});

describe("parseSeedingDemoSubmissionArgs", () => {
  it("rejects missing required flags", () => {
    expect(() =>
      parseSeedingDemoSubmissionArgs([
        "--unit-id",
        "0xunit-1",
        "--mode",
        "simulate",
      ]),
    ).toThrow(/sender-config|ledger|images|manifest/i);
  });

  it("accepts simulate and live mode values", () => {
    expect(
      parseSeedingDemoSubmissionArgs([
        "--unit-id",
        "0xunit-1",
        "--images",
        "/tmp/images",
        "--sender-config",
        "/tmp/senders.json",
        "--ledger",
        "/tmp/ledger.json",
        "--mode",
        "simulate",
      ]),
    ).toEqual(
      expect.objectContaining({
        mode: "simulate",
        limit: null,
        manifest: null,
        targetCount: null,
      }),
    );

    expect(
      parseSeedingDemoSubmissionArgs([
        "--unit-id",
        "0xunit-1",
        "--manifest",
        "/tmp/manifest.json",
        "--sender-config",
        "/tmp/senders.json",
        "--target-count",
        "2",
        "--ledger",
        "/tmp/ledger.json",
        "--mode",
        "live",
        "--limit",
        "1",
      ]),
    ).toEqual(
      expect.objectContaining({
        mode: "live",
        limit: 1,
        images: null,
      }),
    );
  });
});

function snapshot(
  overrides: Partial<GeneratorSeedingSnapshot> = {},
): GeneratorSeedingSnapshot {
  return {
    athleteId: overrides.athleteId ?? 1,
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

function preprocessed(entry: SeedingInputEntry): SeedingPreprocessedImage {
  return {
    ...entry,
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
    metadata: {
      sourceByteSize: 3,
      outputByteSize: 3,
      originalWidth: null,
      originalHeight: null,
      originalFormat: null,
      normalizedWidth: null,
      normalizedHeight: null,
      normalizedFormat: "png",
    },
    log: {
      imageKey: entry.imageKey,
      filePath: entry.filePath,
      sourceByteSize: 3,
      outputByteSize: 3,
      originalWidth: null,
      originalHeight: null,
      originalFormat: null,
      normalizedWidth: null,
      normalizedHeight: null,
      normalizedFormat: "png",
    },
  };
}

function row(overrides: Partial<SeedingLedgerRow> = {}): SeedingLedgerRow {
  return {
    imageKey: overrides.imageKey ?? "a.png",
    senderAddress: overrides.senderAddress ?? "0xsender-1",
    blobId: overrides.blobId ?? null,
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
