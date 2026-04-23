import { describe, expect, it, vi } from "vitest";
import { getAdminUnitSnapshot, UnitNotFoundError } from "./admin-unit";
import type { SuiReadClient } from "./client";

const UNIT_ID = "0xunit-1";

function clientReturning(data: Record<string, unknown> | null): SuiReadClient {
  return {
    network: "testnet",
    getObject: vi.fn(async ({ id }) => {
      expect(id).toBe(UNIT_ID);
      if (data === null) {
        return { error: { code: "notExists" } as never };
      }
      return { data };
    }),
    getDynamicFieldObject: vi.fn(async () => {
      throw new Error("not used");
    }),
  } as unknown as SuiReadClient;
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
        athlete_id: 7,
        target_walrus_blob: Array.from(
          new TextEncoder().encode("target-blob-007"),
        ),
        max_slots: "2000",
        status: 0,
        master_id: { fields: { vec: [] } },
        submitters: {
          type: "0x2::table::Table<address, bool>",
          fields: { id: { id: "0xsubmitters" }, size: "0" },
        },
        submissions: [
          {
            submission_no: "1",
            submitter: "0x1",
            submitted_at_ms: "1000",
            walrus_blob_id: [],
          },
        ],
        ...fields,
      },
    },
  };
}

describe("getAdminUnitSnapshot", () => {
  it("returns the admin read model including targetWalrusBlobId", async () => {
    const client = clientReturning(unitData({}));

    await expect(getAdminUnitSnapshot(UNIT_ID, { client })).resolves.toEqual({
      athletePublicId: "7",
      masterId: null,
      maxSlots: 2000,
      status: "pending",
      submittedCount: 1,
      targetWalrusBlobId: "target-blob-007",
      unitId: UNIT_ID,
    });
  });

  it("maps filled and finalized statuses", async () => {
    const filledClient = clientReturning(unitData({ status: 1 }));
    const finalizedClient = clientReturning(
      unitData({
        master_id: { fields: { vec: ["0xmaster"] } },
        status: 2,
      }),
    );

    await expect(
      getAdminUnitSnapshot(UNIT_ID, { client: filledClient }),
    ).resolves.toMatchObject({
      status: "filled",
    });
    await expect(
      getAdminUnitSnapshot(UNIT_ID, { client: finalizedClient }),
    ).resolves.toMatchObject({
      masterId: "0xmaster",
      status: "finalized",
    });
  });

  it("throws UnitNotFoundError when the unit is missing", async () => {
    const client = clientReturning(null);

    await expect(getAdminUnitSnapshot(UNIT_ID, { client })).rejects.toThrow(
      UnitNotFoundError,
    );
  });
});
