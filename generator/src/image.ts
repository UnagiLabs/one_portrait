import type { MosaicRgb } from "@one-portrait/shared";
import sharp from "sharp";

import {
  DEFAULT_MOSAIC_COLUMNS,
  DEFAULT_MOSAIC_ROWS,
  DEFAULT_TILE_SIZE_PX,
  type MosaicPlacement,
  type TargetTile,
} from "./assignment";
import type { AverageColorSampler, PreparedSubmission } from "./prepare";

export type MosaicCompositionPlan = {
  readonly height: number;
  readonly tiles: readonly MosaicCompositionTile[];
  readonly width: number;
};

export type MosaicCompositionTile = {
  readonly height: number;
  readonly left: number;
  readonly targetColor: MosaicRgb;
  readonly top: number;
  readonly walrusBlobId: string;
  readonly width: number;
};

export function createSharpAverageColorSampler(): AverageColorSampler {
  return async (imageBytes) => {
    const stats = await sharp(imageBytes).removeAlpha().stats();
    const red = stats.channels[0]?.mean ?? 0;
    const green = stats.channels[1]?.mean ?? 0;
    const blue = stats.channels[2]?.mean ?? 0;

    return {
      red: Math.round(red),
      green: Math.round(green),
      blue: Math.round(blue),
    };
  };
}

export async function extractTargetTiles(
  targetImageBytes: Uint8Array,
  options: {
    readonly columns?: number;
    readonly rows?: number;
  } = {},
): Promise<TargetTile[]> {
  const columns = options.columns ?? DEFAULT_MOSAIC_COLUMNS;
  const rows = options.rows ?? DEFAULT_MOSAIC_ROWS;
  const resized = await sharp(targetImageBytes)
    .removeAlpha()
    .resize(columns, rows, {
      fit: "fill",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return buildTargetTiles(resized.data, {
    width: resized.info.width,
    height: resized.info.height,
    channels: resized.info.channels,
  });
}

export function buildMosaicCompositionPlan(input: {
  readonly columns?: number;
  readonly placements: readonly MosaicPlacement[];
  readonly rows?: number;
  readonly tileSizePx?: number;
}): MosaicCompositionPlan {
  const columns = input.columns ?? DEFAULT_MOSAIC_COLUMNS;
  const rows = input.rows ?? DEFAULT_MOSAIC_ROWS;
  const tileSizePx = input.tileSizePx ?? DEFAULT_TILE_SIZE_PX;

  return {
    width: columns * tileSizePx,
    height: rows * tileSizePx,
    tiles: input.placements.map((placement) => ({
      walrusBlobId: placement.walrusBlobId,
      left: placement.x * tileSizePx,
      top: placement.y * tileSizePx,
      width: tileSizePx,
      height: tileSizePx,
      targetColor: placement.targetColor,
    })),
  };
}

export async function composeMosaicPng(input: {
  readonly columns?: number;
  readonly placements: readonly MosaicPlacement[];
  readonly rows?: number;
  readonly submissions: readonly PreparedSubmission[];
  readonly tileSizePx?: number;
}): Promise<Uint8Array> {
  const plan = buildMosaicCompositionPlan(input);
  const submissionsByBlobId = new Map(
    input.submissions.map((submission) => [
      submission.walrusBlobId,
      submission,
    ]),
  );
  const composites = await Promise.all(
    plan.tiles.map(async (tile) => {
      const submission = submissionsByBlobId.get(tile.walrusBlobId);

      if (!submission) {
        throw new Error(`Missing submission image for ${tile.walrusBlobId}.`);
      }

      return {
        input: await sharp(submission.imageBytes)
          .removeAlpha()
          .resize(tile.width, tile.height, {
            fit: "cover",
            position: "centre",
          })
          .png()
          .toBuffer(),
        left: tile.left,
        top: tile.top,
      };
    }),
  );
  const canvas = await sharp({
    create: {
      width: plan.width,
      height: plan.height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return new Uint8Array(canvas);
}

function buildTargetTiles(
  pixels: Uint8Array,
  options: {
    readonly channels: number;
    readonly height: number;
    readonly width: number;
  },
): TargetTile[] {
  const tiles: TargetTile[] = [];

  for (let y = 0; y < options.height; y += 1) {
    for (let x = 0; x < options.width; x += 1) {
      const offset = (y * options.width + x) * options.channels;
      tiles.push({
        index: y * options.width + x,
        x,
        y,
        averageColor: {
          red: pixels[offset] ?? 0,
          green: pixels[offset + 1] ?? 0,
          blue: pixels[offset + 2] ?? 0,
        },
      });
    }
  }

  return tiles;
}
