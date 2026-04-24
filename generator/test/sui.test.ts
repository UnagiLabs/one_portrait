import { bcs } from "@mysten/sui/bcs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { describe, expect, it, vi } from "vitest";

import {
  createCreateUnitTransactionExecutor,
  createFinalizeTransactionExecutor,
  createSeedingSnapshotLoader,
  createUnitSnapshotLoader,
} from "../src";
import type {
  GeneratorSuiReadClient,
  GeneratorSuiWriteClient,
} from "../src/sui";

describe("createUnitSnapshotLoader", () => {
  it("reads displayMaxSlots from the Unit object for demo units", async () => {
    const client = {
      getObject: vi.fn(async ({ id }) => {
        expect(id).toBe(UNIT_ID);
        return {
          data: unitData({
            display_max_slots: "2000",
            max_slots: "5",
          }),
        };
      }),
    } as unknown as GeneratorSuiReadClient;

    const loader = createUnitSnapshotLoader(client);
    const snapshot = await loader(UNIT_ID);

    expect(snapshot).toEqual({
      unitId: UNIT_ID,
      displayName: "Demo Athlete",
      displayMaxSlots: 2000,
      targetWalrusBlobId: "target-blob",
      submissions: [],
      status: "pending",
      masterId: null,
    });
  });
});

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
            display_max_slots: "5",
            max_slots: "5",
          }),
        };
      }),
    } as unknown as GeneratorSuiReadClient;

    const loader = createSeedingSnapshotLoader(client);
    const snapshot = await loader(UNIT_ID);

    expect(snapshot).toEqual({
      unitId: UNIT_ID,
      displayName: "Demo Athlete",
      displayMaxSlots: 5,
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

  it("keeps normal units inert when displayMaxSlots matches maxSlots", async () => {
    const client = {
      getObject: vi.fn(async () => ({
        data: unitData({
          display_max_slots: "4",
          max_slots: "4",
        }),
      })),
    } as unknown as GeneratorSuiReadClient;

    const loader = createSeedingSnapshotLoader(client);
    const snapshot = await loader(UNIT_ID);

    expect(snapshot.displayMaxSlots).toBe(4);
    expect(snapshot.maxSlots).toBe(4);
  });

  it("accepts submission refs wrapped in nested move-object fields", async () => {
    const client = {
      getObject: vi.fn(async () => ({
        data: unitData({
          submissions: [
            {
              type: "0xpkg::unit::SubmissionRef",
              fields: submission({
                submitter: "0xwrapped-submitter",
                submissionNo: 7,
                submittedAtMs: 1_700_000_000_123,
                walrusBlobId: "wrapped-blob",
              }),
            },
          ],
        }),
      })),
    } as unknown as GeneratorSuiReadClient;

    const loader = createSeedingSnapshotLoader(client);
    const snapshot = await loader(UNIT_ID);

    expect(snapshot.submissions).toEqual([
      parsedSubmission({
        submitter: "0xwrapped-submitter",
        submissionNo: 7,
        submittedAtMs: 1_700_000_000_123,
        walrusBlobId: "wrapped-blob",
      }),
    ]);
    expect(snapshot.submittedCount).toBe(1);
    expect(snapshot.submitterAddresses).toEqual(["0xwrapped-submitter"]);
  });
});

describe("createCreateUnitTransactionExecutor", () => {
  it("returns the digest and created unit id after a successful transaction", async () => {
    const signer = Ed25519Keypair.generate();
    const signAndExecuteTransaction = vi.fn(async () => ({
      digest: "0xcreate",
      effects: {
        status: {
          status: "success",
        },
      },
      objectChanges: [
        {
          type: "created",
          objectId: "0xcreated-unit",
          objectType: "0xpackage::unit::Unit",
        },
      ],
    }));
    const waitForTransaction = vi.fn(async () => ({
      effects: {
        status: {
          status: "success",
        },
      },
      objectChanges: [
        {
          type: "created",
          objectId: "0xcreated-unit",
          objectType: "0xpackage::unit::Unit",
        },
      ],
    }));
    const createUnit = createCreateUnitTransactionExecutor({
      adminCapId:
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      client: {
        signAndExecuteTransaction,
        waitForTransaction,
      } as unknown as GeneratorSuiWriteClient,
      packageId: PACKAGE_ID,
      privateKey: signer.getSecretKey(),
    });

    await expect(
      createUnit({
        blobId: "target-blob-12",
        displayMaxSlots: 2000,
        displayName: "Demo Athlete Twelve",
        maxSlots: 5,
        registryObjectId:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        thumbnailUrl: "https://example.com/12.png",
      }),
    ).resolves.toEqual({
      digest: "0xcreate",
      unitId: "0xcreated-unit",
    });
    expect(signAndExecuteTransaction).toHaveBeenCalledTimes(1);
    expect(waitForTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        digest: "0xcreate",
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      }),
    );
  });
});

describe("createFinalizeTransactionExecutor", () => {
  it("uses finalize_empty for zero-placement demo units", async () => {
    const signer = Ed25519Keypair.generate();
    const signAndExecuteTransaction = vi.fn(async () => ({
      digest: "0xfinalize",
      effects: {
        status: {
          status: "success",
        },
      },
    }));
    const finalize = createFinalizeTransactionExecutor({
      adminCapId:
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      client: {
        signAndExecuteTransaction,
        waitForTransaction: vi.fn(),
      } as unknown as GeneratorSuiWriteClient,
      packageId: PACKAGE_ID,
      privateKey: signer.getSecretKey(),
    });

    await expect(
      finalize({
        mosaicBlobId: "mosaic-blob-zero",
        placements: [],
        unitId:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      }),
    ).resolves.toEqual({ digest: "0xfinalize" });

    const command = firstTransactionCommand(signAndExecuteTransaction);
    expect(command?.MoveCall).toMatchObject({
      package: PACKAGE_ID,
      module: "admin_api",
      function: "finalize_empty",
    });
    expect(command?.MoveCall?.arguments).toHaveLength(3);
  });

  it("uses primitive placement vectors when placements are present", async () => {
    const signer = Ed25519Keypair.generate();
    const signAndExecuteTransaction = vi.fn(async () => ({
      digest: "0xfinalize",
      effects: {
        status: {
          status: "success",
        },
      },
    }));
    const finalize = createFinalizeTransactionExecutor({
      adminCapId:
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      client: {
        signAndExecuteTransaction,
        waitForTransaction: vi.fn(),
      } as unknown as GeneratorSuiWriteClient,
      packageId: PACKAGE_ID,
      privateKey: signer.getSecretKey(),
    });

    const placements = [
      {
        walrusBlobId: "submission-1",
        submissionNo: 1,
        submitter:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        x: 0,
        y: 1,
        targetColor: { red: 1, green: 2, blue: 3 },
      },
      {
        walrusBlobId: "submission-2",
        submissionNo: 22,
        submitter:
          "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        x: 65535,
        y: 42,
        targetColor: { red: 4, green: 5, blue: 6 },
      },
    ];

    await expect(
      finalize({
        mosaicBlobId: "mosaic-blob",
        placements,
        unitId:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      }),
    ).resolves.toEqual({ digest: "0xfinalize" });

    const command = firstTransactionCommand(signAndExecuteTransaction);
    expect(command?.MoveCall).toMatchObject({
      package: PACKAGE_ID,
      module: "admin_api",
      function: "finalize_with_primitive_placements",
    });
    expect(command?.MoveCall?.arguments).toHaveLength(8);

    const pureInputs = transactionPureInputBytes(signAndExecuteTransaction);
    const encoded = new TextEncoder();
    expect(pureInputs[0]).toEqual(
      Array.from(
        bcs
          .vector(bcs.u8())
          .serialize(Array.from(encoded.encode("mosaic-blob")))
          .toBytes(),
      ),
    );
    expect(pureInputs[1]).toEqual(
      Array.from(
        bcs
          .vector(bcs.vector(bcs.u8()))
          .serialize(
            placements.map((placement) =>
              Array.from(encoded.encode(placement.walrusBlobId)),
            ),
          )
          .toBytes(),
      ),
    );
    expect(pureInputs[2]).toEqual(
      Array.from(
        bcs
          .vector(bcs.u16())
          .serialize(placements.map((placement) => placement.x))
          .toBytes(),
      ),
    );
    expect(pureInputs[3]).toEqual(
      Array.from(
        bcs
          .vector(bcs.u16())
          .serialize(placements.map((placement) => placement.y))
          .toBytes(),
      ),
    );
    expect(pureInputs[4]).toEqual(
      Array.from(
        bcs
          .vector(bcs.Address)
          .serialize(placements.map((placement) => placement.submitter))
          .toBytes(),
      ),
    );
    expect(pureInputs[5]).toEqual(
      Array.from(
        bcs
          .vector(bcs.u64())
          .serialize(placements.map((placement) => placement.submissionNo))
          .toBytes(),
      ),
    );

    const oldPlacementInputBcs = bcs.struct("PlacementInput", {
      blob_id: bcs.vector(bcs.u8()),
      x: bcs.u16(),
      y: bcs.u16(),
      submitter: bcs.Address,
      submission_no: bcs.u64(),
    });
    const oldVectorStructBytes = Array.from(
      bcs
        .vector(oldPlacementInputBcs)
        .serialize(
          placements.map((placement) => ({
            blob_id: Array.from(encoded.encode(placement.walrusBlobId)),
            x: placement.x,
            y: placement.y,
            submitter: placement.submitter,
            submission_no: placement.submissionNo,
          })),
        )
        .toBytes(),
    );
    expect(pureInputs).not.toContainEqual(oldVectorStructBytes);
  });
});

const UNIT_ID = "0xunit-1";
const PACKAGE_ID =
  "0x9999999999999999999999999999999999999999999999999999999999999999";

function firstTransactionCommand(
  signAndExecuteTransaction: ReturnType<typeof vi.fn>,
) {
  const calls = signAndExecuteTransaction.mock.calls as unknown as Array<
    [
      {
        transaction: {
          getData: () => {
            commands: Array<{
              MoveCall?: {
                package: string;
                module: string;
                function: string;
                arguments: readonly unknown[];
              };
            }>;
          };
        };
      },
    ]
  >;

  return calls[0]?.[0].transaction.getData().commands[0];
}

function transactionPureInputBytes(
  signAndExecuteTransaction: ReturnType<typeof vi.fn>,
) {
  const calls = signAndExecuteTransaction.mock.calls as unknown as Array<
    [
      {
        transaction: {
          getData: () => {
            inputs: Array<{
              Pure?: {
                bytes: string;
              };
            }>;
          };
        };
      },
    ]
  >;

  return (
    calls[0]?.[0].transaction
      .getData()
      .inputs.map((input) =>
        input.Pure ? Array.from(Buffer.from(input.Pure.bytes, "base64")) : null,
      )
      .filter((input): input is number[] => input !== null) ?? []
  );
}

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
        display_name: Array.from(new TextEncoder().encode("Demo Athlete")),
        target_walrus_blob: Array.from(new TextEncoder().encode("target-blob")),
        display_max_slots: "4",
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
