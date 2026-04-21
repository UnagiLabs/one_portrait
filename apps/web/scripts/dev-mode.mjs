import fs from "node:fs";
import path from "node:path";

export const forbiddenStubMarkers = [
  ["NEXT_PUBLIC_E2E_STUB_WALLET", "1"],
  [
    "NEXT_PUBLIC_PACKAGE_ID",
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  ],
  [
    "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
    "0x0000000000000000000000000000000000000000000000000000000000000002",
  ],
  ["NEXT_PUBLIC_ENOKI_API_KEY", "enoki-e2e-stub"],
  ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "google-e2e-stub"],
  ["NEXT_PUBLIC_WALRUS_PUBLISHER", "https://publisher.e2e.stub"],
  ["NEXT_PUBLIC_WALRUS_AGGREGATOR", "https://aggregator.e2e.stub"],
  ["ENOKI_PRIVATE_API_KEY", "enoki-private-e2e-stub"],
];

export function assertNormalDevEnvironment({
  cwd,
  env = process.env,
  envFilePath = path.join(cwd, ".env.local"),
}) {
  const envFileValues = readEnvFile(envFilePath);
  const matches = findForbiddenStubMarkers({ env, envFileValues });

  if (matches.length === 0) {
    return;
  }

  const details = matches
    .map(({ key, value, source }) => `- ${key}=${value} (${source})`)
    .join("\n");

  throw new Error(
    [
      "[run-dev] Refusing to start normal development with E2E stub values still present.",
      "Clear the values below before running `pnpm run dev`.",
      details,
    ].join("\n"),
  );
}

export function findForbiddenStubMarkers({ env = {}, envFileValues = {} }) {
  const matches = [];

  for (const [key, value] of forbiddenStubMarkers) {
    if (env[key] === value) {
      matches.push({ key, value, source: "process.env" });
    }
    if (envFileValues[key] === value) {
      matches.push({ key, value, source: ".env.local" });
    }
  }

  return matches;
}

export function parseEnvFile(content) {
  const values = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (!key) {
      continue;
    }

    values[key] = stripWrappingQuotes(value);
  }

  return values;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return parseEnvFile(fs.readFileSync(filePath, "utf8"));
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
