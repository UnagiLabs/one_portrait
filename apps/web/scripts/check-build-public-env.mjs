import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    return { ...env };
  }

  return {
    ...readLocalBuildEnvFiles(cwd),
    ...env,
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
      "Local build reads process.env plus apps/web/.env, apps/web/.env.production, apps/web/.env.local, and apps/web/.env.production.local.",
      `Required local keys: ${requiredKeys}.`,
      "Set them in apps/web/.env.local (see apps/web/.env.example).",
    ].join("\n");
  }

  return [
    "Missing required public env variable(s) for Cloudflare build:",
    missing.join(", "),
    "Cloudflare build reads process.env only. It does not consult wrangler.jsonc or local env files.",
    `Required Cloudflare keys: ${requiredKeys}.`,
    "Set them as Cloudflare Build Variables before running build:cf, preview, deploy, or upload.",
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

  for (const fileName of [
    ".env",
    ".env.production",
    ".env.local",
    ".env.production.local",
  ]) {
    Object.assign(merged, readEnvFile(path.join(cwd, fileName)));
  }

  return merged;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separator = withoutExport.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, separator).trim();
    const rawValue = withoutExport.slice(separator + 1).trim();

    if (!key) {
      continue;
    }

    values[key] = stripWrappingQuotes(rawValue);
  }

  return values;
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
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
