import { unitTileCount } from "@one-portrait/shared";
import { describe, expect, it, vi } from "vitest";

import type { SuiReadClient } from "./client";
import { getUnitProgress, UnitNotFoundError } from "./unit";

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
        athlete_id: 1,
        target_walrus_blob: [],
        max_slots: String(unitTileCount),
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

describe("getUnitProgress", () => {
  it("returns view model with status pending for an empty unit", async () => {
    const client = clientReturning(unitData({}));

    const view = await getUnitProgress(UNIT_ID, { client });

    expect(view).toEqual({
      unitId: UNIT_ID,
      athletePublicId: "1",
      submittedCount: 0,
      maxSlots: unitTileCount,
      status: "pending",
      masterId: null,
    });
  });

  it("derives submittedCount from the submissions vector length", async () => {
    const client = clientReturning(
      unitData({
        submissions: [
          { fields: { walrus_blob_id: [], submission_no: "1" } },
          { fields: { walrus_blob_id: [], submission_no: "2" } },
          { fields: { walrus_blob_id: [], submission_no: "3" } },
        ],
      }),
    );

    const view = await getUnitProgress(UNIT_ID, { client });

    expect(view.submittedCount).toBe(3);
  });

  it("maps Move status u8 1 to 'filled'", async () => {
    const client = clientReturning(unitData({ status: 1 }));

    const view = await getUnitProgress(UNIT_ID, { client });

    expect(view.status).toBe("filled");
  });

  it("maps Move status u8 2 to 'finalized' and exposes masterId", async () => {
    const client = clientReturning(
      unitData({
        status: 2,
        master_id: { fields: { vec: ["0xmaster"] } },
      }),
    );

    const view = await getUnitProgress(UNIT_ID, { client });

    expect(view.status).toBe("finalized");
    expect(view.masterId).toBe("0xmaster");
  });

  it("throws UnitNotFoundError when the response has no data", async () => {
    const client = clientReturning(null);

    await expect(getUnitProgress(UNIT_ID, { client })).rejects.toThrow(
      UnitNotFoundError,
    );
  });

  it("propagates transport errors", async () => {
    const client = {
      network: "testnet",
      getObject: vi.fn(async () => {
        throw new Error("rpc down");
      }),
      getDynamicFieldObject: vi.fn(),
    } as unknown as SuiReadClient;

    await expect(getUnitProgress(UNIT_ID, { client })).rejects.toThrow(
      /rpc down/,
    );
  });
});
