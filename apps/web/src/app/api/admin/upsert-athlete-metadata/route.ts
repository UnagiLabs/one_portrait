import {
  AdminApiError,
  adminUnavailable,
  assertAdminMutationRequest,
  jsonAdminError,
  parseUpsertAthleteMetadataInput,
} from "../../../../lib/admin/api";
import { relayAdminPost } from "../../../../lib/admin/dispatch";
import { getRequestCloudflareEnv } from "../../../../lib/cloudflare-context";
import { loadPublicEnv } from "../../../../lib/env";

export async function POST(request: Request): Promise<Response> {
  try {
    assertAdminMutationRequest(request);
    const cloudflareEnv = getRequestCloudflareEnv() ?? undefined;
    const input = parseUpsertAthleteMetadataInput(await request.json());
    const { registryObjectId } = loadPublicEnv(process.env);

    return await relayAdminPost(
      "/admin/upsert-athlete-metadata",
      {
        athleteId: input.athleteId,
        displayName: input.displayName,
        registryObjectId,
        slug: input.slug,
        thumbnailUrl: input.thumbnailUrl,
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
    adminUnavailable("Admin upsert-athlete-metadata route is unavailable."),
  );
}
