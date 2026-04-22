"use client";

/**
 * Client-side photo preprocessing for Walrus uploads.
 *
 * Spec (see `docs/tech.md` §5.3 / §6):
 * - 入力は 10MB 上限でサイズ検証
 * - 長辺 1024px へリサイズ（縮小のみ、拡大しない）
 * - JPEG 品質 0.85 で再エンコード（EXIF は再エンコードで除去される）
 * - 再エンコード後の Blob から SHA-256 を算出
 * - UI が貼れるプレビュー URL を返す
 *
 * ブラウザ API（`createImageBitmap` / `OffscreenCanvas` / `crypto.subtle` /
 * `URL.createObjectURL`）は DI で差し替え可能にして、テスト環境（happy-dom /
 * jsdom）でもロジックを検証できるようにしている。
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
 * Throws {@link ImagePreprocessError} with a UI-friendly Japanese message when
 * validation / decoding / encoding fails.
 */
export async function preprocessPhoto(
  file: File,
  deps: PreprocessDeps = {},
): Promise<PreprocessedPhoto> {
  if (file.size > MAX_PHOTO_BYTES) {
    throw new ImagePreprocessError(
      "file_too_large",
      "写真のサイズが上限（10MB）を超えています。別の写真を選び直してください。",
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
      "このブラウザでは写真の前処理がサポートされていません。別の環境でお試しください。",
    );
  }

  try {
    return await decoder(file);
  } catch {
    throw new ImagePreprocessError(
      "decode_failed",
      "写真を読み込めませんでした。別の写真で試してみてください。",
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
      "このブラウザでは写真の前処理がサポートされていません。別の環境でお試しください。",
    );
  }

  const canvas = canvasFactory(width, height);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new ImagePreprocessError(
      "canvas_unavailable",
      "このブラウザでは写真の前処理がサポートされていません。別の環境でお試しください。",
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
      "写真の変換に失敗しました。もう一度お試しください。",
    );
  }
}

async function sha256Hex(blob: Blob, deps: PreprocessDeps): Promise<string> {
  const digestFn = deps.digest ?? resolveDefaultDigest();

  if (!digestFn) {
    throw new ImagePreprocessError(
      "digest_unavailable",
      "このブラウザでは写真のハッシュ計算がサポートされていません。別の環境でお試しください。",
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
      "このブラウザでは写真のプレビュー表示がサポートされていません。別の環境でお試しください。",
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
