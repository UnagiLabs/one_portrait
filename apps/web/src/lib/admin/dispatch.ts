import { DISPATCH_SECRET_HEADER } from "../finalize/dispatch";
import type { GeneratorRuntimeCloudflareEnv } from "../generator-runtime";

import { ADMIN_MUTATION_HEADER, ADMIN_MUTATION_HEADER_VALUE } from "./api";
import { loadAdminRelayEnv, loadCloudflareAdminRelayEnv } from "./env";

type RelayAdminPostDeps = {
  readonly env?: GeneratorRuntimeCloudflareEnv;
};

export async function relayAdminPost(
  path: string,
  payload: unknown,
  deps: RelayAdminPostDeps = {},
): Promise<Response> {
  const relay = deps.env
    ? await loadCloudflareAdminRelayEnv(deps.env)
    : loadAdminRelayEnv(process.env);
  const response = await fetch(
    new Request(new URL(path, `${relay.generatorBaseUrl}/`).toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [ADMIN_MUTATION_HEADER]: ADMIN_MUTATION_HEADER_VALUE,
        [DISPATCH_SECRET_HEADER]: relay.sharedSecret,
      },
      body: JSON.stringify(payload),
    }),
  );

  return new Response(await response.text(), {
    headers: {
      "content-type":
        response.headers.get("content-type") ??
        "application/json; charset=utf-8",
    },
    status: response.status,
  });
}
