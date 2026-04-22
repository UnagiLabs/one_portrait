import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type SeedingLedgerRowStatus =
  | "pending_upload"
  | "uploaded"
  | "submitted"
  | "recovered"
  | "failed";

export type SeedingLedgerRow = {
  readonly imageKey: string;
  readonly senderAddress: string;
  readonly blobId: string | null;
  readonly txDigest: string | null;
  readonly submissionNo: number | null;
  readonly status: SeedingLedgerRowStatus;
  readonly failureReason: string | null;
};

export type SeedingLedger = {
  readonly rows: readonly SeedingLedgerRow[];
};

export function createEmptySeedingLedger(): SeedingLedger {
  return {
    rows: [],
  };
}

export async function readSeedingLedger(filePath: string): Promise<SeedingLedger> {
  try {
    const raw = await readFile(filePath, "utf8");
    return parseSeedingLedger(raw);
  } catch (error) {
    if (isMissingFileError(error)) {
      return createEmptySeedingLedger();
    }

    throw error;
  }
}

export async function writeSeedingLedger(
  filePath: string,
  ledger: SeedingLedger,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify({ rows: ledger.rows }, null, 2)}\n`,
    "utf8",
  );
}

function parseSeedingLedger(raw: string): SeedingLedger {
  const value: unknown = JSON.parse(raw);

  if (typeof value !== "object" || value === null) {
    throw new Error("Seeding ledger JSON must be an object.");
  }

  const rows = (value as { rows?: unknown }).rows;

  if (!Array.isArray(rows)) {
    return createEmptySeedingLedger();
  }

  return {
    rows: rows.map(parseSeedingLedgerRow),
  };
}

function parseSeedingLedgerRow(value: unknown): SeedingLedgerRow {
  if (typeof value !== "object" || value === null) {
    throw new Error("Seeding ledger row must be an object.");
  }

  const record = value as Record<string, unknown>;

  return {
    imageKey: readStringField(record.imageKey, "imageKey"),
    senderAddress: readStringField(record.senderAddress, "senderAddress"),
    blobId: readNullableStringField(record.blobId, "blobId"),
    txDigest: readNullableStringField(record.txDigest, "txDigest"),
    submissionNo: readNullableNumberField(
      record.submissionNo,
      "submissionNo",
    ),
    status: readStatusField(record.status),
    failureReason: readNullableStringField(
      record.failureReason,
      "failureReason",
    ),
  };
}

function readStringField(value: unknown, label: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`${label} must be a non-empty string.`);
}

function readNullableStringField(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  throw new Error(`${label} must be a string or null.`);
}

function readNullableNumberField(
  value: unknown,
  label: string,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`${label} must be a number or null.`);
}

function readStatusField(value: unknown): SeedingLedgerRowStatus {
  if (
    value === "pending_upload" ||
    value === "uploaded" ||
    value === "submitted" ||
    value === "recovered" ||
    value === "failed"
  ) {
    return value;
  }

  throw new Error(`status must be a valid seeding ledger status.`);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
