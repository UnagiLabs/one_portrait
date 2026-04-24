import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  FINALIZE_MOSAIC_CONTENT_TYPE,
  FINALIZE_MOSAIC_HEIGHT,
  FINALIZE_MOSAIC_TILE_SIZE,
  FINALIZE_MOSAIC_WIDTH,
  generateFinalizeMosaic,
  generateMosaic,
} from "../src";

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
    expect(
      new Set(result.placements.map((placement) => placement.tileId)).size,
    ).toBe(4);

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

  it("maps improved placements back to finalize-ready submission metadata", async () => {
    const targetImage = await buildQuadrantTarget();
    const submissions = [
      await buildSubmission("tile-black", 1, "0x1", { r: 10, g: 10, b: 10 }),
      await buildSubmission("tile-red", 2, "0x2", { r: 210, g: 40, b: 30 }),
      await buildSubmission("tile-green", 3, "0x3", { r: 35, g: 180, b: 70 }),
      await buildSubmission("tile-blue", 4, "0x4", { r: 30, g: 80, b: 210 }),
    ];

    const result = await generateFinalizeMosaic({
      targetImage,
      submissions,
      grid: { cols: 2, rows: 2 },
      tileSize: 24,
    });

    expect(result.placements).toHaveLength(4);
    expect(result.placements[0]).toMatchObject({
      walrusBlobId: "tile-black",
      submitter: "0x1",
      submissionNo: 1,
      x: 0,
      y: 0,
    });
    expect(result.placements[3]).toMatchObject({
      walrusBlobId: "tile-blue",
      submitter: "0x4",
      submissionNo: 4,
      x: 1,
      y: 1,
    });
  });

  it("uses finalize WebP defaults without changing the shared mosaic API", async () => {
    const targetImage = await buildQuadrantTarget();
    const submissions = [
      await buildSubmission("tile-black", 1, "0x1", { r: 10, g: 10, b: 10 }),
      await buildSubmission("tile-red", 2, "0x2", { r: 210, g: 40, b: 30 }),
      await buildSubmission("tile-green", 3, "0x3", { r: 35, g: 180, b: 70 }),
      await buildSubmission("tile-blue", 4, "0x4", { r: 30, g: 80, b: 210 }),
    ];

    const result = await generateFinalizeMosaic({
      targetImage,
      submissions,
      grid: { cols: 2, rows: 2 },
    });
    const metadata = await sharp(result.image).metadata();

    expect(FINALIZE_MOSAIC_TILE_SIZE).toBe(40);
    expect(FINALIZE_MOSAIC_WIDTH).toBe(1600);
    expect(FINALIZE_MOSAIC_HEIGHT).toBe(2000);
    expect(FINALIZE_MOSAIC_CONTENT_TYPE).toBe("image/webp");
    expect(result.width).toBe(80);
    expect(result.height).toBe(80);
    expect(result.contentType).toBe("image/webp");
    expect(metadata.width).toBe(80);
    expect(metadata.height).toBe(80);
    expect(metadata.format).toBe("webp");
    expect(result.placements).toHaveLength(4);
  });

  it(
    "renders the default 2000-tile finalize mosaic as a compact 1600x2000 WebP",
    async () => {
      const targetImage = await solidPng(40, 50, { r: 112, g: 132, b: 156 });
      const palette = await Promise.all(
        [
          { r: 72, g: 92, b: 118 },
          { r: 112, g: 132, b: 156 },
          { r: 148, g: 164, b: 184 },
          { r: 184, g: 190, b: 196 },
        ].map(async (rgb) => ({
          rgb,
          imageBytes: await solidPng(4, 4, rgb),
        })),
      );
      const submissions = Array.from({ length: 40 * 50 }, (_, index) => {
        const swatch = palette[index % palette.length];
        const submissionNo = index + 1;

        return {
          walrusBlobId: `tile-${submissionNo.toString().padStart(4, "0")}`,
          submissionNo,
          submitter: `0x${submissionNo.toString(16).padStart(40, "0")}`,
          submittedAtMs: 1_700_000_000_000 + submissionNo,
          averageColor: {
            red: swatch.rgb.r,
            green: swatch.rgb.g,
            blue: swatch.rgb.b,
          },
          imageBytes: swatch.imageBytes,
        };
      });

      const result = await generateFinalizeMosaic({
        targetImage,
        submissions,
      });
      const metadata = await sharp(result.image).metadata();

      expect(result.width).toBe(1600);
      expect(result.height).toBe(2000);
      expect(result.image.byteLength).toBeLessThanOrEqual(15 * 1024 * 1024);
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(1600);
      expect(metadata.height).toBe(2000);
    },
    60_000,
  );

  it("derives an exact fallback grid from submission count when none is provided", async () => {
    const submissions = [
      await buildSubmission("tile-a", 1, "0x1", { r: 20, g: 20, b: 20 }),
      await buildSubmission("tile-b", 2, "0x2", { r: 220, g: 220, b: 220 }),
    ];
    const targetImage = await sharp({
      create: {
        width: 1,
        height: 2,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite([
        {
          input: await solidPng(1, 1, { r: 20, g: 20, b: 20 }),
          left: 0,
          top: 0,
        },
        {
          input: await solidPng(1, 1, { r: 220, g: 220, b: 220 }),
          left: 0,
          top: 1,
        },
      ])
      .png()
      .toBuffer();

    const result = await generateFinalizeMosaic({
      targetImage,
      submissions,
      tileSize: 10,
    });

    expect(result.width).toBe(10);
    expect(result.height).toBe(20);
    expect(result.placements).toHaveLength(2);
    expect(
      result.placements.map((placement) => [placement.x, placement.y]),
    ).toEqual([
      [0, 0],
      [0, 1],
    ]);
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

async function buildSubmission(
  walrusBlobId: string,
  submissionNo: number,
  submitter: string,
  rgb: { r: number; g: number; b: number },
) {
  return {
    walrusBlobId,
    submissionNo,
    submitter,
    submittedAtMs: 1_700_000_000_000 + submissionNo,
    averageColor: {
      red: rgb.r,
      green: rgb.g,
      blue: rgb.b,
    },
    imageBytes: await solidPng(16, 16, rgb),
  };
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
