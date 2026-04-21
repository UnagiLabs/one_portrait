/**
 * Normalized view models for the three on-chain events emitted by the
 * `one_portrait::events` module.
 *
 * Screens / hooks consume these types — never the raw `SuiEvent.parsedJson`
 * shape from `@mysten/sui`. That keeps the SDK contained inside `lib/sui/`
 * and lets us swap transports (RPC poll, WebSocket, indexer) without
 * touching consumers.
 *
 * Field naming mirrors `contracts/sources/events.move`:
 *   - `unit_id`        → `unitId`           (object id, always `0x`-prefixed)
 *   - `athlete_id`     → `athletePublicId`  (decimal string; matches `@/lib/catalog`)
 *   - `walrus_blob_id` → `walrusBlobId`     (raw `vector<u8>`)
 *   - u64 counts       → `number`           (within JS safe-int range for our scale)
 */

/** Common shape every parser receives from `@mysten/sui`. */
export type RawSuiEventLike = {
  readonly type: string;
  readonly parsedJson: unknown;
};

export type SubmittedEvent = {
  readonly kind: "submitted";
  readonly unitId: string;
  readonly athletePublicId: string;
  readonly submitter: string;
  readonly walrusBlobId: readonly number[];
  readonly submissionNo: number;
  readonly submittedCount: number;
  readonly maxSlots: number;
};

export type UnitFilledEvent = {
  readonly kind: "filled";
  readonly unitId: string;
  readonly athletePublicId: string;
  readonly filledCount: number;
  readonly maxSlots: number;
};

export type MosaicReadyEvent = {
  readonly kind: "mosaicReady";
  readonly unitId: string;
  readonly athletePublicId: string;
  readonly masterId: string;
  readonly mosaicWalrusBlobId: readonly number[];
};

export type UnitEvent = SubmittedEvent | UnitFilledEvent | MosaicReadyEvent;

export function parseSubmittedEvent(raw: RawSuiEventLike): SubmittedEvent {
  const json = asRecord(raw.parsedJson, "SubmittedEvent.parsedJson");
  return {
    kind: "submitted",
    unitId: asString(json.unit_id, "SubmittedEvent.unit_id"),
    athletePublicId: asAthletePublicId(
      json.athlete_id,
      "SubmittedEvent.athlete_id",
    ),
    submitter: asString(json.submitter, "SubmittedEvent.submitter"),
    walrusBlobId: asByteArray(
      json.walrus_blob_id,
      "SubmittedEvent.walrus_blob_id",
    ),
    submissionNo: asInteger(json.submission_no, "SubmittedEvent.submission_no"),
    submittedCount: asInteger(
      json.submitted_count,
      "SubmittedEvent.submitted_count",
    ),
    maxSlots: asInteger(json.max_slots, "SubmittedEvent.max_slots"),
  };
}

export function parseUnitFilledEvent(raw: RawSuiEventLike): UnitFilledEvent {
  const json = asRecord(raw.parsedJson, "UnitFilledEvent.parsedJson");
  return {
    kind: "filled",
    unitId: asString(json.unit_id, "UnitFilledEvent.unit_id"),
    athletePublicId: asAthletePublicId(
      json.athlete_id,
      "UnitFilledEvent.athlete_id",
    ),
    filledCount: asInteger(json.filled_count, "UnitFilledEvent.filled_count"),
    maxSlots: asInteger(json.max_slots, "UnitFilledEvent.max_slots"),
  };
}

export function parseMosaicReadyEvent(raw: RawSuiEventLike): MosaicReadyEvent {
  const json = asRecord(raw.parsedJson, "MosaicReadyEvent.parsedJson");
  return {
    kind: "mosaicReady",
    unitId: asString(json.unit_id, "MosaicReadyEvent.unit_id"),
    athletePublicId: asAthletePublicId(
      json.athlete_id,
      "MosaicReadyEvent.athlete_id",
    ),
    masterId: asString(json.master_id, "MosaicReadyEvent.master_id"),
    mosaicWalrusBlobId: asByteArray(
      json.mosaic_walrus_blob_id,
      "MosaicReadyEvent.mosaic_walrus_blob_id",
    ),
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not a JSON object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is not a non-empty string`);
  }
  return value;
}

function asInteger(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return Number(value);
  }
  throw new Error(`${label} is not an integer-like value: ${String(value)}`);
}

function asAthletePublicId(value: unknown, label: string): string {
  // `athlete_id` is u16 on-chain; surface it as the decimal string the rest
  // of the app keys on (see `lib/catalog/types.ts`).
  return String(asInteger(value, label));
}

function asByteArray(value: unknown, label: string): readonly number[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} is not a byte array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "number" || !Number.isInteger(entry)) {
      throw new Error(`${label}[${index}] is not an integer byte`);
    }
    return entry;
  });
}
