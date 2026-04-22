import type { GeneratorSeedingSnapshot } from "./sui";
import type {
  SeedingLedger,
  SeedingLedgerRow,
  SeedingLedgerRowStatus,
} from "./seeding-ledger";

export type SeedingDigestStatus = "success" | "failed" | "unknown";

export type SeedingDigestStatusChecker = (
  txDigest: string,
) => Promise<SeedingDigestStatus> | SeedingDigestStatus;

export type SeedingReconciliationSummary = {
  submitted: number;
  recovered: number;
  failed: number;
  unresolved: number;
};

export type SeedingReconciliationResult = {
  readonly rows: readonly SeedingLedgerRow[];
  readonly summary: SeedingReconciliationSummary;
};

export async function reconcileSeedingLedger(input: {
  readonly checkDigestStatus: SeedingDigestStatusChecker;
  readonly ledger: SeedingLedger;
  readonly snapshot: GeneratorSeedingSnapshot;
}): Promise<SeedingReconciliationResult> {
  const submissionByPair = buildSubmissionIndex(input.snapshot);
  const usedPairs = new Set<string>();
  const summary: SeedingReconciliationSummary = {
    submitted: 0,
    recovered: 0,
    failed: 0,
    unresolved: 0,
  };
  const rows: SeedingLedgerRow[] = [];

  for (const row of input.ledger.rows) {
    const pairKey = getPairKey(row);

    if (pairKey !== null && usedPairs.has(pairKey)) {
      rows.push(markDuplicateRow(row));
      summary.failed += 1;
      continue;
    }

    const submission = pairKey === null ? undefined : submissionByPair.get(pairKey);

    if (submission !== undefined) {
      rows.push({
        ...row,
        submissionNo: submission.submissionNo,
        status: "submitted",
        failureReason: null,
      });
      summary.submitted += 1;

      if (pairKey !== null) {
        usedPairs.add(pairKey);
      }

      continue;
    }

    if (row.txDigest !== null) {
      const digestStatus = await input.checkDigestStatus(row.txDigest);

      if (digestStatus === "success") {
        rows.push({
          ...row,
          status: "recovered",
          failureReason: null,
        });
        summary.recovered += 1;

        if (pairKey !== null) {
          usedPairs.add(pairKey);
        }

        continue;
      }

      if (digestStatus === "failed") {
        rows.push({
          ...row,
          status: "failed",
          failureReason: `Digest ${row.txDigest} reported failure.`,
        });
        summary.failed += 1;
        continue;
      }
    }

    rows.push({
      ...row,
      status: recoverableStatusFor(row),
      failureReason: null,
    });
    summary.unresolved += 1;
  }

  return {
    rows,
    summary,
  };
}

function buildSubmissionIndex(snapshot: GeneratorSeedingSnapshot): Map<string, {
  readonly submissionNo: number;
  readonly submitter: string;
  readonly walrusBlobId: string;
}> {
  const index = new Map<
    string,
    {
      readonly submissionNo: number;
      readonly submitter: string;
      readonly walrusBlobId: string;
    }
  >();

  for (const submission of snapshot.submissions) {
    const key = pairKey(submission.submitter, submission.walrusBlobId);
    if (!index.has(key)) {
      index.set(key, submission);
    }
  }

  return index;
}

function markDuplicateRow(row: SeedingLedgerRow): SeedingLedgerRow {
  return {
    ...row,
    status: "failed",
    failureReason: `Duplicate sender/blob pair already reconciled for ${row.senderAddress} + ${row.blobId}.`,
  };
}

function recoverableStatusFor(row: SeedingLedgerRow): SeedingLedgerRowStatus {
  if (row.blobId !== null || row.txDigest !== null) {
    return "uploaded";
  }

  return "pending_upload";
}

function getPairKey(row: SeedingLedgerRow): string | null {
  if (row.blobId === null) {
    return null;
  }

  return pairKey(row.senderAddress, row.blobId);
}

function pairKey(senderAddress: string, blobId: string): string {
  return `${senderAddress}\u0000${blobId}`;
}
