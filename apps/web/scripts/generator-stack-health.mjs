const GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS = 1000;
const GENERATOR_STACK_HEALTH_TIMEOUT_MS = 30000;

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

async function isHealthReady(fetchImpl, url, signal) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      signal,
    });

    return response?.status === 200;
  } catch {
    return false;
  }
}

async function raceHealthAttempt({
  abortController,
  fetchImpl,
  url,
  waitForAttemptTimeout,
  waitMs,
}) {
  const timeoutResult = await Promise.race([
    isHealthReady(fetchImpl, url, abortController.signal),
    waitForAttemptTimeout({
      milliseconds: waitMs,
      signal: abortController.signal,
    }).then(() => "timeout"),
  ]);

  abortController.abort();

  return timeoutResult === true ? "ready" : "retry";
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
