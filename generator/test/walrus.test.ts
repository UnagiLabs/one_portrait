import { describe, expect, it, vi } from "vitest";

import { createWalrusReadClient, WalrusReadError } from "../src";

describe("createWalrusReadClient", () => {
  it("loads blob bytes from the aggregator", async () => {
    const fetchFn = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const client = createWalrusReadClient({
      aggregatorBaseUrl: "https://aggregator.example/",
      fetchFn,
    });

    await expect(client.getBlob("blob-1")).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "https://aggregator.example/v1/blobs/blob-1",
    );
  });

  it("throws a typed error when the blob is missing", async () => {
    const client = createWalrusReadClient({
      aggregatorBaseUrl: "https://aggregator.example",
      fetchFn: vi.fn(async () => new Response("missing", { status: 404 })),
    });

    await expect(client.getBlob("blob-missing")).rejects.toBeInstanceOf(
      WalrusReadError,
    );
  });
});
