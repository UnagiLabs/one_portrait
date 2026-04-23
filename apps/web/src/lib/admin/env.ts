export class AdminEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminEnvError";
  }
}

type EnvSource = Readonly<Record<string, string | undefined>>;

export type AdminRelayEnv = {
  readonly generatorBaseUrl: string;
  readonly sharedSecret: string;
};

export function loadAdminRelayEnv(source: EnvSource): AdminRelayEnv {
  return {
    generatorBaseUrl: readRequiredValue(
      source.OP_GENERATOR_BASE_URL,
      "OP_GENERATOR_BASE_URL",
    ).replace(/\/+$/, ""),
    sharedSecret: readRequiredValue(
      source.OP_FINALIZE_DISPATCH_SECRET,
      "OP_FINALIZE_DISPATCH_SECRET",
    ),
  };
}

function readRequiredValue(value: string | undefined, key: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
    throw new AdminEnvError(`Missing required admin env variable: ${key}`);
  }
  return normalized;
}
