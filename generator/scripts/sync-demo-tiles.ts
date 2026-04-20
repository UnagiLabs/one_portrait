import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

type PicsumListItem = {
  id: string;
  author: string;
  download_url: string;
  url: string;
};

type CommonsRandomApiResponse = {
  query?: {
    pages?: Record<
      string,
      {
        pageid: number;
        title: string;
        imageinfo?: Array<{
          descriptionurl?: string;
          thumburl?: string;
          url?: string;
          mime?: string;
        }>;
      }
    >;
  };
};

type DatasetEntry = {
  id: string;
  author: string;
  sourcePage: string;
  downloadUrl: string;
  localFile: string;
  sizeBytes: number;
};

const datasetDir = path.resolve("assets/demo-tiles");
const manifestPath = path.join(datasetDir, "manifest.json");
const targetCount = 1000;
const sourceTileSize = 96;
const outputTileSize = 64;
const outputQuality = 68;
const fetchConcurrency = 20;
const fixedFallbackUrls = [
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/Man%20looking%20out%20%28Unsplash%29.jpg",
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/Man%20writing%20on%20paper%20%28Unsplash%29.jpg",
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/Posing%20for%20a%20portrait%20%28Unsplash%29.jpg",
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/Fashionable%20Woman%20%28Unsplash%29.jpg",
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/A%20%28Unsplash%29.jpg",
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/Woman%20silhouette%20%28Unsplash%29.jpg",
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/Isolation%20%28Unsplash%29.jpg",
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/Praying%20woman%20in%20a%20park%20%28Unsplash%29.jpg",
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/Woman%20looking%20up%20%28Unsplash%29.jpg",
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/Elegant%20woman%20by%20storefront%20%28Unsplash%29.jpg",
];

async function main() {
  await mkdir(datasetDir, { recursive: true });
  const existingFiles = await listDatasetFiles();

  if (existingFiles.length > targetCount) {
    for (const filePath of existingFiles.slice(targetCount)) {
      await rm(filePath);
    }
  }

  const existingIds = new Set(
    (await listDatasetFiles()).map((filePath) => path.parse(filePath).name),
  );
  let page = 1;
  const manifestEntries: DatasetEntry[] = [];

  while (existingIds.size < targetCount) {
    const list = await fetchJson<PicsumListItem[]>(
      `https://picsum.photos/v2/list?page=${page}&limit=100`,
    );

    if (list.length === 0) {
      break;
    }

    const batch = list.filter((item) => !existingIds.has(item.id));

    await mapWithConcurrency(batch, fetchConcurrency, async (item) => {
      if (existingIds.size >= targetCount) {
        return;
      }

      const localFile = path.join(datasetDir, `${item.id}.webp`);
      const remoteBuffer = await fetchBuffer(
        `https://picsum.photos/id/${item.id}/${sourceTileSize}/${sourceTileSize}.jpg`,
      );
      const normalized = await sharp(remoteBuffer)
        .rotate()
        .resize(outputTileSize, outputTileSize, { fit: "cover" })
        .removeAlpha()
        .webp({ quality: outputQuality })
        .toBuffer();

      await writeFile(localFile, normalized);
      existingIds.add(item.id);
    });

    page += 1;
  }

  if (existingIds.size < targetCount) {
    await backfillFromCommons(existingIds);
  }

  if (existingIds.size < targetCount) {
    await backfillFromFixedUrls(existingIds);
  }

  const localFiles = await listDatasetFiles();
  const selectedFiles = localFiles.slice(0, targetCount);
  const metadataById = new Map<string, PicsumListItem>();
  let metadataPage = 1;

  while (metadataById.size < selectedFiles.length) {
    const list = await fetchJson<PicsumListItem[]>(
      `https://picsum.photos/v2/list?page=${metadataPage}&limit=100`,
    );

    if (list.length === 0) {
      break;
    }

    for (const item of list) {
      if (selectedFiles.some((filePath) => path.parse(filePath).name === item.id)) {
        metadataById.set(item.id, item);
      }
    }

    metadataPage += 1;
  }

  for (const filePath of selectedFiles) {
    const fileStat = await stat(filePath);
    const id = path.parse(filePath).name;
    const source = metadataById.get(id);

    manifestEntries.push({
      id,
      author: source?.author ?? "unknown",
      sourcePage: source?.url ?? "",
      downloadUrl: source?.download_url ?? "",
      localFile: path.relative(datasetDir, filePath),
      sizeBytes: fileStat.size,
    });
  }

  const totalBytes = manifestEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

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
        note: "Experiment/demo-only lightweight tile cache normalized from picsum.photos source images.",
        entries: manifestEntries,
      },
      null,
      2,
    ),
  );

  console.log(`Stored ${manifestEntries.length} tiles in ${datasetDir}`);
  console.log(`Approx dataset size: ${formatBytes(totalBytes)}`);
  console.log(`Manifest: ${manifestPath}`);
}

async function listDatasetFiles() {
  const entries = await readdir(datasetDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".webp"))
    .map((entry) => path.join(datasetDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function backfillFromCommons(existingIds: Set<string>) {
  let stagnantRounds = 0;

  while (existingIds.size < targetCount && stagnantRounds < 8) {
    const before = existingIds.size;
    const response = await fetchJson<CommonsRandomApiResponse>(
      "https://commons.wikimedia.org/w/api.php?action=query&generator=random&grnnamespace=6&grnlimit=20&prop=imageinfo&iiprop=url&iiurlwidth=128&format=json&origin=*",
    );
    const pages = Object.values(response.query?.pages ?? {});

    if (pages.length === 0) {
      break;
    }

    for (const page of pages) {
      if (existingIds.size >= targetCount) {
        return;
      }

      const info = page.imageinfo?.[0];

      if (!info?.thumburl) {
        continue;
      }

      const id = `commons-${page.pageid}`;

      if (existingIds.has(id)) {
        continue;
      }

      try {
        const remoteBuffer = await fetchBuffer(info.thumburl);
        const normalized = await sharp(remoteBuffer)
          .rotate()
          .resize(outputTileSize, outputTileSize, { fit: "cover" })
          .removeAlpha()
          .webp({ quality: outputQuality })
          .toBuffer();

        await writeFile(path.join(datasetDir, `${id}.webp`), normalized);
        existingIds.add(id);
      } catch {
        continue;
      }
    }

    stagnantRounds = existingIds.size === before ? stagnantRounds + 1 : 0;
  }
}

async function backfillFromFixedUrls(existingIds: Set<string>) {
  for (let index = 0; index < fixedFallbackUrls.length; index += 1) {
    if (existingIds.size >= targetCount) {
      return;
    }

    const id = `fallback-${index + 1}`;

    if (existingIds.has(id)) {
      continue;
    }

    try {
      const remoteBuffer = await fetchBuffer(fixedFallbackUrls[index]);
      const normalized = await sharp(remoteBuffer)
        .rotate()
        .resize(outputTileSize, outputTileSize, { fit: "cover" })
        .removeAlpha()
        .webp({ quality: outputQuality })
        .toBuffer();

      await writeFile(path.join(datasetDir, `${id}.webp`), normalized);
      existingIds.add(id);
    } catch {
      continue;
    }
  }
}

async function fetchJson<T>(url: string) {
  const response = await fetchWithRetry(url);
  return (await response.json()) as T;
}

async function fetchBuffer(url: string) {
  const response = await fetchWithRetry(url);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "one-portrait-demo-tiles/0.1",
    },
  });

  if (response.ok) {
    return response;
  }

  if (attempt >= 3) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  await wait(attempt * 400);
  return fetchWithRetry(url, attempt + 1);
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
