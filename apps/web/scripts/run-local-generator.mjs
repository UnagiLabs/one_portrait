import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDeploymentManifestEnv,
  loadDeploymentSecretsEnv,
  readEnvFile,
  warnDuplicatedCanonicalEnv,
} from "./deployment-env.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..", "..");
const generatorRoot = path.join(repoRoot, "generator");
const generatorDockerfilePath = path.join(generatorRoot, "Dockerfile");
const generatorImageTag = "one-portrait-generator:local";

export function loadWebScriptEnv({
  env = process.env,
  repoRoot: envRepoRoot = repoRoot,
  webRoot: envWebRoot = webRoot,
  warn = console.warn,
} = {}) {
  const envLocal = readEnvFile(path.join(envWebRoot, ".env.local"));
  const manifestEnv = loadDeploymentManifestEnv({ repoRoot: envRepoRoot });
  const secretsEnv = loadDeploymentSecretsEnv({ repoRoot: envRepoRoot });

  warnDuplicatedCanonicalEnv({
    localEnv: envLocal,
    manifestEnv,
    secretsEnv,
    warn,
  });

  return {
    ...readEnvFile(path.join(envWebRoot, ".env")),
    ...envLocal,
    ...env,
    ...manifestEnv,
    ...secretsEnv,
  };
}

function resolveLocalGeneratorPort(env) {
  return (
    normalizePortEnvValue(env.OP_LOCAL_GENERATOR_PORT) ??
    normalizePortEnvValue(env.PORT) ??
    "8080"
  );
}

export function startLocalGenerator({
  env = process.env,
  spawnImpl = spawn,
  cwd = repoRoot,
  webRoot: envWebRoot = webRoot,
  imageTag = generatorImageTag,
  runDockerBuild = defaultRunDockerBuild,
} = {}) {
  const mergedEnv = loadWebScriptEnv({
    env,
    repoRoot: cwd,
    webRoot: envWebRoot,
  });
  const localPort = resolveLocalGeneratorPort(mergedEnv);

  runDockerBuild({
    contextPath: cwd,
    dockerfilePath: generatorDockerfilePath,
    imageTag,
  });

  const child = spawnImpl(
    "docker",
    buildDockerRunArgs({
      containerName: `one-portrait-generator-${localPort}`,
      imageTag,
      runtimeEnv: buildGeneratorContainerEnv(mergedEnv),
      localPort,
    }),
    {
      cwd,
      env: {
        ...process.env,
        ...env,
        ...mergedEnv,
      },
      stdio: "inherit",
    },
  );

  return { child };
}

if (isExecutedDirectly()) {
  const { child } = startLocalGenerator({
    env: process.env,
    spawnImpl: spawn,
  });

  let handled = false;
  const finalize = ({ code = null, signal = null } = {}) => {
    if (handled) {
      return;
    }

    handled = true;
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(typeof code === "number" && code >= 0 ? code : 1);
  };

  child.once("error", (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    finalize({ code: 1 });
  });

  child.once("exit", (code, signal) => {
    finalize({ code, signal });
  });

  child.once("close", (code, signal) => {
    finalize({ code, signal });
  });
}

function normalizePortEnvValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildDockerRunArgs({
  containerName,
  imageTag,
  localPort,
  runtimeEnv,
}) {
  return [
    "run",
    "--rm",
    "--name",
    containerName,
    "--publish",
    `127.0.0.1:${localPort}:8080`,
    ...buildDockerEnvArgs(runtimeEnv),
    imageTag,
  ];
}

function buildDockerEnvArgs(runtimeEnv) {
  return Object.entries(runtimeEnv).flatMap(([key, value]) =>
    typeof value === "string" && value.length > 0
      ? ["--env", `${key}=${value}`]
      : [],
  );
}

function buildGeneratorContainerEnv(mergedEnv) {
  return {
    ADMIN_CAP_ID: mergedEnv.ADMIN_CAP_ID,
    ADMIN_SUI_PRIVATE_KEY: mergedEnv.ADMIN_SUI_PRIVATE_KEY,
    OP_FINALIZE_DISPATCH_SECRET: mergedEnv.OP_FINALIZE_DISPATCH_SECRET,
    PACKAGE_ID: mergedEnv.PACKAGE_ID ?? mergedEnv.NEXT_PUBLIC_PACKAGE_ID,
    PORT: "8080",
    SUI_NETWORK: mergedEnv.SUI_NETWORK ?? mergedEnv.NEXT_PUBLIC_SUI_NETWORK,
    WALRUS_AGGREGATOR:
      mergedEnv.WALRUS_AGGREGATOR ?? mergedEnv.NEXT_PUBLIC_WALRUS_AGGREGATOR,
    WALRUS_PUBLISHER:
      mergedEnv.WALRUS_PUBLISHER ?? mergedEnv.NEXT_PUBLIC_WALRUS_PUBLISHER,
  };
}

function defaultRunDockerBuild({ contextPath, dockerfilePath, imageTag }) {
  const result = spawnSync(
    "docker",
    ["build", "--file", dockerfilePath, "--tag", imageTag, contextPath],
    {
      cwd: contextPath,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error(`docker build failed with exit code ${result.status ?? 1}`);
  }
}

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return path.resolve(entry) === __filename;
}
