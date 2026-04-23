import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const nextBin = path.join(webRoot, "node_modules", ".bin", "next");

export const e2eStubEnv = {
  NEXT_PUBLIC_SUI_NETWORK: "testnet",
  NEXT_PUBLIC_PACKAGE_ID:
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  NEXT_PUBLIC_REGISTRY_OBJECT_ID:
    "0x0000000000000000000000000000000000000000000000000000000000000002",
  NEXT_PUBLIC_ENOKI_API_KEY: "enoki-e2e-stub",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "google-e2e-stub",
  NEXT_PUBLIC_WALRUS_PUBLISHER: "https://publisher.e2e.stub",
  NEXT_PUBLIC_WALRUS_AGGREGATOR: "https://aggregator.e2e.stub",
  NEXT_PUBLIC_E2E_STUB_WALLET: "1",
  ENOKI_PRIVATE_API_KEY: "enoki-private-e2e-stub",
};

export async function startE2EDev({
  cwd = webRoot,
  env = process.env,
  port = Number(env.E2E_PORT ?? "3100"),
  spawnImpl = spawn,
  isPortBusy = defaultIsPortBusy,
  nextDevBin = path.join(cwd, "node_modules", ".bin", "next"),
}) {
  if (await isPortBusy(port)) {
    throw new Error(
      [
        `[e2e-dev.sh] Port ${port} is already in use.`,
        "Free the port or set E2E_PORT to an unused value before starting Playwright.",
      ].join(" "),
    );
  }

  fs.rmSync(path.join(cwd, ".next"), { force: true, recursive: true });
  const xdgConfigHome = path.join(cwd, ".e2e-xdg");
  fs.mkdirSync(xdgConfigHome, { recursive: true });

  const child = spawnImpl(nextDevBin, ["dev", "-p", String(port)], {
    cwd,
    env: {
      ...env,
      ...e2eStubEnv,
      XDG_CONFIG_HOME: env.XDG_CONFIG_HOME ?? xdgConfigHome,
    },
    stdio: "inherit",
  });

  return { child, port };
}

export async function defaultIsPortBusy(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

if (isExecutedDirectly()) {
  try {
    const { child } = await startE2EDev({
      cwd: webRoot,
      env: process.env,
      nextDevBin: nextBin,
    });
    forwardChildExit(child);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return path.resolve(entry) === __filename;
}

function forwardChildExit(child) {
  if (!(child instanceof EventEmitter) || typeof child.on !== "function") {
    return;
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}
