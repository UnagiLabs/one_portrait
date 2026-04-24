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
        display_name: bytes("Demo Athlete One"),
        thumbnail_url: bytes("https://example.com/1.png"),
        target_walrus_blob: [],
        max_slots: "5",
        display_max_slots: "2000",
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
  it("returns the display-facing progress model", async () => {
    const client = clientReturning(
      unitData({
        submissions: [{ fields: { walrus_blob_id: [], submission_no: "1" } }],
      }),
    );

    await expect(getUnitProgress(UNIT_ID, { client })).resolves.toEqual({
      unitId: UNIT_ID,
      athletePublicId: "1",
      displayName: "Demo Athlete One",
      masterId: null,
      maxSlots: 2000,
      realMaxSlots: 5,
      realSubmittedCount: 1,
      status: "pending",
      submittedCount: 1996,
      thumbnailUrl: "https://example.com/1.png",
    });
  });

  it("maps finalized status and exposes masterId", async () => {
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
});

function bytes(value: string) {
  return Array.from(new TextEncoder().encode(value));
}
