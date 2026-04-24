import { getPublicEnvSource, loadPublicEnv } from "../env";
import { getSuiClient, type SuiReadClient } from "./client";
import type {
  ActiveHomeUnitView,
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
    objectId: data.objectId,
    unitIds: readIdVector(registryFields.unit_ids, id, "unit_ids"),
  };
}

export async function listRegistryAthletes(
  options: { client?: SuiReadClient; registryObjectId?: string } = {},
): Promise<readonly RegistryAthleteView[]> {
  const client = options.client ?? getSuiClient();
  const registry = await getRegistryObject(options.registryObjectId, {
    client,
  });

  const entries = await Promise.all(
    registry.unitIds.map(async (unitId) => {
      try {
        const unit = await getUnitProgress(unitId, { client });
        return {
          currentUnitId: unit.unitId,
          metadata: {
            displayName: unit.displayName,
            slug: buildSyntheticSlug(unit.unitId),
            thumbnailUrl: unit.thumbnailUrl,
          },
        } satisfies RegistryAthleteView;
      } catch (error) {
        console.error(`Failed to load registry unit ${unitId}`, error);
        return null;
      }
    }),
  );

  return entries.filter(
    (entry): entry is RegistryAthleteView => entry !== null,
  );
}

export async function getActiveHomeUnits(
  options: { client?: SuiReadClient; registryObjectId?: string } = {},
): Promise<readonly ActiveHomeUnitView[]> {
  const client = options.client ?? getSuiClient();
  const registry = await getRegistryObject(options.registryObjectId, {
    client,
  });

  const entries = await Promise.all(
    registry.unitIds.map(async (unitId) => {
      try {
        const unit = await getUnitProgress(unitId, { client });
        const lifecycleState =
          unit.status === "pending" && unit.masterId === null
            ? "live"
            : "complete";

        return {
          displayName: unit.displayName,
          lifecycleState,
          maxSlots: unit.maxSlots,
          submittedCount: unit.submittedCount,
          thumbnailUrl: unit.thumbnailUrl,
          unitId: unit.unitId,
        } satisfies ActiveHomeUnitView;
      } catch (error) {
        console.error(`Failed to load home unit ${unitId}`, error);
        return null;
      }
    }),
  );

  return entries.filter((entry): entry is ActiveHomeUnitView => entry !== null);
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
  readonly unit_ids: unknown;
} {
  const moveObject = asMoveObject(content);

  if (!("unit_ids" in moveObject.fields)) {
    throw new RegistrySchemaError(objectId, "missing `unit_ids`");
  }

  return moveObject.fields as Record<string, unknown> & {
    readonly unit_ids: unknown;
  };
}

function readIdVector(
  value: unknown,
  objectId: string,
  fieldName: string,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new RegistrySchemaError(objectId, `\`${fieldName}\` is not a vector`);
  }

  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new RegistrySchemaError(
        objectId,
        `\`${fieldName}\` contains a non-string id`,
      );
    }
    ids.push(entry);
  }

  return ids;
}

function buildSyntheticSlug(unitId: string): string {
  return `unit-${unitId.slice(2, 10).toLowerCase()}`;
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
