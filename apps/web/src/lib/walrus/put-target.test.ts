import { describe, expect, it, vi } from "vitest";

import type { PreprocessedPhoto } from "../image/preprocess";
import { putTargetBlobToWalrus, type WalrusPutError } from "./put-target";

const PUBLISHER = "https://publisher.example.com";
const AGGREGATOR = "https://aggregator.example.com";

type FetchInit = RequestInit | undefined;

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

  return { calls, fetchFn };
}

function blob() {
  return new Blob([new Uint8Array(16)], { type: "image/jpeg" });
}

function photo(override: Partial<PreprocessedPhoto> = {}): PreprocessedPhoto {
  const b = override.blob ?? blob();
  return {
    blob: b,
    contentType: "image/jpeg",
    height: override.height ?? 768,
    previewUrl: override.previewUrl ?? "blob:preview",
    sha256: override.sha256 ?? "a".repeat(64),
    width: override.width ?? 1024,
  };
}

function baseDeps(fetchFn: typeof fetch) {
  return {
    env: {
      NEXT_PUBLIC_WALRUS_AGGREGATOR: AGGREGATOR,
      NEXT_PUBLIC_WALRUS_PUBLISHER: PUBLISHER,
    },
    fetchFn,
    sleep: vi.fn(async (_ms: number) => {}),
  };
}

describe("putTargetBlobToWalrus", () => {
  it("PUTs the target blob with epochs=50", async () => {
    const { calls, fetchFn } = queuedFetch([
      {
        kind: "ok",
        body: {
          newlyCreated: {
            blobObject: { blobId: "target-blob" },
          },
        },
      },
    ]);

    const body = blob();
    const result = await putTargetBlobToWalrus(
      photo({ blob: body }),
      baseDeps(fetchFn as typeof fetch),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${PUBLISHER}/v1/blobs?epochs=50`);
    expect(calls[0]?.url).not.toContain("epochs=100");
    expect(result.blobId).toBe("target-blob");
    expect(result.aggregatorUrl).toBe(`${AGGREGATOR}/v1/blobs/target-blob`);
  });

  it("throws config_missing when the publisher URL is absent", async () => {
    const { fetchFn } = queuedFetch([]);

    await expect(
      putTargetBlobToWalrus(photo(), {
        env: {
          NEXT_PUBLIC_WALRUS_AGGREGATOR: AGGREGATOR,
          NEXT_PUBLIC_WALRUS_PUBLISHER: "",
        },
        fetchFn: fetchFn as typeof fetch,
        sleep: vi.fn(async (_ms: number) => {}),
      }),
    ).rejects.toMatchObject({
      kind: "config_missing" satisfies WalrusPutError["kind"],
    });
  });
});
