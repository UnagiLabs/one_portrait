import type { SuiReadClient } from "./client";
import { getSuiClient } from "./client";
import { normalizeUnitStatus, type UnitStatus } from "./types";
import { UnitNotFoundError } from "./unit";

export { UnitNotFoundError } from "./unit";

export type AdminUnitSnapshot = {
  readonly athletePublicId: string;
  readonly displayMaxSlots: number;
  readonly masterId: string | null;
  readonly maxSlots: number;
  readonly status: UnitStatus;
  readonly submittedCount: number;
  readonly targetWalrusBlobId: string;
  readonly unitId: string;
};

export async function getAdminUnitSnapshot(
  unitId: string,
  options?: { client?: SuiReadClient },
): Promise<AdminUnitSnapshot> {
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

  return {
    athletePublicId: String(parseIntegerField(fields.athlete_id, "athlete_id")),
    displayMaxSlots: parseIntegerField(
      fields.display_max_slots,
      "display_max_slots",
    ),
    masterId: extractOptionalId(fields.master_id),
    maxSlots: parseIntegerField(fields.max_slots, "max_slots"),
    status: normalizeUnitStatus(fields.status),
    submittedCount: countSubmissions(fields.submissions),
    targetWalrusBlobId: readVectorU8AsString(
      fields.target_walrus_blob,
      "target_walrus_blob",
    ),
    unitId: data.objectId,
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
