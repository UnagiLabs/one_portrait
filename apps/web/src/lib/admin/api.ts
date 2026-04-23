import { isValidSuiObjectId } from "@mysten/sui/utils";

export type AdminApiErrorCode =
  | "admin_unavailable"
  | "forbidden"
  | "invalid_args";

export const ADMIN_MUTATION_HEADER = "x-one-portrait-admin-request";
export const ADMIN_MUTATION_HEADER_VALUE = "same-origin";

export class AdminApiError extends Error {
  readonly code: AdminApiErrorCode;
  readonly status: number;

  constructor(status: number, code: AdminApiErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AdminApiError";
    this.status = status;
  }
}

export type CreateUnitRouteInput = {
  readonly athleteId: number;
  readonly blobId: string;
  readonly displayMaxSlots: number;
  readonly maxSlots: number;
};

export type RotateUnitRouteInput = {
  readonly athleteId: number;
  readonly unitId: string;
};

export type UpsertAthleteMetadataRouteInput = {
  readonly athleteId: number;
  readonly displayName: string;
  readonly slug: string;
  readonly thumbnailUrl: string;
};

export function parseCreateUnitInput(input: unknown): CreateUnitRouteInput {
  const record = asRecord(input);
  assertAllowedKeys(record, ["athleteId", "blobId", "displayMaxSlots", "maxSlots"]);

  const maxSlots = parseMaxSlots(record.maxSlots);
  const displayMaxSlots = parseDisplayMaxSlots(record.displayMaxSlots, maxSlots);

  return {
    athleteId: parseAthleteId(record.athleteId),
    blobId: parseBlobId(record.blobId),
    displayMaxSlots,
    maxSlots,
  };
}

export function parseRotateUnitInput(input: unknown): RotateUnitRouteInput {
  const record = asRecord(input);
  assertExactKeys(record, ["athleteId", "unitId"]);

  return {
    athleteId: parseAthleteId(record.athleteId),
    unitId: parseObjectId(record.unitId, "unitId"),
  };
}

export function parseUpsertAthleteMetadataInput(
  input: unknown,
): UpsertAthleteMetadataRouteInput {
  const record = asRecord(input);
  assertExactKeys(record, ["athleteId", "displayName", "slug", "thumbnailUrl"]);

  return {
    athleteId: parseAthleteId(record.athleteId),
    displayName: parseNonEmptyTrimmedString(record.displayName, "displayName"),
    slug: parseNonEmptyTrimmedString(record.slug, "slug"),
    thumbnailUrl: parseNonEmptyTrimmedString(
      record.thumbnailUrl,
      "thumbnailUrl",
    ),
  };
}

export function assertAdminMutationRequest(request: Request): void {
  const requestMarker = request.headers.get(ADMIN_MUTATION_HEADER);
  if (requestMarker !== ADMIN_MUTATION_HEADER_VALUE) {
    throw new AdminApiError(
      403,
      "forbidden",
      "Cross-site admin request is blocked.",
    );
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AdminApiError(
      403,
      "forbidden",
      "Cross-site admin request is blocked.",
    );
  }
}

export function jsonAdminError(error: AdminApiError): Response {
  return Response.json(
    {
      code: error.code,
      message: error.message,
    },
    {
      status: error.status,
    },
  );
}

export function adminUnavailable(message: string): AdminApiError {
  return new AdminApiError(503, "admin_unavailable", message);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new AdminApiError(
    400,
    "invalid_args",
    "送信内容の形式が正しくありません。",
  );
}

function assertAllowedKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const keys = Object.keys(input).sort();
  const normalizedAllowed = [...allowed].sort();
  if (keys.some((key) => !normalizedAllowed.includes(key))) {
    throw new AdminApiError(
      400,
      "invalid_args",
      `\`${allowed.join("`, `")}\` だけを送ってください。`,
    );
  }
}

function assertExactKeys(
  input: Record<string, unknown>,
  expected: readonly string[],
): void {
  assertAllowedKeys(input, expected);

  const keys = Object.keys(input).sort();
  const normalizedExpected = [...expected].sort();
  if (
    keys.length !== normalizedExpected.length ||
    keys.some((key, index) => key !== normalizedExpected[index])
  ) {
    throw new AdminApiError(
      400,
      "invalid_args",
      `\`${expected.join("`, `")}\` だけを送ってください。`,
    );
  }
}

function parseAthleteId(value: unknown): number {
  const athleteId =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[0-9]+$/.test(value)
        ? Number(value)
        : NaN;

  if (!Number.isInteger(athleteId) || athleteId < 0 || athleteId > 65_535) {
    throw new AdminApiError(
      400,
      "invalid_args",
      "`athleteId` は u16 の整数で送ってください。",
    );
  }

  return athleteId;
}

function parseBlobId(value: unknown): string {
  const blobId = typeof value === "string" ? value.trim() : "";
  if (blobId.length === 0) {
    throw new AdminApiError(
      400,
      "invalid_args",
      "`blobId` は空でない文字列で送ってください。",
    );
  }
  return blobId;
}

function parseNonEmptyTrimmedString(value: unknown, fieldName: string): string {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (parsed.length === 0) {
    throw new AdminApiError(
      400,
      "invalid_args",
      `\`${fieldName}\` は空でない文字列で送ってください。`,
    );
  }
  return parsed;
}

function parseMaxSlots(value: unknown): number {
  const maxSlots =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[0-9]+$/.test(value)
        ? Number(value)
        : NaN;

  if (!Number.isInteger(maxSlots) || maxSlots <= 0) {
    throw new AdminApiError(
      400,
      "invalid_args",
      "`maxSlots` は 1 以上の整数で送ってください。",
    );
  }

  return maxSlots;
}

function parseDisplayMaxSlots(value: unknown, maxSlots: number): number {
  if (value === undefined) {
    return maxSlots;
  }

  const displayMaxSlots = parseMaxSlots(value);
  if (displayMaxSlots < maxSlots) {
    throw new AdminApiError(
      400,
      "invalid_args",
      "`displayMaxSlots` は `maxSlots` 以上の整数で送ってください。",
    );
  }

  return displayMaxSlots;
}

function parseObjectId(value: unknown, fieldName: string): string {
  const objectId = typeof value === "string" ? value.trim() : "";
  if (!isValidSuiObjectId(objectId)) {
    throw new AdminApiError(
      400,
      "invalid_args",
      `\`${fieldName}\` の形式が不正です。`,
    );
  }
  return objectId;
}
