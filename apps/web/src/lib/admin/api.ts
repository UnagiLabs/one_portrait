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
  readonly athleteSlug: string;
  readonly displayMaxSlots: number;
  readonly blobId: string;
  readonly maxSlots: number;
};

export function parseCreateUnitInput(input: unknown): CreateUnitRouteInput {
  const record = asRecord(input);
  assertExactKeys(record, [
    "athleteSlug",
    "blobId",
    "displayMaxSlots",
    "maxSlots",
  ]);

  const maxSlots = parseNonNegativeInteger(record.maxSlots, "maxSlots");
  const displayMaxSlots = parsePositiveInteger(
    record.displayMaxSlots,
    "displayMaxSlots",
  );
  if (displayMaxSlots < maxSlots) {
    throw new AdminApiError(
      400,
      "invalid_args",
      "`displayMaxSlots` must be greater than or equal to `maxSlots`.",
    );
  }

  return {
    athleteSlug: parseNonEmptyTrimmedString(
      record.athleteSlug,
      "athleteSlug",
    ),
    displayMaxSlots,
    blobId: parseBlobId(record.blobId),
    maxSlots,
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
    "The submitted payload format is invalid.",
  );
}

function assertExactKeys(
  input: Record<string, unknown>,
  expected: readonly string[],
): void {
  const keys = Object.keys(input).sort();
  const normalizedExpected = [...expected].sort();
  if (
    keys.length !== normalizedExpected.length ||
    keys.some((key, index) => key !== normalizedExpected[index])
  ) {
    throw new AdminApiError(
      400,
      "invalid_args",
      `\`${expected.join("`, `")}\` only.`,
    );
  }
}

function parseBlobId(value: unknown): string {
  const blobId = typeof value === "string" ? value.trim() : "";
  if (blobId.length === 0) {
    throw new AdminApiError(
      400,
      "invalid_args",
      "`blobId` must be a non-empty string.",
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
      `\`${fieldName}\` must be a non-empty string.`,
    );
  }
  return parsed;
}

function parseNonNegativeInteger(value: unknown, fieldName: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[0-9]+$/.test(value)
        ? Number(value)
        : NaN;

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AdminApiError(
      400,
      "invalid_args",
      `\`${fieldName}\` must be an integer greater than or equal to 0.`,
    );
  }

  return parsed;
}

function parsePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = parseNonNegativeInteger(value, fieldName);

  if (parsed === 0) {
    throw new AdminApiError(
      400,
      "invalid_args",
      `\`${fieldName}\` must be an integer greater than or equal to 1.`,
    );
  }

  return parsed;
}
