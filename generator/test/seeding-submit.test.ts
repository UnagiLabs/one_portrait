import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { describe, expect, it, vi } from "vitest";

import {
  createProgressAwareSubmissionHelper,
  createSeedingDigestStatusChecker,
  createSubmitPhotoTransactionExecutor,
  validateFinalSubmissionPostcondition,
} from "../src";
import type {
  GeneratorSeedingSnapshot,
  GeneratorSuiTransactionBlockClient,
  GeneratorSuiWriteClient,
} from "../src/sui";

describe("seeding submit helpers", () => {
  it("maps transaction digest status from getTransactionBlock responses", async () => {
    const getTransactionBlock = vi.fn(
      async ({ digest }: { readonly digest: string }) => {
        if (digest === "0xsuccess") {
          return {
            effects: {
              status: {
                status: "success",
              },
            },
          };
        }

        if (digest === "0xfailure") {
          return {
            effects: {
              status: {
                status: "failure",
              },
            },
          };
        }

        return {};
      },
    );
    const checker = createSeedingDigestStatusChecker({
      getTransactionBlock,
    } as unknown as GeneratorSuiTransactionBlockClient);

    await expect(checker("0xsuccess")).resolves.toBe("success");
    await expect(checker("0xfailure")).resolves.toBe("failed");
    await expect(checker("0xmissing")).resolves.toBe("unknown");
    expect(getTransactionBlock).toHaveBeenCalledTimes(3);
    expect(getTransactionBlock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        digest: "0xsuccess",
        options: {
          showEffects: true,
        },
      }),
    );
  });

  it("returns the digest and signer address from submit_photo execution", async () => {
    const signer = Ed25519Keypair.generate();
    const signAndExecuteTransaction = vi.fn(async () => ({
      digest: "0xdigest-1",
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
    const submitPhoto = createSubmitPhotoTransactionExecutor({
      client: {
        signAndExecuteTransaction,
        waitForTransaction,
      } as unknown as GeneratorSuiWriteClient,
      packageId: "0xpackage",
      privateKey: signer.getSecretKey(),
    });

    await expect(
      submitPhoto({
        unitId: "0xunit-1",
        blobId: "blob-1",
      }),
    ).resolves.toEqual({
      digest: "0xdigest-1",
      senderAddress: signer.toSuiAddress(),
    });
    expect(signAndExecuteTransaction).toHaveBeenCalledTimes(1);
    expect(waitForTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        digest: "0xdigest-1",
        options: {
          showEffects: true,
        },
      }),
    );
  });

  it("reloads the updated snapshot and fills submissionNo when the row is visible", async () => {
    const submitPhoto = vi.fn(async () => ({
      digest: "0xdigest-1",
      senderAddress: "0xsender-1",
    }));
    const readSeedingSnapshot = vi.fn(async () =>
      snapshot({
        submissions: [
          submission({
            submissionNo: 17,
            submitter: "0xsender-1",
            walrusBlobId: "blob-1",
          }),
        ],
        submittedCount: 1,
        status: "pending",
      }),
    );
    const helper = createProgressAwareSubmissionHelper({
      readSeedingSnapshot,
      submitPhoto,
    });

    await expect(
      helper({
        unitId: "0xunit-1",
        blobId: "blob-1",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        digest: "0xdigest-1",
        senderAddress: "0xsender-1",
        submissionNo: 17,
        submittedCount: 1,
        status: "pending",
      }),
    );
    expect(readSeedingSnapshot).toHaveBeenCalledWith("0xunit-1");
  });

  it("keeps submissionNo null when the updated row is still not visible", async () => {
    const submitPhoto = vi.fn(async () => ({
      digest: "0xdigest-2",
      senderAddress: "0xsender-2",
    }));
    const readSeedingSnapshot = vi.fn(async () =>
      snapshot({
        submissions: [
          submission({
            submissionNo: 18,
            submitter: "0xsender-3",
            walrusBlobId: "blob-3",
          }),
        ],
        submittedCount: 3,
        status: "pending",
      }),
    );
    const helper = createProgressAwareSubmissionHelper({
      readSeedingSnapshot,
      submitPhoto,
    });

    await expect(
      helper({
        unitId: "0xunit-1",
        blobId: "blob-2",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        digest: "0xdigest-2",
        senderAddress: "0xsender-2",
        submissionNo: null,
        submittedCount: 3,
        status: "pending",
      }),
    );
  });

  it("validates the stopping-one-short postcondition", () => {
    expect(() =>
      validateFinalSubmissionPostcondition({
        submittedCount: 4,
        targetCount: 4,
        status: "pending",
      }),
    ).not.toThrow();

    const invalidCases = [
      {
        submittedCount: 3,
        targetCount: 4,
        status: "pending" as const,
      },
      {
        submittedCount: 4,
        targetCount: 4,
        status: "filled" as const,
      },
      {
        submittedCount: 5,
        targetCount: 4,
        status: "pending" as const,
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => validateFinalSubmissionPostcondition(invalidCase)).toThrow();
    }
  });
});

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
