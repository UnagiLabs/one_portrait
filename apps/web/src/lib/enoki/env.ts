import { loadPublicEnv, type SuiNetwork } from "../env";

const submitPublicEnvKeys = [
  "NEXT_PUBLIC_ENOKI_API_KEY",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_PACKAGE_ID",
] as const;

const serverEnvKeys = ["ENOKI_PRIVATE_API_KEY"] as const;

type SubmitPublicEnvKey = (typeof submitPublicEnvKeys)[number];
type ServerEnvKey = (typeof serverEnvKeys)[number];

export type SubmitPublicEnv = {
  readonly suiNetwork: SuiNetwork;
  readonly packageId: string;
  readonly enokiApiKey: string;
  readonly googleClientId: string;
};

export type EnokiServerEnv = {
  readonly privateApiKey: string;
};

export class MissingSubmitPublicEnvError extends Error {
  readonly missing: readonly SubmitPublicEnvKey[];

  constructor(missing: readonly SubmitPublicEnvKey[]) {
    super(
      `Missing required submit env variable(s): ${missing.join(", ")}. ` +
        "Set them in apps/web/.env.local (see apps/web/.env.example).",
    );
    this.name = "MissingSubmitPublicEnvError";
    this.missing = missing;
  }
}

export class MissingEnokiServerEnvError extends Error {
  readonly missing: readonly ServerEnvKey[];

  constructor(missing: readonly ServerEnvKey[]) {
    super(
      `Missing required server env variable(s): ${missing.join(", ")}. ` +
        "Set them in the deployment environment before enabling sponsored transactions.",
    );
    this.name = "MissingEnokiServerEnvError";
    this.missing = missing;
  }
}

type EnvSource = Readonly<Record<string, string | undefined>>;

export function loadSubmitPublicEnv(source: EnvSource): SubmitPublicEnv {
  const base = loadPublicEnv(source);
  const values = readRequiredValues(source, submitPublicEnvKeys);

  return {
    suiNetwork: base.suiNetwork,
    packageId: values.NEXT_PUBLIC_PACKAGE_ID,
    enokiApiKey: values.NEXT_PUBLIC_ENOKI_API_KEY,
    googleClientId: values.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  };
}

export function loadEnokiServerEnv(source: EnvSource): EnokiServerEnv {
  const values = readRequiredValues(source, serverEnvKeys, "server");

  return {
    privateApiKey: values.ENOKI_PRIVATE_API_KEY,
  };
}

export function canEnableSubmit(source: EnvSource): boolean {
  try {
    loadSubmitPublicEnv(source);
    return true;
  } catch {
    return false;
  }
}

function readRequiredValues<const Keys extends readonly string[]>(
  source: EnvSource,
  keys: Keys,
  kind: "public" | "server" = "public",
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
    if (kind === "server") {
      throw new MissingEnokiServerEnvError(missing as readonly ServerEnvKey[]);
    }
    throw new MissingSubmitPublicEnvError(
      missing as readonly SubmitPublicEnvKey[],
    );
  }

  return values;
}

function normalizeRequiredValue(value: string | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}
