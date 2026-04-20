import { describe, expect, it, vi } from "vitest";

import type { SuiReadClient } from "./client";
import {
  getCurrentUnitIdForAthlete,
  getRegistryObject,
  RegistryNotFoundError,
} from "./registry";

const REGISTRY_ID = "0xreg";

function makeClient(overrides: Partial<SuiReadClient> = {}): SuiReadClient {
  // Default to throwing so tests must provide a stub for any call they hit.
  const reject = vi.fn(async () => {
    throw new Error("unexpected call");
  });
  return {
    network: "testnet",
    getObject: reject,
    getDynamicFieldObject: reject,
    ...overrides,
  } as SuiReadClient;
}

describe("getRegistryObject", () => {
  it("returns the registry view from a successful response", async () => {
    const client = makeClient({
      getObject: vi.fn(async ({ id }) => {
        expect(id).toBe(REGISTRY_ID);
        return {
          data: {
            objectId: REGISTRY_ID,
            digest: "d",
            version: "1",
            type: "0xpkg::registry::Registry",
            content: {
              dataType: "moveObject",
              hasPublicTransfer: false,
              type: "0xpkg::registry::Registry",
              fields: {
                id: { id: REGISTRY_ID },
                current_units: {
                  type: "0x2::table::Table<u16, 0x2::object::ID>",
                  fields: { id: { id: "0xtable" }, size: "2" },
                },
              },
            },
          },
        };
      }) as unknown as SuiReadClient["getObject"],
    });

    const view = await getRegistryObject(REGISTRY_ID, { client });

    expect(view.objectId).toBe(REGISTRY_ID);
    expect(view.currentUnitsTableId).toBe("0xtable");
  });

  it("throws RegistryNotFoundError when the response carries no data", async () => {
    const client = makeClient({
      getObject: vi.fn(async () => ({
        error: { code: "notExists" } as never,
      })) as unknown as SuiReadClient["getObject"],
    });

    await expect(getRegistryObject(REGISTRY_ID, { client })).rejects.toThrow(
      RegistryNotFoundError,
    );
  });

  it("propagates transport errors", async () => {
    const client = makeClient({
      getObject: vi.fn(async () => {
        throw new Error("rpc down");
      }) as unknown as SuiReadClient["getObject"],
    });

    await expect(getRegistryObject(REGISTRY_ID, { client })).rejects.toThrow(
      /rpc down/,
    );
  });
});

describe("getCurrentUnitIdForAthlete", () => {
  it("returns the unit id when the dynamic field exists", async () => {
    const client = makeClient({
      getDynamicFieldObject: vi.fn(async ({ parentId, name }) => {
        expect(parentId).toBe("0xtable");
        expect(name).toEqual({ type: "u16", value: 1 });
        return {
          data: {
            objectId: "0xfield",
            digest: "d",
            version: "1",
            content: {
              dataType: "moveObject",
              hasPublicTransfer: false,
              type: "0x2::dynamic_field::Field<u16, 0x2::object::ID>",
              fields: {
                id: { id: "0xfield" },
                name: 1,
                value: "0xunit-1",
              },
            },
          },
        };
      }) as unknown as SuiReadClient["getDynamicFieldObject"],
    });

    const unitId = await getCurrentUnitIdForAthlete("1", {
      client,
      currentUnitsTableId: "0xtable",
    });

    expect(unitId).toBe("0xunit-1");
  });

  it("returns null when no dynamic field exists for the athlete id", async () => {
    const client = makeClient({
      getDynamicFieldObject: vi.fn(async () => ({
        error: { code: "dynamicFieldNotFound" } as never,
      })) as unknown as SuiReadClient["getDynamicFieldObject"],
    });

    const unitId = await getCurrentUnitIdForAthlete("999", {
      client,
      currentUnitsTableId: "0xtable",
    });

    expect(unitId).toBeNull();
  });

  it("rejects athletePublicId values outside the on-chain u16 range", async () => {
    const client = makeClient();

    await expect(
      getCurrentUnitIdForAthlete("65536", {
        client,
        currentUnitsTableId: "0xtable",
      }),
    ).rejects.toThrow(/u16/);
  });

  it("rejects non-numeric athletePublicId values", async () => {
    const client = makeClient();

    await expect(
      getCurrentUnitIdForAthlete("abc", {
        client,
        currentUnitsTableId: "0xtable",
      }),
    ).rejects.toThrow(/decimal/);
  });
});
