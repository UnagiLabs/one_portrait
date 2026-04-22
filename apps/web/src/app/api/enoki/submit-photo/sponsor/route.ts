import { EnokiApiError, jsonError } from "../../../../../lib/enoki/api";
import {
  parseSubmitPhotoInput,
  readZkLoginJwt,
  resolveRuntimeEnv,
  sponsorSubmitPhoto,
} from "../../../../../lib/enoki/submit-photo";

// Abuse control note:
// This route does not add an app-side rate limiter in issue #4.
// We rely on Enoki quota and the single-target sponsor policy for the MVP.
export async function POST(request: Request): Promise<Response> {
  try {
    const input = parseSubmitPhotoInput(await request.json());
    const env = resolveRuntimeEnv(process.env);
    const result = await sponsorSubmitPhoto(
      "sender" in input && typeof input.sender === "string"
        ? {
            ...input,
            sender: input.sender,
          }
        : {
            ...input,
            jwt: readZkLoginJwt(request.headers),
          },
      env,
    );

    return Response.json(result);
  } catch (error) {
    return toResponse(error);
  }
}

function toResponse(error: unknown): Response {
  if (error instanceof EnokiApiError) {
    return jsonError(error);
  }

  return jsonError(
    new EnokiApiError(
      500,
      "sponsor_failed",
      "スポンサー処理に失敗しました。時間をおいて、もう一度お試しください。",
    ),
  );
}
