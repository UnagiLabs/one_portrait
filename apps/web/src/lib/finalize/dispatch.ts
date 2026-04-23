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
        "外部 generator の共有 secret が未設定です。`OP_FINALIZE_DISPATCH_SECRET` を設定してください。",
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
  const response = await input.fetchImpl(
    new Request(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [DISPATCH_SECRET_HEADER]: input.secret,
      },
      body: JSON.stringify(input.request),
    }),
  );

  if (!response.ok) {
    throw new Error(`External mosaic generator returned ${response.status}`);
  }

  return (await response.json()) as FinalizeDispatchResult;
}

function normalizeDispatchSecret(value: string | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}
