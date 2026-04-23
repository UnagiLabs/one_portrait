import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForGeneratorStackHealth } from "./generator-stack-health.mjs";
import { runGeneratorStackPreflight } from "./generator-stack-preflight.mjs";
import {
  loadWebScriptEnv,
  startLocalGenerator as startLocalGeneratorLauncher,
} from "./run-local-generator.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const DEFAULT_LOCAL_PORT = 8080;

export async function runGeneratorStackTunnel({
  env = process.env,
  logger = console,
  preflight = runGeneratorStackPreflight,
  processImpl = process,
  spawnImpl = spawn,
  startLocalGenerator = startLocalGeneratorLauncher,
  waitForHealth = waitForGeneratorStackHealth,
} = {}) {
  const signalState = createSignalState(processImpl);
  let generator = null;
  let tunnel = null;
  const mergedEnv = loadWebScriptEnv({ env });

  try {
    const preflightResult = await preflight({ env: mergedEnv, logger });
    if (!preflightResult.ok) {
      return preflightResult;
    }

    if (signalState.value !== null) {
      return stopForSignal({
        generator,
        signal: signalState.value,
        tunnel,
      });
    }

    const generatorSpawn = await startLocalGenerator({
      env: mergedEnv,
      spawnImpl,
    });
    generator = trackChild(generatorSpawn.child);

    if (signalState.value !== null) {
      return stopForSignal({
        generator,
        signal: signalState.value,
        tunnel,
      });
    }

    const localHealth = await waitForHealthPhase({
      healthPromise: waitForHealth({
        label: "local",
        logger,
        url: `http://127.0.0.1:${
          preflightResult.localPort ?? DEFAULT_LOCAL_PORT
        }/health`,
      }),
      terminalPromises: [
        generator.exitPromise.then((result) => ({
          child: "generator",
          kind: "child-exit",
          result,
        })),
        signalState.promise,
      ],
    });

    if (localHealth.kind !== "health") {
      return handleTerminalResult({
        generator,
        result: localHealth,
        tunnel,
      });
    }

    if (!localHealth.result.ok) {
      await stopTrackedChild(generator);
      return localHealth.result;
    }

    tunnel = trackChild(
      spawnImpl("cloudflared", ["tunnel", "run", preflightResult.tunnelName], {
        cwd: webRoot,
        env: mergedEnv,
        stdio: "inherit",
      }),
    );

    if (signalState.value !== null) {
      return stopForSignal({
        generator,
        signal: signalState.value,
        tunnel,
      });
    }

    const externalHealth = await waitForHealthPhase({
      healthPromise: waitForHealth({
        label: "external",
        logger,
        url: new URL("/health", mergedEnv.OP_FINALIZE_DISPATCH_URL).href,
      }),
      terminalPromises: [
        generator.exitPromise.then((result) => ({
          child: "generator",
          kind: "child-exit",
          result,
        })),
        tunnel.exitPromise.then((result) => ({
          child: "tunnel",
          kind: "child-exit",
          result,
        })),
        signalState.promise,
      ],
    });

    if (externalHealth.kind !== "health") {
      return handleTerminalResult({
        generator,
        result: externalHealth,
        tunnel,
      });
    }

    if (!externalHealth.result.ok) {
      await stopTrackedChild(generator);
      await stopTrackedChild(tunnel);
      return externalHealth.result;
    }

    logger?.info?.("[generator-stack][ready]");

    const terminalResult = await Promise.race([
      generator.exitPromise.then((result) => ({
        child: "generator",
        kind: "child-exit",
        result,
      })),
      tunnel.exitPromise.then((result) => ({
        child: "tunnel",
        kind: "child-exit",
        result,
      })),
      signalState.promise,
    ]);

    if (isSignalResult(terminalResult)) {
      return stopForSignal({
        generator,
        signal: terminalResult.signal,
        tunnel,
      });
    }

    return handleTerminalResult({
      generator,
      result: terminalResult,
      tunnel,
    });
  } finally {
    signalState.cleanup();
  }
}

if (isExecutedDirectly()) {
  const result = await runGeneratorStackTunnel({
    env: process.env,
    processImpl: process,
    spawnImpl: spawn,
  });

  if (result.signal) {
    process.kill(process.pid, result.signal);
  } else {
    process.exit(result.exitCode);
  }
}

function createSignalState(processImpl) {
  const state = {
    cleanup: () => {},
    promise: Promise.resolve(null),
    value: null,
  };

  let resolve;
  state.promise = new Promise((innerResolve) => {
    resolve = innerResolve;
  });

  const handleSignal = (signal) => {
    if (state.value !== null) {
      return;
    }

    state.value = signal;
    resolve?.({ kind: "signal", signal });
  };

  const sigintHandler = () => handleSignal("SIGINT");
  const sigtermHandler = () => handleSignal("SIGTERM");

  processImpl.once("SIGINT", sigintHandler);
  processImpl.once("SIGTERM", sigtermHandler);

  state.cleanup = () => {
    removeListener(processImpl, "SIGINT", sigintHandler);
    removeListener(processImpl, "SIGTERM", sigtermHandler);
  };

  return state;
}

function trackChild(child) {
  let stopping = false;
  let exited = false;
  let exitResolve;

  const exitPromise = new Promise((resolve) => {
    exitResolve = resolve;
  });

  child.once("exit", (code, signal) => {
    exited = true;
    exitResolve({
      code: typeof code === "number" ? code : null,
      signal: typeof signal === "string" ? signal : null,
    });
  });

  return {
    exitPromise,
    async stop(signal = "SIGTERM") {
      if (stopping || exited) {
        await exitPromise;
        return;
      }

      stopping = true;
      child.kill(signal);
      await exitPromise;
    },
  };
}

async function waitForHealthPhase({ healthPromise, terminalPromises }) {
  return Promise.race([
    healthPromise.then((result) => ({ kind: "health", result })),
    ...terminalPromises,
  ]);
}

async function handleTerminalResult({ generator, result, tunnel }) {
  if (isSignalResult(result)) {
    return stopForSignal({
      generator,
      signal: result.signal,
      tunnel,
    });
  }

  if (result.child === "generator") {
    await stopTrackedChild(tunnel);
    return {
      exitCode: 1,
      marker: "[generator-stack][child-exit][generator]",
      ok: false,
    };
  }

  await stopTrackedChild(generator);
  return {
    exitCode: 1,
    marker: "[generator-stack][child-exit][tunnel]",
    ok: false,
  };
}

async function stopForSignal({ generator, signal, tunnel }) {
  await Promise.all([stopTrackedChild(generator), stopTrackedChild(tunnel)]);

  return {
    exitCode: 1,
    marker: `[generator-stack][signal][${signal}]`,
    ok: false,
    signal,
  };
}

async function stopTrackedChild(child) {
  if (!child) {
    return;
  }

  await child.stop("SIGTERM");
}

function isSignalResult(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    value.kind === "signal" &&
    typeof value.signal === "string"
  );
}

function removeListener(target, eventName, handler) {
  if (typeof target.off === "function") {
    target.off(eventName, handler);
    return;
  }

  if (typeof target.removeListener === "function") {
    target.removeListener(eventName, handler);
  }
}

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return path.resolve(entry) === __filename;
}
