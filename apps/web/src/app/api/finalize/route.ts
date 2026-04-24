import { getRequestCloudflareEnv } from "../../../lib/cloudflare-context";
import {
  FinalizeApiError,
  jsonError,
  parseFinalizeInput,
} from "../../../lib/finalize/api";
import {
  dispatchFinalize,
  getFinalizeDispatchFailure,
} from "../../../lib/finalize/dispatch";
import { createFinalizeRouteService } from "../../../lib/finalize/service";
import { getFinalizeUnitSnapshot } from "../../../lib/sui";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = parseFinalizeInput(await request.json());
    const cloudflareEnv = getRequestCloudflareEnv() ?? undefined;
    const finalizeRoute = createFinalizeRouteService({
      dispatch: (dispatchRequest) =>
        dispatchFinalize(dispatchRequest, {
          env: cloudflareEnv,
        }),
      readUnitSnapshot: getFinalizeUnitSnapshot,
    });
    const result = await finalizeRoute.execute(input.unitId);
    return Response.json(result);
  } catch (error) {
    return toResponse(error);
  }
}

function toResponse(error: unknown): Response {
  if (error instanceof FinalizeApiError) {
    return jsonError(error);
  }

  return Response.json({
    ...getFinalizeDispatchFailure(error),
    status: "ignored_dispatch_failed",
    unitId: null,
  });
}
