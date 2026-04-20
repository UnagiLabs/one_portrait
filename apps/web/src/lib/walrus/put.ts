"use client";

/**
 * Thin client for uploading a preprocessed photo to a Walrus Publisher.
 *
 * Spec (see `docs/tech.md` §5.3 / §6 / §10):
 * - ブラウザから Walrus Publisher へ直接 `PUT /v1/blobs?epochs=5` で送る。
 * - 一時的な失敗（ネットワーク / 5xx）は指数バックオフで合計 3 回まで再試行。
 * - 最終的な失敗は UI が再試行ボタンを出せるよう分類済みのエラーで投げる。
 * - 成功時は `blob_id` と Aggregator 参照 URL を返す。
 *
 * `fetch` と `setTimeout` は DI で差し替え可能にしている。テストは実時計や実
 * ネットワークに依存せず、リトライ回数・URL 組み立て・エラー分類だけを検証
 * する。
 */

export const WALRUS_EPOCHS = 5;
export const WALRUS_MAX_ATTEMPTS = 3;
/** Base delay for exponential backoff. Kept small – retries are cheap. */
export const WALRUS_BASE_BACKOFF_MS = 200;

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
};

export type WalrusPutResult = {
  readonly blobId: string;
  readonly aggregatorUrl: string;
};

/**
 * Upload a blob to the configured Walrus Publisher and return the resulting
 * `blobId` + an Aggregator URL usable for immediate preview.
 */
export async function putBlobToWalrus(
  body: Blob,
  deps: WalrusPutDeps,
): Promise<WalrusPutResult> {
  const endpoints = resolveEndpoints(deps.env);

  const fetchFn = deps.fetchFn ?? resolveDefaultFetch();
  if (!fetchFn) {
    throw new WalrusPutError(
      "config_missing",
      "このブラウザでは Walrus へのアップロードがサポートされていません。",
    );
  }

  const sleep = deps.sleep ?? defaultSleep;

  let lastError: unknown = null;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= WALRUS_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchFn(endpoints.putUrl, {
        method: "PUT",
        body,
      });

      if (response.ok) {
        const blobId = await extractBlobId(response);
        return {
          blobId,
          aggregatorUrl: buildAggregatorUrl(endpoints.aggregatorBase, blobId),
        };
      }

      lastStatus = response.status;
      lastError = new Error(`Walrus PUT failed with status ${response.status}`);

      // 4xx は再試行しても結果が変わらない。即 final で抜ける。
      if (!isTransientStatus(response.status)) {
        throw new WalrusPutError(
          "final",
          "Walrus への写真の保存に失敗しました。もう一度お試しください。",
          { attempts: attempt, status: response.status, cause: lastError },
        );
      }
    } catch (error) {
      // 既に final 分類を付けて投げた場合はそのまま上げる。
      if (error instanceof WalrusPutError) {
        throw error;
      }
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
    "Walrus への写真の保存に失敗しました。通信状況を確認してから、再試行ボタンでもう一度お試しください。",
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
      "Walrus のエンドポイントが設定されていません。NEXT_PUBLIC_WALRUS_PUBLISHER / NEXT_PUBLIC_WALRUS_AGGREGATOR を確認してください。",
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
      "Walrus からの応答を解釈できませんでした。",
      { cause: error },
    );
  }

  const blobId = readBlobId(payload);
  if (!blobId) {
    throw new WalrusPutError(
      "final",
      "Walrus から blob_id を取得できませんでした。",
      { cause: payload },
    );
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
  // 408 Request Timeout と 429 Too Many Requests は一時障害として扱う。
  if (status === 408 || status === 429) {
    return true;
  }
  return status >= 500 && status <= 599;
}

function backoffDelayMs(attempt: number): number {
  // attempt = 1 → base * 2^0, attempt = 2 → base * 2^1, ...
  // 指数的に増える。ハッカソンスコープなので jitter は省略する。
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
