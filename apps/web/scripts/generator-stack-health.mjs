import dns from "node:dns";
import https from "node:https";

const GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS = 1000;
const GENERATOR_STACK_HEALTH_TIMEOUT_MS = 30000;
const QUICK_TUNNEL_HOST_SUFFIX = ".trycloudflare.com";

export {
  GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS,
  GENERATOR_STACK_HEALTH_TIMEOUT_MS,
};

export async function waitForGeneratorStackHealth({
  createAbortController = defaultCreateAbortController,
  label,
  url,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  now = defaultNow,
  logger = console,
  requestWithResolvedHostname = defaultRequestWithResolvedHostname,
  resolveHostname = defaultResolveHostname,
  retryIntervalMs = GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS,
  timeoutMs = GENERATOR_STACK_HEALTH_TIMEOUT_MS,
  waitForAttemptTimeout = defaultWaitForAttemptTimeout,
} = {}) {
  if (!label) {
    throw new Error("label is required");
  }

  if (!url) {
    throw new Error("url is required");
  }

  const deadline = now() + timeoutMs;

  while (true) {
    const remainingMs = Math.max(0, deadline - now());
    if (remainingMs <= 0) {
      const marker = `[generator-stack][health][${label}][timeout]`;
      logger?.warn?.(marker);

      return {
        ok: false,
        exitCode: 1,
        marker,
      };
    }

    const attemptTimeoutMs = Math.min(retryIntervalMs, remainingMs);
    const abortController = createAbortController();
    const attemptResult = await raceHealthAttempt({
      abortController,
      fetchImpl,
      requestWithResolvedHostname,
      resolveHostname,
      url,
      waitForAttemptTimeout,
      waitMs: attemptTimeoutMs,
    });

    if (attemptResult === "ready") {
      const marker = `[generator-stack][health][${label}][ready]`;
      logger?.info?.(marker);

      return {
        ok: true,
        exitCode: 0,
        marker,
      };
    }

    logger?.info?.(`[generator-stack][health][${label}][retrying]`);
    await sleep(Math.min(retryIntervalMs, Math.max(0, deadline - now())));
  }
}

async function isHealthReady({
  fetchImpl,
  requestWithResolvedHostname,
  resolveHostname,
  signal,
  url,
}) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      signal,
    });

    return response?.status === 200;
  } catch {
    return isHealthReadyWithResolvedHostname({
      requestWithResolvedHostname,
      resolveHostname,
      signal,
      url,
    });
  }
}

async function raceHealthAttempt({
  abortController,
  fetchImpl,
  requestWithResolvedHostname,
  resolveHostname,
  url,
  waitForAttemptTimeout,
  waitMs,
}) {
  const timeoutResult = await Promise.race([
    isHealthReady({
      fetchImpl,
      requestWithResolvedHostname,
      resolveHostname,
      signal: abortController.signal,
      url,
    }),
    waitForAttemptTimeout({
      milliseconds: waitMs,
      signal: abortController.signal,
    }).then(() => "timeout"),
  ]);

  abortController.abort();

  return timeoutResult === true ? "ready" : "retry";
}

async function isHealthReadyWithResolvedHostname({
  requestWithResolvedHostname,
  resolveHostname,
  signal,
  url,
}) {
  const parsed = parseQuickTunnelUrl(url);
  if (parsed === null) {
    return false;
  }

  try {
    const ipAddress = await resolveHostname(parsed.hostname);
    if (!ipAddress) {
      return false;
    }

    const response = await requestWithResolvedHostname({
      hostname: parsed.hostname,
      ipAddress,
      signal,
      url,
    });

    return response?.status === 200;
  } catch {
    return false;
  }
}

function parseQuickTunnelUrl(url) {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname.endsWith(QUICK_TUNNEL_HOST_SUFFIX)
    ) {
      return null;
    }

    return {
      hostname: parsed.hostname,
    };
  } catch {
    return null;
  }
}

async function defaultResolveHostname(hostname) {
  const resolver = new dns.promises.Resolver();
  resolver.setServers(["1.1.1.1", "1.0.0.1"]);
  const addresses = await resolver.resolve4(hostname);
  return addresses[0] ?? null;
}

async function defaultRequestWithResolvedHostname({ ipAddress, signal, url }) {
  return new Promise((resolve, reject) => {
    const family = ipAddress.includes(":") ? 6 : 4;
    const request = https.request(
      new URL(url),
      {
        method: "GET",
        signal,
        lookup: (_hostname, _options, callback) => {
          callback(null, ipAddress, family);
        },
      },
      (response) => {
        response.resume();
        response.once("end", () => {
          resolve({
            status: response.statusCode ?? null,
          });
        });
      },
    );

    request.once("error", reject);
    request.end();
  });
}

async function defaultSleep(milliseconds) {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function defaultNow() {
  return Date.now();
}

function defaultCreateAbortController() {
  return new AbortController();
}

async function defaultWaitForAttemptTimeout({ milliseconds, signal }) {
  await new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );
  });
}
