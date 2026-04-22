import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type SeedingInputEntry = {
  readonly imageKey: string;
  readonly filePath: string;
};

type SeedingInputManifestEntry = {
  readonly filePath?: string;
  readonly imageKey?: string;
  readonly id?: string;
  readonly localFile?: string;
  readonly path?: string;
};

type SeedingInputManifest = {
  readonly entries?: readonly SeedingInputManifestEntry[] | readonly string[];
};

const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function loadSeedingInputFromDirectory(
  directoryPath: string,
): Promise<SeedingInputEntry[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.resolve(directoryPath, entry.name))
    .filter((filePath) => isSupportedImageFile(filePath))
    .sort(compareStrings)
    .map((filePath) => ({
      imageKey: pathToPosix(path.relative(directoryPath, filePath)),
      filePath,
    }));
}

export async function loadSeedingInputFromManifest(
  manifestPath: string,
): Promise<SeedingInputEntry[]> {
  const raw = await readFile(manifestPath, "utf8");
  const value: unknown = JSON.parse(raw);
  const manifestDir = path.dirname(path.resolve(manifestPath));
  const entries = normalizeManifestEntries(value, manifestDir);

  return entries.sort((left, right) => {
    const keyComparison = compareStrings(left.imageKey, right.imageKey);

    if (keyComparison !== 0) {
      return keyComparison;
    }

    return compareStrings(left.filePath, right.filePath);
  });
}

function normalizeManifestEntries(
  value: unknown,
  manifestDir: string,
): SeedingInputEntry[] {
  const entries = readManifestEntries(value);

  return entries.map((entry) => normalizeManifestEntry(entry, manifestDir));
}

function readManifestEntries(
  value: unknown,
): readonly SeedingInputManifestEntry[] | readonly string[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "object" || value === null) {
    throw new Error("Seeding manifest JSON must be an object or an array.");
  }

  const manifest = value as SeedingInputManifest;
  const entries = manifest.entries;

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries;
}

function normalizeManifestEntry(
  entry: SeedingInputManifestEntry | string,
  manifestDir: string,
): SeedingInputEntry {
  if (typeof entry === "string") {
    const filePath = path.resolve(manifestDir, entry);

    return {
      imageKey: pathToPosix(path.relative(manifestDir, filePath)),
      filePath,
    };
  }

  const rawFilePath =
    entry.filePath ?? entry.localFile ?? entry.path ?? entry.id ?? "";

  if (rawFilePath.length === 0) {
    throw new Error("Seeding manifest entries require a filePath.");
  }

  const filePath = path.resolve(manifestDir, rawFilePath);

  return {
    imageKey: entry.imageKey ?? fallbackImageKey(filePath, manifestDir),
    filePath,
  };
}

function isSupportedImageFile(filePath: string): boolean {
  return supportedImageExtensions.has(path.extname(filePath).toLowerCase());
}

function pathToPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function fallbackImageKey(filePath: string, manifestDir: string): string {
  const relativePath = pathToPosix(path.relative(manifestDir, filePath));

  return relativePath.length > 0 ? relativePath : path.basename(filePath);
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
