/**
 * Gallery-oriented Sui read helpers.
 *
 * `/gallery` needs to merge three on-chain sources:
 *   - owned Kakera metadata (`walrusBlobId`, `submissionNo`, `unitId`)
 *   - the current Unit state (`athletePublicId`, `masterId`)
 *   - the finalized MasterPortrait placement (`blob_id -> Placement`)
 *
 * The important failure boundary is the placement reverse lookup:
 * a missing dynamic field means the Kakera is still renderable as a completed
 * entry, just without `(x, y)` yet. Transport failures still propagate.
 */

import { getSuiClient, type SuiReadClient } from "./client";
import type { OwnedKakera } from "./kakera";
import type {
  GalleryEntryView,
  MasterPlacementLookupView,
  MasterPlacementView,
} from "./types";
import { getUnitProgress } from "./unit";

export class MasterPortraitNotFoundError extends Error {
  constructor(public readonly objectId: string) {
    super(`MasterPortrait object not found: ${objectId}`);
    this.name = "MasterPortraitNotFoundError";
  }
}

export async function getMasterPlacement(args: {
  readonly masterId: string;
  readonly walrusBlobId: string;
  readonly client?: SuiReadClient;
}): Promise<MasterPlacementLookupView> {
  const client = args.client ?? getSuiClient();

  const response = await client.getObject({
    id: args.masterId,
    options: { showContent: true, showType: true },
  });

  const data = response.data;
  if (!data?.content) {
    throw new MasterPortraitNotFoundError(args.masterId);
  }

  const fields = extractMoveObjectFields(data.content);
  const placementsTableId = extractPlacementsTableId(fields.placements);
  const mosaicWalrusBlobId = readRequiredByteString(
    fields.mosaic_walrus_blob_id,
    "MasterPortrait.mosaic_walrus_blob_id",
  );

  const placementResponse = await client.getDynamicFieldObject({
    parentId: placementsTableId,
    name: { type: "vector<u8>", value: encodeBytes(args.walrusBlobId) },
  });

  const placementData = placementResponse.data;
  return {
    masterId: data.objectId,
    mosaicWalrusBlobId,
    placement: placementData?.content
      ? extractPlacement(placementData.content)
      : null,
  };
}

export async function getGalleryEntry(args: {
  readonly kakera: OwnedKakera;
  readonly client?: SuiReadClient;
}): Promise<GalleryEntryView> {
  const client = args.client ?? getSuiClient();
  const progress = await getUnitProgress(args.kakera.unitId, { client });

  if (progress.masterId == null) {
    return {
      unitId: args.kakera.unitId,
      athletePublicId: progress.athletePublicId,
      walrusBlobId: args.kakera.walrusBlobId,
      submissionNo: args.kakera.submissionNo,
      masterId: null,
      mosaicWalrusBlobId: null,
      placement: null,
      status: { kind: "pending" },
    };
  }

  const placement = await getMasterPlacement({
    masterId: progress.masterId,
    walrusBlobId: args.kakera.walrusBlobId,
    client,
  });

  return {
    unitId: args.kakera.unitId,
    athletePublicId: progress.athletePublicId,
    walrusBlobId: args.kakera.walrusBlobId,
    submissionNo: args.kakera.submissionNo,
    masterId: placement.masterId,
    mosaicWalrusBlobId: placement.mosaicWalrusBlobId,
    placement: placement.placement,
    status: { kind: "completed" },
  };
}

function extractPlacementsTableId(value: unknown): string {
  const tableFields = asMoveStructFields(value);
  const idWrapper = asMoveStructFields(tableFields.id);
  const id = idWrapper.id;
  if (typeof id !== "string") {
    throw new Error("MasterPortrait.placements.id is not a string");
  }
  return id;
}

function extractPlacement(content: unknown): MasterPlacementView {
  const moveObject = asMoveObject(content);
  const placementFields = asMoveStructFields(moveObject.fields.value);

  return {
    x: parseIntegerField(placementFields.x, "Placement.x"),
    y: parseIntegerField(placementFields.y, "Placement.y"),
    submitter: readRequiredString(
      placementFields.submitter,
      "Placement.submitter",
    ),
    submissionNo: parseIntegerField(
      placementFields.submission_no,
      "Placement.submission_no",
    ),
  };
}

function readRequiredByteString(value: unknown, fieldName: string): string {
  const decoded = readVectorU8AsString(value);
  if (decoded == null) {
    throw new Error(`${fieldName} is not a byte vector string`);
  }
  return decoded;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`${fieldName} is not a string`);
}

function readVectorU8AsString(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (typeof entry !== "number" || !Number.isInteger(entry)) {
      return null;
    }
    bytes[i] = entry & 0xff;
  }
  return new TextDecoder().decode(bytes);
}

function encodeBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function parseIntegerField(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return Number(value);
  }
  throw new Error(`${fieldName} is not a numeric value: ${String(value)}`);
}

type MoveStructLike = {
  readonly dataType: "moveObject";
  readonly fields: Record<string, unknown>;
};

function extractMoveObjectFields(content: unknown): Record<string, unknown> {
  return asMoveObject(content).fields;
}

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
