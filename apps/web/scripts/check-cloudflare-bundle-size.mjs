import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const limitMiB = Number(process.env.CF_WORKER_GZIP_LIMIT_MIB ?? "3");
const cwd = fileURLToPath(new URL("..", import.meta.url));
const env = {
  ...process.env,
  PATH: `${path.join(cwd, "scripts")}:${process.env.PATH ?? ""}`,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? path.join(cwd, ".wrangler"),
};

runChecked("corepack", ["pnpm", "exec", "opennextjs-cloudflare", "build"], {
  stdio: "inherit",
});

const deployDryRun = spawnSync(
  "corepack",
  ["pnpm", "exec", "wrangler", "deploy", "--dry-run"],
  {
    cwd,
    encoding: "utf8",
    env,
  },
);

const combinedOutput =
  `${deployDryRun.stdout ?? ""}\n${deployDryRun.stderr ?? ""}`.trim();

if (deployDryRun.status !== 0) {
  if (combinedOutput.length > 0) {
    process.stderr.write(`${combinedOutput}\n`);
  }
  process.exit(deployDryRun.status ?? 1);
}

const sizeMatch = combinedOutput.match(
  /Total Upload:\s*([\d.]+)\s*(KiB|MiB)\s*\/\s*gzip:\s*([\d.]+)\s*(KiB|MiB)/i,
);

if (!sizeMatch) {
  process.stderr.write(
    "Failed to parse Wrangler dry-run bundle size output.\n",
  );
  if (combinedOutput.length > 0) {
    process.stderr.write(`${combinedOutput}\n`);
  }
  process.exit(1);
}

const [, rawSizeValue, rawSizeUnit, gzipSizeValue, gzipSizeUnit] = sizeMatch;
const gzipMiB = toMiB(Number(gzipSizeValue), gzipSizeUnit);

process.stdout.write(
  `${[
    "Cloudflare worker bundle size",
    `Total Upload: ${rawSizeValue} ${rawSizeUnit}`,
    `gzip: ${gzipSizeValue} ${gzipSizeUnit}`,
    `limit: ${limitMiB.toFixed(2)} MiB`,
  ].join("\n")}\n`,
);

if (gzipMiB > limitMiB) {
  process.stderr.write(
    `Compressed worker bundle exceeds limit: ${gzipMiB.toFixed(2)} MiB > ${limitMiB.toFixed(2)} MiB\n`,
  );
  process.exit(1);
}

function runChecked(command, args, options) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function toMiB(value, unit) {
  return unit.toLowerCase() === "mib" ? value : value / 1024;
}
