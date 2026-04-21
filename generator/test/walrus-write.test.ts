import { describe, expect, it, vi } from "vitest";

import { createWalrusWriteClient, WalrusWriteError } from "../src";

describe("createWalrusWriteClient", () => {
  it("uploads PNG bytes to the publisher and returns the aggregator URL", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          newlyCreated: {
            blobObject: {
              blobId: "mosaic-blob-1",
            },
          },
        }),
      ),
    );
    const client = createWalrusWriteClient({
      publisherBaseUrl: "https://publisher.example/",
      aggregatorBaseUrl: "https://aggregator.example/",
      fetchFn,
    });

    await expect(client.putBlob(new Uint8Array([1, 2, 3]))).resolves.toEqual({
      blobId: "mosaic-blob-1",
      aggregatorUrl: "https://aggregator.example/v1/blobs/mosaic-blob-1",
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://publisher.example/v1/blobs?epochs=100",
      expect.objectContaining({
        method: "PUT",
      }),
    );
  });

  it("throws a typed error when the publisher rejects the upload", async () => {
    const client = createWalrusWriteClient({
      publisherBaseUrl: "https://publisher.example",
      aggregatorBaseUrl: "https://aggregator.example",
      fetchFn: vi.fn(async () => new Response("boom", { status: 500 })),
    });

    await expect(client.putBlob(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      WalrusWriteError,
    );
  });
});
