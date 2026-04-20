/**
 * Read helper for `Unit` shared objects.
 *
 * Returns the {@link AthleteProgressView} consumed by progress UI. The view
 * model intentionally does **not** mirror every Move field — only what the
 * `/athletes/[slug]` and dashboard surfaces actually render. Add fields here
 * (and in `types.ts`) when a new screen needs them; do not push the raw
 * `SuiObjectData` past this boundary.
 */

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
  const submittedCount = countSubmissions(fields.submissions);
  const maxSlots = parseIntegerField(fields.max_slots, "max_slots");
  const athletePublicId = String(
    parseIntegerField(fields.athlete_id, "athlete_id"),
  );
  const masterId = extractOptionalId(fields.master_id);

  return {
    unitId: data.objectId,
    athletePublicId,
    submittedCount,
    maxSlots,
    status,
    masterId,
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

function extractOptionalId(value: unknown): string | null {
  // `Option<ID>` serialises as `{ fields: { vec: [] } }` (none) or
  // `{ fields: { vec: ["0x..."] } }` (some). Some RPC responses
  // also flatten the outer `fields` wrapper, so accept both shapes.
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
