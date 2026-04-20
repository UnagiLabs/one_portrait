// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { ImagePreprocessError, preprocessPhoto } from "./preprocess";

const TEN_MB = 10 * 1024 * 1024;

/**
 * Create a fake {@link File} of an exact byte length without allocating real
 * image bytes. The preprocessing pipeline never inspects these bytes because
 * we inject the `createImageBitmap` dependency in tests.
 */
function fakeFile(options: {
  readonly size: number;
  readonly type?: string;
  readonly name?: string;
}): File {
  const bytes = new Uint8Array(options.size);
  return new File([bytes], options.name ?? "photo.jpg", {
    type: options.type ?? "image/jpeg",
  });
}

type FakeBitmap = {
  readonly width: number;
  readonly height: number;
  close: () => void;
};

function fakeBitmap(width: number, height: number): FakeBitmap {
  return {
    width,
    height,
    close: vi.fn(),
  };
}

type DrawCall = {
  readonly bitmap: unknown;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
};

function buildDeps(options?: {
  readonly bitmap?: FakeBitmap;
  readonly encoded?: Blob;
  readonly digest?: ArrayBuffer;
  readonly previewUrl?: string;
}) {
  const drawCalls: DrawCall[] = [];
  const convertOptions: { type: string; quality: number }[] = [];
  const bitmap = options?.bitmap ?? fakeBitmap(2000, 1000);
  const encoded =
    options?.encoded ?? new Blob([new Uint8Array(64)], { type: "image/jpeg" });
  const digestBuffer = options?.digest ?? new ArrayBuffer(32);
  const previewUrl = options?.previewUrl ?? "blob:preview";

  const createImageBitmap = vi.fn(async (_input: Blob) => bitmap);
  const createCanvas = vi.fn((width: number, height: number) => ({
    width,
    height,
    getContext: (_type: "2d") => ({
      drawImage: (
        b: unknown,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
      ) => {
        drawCalls.push({ bitmap: b, dx, dy, dw, dh });
      },
    }),
    convertToBlob: async ({
      type,
      quality,
    }: {
      readonly type: string;
      readonly quality: number;
    }) => {
      convertOptions.push({ type, quality });
      return encoded;
    },
  }));
  const digest = vi.fn(
    async (_algorithm: "SHA-256", _data: ArrayBuffer) => digestBuffer,
  );
  const createObjectURL = vi.fn((_blob: Blob) => previewUrl);

  return {
    deps: {
      createImageBitmap,
      createCanvas,
      digest,
      createObjectURL,
    },
    drawCalls,
    convertOptions,
    createImageBitmap,
    createCanvas,
    digest,
    createObjectURL,
  };
}

describe("preprocessPhoto", () => {
  it("rejects files larger than 10MB before decoding", async () => {
    const { deps, createImageBitmap } = buildDeps();
    const file = fakeFile({ size: TEN_MB + 1 });

    await expect(preprocessPhoto(file, deps)).rejects.toBeInstanceOf(
      ImagePreprocessError,
    );
    await expect(preprocessPhoto(file, deps)).rejects.toMatchObject({
      code: "file_too_large",
    });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("accepts files exactly at the 10MB limit", async () => {
    const { deps } = buildDeps();
    const file = fakeFile({ size: TEN_MB });

    await expect(preprocessPhoto(file, deps)).resolves.toMatchObject({
      contentType: "image/jpeg",
    });
  });

  it("resizes the long edge down to 1024px while preserving aspect ratio", async () => {
    const { deps, createCanvas, drawCalls } = buildDeps({
      bitmap: fakeBitmap(2048, 1024),
    });
    const file = fakeFile({ size: 1024 });

    const result = await preprocessPhoto(file, deps);

    expect(createCanvas).toHaveBeenCalledWith(1024, 512);
    expect(drawCalls).toHaveLength(1);
    expect(drawCalls[0]).toMatchObject({
      dx: 0,
      dy: 0,
      dw: 1024,
      dh: 512,
    });
    expect(result.width).toBe(1024);
    expect(result.height).toBe(512);
  });

  it("does not upscale when both edges are within 1024px", async () => {
    const { deps, createCanvas } = buildDeps({
      bitmap: fakeBitmap(800, 600),
    });
    const file = fakeFile({ size: 1024 });

    const result = await preprocessPhoto(file, deps);

    expect(createCanvas).toHaveBeenCalledWith(800, 600);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("re-encodes to JPEG at quality 0.85 (EXIF is dropped by the re-encode)", async () => {
    const reencoded = new Blob([new Uint8Array(128)], { type: "image/jpeg" });
    const { deps, convertOptions } = buildDeps({
      bitmap: fakeBitmap(1000, 500),
      encoded: reencoded,
    });
    // The input file stands in for a photo that may carry EXIF metadata.
    // After preprocessing, the output must be the re-encoded blob, not the
    // original file – the re-encode path is what strips EXIF.
    const file = fakeFile({ size: 4096, type: "image/jpeg" });

    const result = await preprocessPhoto(file, deps);

    expect(convertOptions).toEqual([{ type: "image/jpeg", quality: 0.85 }]);
    expect(result.contentType).toBe("image/jpeg");
    expect(result.blob).toBe(reencoded);
    expect(result.blob).not.toBe(file);
  });

  it("computes SHA-256 of the re-encoded blob via the injected digest", async () => {
    const digestBytes = new Uint8Array(32);
    for (let index = 0; index < digestBytes.length; index += 1) {
      digestBytes[index] = index;
    }
    const { deps, digest } = buildDeps({
      digest: digestBytes.buffer,
    });
    const file = fakeFile({ size: 1024 });

    const result = await preprocessPhoto(file, deps);

    expect(digest).toHaveBeenCalledTimes(1);
    expect(digest.mock.calls[0]?.[0]).toBe("SHA-256");
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sha256).toBe(
      "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    );
  });

  it("returns a preview URL produced from the re-encoded blob", async () => {
    const { deps, createObjectURL } = buildDeps({
      previewUrl: "blob:fake-preview",
    });
    const file = fakeFile({ size: 1024 });

    const result = await preprocessPhoto(file, deps);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(result.previewUrl).toBe("blob:fake-preview");
  });

  it("wraps decode failures into a UI-friendly ImagePreprocessError", async () => {
    const { deps, createImageBitmap } = buildDeps();
    createImageBitmap.mockRejectedValueOnce(new Error("bad image"));
    const file = fakeFile({ size: 1024 });

    try {
      await preprocessPhoto(file, deps);
      expect.unreachable("preprocessPhoto should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ImagePreprocessError);
      const e = error as ImagePreprocessError;
      expect(e.code).toBe("decode_failed");
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it("surfaces a UI-friendly message on the file_too_large error", async () => {
    const { deps } = buildDeps();
    const file = fakeFile({ size: TEN_MB + 1 });

    try {
      await preprocessPhoto(file, deps);
      expect.unreachable("preprocessPhoto should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ImagePreprocessError);
      const e = error as ImagePreprocessError;
      expect(e.code).toBe("file_too_large");
      expect(e.message).toContain("10MB");
    }
  });
});
