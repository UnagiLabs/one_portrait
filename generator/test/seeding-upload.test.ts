import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import {
  createSeedingWalrusUploadClient,
  preprocessSeedingImage,
  validateUniqueSeedingBlobIds,
} from "../src";

describe("preprocessSeedingImage", () => {
  it("returns normalized bytes plus preprocessing metadata and log values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "one-portrait-seeding-upload-"));
    const filePath = join(dir, "portrait.jpeg");
    const sourceBytes = await createImage("jpeg");

    try {
      await writeFile(filePath, sourceBytes);

      const result = await preprocessSeedingImage({
        imageKey: "portrait.jpeg",
        filePath,
      });

      expect(result.bytes).toBeInstanceOf(Uint8Array);
      expect(result.contentType).toBe("image/png");
      expect(result.metadata).toEqual({
        sourceByteSize: sourceBytes.byteLength,
        outputByteSize: result.metadata.outputByteSize,
        originalWidth: 2,
        originalHeight: 1,
        originalFormat: "jpeg",
        normalizedWidth: 2,
        normalizedHeight: 1,
        normalizedFormat: "png",
      });
      expect(result.log).toEqual({
        imageKey: "portrait.jpeg",
        filePath,
        sourceByteSize: sourceBytes.byteLength,
        outputByteSize: result.metadata.outputByteSize,
        originalWidth: 2,
        originalHeight: 1,
        originalFormat: "jpeg",
        normalizedWidth: 2,
        normalizedHeight: 1,
        normalizedFormat: "png",
      });

      await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
        format: "png",
        width: 2,
        height: 1,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("createSeedingWalrusUploadClient", () => {
  it("uploads to epochs=5 and returns the aggregator URL for newlyCreated blobs", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            newlyCreated: {
              blobObject: {
                blobId: "seed-blob-1",
              },
            },
          }),
        ),
    );
    const client = createSeedingWalrusUploadClient({
      publisherBaseUrl: "https://publisher.example/",
      aggregatorBaseUrl: "https://aggregator.example/",
      fetchFn,
    });

    await expect(client.putBlob(new Uint8Array([1, 2, 3]))).resolves.toEqual({
      blobId: "seed-blob-1",
      aggregatorUrl: "https://aggregator.example/v1/blobs/seed-blob-1",
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://publisher.example/v1/blobs?epochs=5",
      expect.objectContaining({
        method: "PUT",
        headers: {
          "content-type": "image/png",
        },
      }),
    );
  });

  it("returns the aggregator URL for alreadyCertified blobs", async () => {
    const client = createSeedingWalrusUploadClient({
      publisherBaseUrl: "https://publisher.example",
      aggregatorBaseUrl: "https://aggregator.example",
      fetchFn: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              alreadyCertified: {
                blobId: "seed-blob-2",
              },
            }),
          ),
      ),
    });

    await expect(client.putBlob(new Uint8Array([1, 2, 3]))).resolves.toEqual({
      blobId: "seed-blob-2",
      aggregatorUrl: "https://aggregator.example/v1/blobs/seed-blob-2",
    });
  });
});

describe("validateUniqueSeedingBlobIds", () => {
  it("rejects repeated blobIds across candidate rows", () => {
    expect(() =>
      validateUniqueSeedingBlobIds([
        {
          imageKey: "a.png",
          blobId: "blob-1",
        },
        {
          imageKey: "b.png",
          blobId: "blob-1",
        },
      ]),
    ).toThrow(/duplicate blobId/i);
  });

  it("accepts unique blobIds", () => {
    expect(
      validateUniqueSeedingBlobIds([
        {
          imageKey: "a.png",
          blobId: "blob-1",
        },
        {
          imageKey: "b.png",
          blobId: "blob-2",
        },
      ]),
    ).toEqual([
      {
        imageKey: "a.png",
        blobId: "blob-1",
      },
      {
        imageKey: "b.png",
        blobId: "blob-2",
      },
    ]);
  });
});

async function createImage(
  format: "jpeg" | "png" | "webp",
): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width: 2,
      height: 1,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .rotate()
    [format]({ quality: 90 })
    .toBuffer();

  return new Uint8Array(buffer);
}
