import type {
  GeneratorSubmissionRef,
  GeneratorUnitSnapshot,
  MosaicRgb,
} from "@one-portrait/shared";
import { readFile } from "node:fs/promises";

import {
  loadSeedingInputFromManifest,
  type SeedingInputEntry,
} from "./seeding-input";

export type PreparedSubmission = GeneratorSubmissionRef & {
  readonly averageColor: MosaicRgb;
  readonly imageBytes: Uint8Array;
};

export type PreparedFinalizeInput = {
  readonly athleteId: number;
  readonly finalizeWalrusBlobIds: readonly string[];
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
  readonly demoFinalizeManifestPath?: string | null;
  readonly loadDemoManifestEntries?: (
    manifestPath: string,
  ) => Promise<readonly SeedingInputEntry[]>;
  readonly readDemoFile?: (filePath: string) => Promise<Uint8Array>;
  readonly sampleAverageColor: AverageColorSampler;
  readonly walrus: WalrusReadClient;
};

export async function prepareFinalizeInput(
  snapshot: GeneratorUnitSnapshot,
  deps: PrepareFinalizeDeps,
): Promise<PreparedFinalizeInput> {
  const actualSubmissions = sortSubmissions(snapshot.submissions);
  const targetImageBytes = await deps.walrus.getBlob(
    snapshot.targetWalrusBlobId,
  );

  const preparedActualSubmissions = await Promise.all(
    actualSubmissions.map(async (submission) => {
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
    finalizeWalrusBlobIds: preparedActualSubmissions.map(
      (submission) => submission.walrusBlobId,
    ),
    submissions: isDemoUnit(snapshot)
      ? await loadDemoPreparedSubmissions(snapshot, deps, preparedActualSubmissions)
      : preparedActualSubmissions,
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

function isDemoUnit(
  snapshot: Pick<GeneratorUnitSnapshot, "displayMaxSlots" | "maxSlots">,
): boolean {
  return snapshot.displayMaxSlots > snapshot.maxSlots;
}

async function loadDemoPreparedSubmissions(
  snapshot: GeneratorUnitSnapshot,
  deps: PrepareFinalizeDeps,
  actualSubmissions: readonly PreparedSubmission[],
): Promise<PreparedSubmission[]> {
  const manifestPath = deps.demoFinalizeManifestPath?.trim() ?? "";

  if (manifestPath.length === 0) {
    throw new Error(
      "Demo unit finalize requires OP_DEMO_FINALIZE_MANIFEST to be configured.",
    );
  }

  const loadEntries = deps.loadDemoManifestEntries ?? loadSeedingInputFromManifest;
  const readDemoFile = deps.readDemoFile ?? readFile;
  const requiredMockCount = snapshot.displayMaxSlots - actualSubmissions.length;

  if (requiredMockCount <= 0) {
    return [...actualSubmissions];
  }

  const manifestEntries = sortManifestEntries(await loadEntries(manifestPath));

  if (manifestEntries.length < requiredMockCount) {
    throw new Error(
      `Demo finalize manifest only has ${manifestEntries.length} image(s); ` +
        `need ${requiredMockCount} mock tile(s).`,
    );
  }

  const mockSubmissions = await Promise.all(
    manifestEntries.slice(0, requiredMockCount).map(async (entry, index) => {
      const imageBytes = await readDemoFile(entry.filePath);
      const averageColor = await deps.sampleAverageColor(imageBytes);

      return {
        submissionNo: snapshot.maxSlots + index + 1,
        submitter: DEMO_MOCK_SUBMITTER,
        submittedAtMs: 0,
        walrusBlobId: `demo-mock:${entry.imageKey}`,
        averageColor,
        imageBytes: asUint8Array(imageBytes),
      } satisfies PreparedSubmission;
    }),
  );

  return [...mockSubmissions, ...actualSubmissions];
}

function sortManifestEntries(
  entries: readonly SeedingInputEntry[],
): SeedingInputEntry[] {
  return [...entries].sort((left, right) => {
    if (left.imageKey !== right.imageKey) {
      return left.imageKey.localeCompare(right.imageKey);
    }

    return left.filePath.localeCompare(right.filePath);
  });
}

function asUint8Array(value: Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

const DEMO_MOCK_SUBMITTER =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
