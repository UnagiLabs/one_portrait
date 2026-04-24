import { getSuiClient, type SuiReadClient } from "./client";
import {
  type AthleteProgressView,
  normalizeUnitStatus,
  type UnitStatus,
} from "./types";

export class UnitNotFoundError extends Error {
  constructor(public readonly objectId: string) {
    super(`Unit object not found: ${objectId}`);
    this.name = "UnitNotFoundError";
  }
}

export async function getUnitProgress(
  unitId: string,
  options?: { client?: SuiReadClient },
): Promise<AthleteProgressView> {
  const client = options?.client ?? getSuiClient();

  const response = await client.getObject({
    id: unitId,
    options: { showContent: true, showType: true },
  });

  const data = response.data;
  if (!data?.content) {
    throw new UnitNotFoundError(unitId);
  }

  const fields = extractMoveObjectFields(data.content);

  const status: UnitStatus = normalizeUnitStatus(fields.status);
  const realSubmittedCount = countSubmissions(fields.submissions);
  const realMaxSlots = parseIntegerField(fields.max_slots, "max_slots");
  const displayMaxSlots =
    parseOptionalIntegerField(fields.display_max_slots) ?? realMaxSlots;
  const submittedCount =
    Math.max(0, displayMaxSlots - realMaxSlots) + realSubmittedCount;
  const athletePublicId = String(
    parseIntegerField(fields.athlete_id, "athlete_id"),
  );
  const masterId = extractOptionalId(fields.master_id);

  return {
    unitId: data.objectId,
    athletePublicId,
    displayName: readVectorU8AsString(fields.display_name, "display_name"),
    submittedCount,
    masterId,
    maxSlots: displayMaxSlots,
    realMaxSlots,
    realSubmittedCount,
    status,
    submittedCount,
    thumbnailUrl: readVectorU8AsString(fields.thumbnail_url, "thumbnail_url"),
  };
}

function countSubmissions(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  return 0;
}

function parseIntegerField(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return Number(value);
  }
  throw new Error(`Unit.${fieldName} is not a numeric value: ${String(value)}`);
}

function parseOptionalIntegerField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return Number(value);
  }
  return null;
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

function extractOptionalId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const inner =
    typeof value === "object" && value !== null && "fields" in value
      ? (value as { fields: unknown }).fields
      : value;
  if (typeof inner !== "object" || inner === null) {
    return null;
  }
  const vec = (inner as { vec?: unknown }).vec;
  if (Array.isArray(vec) && vec.length > 0 && typeof vec[0] === "string") {
    return vec[0];
  }
  return null;
}

type MoveStructLike = {
  readonly dataType: "moveObject";
  readonly fields: Record<string, unknown>;
};

function extractMoveObjectFields(content: unknown): Record<string, unknown> {
  if (
    typeof content === "object" &&
    content !== null &&
    (content as { dataType?: unknown }).dataType === "moveObject"
  ) {
    const fields = (content as MoveStructLike).fields;
    if (typeof fields === "object" && fields !== null) {
      return fields;
    }
  }
  throw new Error("Expected SuiParsedData with dataType 'moveObject'");
}
