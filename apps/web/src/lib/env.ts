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
  "NEXT_PUBLIC_PACKAGE_ID",
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
  readonly packageId: string;
  readonly registryObjectId: string;
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
    packageId: normalized.get("NEXT_PUBLIC_PACKAGE_ID") as string,
    registryObjectId: normalized.get(
      "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
    ) as string,
  };
}

function isSuiNetwork(value: string): value is SuiNetwork {
  return (suiNetworks as readonly string[]).includes(value);
}
