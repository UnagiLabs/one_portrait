/**
 * Read helper for `Kakera` Soulbound NFTs.
 *
 * Looks up the Kakera that matches a specific submission (unit + Walrus
 * blob id) directly from the owner's address. This is used after a
 * Sponsored `submit_photo` to confirm that the mint reached the chain:
 * Kakera is Soulbound (`key`-only, no `store`), so it only ever lives on
 * the submitter's address and cannot be fished out of a shared registry.
 *
 * Returns `null` when the Kakera hasn't been observed yet — callers poll
 * on a short interval until the mint propagates through the fullnode.
 */

import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

/**
 * Narrow surface used by {@link findKakeraForSubmission}. Mirrors the
 * pattern in `client.ts` where we type only the SDK methods we call so
 * tests can supply a stub without implementing the full RPC client.
 */
export type KakeraOwnedClient = {
  getOwnedObjects: SuiJsonRpcClient["getOwnedObjects"];
};

export type OwnedKakera = {
  readonly objectId: string;
  readonly unitId: string;
  readonly walrusBlobId: string;
  readonly submissionNo: number;
};

export type FindKakeraForSubmissionArgs = {
  readonly suiClient: KakeraOwnedClient;
  readonly ownerAddress: string;
  readonly unitId: string;
  readonly walrusBlobId: string;
  readonly packageId: string;
};

/**
 * Locate the Kakera that matches a specific submission, or `null` if the
 * owner does not (yet) hold such an object.
 *
 * Matching criteria:
 *   - Move type is exactly `${packageId}::kakera::Kakera`.
 *   - `unit_id` field equals {@link FindKakeraForSubmissionArgs.unitId}.
 *   - `walrus_blob_id` bytes decode to {@link FindKakeraForSubmissionArgs.walrusBlobId}.
 *
 * Fullnode-side we narrow to `StructType` for efficiency, and we re-check
 * the type in TS because stubs (and some RPC shapes) don't always honour
 * the filter perfectly — defence in depth keeps the helper safe against
 * unrelated objects that happen to slip through.
 */
export async function findKakeraForSubmission(
  args: FindKakeraForSubmissionArgs,
): Promise<OwnedKakera | null> {
  const expectedType = `${args.packageId}::kakera::Kakera`;

  const response = await args.suiClient.getOwnedObjects({
    owner: args.ownerAddress,
    filter: {
      StructType: expectedType,
    },
    options: { showContent: true, showType: true },
  });

  for (const entry of response.data ?? []) {
    const data = entry.data;
    if (!data?.content) continue;
    if (data.type !== expectedType) continue;

    const fields = extractMoveObjectFields(data.content);
    const unitId = readIdField(fields.unit_id);
    if (unitId !== args.unitId) continue;

    const blobId = readVectorU8AsString(fields.walrus_blob_id);
    if (blobId !== args.walrusBlobId) continue;

    return {
      objectId: data.objectId,
      unitId,
      walrusBlobId: blobId,
      submissionNo: readIntegerField(fields.submission_no),
    };
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
  return {};
}

function readIdField(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  // Some RPC shapes wrap `ID` values as `{ id: "0x..." }` — accept both.
  if (typeof value === "object" && value !== null) {
    const inner = (value as { id?: unknown }).id;
    if (typeof inner === "string" && inner.length > 0) {
      return inner;
    }
  }
  return null;
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

function readIntegerField(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return Number(value);
  }
  return 0;
}
