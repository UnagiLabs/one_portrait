export const generatorRuntimeEnvKeys = [
  "SUI_NETWORK",
  "PACKAGE_ID",
  "ADMIN_CAP_ID",
  "ADMIN_SUI_PRIVATE_KEY",
  "WALRUS_PUBLISHER",
  "WALRUS_AGGREGATOR",
] as const;

export type GeneratorRuntimeEnvKey = (typeof generatorRuntimeEnvKeys)[number];

export const suiNetworks = [
  "mainnet",
  "testnet",
  "devnet",
  "localnet",
] as const;

export type SuiNetwork = (typeof suiNetworks)[number];

export type GeneratorRuntimeEnv = {
  readonly adminCapId: string;
  readonly adminPrivateKey: string;
  readonly packageId: string;
  readonly suiNetwork: SuiNetwork;
  readonly walrusAggregatorBaseUrl: string;
  readonly walrusPublisherBaseUrl: string;
};

export class MissingGeneratorRuntimeEnvError extends Error {
  readonly missing: readonly GeneratorRuntimeEnvKey[];

  constructor(missing: readonly GeneratorRuntimeEnvKey[]) {
    super(
      `Missing required generator env variable(s): ${missing.join(", ")}.`,
    );
    this.name = "MissingGeneratorRuntimeEnvError";
    this.missing = missing;
  }
}

type EnvSource = Readonly<Record<string, string | undefined>>;

export function loadGeneratorRuntimeEnv(
  source: EnvSource,
): GeneratorRuntimeEnv {
  const values = readRequiredValues(source, generatorRuntimeEnvKeys);
  const network = values.SUI_NETWORK;

  if (!isSuiNetwork(network)) {
    throw new Error(
      `SUI_NETWORK must be one of ${suiNetworks.join(", ")} (got "${network}").`,
    );
  }

  return {
    suiNetwork: network,
    packageId: values.PACKAGE_ID,
    adminCapId: values.ADMIN_CAP_ID,
    adminPrivateKey: values.ADMIN_SUI_PRIVATE_KEY,
    walrusPublisherBaseUrl: values.WALRUS_PUBLISHER,
    walrusAggregatorBaseUrl: values.WALRUS_AGGREGATOR,
  };
}

function readRequiredValues<const Keys extends readonly string[]>(
  source: EnvSource,
  keys: Keys,
): Record<Keys[number], string> {
  const missing: Keys[number][] = [];
  const values = {} as Record<Keys[number], string>;

  for (const key of keys) {
    const normalized = normalizeRequiredValue(source[key]);
    if (normalized === null) {
      missing.push(key);
      continue;
    }
    values[key as Keys[number]] = normalized;
  }

  if (missing.length > 0) {
    throw new MissingGeneratorRuntimeEnvError(
      missing as readonly GeneratorRuntimeEnvKey[],
    );
  }

  return values;
}

function normalizeRequiredValue(value: string | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function isSuiNetwork(value: string): value is SuiNetwork {
  return (suiNetworks as readonly string[]).includes(value);
}
