"use client";

/**
 * Client-side photo preprocessing for Walrus uploads.
 *
 * Spec (see `docs/tech.md` §5.3 / §6):
 * - Validate the 10MB input size limit.
 * - Resize the long edge to 1024px, only downscaling.
 * - Re-encode as JPEG quality 0.85, stripping EXIF through re-encoding.
 * - Compute SHA-256 from the re-encoded Blob.
 * - Return a preview URL that the UI can render.
 *
 * Browser APIs (`createImageBitmap` / `OffscreenCanvas` / `crypto.subtle` /
 * `URL.createObjectURL`) are injectable so happy-dom / jsdom tests can verify
 * the logic without real browser implementations.
 */

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_LONG_EDGE_PX = 1024;
const JPEG_QUALITY = 0.85;
const OUTPUT_CONTENT_TYPE = "image/jpeg";

export type ImagePreprocessErrorCode =
  | "file_too_large"
  | "decode_failed"
  | "encode_failed"
  | "canvas_unavailable"
  | "digest_unavailable";

export class ImagePreprocessError extends Error {
  readonly code: ImagePreprocessErrorCode;

  constructor(code: ImagePreprocessErrorCode, message: string) {
    super(message);
    this.name = "ImagePreprocessError";
    this.code = code;
  }
}

export type PreprocessedPhoto = {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly contentType: "image/jpeg";
  readonly sha256: string;
  readonly previewUrl: string;
};

type BitmapLike = {
  readonly width: number;
  readonly height: number;
  close?: () => void;
};

type CanvasContextLike = {
  drawImage: (
    image: BitmapLike,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) => void;
};

type CanvasLike = {
  getContext: (type: "2d") => CanvasContextLike | null;
  convertToBlob: (options: {
    readonly type: string;
    readonly quality: number;
  }) => Promise<Blob>;
};

export type PreprocessDeps = {
  readonly createImageBitmap?: (blob: Blob) => Promise<BitmapLike>;
  readonly createCanvas?: (width: number, height: number) => CanvasLike;
  readonly digest?: (
    algorithm: "SHA-256",
    data: ArrayBuffer,
  ) => Promise<ArrayBuffer>;
  readonly createObjectURL?: (blob: Blob) => string;
};

/**
 * Preprocess an uploaded photo for Walrus ingestion.
 *
 * Throws {@link ImagePreprocessError} with a UI-friendly message when
 * validation / decoding / encoding fails.
 */
export async function preprocessPhoto(
  file: File,
  deps: PreprocessDeps = {},
): Promise<PreprocessedPhoto> {
  if (file.size > MAX_PHOTO_BYTES) {
    throw new ImagePreprocessError(
      "file_too_large",
      "The photo exceeds the 10MB size limit. Please choose another photo.",
    );
  }

  const bitmap = await decode(file, deps);

  try {
    const { width, height } = fitWithinLongEdge(
      bitmap.width,
      bitmap.height,
      MAX_LONG_EDGE_PX,
    );

    const blob = await reencode(bitmap, width, height, deps);
    const sha256 = await sha256Hex(blob, deps);
    const previewUrl = makePreviewUrl(blob, deps);

    return {
      blob,
      width,
      height,
      contentType: OUTPUT_CONTENT_TYPE,
      sha256,
      previewUrl,
    };
  } finally {
    bitmap.close?.();
  }
}

async function decode(file: File, deps: PreprocessDeps): Promise<BitmapLike> {
  const decoder = deps.createImageBitmap ?? resolveDefaultBitmapDecoder();

  if (!decoder) {
    throw new ImagePreprocessError(
      "canvas_unavailable",
      "This browser does not support photo preprocessing. Please try another environment.",
    );
  }

  try {
    return await decoder(file);
  } catch {
    throw new ImagePreprocessError(
      "decode_failed",
      "Could not load the photo. Please try another photo.",
    );
  }
}

async function reencode(
  bitmap: BitmapLike,
  width: number,
  height: number,
  deps: PreprocessDeps,
): Promise<Blob> {
  const canvasFactory = deps.createCanvas ?? resolveDefaultCanvasFactory();

  if (!canvasFactory) {
    throw new ImagePreprocessError(
      "canvas_unavailable",
      "This browser does not support photo preprocessing. Please try another environment.",
    );
  }

  const canvas = canvasFactory(width, height);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new ImagePreprocessError(
      "canvas_unavailable",
      "This browser does not support photo preprocessing. Please try another environment.",
    );
  }

  context.drawImage(bitmap, 0, 0, width, height);

  try {
    return await canvas.convertToBlob({
      type: OUTPUT_CONTENT_TYPE,
      quality: JPEG_QUALITY,
    });
  } catch {
    throw new ImagePreprocessError(
      "encode_failed",
      "Could not convert the photo. Please try again.",
    );
  }
}

async function sha256Hex(blob: Blob, deps: PreprocessDeps): Promise<string> {
  const digestFn = deps.digest ?? resolveDefaultDigest();

  if (!digestFn) {
    throw new ImagePreprocessError(
      "digest_unavailable",
      "This browser does not support photo hashing. Please try another environment.",
    );
  }

  const buffer = await blob.arrayBuffer();
  const hash = await digestFn("SHA-256", buffer);
  return toHex(new Uint8Array(hash));
}

function makePreviewUrl(blob: Blob, deps: PreprocessDeps): string {
  const create = deps.createObjectURL ?? resolveDefaultObjectUrl();

  if (!create) {
    throw new ImagePreprocessError(
      "canvas_unavailable",
      "This browser does not support photo previews. Please try another environment.",
    );
  }

  return create(blob);
}

function fitWithinLongEdge(
  width: number,
  height: number,
  maxLongEdge: number,
): { readonly width: number; readonly height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width, height };
  }

  const scale = maxLongEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0;
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function resolveDefaultBitmapDecoder():
  | ((blob: Blob) => Promise<BitmapLike>)
  | undefined {
  const value = (globalThis as Record<string, unknown>).createImageBitmap;
  return typeof value === "function"
    ? (value as (blob: Blob) => Promise<BitmapLike>)
    : undefined;
}

function resolveDefaultCanvasFactory():
  | ((width: number, height: number) => CanvasLike)
  | undefined {
  const ctor = (globalThis as Record<string, unknown>).OffscreenCanvas;
  if (typeof ctor !== "function") {
    return undefined;
  }
  const Ctor = ctor as new (w: number, h: number) => CanvasLike;
  return (width, height) => new Ctor(width, height);
}

function resolveDefaultDigest():
  | ((algorithm: "SHA-256", data: ArrayBuffer) => Promise<ArrayBuffer>)
  | undefined {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return undefined;
  }
  return (algorithm, data) => subtle.digest(algorithm, data);
}

function resolveDefaultObjectUrl(): ((blob: Blob) => string) | undefined {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return undefined;
  }
  return URL.createObjectURL.bind(URL);
}
