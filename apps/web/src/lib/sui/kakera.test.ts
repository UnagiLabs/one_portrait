import { describe, expect, it, vi } from "vitest";

import { findKakeraForSubmission, type KakeraOwnedClient } from "./kakera";

const PACKAGE_ID = "0xpkg";
const OWNER = "0xowner";
const UNIT_ID = "0xunit-1";
const WALRUS_BLOB_ID = "walrus-blob-xyz";

/**
 * `vector<u8>` serializes in `showContent` responses as an array of byte
 * integers. The Move side stores the Walrus blob id as UTF-8 bytes of the
 * string returned by the Publisher (see `lib/enoki/submit-photo.ts`), so
 * tests mirror the same shape.
 */
function encodeBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function kakeraObject(overrides: {
  readonly type?: string;
  readonly fields?: Partial<{
    unit_id: unknown;
    walrus_blob_id: unknown;
    submission_no: unknown;
    submitter: unknown;
  }>;
  readonly objectId?: string;
}) {
  return {
    data: {
      objectId: overrides.objectId ?? "0xkakera-1",
      digest: "d",
      version: "1",
      type: overrides.type ?? `${PACKAGE_ID}::kakera::Kakera`,
      content: {
        dataType: "moveObject",
        hasPublicTransfer: false,
        type: overrides.type ?? `${PACKAGE_ID}::kakera::Kakera`,
        fields: {
          id: { id: overrides.objectId ?? "0xkakera-1" },
          unit_id: UNIT_ID,
          athlete_id: 1,
          submitter: OWNER,
          walrus_blob_id: encodeBytes(WALRUS_BLOB_ID),
          submission_no: "42",
          minted_at_ms: "1700000000000",
          ...overrides.fields,
        },
      },
    },
  };
}

function clientReturning(
  objects: ReadonlyArray<ReturnType<typeof kakeraObject>>,
): KakeraOwnedClient {
  return {
    getOwnedObjects: vi.fn(async ({ owner }) => {
      expect(owner).toBe(OWNER);
      return {
        data: objects,
        hasNextPage: false,
        nextCursor: null,
      };
    }),
  } as unknown as KakeraOwnedClient;
}

describe("findKakeraForSubmission", () => {
  it("returns the matching Kakera when type / unit_id / walrus_blob_id all align", async () => {
    const client = clientReturning([kakeraObject({})]);

    const result = await findKakeraForSubmission({
      suiClient: client,
      ownerAddress: OWNER,
      unitId: UNIT_ID,
      walrusBlobId: WALRUS_BLOB_ID,
      packageId: PACKAGE_ID,
    });

    expect(result).not.toBeNull();
    expect(result?.objectId).toBe("0xkakera-1");
    expect(result?.unitId).toBe(UNIT_ID);
    expect(result?.walrusBlobId).toBe(WALRUS_BLOB_ID);
    expect(result?.submissionNo).toBe(42);
  });

  it("returns null when the object type is not Kakera", async () => {
    const client = clientReturning([
      kakeraObject({ type: `${PACKAGE_ID}::kakera::NotKakera` }),
    ]);

    const result = await findKakeraForSubmission({
      suiClient: client,
      ownerAddress: OWNER,
      unitId: UNIT_ID,
      walrusBlobId: WALRUS_BLOB_ID,
      packageId: PACKAGE_ID,
    });

    expect(result).toBeNull();
  });

  it("returns null when the Kakera belongs to another unit", async () => {
    const client = clientReturning([
      kakeraObject({ fields: { unit_id: "0xunit-other" } }),
    ]);

    const result = await findKakeraForSubmission({
      suiClient: client,
      ownerAddress: OWNER,
      unitId: UNIT_ID,
      walrusBlobId: WALRUS_BLOB_ID,
      packageId: PACKAGE_ID,
    });

    expect(result).toBeNull();
  });

  it("returns null when the walrus_blob_id does not match", async () => {
    const client = clientReturning([
      kakeraObject({
        fields: { walrus_blob_id: encodeBytes("walrus-blob-other") },
      }),
    ]);

    const result = await findKakeraForSubmission({
      suiClient: client,
      ownerAddress: OWNER,
      unitId: UNIT_ID,
      walrusBlobId: WALRUS_BLOB_ID,
      packageId: PACKAGE_ID,
    });

    expect(result).toBeNull();
  });

  it("returns null when the owner has no objects", async () => {
    const client = clientReturning([]);

    const result = await findKakeraForSubmission({
      suiClient: client,
      ownerAddress: OWNER,
      unitId: UNIT_ID,
      walrusBlobId: WALRUS_BLOB_ID,
      packageId: PACKAGE_ID,
    });

    expect(result).toBeNull();
  });

  it("skips non-Kakera objects and returns the matching one", async () => {
    const client = clientReturning([
      kakeraObject({ type: "0xpkg::other::Thing", objectId: "0xother" }),
      kakeraObject({ objectId: "0xkakera-real" }),
    ]);

    const result = await findKakeraForSubmission({
      suiClient: client,
      ownerAddress: OWNER,
      unitId: UNIT_ID,
      walrusBlobId: WALRUS_BLOB_ID,
      packageId: PACKAGE_ID,
    });

    expect(result?.objectId).toBe("0xkakera-real");
  });
});
