import { readFile } from "node:fs/promises";

import sharp from "sharp";

import type { SeedingInputEntry } from "./seeding-input";

const SEED_WALRUS_EPOCHS = 5;
const SEED_WALRUS_CONTENT_TYPE = "image/png";

export type SeedingPreprocessMetadata = {
  readonly sourceByteSize: number;
  readonly outputByteSize: number;
  readonly originalWidth: number | null;
  readonly originalHeight: number | null;
  readonly originalFormat: string | null;
  readonly normalizedWidth: number | null;
  readonly normalizedHeight: number | null;
  readonly normalizedFormat: string;
};

export type SeedingPreprocessLog = SeedingPreprocessMetadata & {
  readonly filePath: string;
  readonly imageKey: string;
};

export type SeedingPreprocessedImage = SeedingInputEntry & {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly metadata: SeedingPreprocessMetadata;
  readonly log: SeedingPreprocessLog;
};

export type SeedingWalrusUploadResult = {
  readonly blobId: string;
  readonly aggregatorUrl: string;
};

export type SeedingWalrusUploadClient = {
  putBlob(
    bytes: Uint8Array,
    contentType?: string,
  ): Promise<SeedingWalrusUploadResult>;
};

export type SeedingWalrusUploadErrorOptions = {
  readonly cause?: unknown;
  readonly status?: number | null;
};

export class SeedingWalrusUploadError extends Error {
  readonly status: number | null;

  constructor(message: string, options: SeedingWalrusUploadErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = "SeedingWalrusUploadError";
    this.status = options.status ?? null;
  }
}

export type SeedingUploadCandidate = {
  readonly blobId: string;
  readonly imageKey: string;
};

export function createSeedingWalrusUploadClient(options: {
  readonly aggregatorBaseUrl: string;
  readonly fetchFn?: typeof fetch;
  readonly publisherBaseUrl: string;
}): SeedingWalrusUploadClient {
  return {
    async putBlob(
      bytes: Uint8Array,
      contentType: string = SEED_WALRUS_CONTENT_TYPE,
    ): Promise<SeedingWalrusUploadResult> {
      const fetchFn = options.fetchFn ?? fetch;
      const publisherBaseUrl = trimTrailingSlashes(options.publisherBaseUrl);
      const aggregatorBaseUrl = trimTrailingSlashes(options.aggregatorBaseUrl);
      const response = await fetchFn(
        `${publisherBaseUrl}/v1/blobs?epochs=${SEED_WALRUS_EPOCHS}`,
        {
          method: "PUT",
          body: bytes,
          headers: {
            "content-type": contentType,
          },
        },
      );

      if (!response.ok) {
        throw new SeedingWalrusUploadError(
          "Seed Walrus publisher upload failed.",
          {
            status: response.status,
          },
        );
      }

      const payload = await response.json();
      const blobId = readBlobId(payload);

      if (!blobId) {
        throw new SeedingWalrusUploadError(
          "Seed Walrus publisher response did not include blobId.",
          {
            cause: payload,
          },
        );
      }

      return {
        blobId,
        aggregatorUrl: `${aggregatorBaseUrl}/v1/blobs/${blobId}`,
      };
    },
  };
}

export async function preprocessSeedingImage(
  entry: SeedingInputEntry,
): Promise<SeedingPreprocessedImage> {
  const sourceBytes = await readFile(entry.filePath);
  const sourceImage = sharp(sourceBytes);
  const sourceMetadata = await sourceImage.metadata();
  const normalized = await sharp(sourceBytes)
    .rotate()
    .png()
    .toBuffer({ resolveWithObject: true });
  const outputBytes = new Uint8Array(normalized.data);

  return {
    ...entry,
    bytes: outputBytes,
    contentType: SEED_WALRUS_CONTENT_TYPE,
    metadata: {
      sourceByteSize: sourceBytes.byteLength,
      outputByteSize: normalized.info.size ?? outputBytes.byteLength,
      originalWidth: sourceMetadata.width ?? null,
      originalHeight: sourceMetadata.height ?? null,
      originalFormat: sourceMetadata.format ?? null,
      normalizedWidth: normalized.info.width ?? null,
      normalizedHeight: normalized.info.height ?? null,
      normalizedFormat: normalized.info.format ?? "png",
    },
    log: {
      imageKey: entry.imageKey,
      filePath: entry.filePath,
      sourceByteSize: sourceBytes.byteLength,
      outputByteSize: normalized.info.size ?? outputBytes.byteLength,
      originalWidth: sourceMetadata.width ?? null,
      originalHeight: sourceMetadata.height ?? null,
      originalFormat: sourceMetadata.format ?? null,
      normalizedWidth: normalized.info.width ?? null,
      normalizedHeight: normalized.info.height ?? null,
      normalizedFormat: normalized.info.format ?? "png",
    },
  };
}

export function validateUniqueSeedingBlobIds<T extends SeedingUploadCandidate>(
  candidates: readonly T[],
): readonly T[] {
  const seen = new Map<string, string>();

  for (const candidate of candidates) {
    const previousImageKey = seen.get(candidate.blobId);

    if (previousImageKey !== undefined) {
      throw new Error(
        `Duplicate blobId "${candidate.blobId}" found for "${previousImageKey}" and "${candidate.imageKey}".`,
      );
    }

    seen.set(candidate.blobId, candidate.imageKey);
  }

  return candidates;
}

function readBlobId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const newlyCreated = record.newlyCreated;

  if (typeof newlyCreated === "object" && newlyCreated !== null) {
    const blobObject = (newlyCreated as Record<string, unknown>).blobObject;

    if (typeof blobObject === "object" && blobObject !== null) {
      const blobId = (blobObject as Record<string, unknown>).blobId;

      if (typeof blobId === "string" && blobId.length > 0) {
        return blobId;
      }
    }
  }

  const alreadyCertified = record.alreadyCertified;

  if (typeof alreadyCertified === "object" && alreadyCertified !== null) {
    const blobId = (alreadyCertified as Record<string, unknown>).blobId;

    if (typeof blobId === "string" && blobId.length > 0) {
      return blobId;
    }
  }

  return null;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "");
}
