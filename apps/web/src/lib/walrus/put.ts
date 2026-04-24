"use client";

import type { PreprocessedPhoto } from "../image/preprocess";

/**
 * Thin client for uploading a preprocessed photo to a Walrus Publisher.
 *
 * Spec (see `docs/tech.md` §5.3 / §6 / §10):
 * - Send `PUT /v1/blobs?epochs=5` directly from the browser to Walrus Publisher.
 * - Retry temporary failures (network / 5xx / timeout) up to 3 total attempts
 *   with exponential backoff.
 * - Throw classified errors for final failures so the UI can show retry.
 * - Return `blob_id` and an Aggregator reference URL on success.
 *
 * Input is restricted to {@link PreprocessedPhoto}, so only Blobs that passed
 * 10MB validation, 1024px long-edge resizing, JPEG re-encoding, and EXIF
 * stripping can be PUT. The type boundary prevents raw originals from being
 * uploaded to Walrus.
 *
 * `fetch` and `setTimeout` are injectable, so tests can verify retry counts,
 * URL construction, and error classification without real clocks or network.
 */

const WALRUS_EPOCHS = 5;
const WALRUS_MAX_ATTEMPTS = 3;
/** Base delay for exponential backoff. Kept small – retries are cheap. */
const WALRUS_BASE_BACKOFF_MS = 200;
/** Per-attempt request timeout. 30s covers mobile uploads; beyond that we
 * abort and classify as transient so the retry loop / final error kicks in. */
const WALRUS_REQUEST_TIMEOUT_MS = 30_000;

export type WalrusPutErrorKind = "transient" | "final" | "config_missing";

export class WalrusPutError extends Error {
  readonly kind: WalrusPutErrorKind;
  readonly attempts: number;
  readonly status: number | null;

  constructor(
    kind: WalrusPutErrorKind,
    message: string,
    options: {
      readonly attempts?: number;
      readonly status?: number | null;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = "WalrusPutError";
    this.kind = kind;
    this.attempts = options.attempts ?? 0;
    this.status = options.status ?? null;
  }
}

export type WalrusEnv = {
  readonly NEXT_PUBLIC_WALRUS_PUBLISHER: string | undefined;
  readonly NEXT_PUBLIC_WALRUS_AGGREGATOR: string | undefined;
};

export type WalrusPutRetryInfo = {
  readonly kind: "transient";
  readonly attempt: number;
  readonly status: number | null;
  readonly error: unknown;
};

export type WalrusPutDeps = {
  readonly fetchFn?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly env: WalrusEnv;
  readonly onRetry?: (info: WalrusPutRetryInfo) => void;
  /** Per-attempt timeout in ms. Defaults to {@link WALRUS_REQUEST_TIMEOUT_MS}. */
  readonly requestTimeoutMs?: number;
};

export type WalrusPutResult = {
  readonly blobId: string;
  readonly aggregatorUrl: string;
};

/**
 * Upload a preprocessed photo to the configured Walrus Publisher and return
 * the resulting `blobId` + an Aggregator URL usable for immediate preview.
 *
 * Accepting {@link PreprocessedPhoto} (not a raw `Blob`) enforces at the type
 * level that 10MB validation, 1024px downscaling, JPEG re-encoding, and EXIF
 * stripping have all been performed. Raw originals cannot accidentally be
 * uploaded to Walrus — which would violate `docs/tech.md` §5.3 / §11.
 */
export async function putBlobToWalrus(
  photo: PreprocessedPhoto,
  deps: WalrusPutDeps,
): Promise<WalrusPutResult> {
  const endpoints = resolveEndpoints(deps.env);

  const fetchFn = deps.fetchFn ?? resolveDefaultFetch();
  if (!fetchFn) {
    throw new WalrusPutError(
      "config_missing",
      "This browser does not support uploads to Walrus.",
    );
  }

  const sleep = deps.sleep ?? defaultSleep;
  const requestTimeoutMs = deps.requestTimeoutMs ?? WALRUS_REQUEST_TIMEOUT_MS;

  let lastError: unknown = null;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= WALRUS_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        fetchFn,
        endpoints.putUrl,
        photo.blob,
        requestTimeoutMs,
      );

      if (response.ok) {
        const blobId = await extractBlobId(response);
        return {
          blobId,
          aggregatorUrl: buildAggregatorUrl(endpoints.aggregatorBase, blobId),
        };
      }

      lastStatus = response.status;
      lastError = new Error(`Walrus PUT failed with status ${response.status}`);

      // 4xx responses will not change with retries, so fail as final.
      if (!isTransientStatus(response.status)) {
        throw new WalrusPutError(
          "final",
          "Could not save the photo to Walrus. Please try again.",
          { attempts: attempt, status: response.status, cause: lastError },
        );
      }
    } catch (error) {
      // Preserve already-classified final errors.
      if (error instanceof WalrusPutError) {
        throw error;
      }
      // Treat AbortError from our timeout as temporary so fetch cannot hang
      // forever.
      lastError = error;
    }

    const isLastAttempt = attempt >= WALRUS_MAX_ATTEMPTS;
    if (isLastAttempt) {
      break;
    }

    deps.onRetry?.({
      kind: "transient",
      attempt,
      status: lastStatus,
      error: lastError,
    });

    await sleep(backoffDelayMs(attempt));
  }

  throw new WalrusPutError(
    "final",
    "Could not save the photo to Walrus. Check your connection, then use the retry button to try again.",
    {
      attempts: WALRUS_MAX_ATTEMPTS,
      status: lastStatus,
      cause: lastError,
    },
  );
}

function resolveEndpoints(env: WalrusEnv): {
  readonly putUrl: string;
  readonly aggregatorBase: string;
} {
  const publisher = trimTrailingSlashes(env.NEXT_PUBLIC_WALRUS_PUBLISHER);
  const aggregator = trimTrailingSlashes(env.NEXT_PUBLIC_WALRUS_AGGREGATOR);

  if (!publisher || !aggregator) {
    throw new WalrusPutError(
      "config_missing",
      "Walrus endpoints are not configured. Check NEXT_PUBLIC_WALRUS_PUBLISHER / NEXT_PUBLIC_WALRUS_AGGREGATOR.",
    );
  }

  return {
    putUrl: `${publisher}/v1/blobs?epochs=${WALRUS_EPOCHS}`,
    aggregatorBase: aggregator,
  };
}

function buildAggregatorUrl(aggregatorBase: string, blobId: string): string {
  return `${aggregatorBase}/v1/blobs/${blobId}`;
}

async function extractBlobId(response: Response): Promise<string> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch (error) {
    throw new WalrusPutError(
      "final",
      "Could not parse the response from Walrus.",
      { cause: error },
    );
  }

  const blobId = readBlobId(payload);
  if (!blobId) {
    throw new WalrusPutError("final", "Could not get blob_id from Walrus.", {
      cause: payload,
    });
  }
  return blobId;
}

function readBlobId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;

  // Shape 1: `{ newlyCreated: { blobObject: { blobId } } }`
  const newly = record.newlyCreated;
  if (newly && typeof newly === "object") {
    const blobObject = (newly as Record<string, unknown>).blobObject;
    if (blobObject && typeof blobObject === "object") {
      const id = (blobObject as Record<string, unknown>).blobId;
      if (typeof id === "string" && id.length > 0) {
        return id;
      }
    }
  }

  // Shape 2: `{ alreadyCertified: { blobId } }`
  const already = record.alreadyCertified;
  if (already && typeof already === "object") {
    const id = (already as Record<string, unknown>).blobId;
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }

  return null;
}

function isTransientStatus(status: number): boolean {
  // Treat 408 Request Timeout and 429 Too Many Requests as temporary failures.
  if (status === 408 || status === 429) {
    return true;
  }
  return status >= 500 && status <= 599;
}

function backoffDelayMs(attempt: number): number {
  // attempt = 1 → base * 2^0, attempt = 2 → base * 2^1, ...
  // Exponential backoff. Jitter is omitted for this hackathon scope.
  return WALRUS_BASE_BACKOFF_MS * 2 ** (attempt - 1);
}

function trimTrailingSlashes(value: string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\/+$/, "");
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveDefaultFetch(): typeof fetch | undefined {
  const value = (globalThis as Record<string, unknown>).fetch;
  return typeof value === "function" ? (value as typeof fetch) : undefined;
}

/**
 * Wrap a single fetch attempt with an AbortController so that a hung request
 * cannot stall the retry loop indefinitely. The signal is aborted after
 * `timeoutMs` elapses; the aborted fetch rejects and is treated as transient.
 */
async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  body: Blob,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetchFn(url, {
      method: "PUT",
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
