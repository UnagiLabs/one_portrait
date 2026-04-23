import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

type OpenverseResponse = {
  page_count: number;
  page: number;
  results: Array<{
    id: string;
    title: string;
    url: string;
    creator: string;
    license: string;
    license_version: string;
    foreign_landing_url: string;
    source: string;
  }>;
};

type DatasetEntry = {
  id: string;
  title: string;
  creator: string;
  source: string;
  sourcePage: string;
  downloadUrl: string;
  license: string;
  localFile: string;
  sizeBytes: number;
};

const datasetDir = path.resolve("assets/datasets/openverse-portrait-tiles");
const manifestPath = path.join(datasetDir, "manifest.json");
const targetCount = 1000;
const outputTileSize = 64;
const outputQuality = 70;
const downloadConcurrency = 10;
const searchPageSize = 20;
const queries = [
  "portrait person face",
  "headshot person",
  "athlete portrait",
  "man portrait",
  "woman portrait",
];

async function main() {
  await mkdir(datasetDir, { recursive: true });

  const existingFiles = await listDatasetFiles();
  const existingIds = new Set(
    existingFiles.map((filePath) => path.parse(filePath).name),
  );
  const candidates = new Map<
    string,
    {
      id: string;
      title: string;
      creator: string;
      source: string;
      sourcePage: string;
      downloadUrl: string;
      license: string;
    }
  >();

  for (const query of queries) {
    let page = 1;

    while (candidates.size < targetCount * 2) {
      const apiUrl = new URL("https://api.openverse.org/v1/images/");
      apiUrl.searchParams.set("q", query);
      apiUrl.searchParams.set("page_size", String(searchPageSize));
      apiUrl.searchParams.set("page", String(page));
      apiUrl.searchParams.set("license_type", "commercial");

      const response = await fetchJsonWithRetry<OpenverseResponse>(
        apiUrl.toString(),
      );

      for (const result of response.results) {
        const id = `openverse-${result.id}`;

        if (existingIds.has(id) || candidates.has(id) || !result.url) {
          continue;
        }

        candidates.set(id, {
          id,
          title: result.title,
          creator: result.creator,
          source: result.source,
          sourcePage: result.foreign_landing_url,
          downloadUrl: result.url,
          license:
            `${result.license}${result.license_version ? ` ${result.license_version}` : ""}`.trim(),
        });
      }

      if (page >= response.page_count || candidates.size >= targetCount * 2) {
        break;
      }

      page += 1;
      await wait(400);
    }
  }

  const queue = [...candidates.values()].slice(0, targetCount * 2);

  await mapWithConcurrency(queue, downloadConcurrency, async (candidate) => {
    if (existingIds.size >= targetCount) {
      return;
    }

    if (existingIds.has(candidate.id)) {
      return;
    }

    try {
      const remoteBuffer = await fetchBufferWithRetry(candidate.downloadUrl);
      const normalized = await sharp(remoteBuffer)
        .rotate()
        .resize(outputTileSize, outputTileSize, { fit: "cover" })
        .removeAlpha()
        .webp({ quality: outputQuality })
        .toBuffer();

      await writeFile(
        path.join(datasetDir, `${candidate.id}.webp`),
        normalized,
      );
      existingIds.add(candidate.id);
    } catch {
      return;
    }
  });

  const manifestEntries: DatasetEntry[] = [];
  const metadataById = new Map(
    queue.map((candidate) => [candidate.id, candidate]),
  );
  const localFiles = (await listDatasetFiles()).slice(0, targetCount);

  for (const filePath of localFiles) {
    const fileStat = await stat(filePath);
    const id = path.parse(filePath).name;
    const metadata = metadataById.get(id);

    manifestEntries.push({
      id,
      title: metadata?.title ?? id,
      creator: metadata?.creator ?? "unknown",
      source: metadata?.source ?? "openverse",
      sourcePage: metadata?.sourcePage ?? "",
      downloadUrl: metadata?.downloadUrl ?? "",
      license: metadata?.license ?? "",
      localFile: path.relative(datasetDir, filePath),
      sizeBytes: fileStat.size,
    });
  }

  const totalBytes = manifestEntries.reduce(
    (sum, entry) => sum + entry.sizeBytes,
    0,
  );

  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tileCount: manifestEntries.length,
        outputTileSize,
        outputFormat: "webp",
        outputQuality,
        totalBytes,
        queries,
        note: "Experiment-only portrait-heavy tile cache collected from Openverse commercial-use search results. Reusers should verify per-file attribution and license before publication.",
        entries: manifestEntries,
      },
      null,
      2,
    ),
  );

  console.log(
    `Stored ${manifestEntries.length} portrait-heavy free tiles in ${datasetDir}`,
  );
  console.log(`Approx dataset size: ${formatBytes(totalBytes)}`);
  console.log(`Manifest: ${manifestPath}`);
}

async function listDatasetFiles() {
  try {
    const entries = await readdir(datasetDir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".webp"))
      .map((entry) => path.join(datasetDir, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

async function fetchJsonWithRetry<T>(url: string, attempt = 1): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "one-portrait-openverse-tiles/0.1",
    },
  });

  if (response.ok) {
    return (await response.json()) as T;
  }

  if (attempt >= 5) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  await wait(attempt * 1000);
  return fetchJsonWithRetry(url, attempt + 1);
}

async function fetchBufferWithRetry(url: string, attempt = 1): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "one-portrait-openverse-tiles/0.1",
    },
  });

  if (response.ok) {
    return Buffer.from(await response.arrayBuffer());
  }

  if (attempt >= 3) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  await wait(attempt * 1200);
  return fetchBufferWithRetry(url, attempt + 1);
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const workers = new Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
      while (cursor < items.length) {
        const current = cursor;
        cursor += 1;
        await mapper(items[current]);
      }
    });

  await Promise.all(workers);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
