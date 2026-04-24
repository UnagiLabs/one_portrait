import { describe, expect, it, vi } from "vitest";

import {
  checkSubmissionExecution,
  type SubmissionExecutionReadClient,
} from "./submission-execution";

const PACKAGE_ID = "0xpkg";
const OWNER = "0xowner";
const UNIT_ID = "0xunit-1";
const WALRUS_BLOB_ID = "walrus-blob-xyz";
const DIGEST = "0xdigest";

function encodeBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function kakeraObject() {
  return {
    data: {
      objectId: "0xkakera-1",
      digest: "d",
      version: "1",
      type: `${PACKAGE_ID}::kakera::Kakera`,
      content: {
        dataType: "moveObject",
        hasPublicTransfer: false,
        type: `${PACKAGE_ID}::kakera::Kakera`,
        fields: {
          id: { id: "0xkakera-1" },
          unit_id: UNIT_ID,
          submitter: OWNER,
          walrus_blob_id: encodeBytes(WALRUS_BLOB_ID),
          submission_no: "42",
          minted_at_ms: "1700000000000",
        },
      },
    },
  };
}

function makeClient(overrides?: {
  readonly getTransactionBlock?: SubmissionExecutionReadClient["getTransactionBlock"];
  readonly getOwnedObjects?: SubmissionExecutionReadClient["getOwnedObjects"];
}): SubmissionExecutionReadClient {
  return {
    network: "testnet",
    getTransactionBlock:
      overrides?.getTransactionBlock ??
      (vi.fn(async () => ({
        digest: DIGEST,
        effects: null,
      })) as SubmissionExecutionReadClient["getTransactionBlock"]),
    getOwnedObjects:
      overrides?.getOwnedObjects ??
      (vi.fn(async () => ({
        data: [],
        hasNextPage: false,
        nextCursor: null,
      })) as SubmissionExecutionReadClient["getOwnedObjects"]),
  };
}

describe("checkSubmissionExecution", () => {
  it("returns success when the transaction digest resolves with success effects", async () => {
    const getOwnedObjects = vi.fn(async () => ({
      data: [],
      hasNextPage: false,
      nextCursor: null,
    })) as unknown as SubmissionExecutionReadClient["getOwnedObjects"];
    const client = makeClient({
      getTransactionBlock: vi.fn(async () => ({
        digest: DIGEST,
        effects: {
          status: {
            status: "success",
          },
        },
      })) as unknown as SubmissionExecutionReadClient["getTransactionBlock"],
      getOwnedObjects,
    });

    await expect(
      checkSubmissionExecution({
        suiClient: client,
        digest: DIGEST,
        ownerAddress: OWNER,
        unitId: UNIT_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        packageId: PACKAGE_ID,
      }),
    ).resolves.toEqual({
      status: "success",
      kakera: null,
    });

    expect(getOwnedObjects).not.toHaveBeenCalled();
  });

  it("returns success when the digest is still unknown but the Kakera is already visible", async () => {
    const client = makeClient({
      getTransactionBlock: vi.fn(async () => {
        throw new Error("transaction not found yet");
      }) as unknown as SubmissionExecutionReadClient["getTransactionBlock"],
      getOwnedObjects: vi.fn(async () => ({
        data: [kakeraObject()],
        hasNextPage: false,
        nextCursor: null,
      })) as unknown as SubmissionExecutionReadClient["getOwnedObjects"],
    });

    await expect(
      checkSubmissionExecution({
        suiClient: client,
        digest: DIGEST,
        ownerAddress: OWNER,
        unitId: UNIT_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        packageId: PACKAGE_ID,
      }),
    ).resolves.toEqual({
      status: "success",
      kakera: {
        objectId: "0xkakera-1",
        unitId: UNIT_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        submissionNo: 42,
        mintedAtMs: 1700000000000,
      },
    });
  });

  it("returns recovering while the fullnode has not surfaced either the digest or the Kakera yet", async () => {
    const client = makeClient({
      getTransactionBlock: vi.fn(async () => {
        throw new Error("transaction not found");
      }) as unknown as SubmissionExecutionReadClient["getTransactionBlock"],
    });

    await expect(
      checkSubmissionExecution({
        suiClient: client,
        digest: DIGEST,
        ownerAddress: OWNER,
        unitId: UNIT_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        packageId: PACKAGE_ID,
      }),
    ).resolves.toEqual({
      status: "recovering",
      kakera: null,
    });
  });

  it("returns recovering on temporary RPC failures", async () => {
    const client = makeClient({
      getTransactionBlock: vi.fn(async () => {
        throw new Error("rpc timeout");
      }) as unknown as SubmissionExecutionReadClient["getTransactionBlock"],
      getOwnedObjects: vi.fn(async () => {
        throw new Error("rpc unavailable");
      }) as unknown as SubmissionExecutionReadClient["getOwnedObjects"],
    });

    await expect(
      checkSubmissionExecution({
        suiClient: client,
        digest: DIGEST,
        ownerAddress: OWNER,
        unitId: UNIT_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        packageId: PACKAGE_ID,
      }),
    ).resolves.toEqual({
      status: "recovering",
      kakera: null,
    });
  });

  it("returns failed only when the digest is confirmed with failure effects", async () => {
    const getOwnedObjects = vi.fn(async () => ({
      data: [kakeraObject()],
      hasNextPage: false,
      nextCursor: null,
    })) as unknown as SubmissionExecutionReadClient["getOwnedObjects"];
    const client = makeClient({
      getTransactionBlock: vi.fn(async () => ({
        digest: DIGEST,
        effects: {
          status: {
            status: "failure",
          },
        },
      })) as unknown as SubmissionExecutionReadClient["getTransactionBlock"],
      getOwnedObjects,
    });

    await expect(
      checkSubmissionExecution({
        suiClient: client,
        digest: DIGEST,
        ownerAddress: OWNER,
        unitId: UNIT_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        packageId: PACKAGE_ID,
      }),
    ).resolves.toEqual({
      status: "failed",
      kakera: null,
    });

    expect(getOwnedObjects).not.toHaveBeenCalled();
  });
});
