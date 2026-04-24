import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDeploymentManifestEnv,
  readEnvFile,
  resolveRepoRootFromWebRoot,
  warnDuplicatedCanonicalEnv,
} from "./deployment-env.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const validSuiNetworks = new Set(["mainnet", "testnet", "devnet", "localnet"]);

export const buildPublicEnvKeys = {
  local: ["NEXT_PUBLIC_SUI_NETWORK", "NEXT_PUBLIC_REGISTRY_OBJECT_ID"],
  cloudflare: [
    "NEXT_PUBLIC_SUI_NETWORK",
    "NEXT_PUBLIC_PACKAGE_ID",
    "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
    "NEXT_PUBLIC_ENOKI_API_KEY",
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    "NEXT_PUBLIC_WALRUS_PUBLISHER",
    "NEXT_PUBLIC_WALRUS_AGGREGATOR",
  ],
};

export function loadBuildPublicEnvSource({
  cwd = process.cwd(),
  env = process.env,
  mode = "local",
} = {}) {
  const normalizedMode = normalizeMode(mode);

  if (normalizedMode === "cloudflare") {
    return {
      ...readWranglerBuildEnvFile(cwd),
      ...env,
    };
  }

  return {
    ...readLocalBuildEnvFiles(cwd),
    ...env,
    ...readLocalDeploymentManifestEnv(cwd),
  };
}

export function checkBuildPublicEnv({
  cwd = process.cwd(),
  env = process.env,
  mode = "local",
} = {}) {
  const normalizedMode = normalizeMode(mode);
  const source = loadBuildPublicEnvSource({ cwd, env, mode: normalizedMode });
  const missing = buildPublicEnvKeys[normalizedMode].filter((key) =>
    isMissingValue(source[key]),
  );

  if (missing.length > 0) {
    throw new MissingBuildPublicEnvError(normalizedMode, missing);
  }

  const invalidSuiNetwork = normalizeRequiredValue(
    source.NEXT_PUBLIC_SUI_NETWORK,
  );
  if (invalidSuiNetwork && !validSuiNetworks.has(invalidSuiNetwork)) {
    throw new InvalidBuildPublicEnvError(
      normalizedMode,
      "NEXT_PUBLIC_SUI_NETWORK",
      invalidSuiNetwork,
    );
  }

  return source;
}

export class MissingBuildPublicEnvError extends Error {
  constructor(mode, missing) {
    super(buildMissingMessage(mode, missing));
    this.name = "MissingBuildPublicEnvError";
    this.mode = mode;
    this.missing = missing;
  }
}

export class InvalidBuildPublicEnvError extends Error {
  constructor(mode, key, value) {
    super(buildInvalidMessage(mode, key, value));
    this.name = "InvalidBuildPublicEnvError";
    this.mode = mode;
    this.key = key;
    this.value = value;
  }
}

if (isExecutedDirectly()) {
  try {
    const mode = parseMode(process.argv.slice(2));
    checkBuildPublicEnv({ mode });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function normalizeMode(mode) {
  if (mode === "local" || mode === "cloudflare") {
    return mode;
  }

  if (mode === "cf") {
    return "cloudflare";
  }

  throw new Error(
    `Unknown build env mode "${String(mode)}". Use "local" or "cloudflare".`,
  );
}

function parseMode(argv) {
  const [firstArg] = argv;
  if (!firstArg || firstArg === "local") {
    return "local";
  }

  if (firstArg === "cloudflare" || firstArg === "cf") {
    return "cloudflare";
  }

  if (firstArg.startsWith("--mode=")) {
    return normalizeMode(firstArg.slice("--mode=".length));
  }

  throw new Error(
    `Unknown build env mode argument "${firstArg}". Use "local" or "cloudflare".`,
  );
}

function buildMissingMessage(mode, missing) {
  const requiredKeys = buildPublicEnvKeys[mode].join(", ");

  if (mode === "local") {
    return [
      "Missing required public env variable(s) for local build:",
      missing.join(", "),
      "Local build reads apps/web/.env*, process.env, then ops/deployments/testnet.json.",
      `Required local keys: ${requiredKeys}.`,
      "Set shared testnet values in ops/deployments/testnet.json; use apps/web/.env.local only for personal overrides.",
    ].join("\n");
  }

  return [
    "Missing required public env variable(s) for Cloudflare build:",
    missing.join(", "),
    "Cloudflare build reads process.env first, then falls back to apps/web/wrangler.jsonc vars for public keys only.",
    `Required Cloudflare keys: ${requiredKeys}.`,
    "Set them as Cloudflare Build Variables or define them under wrangler.jsonc vars before running build:cf, preview, deploy, or upload.",
  ].join("\n");
}

function buildInvalidMessage(mode, key, value) {
  return [
    `Invalid public env variable for ${mode} build:`,
    `${key}=${value}`,
    `Expected one of: ${Array.from(validSuiNetworks).join(", ")}.`,
  ].join("\n");
}

function readLocalBuildEnvFiles(cwd) {
  const merged = {};
  const envLocal = readEnvFile(path.join(cwd, ".env.local"));

  Object.assign(merged, readEnvFile(path.join(cwd, ".env")));
  Object.assign(merged, readEnvFile(path.join(cwd, ".env.production")));
  Object.assign(merged, envLocal);
  Object.assign(merged, readEnvFile(path.join(cwd, ".env.production.local")));

  warnDuplicatedCanonicalEnv({
    localEnv: envLocal,
    manifestEnv: readLocalDeploymentManifestEnv(cwd),
    secretsEnv: {},
  });

  return merged;
}

function readLocalDeploymentManifestEnv(cwd) {
  return loadDeploymentManifestEnv({
    repoRoot: resolveRepoRootFromWebRoot(cwd),
  });
}

function readWranglerBuildEnvFile(cwd) {
  const wranglerPath = path.join(cwd, "wrangler.jsonc");
  if (!fs.existsSync(wranglerPath)) {
    return {};
  }

  const parsed = parseJsoncFile(wranglerPath);
  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  const vars =
    "vars" in parsed && parsed.vars && typeof parsed.vars === "object"
      ? parsed.vars
      : null;
  if (!vars) {
    return {};
  }

  const values = {};
  for (const key of buildPublicEnvKeys.cloudflare) {
    const value = vars[key];
    if (typeof value === "string") {
      values[key] = value;
    }
  }

  return values;
}

function parseJsoncFile(filePath) {
  try {
    return JSON.parse(stripJsonComments(fs.readFileSync(filePath, "utf8")));
  } catch (error) {
    throw new Error(
      `Failed to parse ${path.basename(filePath)} while resolving Cloudflare build env: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function stripJsonComments(value) {
  let result = "";
  let inString = false;
  let quote = "";
  let escaping = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];

    if (inString) {
      result += current;

      if (escaping) {
        escaping = false;
        continue;
      }

      if (current === "\\") {
        escaping = true;
        continue;
      }

      if (current === quote) {
        inString = false;
        quote = "";
      }

      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      result += current;
      continue;
    }

    if (current === "/" && next === "/") {
      index += 2;
      while (index < value.length && value[index] !== "\n") {
        index += 1;
      }
      if (index < value.length) {
        result += value[index];
      }
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (
        index < value.length &&
        !(value[index] === "*" && value[index + 1] === "/")
      ) {
        index += 1;
      }
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}

function isMissingValue(value) {
  return typeof value !== "string" || value.trim().length === 0;
}

function normalizeRequiredValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isExecutedDirectly() {
  const entry = process.argv[1];

  if (!entry) {
    return false;
  }

  return path.resolve(entry) === scriptPath;
}
