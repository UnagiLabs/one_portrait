import type {
  GeneratorSubmissionRef,
  GeneratorUnitSnapshot,
  MosaicRgb,
} from "@one-portrait/shared";

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

export async function prepareFinalizeInput(
  snapshot: GeneratorUnitSnapshot,
  deps: PrepareFinalizeDeps,
): Promise<PreparedFinalizeInput> {
  const targetImageBytes = await deps.walrus.getBlob(snapshot.targetWalrusBlobId);
  const submissions = sortSubmissions(snapshot.submissions);

  const preparedSubmissions = await Promise.all(
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

  return {
    athleteId: snapshot.athleteId,
    submissions: preparedSubmissions,
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
