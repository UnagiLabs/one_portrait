import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { describe, expect, it, vi } from "vitest";

import {
  createSeedingSnapshotLoader,
  createUpsertAthleteMetadataTransactionExecutor,
} from "../src";
import type {
  GeneratorSuiReadClient,
  GeneratorSuiWriteClient,
} from "../src/sui";

describe("createSeedingSnapshotLoader", () => {
  it("derives submittedCount, maxSlots, status, and submitter addresses from the unit object", async () => {
    const client = {
      getObject: vi.fn(async ({ id }) => {
        expect(id).toBe(UNIT_ID);
        return {
          data: unitData({
            status: 0,
            submissions: [
              submission({
                submitter: "0xsubmitter-a",
                submissionNo: 1,
              }),
              submission({
                submitter: "0xsubmitter-b",
                submissionNo: 2,
              }),
            ],
            submitters: {
              type: "0x2::table::Table<address, bool>",
              fields: { id: { id: "0xsubmitters" }, size: "2" },
            },
            max_slots: "5",
          }),
        };
      }),
    } as unknown as GeneratorSuiReadClient;

    const loader = createSeedingSnapshotLoader(client);
    const snapshot = await loader(UNIT_ID);

    expect(snapshot).toEqual({
      unitId: UNIT_ID,
      athleteId: 1,
      targetWalrusBlobId: "target-blob",
      submissions: [
        parsedSubmission({
          submitter: "0xsubmitter-a",
          submissionNo: 1,
        }),
        parsedSubmission({
          submitter: "0xsubmitter-b",
          submissionNo: 2,
        }),
      ],
      submittedCount: 2,
      maxSlots: 5,
      status: "pending",
      masterId: null,
      submitterAddresses: ["0xsubmitter-a", "0xsubmitter-b"],
    });
  });
});

describe("createUpsertAthleteMetadataTransactionExecutor", () => {
  it("returns the digest and athlete id after a successful transaction", async () => {
    const signer = Ed25519Keypair.generate();
    const signAndExecuteTransaction = vi.fn(async () => ({
      digest: "0xupsert",
      effects: {
        status: {
          status: "success",
        },
      },
    }));
    const waitForTransaction = vi.fn(async () => ({
      effects: {
        status: {
          status: "success",
        },
      },
    }));
    const upsert = createUpsertAthleteMetadataTransactionExecutor({
      adminCapId:
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      client: {
        signAndExecuteTransaction,
        waitForTransaction,
      } as unknown as GeneratorSuiWriteClient,
      packageId: "0xpackage",
      privateKey: signer.getSecretKey(),
    });

    await expect(
      upsert({
        athleteId: 12,
        displayName: "Demo Athlete Twelve",
        registryObjectId:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        slug: "demo-athlete-twelve",
        thumbnailUrl: "https://example.com/12.png",
      }),
    ).resolves.toEqual({
      athleteId: 12,
      digest: "0xupsert",
    });
    expect(signAndExecuteTransaction).toHaveBeenCalledTimes(1);
    expect(waitForTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        digest: "0xupsert",
        options: {
          showEffects: true,
        },
      }),
    );
  });
});

const UNIT_ID = "0xunit-1";

function unitData(fields: Record<string, unknown>) {
  return {
    objectId: UNIT_ID,
    digest: "d",
    version: "1",
    type: "0xpkg::unit::Unit",
    content: {
      dataType: "moveObject",
      hasPublicTransfer: false,
      type: "0xpkg::unit::Unit",
      fields: {
        id: { id: UNIT_ID },
        athlete_id: 1,
        target_walrus_blob: Array.from(new TextEncoder().encode("target-blob")),
        max_slots: "4",
        status: 0,
        master_id: { fields: { vec: [] } },
        submitters: {
          type: "0x2::table::Table<address, bool>",
          fields: { id: { id: "0xsubmitters" }, size: "0" },
        },
        submissions: [],
        ...fields,
      },
    },
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
    submission_no: String(overrides.submissionNo ?? 1),
    submitter: overrides.submitter ?? "0xsubmitter",
    submitted_at_ms: String(overrides.submittedAtMs ?? 1_700_000_000_000),
    walrus_blob_id: Array.from(
      new TextEncoder().encode(overrides.walrusBlobId ?? "blob-id"),
    ),
  };
}

function parsedSubmission(
  overrides: Partial<{
    readonly submissionNo: number;
    readonly submitter: string;
    readonly submittedAtMs: number;
    readonly walrusBlobId: string;
  }> = {},
) {
  return {
    submissionNo: overrides.submissionNo ?? 1,
    submitter: overrides.submitter ?? "0xsubmitter",
    submittedAtMs: overrides.submittedAtMs ?? 1_700_000_000_000,
    walrusBlobId: overrides.walrusBlobId ?? "blob-id",
  };
}
