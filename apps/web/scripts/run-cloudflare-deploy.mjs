import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  readDeploymentManifest,
  toWebPublicEnv,
  toWranglerVarArgs,
} from "../../../scripts/deployment-env.mjs";

export const runtimeUrlVarKeys = [
  "OP_GENERATOR_BASE_URL",
  "OP_FINALIZE_DISPATCH_URL",
  "OP_GENERATOR_RUNTIME_URL_OVERRIDE",
];

export const requiredCloudflareCredentialKeys = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
];

export function buildCloudflareDeployArgs({
  env = process.env,
  manifest,
} = {}) {
  return [
    "deploy",
    "--",
    ...toWranglerVarArgs(toWebPublicEnv(manifest)),
    ...toRuntimeUrlVarArgs(env),
  ];
}

export function buildCloudflareDeployEnv({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  return {
    ...env,
    PATH: `${path.join(cwd, "scripts")}:${env.PATH ?? ""}`,
    XDG_CONFIG_HOME: env.XDG_CONFIG_HOME ?? path.join(cwd, ".wrangler"),
  };
}

export function getMissingCloudflareDeployCredentials({
  env = process.env,
} = {}) {
  return requiredCloudflareCredentialKeys.filter((key) => {
    const value = env?.[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

export function assertCloudflareDeployCredentials({ env = process.env } = {}) {
  const missing = getMissingCloudflareDeployCredentials({ env });

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing required Cloudflare deploy credentials: ${missing.join(", ")}`,
        "Set these as GitHub Actions repository secrets, or attach the job to the GitHub Environment that owns them.",
      ].join("\n"),
    );
  }
}

function runCloudflareDeploy({
  cwd = process.cwd(),
  env = process.env,
  spawnImpl = spawn,
} = {}) {
  assertCloudflareDeployCredentials({ env });

  const manifest = readDeploymentManifest();
  const child = spawnImpl(
    "opennextjs-cloudflare",
    buildCloudflareDeployArgs({ env, manifest }),
    {
      cwd,
      env: buildCloudflareDeployEnv({ cwd, env }),
      shell: process.platform === "win32",
      stdio: "inherit",
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

  return child;
}

function toRuntimeUrlVarArgs(env) {
  return runtimeUrlVarKeys.flatMap((key) => {
    const value = env?.[key];
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized.length > 0 ? ["--var", `${key}:${normalized}`] : [];
  });
}

if (import.meta.url === pathToFileUrl(process.argv[1])) {
  try {
    assertCloudflareDeployCredentials();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (process.argv.includes("--check")) {
    console.log("Cloudflare deploy credentials are configured.");
  } else {
    runCloudflareDeploy();
  }
}

function pathToFileUrl(value) {
  return value ? pathToFileURL(path.resolve(value)).href : "";
}
