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
  readonly getContext: typeof getCloudflareContext;
  readonly getNamedContainer: typeof getContainer<MosaicGeneratorContainer>;
};

export function createFinalizeDispatcher(
  deps: FinalizeDispatcherDeps = {
    getContext: getCloudflareContext,
    getNamedContainer: getContainer<MosaicGeneratorContainer>,
  },
) {
  return async function dispatchFinalize(
    request: FinalizeDispatchRequest,
  ): Promise<FinalizeDispatchResult> {
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
