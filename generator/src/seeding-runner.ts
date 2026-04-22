import { readFile } from "node:fs/promises";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import type { SeedingInputEntry } from "./seeding-input";
import type {
  SeedingLedger,
  SeedingLedgerRow,
  SeedingLedgerRowStatus,
} from "./seeding-ledger";
import { validateSeedingPreflight } from "./seeding-preflight";
import {
  reconcileSeedingLedger,
  type SeedingDigestStatusChecker,
  type SeedingReconciliationSummary,
} from "./seeding-reconciliation";
import type { ProgressAwareSubmissionResult } from "./seeding-submit";
import { validateFinalSubmissionPostcondition } from "./seeding-submit";
import type {
  SeedingPreprocessedImage,
  SeedingUploadCandidate,
  SeedingWalrusUploadResult,
} from "./seeding-upload";
import { validateUniqueSeedingBlobIds } from "./seeding-upload";
import type {
  GeneratorSeedingSnapshot,
  GeneratorSeedingSnapshotLoader,
} from "./sui";

export type SeedingSenderConfigEntry = {
  readonly label?: string;
  readonly privateKey: string | Uint8Array;
};

export type SeedingSender = SeedingSenderConfigEntry & {
  readonly address: string;
};

export type SeedingDemoSubmissionMode = "simulate" | "live";

export type SeedingDemoSubmissionCliArgs = {
  readonly images: string | null;
  readonly ledger: string;
  readonly limit: number | null;
  readonly manifest: string | null;
  readonly mode: SeedingDemoSubmissionMode;
  readonly senderConfig: string;
  readonly targetCount: number | null;
  readonly unitId: string;
};

export type SeedingDemoSubmissionRunnerDeps = {
  readonly checkDigestStatus: SeedingDigestStatusChecker;
  readonly deriveSenders: (
    entries: readonly SeedingSenderConfigEntry[],
  ) => readonly SeedingSender[];
  readonly loadInputEntries: (input: {
    readonly images: string | null;
    readonly manifest: string | null;
  }) => Promise<readonly SeedingInputEntry[]>;
  readonly loadSenderConfig: (
    filePath: string,
  ) => Promise<readonly SeedingSenderConfigEntry[]>;
  readonly preprocessSeedingImage: (
    entry: SeedingInputEntry,
  ) => Promise<SeedingPreprocessedImage>;
  readonly putBlob: (
    bytes: Uint8Array,
    contentType?: string,
  ) => Promise<SeedingWalrusUploadResult>;
  readonly readLedger: (filePath: string) => Promise<SeedingLedger>;
  readonly readSeedingSnapshot: GeneratorSeedingSnapshotLoader;
  readonly submitPhotoForSender: (
    senderAddress: string,
    args: {
      readonly blobId: string;
      readonly unitId: string;
    },
  ) => Promise<ProgressAwareSubmissionResult>;
  readonly writeLedger: (
    filePath: string,
    ledger: SeedingLedger,
  ) => Promise<void>;
};

export type SeedingDemoSubmissionRunSummary = {
  readonly existingRowCount: number;
  readonly limit: number | null;
  readonly mode: SeedingDemoSubmissionMode;
  readonly plannedRowCount: number;
  readonly processedRows: number;
  readonly reconciledSummary: SeedingReconciliationSummary;
  readonly remainingRows: number;
  readonly stoppedAfterLimit: boolean;
  readonly submittedRows: number;
  readonly targetCount: number;
  readonly unitId: string;
  readonly uploadedRows: number;
  readonly wouldProcessRows: number;
  readonly wouldSubmitRows: number;
  readonly wouldUploadRows: number;
};

export type SeedingDemoSubmissionRunResult = {
  readonly ledger: SeedingLedger;
  readonly summary: SeedingDemoSubmissionRunSummary;
};

export type SeedingDemoSubmissionRunner = {
  run(
    options: SeedingDemoSubmissionCliArgs,
  ): Promise<SeedingDemoSubmissionRunResult>;
};

export function createSeedingDemoSubmissionRunner(
  deps: SeedingDemoSubmissionRunnerDeps,
): SeedingDemoSubmissionRunner {
  return {
    async run(
      options: SeedingDemoSubmissionCliArgs,
    ): Promise<SeedingDemoSubmissionRunResult> {
      const inputEntries = await deps.loadInputEntries({
        images: options.images,
        manifest: options.manifest,
      });
      const senderConfig = await deps.loadSenderConfig(options.senderConfig);
      const senders = deps.deriveSenders(senderConfig);
      const senderAddresses = senders.map((sender) => sender.address);
      const existingLedger = await deps.readLedger(options.ledger);
      const snapshot = await deps.readSeedingSnapshot(options.unitId);
      const targetCount = options.targetCount ?? snapshot.maxSlots - 1;
      const inputLedger = buildSeedingLedgerRows({
        entries: inputEntries,
        existingLedger,
        senderAddresses,
        targetCount,
      });
      validateSeedingPreflight(snapshot, targetCount, senderAddresses);

      const reconciled = await reconcileSeedingLedger({
        checkDigestStatus: deps.checkDigestStatus,
        ledger: inputLedger,
        snapshot,
      });
      const workingRows: SeedingLedgerRow[] = reconciled.rows.map((row) => ({
        ...row,
      }));
      const workingLedger: SeedingLedger = {
        rows: workingRows,
      };
      const byImageKey = new Map(
        inputEntries.map((entry) => [entry.imageKey, entry] as const),
      );
      const senderByAddress = new Map(
        senders.map((sender) => [sender.address, sender] as const),
      );
      const newRowCount = countNewRows(existingLedger, workingLedger.rows);
      const availableSenderCount = countAvailableSenders(
        senderAddresses,
        existingLedger,
      );

      if (availableSenderCount < newRowCount) {
        throw new Error(
          `Not enough available sender addresses for ${newRowCount} new row(s).`,
        );
      }

      if (options.mode === "simulate") {
        const simulation = await simulateRows({
          byImageKey,
          ledgerRows: workingRows,
          limit: options.limit,
          preprocessSeedingImage: deps.preprocessSeedingImage,
        });

        return {
          ledger: workingLedger,
          summary: {
            existingRowCount: existingLedger.rows.length,
            limit: options.limit,
            mode: "simulate",
            plannedRowCount: workingLedger.rows.length,
            processedRows: 0,
            reconciledSummary: reconciled.summary,
            remainingRows:
              workingLedger.rows.length - simulation.wouldProcessRows,
            stoppedAfterLimit: simulation.stoppedAfterLimit,
            submittedRows: 0,
            targetCount,
            unitId: options.unitId,
            uploadedRows: 0,
            wouldProcessRows: simulation.wouldProcessRows,
            wouldSubmitRows: simulation.wouldSubmitRows,
            wouldUploadRows: simulation.wouldUploadRows,
          },
        };
      }

      await deps.writeLedger(options.ledger, workingLedger);

      const uploadCandidates: SeedingUploadCandidate[] = workingRows
        .filter((row) => row.blobId !== null && row.status !== "failed")
        .map((row) => ({
          imageKey: row.imageKey,
          blobId: row.blobId as string,
        }));
      validateUniqueSeedingBlobIds(uploadCandidates);
      const execution = await executeRows({
        byImageKey,
        initialSnapshot: snapshot,
        ledgerRows: workingRows,
        limit: options.limit,
        preprocessSeedingImage: deps.preprocessSeedingImage,
        putBlob: deps.putBlob,
        senderByAddress,
        submitPhotoForSender: deps.submitPhotoForSender,
        unitId: options.unitId,
        uploadCandidates,
        writeLedger: async () =>
          deps.writeLedger(options.ledger, workingLedger),
      });

      if (
        !execution.stoppedAfterLimit &&
        execution.latestSnapshot.submittedCount === targetCount
      ) {
        validateFinalSubmissionPostcondition({
          submittedCount: execution.latestSnapshot.submittedCount,
          status: execution.latestSnapshot.status,
          targetCount,
        });
      }

      return {
        ledger: workingLedger,
        summary: {
          existingRowCount: existingLedger.rows.length,
          limit: options.limit,
          mode: "live",
          plannedRowCount: workingLedger.rows.length,
          processedRows: execution.processedRows,
          reconciledSummary: reconciled.summary,
          remainingRows: workingLedger.rows.length - execution.processedRows,
          stoppedAfterLimit: execution.stoppedAfterLimit,
          submittedRows: execution.submittedRows,
          targetCount,
          unitId: options.unitId,
          uploadedRows: execution.uploadedRows,
          wouldProcessRows: execution.processedRows,
          wouldSubmitRows: execution.submittedRows,
          wouldUploadRows: execution.uploadedRows,
        },
      };
    },
  };
}

export async function loadSeedingSenderConfig(
  filePath: string,
): Promise<readonly SeedingSenderConfigEntry[]> {
  const raw = await readFile(filePath, "utf8");
  return parseSeedingSenderConfig(raw);
}

export function parseSeedingSenderConfig(
  raw: string,
): readonly SeedingSenderConfigEntry[] {
  const value: unknown = JSON.parse(raw);
  const entries = readSenderConfigEntries(value);

  return entries.map(normalizeSenderConfigEntry);
}

export function deriveSeedingSenders(
  entries: readonly SeedingSenderConfigEntry[],
): readonly SeedingSender[] {
  const seenAddresses = new Set<string>();
  const senders: SeedingSender[] = [];

  for (const entry of entries) {
    const address = Ed25519Keypair.fromSecretKey(
      entry.privateKey,
    ).toSuiAddress();

    if (seenAddresses.has(address)) {
      throw new Error(
        `Duplicate sender address derived from sender config: ${address}`,
      );
    }

    seenAddresses.add(address);
    senders.push({
      ...entry,
      address,
    });
  }

  return senders;
}

export function buildSeedingLedgerRows(input: {
  readonly entries: readonly SeedingInputEntry[];
  readonly existingLedger: SeedingLedger;
  readonly senderAddresses: readonly string[];
  readonly targetCount: number;
}): SeedingLedger {
  if (input.targetCount <= 0) {
    throw new Error("targetCount must be a positive integer.");
  }

  if (input.entries.length < input.targetCount) {
    throw new Error(
      `Need at least ${input.targetCount} input entries, found ${input.entries.length}.`,
    );
  }

  const selectedEntries = input.entries.slice(0, input.targetCount);
  const existingByImageKey = new Map<string, SeedingLedgerRow>();

  for (const row of input.existingLedger.rows) {
    if (!existingByImageKey.has(row.imageKey)) {
      existingByImageKey.set(row.imageKey, row);
    }
  }

  const usedSenderAddresses = new Set(
    input.existingLedger.rows.map((row) => row.senderAddress),
  );
  const availableSenderAddresses = input.senderAddresses.filter(
    (senderAddress) => !usedSenderAddresses.has(senderAddress),
  );
  const rows: SeedingLedgerRow[] = [];
  let nextSenderIndex = 0;

  for (const entry of selectedEntries) {
    const existingRow = existingByImageKey.get(entry.imageKey);

    if (existingRow !== undefined) {
      rows.push(existingRow);
      continue;
    }

    const senderAddress = availableSenderAddresses[nextSenderIndex];

    if (senderAddress === undefined) {
      throw new Error(
        "Not enough sender addresses available to initialize the ledger.",
      );
    }

    nextSenderIndex += 1;
    rows.push({
      imageKey: entry.imageKey,
      senderAddress,
      blobId: null,
      aggregatorUrl: null,
      txDigest: null,
      submissionNo: null,
      status: "pending_upload",
      preprocessLog: null,
      observedSubmittedCount: null,
      observedUnitStatus: null,
      failureReason: null,
    });
  }

  return { rows };
}

export function parseSeedingDemoSubmissionArgs(
  argv: readonly string[],
): SeedingDemoSubmissionCliArgs {
  const options: {
    images: string | null;
    ledger: string | null;
    limit: number | null;
    manifest: string | null;
    mode: SeedingDemoSubmissionMode | null;
    senderConfig: string | null;
    targetCount: number | null;
    unitId: string | null;
  } = {
    images: null,
    ledger: null,
    limit: null,
    manifest: null,
    mode: null,
    senderConfig: null,
    targetCount: null,
    unitId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const next = argv[index + 1];

    switch (arg) {
      case "--unit-id":
        options.unitId = readRequiredValue(next, arg);
        index += 1;
        break;
      case "--images":
        options.images = readRequiredValue(next, arg);
        index += 1;
        break;
      case "--manifest":
        options.manifest = readRequiredValue(next, arg);
        index += 1;
        break;
      case "--sender-config":
        options.senderConfig = readRequiredValue(next, arg);
        index += 1;
        break;
      case "--target-count":
        options.targetCount = readPositiveInt(next, arg);
        index += 1;
        break;
      case "--limit":
        options.limit = readPositiveInt(next, arg);
        index += 1;
        break;
      case "--ledger":
        options.ledger = readRequiredValue(next, arg);
        index += 1;
        break;
      case "--mode":
        options.mode = readMode(next);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.unitId) {
    throw new Error("Missing required flag: --unit-id");
  }

  if (!options.senderConfig) {
    throw new Error("Missing required flag: --sender-config");
  }

  if (!options.ledger) {
    throw new Error("Missing required flag: --ledger");
  }

  if (!options.mode) {
    throw new Error("Missing required flag: --mode");
  }

  if (!options.images && !options.manifest) {
    throw new Error("Provide either --images or --manifest.");
  }

  return {
    images: options.images ?? null,
    ledger: options.ledger,
    limit: options.limit ?? null,
    manifest: options.manifest ?? null,
    mode: options.mode,
    senderConfig: options.senderConfig,
    targetCount: options.targetCount ?? null,
    unitId: options.unitId,
  };
}

function readSenderConfigEntries(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "object" || value === null) {
    throw new Error("Sender config JSON must be an array or an object.");
  }

  const record = value as {
    readonly entries?: readonly unknown[];
    readonly privateKeys?: readonly unknown[];
    readonly senders?: readonly unknown[];
  };

  if (Array.isArray(record.senders)) {
    return record.senders;
  }

  if (Array.isArray(record.entries)) {
    return record.entries;
  }

  if (Array.isArray(record.privateKeys)) {
    return record.privateKeys.map((privateKey) => ({ privateKey }));
  }

  throw new Error("Sender config JSON did not include any sender entries.");
}

function normalizeSenderConfigEntry(value: unknown): SeedingSenderConfigEntry {
  if (typeof value === "string") {
    return {
      privateKey: decodePrivateKey(value),
    };
  }

  if (Array.isArray(value)) {
    return {
      privateKey: decodePrivateKey(value),
    };
  }

  if (typeof value !== "object" || value === null) {
    throw new Error(
      "Sender config entries must be strings, arrays, or objects.",
    );
  }

  const record = value as Record<string, unknown>;
  const privateKey = record.privateKey ?? record.secretKey;

  if (privateKey === undefined) {
    throw new Error("Sender config entries require a privateKey field.");
  }

  return {
    label: readOptionalLabel(record.label ?? record.name),
    privateKey: decodePrivateKey(privateKey),
  };
}

function decodePrivateKey(value: unknown): string | Uint8Array {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  if (Array.isArray(value)) {
    const bytes = new Uint8Array(value.length);

    for (let index = 0; index < value.length; index += 1) {
      const entry = value[index];

      if (
        typeof entry !== "number" ||
        !Number.isInteger(entry) ||
        entry < 0 ||
        entry > 255
      ) {
        throw new Error(`privateKey[${index}] must be a byte.`);
      }

      bytes[index] = entry;
    }

    return bytes;
  }

  throw new Error("privateKey must be a string or byte array.");
}

function readOptionalLabel(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

function readRequiredValue(value: string | undefined, flag: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${flag} expects a value.`);
  }

  return value.trim();
}

function readPositiveInt(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} expects a positive integer.`);
  }

  return parsed;
}

function readMode(value: string | undefined): SeedingDemoSubmissionMode {
  if (value === "simulate" || value === "live") {
    return value;
  }

  throw new Error('--mode must be either "simulate" or "live".');
}

function countAvailableSenders(
  senderAddresses: readonly string[],
  existingLedger: SeedingLedger,
): number {
  const usedSenderAddresses = new Set(
    existingLedger.rows.map((row) => row.senderAddress),
  );

  return senderAddresses.filter(
    (senderAddress) => !usedSenderAddresses.has(senderAddress),
  ).length;
}

function countNewRows(
  existingLedger: SeedingLedger,
  rows: readonly SeedingLedgerRow[],
): number {
  const existingByImageKey = new Set(
    existingLedger.rows.map((row) => row.imageKey),
  );

  return rows.filter((row) => !existingByImageKey.has(row.imageKey)).length;
}

function determineRowAction(
  row: SeedingLedgerRow,
): SeedingLedgerRowStatus | "submit_only" | "upload_and_submit" | "skip" {
  if (
    row.status === "submitted" ||
    row.status === "recovered" ||
    row.status === "failed"
  ) {
    return row.status;
  }

  if (row.blobId === null) {
    return "upload_and_submit";
  }

  if (row.txDigest === null) {
    return "submit_only";
  }

  return "skip";
}

async function simulateRows(input: {
  readonly byImageKey: ReadonlyMap<string, SeedingInputEntry>;
  readonly ledgerRows: readonly SeedingLedgerRow[];
  readonly limit: number | null;
  readonly preprocessSeedingImage: (
    entry: SeedingInputEntry,
  ) => Promise<SeedingPreprocessedImage>;
}): Promise<{
  readonly stoppedAfterLimit: boolean;
  readonly wouldProcessRows: number;
  readonly wouldSubmitRows: number;
  readonly wouldUploadRows: number;
}> {
  let wouldProcessRows = 0;
  let wouldSubmitRows = 0;
  let wouldUploadRows = 0;

  for (const row of input.ledgerRows) {
    const action = determineRowAction(row);

    if (
      action === "submitted" ||
      action === "recovered" ||
      action === "failed" ||
      action === "skip"
    ) {
      continue;
    }

    if (input.limit !== null && wouldProcessRows >= input.limit) {
      return {
        stoppedAfterLimit: true,
        wouldProcessRows,
        wouldSubmitRows,
        wouldUploadRows,
      };
    }

    const entry = input.byImageKey.get(row.imageKey);

    if (entry === undefined) {
      throw new Error(`Missing input entry for ledger row: ${row.imageKey}`);
    }

    if (action === "upload_and_submit") {
      await input.preprocessSeedingImage(entry);
      wouldUploadRows += 1;
    }

    wouldProcessRows += 1;
    wouldSubmitRows += 1;
  }

  return {
    stoppedAfterLimit: false,
    wouldProcessRows,
    wouldSubmitRows,
    wouldUploadRows,
  };
}

async function executeRows(input: {
  readonly byImageKey: ReadonlyMap<string, SeedingInputEntry>;
  readonly initialSnapshot: GeneratorSeedingSnapshot;
  readonly ledgerRows: SeedingLedgerRow[];
  readonly limit: number | null;
  readonly preprocessSeedingImage: (
    entry: SeedingInputEntry,
  ) => Promise<SeedingPreprocessedImage>;
  readonly putBlob: (
    bytes: Uint8Array,
    contentType?: string,
  ) => Promise<SeedingWalrusUploadResult>;
  readonly senderByAddress: ReadonlyMap<string, SeedingSender>;
  readonly submitPhotoForSender: (
    senderAddress: string,
    args: {
      readonly blobId: string;
      readonly unitId: string;
    },
  ) => Promise<ProgressAwareSubmissionResult>;
  readonly unitId: string;
  readonly uploadCandidates: SeedingUploadCandidate[];
  readonly writeLedger: () => Promise<void>;
}): Promise<{
  readonly latestSnapshot: GeneratorSeedingSnapshot;
  readonly processedRows: number;
  readonly stoppedAfterLimit: boolean;
  readonly submittedRows: number;
  readonly uploadedRows: number;
}> {
  let processedRows = 0;
  let submittedRows = 0;
  let uploadedRows = 0;
  let stoppedAfterLimit = false;
  let latestSnapshot = input.initialSnapshot;

  for (let index = 0; index < input.ledgerRows.length; index += 1) {
    const row = input.ledgerRows[index];
    const action = determineRowAction(row);

    if (
      action === "submitted" ||
      action === "recovered" ||
      action === "failed" ||
      action === "skip"
    ) {
      continue;
    }

    if (input.limit !== null && processedRows >= input.limit) {
      stoppedAfterLimit = true;
      break;
    }

    const entry = input.byImageKey.get(row.imageKey);

    if (entry === undefined) {
      throw new Error(`Missing input entry for ledger row: ${row.imageKey}`);
    }

    let nextRow = row;

    if (action === "upload_and_submit") {
      const preprocessed = await input.preprocessSeedingImage(entry);
      const uploaded = await input.putBlob(
        preprocessed.bytes,
        preprocessed.contentType,
      );

      input.uploadCandidates.push({
        imageKey: row.imageKey,
        blobId: uploaded.blobId,
      });
      validateUniqueSeedingBlobIds(input.uploadCandidates);

      nextRow = {
        ...nextRow,
        blobId: uploaded.blobId,
        aggregatorUrl: uploaded.aggregatorUrl,
        status: "uploaded",
        preprocessLog: preprocessed.log,
        failureReason: null,
      };
      input.ledgerRows[index] = nextRow;
      uploadedRows += 1;
      await input.writeLedger();
    }

    if (!input.senderByAddress.has(nextRow.senderAddress)) {
      throw new Error(`Missing sender config for ${nextRow.senderAddress}.`);
    }

    const submission = await input.submitPhotoForSender(nextRow.senderAddress, {
      blobId: nextRow.blobId ?? "",
      unitId: input.unitId,
    });

    if (submission.senderAddress !== nextRow.senderAddress) {
      throw new Error(
        `submit_photo returned ${submission.senderAddress} for ${nextRow.senderAddress}.`,
      );
    }

    latestSnapshot = submission.snapshot;
    nextRow = {
      ...nextRow,
      blobId: nextRow.blobId ?? null,
      senderAddress: submission.senderAddress,
      submissionNo: submission.submissionNo,
      status: "submitted",
      txDigest: submission.digest,
      observedSubmittedCount: submission.submittedCount,
      observedUnitStatus: submission.status,
      failureReason: null,
    };
    input.ledgerRows[index] = nextRow;
    processedRows += 1;
    submittedRows += 1;
    await input.writeLedger();
  }

  return {
    latestSnapshot,
    processedRows,
    stoppedAfterLimit,
    submittedRows,
    uploadedRows,
  };
}
