import { execFile as execFileCallback } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const DEFAULT_LOCAL_PORT = 8080;

export async function runGeneratorStackPreflight({
  env = process.env,
  runCommand = defaultRunCommand,
  logger = console,
} = {}) {
  const tunnelName = normalizeRequiredValue(env.OP_LOCAL_TUNNEL_NAME);
  const dispatchUrlRaw = normalizeRequiredValue(env.OP_FINALIZE_DISPATCH_URL);

  if (!tunnelName || !dispatchUrlRaw) {
    emitFailure(
      logger,
      "missing-env",
      [
        !tunnelName ? "OP_LOCAL_TUNNEL_NAME" : null,
        !dispatchUrlRaw ? "OP_FINALIZE_DISPATCH_URL" : null,
      ].filter(Boolean),
    );

    return failureResult("missing-env");
  }

  const dispatchUrl = parseHttpsUrl(dispatchUrlRaw);
  if (!dispatchUrl) {
    emitFailure(logger, "tunnel-misconfig", [
      "OP_FINALIZE_DISPATCH_URL must be a valid https:// URL with a hostname",
    ]);
    return failureResult("tunnel-misconfig");
  }

  const localPort = normalizePort(
    env.OP_LOCAL_GENERATOR_PORT ?? DEFAULT_LOCAL_PORT,
  );
  if (localPort === null) {
    emitFailure(logger, "tunnel-misconfig", [
      "OP_LOCAL_GENERATOR_PORT must be an integer between 1 and 65535",
    ]);
    return failureResult("tunnel-misconfig");
  }

  try {
    await executeCloudflared(runCommand, ["--version"]);
  } catch (error) {
    if (isMissingCommandError(error)) {
      emitFailure(logger, "missing-cloudflared", [
        "cloudflared must be installed and available on PATH",
      ]);
      return failureResult("missing-cloudflared");
    }

    throw error;
  }
  const configPath = resolveCloudflaredConfigPath(env);
  const expectedService = `http://localhost:${localPort}`;

  try {
    await executeCloudflared(runCommand, [
      "--config",
      configPath,
      "tunnel",
      "ingress",
      "validate",
    ]);

    const tunnelInfo = await executeCloudflared(runCommand, [
      "tunnel",
      "info",
      tunnelName,
    ]);
    const ingressRule = await executeCloudflared(runCommand, [
      "--config",
      configPath,
      "tunnel",
      "ingress",
      "rule",
      dispatchUrl.href,
    ]);

    if (!containsTunnelReference(tunnelInfo.stdout, tunnelName)) {
      emitFailure(logger, "tunnel-misconfig", [
        `tunnel info does not mention ${tunnelName}`,
      ]);
      return failureResult("tunnel-misconfig");
    }

    if (
      !matchesExpectedIngress({
        hostname: dispatchUrl.hostname,
        output: ingressRule.stdout,
        service: expectedService,
      })
    ) {
      emitFailure(logger, "tunnel-misconfig", [
        `ingress rule does not route ${dispatchUrl.hostname} to ${expectedService}`,
      ]);
      return failureResult("tunnel-misconfig");
    }
  } catch (error) {
    return handleCloudflaredFailure(error, logger);
  }

  return {
    ok: true,
    exitCode: 0,
    tunnelName,
    publicHostname: dispatchUrl.hostname,
    localPort,
  };
}

async function defaultRunCommand(command, args, options = {}) {
  const { stdout, stderr } = await execFile(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });

  return {
    stdout: stdout ?? "",
    stderr: stderr ?? "",
  };
}

async function executeCloudflared(runCommand, args, options = {}) {
  return runCommand("cloudflared", args, options);
}

function resolveCloudflaredConfigPath(env) {
  const explicitPath =
    normalizeRequiredValue(env.OP_LOCAL_TUNNEL_CONFIG_PATH) ??
    normalizeRequiredValue(env.CLOUDFLARED_CONFIG);

  return explicitPath ?? path.join(os.homedir(), ".cloudflared", "config.yml");
}

function emitFailure(logger, marker, details = []) {
  const message = [
    `[generator-stack][preflight][${marker}]`,
    ...details.filter(Boolean),
  ].join(" ");

  logger?.error?.(message);
}

function failureResult(marker) {
  return {
    ok: false,
    exitCode: 1,
    marker: `[generator-stack][preflight][${marker}]`,
  };
}

function normalizeRequiredValue(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function parseHttpsUrl(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || !url.hostname) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return port;
}

function containsTunnelReference(output, tunnelName) {
  const escapedTunnelName = escapeRegExp(tunnelName.toLowerCase());
  const normalizedOutput = String(output ?? "").toLowerCase();
  const matcher = new RegExp(
    `(^|[^a-z0-9.-])${escapedTunnelName}([^a-z0-9.-]|$)`,
    "i",
  );

  return matcher.test(normalizedOutput);
}

function matchesExpectedIngress({ hostname, output, service }) {
  const normalizedOutput = String(output ?? "").toLowerCase();
  const normalizedHostname = hostname.toLowerCase();
  const normalizedService = service.toLowerCase();

  return (
    normalizedOutput.includes(normalizedHostname) &&
    normalizedOutput.includes(normalizedService)
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMissingCommandError(error) {
  return error?.code === "ENOENT" || /not found/i.test(getErrorMessage(error));
}

function handleCloudflaredFailure(error, logger) {
  if (isMissingCommandError(error)) {
    emitFailure(logger, "missing-cloudflared", [
      "cloudflared must be installed and available on PATH",
    ]);
    return failureResult("missing-cloudflared");
  }

  emitFailure(logger, "tunnel-misconfig", [
    getErrorMessage(error) || "cloudflared tunnel validation failed",
  ]);
  return failureResult("tunnel-misconfig");
}

function getErrorMessage(error) {
  if (typeof error?.message === "string") {
    return error.message;
  }

  if (typeof error?.stderr === "string" && error.stderr.trim().length > 0) {
    return error.stderr.trim();
  }

  return "";
}
