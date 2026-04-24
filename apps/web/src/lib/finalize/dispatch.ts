import {
  type GeneratorRuntimeCloudflareEnv,
  type GeneratorRuntimeResolution,
  resolveCloudflareGeneratorRuntime,
  resolveGeneratorRuntime,
} from "../generator-runtime";
import { FinalizeApiError } from "./api";

export type FinalizeDispatchRequest = {
  readonly unitId: string;
};

export type FinalizeDispatchResult =
  | {
      readonly status: "finalized";
      readonly unitId: string;
      readonly mosaicBlobId: string;
      readonly digest: string;
      readonly placementCount: number;
    }
  | {
      readonly status: "ignored_finalized" | "ignored_pending";
      readonly unitId: string;
    };

export const DISPATCH_SECRET_HEADER = "x-op-finalize-dispatch-secret";

export type FinalizeDispatchFailureCode =
  | "dispatch_failed"
  | "finalize_unavailable"
  | "generator_error";

export type FinalizeDispatchFailure = {
  readonly code: FinalizeDispatchFailureCode;
  readonly message: string;
};

export class FinalizeDispatchError extends Error {
  readonly code: FinalizeDispatchFailureCode;

  constructor(code: FinalizeDispatchFailureCode, message: string) {
    super(message);
    this.name = "FinalizeDispatchError";
    this.code = code;
  }
}

type FinalizeDispatcherDeps = {
  readonly fetchImpl?: typeof fetch;
  readonly dispatchSecret?: string | undefined;
  readonly resolveRuntime?:
    | (() => GeneratorRuntimeResolution | Promise<GeneratorRuntimeResolution>)
    | undefined;
};

type FinalizeDispatchRuntimeDeps = {
  readonly env?: GeneratorRuntimeCloudflareEnv;
};

export function createFinalizeDispatcher(
  deps: FinalizeDispatcherDeps = {
    fetchImpl: fetch,
    dispatchSecret: process.env.OP_FINALIZE_DISPATCH_SECRET,
    resolveRuntime: () => resolveGeneratorRuntime(),
  },
) {
  return async function dispatchFinalize(
    request: FinalizeDispatchRequest,
    runtimeDeps: FinalizeDispatchRuntimeDeps = {},
  ): Promise<FinalizeDispatchResult> {
    const runtime = runtimeDeps.env
      ? await resolveCloudflareGeneratorRuntime({
          env: runtimeDeps.env,
        })
      : await Promise.resolve(
          deps.resolveRuntime?.() ?? resolveGeneratorRuntime(),
        );
    if (runtime.status !== "ok") {
      throw new FinalizeApiError(503, "finalize_unavailable", runtime.message);
    }

    const dispatchSecret = normalizeDispatchSecret(
      typeof runtimeDeps.env?.OP_FINALIZE_DISPATCH_SECRET === "string"
        ? runtimeDeps.env.OP_FINALIZE_DISPATCH_SECRET
        : deps.dispatchSecret,
    );
    if (dispatchSecret === null) {
      throw new FinalizeApiError(
        503,
        "finalize_unavailable",
        "The external generator shared secret is not configured. Set `OP_FINALIZE_DISPATCH_SECRET`.",
      );
    }

    return dispatchToGenerator({
      fetchImpl: deps.fetchImpl ?? fetch,
      request,
      secret: dispatchSecret,
      url: new URL("/dispatch", `${runtime.url}/`).toString(),
    });
  };
}

export const dispatchFinalize = createFinalizeDispatcher();

async function dispatchToGenerator(input: {
  readonly fetchImpl: typeof fetch;
  readonly request: FinalizeDispatchRequest;
  readonly secret: string;
  readonly url: string;
}): Promise<FinalizeDispatchResult> {
  let response: Response;
  try {
    response = await input.fetchImpl(
      new Request(input.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [DISPATCH_SECRET_HEADER]: input.secret,
        },
        body: JSON.stringify(input.request),
      }),
    );
  } catch (error) {
    throw new FinalizeDispatchError(
      "dispatch_failed",
      sanitizeDispatchMessage(
        error instanceof Error ? error.message : String(error),
        input.secret,
      ),
    );
  }

  if (!response.ok) {
    const message = await readGeneratorErrorMessage(response);
    throw new FinalizeDispatchError(
      "generator_error",
      sanitizeDispatchMessage(
        message ?? `External mosaic generator returned ${response.status}`,
        input.secret,
      ),
    );
  }

  return (await response.json()) as FinalizeDispatchResult;
}

export function getFinalizeDispatchFailure(
  error: unknown,
): FinalizeDispatchFailure {
  if (error instanceof FinalizeDispatchError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof FinalizeApiError) {
    return {
      code: "finalize_unavailable",
      message: error.message,
    };
  }

  return {
    code: "dispatch_failed",
    message:
      error instanceof Error
        ? sanitizeDispatchMessage(error.message)
        : sanitizeDispatchMessage(String(error)),
  };
}

function normalizeDispatchSecret(value: string | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

async function readGeneratorErrorMessage(
  response: Response,
): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const record = payload as Record<string, unknown>;
    const value = record.message ?? record.error ?? record.detail;
    const message = typeof value === "string" ? value.trim() : "";
    return message.length > 0 ? message : null;
  } catch {
    return null;
  }
}

function sanitizeDispatchMessage(message: string, secret?: string): string {
  let sanitized = message.replaceAll(
    "OP_FINALIZE_DISPATCH_SECRET",
    "[redacted dispatch secret]",
  );
  sanitized = sanitized.replaceAll(
    DISPATCH_SECRET_HEADER,
    "[redacted dispatch secret header]",
  );

  const normalizedSecret = normalizeDispatchSecret(secret);
  if (normalizedSecret !== null) {
    sanitized = sanitized.replaceAll(normalizedSecret, "[redacted]");
  }

  return sanitized;
}
