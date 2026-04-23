import {
  AdminApiError,
  adminUnavailable,
  assertAdminMutationRequest,
  jsonAdminError,
  parseCreateUnitInput,
} from "../../../../lib/admin/api";
import { relayAdminPost } from "../../../../lib/admin/dispatch";
import { loadPublicEnv } from "../../../../lib/env";

export async function POST(request: Request): Promise<Response> {
  try {
    assertAdminMutationRequest(request);
    const input = parseCreateUnitInput(await request.json());
    const { registryObjectId } = loadPublicEnv(process.env);

    return await relayAdminPost("/admin/create-unit", {
      athleteId: input.athleteId,
      blobId: input.blobId,
      maxSlots: input.maxSlots,
      registryObjectId,
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
    adminUnavailable("Admin create-unit route is unavailable."),
  );
}
