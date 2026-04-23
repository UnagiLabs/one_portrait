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

import {
  type GeneratorRuntimeResolution,
  resolveGeneratorRuntime,
} from "../generator-runtime";

type LoadAdminRelayEnvDeps = {
  readonly appRootPath?: string;
  readonly resolveRuntime?: () => GeneratorRuntimeResolution;
};

export function loadAdminRelayEnv(
  source: EnvSource,
  deps: LoadAdminRelayEnvDeps = {},
): AdminRelayEnv {
  const runtime =
    deps.resolveRuntime?.() ??
    resolveGeneratorRuntime({
      appRootPath: deps.appRootPath,
      env: source,
    });

  if (runtime.status !== "ok") {
    throw new AdminEnvError(runtime.message);
  }

  return {
    generatorBaseUrl: runtime.url,
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
