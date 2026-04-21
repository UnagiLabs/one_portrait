/**
 * Read-only Sui RPC client factory.
 *
 * Usage rules:
 *   - Anything outside `apps/web/src/lib/sui/` should call {@link getSuiClient}
 *     and never instantiate `SuiJsonRpcClient` directly. That lets us swap the
 *     transport (REST, GraphQL, indexer) without touching screens.
 *   - The `SuiReadClient` type is the *minimum* shape this layer needs from
 *     the SDK. Tests pass stubs that only implement these methods.
 *
 * The client is read-only by intent: this module never wires a `Signer` and
 * the surface only exposes `getObject` / `getDynamicFieldObject`. Write paths
 * (PTBs, sponsored transactions) live elsewhere.
 */

import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

import { getPublicEnvSource, loadPublicEnv, type SuiNetwork } from "../env";

// `SuiNetwork` is the validated subset we accept from env; the SDK widens it
// to its own `Network` type internally, so we re-narrow at the boundary.

/**
 * Subset of `SuiJsonRpcClient` consumed by the read layer.
 *
 * Keeping this surface narrow means tests can stub a couple of functions
 * instead of wiring an entire `BaseClient` subclass.
 */
export type SuiReadClient = {
  /**
   * The SDK types this as the wider `SuiClientTypes.Network` (any string
   * with autocomplete for the four canonical names). Mirroring that here
   * keeps `SuiJsonRpcClient` directly assignable to `SuiReadClient` and
   * lets stubs use a literal string.
   */
  readonly network: string;
  getObject: SuiJsonRpcClient["getObject"];
  getDynamicFieldObject: SuiJsonRpcClient["getDynamicFieldObject"];
};

/**
 * Subset used by the event subscription helper. Split from {@link SuiReadClient}
 * because event polling needs `queryEvents` only — keeping the surfaces narrow
 * so unit/registry tests don't need to stub more than they consume.
 *
 * The naming retains "subscription" intentionally: from the consumer's
 * perspective this is a stream of `UnitEvent`s, even though under the hood
 * we poll `queryEvents` (the JSON-RPC `subscribeEvent` method was removed
 * from `@mysten/sui` v2 — see CHANGELOG entry for v1.0.0).
 */
export type SuiSubscriptionClient = {
  readonly network: string;
  queryEvents: SuiJsonRpcClient["queryEvents"];
};

/** Resolve the official fullnode URL for a given Sui network. */
export function resolveFullnodeUrl(network: SuiNetwork): string {
  return getJsonRpcFullnodeUrl(network);
}

/**
 * Build a fresh `SuiJsonRpcClient` for the requested network.
 *
 * The returned value is structurally compatible with {@link SuiReadClient};
 * tests can pass a hand-rolled stub of the same shape.
 */
export function createSuiClient(options: {
  network: SuiNetwork;
}): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    network: options.network,
    url: resolveFullnodeUrl(options.network),
  });
}

let cached: { network: SuiNetwork; client: SuiJsonRpcClient } | undefined;

type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Return a process-wide read client for the network configured in env.
 *
 * The instance is cached per (network) so callers don't re-open RPC sessions
 * on every render. Pass `envSource` only in tests.
 */
export function getSuiClient(options?: {
  envSource?: EnvSource;
}): SuiJsonRpcClient {
  const source = options?.envSource ?? readProcessEnv();
  const network = loadPublicEnv(source).suiNetwork;

  if (cached && cached.network === network) {
    return cached.client;
  }
  const client = createSuiClient({ network });
  cached = { network, client };
  return client;
}

function readProcessEnv(): EnvSource {
  // `process.env` cannot be passed wholesale to client code — Next.js only
  // inlines individual `process.env.NEXT_PUBLIC_*` accesses, so the helper
  // (which names each key) is the only safe shape that survives bundling.
  return getPublicEnvSource();
}
