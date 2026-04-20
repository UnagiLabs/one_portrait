export const ENOKI_JWT_HEADER = "x-zklogin-jwt";

export type EnokiApiErrorCode =
  | "auth_expired"
  | "invalid_args"
  | "sponsor_failed"
  | "submit_unavailable";

export type EnokiApiErrorBody = {
  readonly code: EnokiApiErrorCode;
  readonly message: string;
};

export class EnokiApiError extends Error {
  readonly status: number;
  readonly code: EnokiApiErrorCode;

  constructor(status: number, code: EnokiApiErrorCode, message: string) {
    super(message);
    this.name = "EnokiApiError";
    this.status = status;
    this.code = code;
  }
}

export function jsonError(error: EnokiApiError): Response {
  return Response.json(
    {
      code: error.code,
      message: error.message,
    } satisfies EnokiApiErrorBody,
    {
      status: error.status,
    },
  );
}
