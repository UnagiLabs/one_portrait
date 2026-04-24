import type {
  GeneratorSubmissionRef,
  GeneratorUnitSnapshot,
  MosaicRgb,
} from "@one-portrait/shared";
import { renderedMosaicTileSizePx } from "@one-portrait/shared";
import sharp from "sharp";

export type PreparedSubmission = GeneratorSubmissionRef & {
  readonly averageColor: MosaicRgb;
  readonly imageBytes: Uint8Array;
};

export type PreparedFinalizeInput = {
  readonly athleteId: number;
  readonly submissions: readonly PreparedSubmission[];
  readonly targetImageBytes: Uint8Array;
  readonly targetWalrusBlobId: string;
  readonly unitId: string;
};

export type AverageColorSampler = (
  imageBytes: Uint8Array,
) => Promise<MosaicRgb> | MosaicRgb;

export type WalrusReadClient = {
  getBlob(blobId: string): Promise<Uint8Array>;
};

export type PrepareFinalizeDeps = {
  readonly sampleAverageColor: AverageColorSampler;
  readonly walrus: WalrusReadClient;
};

type DisplayAwareFinalizeSnapshot = GeneratorUnitSnapshot & {
  readonly displayMaxSlots?: number;
};

export async function prepareFinalizeInput(
  snapshot: DisplayAwareFinalizeSnapshot,
  deps: PrepareFinalizeDeps,
): Promise<PreparedFinalizeInput> {
  const targetImageBytes = await deps.walrus.getBlob(
    snapshot.targetWalrusBlobId,
  );
  const submissions = sortSubmissions(snapshot.submissions);
  const displayMaxSlots =
    typeof snapshot.displayMaxSlots === "number" &&
    Number.isInteger(snapshot.displayMaxSlots) &&
    snapshot.displayMaxSlots > 0
      ? snapshot.displayMaxSlots
      : submissions.length;

  const preparedRealSubmissions = await Promise.all(
    submissions.map(async (submission) => {
      const imageBytes = await deps.walrus.getBlob(submission.walrusBlobId);
      const averageColor = await deps.sampleAverageColor(imageBytes);

      return {
        ...submission,
        averageColor,
        imageBytes,
      } satisfies PreparedSubmission;
    }),
  );
  const dummySubmissions = await createDummyPreparedSubmissions(
    Math.max(0, displayMaxSlots - preparedRealSubmissions.length),
    preparedRealSubmissions.length + 1,
    deps.sampleAverageColor,
  );

  return {
    athleteId: snapshot.athleteId,
    submissions: [...preparedRealSubmissions, ...dummySubmissions],
    targetImageBytes,
    targetWalrusBlobId: snapshot.targetWalrusBlobId,
    unitId: snapshot.unitId,
  };
}

export function sortSubmissions(
  submissions: readonly GeneratorSubmissionRef[],
): GeneratorSubmissionRef[] {
  return [...submissions].sort((left, right) => {
    if (left.submissionNo !== right.submissionNo) {
      return left.submissionNo - right.submissionNo;
    }

    return left.walrusBlobId.localeCompare(right.walrusBlobId);
  });
}

async function createDummyPreparedSubmissions(
  count: number,
  startingSubmissionNo: number,
  sampleAverageColor: AverageColorSampler,
): Promise<PreparedSubmission[]> {
  if (count <= 0) {
    return [];
  }

  const imageBytes = await createDummyImageBytes();
  const averageColor = await sampleAverageColor(imageBytes);

  return Array.from({ length: count }, (_, index) => ({
    submissionNo: startingSubmissionNo + index,
    submitter: DUMMY_SUBMITTER,
    submittedAtMs: 0,
    walrusBlobId: `dummy-locked-tile-${String(index + 1).padStart(4, "0")}`,
    averageColor,
    imageBytes,
  }));
}

async function createDummyImageBytes(): Promise<Uint8Array> {
  return sharp({
    create: {
      width: renderedMosaicTileSizePx,
      height: renderedMosaicTileSizePx,
      channels: 3,
      background: { r: 232, g: 224, b: 212 },
    },
  })
    .png()
    .toBuffer();
}

const DUMMY_SUBMITTER = `0x${"0".repeat(64)}`;
