import { getAdminHealth } from "../../../../lib/admin/health";
import { getRequestCloudflareEnv } from "../../../../lib/cloudflare-context";

export async function GET(): Promise<Response> {
  return Response.json(
    await getAdminHealth({
      env: getRequestCloudflareEnv() ?? undefined,
    }),
  );
}
