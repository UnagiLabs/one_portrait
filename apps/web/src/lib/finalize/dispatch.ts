import { getContainer } from "@cloudflare/containers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { FinalizeApiError } from "./api";
import type { MosaicGeneratorContainer } from "./mosaic-generator-container";

export type FinalizeDispatchRequest = {
  readonly unitId: string;
};

export type FinalizeDispatchResult = {
  readonly accepted: boolean;
  readonly state?: "completed" | "running";
  readonly unitId?: string;
};

type FinalizeDispatcherDeps = {
  readonly fetchImpl?: typeof fetch;
  readonly getContext: typeof getCloudflareContext;
  readonly getNamedContainer: typeof getContainer<MosaicGeneratorContainer>;
  readonly localFinalizeBaseUrl?: string | undefined;
};

export function createFinalizeDispatcher(
  deps: FinalizeDispatcherDeps = {
    fetchImpl: fetch,
    getContext: getCloudflareContext,
    getNamedContainer: getContainer<MosaicGeneratorContainer>,
    localFinalizeBaseUrl: process.env.OP_LOCAL_FINALIZE_URL,
  },
) {
  return async function dispatchFinalize(
    request: FinalizeDispatchRequest,
  ): Promise<FinalizeDispatchResult> {
    const localFinalizeBaseUrl = normalizeLocalFinalizeBaseUrl(
      deps.localFinalizeBaseUrl,
    );

    if (localFinalizeBaseUrl !== null) {
      return dispatchToLocalGenerator({
        fetchImpl: deps.fetchImpl ?? fetch,
        request,
        url: new URL("/dispatch", `${localFinalizeBaseUrl}/`).toString(),
      });
    }

    const binding = (
      deps.getContext().env as CloudflareEnv & {
        MOSAIC_GENERATOR?: DurableObjectNamespace<MosaicGeneratorContainer>;
      }
    ).MOSAIC_GENERATOR;

    if (!binding) {
      throw new FinalizeApiError(
        503,
        "finalize_unavailable",
        "モザイク生成 container の設定がまだ揃っていません。",
      );
    }

    const response = await deps
      .getNamedContainer(binding, request.unitId)
      .fetch(
        new Request("http://mosaic-generator.internal/dispatch", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
        }),
      );

    if (!response.ok) {
      throw new Error(`Mosaic generator returned ${response.status}`);
    }

    return (await response.json()) as FinalizeDispatchResult;
  };
}

export const dispatchFinalize = createFinalizeDispatcher();

async function dispatchToLocalGenerator(input: {
  readonly fetchImpl: typeof fetch;
  readonly request: FinalizeDispatchRequest;
  readonly url: string;
}): Promise<FinalizeDispatchResult> {
  const response = await input.fetchImpl(
    new Request(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input.request),
    }),
  );

  if (!response.ok) {
    throw new Error(`Local mosaic generator returned ${response.status}`);
  }

  return (await response.json()) as FinalizeDispatchResult;
}

function normalizeLocalFinalizeBaseUrl(
  value: string | undefined,
): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (normalized.length === 0) {
    return null;
  }

  return normalized.replace(/\/+$/, "");
}
