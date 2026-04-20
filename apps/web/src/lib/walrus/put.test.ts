import { describe, expect, it, vi } from "vitest";

import { putBlobToWalrus, WalrusPutError } from "./put";

const PUBLISHER = "https://publisher.example.com";
const AGGREGATOR = "https://aggregator.example.com";

type FetchInit = RequestInit | undefined;

/**
 * Build a mock `fetch` whose queued responses are consumed in order. If the
 * queue is exhausted we throw – tests should assert exact call counts.
 */
function queuedFetch(
  responses: ReadonlyArray<
    | { readonly kind: "ok"; readonly body: unknown }
    | {
        readonly kind: "status";
        readonly status: number;
        readonly body?: unknown;
      }
    | { readonly kind: "throw"; readonly error: Error }
  >,
) {
  const calls: { readonly url: string; readonly init: FetchInit }[] = [];
  let index = 0;

  const fetchFn = vi.fn(async (url: string, init?: FetchInit) => {
    calls.push({ url, init });
    const spec = responses[index];
    index += 1;
    if (!spec) {
      throw new Error(`fetch called more than ${responses.length} times`);
    }
    if (spec.kind === "throw") {
      throw spec.error;
    }
    if (spec.kind === "status") {
      return new Response(
        spec.body === undefined ? null : JSON.stringify(spec.body),
        {
          status: spec.status,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify(spec.body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  return { fetchFn, calls };
}

function blob() {
  return new Blob([new Uint8Array(16)], { type: "image/jpeg" });
}

function baseDeps(fetchFn: typeof fetch) {
  return {
    fetchFn,
    // 0 delay keeps the backoff instantaneous in tests; logic still goes
    // through the same schedule helper.
    sleep: vi.fn(async (_ms: number) => {}),
    env: {
      NEXT_PUBLIC_WALRUS_PUBLISHER: PUBLISHER,
      NEXT_PUBLIC_WALRUS_AGGREGATOR: AGGREGATOR,
    },
  };
}

describe("putBlobToWalrus", () => {
  it("PUTs the blob to <publisher>/v1/blobs?epochs=5 with the raw body", async () => {
    const { fetchFn, calls } = queuedFetch([
      {
        kind: "ok",
        body: {
          newlyCreated: {
            blobObject: { blobId: "blob-xyz" },
          },
        },
      },
    ]);

    const body = blob();
    const result = await putBlobToWalrus(
      body,
      baseDeps(fetchFn as typeof fetch),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${PUBLISHER}/v1/blobs?epochs=5`);
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(calls[0]?.init?.body).toBe(body);
    expect(result.blobId).toBe("blob-xyz");
    expect(result.aggregatorUrl).toBe(`${AGGREGATOR}/v1/blobs/blob-xyz`);
  });

  it("extracts the blob id from an `alreadyCertified` response", async () => {
    const { fetchFn } = queuedFetch([
      {
        kind: "ok",
        body: {
          alreadyCertified: { blobId: "already-abc" },
        },
      },
    ]);

    const result = await putBlobToWalrus(
      blob(),
      baseDeps(fetchFn as typeof fetch),
    );

    expect(result.blobId).toBe("already-abc");
    expect(result.aggregatorUrl).toBe(`${AGGREGATOR}/v1/blobs/already-abc`);
  });

  it("retries a 5xx transient failure and succeeds on the third attempt", async () => {
    const { fetchFn, calls } = queuedFetch([
      { kind: "status", status: 502 },
      { kind: "status", status: 503 },
      {
        kind: "ok",
        body: {
          newlyCreated: { blobObject: { blobId: "blob-final" } },
        },
      },
    ]);

    const deps = baseDeps(fetchFn as typeof fetch);
    const result = await putBlobToWalrus(blob(), deps);

    expect(calls).toHaveLength(3);
    expect(result.blobId).toBe("blob-final");
    // Sleeps happen *between* attempts: after attempt 1 and after attempt 2.
    expect(deps.sleep).toHaveBeenCalledTimes(2);
  });

  it("retries network errors (TypeError) up to three attempts", async () => {
    const { fetchFn, calls } = queuedFetch([
      { kind: "throw", error: new TypeError("Failed to fetch") },
      { kind: "throw", error: new TypeError("Failed to fetch") },
      {
        kind: "ok",
        body: {
          newlyCreated: { blobObject: { blobId: "net-ok" } },
        },
      },
    ]);

    const result = await putBlobToWalrus(
      blob(),
      baseDeps(fetchFn as typeof fetch),
    );

    expect(calls).toHaveLength(3);
    expect(result.blobId).toBe("net-ok");
  });

  it("throws a `final` error after three failed attempts", async () => {
    const { fetchFn, calls } = queuedFetch([
      { kind: "status", status: 502 },
      { kind: "status", status: 502 },
      { kind: "status", status: 502 },
    ]);

    try {
      await putBlobToWalrus(blob(), baseDeps(fetchFn as typeof fetch));
      expect.unreachable("putBlobToWalrus should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(WalrusPutError);
      const e = error as WalrusPutError;
      expect(e.kind).toBe("final");
      expect(e.attempts).toBe(3);
    }

    expect(calls).toHaveLength(3);
  });

  it("does not retry on a 4xx client error and returns a `final` error immediately", async () => {
    const { fetchFn, calls } = queuedFetch([
      { kind: "status", status: 400, body: { error: "bad request" } },
    ]);

    try {
      await putBlobToWalrus(blob(), baseDeps(fetchFn as typeof fetch));
      expect.unreachable("putBlobToWalrus should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(WalrusPutError);
      const e = error as WalrusPutError;
      expect(e.kind).toBe("final");
    }

    expect(calls).toHaveLength(1);
  });

  it("returns `config_missing` immediately when the publisher URL is absent", async () => {
    const { fetchFn, calls } = queuedFetch([]);
    const deps = {
      fetchFn: fetchFn as typeof fetch,
      sleep: vi.fn(async (_ms: number) => {}),
      env: {
        NEXT_PUBLIC_WALRUS_PUBLISHER: "",
        NEXT_PUBLIC_WALRUS_AGGREGATOR: AGGREGATOR,
      },
    };

    try {
      await putBlobToWalrus(blob(), deps);
      expect.unreachable("putBlobToWalrus should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(WalrusPutError);
      const e = error as WalrusPutError;
      expect(e.kind).toBe("config_missing");
    }

    expect(calls).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns `config_missing` when the aggregator URL is absent", async () => {
    const { fetchFn } = queuedFetch([]);
    const deps = {
      fetchFn: fetchFn as typeof fetch,
      sleep: vi.fn(async (_ms: number) => {}),
      env: {
        NEXT_PUBLIC_WALRUS_PUBLISHER: PUBLISHER,
        NEXT_PUBLIC_WALRUS_AGGREGATOR: "   ",
      },
    };

    await expect(putBlobToWalrus(blob(), deps)).rejects.toMatchObject({
      kind: "config_missing",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("uses exponential backoff between attempts", async () => {
    const { fetchFn } = queuedFetch([
      { kind: "status", status: 502 },
      { kind: "status", status: 502 },
      {
        kind: "ok",
        body: {
          newlyCreated: { blobObject: { blobId: "later" } },
        },
      },
    ]);

    const deps = baseDeps(fetchFn as typeof fetch);
    await putBlobToWalrus(blob(), deps);

    // Exponential backoff: the second delay should be strictly larger than
    // the first. We don't pin exact numbers so we don't fight the clock.
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    const firstDelay = deps.sleep.mock.calls[0]?.[0] as number;
    const secondDelay = deps.sleep.mock.calls[1]?.[0] as number;
    expect(typeof firstDelay).toBe("number");
    expect(typeof secondDelay).toBe("number");
    expect(secondDelay).toBeGreaterThan(firstDelay);
  });

  it("trims trailing slashes in the publisher and aggregator URLs", async () => {
    const { fetchFn, calls } = queuedFetch([
      {
        kind: "ok",
        body: {
          newlyCreated: { blobObject: { blobId: "blob-trim" } },
        },
      },
    ]);

    const deps = {
      fetchFn: fetchFn as typeof fetch,
      sleep: vi.fn(async (_ms: number) => {}),
      env: {
        NEXT_PUBLIC_WALRUS_PUBLISHER: `${PUBLISHER}/`,
        NEXT_PUBLIC_WALRUS_AGGREGATOR: `${AGGREGATOR}/`,
      },
    };

    const result = await putBlobToWalrus(blob(), deps);

    expect(calls[0]?.url).toBe(`${PUBLISHER}/v1/blobs?epochs=5`);
    expect(result.aggregatorUrl).toBe(`${AGGREGATOR}/v1/blobs/blob-trim`);
  });

  it("surfaces the `transient` classification through the onRetry hook", async () => {
    const { fetchFn } = queuedFetch([
      { kind: "status", status: 500 },
      {
        kind: "ok",
        body: {
          newlyCreated: { blobObject: { blobId: "blob-recovered" } },
        },
      },
    ]);

    const deps = baseDeps(fetchFn as typeof fetch);
    const onRetry = vi.fn();

    const result = await putBlobToWalrus(blob(), {
      ...deps,
      onRetry,
    });

    expect(result.blobId).toBe("blob-recovered");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({
      kind: "transient",
      attempt: 1,
    });
  });
});
