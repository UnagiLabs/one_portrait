import {
  AdminApiError,
  adminUnavailable,
  assertAdminMutationRequest,
  jsonAdminError,
  parseRotateUnitInput,
} from "../../../../lib/admin/api";
import { relayAdminPost } from "../../../../lib/admin/dispatch";
import { loadPublicEnv } from "../../../../lib/env";

export async function POST(request: Request): Promise<Response> {
  try {
    assertAdminMutationRequest(request);
    const input = parseRotateUnitInput(await request.json());
    const { registryObjectId } = loadPublicEnv(process.env);

    return await relayAdminPost("/admin/rotate-unit", {
      athleteId: input.athleteId,
      registryObjectId,
      unitId: input.unitId,
    });
  } catch (error) {
    return toResponse(error);
  }
}

function toResponse(error: unknown): Response {
  if (error instanceof AdminApiError) {
    return jsonAdminError(error);
  }

  return jsonAdminError(
    adminUnavailable("Admin rotate-unit route is unavailable."),
  );
}
