import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { generateMosaic, type MosaicTileInput } from "../src";

type GridOption = {
  cols: number;
  rows: number;
};

type DatasetManifest = {
  tileCount: number;
  totalBytes: number;
  entries: {
    id: string;
    author: string;
    localFile: string;
    sizeBytes: number;
  }[];
};

const datasetDir = path.resolve("assets/demo-tiles");
const manifestPath = path.join(datasetDir, "manifest.json");
const outputRoot = path.resolve("artifacts/improved-mosaic-experiment");
const targetCacheDir = path.join(outputRoot, "target-cache");
const renderTileSize = 40;
const previewWidth = 240;
const previewHeight = 300;

const gridOptions: GridOption[] = [
  { cols: 14, rows: 18 },
  { cols: 16, rows: 20 },
  { cols: 18, rows: 23 },
  { cols: 20, rows: 25 },
  { cols: 22, rows: 28 },
  { cols: 24, rows: 30 },
  { cols: 26, rows: 33 },
  { cols: 28, rows: 35 },
  { cols: 25, rows: 40 },
  { cols: 40, rows: 50 },
];

const targets = [
  {
    slug: "portrait-woman",
    label: "Portrait (Unsplash)",
    sourcePage:
      "https://commons.wikimedia.org/wiki/File%3APortrait_%28Unsplash%29.jpg",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/7/74/Portrait_%28Unsplash%29.jpg",
  },
  {
    slug: "face-portrait-man",
    label: "Face portrait (Unsplash)",
    sourcePage:
      "https://commons.wikimedia.org/wiki/File%3AFace_portrait_%28Unsplash%29.jpg",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/0/04/Face_portrait_%28Unsplash%29.jpg",
  },
  {
    slug: "close-up-woman",
    label: "Close-up of woman's face (Unsplash)",
    sourcePage:
      "https://commons.wikimedia.org/wiki/File%3AClose-up_of_woman%27s_face_%28Unsplash%29.jpg",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/3/3a/Close-up_of_woman%27s_face_%28Unsplash%29.jpg",
  },
];

async function main() {
  await mkdir(outputRoot, { recursive: true });
  await mkdir(targetCacheDir, { recursive: true });

  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as DatasetManifest;

  if (manifest.tileCount < 1000) {
    throw new Error(
      `Dataset only has ${manifest.tileCount} tiles. Run pnpm --filter generator sync:demo-tiles first.`,
    );
  }

  const tiles = await loadTiles(manifest);
  const summary = {
    generatedAt: new Date().toISOString(),
    datasetTileCount: manifest.tileCount,
    datasetTotalBytes: manifest.totalBytes,
    renderTileSize,
    targets: [] as Array<Record<string, unknown>>,
  };

  for (const target of targets) {
    console.log(`Evaluating improved mosaic counts for ${target.label}...`);
    const targetImage = await fetchTargetImage(target.slug, target.imageUrl);
    const results = [];

    for (const grid of gridOptions) {
      const count = grid.cols * grid.rows;
      const selectedTiles = tiles.slice(0, count);
      const result = await buildExperimentResult({
        target,
        targetImage,
        tiles: selectedTiles,
        grid,
      });

      results.push(result);
    }

    await buildContactSheet(target.slug, results);

    summary.targets.push({
      ...target,
      results,
    });
  }

  const recommendation = summarizeRecommendation(
    summary.targets as Array<{
      results: Array<{
        count: number;
        grid: string;
        recognizabilityScore: number;
        macroMae: number;
        averageDeltaE: number;
      }>;
    }>,
  );

  const output = {
    ...summary,
    recommendation,
  };

  await writeFile(
    path.join(outputRoot, "summary.json"),
    JSON.stringify(output, null, 2),
  );

  console.log("");
  console.log(
    `Recommended count: ${recommendation.recommendedCount} (${recommendation.recommendedGrid})`,
  );
  console.log(
    `Minimum plausible: ${recommendation.minimumPlausibleCount} (${recommendation.minimumPlausibleGrid})`,
  );
  console.log(`Artifacts written to ${outputRoot}`);
}

async function loadTiles(manifest: DatasetManifest) {
  const permutation = seededPermutation(manifest.entries.length, 20260420);

  return Promise.all(
    permutation.map(async (index) => {
      const entry = manifest.entries[index];

      return {
        id: entry.id,
        image: await readFile(path.join(datasetDir, entry.localFile)),
      } satisfies MosaicTileInput;
    }),
  );
}

async function buildExperimentResult(input: {
  target: { slug: string; label: string };
  targetImage: Buffer;
  tiles: MosaicTileInput[];
  grid: GridOption;
}) {
  const count = input.grid.cols * input.grid.rows;
  const result = await generateMosaic({
    targetImage: input.targetImage,
    tiles: input.tiles,
    grid: input.grid,
    tileSize: renderTileSize,
    colorMix: 0.3,
    overlayOpacity: 0.14,
    overlayBlur: 8,
  });
  const filename = `${input.target.slug}-${input.grid.cols}x${input.grid.rows}-${count}.png`;
  const outputPath = path.join(outputRoot, filename);

  await writeFile(outputPath, result.image);

  const targetComparable = await sharp(input.targetImage)
    .rotate()
    .resize(result.width, result.height, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const mosaicComparable = await sharp(result.image)
    .removeAlpha()
    .raw()
    .toBuffer();
  const targetPreview = await sharp(input.targetImage)
    .rotate()
    .resize(previewWidth, previewHeight, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const mosaicPreview = await sharp(result.image)
    .resize(previewWidth, previewHeight, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const previewMae = computeMeanAbsoluteError(
    targetComparable,
    mosaicComparable,
  );
  const macroMae = computeMeanAbsoluteError(targetPreview, mosaicPreview);

  return {
    count,
    grid: `${input.grid.cols}x${input.grid.rows}`,
    file: filename,
    averageDeltaE: result.metrics.averageDeltaE,
    maxDeltaE: result.metrics.maxDeltaE,
    previewMae: Number(previewMae.toFixed(2)),
    macroMae: Number(macroMae.toFixed(2)),
    recognizabilityScore: Number(((1 - macroMae / 255) * 100).toFixed(2)),
  };
}

async function buildContactSheet(
  slug: string,
  results: Array<{
    count: number;
    grid: string;
    file: string;
    recognizabilityScore: number;
    averageDeltaE: number;
  }>,
) {
  const columns = 3;
  const padding = 20;
  const cardWidth = 240;
  const labelHeight = 52;
  const rows = Math.ceil(results.length / columns);
  const width = padding * (columns + 1) + cardWidth * columns;
  const height = padding * (rows + 1) + rows * (cardWidth + labelHeight);
  const composites = [];

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = padding + column * (cardWidth + padding);
    const top = padding + row * (cardWidth + labelHeight + padding);
    const image = await sharp(path.join(outputRoot, result.file))
      .resize(cardWidth, cardWidth, { fit: "contain", background: "#0b1320" })
      .png()
      .toBuffer();

    composites.push({ input: image, left, top });
    composites.push({
      input: Buffer.from(renderLabelSvg(cardWidth, labelHeight, result)),
      left,
      top: top + cardWidth,
    });
  }

  const sheet = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#08101a",
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  await writeFile(path.join(outputRoot, `${slug}-contact-sheet.png`), sheet);
}

function renderLabelSvg(
  width: number,
  height: number,
  result: {
    count: number;
    grid: string;
    recognizabilityScore: number;
    averageDeltaE: number;
  },
) {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#08101a"/>
      <text x="14" y="20" fill="#f8fafc" font-size="15" font-family="Arial, sans-serif">
        ${result.count} photos (${result.grid})
      </text>
      <text x="14" y="39" fill="#93c5fd" font-size="12" font-family="Arial, sans-serif">
        score ${result.recognizabilityScore} / dE ${result.averageDeltaE}
      </text>
    </svg>
  `;
}

function summarizeRecommendation(
  targetsWithResults: Array<{
    results: Array<{
      count: number;
      grid: string;
      recognizabilityScore: number;
      macroMae: number;
      averageDeltaE: number;
    }>;
  }>,
) {
  const buckets = new Map<
    number,
    {
      count: number;
      grid: string;
      recognizability: number;
      macroMae: number;
      deltaE: number;
      samples: number;
    }
  >();

  for (const target of targetsWithResults) {
    for (const result of target.results) {
      const bucket = buckets.get(result.count) ?? {
        count: result.count,
        grid: result.grid,
        recognizability: 0,
        macroMae: 0,
        deltaE: 0,
        samples: 0,
      };

      bucket.recognizability += result.recognizabilityScore;
      bucket.macroMae += result.macroMae;
      bucket.deltaE += result.averageDeltaE;
      bucket.samples += 1;

      buckets.set(result.count, bucket);
    }
  }

  const ranked = [...buckets.values()]
    .map((bucket) => ({
      count: bucket.count,
      grid: bucket.grid,
      avgRecognizabilityScore: bucket.recognizability / bucket.samples,
      avgMacroMae: bucket.macroMae / bucket.samples,
      avgDeltaE: bucket.deltaE / bucket.samples,
    }))
    .sort((left, right) => left.count - right.count);

  const bestScore = Math.max(
    ...ranked.map((item) => item.avgRecognizabilityScore),
  );
  const bestDelta = Math.min(...ranked.map((item) => item.avgDeltaE));
  const recommended =
    ranked.find(
      (item) =>
        item.avgRecognizabilityScore >= bestScore * 0.985 &&
        item.avgDeltaE <= bestDelta * 1.08,
    ) ?? ranked[ranked.length - 1];
  const plausible =
    ranked.find(
      (item) =>
        item.avgRecognizabilityScore >= bestScore * 0.975 &&
        item.avgDeltaE <= bestDelta * 1.12,
    ) ?? recommended;

  return {
    minimumPlausibleCount: plausible.count,
    minimumPlausibleGrid: plausible.grid,
    recommendedCount: recommended.count,
    recommendedGrid: recommended.grid,
    rankedCounts: ranked.map((item) => ({
      count: item.count,
      grid: item.grid,
      avgRecognizabilityScore: Number(item.avgRecognizabilityScore.toFixed(2)),
      avgMacroMae: Number(item.avgMacroMae.toFixed(2)),
      avgDeltaE: Number(item.avgDeltaE.toFixed(2)),
    })),
    reason:
      "Recommended count is the smallest grid keeping at least 98.5% of the best average recognizability score while staying within 8% of the best average tile color error. Minimum plausible uses 97.5% / 12%.",
  };
}

function computeMeanAbsoluteError(left: Buffer, right: Buffer) {
  if (left.length !== right.length) {
    throw new Error("Buffers must match for MAE computation.");
  }

  let total = 0;

  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs(left[index] - right[index]);
  }

  return total / left.length;
}

function seededPermutation(length: number, seed: number) {
  const values = Array.from({ length }, (_, index) => index);
  let state = seed >>> 0;

  for (let index = values.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }

  return values;
}

async function fetchTargetImage(slug: string, url: string) {
  const cachePath = path.join(targetCacheDir, `${slug}.jpg`);

  try {
    return await readFile(cachePath);
  } catch {
    const buffer = await fetchBufferWithRetry(url);
    await writeFile(cachePath, buffer);
    return buffer;
  }
}

async function fetchBufferWithRetry(url: string, attempt = 1): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "one-portrait-improved-experiment/0.1",
    },
  });

  if (response.ok) {
    return Buffer.from(await response.arrayBuffer());
  }

  if (attempt >= 5) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  await wait(attempt * 800);
  return fetchBufferWithRetry(url, attempt + 1);
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
