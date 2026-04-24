import { isValidSuiObjectId } from "@mysten/sui/utils";

export type FinalizeApiErrorCode = "finalize_unavailable" | "invalid_args";

export type FinalizeApiErrorBody = {
  readonly code: FinalizeApiErrorCode;
  readonly message: string;
};

export type FinalizeRouteInput = {
  readonly unitId: string;
};

export class FinalizeApiError extends Error {
  readonly status: number;
  readonly code: FinalizeApiErrorCode;

  constructor(status: number, code: FinalizeApiErrorCode, message: string) {
    super(message);
    this.name = "FinalizeApiError";
    this.status = status;
    this.code = code;
  }
}

export function parseFinalizeInput(input: unknown): FinalizeRouteInput {
  if (!isRecord(input)) {
    throw invalidArgs("The submitted payload format is invalid.");
  }

  const keys = Object.keys(input);
  if (keys.length !== 1 || !keys.includes("unitId")) {
    throw invalidArgs("`unitId` only.");
  }

  const unitId = typeof input.unitId === "string" ? input.unitId.trim() : "";
  if (!isValidSuiObjectId(unitId)) {
    throw invalidArgs("`unitId` has an invalid format.");
  }

  return { unitId };
}

export function jsonError(error: FinalizeApiError): Response {
  return Response.json(
    {
      code: error.code,
      message: error.message,
    } satisfies FinalizeApiErrorBody,
    {
      status: error.status,
    },
  );
}

function invalidArgs(message: string): FinalizeApiError {
  return new FinalizeApiError(400, "invalid_args", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
