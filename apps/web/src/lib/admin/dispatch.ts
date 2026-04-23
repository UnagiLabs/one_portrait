import { DISPATCH_SECRET_HEADER } from "../finalize/dispatch";

import { ADMIN_MUTATION_HEADER, ADMIN_MUTATION_HEADER_VALUE } from "./api";
import { loadAdminRelayEnv } from "./env";

export async function relayAdminPost(
  path: string,
  payload: unknown,
): Promise<Response> {
  const relay = loadAdminRelayEnv(process.env);
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
