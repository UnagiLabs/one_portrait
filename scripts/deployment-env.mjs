import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRepoRoot = path.resolve(__dirname, "..");
const defaultManifestPath = path.join(
  defaultRepoRoot,
  "ops",
  "deployments",
  "testnet.json",
);

const suiNetworks = new Set(["mainnet", "testnet", "devnet", "localnet"]);
const suiAddressPattern = /^0x[0-9a-fA-F]{64}$/;
const requiredManifestKeys = [
  "network",
  "packageId",
  "registryObjectId",
  "adminCapId",
  "walrusPublisher",
  "walrusAggregator",
  "enokiPublicApiKey",
  "googleClientId",
];

export const webPublicEnvKeys = [
  "NEXT_PUBLIC_SUI_NETWORK",
  "NEXT_PUBLIC_PACKAGE_ID",
  "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
  "NEXT_PUBLIC_ENOKI_API_KEY",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_WALRUS_PUBLISHER",
  "NEXT_PUBLIC_WALRUS_AGGREGATOR",
];

export const generatorEnvKeys = [
  "SUI_NETWORK",
  "PACKAGE_ID",
  "ADMIN_CAP_ID",
  "WALRUS_PUBLISHER",
  "WALRUS_AGGREGATOR",
];

export class InvalidDeploymentManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidDeploymentManifestError";
  }
}

export function resolveDeploymentManifestPath({
  repoRoot = defaultRepoRoot,
  manifestPath,
} = {}) {
  return path.resolve(
    manifestPath ??
      process.env.OP_DEPLOYMENT_MANIFEST ??
      path.join(repoRoot, "ops", "deployments", "testnet.json"),
  );
}

export function readDeploymentManifest({
  repoRoot = defaultRepoRoot,
  manifestPath,
} = {}) {
  const resolvedPath = resolveDeploymentManifestPath({ repoRoot, manifestPath });
  const raw = fs.readFileSync(resolvedPath, "utf8");
  return parseDeploymentManifest(JSON.parse(raw), resolvedPath);
}

export function readOptionalDeploymentManifest({
  repoRoot = defaultRepoRoot,
  manifestPath,
} = {}) {
  const resolvedPath = resolveDeploymentManifestPath({ repoRoot, manifestPath });
  if (!fs.existsSync(resolvedPath)) {
    return null;
  }
  return readDeploymentManifest({ repoRoot, manifestPath: resolvedPath });
}

export function parseDeploymentManifest(input, source = "deployment manifest") {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InvalidDeploymentManifestError(
      `${source} must be a JSON object.`,
    );
  }

  const missing = requiredManifestKeys.filter((key) =>
    isMissingString(input[key]),
  );
  if (missing.length > 0) {
    throw new InvalidDeploymentManifestError(
      `${source} is missing required key(s): ${missing.join(", ")}.`,
    );
  }

  const manifest = {
    network: normalizeString(input.network),
    packageId: normalizeString(input.packageId),
    registryObjectId: normalizeString(input.registryObjectId),
    adminCapId: normalizeString(input.adminCapId),
    walrusPublisher: normalizeString(input.walrusPublisher),
    walrusAggregator: normalizeString(input.walrusAggregator),
    enokiPublicApiKey: normalizeString(input.enokiPublicApiKey),
    googleClientId: normalizeString(input.googleClientId),
  };

  if (!suiNetworks.has(manifest.network)) {
    throw new InvalidDeploymentManifestError(
      `${source} has invalid network "${manifest.network}". Expected one of: ${Array.from(
        suiNetworks,
      ).join(", ")}.`,
    );
  }

  for (const key of ["packageId", "registryObjectId", "adminCapId"]) {
    if (!suiAddressPattern.test(manifest[key])) {
      throw new InvalidDeploymentManifestError(
        `${source} has invalid ${key}: ${manifest[key]}. Expected a 32-byte Sui object id.`,
      );
    }
  }

  for (const key of ["walrusPublisher", "walrusAggregator"]) {
    try {
      const parsed = new URL(manifest[key]);
      if (parsed.protocol !== "https:") {
        throw new Error("non-https URL");
      }
    } catch {
      throw new InvalidDeploymentManifestError(
        `${source} has invalid ${key}: ${manifest[key]}. Expected an https URL.`,
      );
    }
  }

  return manifest;
}

export function toWebPublicEnv(manifest) {
  return {
    NEXT_PUBLIC_SUI_NETWORK: manifest.network,
    NEXT_PUBLIC_PACKAGE_ID: manifest.packageId,
    NEXT_PUBLIC_REGISTRY_OBJECT_ID: manifest.registryObjectId,
    NEXT_PUBLIC_ENOKI_API_KEY: manifest.enokiPublicApiKey,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: manifest.googleClientId,
    NEXT_PUBLIC_WALRUS_PUBLISHER: manifest.walrusPublisher,
    NEXT_PUBLIC_WALRUS_AGGREGATOR: manifest.walrusAggregator,
  };
}

export function toGeneratorEnv(manifest) {
  return {
    SUI_NETWORK: manifest.network,
    PACKAGE_ID: manifest.packageId,
    ADMIN_CAP_ID: manifest.adminCapId,
    WALRUS_PUBLISHER: manifest.walrusPublisher,
    WALRUS_AGGREGATOR: manifest.walrusAggregator,
  };
}

export function checkPublishedTomlDrift({
  repoRoot = defaultRepoRoot,
  manifest = readDeploymentManifest({ repoRoot }),
  publishedTomlPath = path.join(repoRoot, "contracts", "Published.toml"),
} = {}) {
  const publishedToml = fs.readFileSync(publishedTomlPath, "utf8");
  const publishedAt = readTomlString(publishedToml, "published-at");

  if (publishedAt !== manifest.packageId) {
    throw new Error(
      `contracts/Published.toml published-at (${publishedAt ?? "missing"}) does not match deployment manifest packageId (${manifest.packageId}).`,
    );
  }

  return {
    packageId: manifest.packageId,
    publishedAt,
  };
}

function readTomlString(content, key) {
  const match = content.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]+)"`, "m"));
  return match?.[1] ?? null;
}

function printEnv(env) {
  for (const [key, value] of Object.entries(env)) {
    console.log(`${key}=${shellEscape(value)}`);
  }
}

function shellEscape(value) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingString(value) {
  return normalizeString(value).length === 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (import.meta.url === pathToFileUrl(process.argv[1])) {
  const command = process.argv[2] ?? "web";

  try {
    const manifest = readDeploymentManifest({
      manifestPath: process.env.OP_DEPLOYMENT_MANIFEST ?? defaultManifestPath,
    });

    if (command === "web" || command === "web-public") {
      printEnv(toWebPublicEnv(manifest));
    } else if (command === "generator") {
      printEnv(toGeneratorEnv(manifest));
    } else if (command === "json") {
      console.log(JSON.stringify(manifest, null, 2));
    } else if (command === "check-drift") {
      checkPublishedTomlDrift({ manifest });
      console.log("deployment manifest drift check passed");
    } else {
      throw new Error(
        `Unknown command "${command}". Use web, generator, json, or check-drift.`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function pathToFileUrl(value) {
  return value ? pathToFileURL(path.resolve(value)).href : "";
}
