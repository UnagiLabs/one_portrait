const finalizeRuntimeEnvKeys = [
  "NEXT_PUBLIC_SUI_NETWORK",
  "NEXT_PUBLIC_PACKAGE_ID",
  "NEXT_PUBLIC_WALRUS_PUBLISHER",
  "NEXT_PUBLIC_WALRUS_AGGREGATOR",
  "ADMIN_CAP_ID",
  "ADMIN_SUI_PRIVATE_KEY",
] as const;

type FinalizeRuntimeEnvKey = (typeof finalizeRuntimeEnvKeys)[number];

export class MissingFinalizeRuntimeEnvError extends Error {
  readonly missing: readonly FinalizeRuntimeEnvKey[];

  constructor(missing: readonly FinalizeRuntimeEnvKey[]) {
    super(`Missing required finalize env variable(s): ${missing.join(", ")}.`);
    this.name = "MissingFinalizeRuntimeEnvError";
    this.missing = missing;
  }
}

type EnvSource = Readonly<Record<string, string | undefined>>;

export function loadFinalizeRuntimeEnv(
  source: EnvSource,
): Record<string, string> {
  const missing: FinalizeRuntimeEnvKey[] = [];
  const values = {} as Record<FinalizeRuntimeEnvKey, string>;

  for (const key of finalizeRuntimeEnvKeys) {
    const normalized = normalizeRequiredValue(source[key]);

    if (normalized === null) {
      missing.push(key);
      continue;
    }

    values[key] = normalized;
  }

  if (missing.length > 0) {
    throw new MissingFinalizeRuntimeEnvError(missing);
  }

  return {
    SUI_NETWORK: values.NEXT_PUBLIC_SUI_NETWORK,
    PACKAGE_ID: values.NEXT_PUBLIC_PACKAGE_ID,
    WALRUS_PUBLISHER: values.NEXT_PUBLIC_WALRUS_PUBLISHER,
    WALRUS_AGGREGATOR: values.NEXT_PUBLIC_WALRUS_AGGREGATOR,
    ADMIN_CAP_ID: values.ADMIN_CAP_ID,
    ADMIN_SUI_PRIVATE_KEY: values.ADMIN_SUI_PRIVATE_KEY,
  };
}

function normalizeRequiredValue(value: string | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}
