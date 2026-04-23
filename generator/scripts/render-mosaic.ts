import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { unitTileGrid } from "@one-portrait/shared";

import { generateMosaic } from "../src";
import type { TargetAnalysis } from "../src";

const execFile = promisify(execFileCallback);

type CliOptions = {
  target: string;
  tilesDirs: string[];
  out: string;
  cols: number;
  rows: number;
  tileSize: number;
  colorMix: number;
  overlayOpacity: number;
  overlayBlur: number;
  subjectPriority: number;
  facePriority: number;
  backgroundPriority: number;
  analysisJson?: string;
  autoAnalyze: boolean;
  analysisDebugPreview?: string;
  pythonBin: string;
  tileShuffleSeed?: number;
};

const defaultOptions: CliOptions = {
  target: "",
  tilesDirs: [],
  out: "artifacts/rendered-mosaic.png",
  cols: unitTileGrid.cols,
  rows: unitTileGrid.rows,
  tileSize: 64,
  colorMix: 0.26,
  overlayOpacity: 0.12,
  overlayBlur: 8,
  subjectPriority: 0.7,
  facePriority: 0.22,
  backgroundPriority: 0.06,
  analysisJson: undefined,
  autoAnalyze: false,
  analysisDebugPreview: undefined,
  pythonBin: resolveDefaultPythonBin(),
  tileShuffleSeed: undefined,
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const requiredTileCount = options.cols * options.rows;

  if (!options.target || options.tilesDirs.length === 0) {
    throw new Error(
      "Usage: pnpm --filter generator render:mosaic -- --target <image> --tiles-dir <dir> [--tiles-dir <dir2>] [--cols 12 --rows 15 --out output.png]",
    );
  }

  const targetImage = await readFile(path.resolve(options.target));
  const analysisPath = options.autoAnalyze
    ? path.resolve(
        options.analysisJson ?? replaceExtension(path.resolve(options.out), ".analysis.json"),
      )
    : options.analysisJson
      ? path.resolve(options.analysisJson)
      : undefined;

  if (options.autoAnalyze && analysisPath) {
    await runTargetAnalysis({
      pythonBin: options.pythonBin,
      target: path.resolve(options.target),
      out: analysisPath,
      cols: options.cols,
      rows: options.rows,
      debugPreview: options.analysisDebugPreview
        ? path.resolve(options.analysisDebugPreview)
        : undefined,
    });
  }

  const targetAnalysis = analysisPath
    ? (JSON.parse(await readFile(analysisPath, "utf8")) as TargetAnalysis)
    : undefined;
  const tilePaths = await listTileFiles(options.tilesDirs.map((dir) => path.resolve(dir)));
  const orderedTilePaths =
    options.tileShuffleSeed === undefined
      ? tilePaths
      : seededShuffle(tilePaths, options.tileShuffleSeed);

  if (orderedTilePaths.length < requiredTileCount) {
    throw new Error(
      `Need at least ${requiredTileCount} tiles across ${options.tilesDirs.join(", ")}, found ${orderedTilePaths.length}.`,
    );
  }

  const selectedTilePaths = orderedTilePaths.slice(0, requiredTileCount);
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
    subjectPriority: options.subjectPriority,
    facePriority: options.facePriority,
    backgroundPriority: options.backgroundPriority,
    targetAnalysis,
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
        tilesDirs: options.tilesDirs.map((dir) => path.resolve(dir)),
        analysisJson: analysisPath,
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

    if (arg === "--") {
      continue;
    }

    if (!arg.startsWith("--")) {
      continue;
    }

    switch (arg) {
      case "--target":
        options.target = next ?? "";
        index += 1;
        break;
      case "--tiles-dir":
        if (next) {
          options.tilesDirs.push(next);
        }
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
      case "--subject-priority":
        options.subjectPriority = parseUnitFloat(next, "--subject-priority");
        index += 1;
        break;
      case "--face-priority":
        options.facePriority = parseUnitFloat(next, "--face-priority");
        index += 1;
        break;
      case "--background-priority":
        options.backgroundPriority = parseUnitFloat(next, "--background-priority");
        index += 1;
        break;
      case "--analysis-json":
        options.analysisJson = next ?? "";
        index += 1;
        break;
      case "--analysis-debug-preview":
        options.analysisDebugPreview = next ?? "";
        index += 1;
        break;
      case "--auto-analyze":
        options.autoAnalyze = true;
        break;
      case "--python-bin":
        options.pythonBin = next ?? defaultOptions.pythonBin;
        index += 1;
        break;
      case "--tile-shuffle-seed":
        options.tileShuffleSeed = parsePositiveInt(next, "--tile-shuffle-seed");
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function listTileFiles(tilesDirs: string[]) {
  const fileGroups = await Promise.all(
    tilesDirs.map(async (tilesDir) => {
      const entries = await readdir(tilesDir, { withFileTypes: true });

      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(tilesDir, entry.name))
        .filter((entryPath) => /\.(png|jpe?g|webp)$/i.test(entryPath));
    }),
  );

  return fileGroups.flat().sort((left, right) => left.localeCompare(right));
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

function resolveDefaultPythonBin() {
  const localCandidates = [
    path.resolve(".venv/bin/python"),
    path.resolve(".venv/bin/python3"),
    path.resolve("../.venv/bin/python"),
    path.resolve("../.venv/bin/python3"),
    path.resolve("generator/.venv/bin/python"),
    path.resolve("generator/.venv/bin/python3"),
  ];

  return localCandidates.find((candidate) => existsSync(candidate)) ?? "python3";
}

async function runTargetAnalysis(input: {
  pythonBin: string;
  target: string;
  out: string;
  cols: number;
  rows: number;
  debugPreview?: string;
}) {
  const scriptPath = path.resolve("scripts/analyze_target.py");
  const args = [
    scriptPath,
    "--target",
    input.target,
    "--out",
    input.out,
    "--cols",
    String(input.cols),
    "--rows",
    String(input.rows),
  ];

  if (input.debugPreview) {
    args.push("--debug-preview", input.debugPreview);
  }

  await execFile(input.pythonBin, args, {
    cwd: process.cwd(),
  });
}

function seededShuffle(values: string[], seed: number) {
  const copy = values.slice();
  let state = seed >>> 0;

  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
