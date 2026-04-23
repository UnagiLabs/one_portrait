const GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS = 1000;
const GENERATOR_STACK_HEALTH_TIMEOUT_MS = 30000;

export {
  GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS,
  GENERATOR_STACK_HEALTH_TIMEOUT_MS,
};

export async function waitForGeneratorStackHealth({
  label,
  url,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  now = defaultNow,
  logger = console,
  retryIntervalMs = GENERATOR_STACK_HEALTH_RETRY_INTERVAL_MS,
  timeoutMs = GENERATOR_STACK_HEALTH_TIMEOUT_MS,
} = {}) {
  if (!label) {
    throw new Error("label is required");
  }

  if (!url) {
    throw new Error("url is required");
  }

  const deadline = now() + timeoutMs;

  while (true) {
    if (await isHealthReady(fetchImpl, url)) {
      const marker = `[generator-stack][health][${label}][ready]`;
      logger?.info?.(marker);

      return {
        ok: true,
        exitCode: 0,
        marker,
      };
    }

    if (now() >= deadline) {
      const marker = `[generator-stack][health][${label}][timeout]`;
      logger?.error?.(marker);

      return {
        ok: false,
        exitCode: 1,
        marker,
      };
    }

    await sleep(retryIntervalMs);
  }
}

async function isHealthReady(fetchImpl, url) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
    });

    return response?.status === 200;
  } catch {
    return false;
  }
}

async function defaultSleep(milliseconds) {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function defaultNow() {
  return Date.now();
}
