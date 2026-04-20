import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { generateMosaic } from "../src";

describe("generateMosaic", () => {
  it("renders a mosaic with unique tile placement and expected dimensions", async () => {
    const targetImage = await buildQuadrantTarget();
    const tiles = [
      await buildTile("tile-black", 16, 16, { r: 10, g: 10, b: 10 }),
      await buildTile("tile-red", 16, 16, { r: 210, g: 40, b: 30 }),
      await buildTile("tile-green", 16, 16, { r: 35, g: 180, b: 70 }),
      await buildTile("tile-blue", 16, 16, { r: 30, g: 80, b: 210 }),
    ];

    const result = await generateMosaic({
      targetImage,
      tiles,
      grid: { cols: 2, rows: 2 },
      tileSize: 24,
    });

    expect(result.width).toBe(48);
    expect(result.height).toBe(48);
    expect(result.placements).toHaveLength(4);
    expect(new Set(result.placements.map((placement) => placement.tileId)).size).toBe(
      4,
    );

    const metadata = await sharp(result.image).metadata();

    expect(metadata.width).toBe(48);
    expect(metadata.height).toBe(48);
  });

  it("prioritizes the center cell when assigning the best matching unique tile", async () => {
    const targetImage = await buildCenterWeightedTarget();
    const colors = [
      { id: "tile-black-perfect", rgb: { r: 0, g: 0, b: 0 } },
      { id: "tile-white-1", rgb: { r: 240, g: 240, b: 240 } },
      { id: "tile-white-2", rgb: { r: 232, g: 232, b: 232 } },
      { id: "tile-white-3", rgb: { r: 224, g: 224, b: 224 } },
      { id: "tile-white-4", rgb: { r: 216, g: 216, b: 216 } },
      { id: "tile-white-5", rgb: { r: 208, g: 208, b: 208 } },
      { id: "tile-white-6", rgb: { r: 200, g: 200, b: 200 } },
      { id: "tile-white-7", rgb: { r: 192, g: 192, b: 192 } },
      { id: "tile-white-8", rgb: { r: 184, g: 184, b: 184 } },
    ];
    const tiles = await Promise.all(
      colors.map((color) => buildTile(color.id, 16, 16, color.rgb)),
    );

    const result = await generateMosaic({
      targetImage,
      tiles,
      grid: { cols: 3, rows: 3 },
      tileSize: 16,
    });
    const centerPlacement = result.placements.find(
      (placement) => placement.index === 4,
    );

    expect(centerPlacement?.tileId).toBe("tile-black-perfect");
  });
});

async function buildTile(
  id: string,
  width: number,
  height: number,
  rgb: { r: number; g: number; b: number },
) {
  const image = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: rgb,
    },
  })
    .png()
    .toBuffer();

  return { id, image };
}

async function buildQuadrantTarget() {
  const width = 2;
  const height = 2;

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([
      {
        input: await solidPng(1, 1, { r: 10, g: 10, b: 10 }),
        left: 0,
        top: 0,
      },
      {
        input: await solidPng(1, 1, { r: 210, g: 40, b: 30 }),
        left: 1,
        top: 0,
      },
      {
        input: await solidPng(1, 1, { r: 35, g: 180, b: 70 }),
        left: 0,
        top: 1,
      },
      {
        input: await solidPng(1, 1, { r: 30, g: 80, b: 210 }),
        left: 1,
        top: 1,
      },
    ])
    .png()
    .toBuffer();
}

async function buildCenterWeightedTarget() {
  return sharp({
    create: {
      width: 3,
      height: 3,
      channels: 3,
      background: { r: 238, g: 238, b: 238 },
    },
  })
    .composite([
      {
        input: await solidPng(1, 1, { r: 0, g: 0, b: 0 }),
        left: 1,
        top: 1,
      },
    ])
    .png()
    .toBuffer();
}

async function solidPng(
  width: number,
  height: number,
  rgb: { r: number; g: number; b: number },
) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: rgb,
    },
  })
    .png()
    .toBuffer();
}
