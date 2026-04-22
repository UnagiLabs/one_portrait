import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  loadSeedingInputFromDirectory,
  loadSeedingInputFromManifest,
} from "../src";

describe("seeding input normalization", () => {
  it("normalizes directory input in deterministic order and filters non-image files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "one-portrait-seeding-input-"));

    try {
      await writeFile(join(dir, "b.webp"), await createImage("webp"));
      await writeFile(join(dir, "a.png"), await createImage("png"));
      await writeFile(join(dir, "ignore.txt"), "not an image", "utf8");

      await expect(loadSeedingInputFromDirectory(dir)).resolves.toEqual([
        {
          imageKey: "a.png",
          filePath: join(dir, "a.png"),
        },
        {
          imageKey: "b.webp",
          filePath: join(dir, "b.webp"),
        },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("normalizes manifest input to the same internal entry shape", async () => {
    const dir = await mkdtemp(join(tmpdir(), "one-portrait-seeding-input-"));
    const manifestPath = join(dir, "manifest.json");

    try {
      await writeFile(join(dir, "b.webp"), await createImage("webp"));
      await writeFile(join(dir, "a.png"), await createImage("png"));
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            entries: [
              {
                imageKey: "b.webp",
                filePath: "./b.webp",
              },
              {
                imageKey: "a.png",
                localFile: "a.png",
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );

      await expect(loadSeedingInputFromManifest(manifestPath)).resolves.toEqual(
        [
          {
            imageKey: "a.png",
            filePath: join(dir, "a.png"),
          },
          {
            imageKey: "b.webp",
            filePath: join(dir, "b.webp"),
          },
        ],
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function createImage(format: "png" | "webp"): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    [format]()
    .toBuffer();

  return new Uint8Array(buffer);
}
