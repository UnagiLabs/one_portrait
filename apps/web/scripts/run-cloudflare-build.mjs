import { spawn } from "node:child_process";
import path from "node:path";

import {
  buildPublicEnvKeys,
  checkBuildPublicEnv,
} from "./check-build-public-env.mjs";

const cwd = process.cwd();
const source = checkBuildPublicEnv({
  cwd,
  env: process.env,
  mode: "cloudflare",
});

const buildEnv = {
  ...process.env,
  ...pickCloudflareBuildEnv(source),
  PATH: `${path.join(cwd, "scripts")}:${process.env.PATH ?? ""}`,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? path.join(cwd, ".wrangler"),
};

const child = spawn("opennextjs-cloudflare", ["build"], {
  cwd,
  env: buildEnv,
  stdio: "inherit",
  shell: process.platform === "win32",
});

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

function pickCloudflareBuildEnv(source) {
  const env = {};

  for (const key of buildPublicEnvKeys.cloudflare) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      env[key] = value;
    }
  }

  return env;
}
