import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(repoRoot, "ops/deployments/testnet.json");
const requiredPublicKeys = [
  "NEXT_PUBLIC_SUI_NETWORK",
  "NEXT_PUBLIC_PACKAGE_ID",
  "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
  "NEXT_PUBLIC_ENOKI_API_KEY",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_WALRUS_PUBLISHER",
  "NEXT_PUBLIC_WALRUS_AGGREGATOR",
];
const forbiddenSecretKeys = [
  "ADMIN_SUI_PRIVATE_KEY",
  "OP_FINALIZE_DISPATCH_SECRET",
  "ENOKI_PRIVATE_API_KEY",
];

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const missing = requiredPublicKeys.filter(
    (key) => typeof manifest[key] !== "string" || manifest[key].trim() === "",
  );
  const forbidden = forbiddenSecretKeys.filter((key) => key in manifest);

  if (missing.length > 0 || forbidden.length > 0) {
    const messages = [];
    if (missing.length > 0) {
      messages.push(`Missing deployment public key(s): ${missing.join(", ")}`);
    }
    if (forbidden.length > 0) {
      messages.push(
        `Secret key(s) must not be committed to testnet.json: ${forbidden.join(
          ", ",
        )}`,
      );
    }
    throw new Error(messages.join("\n"));
  }

  console.log("Deployment manifest check passed: ops/deployments/testnet.json");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
