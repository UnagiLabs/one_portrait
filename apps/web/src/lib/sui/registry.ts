/**
 * Read helpers for the on-chain `Registry` shared object.
 *
 * Error contract (kept consistent with the rest of `lib/sui`):
 *   - Object missing entirely  → throw {@link RegistryNotFoundError}.
 *   - Dynamic field absent     → return `null` (semantically: "no current
 *     unit yet for this athlete"). This is a normal pre-launch state.
 *   - Transport failure        → propagate the underlying SDK error.
 *
 * The boundary lives here so screens can write `if (unitId === null) ...`
 * for the empty case but still rely on `try/catch` for unexpected outages.
 */

import { loadPublicEnv } from "../env";
import { getSuiClient, type SuiReadClient } from "./client";
import type { RegistryView } from "./types";

export class RegistryNotFoundError extends Error {
  constructor(public readonly objectId: string) {
    super(`Registry object not found: ${objectId}`);
    this.name = "RegistryNotFoundError";
  }
}

export async function getRegistryObject(
  objectId?: string,
  options?: { client?: SuiReadClient },
): Promise<RegistryView> {
  const id = objectId ?? loadPublicEnv(process.env).registryObjectId;
  const client = options?.client ?? getSuiClient();

  const response = await client.getObject({
    id,
    options: { showContent: true, showType: true },
  });

  const data = response.data;
  if (!data?.content) {
    throw new RegistryNotFoundError(id);
  }

  const tableId = extractCurrentUnitsTableId(data.content);
  return {
    objectId: data.objectId,
    currentUnitsTableId: tableId,
  };
}

export async function getCurrentUnitIdForAthlete(
  athletePublicId: string,
  options: {
    client?: SuiReadClient;
    /**
     * Pass the table id when you've already fetched the registry — saves a
     * round-trip. When omitted, this helper does the registry lookup itself.
     */
    currentUnitsTableId?: string;
    registryObjectId?: string;
  } = {},
): Promise<string | null> {
  const value = parseAthleteU16(athletePublicId);
  const client = options.client ?? getSuiClient();
  const tableId =
    options.currentUnitsTableId ??
    (await getRegistryObject(options.registryObjectId, { client }))
      .currentUnitsTableId;

  const response = await client.getDynamicFieldObject({
    parentId: tableId,
    name: { type: "u16", value },
  });

  const data = response.data;
  if (!data?.content) {
    return null;
  }

  return extractDynamicFieldIdValue(data.content);
}

function parseAthleteU16(athletePublicId: string): number {
  if (!/^[0-9]+$/.test(athletePublicId)) {
    throw new Error(
      `athletePublicId must be a decimal string (got "${athletePublicId}").`,
    );
  }
  const value = Number(athletePublicId);
  if (!Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new Error(
      `athletePublicId must fit in u16 [0, 65535] (got ${athletePublicId}).`,
    );
  }
  return value;
}

function extractCurrentUnitsTableId(content: unknown): string {
  // SuiParsedData for a Move object is `{ dataType: 'moveObject', fields }`.
  // `Registry.current_units: Table<u16, ID>` arrives as
  // `{ type: '0x2::table::Table<...>', fields: { id: { id: '0x...' }, size } }`.
  const moveObject = asMoveObject(content);
  const tableField = moveObject.fields.current_units;
  const tableInner = asMoveStructFields(tableField);
  const idWrapper = asMoveStructFields(tableInner.id);
  const id = idWrapper.id;
  if (typeof id !== "string") {
    throw new Error("Registry.current_units.id is not a string");
  }
  return id;
}

function extractDynamicFieldIdValue(content: unknown): string {
  // Dynamic field arrives as a Field<Name, Value> Move object whose
  // `value` field is the ID string we want.
  const moveObject = asMoveObject(content);
  const value = moveObject.fields.value;
  if (typeof value !== "string") {
    throw new Error("Dynamic field value is not an ID string");
  }
  return value;
}

type MoveStructLike = {
  readonly dataType: "moveObject";
  readonly fields: Record<string, unknown>;
};

function asMoveObject(value: unknown): MoveStructLike {
  if (
    typeof value === "object" &&
    value !== null &&
    (value as { dataType?: unknown }).dataType === "moveObject" &&
    typeof (value as { fields?: unknown }).fields === "object" &&
    (value as { fields?: unknown }).fields !== null
  ) {
    return value as MoveStructLike;
  }
  throw new Error("Expected SuiParsedData with dataType 'moveObject'");
}

function asMoveStructFields(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    const maybeFields = (value as { fields?: unknown }).fields;
    if (typeof maybeFields === "object" && maybeFields !== null) {
      return maybeFields as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
  }
  throw new Error("Expected Move struct-like value");
}
