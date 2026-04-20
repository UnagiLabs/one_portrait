import {
  jsonError,
  EnokiApiError,
} from "../../../../../lib/enoki/api";
import {
  executeSponsoredSubmitPhoto,
  parseExecuteSponsoredInput,
  readZkLoginJwt,
  resolveRuntimeEnv,
} from "../../../../../lib/enoki/submit-photo";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = parseExecuteSponsoredInput(await request.json());
    const jwt = readZkLoginJwt(request.headers);
    const env = resolveRuntimeEnv(process.env);
    const result = await executeSponsoredSubmitPhoto(
      {
        ...input,
        jwt,
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
