import { unitTileCount } from "@one-portrait/shared";
import { describe, expect, it, vi } from "vitest";

import type { SuiReadClient } from "./client";
import { getGalleryEntry, getMasterPlacement } from "./gallery";
import type { OwnedKakera } from "./kakera";

const UNIT_ID = "0xunit-1";
const MASTER_ID = "0xmaster-1";
const PLACEMENTS_TABLE_ID = "0xplacements";
const WALRUS_BLOB_ID = "walrus-blob-xyz";
const MOSAIC_BLOB_ID = "mosaic-blob-abc";
const SUBMISSION_NO = 42;
const SUBMITTER = "0xsubmitter";

function encodeBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function ownedKakera(overrides: Partial<OwnedKakera> = {}): OwnedKakera {
  return {
    objectId: "0xkakera-1",
    athletePublicId: "7",
    unitId: UNIT_ID,
    walrusBlobId: WALRUS_BLOB_ID,
    submissionNo: SUBMISSION_NO,
    mintedAtMs: 1700000000000,
    ...overrides,
  };
}

function unitObject(overrides: Partial<Record<string, unknown>> = {}) {
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
        athlete_id: 7,
        target_walrus_blob: [],
        max_slots: String(unitTileCount),
        status: 2,
        master_id: { fields: { vec: [MASTER_ID] } },
        submitters: {
          type: "0x2::table::Table<address, bool>",
          fields: { id: { id: "0xsubmitters" }, size: "1" },
        },
        submissions: [],
        ...overrides,
      },
    },
  };
}

function masterObject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    objectId: MASTER_ID,
    digest: "d",
    version: "1",
    type: "0xpkg::master_portrait::MasterPortrait",
    content: {
      dataType: "moveObject",
      hasPublicTransfer: true,
      type: "0xpkg::master_portrait::MasterPortrait",
      fields: {
        id: { id: MASTER_ID },
        unit_id: UNIT_ID,
        athlete_id: 7,
        mosaic_walrus_blob_id: encodeBytes(MOSAIC_BLOB_ID),
        placements: {
          type: "0x2::table::Table<vector<u8>, 0xpkg::master_portrait::Placement>",
          fields: { id: { id: PLACEMENTS_TABLE_ID }, size: "1" },
        },
        ...overrides,
      },
    },
  };
}

function placementField(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    objectId: "0xfield-1",
    digest: "d",
    version: "1",
    type: "0x2::dynamic_field::Field<vector<u8>, 0xpkg::master_portrait::Placement>",
    content: {
      dataType: "moveObject",
      hasPublicTransfer: false,
      type: "0x2::dynamic_field::Field<vector<u8>, 0xpkg::master_portrait::Placement>",
      fields: {
        id: { id: "0xfield-1" },
        name: encodeBytes(WALRUS_BLOB_ID),
        value: {
          type: "0xpkg::master_portrait::Placement",
          fields: {
            x: "12",
            y: 34,
            submitter: SUBMITTER,
            submission_no: String(SUBMISSION_NO),
            ...overrides,
          },
        },
      },
    },
  };
}

function makeClient(options?: {
  readonly getObject?: SuiReadClient["getObject"];
  readonly getDynamicFieldObject?: SuiReadClient["getDynamicFieldObject"];
}): SuiReadClient {
  const getObject =
    options?.getObject ??
    (vi.fn(async ({ id }) => {
      if (id === UNIT_ID) {
        return { data: unitObject() };
      }
      if (id === MASTER_ID) {
        return { data: masterObject() };
      }
      throw new Error(`unexpected getObject id: ${String(id)}`);
    }) as unknown as SuiReadClient["getObject"]);

  const getDynamicFieldObject =
    options?.getDynamicFieldObject ??
    (vi.fn(async ({ parentId, name }) => {
      expect(parentId).toBe(PLACEMENTS_TABLE_ID);
      expect(name).toEqual({
        type: "vector<u8>",
        value: encodeBytes(WALRUS_BLOB_ID),
      });
      return { data: placementField() };
    }) as unknown as SuiReadClient["getDynamicFieldObject"]);

  return {
    network: "testnet",
    getObject,
    getDynamicFieldObject,
  } as SuiReadClient;
}

describe("getGalleryEntry", () => {
  it("returns a pending entry when the unit has no master_id yet", async () => {
    const client = makeClient({
      getObject: vi.fn(async ({ id }) => {
        expect(id).toBe(UNIT_ID);
        return {
          data: unitObject({
            status: 1,
            master_id: { fields: { vec: [] } },
          }),
        };
      }) as unknown as SuiReadClient["getObject"],
      getDynamicFieldObject: vi.fn(async () => {
        throw new Error("dynamic field should not be queried");
      }) as unknown as SuiReadClient["getDynamicFieldObject"],
    });

    await expect(
      getGalleryEntry({
        kakera: ownedKakera(),
        client,
      }),
    ).resolves.toEqual({
      unitId: UNIT_ID,
      athletePublicId: "7",
      walrusBlobId: WALRUS_BLOB_ID,
      submissionNo: SUBMISSION_NO,
      mintedAtMs: 1700000000000,
      masterId: null,
      mosaicWalrusBlobId: null,
      placement: null,
      status: { kind: "pending" },
    });
  });

  it("returns a completed entry with placement coordinates when reverse lookup succeeds", async () => {
    const client = makeClient();

    await expect(
      getGalleryEntry({
        kakera: ownedKakera(),
        client,
      }),
    ).resolves.toEqual({
      unitId: UNIT_ID,
      athletePublicId: "7",
      walrusBlobId: WALRUS_BLOB_ID,
      submissionNo: SUBMISSION_NO,
      mintedAtMs: 1700000000000,
      masterId: MASTER_ID,
      mosaicWalrusBlobId: MOSAIC_BLOB_ID,
      placement: {
        x: 12,
        y: 34,
        submitter: SUBMITTER,
        submissionNo: SUBMISSION_NO,
      },
      status: { kind: "completed" },
    });
  });

  it("returns a completed entry with null placement when the blob reverse lookup is missing", async () => {
    const client = makeClient({
      getDynamicFieldObject: vi.fn(async () => ({
        error: { code: "dynamicFieldNotFound" } as never,
      })) as unknown as SuiReadClient["getDynamicFieldObject"],
    });

    await expect(
      getGalleryEntry({
        kakera: ownedKakera(),
        client,
      }),
    ).resolves.toEqual({
      unitId: UNIT_ID,
      athletePublicId: "7",
      walrusBlobId: WALRUS_BLOB_ID,
      submissionNo: SUBMISSION_NO,
      mintedAtMs: 1700000000000,
      masterId: MASTER_ID,
      mosaicWalrusBlobId: MOSAIC_BLOB_ID,
      placement: null,
      status: { kind: "completed" },
    });
  });
});

describe("getMasterPlacement", () => {
  it("propagates transport errors from the placement lookup", async () => {
    const client = makeClient({
      getDynamicFieldObject: vi.fn(async () => {
        throw new Error("rpc down");
      }) as unknown as SuiReadClient["getDynamicFieldObject"],
    });

    await expect(
      getMasterPlacement({
        masterId: MASTER_ID,
        walrusBlobId: WALRUS_BLOB_ID,
        client,
      }),
    ).rejects.toThrow(/rpc down/);
  });
});
