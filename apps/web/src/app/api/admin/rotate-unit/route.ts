import {
  AdminApiError,
  adminUnavailable,
  assertAdminMutationRequest,
  jsonAdminError,
  parseRotateUnitInput,
} from "../../../../lib/admin/api";
import { relayAdminPost } from "../../../../lib/admin/dispatch";
import { getRequestCloudflareEnv } from "../../../../lib/cloudflare-context";
import { loadPublicEnv } from "../../../../lib/env";

export async function POST(request: Request): Promise<Response> {
  try {
    assertAdminMutationRequest(request);
    const cloudflareEnv = getRequestCloudflareEnv() ?? undefined;
    const input = parseRotateUnitInput(await request.json());
    const { registryObjectId } = loadPublicEnv(process.env);

    return await relayAdminPost(
      "/admin/rotate-unit",
      {
        athleteId: input.athleteId,
        registryObjectId,
        unitId: input.unitId,
      },
      {
        env: cloudflareEnv,
      },
    );
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
