import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateMosaic } from "../src";

type CliOptions = {
  target: string;
  tilesDir: string;
  out: string;
  cols: number;
  rows: number;
  tileSize: number;
  colorMix: number;
  overlayOpacity: number;
  overlayBlur: number;
};

const defaultOptions: CliOptions = {
  target: "",
  tilesDir: "",
  out: "artifacts/rendered-mosaic.png",
  cols: 20,
  rows: 25,
  tileSize: 64,
  colorMix: 0.26,
  overlayOpacity: 0.12,
  overlayBlur: 8,
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const requiredTileCount = options.cols * options.rows;

  if (!options.target || !options.tilesDir) {
    throw new Error(
      "Usage: pnpm --filter generator render:mosaic -- --target <image> --tiles-dir <dir> [--cols 12 --rows 15 --out output.png]",
    );
  }

  const targetImage = await readFile(path.resolve(options.target));
  const tilePaths = await listTileFiles(path.resolve(options.tilesDir));

  if (tilePaths.length < requiredTileCount) {
    throw new Error(
      `Need at least ${requiredTileCount} tiles in ${options.tilesDir}, found ${tilePaths.length}.`,
    );
  }

  const selectedTilePaths = tilePaths.slice(0, requiredTileCount);
  const tiles = await Promise.all(
    selectedTilePaths.map(async (tilePath) => ({
      id: path.basename(tilePath),
      image: await readFile(tilePath),
    })),
  );

  const result = await generateMosaic({
    targetImage,
    tiles,
    grid: { cols: options.cols, rows: options.rows },
    tileSize: options.tileSize,
    colorMix: options.colorMix,
    overlayOpacity: options.overlayOpacity,
    overlayBlur: options.overlayBlur,
  });

  const outputPath = path.resolve(options.out);
  const manifestPath = replaceExtension(outputPath, ".placements.json");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.image);
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        target: path.resolve(options.target),
        tilesDir: path.resolve(options.tilesDir),
        tileCount: requiredTileCount,
        width: result.width,
        height: result.height,
        metrics: result.metrics,
        placements: result.placements,
      },
      null,
      2,
    ),
  );

  console.log(`Wrote mosaic to ${outputPath}`);
  console.log(`Wrote placement manifest to ${manifestPath}`);
  console.log(
    `Average deltaE ${result.metrics.averageDeltaE}, max deltaE ${result.metrics.maxDeltaE}`,
  );
}

function parseArgs(args: string[]) {
  const options = { ...defaultOptions };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (!arg.startsWith("--")) {
      continue;
    }

    switch (arg) {
      case "--target":
        options.target = next ?? "";
        index += 1;
        break;
      case "--tiles-dir":
        options.tilesDir = next ?? "";
        index += 1;
        break;
      case "--out":
        options.out = next ?? defaultOptions.out;
        index += 1;
        break;
      case "--cols":
        options.cols = parsePositiveInt(next, "--cols");
        index += 1;
        break;
      case "--rows":
        options.rows = parsePositiveInt(next, "--rows");
        index += 1;
        break;
      case "--tile-size":
        options.tileSize = parsePositiveInt(next, "--tile-size");
        index += 1;
        break;
      case "--color-mix":
        options.colorMix = parseUnitFloat(next, "--color-mix");
        index += 1;
        break;
      case "--overlay-opacity":
        options.overlayOpacity = parseUnitFloat(next, "--overlay-opacity");
        index += 1;
        break;
      case "--overlay-blur":
        options.overlayBlur = parsePositiveInt(next, "--overlay-blur");
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function listTileFiles(tilesDir: string) {
  const entries = await readdir(tilesDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(tilesDir, entry.name))
    .filter((entryPath) => /\.(png|jpe?g|webp)$/i.test(entryPath))
    .sort((left, right) => left.localeCompare(right));
}

function parsePositiveInt(value: string | undefined, flag: string) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} expects a positive integer.`);
  }

  return parsed;
}

function parseUnitFloat(value: string | undefined, flag: string) {
  const parsed = Number.parseFloat(value ?? "");

  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${flag} expects a value between 0 and 1.`);
  }

  return parsed;
}

function replaceExtension(filePath: string, nextExtension: string) {
  return filePath.replace(/\.[^.]+$/, nextExtension);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
