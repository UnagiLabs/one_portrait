import { getRequestCloudflareEnv } from "../../../../lib/cloudflare-context";
import { getAdminHealth } from "../../../../lib/admin/health";

export async function GET(): Promise<Response> {
  return Response.json(
    await getAdminHealth({
      env: getRequestCloudflareEnv() ?? undefined,
    }),
  );
}
