import {
  AdminApiError,
  assertAdminMutationRequest,
  jsonAdminError,
} from "../../../../lib/admin/api";
import { getRequestCloudflareEnv } from "../../../../lib/cloudflare-context";
import {
  FinalizeApiError,
  jsonError,
  parseFinalizeInput,
} from "../../../../lib/finalize/api";
import {
  dispatchFinalize,
  getFinalizeDispatchFailure,
} from "../../../../lib/finalize/dispatch";
import { getFinalizeUnitSnapshot } from "../../../../lib/sui";

export async function POST(request: Request): Promise<Response> {
  try {
    assertAdminMutationRequest(request);
    const cloudflareEnv = getRequestCloudflareEnv() ?? undefined;
    const input = parseFinalizeInput(await request.json());
    const snapshot = await getFinalizeUnitSnapshot(input.unitId);

    if (snapshot.status === "pending") {
      return Response.json({
        status: "ignored_pending",
        unitId: input.unitId,
      });
    }

    if (snapshot.status === "finalized" || snapshot.masterId !== null) {
      return Response.json({
        status: "ignored_finalized",
        unitId: input.unitId,
      });
    }

    try {
      return Response.json(
        await dispatchFinalize(
          { unitId: input.unitId },
          {
            env: cloudflareEnv,
          },
        ),
      );
    } catch (error) {
      console.error("Admin finalize dispatch failed", error);

      return Response.json({
        ...getFinalizeDispatchFailure(error),
        status: "ignored_dispatch_failed",
        unitId: input.unitId,
      });
    }
  } catch (error) {
    return toResponse(error);
  }
}

function toResponse(error: unknown): Response {
  if (error instanceof AdminApiError) {
    return jsonAdminError(error);
  }

  if (error instanceof FinalizeApiError) {
    return jsonError(error);
  }

  return Response.json({
    ...getFinalizeDispatchFailure(error),
    status: "ignored_dispatch_failed",
    unitId: null,
  });
}
