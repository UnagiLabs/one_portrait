import { afterEach, describe, expect, it, vi } from "vitest";

import type { SuiReadClient } from "./client";
import {
  getActiveHomeUnits,
  getRegistryObject,
  listRegistryAthletes,
  RegistryNotFoundError,
  RegistrySchemaError,
} from "./registry";

const REGISTRY_ID = "0xreg";
const UNIT_ONE = "0xunit-1";
const UNIT_TWO = "0xunit-2";

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
        return { data: registryObject({ unit_ids: [UNIT_ONE, UNIT_TWO] }) };
      }) as unknown as SuiReadClient["getObject"],
    });

    await expect(getRegistryObject(REGISTRY_ID, { client })).resolves.toEqual({
      objectId: REGISTRY_ID,
      unitIds: [UNIT_ONE, UNIT_TWO],
    });
  });

  it("throws RegistrySchemaError when unit_ids is missing", async () => {
    const client = makeClient({
      getObject: vi.fn(async () => ({
        data: registryObject({}),
      })) as unknown as SuiReadClient["getObject"],
    });

    await expect(getRegistryObject(REGISTRY_ID, { client })).rejects.toThrow(
      RegistrySchemaError,
    );
    await expect(getRegistryObject(REGISTRY_ID, { client })).rejects.toThrow(
      /missing `unit_ids`/,
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
});

describe("listRegistryAthletes", () => {
  it("projects each unit into an admin-friendly list entry", async () => {
    const client = makeClient({
      getObject: vi.fn(async ({ id }) => {
        if (id === REGISTRY_ID) {
          return { data: registryObject({ unit_ids: [UNIT_ONE, UNIT_TWO] }) };
        }
        if (id === UNIT_ONE) {
          return { data: unitObject(UNIT_ONE, 1, "Demo Athlete One") };
        }
        if (id === UNIT_TWO) {
          return { data: unitObject(UNIT_TWO, 2, "Demo Athlete Two") };
        }
        throw new Error(`unexpected id ${id}`);
      }) as unknown as SuiReadClient["getObject"],
    });

    await expect(
      listRegistryAthletes({ client, registryObjectId: REGISTRY_ID }),
    ).resolves.toEqual([
      {
        currentUnitId: UNIT_ONE,
        metadata: {
          displayName: "Demo Athlete One",
          slug: "unit-unit-1",
          thumbnailUrl: "https://example.com/1.png",
        },
      },
      {
        currentUnitId: UNIT_TWO,
        metadata: {
          displayName: "Demo Athlete Two",
          slug: "unit-unit-2",
          thumbnailUrl: "https://example.com/2.png",
        },
      },
    ]);
  });
});

describe("getActiveHomeUnits", () => {
  it("returns only pending units from the registry index", async () => {
    const client = makeClient({
      getObject: vi.fn(async ({ id }) => {
        if (id === REGISTRY_ID) {
          return { data: registryObject({ unit_ids: [UNIT_ONE, UNIT_TWO] }) };
        }
        if (id === UNIT_ONE) {
          return {
            data: unitObject(UNIT_ONE, 1, "Demo Athlete One", {
              display_max_slots: "2000",
              max_slots: "5",
              submissions: submissionList(2),
            }),
          };
        }
        if (id === UNIT_TWO) {
          return {
            data: unitObject(UNIT_TWO, 2, "Demo Athlete Two", {
              status: 1,
            }),
          };
        }
        throw new Error(`unexpected id ${id}`);
      }) as unknown as SuiReadClient["getObject"],
    });

    await expect(
      getActiveHomeUnits({ client, registryObjectId: REGISTRY_ID }),
    ).resolves.toEqual([
      {
        displayName: "Demo Athlete One",
        maxSlots: 2000,
        submittedCount: 1997,
        thumbnailUrl: "https://example.com/1.png",
        unitId: UNIT_ONE,
      },
    ]);
  });
});

function registryObject(fields: Record<string, unknown>) {
  return {
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
        ...fields,
      },
    },
  };
}

function unitObject(
  unitId: string,
  thumbnailIndex: number,
  displayName: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    objectId: unitId,
    digest: "d",
    version: "1",
    type: "0xpkg::unit::Unit",
    content: {
      dataType: "moveObject",
      hasPublicTransfer: false,
      type: "0xpkg::unit::Unit",
      fields: {
        id: { id: unitId },
        display_name: bytes(displayName),
        thumbnail_url: bytes(`https://example.com/${thumbnailIndex}.png`),
        target_walrus_blob: bytes("target-blob"),
        max_slots: "2000",
        display_max_slots: "2000",
        status: 0,
        master_id: { fields: { vec: [] } },
        submitters: {
          type: "0x2::table::Table<address, bool>",
          fields: { id: { id: "0xsubmitters" }, size: "0" },
        },
        submissions: [],
        ...overrides,
      },
    },
  };
}

function submissionList(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    fields: {
      submission_no: String(index + 1),
      submitter: `0x${index + 1}`,
      submitted_at_ms: "1000",
      walrus_blob_id: bytes(`blob-${index + 1}`),
    },
  }));
}

function bytes(value: string) {
  return Array.from(new TextEncoder().encode(value));
}
