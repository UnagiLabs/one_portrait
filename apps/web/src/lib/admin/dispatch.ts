import { DISPATCH_SECRET_HEADER } from "../finalize/dispatch";

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
        [DISPATCH_SECRET_HEADER]: relay.sharedSecret,
      },
      body: JSON.stringify(payload),
    }),
  );

  return new Response(await response.text(), {
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
    status: response.status,
  });
}
