import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { PreparedSubmission } from "../src";
import {
  composeMosaicPng,
  createSharpAverageColorSampler,
  extractTargetTiles,
} from "../src";

describe("createSharpAverageColorSampler", () => {
  it("calculates the mean RGB color from image bytes", async () => {
    const sampler = createSharpAverageColorSampler();
    const imageBytes = await createPng({
      width: 2,
      height: 1,
      pixels: [255, 0, 0, 0, 0, 255],
    });

    await expect(sampler(imageBytes)).resolves.toEqual({
      red: 128,
      green: 0,
      blue: 128,
    });
  });
});

describe("extractTargetTiles", () => {
  it("returns row-major target colors", async () => {
    const imageBytes = await createPng({
      width: 2,
      height: 2,
      pixels: [
        255,
        0,
        0,
        0,
        255,
        0,
        0,
        0,
        255,
        255,
        255,
        0,
      ],
    });

    await expect(
      extractTargetTiles(imageBytes, {
        columns: 2,
        rows: 2,
      }),
    ).resolves.toEqual([
      { index: 0, x: 0, y: 0, averageColor: { red: 255, green: 0, blue: 0 } },
      { index: 1, x: 1, y: 0, averageColor: { red: 0, green: 255, blue: 0 } },
      { index: 2, x: 0, y: 1, averageColor: { red: 0, green: 0, blue: 255 } },
      {
        index: 3,
        x: 1,
        y: 1,
        averageColor: { red: 255, green: 255, blue: 0 },
      },
    ]);
  });
});

describe("composeMosaicPng", () => {
  it("renders tiles at deterministic coordinates with fixed output dimensions", async () => {
    const mosaicBytes = await composeMosaicPng({
      submissions: [
        submission({
          walrusBlobId: "blob-red",
          imageBytes: await createSolidColorPng(255, 0, 0),
        }),
        submission({
          walrusBlobId: "blob-blue",
          imageBytes: await createSolidColorPng(0, 0, 255),
        }),
      ],
      placements: [
        {
          walrusBlobId: "blob-red",
          submissionNo: 1,
          submitter: "0xsubmitter",
          x: 0,
          y: 0,
          targetColor: { red: 255, green: 0, blue: 0 },
        },
        {
          walrusBlobId: "blob-blue",
          submissionNo: 2,
          submitter: "0xsubmitter",
          x: 1,
          y: 0,
          targetColor: { red: 0, green: 0, blue: 255 },
        },
      ],
      columns: 2,
      rows: 1,
      tileSizePx: 2,
    });

    const rendered = await sharp(mosaicBytes)
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(rendered.info.width).toBe(4);
    expect(rendered.info.height).toBe(2);
    expect(
      pixelAt(
        rendered.data,
        rendered.info.width,
        rendered.info.channels,
        0,
        0,
      ),
    ).toEqual([
      255, 0, 0,
    ]);
    expect(
      pixelAt(
        rendered.data,
        rendered.info.width,
        rendered.info.channels,
        3,
        0,
      ),
    ).toEqual([
      0, 0, 255,
    ]);
  });
});

async function createSolidColorPng(
  red: number,
  green: number,
  blue: number,
): Promise<Uint8Array> {
  return createPng({
    width: 1,
    height: 1,
    pixels: [red, green, blue],
  });
}

async function createPng(input: {
  width: number;
  height: number;
  pixels: number[];
}): Promise<Uint8Array> {
  const buffer = await sharp(Uint8Array.from(input.pixels), {
    raw: {
      width: input.width,
      height: input.height,
      channels: 3,
    },
  })
    .png()
    .toBuffer();

  return new Uint8Array(buffer);
}

function submission(
  overrides: Partial<PreparedSubmission> = {},
): PreparedSubmission {
  return {
    submissionNo: overrides.submissionNo ?? 1,
    submitter: overrides.submitter ?? "0xsubmitter",
    submittedAtMs: overrides.submittedAtMs ?? 1_700_000_000_000,
    walrusBlobId: overrides.walrusBlobId ?? "blob-id",
    averageColor: overrides.averageColor ?? { red: 0, green: 0, blue: 0 },
    imageBytes: overrides.imageBytes ?? new Uint8Array([1, 2, 3]),
  };
}

function pixelAt(
  pixels: Uint8Array,
  width: number,
  channels: number,
  x: number,
  y: number,
): [number, number, number] {
  const offset = (y * width + x) * channels;
  return [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0];
}
