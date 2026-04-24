"use client";

import type { PreprocessedPhoto } from "../image/preprocess";

import type { WalrusEnv, WalrusPutDeps, WalrusPutResult } from "./put";
import { WalrusPutError } from "./put";

const TARGET_WALRUS_EPOCHS = 50;
const WALRUS_MAX_ATTEMPTS = 3;
const WALRUS_BASE_BACKOFF_MS = 200;
const WALRUS_REQUEST_TIMEOUT_MS = 30_000;

export type { WalrusEnv, WalrusPutDeps, WalrusPutResult };
export { WalrusPutError };

export async function putTargetBlobToWalrus(
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
          aggregatorUrl: `${endpoints.aggregatorBase}/v1/blobs/${blobId}`,
          blobId,
        };
      }

      lastStatus = response.status;
      lastError = new Error(`Walrus PUT failed with status ${response.status}`);

      if (!isTransientStatus(response.status)) {
        throw new WalrusPutError(
          "final",
          "Could not save the image to Walrus. Please try again.",
          { attempts: attempt, cause: lastError, status: response.status },
        );
      }
    } catch (error) {
      if (error instanceof WalrusPutError) {
        throw error;
      }
      lastError = error;
    }

    if (attempt >= WALRUS_MAX_ATTEMPTS) {
      break;
    }

    deps.onRetry?.({
      attempt,
      error: lastError,
      kind: "transient",
      status: lastStatus,
    });

    await sleep(backoffDelayMs(attempt));
  }

  throw new WalrusPutError(
    "final",
    "Could not save the image to Walrus. Check your connection and try again.",
    {
      attempts: WALRUS_MAX_ATTEMPTS,
      cause: lastError,
      status: lastStatus,
    },
  );
}

function resolveEndpoints(env: WalrusEnv): {
  readonly aggregatorBase: string;
  readonly putUrl: string;
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
    aggregatorBase: aggregator,
    putUrl: `${publisher}/v1/blobs?epochs=${TARGET_WALRUS_EPOCHS}`,
  };
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
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const newlyCreated = record.newlyCreated as
    | { blobObject?: { blobId?: unknown } }
    | undefined;
  if (typeof newlyCreated?.blobObject?.blobId === "string") {
    return newlyCreated.blobObject.blobId;
  }

  const alreadyCertified = record.alreadyCertified as
    | { blobId?: unknown }
    | undefined;
  if (typeof alreadyCertified?.blobId === "string") {
    return alreadyCertified.blobId;
  }

  return null;
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  body: Blob,
  requestTimeoutMs: number,
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), requestTimeoutMs);

  try {
    return await fetchFn(url, {
      body,
      method: "PUT",
      signal: abortController.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isTransientStatus(status: number): boolean {
  return status >= 500;
}

function backoffDelayMs(attempt: number): number {
  return WALRUS_BASE_BACKOFF_MS * 2 ** (attempt - 1);
}

function trimTrailingSlashes(value: string | undefined): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.replace(/\/+$/, "");
}

function resolveDefaultFetch(): typeof fetch | null {
  return typeof fetch === "function" ? fetch : null;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
