/**
 * Public env helper for the ONE Portrait web app.
 *
 * All consumers should read the public client configuration through
 * {@link loadPublicEnv}. Missing or malformed values fail fast via
 * {@link MissingPublicEnvError} so that runtime errors never surface later in
 * the request lifecycle.
 */

export const publicEnvKeys = [
  "NEXT_PUBLIC_SUI_NETWORK",
  "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
] as const;

export type PublicEnvKey = (typeof publicEnvKeys)[number];

export const suiNetworks = [
  "mainnet",
  "testnet",
  "devnet",
  "localnet",
] as const;

export type SuiNetwork = (typeof suiNetworks)[number];

export type PublicEnv = {
  readonly suiNetwork: SuiNetwork;
  readonly registryObjectId: string;
  readonly packageId: string | null;
};

export class MissingPublicEnvError extends Error {
  readonly missing: readonly PublicEnvKey[];

  constructor(missing: readonly PublicEnvKey[]) {
    super(
      `Missing required public env variable(s): ${missing.join(", ")}. ` +
        "Set them in apps/web/.env.local (see apps/web/.env.example).",
    );
    this.name = "MissingPublicEnvError";
    this.missing = missing;
  }
}

type EnvSource = Readonly<Record<string, string | undefined>>;

export function loadPublicEnv(source: EnvSource): PublicEnv {
  const normalized = new Map<PublicEnvKey, string>();
  const missing: PublicEnvKey[] = [];

  for (const key of publicEnvKeys) {
    const raw = source[key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value.length === 0) {
      missing.push(key);
      continue;
    }
    normalized.set(key, value);
  }

  if (missing.length > 0) {
    throw new MissingPublicEnvError(missing);
  }

  const suiNetwork = normalized.get("NEXT_PUBLIC_SUI_NETWORK") as string;
  if (!isSuiNetwork(suiNetwork)) {
    throw new Error(
      `NEXT_PUBLIC_SUI_NETWORK must be one of ${suiNetworks.join(", ")} (got "${suiNetwork}").`,
    );
  }

  return {
    suiNetwork,
    registryObjectId: normalized.get(
      "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
    ) as string,
    packageId: normalizeOptionalValue(source.NEXT_PUBLIC_PACKAGE_ID),
  };
}

function isSuiNetwork(value: string): value is SuiNetwork {
  return (suiNetworks as readonly string[]).includes(value);
}

/**
 * Build an env source by reading each `NEXT_PUBLIC_*` accessor individually.
 *
 * Next.js can statically inline `process.env.NEXT_PUBLIC_FOO` into the client
 * bundle, but it cannot inline `process.env` passed as a whole object — every
 * caller that needs to consult env from client code must therefore name each
 * key explicitly, otherwise the browser sees an empty object after hydration
 * and `loadPublicEnv` throws `MissingPublicEnvError`.
 */
export function getPublicEnvSource(): EnvSource {
  return {
    NEXT_PUBLIC_SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK,
    NEXT_PUBLIC_PACKAGE_ID: process.env.NEXT_PUBLIC_PACKAGE_ID,
    NEXT_PUBLIC_REGISTRY_OBJECT_ID: process.env.NEXT_PUBLIC_REGISTRY_OBJECT_ID,
    NEXT_PUBLIC_ENOKI_API_KEY: process.env.NEXT_PUBLIC_ENOKI_API_KEY,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  };
}

function normalizeOptionalValue(value: string | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}
