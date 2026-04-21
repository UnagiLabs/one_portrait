import {
  FinalizeApiError,
  jsonError,
  parseFinalizeInput,
} from "../../../lib/finalize/api";
import { dispatchFinalize } from "../../../lib/finalize/dispatch";
import { createFinalizeRouteService } from "../../../lib/finalize/service";
import { getFinalizeUnitSnapshot } from "../../../lib/sui";

const finalizeRoute = createFinalizeRouteService({
  dispatch: dispatchFinalize,
  readUnitSnapshot: getFinalizeUnitSnapshot,
});

export async function POST(request: Request): Promise<Response> {
  try {
    const input = parseFinalizeInput(await request.json());
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
    status: "ignored_dispatch_failed",
    unitId: null,
  });
}
