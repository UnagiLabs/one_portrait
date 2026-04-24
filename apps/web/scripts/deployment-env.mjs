import fs from "node:fs";
import path from "node:path";

export const deploymentPublicEnvKeys = [
  "NEXT_PUBLIC_SUI_NETWORK",
  "NEXT_PUBLIC_PACKAGE_ID",
  "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
  "NEXT_PUBLIC_ENOKI_API_KEY",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_WALRUS_PUBLISHER",
  "NEXT_PUBLIC_WALRUS_AGGREGATOR",
];

export const deploymentGeneratorEnvKeys = [
  "SUI_NETWORK",
  "PACKAGE_ID",
  "ADMIN_CAP_ID",
  "WALRUS_PUBLISHER",
  "WALRUS_AGGREGATOR",
];

export const deploymentSecretEnvKeys = [
  "ADMIN_SUI_PRIVATE_KEY",
  "OP_FINALIZE_DISPATCH_SECRET",
  "ENOKI_PRIVATE_API_KEY",
];

export const deploymentManifestRelativePath = "ops/deployments/testnet.json";
export const deploymentSecretsRelativePath =
  "ops/deployments/testnet.secrets.local.env";

const publicToGeneratorEnvKeys = {
  NEXT_PUBLIC_SUI_NETWORK: "SUI_NETWORK",
  NEXT_PUBLIC_PACKAGE_ID: "PACKAGE_ID",
  NEXT_PUBLIC_WALRUS_PUBLISHER: "WALRUS_PUBLISHER",
  NEXT_PUBLIC_WALRUS_AGGREGATOR: "WALRUS_AGGREGATOR",
};

const manifestSections = ["publicEnv", "generatorEnv", "env", "vars"];

export function resolveRepoRootFromWebRoot(webRoot) {
  return path.resolve(webRoot, "..", "..");
}

export function loadDeploymentManifestEnv({
  repoRoot,
  relativePath = deploymentManifestRelativePath,
} = {}) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed = parseJsonFile(filePath);
  const rawValues = {};

  for (const section of manifestSections) {
    if (isRecord(parsed?.[section])) {
      Object.assign(rawValues, parsed[section]);
    }
  }

  if (isRecord(parsed)) {
    Object.assign(rawValues, parsed);
  }

  const values = pickStringValues(rawValues, [
    ...deploymentPublicEnvKeys,
    ...deploymentGeneratorEnvKeys,
  ]);

  for (const [publicKey, generatorKey] of Object.entries(
    publicToGeneratorEnvKeys,
  )) {
    if (
      typeof values[generatorKey] !== "string" &&
      typeof values[publicKey] === "string"
    ) {
      values[generatorKey] = values[publicKey];
    }
  }

  return values;
}

export function loadDeploymentSecretsEnv({
  repoRoot,
  relativePath = deploymentSecretsRelativePath,
} = {}) {
  return pickStringValues(readEnvFile(path.join(repoRoot, relativePath)), [
    ...deploymentSecretEnvKeys,
  ]);
}

export function warnDuplicatedCanonicalEnv({
  localEnv,
  manifestEnv,
  secretsEnv,
  warn = console.warn,
} = {}) {
  const warnings = [];

  for (const key of [
    ...deploymentPublicEnvKeys,
    ...deploymentGeneratorEnvKeys,
    ...deploymentSecretEnvKeys,
  ]) {
    if (typeof localEnv?.[key] !== "string") {
      continue;
    }

    if (typeof secretsEnv?.[key] === "string") {
      warnings.push({ key, source: deploymentSecretsRelativePath });
      continue;
    }

    if (typeof manifestEnv?.[key] === "string") {
      warnings.push({ key, source: deploymentManifestRelativePath });
    }
  }

  if (warnings.length === 0) {
    return;
  }

  const details = warnings
    .map(({ key, source }) => `${key} -> ${source}`)
    .join(", ");
  warn(
    `[deployment-env] apps/web/.env.local contains canonical deployment key(s). ${details}. Canonical deployment values take precedence; values are not printed.`,
  );
}

export function readEnvFile(filePath) {
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

    if (key) {
      values[key] = stripWrappingQuotes(rawValue);
    }
  }

  return values;
}

function pickStringValues(source, keys) {
  const values = {};

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") {
      values[key] = value;
    }
  }

  return values;
}

function parseJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse ${path.relative(process.cwd(), filePath)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
