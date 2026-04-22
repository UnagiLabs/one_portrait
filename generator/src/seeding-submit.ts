import type {
  GeneratorSeedingSnapshot,
  GeneratorSeedingSnapshotLoader,
  SubmitPhotoTransactionResult,
} from "./sui";

export type SubmitPhotoTransactionExecutor = (args: {
  readonly blobId: string;
  readonly unitId: string;
}) => Promise<SubmitPhotoTransactionResult>;

export type ProgressAwareSubmissionResult = SubmitPhotoTransactionResult & {
  readonly snapshot: GeneratorSeedingSnapshot;
  readonly submissionNo: number | null;
  readonly submittedCount: number;
  readonly status: GeneratorSeedingSnapshot["status"];
};

export function createProgressAwareSubmissionHelper(input: {
  readonly readSeedingSnapshot: GeneratorSeedingSnapshotLoader;
  readonly submitPhoto: SubmitPhotoTransactionExecutor;
}): (args: {
  readonly blobId: string;
  readonly unitId: string;
}) => Promise<ProgressAwareSubmissionResult> {
  return async (args) => {
    const submitted = await input.submitPhoto(args);
    const snapshot = await input.readSeedingSnapshot(args.unitId);

    return {
      ...submitted,
      snapshot,
      submissionNo: findSubmissionNo(
        snapshot,
        submitted.senderAddress,
        args.blobId,
      ),
      submittedCount: snapshot.submittedCount,
      status: snapshot.status,
    };
  };
}

export function validateFinalSubmissionPostcondition(input: {
  readonly submittedCount: number;
  readonly status: GeneratorSeedingSnapshot["status"];
  readonly targetCount: number;
}): void {
  if (
    input.submittedCount === input.targetCount &&
    input.status === "pending"
  ) {
    return;
  }

  throw new Error(
    `Expected submittedCount=${input.targetCount} with pending status, got submittedCount=${input.submittedCount} and status=${input.status}.`,
  );
}

function findSubmissionNo(
  snapshot: GeneratorSeedingSnapshot,
  senderAddress: string,
  blobId: string,
): number | null {
  const submission = snapshot.submissions.find(
    (entry) =>
      entry.submitter === senderAddress && entry.walrusBlobId === blobId,
  );

  return submission?.submissionNo ?? null;
}
