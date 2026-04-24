import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type {
  GeneratorSubmissionRef,
  GeneratorUnitSnapshot,
  MosaicRgb,
} from "@one-portrait/shared";
import {
  loadSeedingInputFromManifest,
  type SeedingInputEntry,
} from "./seeding-input";

export type PreparedSubmission = GeneratorSubmissionRef & {
  readonly averageColor: MosaicRgb;
  readonly imageBytes: Uint8Array;
  readonly isDummy?: boolean;
};

export type PreparedFinalizeInput = {
  readonly displayName: string;
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
  readonly loadBundledDemoTiles?: () => Promise<SeedingInputEntry[]>;
  readonly loadSeedingInputFromManifest?: (
    manifestPath: string,
  ) => Promise<SeedingInputEntry[]>;
  readonly readLocalFile?: (filePath: string) => Promise<Uint8Array>;
  readonly sampleAverageColor: AverageColorSampler;
  readonly walrus: WalrusReadClient;
};

type DisplayAwareFinalizeSnapshot = GeneratorUnitSnapshot & {
  readonly displayMaxSlots?: number;
};

const execFileAsync = promisify(execFile);
const generatorRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const bundledDemoTilesArchivePath = path.join(
  generatorRoot,
  "assets",
  "archives",
  "merged-generator-tiles.tar.gz",
);
const bundledDemoTilesCacheDir = path.join(
  os.tmpdir(),
  "one-portrait-bundled-demo-tiles",
);
const bundledDemoTilesExtractedDir = path.join(
  bundledDemoTilesCacheDir,
  "merged-generator-tiles",
);
const bundledDemoTilesReadyMarker = path.join(
  bundledDemoTilesCacheDir,
  ".ready",
);

export async function prepareFinalizeInput(
  snapshot: DisplayAwareFinalizeSnapshot,
  deps: PrepareFinalizeDeps,
): Promise<PreparedFinalizeInput> {
  const targetImageBytes = await deps.walrus.getBlob(
    snapshot.targetWalrusBlobId,
  );
  const submissions = sortSubmissions(snapshot.submissions);

  const preparedRealSubmissions = await Promise.all(
    submissions.map(async (submission) => {
      const imageBytes = await deps.walrus.getBlob(submission.walrusBlobId);
      const averageColor = await deps.sampleAverageColor(imageBytes);

      return {
        ...submission,
        averageColor,
        imageBytes,
        isDummy: false,
      } satisfies PreparedSubmission;
    }),
  );

  const preparedDummySubmissions = await loadPreparedDummySubmissions(
    snapshot,
    deps,
  );

  return {
    displayName: snapshot.displayName,
    submissions: [...preparedRealSubmissions, ...preparedDummySubmissions],
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

async function loadPreparedDummySubmissions(
  snapshot: GeneratorUnitSnapshot,
  deps: PrepareFinalizeDeps,
): Promise<PreparedSubmission[]> {
  const dummyCount = Math.max(
    0,
    snapshot.displayMaxSlots - snapshot.submissions.length,
  );
  if (dummyCount === 0) {
    return [];
  }

  const manifestEntries = await loadDummyManifestEntries(deps);

  if (manifestEntries.length < dummyCount) {
    throw new Error(
      `Demo finalize manifest only has ${manifestEntries.length} image(s), but ${dummyCount} are required.`,
    );
  }

  const readLocalFile = deps.readLocalFile ?? readFile;
  const selectedEntries = manifestEntries.slice(0, dummyCount);

  return Promise.all(
    selectedEntries.map(async (entry, index) => {
      const imageBytes = await readLocalFile(entry.filePath);
      const averageColor = await deps.sampleAverageColor(imageBytes);

      return {
        submissionNo: snapshot.submissions.length + index + 1,
        submitter: `0xdemo-dummy-${String(index + 1).padStart(4, "0")}`,
        submittedAtMs: 0,
        walrusBlobId: `demo-dummy:${entry.imageKey}`,
        averageColor,
        imageBytes,
        isDummy: true,
      } satisfies PreparedSubmission;
    }),
  );
}

async function loadDummyManifestEntries(
  deps: PrepareFinalizeDeps,
): Promise<SeedingInputEntry[]> {
  const manifestPath = deps.demoFinalizeManifestPath?.trim() ?? "";
  if (manifestPath.length > 0) {
    return (deps.loadSeedingInputFromManifest ?? loadSeedingInputFromManifest)(
      manifestPath,
    );
  }

  return (deps.loadBundledDemoTiles ?? loadBundledDemoTiles)();
}

export async function loadBundledDemoTiles(): Promise<SeedingInputEntry[]> {
  await ensureBundledDemoTilesExtracted();
  return loadImageEntriesFromDirectory(bundledDemoTilesExtractedDir);
}

async function ensureBundledDemoTilesExtracted(): Promise<void> {
  try {
    await access(bundledDemoTilesReadyMarker);
    return;
  } catch {
    // Fall through and rebuild the cache from the bundled archive.
  }

  await mkdir(bundledDemoTilesCacheDir, { recursive: true });
  await execFileAsync("tar", [
    "-xzf",
    bundledDemoTilesArchivePath,
    "-C",
    bundledDemoTilesCacheDir,
  ]);
  await writeFile(bundledDemoTilesReadyMarker, "ready\n");
}

async function loadImageEntriesFromDirectory(
  directoryPath: string,
): Promise<SeedingInputEntry[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directoryPath, entry.name))
    .filter(isSupportedImageFile)
    .sort(compareImagePaths)
    .map((filePath) => ({
      imageKey: path.basename(filePath),
      filePath,
    }));
}

function isSupportedImageFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return (
    extension === ".png" ||
    extension === ".jpg" ||
    extension === ".jpeg" ||
    extension === ".webp"
  );
}

function compareImagePaths(left: string, right: string): number {
  return path.basename(left).localeCompare(path.basename(right), undefined, {
    numeric: true,
  });
}
