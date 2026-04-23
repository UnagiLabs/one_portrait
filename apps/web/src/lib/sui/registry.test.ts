import { afterEach, describe, expect, it, vi } from "vitest";

import type { SuiReadClient } from "./client";
import {
  getActiveHomeUnits,
  getCurrentUnitIdForAthlete,
  getRegistryObject,
  listRegistryAthletes,
  RegistryNotFoundError,
  RegistrySchemaError,
} from "./registry";

const REGISTRY_ID = "0xreg";

function makeClient(overrides: Partial<SuiReadClient> = {}): SuiReadClient {
  const reject = vi.fn(async () => {
    throw new Error("unexpected call");
  });
  return {
    network: "testnet",
    getDynamicFields: reject,
    getObject: reject,
    getDynamicFieldObject: reject,
    ...overrides,
  } as SuiReadClient;
}

afterEach(() => {
  vi.restoreAllMocks();
});

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
                athlete_metadata: {
                  type: "0x2::table::Table<u16, 0xpkg::registry::AthleteMetadata>",
                  fields: { id: { id: "0xmetadata" }, size: "2" },
                },
                current_units: {
                  type: "0x2::table::Table<u16, 0x2::object::ID>",
                  fields: { id: { id: "0xtable" }, size: "2" },
                },
                slug_to_athlete: {
                  type: "0x2::table::Table<vector<u8>, u16>",
                  fields: { id: { id: "0xslug" }, size: "2" },
                },
              },
            },
          },
        };
      }) as unknown as SuiReadClient["getObject"],
    });

    const view = await getRegistryObject(REGISTRY_ID, { client });

    expect(view.objectId).toBe(REGISTRY_ID);
    expect(view.athleteMetadataTableId).toBe("0xmetadata");
    expect(view.currentUnitsTableId).toBe("0xtable");
  });

  it("throws RegistrySchemaError when athlete_metadata is missing", async () => {
    const client = makeClient({
      getObject: vi.fn(async () => ({
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
              slug_to_athlete: {
                type: "0x2::table::Table<vector<u8>, u16>",
                fields: { id: { id: "0xslug" }, size: "0" },
              },
            },
          },
        },
      })) as unknown as SuiReadClient["getObject"],
    });

    await expect(getRegistryObject(REGISTRY_ID, { client })).rejects.toThrow(
      RegistrySchemaError,
    );
    await expect(getRegistryObject(REGISTRY_ID, { client })).rejects.toThrow(
      /missing `athlete_metadata`/,
    );
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

describe("listRegistryAthletes", () => {
  it("returns the union of current units and on-chain metadata", async () => {
    const client = makeClient({
      getDynamicFieldObject: vi.fn(async ({ parentId, name }) => {
        if (parentId === "0xtable") {
          if (name.value === 1) {
            return dynamicUnitField(1, "0xunit-1");
          }
          return { error: { code: "dynamicFieldNotFound" } as never };
        }

        if (name.value === 1) {
          return dynamicMetadataField(1, {
            displayName: "Demo Athlete One",
            slug: "demo-athlete-one",
            thumbnailUrl: "https://example.com/1.png",
          });
        }

        if (name.value === 2) {
          return dynamicMetadataField(2, {
            displayName: "Demo Athlete Two",
            slug: "demo-athlete-two",
            thumbnailUrl: "https://example.com/2.png",
          });
        }

        return { error: { code: "dynamicFieldNotFound" } as never };
      }) as unknown as SuiReadClient["getDynamicFieldObject"],
      getDynamicFields: vi.fn(async ({ parentId }) => {
        if (parentId === "0xtable") {
          return {
            data: [{ objectId: "0xfield-1", name: { type: "u16", value: 1 } }],
            hasNextPage: false,
            nextCursor: null,
          };
        }

        return {
          data: [
            { objectId: "0xfield-1-metadata", name: { type: "u16", value: 1 } },
            { objectId: "0xfield-2-metadata", name: { type: "u16", value: 2 } },
          ],
          hasNextPage: false,
          nextCursor: null,
        };
      }) as unknown as SuiReadClient["getDynamicFields"],
      getObject: vi.fn(async () =>
        registryObject(),
      ) as unknown as SuiReadClient["getObject"],
    });

    const athletes = await listRegistryAthletes({
      client,
      registryObjectId: REGISTRY_ID,
    });

    expect(athletes).toEqual([
      {
        athletePublicId: "1",
        currentUnitId: "0xunit-1",
        metadata: {
          athletePublicId: "1",
          displayName: "Demo Athlete One",
          slug: "demo-athlete-one",
          thumbnailUrl: "https://example.com/1.png",
        },
      },
      {
        athletePublicId: "2",
        currentUnitId: null,
        metadata: {
          athletePublicId: "2",
          displayName: "Demo Athlete Two",
          slug: "demo-athlete-two",
          thumbnailUrl: "https://example.com/2.png",
        },
      },
    ]);
  });
});

describe("getActiveHomeUnits", () => {
  it("returns only pending units with registered metadata", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const client = makeClient({
      getDynamicFieldObject: vi.fn(async ({ parentId, name }) => {
        if (parentId === "0xtable") {
          return dynamicUnitField(
            Number(name.value),
            name.value === 1 ? "0xunit-1" : "0xunit-2",
          );
        }

        if (name.value === 1) {
          return dynamicMetadataField(1, {
            displayName: "Demo Athlete One",
            slug: "demo-athlete-one",
            thumbnailUrl: "https://example.com/1.png",
          });
        }

        return { error: { code: "dynamicFieldNotFound" } as never };
      }) as unknown as SuiReadClient["getDynamicFieldObject"],
      getDynamicFields: vi.fn(async ({ parentId }) => ({
        data:
          parentId === "0xtable"
            ? [
                { objectId: "0xfield-1", name: { type: "u16", value: 1 } },
                { objectId: "0xfield-2", name: { type: "u16", value: 2 } },
              ]
            : [
                {
                  objectId: "0xfield-1-metadata",
                  name: { type: "u16", value: 1 },
                },
              ],
        hasNextPage: false,
        nextCursor: null,
      })) as unknown as SuiReadClient["getDynamicFields"],
      getObject: vi.fn(async ({ id }) =>
        id === REGISTRY_ID
          ? registryObject({
              athleteMetadataSize: "1",
              currentUnitsSize: "2",
            })
          : unitObject(id),
      ) as unknown as SuiReadClient["getObject"],
    });

    const units = await getActiveHomeUnits({
      client,
      registryObjectId: REGISTRY_ID,
    });

    expect(units).toEqual([
      {
        athletePublicId: "1",
        displayName: "Demo Athlete One",
        slug: "demo-athlete-one",
        thumbnailUrl: "https://example.com/1.png",
        maxSlots: 2000,
        submittedCount: 12,
        unitId: "0xunit-1",
      },
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      "Skipping athlete 2 on home because metadata is missing.",
    );
  });
});

function registryObject(
  overrides: Partial<{
    readonly athleteMetadataSize: string;
    readonly currentUnitsSize: string;
  }> = {},
) {
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
          athlete_metadata: {
            type: "0x2::table::Table<u16, 0xpkg::registry::AthleteMetadata>",
            fields: {
              id: { id: "0xmetadata" },
              size: overrides.athleteMetadataSize ?? "2",
            },
          },
          current_units: {
            type: "0x2::table::Table<u16, 0x2::object::ID>",
            fields: {
              id: { id: "0xtable" },
              size: overrides.currentUnitsSize ?? "1",
            },
          },
          slug_to_athlete: {
            type: "0x2::table::Table<vector<u8>, u16>",
            fields: {
              id: { id: "0xslug" },
              size: overrides.athleteMetadataSize ?? "2",
            },
          },
        },
      },
    },
  };
}

function dynamicUnitField(athleteId: number, unitId: string) {
  return {
    data: {
      objectId: `0xfield-${athleteId}`,
      digest: "d",
      version: "1",
      content: {
        dataType: "moveObject",
        hasPublicTransfer: false,
        type: "0x2::dynamic_field::Field<u16, 0x2::object::ID>",
        fields: {
          id: { id: `0xfield-${athleteId}` },
          name: athleteId,
          value: unitId,
        },
      },
    },
  };
}

function dynamicMetadataField(
  athleteId: number,
  metadata: {
    readonly displayName: string;
    readonly slug: string;
    readonly thumbnailUrl: string;
  },
) {
  return {
    data: {
      objectId: `0xfield-${athleteId}-metadata`,
      digest: "d",
      version: "1",
      content: {
        dataType: "moveObject",
        hasPublicTransfer: false,
        type: "0x2::dynamic_field::Field<u16, 0xpkg::registry::AthleteMetadata>",
        fields: {
          id: { id: `0xfield-${athleteId}-metadata` },
          name: athleteId,
          value: {
            fields: {
              display_name: Array.from(
                new TextEncoder().encode(metadata.displayName),
              ),
              slug: Array.from(new TextEncoder().encode(metadata.slug)),
              thumbnail_url: Array.from(
                new TextEncoder().encode(metadata.thumbnailUrl),
              ),
            },
          },
        },
      },
    },
  };
}

function unitObject(id: string) {
  const submittedCount = id === "0xunit-1" ? 12 : 2000;
  const status = id === "0xunit-1" ? 0 : 1;
  const athleteId = id === "0xunit-1" ? 1 : 2;

  return {
    data: {
      objectId: id,
      digest: "d",
      version: "1",
      type: "0xpkg::unit::Unit",
      content: {
        dataType: "moveObject",
        hasPublicTransfer: false,
        type: "0xpkg::unit::Unit",
        fields: {
          athlete_id: athleteId,
          master_id: { fields: { vec: [] } },
          max_slots: "2000",
          status,
          submissions: new Array(submittedCount).fill({}),
        },
      },
    },
  };
}
