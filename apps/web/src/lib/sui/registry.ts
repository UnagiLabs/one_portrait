/**
 * Read helpers for the on-chain `Registry` shared object.
 *
 * Error contract (kept consistent with the rest of `lib/sui`):
 *   - Object missing entirely  → throw {@link RegistryNotFoundError}.
 *   - Object exists but its schema is stale / malformed
 *                            → throw {@link RegistrySchemaError}.
 *   - Dynamic field absent     → return `null` for the specific lookup.
 *   - Per-entry read failure   → log and fail closed for that entry.
 *   - Transport failure on the registry root → propagate the SDK error.
 */

import { getPublicEnvSource, loadPublicEnv } from "../env";
import { getSuiClient, type SuiReadClient } from "./client";
import type {
  ActiveHomeUnitView,
  AthleteMetadataView,
  RegistryAthleteView,
  RegistryView,
} from "./types";
import { getUnitProgress } from "./unit";

export class RegistryNotFoundError extends Error {
  constructor(public readonly objectId: string) {
    super(`Registry object not found: ${objectId}`);
    this.name = "RegistryNotFoundError";
  }
}

export class RegistrySchemaError extends Error {
  constructor(
    public readonly objectId: string,
    public readonly detail: string,
  ) {
    super(
      `Registry object does not match current contract schema; ${detail} (object ${objectId})`,
    );
    this.name = "RegistrySchemaError";
  }
}

export async function getRegistryObject(
  objectId?: string,
  options?: { client?: SuiReadClient },
): Promise<RegistryView> {
  const id = objectId ?? loadPublicEnv(getPublicEnvSource()).registryObjectId;
  const client = options?.client ?? getSuiClient();

  const response = await client.getObject({
    id,
    options: { showContent: true, showType: true },
  });

  const data = response.data;
  if (!data?.content) {
    throw new RegistryNotFoundError(id);
  }

  assertRegistryType(data.type, id);
  const registryFields = getRegistryFields(data.content, id);

  return {
    athleteMetadataTableId: extractTableId(
      registryFields.athlete_metadata,
      id,
      "athlete_metadata",
    ),
    objectId: data.objectId,
    currentUnitsTableId: extractTableId(
      registryFields.current_units,
      id,
      "current_units",
    ),
  };
}

export async function getCurrentUnitIdForAthlete(
  athletePublicId: string,
  options: {
    client?: SuiReadClient;
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

export async function listRegistryAthletes(
  options: { client?: SuiReadClient; registryObjectId?: string } = {},
): Promise<readonly RegistryAthleteView[]> {
  const client = options.client ?? getSuiClient();
  const registry = await getRegistryObject(options.registryObjectId, {
    client,
  });
  const [currentUnitKeys, metadataKeys] = await Promise.all([
    listAthleteKeys(registry.currentUnitsTableId, client),
    listAthleteKeys(registry.athleteMetadataTableId, client),
  ]);
  const athleteIds = [...new Set([...currentUnitKeys, ...metadataKeys])].sort(
    compareAthleteIds,
  );

  const [unitEntries, metadataEntries] = await Promise.all([
    Promise.all(
      athleteIds.map(async (athletePublicId) => ({
        athletePublicId,
        currentUnitId: await loadCurrentUnitId(
          registry.currentUnitsTableId,
          athletePublicId,
          client,
        ),
      })),
    ),
    Promise.all(
      athleteIds.map(async (athletePublicId) => ({
        athletePublicId,
        metadata: await loadAthleteMetadata(
          registry.athleteMetadataTableId,
          athletePublicId,
          client,
        ),
      })),
    ),
  ]);

  const unitByAthlete = new Map(
    unitEntries.map((entry) => [entry.athletePublicId, entry.currentUnitId]),
  );
  const metadataByAthlete = new Map(
    metadataEntries.map((entry) => [entry.athletePublicId, entry.metadata]),
  );

  return athleteIds.map((athletePublicId) => ({
    athletePublicId,
    currentUnitId: unitByAthlete.get(athletePublicId) ?? null,
    metadata: metadataByAthlete.get(athletePublicId) ?? null,
  }));
}

export async function getActiveHomeUnits(
  options: { client?: SuiReadClient; registryObjectId?: string } = {},
): Promise<readonly ActiveHomeUnitView[]> {
  const client = options.client ?? getSuiClient();
  const athletes = await listRegistryAthletes(options);
  const entries = await Promise.all(
    athletes.map(async (athlete) => {
      if (!athlete.currentUnitId) {
        return null;
      }

      if (!athlete.metadata) {
        console.error(
          `Skipping athlete ${athlete.athletePublicId} on home because metadata is missing.`,
        );
        return null;
      }

      try {
        const progress = await getUnitProgress(athlete.currentUnitId, {
          client,
        });
        if (progress.status !== "pending" || progress.masterId !== null) {
          return null;
        }

        return {
          ...athlete.metadata,
          maxSlots: progress.maxSlots,
          submittedCount: progress.submittedCount,
          unitId: progress.unitId,
        };
      } catch (error) {
        console.error(
          `Failed to load home unit ${athlete.currentUnitId} for athlete ${athlete.athletePublicId}`,
          error,
        );
        return null;
      }
    }),
  );

  return entries.filter((entry): entry is ActiveHomeUnitView => entry !== null);
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

async function listAthleteKeys(
  tableId: string,
  client: SuiReadClient,
): Promise<readonly string[]> {
  const keys: string[] = [];
  let cursor: string | null | undefined;

  do {
    const page = await client.getDynamicFields({
      cursor,
      parentId: tableId,
    });

    for (const field of page.data) {
      keys.push(parseDynamicFieldAthleteId(field.name.value));
    }

    cursor = page.nextCursor;
  } while (cursor);

  return keys;
}

async function loadCurrentUnitId(
  tableId: string,
  athletePublicId: string,
  client: SuiReadClient,
): Promise<string | null> {
  try {
    return await getCurrentUnitIdForAthlete(athletePublicId, {
      client,
      currentUnitsTableId: tableId,
    });
  } catch (error) {
    console.error(
      `Failed to resolve current unit for athlete ${athletePublicId}`,
      error,
    );
    return null;
  }
}

async function loadAthleteMetadata(
  tableId: string,
  athletePublicId: string,
  client: SuiReadClient,
): Promise<AthleteMetadataView | null> {
  try {
    const response = await client.getDynamicFieldObject({
      parentId: tableId,
      name: { type: "u16", value: parseAthleteU16(athletePublicId) },
    });
    const data = response.data;
    if (!data?.content) {
      return null;
    }

    const value = extractDynamicFieldValue(data.content);
    const fields = asMoveStructFields(value);
    return {
      athletePublicId,
      displayName: readVectorU8AsString(fields.display_name, "display_name"),
      slug: readVectorU8AsString(fields.slug, "slug"),
      thumbnailUrl: readVectorU8AsString(fields.thumbnail_url, "thumbnail_url"),
    };
  } catch (error) {
    console.error(
      `Failed to resolve athlete metadata for athlete ${athletePublicId}`,
      error,
    );
    return null;
  }
}

function compareAthleteIds(left: string, right: string): number {
  return Number(left) - Number(right);
}

function parseDynamicFieldAthleteId(value: unknown): string {
  if (
    (typeof value === "number" && Number.isInteger(value)) ||
    (typeof value === "string" && /^[0-9]+$/.test(value))
  ) {
    return String(value);
  }
  throw new Error(`Dynamic field athlete id is invalid: ${String(value)}`);
}

function assertRegistryType(type: unknown, objectId: string): void {
  if (typeof type === "string" && type.endsWith("::registry::Registry")) {
    return;
  }

  throw new RegistrySchemaError(
    objectId,
    `expected a *::registry::Registry object, got ${String(type)}`,
  );
}

function getRegistryFields(
  content: unknown,
  objectId: string,
): Record<string, unknown> & {
  readonly athlete_metadata: unknown;
  readonly current_units: unknown;
  readonly slug_to_athlete: unknown;
} {
  const moveObject = asMoveObject(content);
  const requiredFields = [
    "current_units",
    "athlete_metadata",
    "slug_to_athlete",
  ] as const;

  for (const fieldName of requiredFields) {
    if (!(fieldName in moveObject.fields)) {
      throw new RegistrySchemaError(objectId, `missing \`${fieldName}\``);
    }
  }

  return moveObject.fields as Record<string, unknown> & {
    readonly athlete_metadata: unknown;
    readonly current_units: unknown;
    readonly slug_to_athlete: unknown;
  };
}

function extractTableId(
  tableField: unknown,
  objectId: string,
  fieldName: string,
): string {
  const tableInner = asMoveStructFields(
    tableField,
    objectId,
    `\`${fieldName}\``,
  );
  const idWrapper = asMoveStructFields(
    tableInner.id,
    objectId,
    `\`${fieldName}.id\``,
  );
  const id = idWrapper.id;
  if (typeof id !== "string") {
    throw new RegistrySchemaError(
      objectId,
      `\`${fieldName}.id.id\` is not a string`,
    );
  }
  return id;
}

function extractDynamicFieldIdValue(content: unknown): string {
  const moveObject = asMoveObject(content);
  const value = moveObject.fields.value;
  if (typeof value !== "string") {
    throw new Error("Dynamic field value is not an ID string");
  }
  return value;
}

function extractDynamicFieldValue(content: unknown): unknown {
  const moveObject = asMoveObject(content);
  return moveObject.fields.value;
}

function readVectorU8AsString(value: unknown, label: string): string {
  if (!Array.isArray(value)) {
    throw new Error(`${label} is not a byte array`);
  }

  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== "number" || !Number.isInteger(entry)) {
      throw new Error(`${label}[${index}] is not an integer byte`);
    }
    bytes[index] = entry & 0xff;
  }

  return new TextDecoder().decode(bytes);
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

function asMoveStructFields(
  value: unknown,
  objectId?: string,
  label?: string,
): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    const maybeFields = (value as { fields?: unknown }).fields;
    if (typeof maybeFields === "object" && maybeFields !== null) {
      return maybeFields as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
  }
  if (objectId && label) {
    throw new RegistrySchemaError(
      objectId,
      `${label} is not a Move struct-like value`,
    );
  }
  throw new Error("Expected Move struct-like value");
}
