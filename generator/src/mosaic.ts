import sharp from "sharp";

export type MosaicGrid = {
  cols: number;
  rows: number;
};

export type MosaicTileInput = {
  id: string;
  image: Buffer;
};

export type GenerateMosaicInput = {
  targetImage: Buffer;
  tiles: MosaicTileInput[];
  grid: MosaicGrid;
  tileSize?: number;
  colorMix?: number;
  overlayOpacity?: number;
  overlayBlur?: number;
};

export type MosaicPlacement = {
  tileId: string;
  index: number;
  x: number;
  y: number;
  deltaE: number;
  importance: number;
};

export type GeneratedMosaic = {
  image: Buffer;
  width: number;
  height: number;
  placements: MosaicPlacement[];
  metrics: {
    averageDeltaE: number;
    maxDeltaE: number;
  };
};

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type Lab = {
  l: number;
  a: number;
  b: number;
};

type TargetCell = {
  index: number;
  x: number;
  y: number;
  avgRgb: Rgb;
  avgLab: Lab;
  importance: number;
};

type PreparedTile = {
  id: string;
  image: Buffer;
  avgRgb: Rgb;
  avgLab: Lab;
};

const defaultTileSize = 64;
const defaultColorMix = 0.26;
const defaultOverlayOpacity = 0.12;
const defaultOverlayBlur = 8;

export async function generateMosaic(
  input: GenerateMosaicInput,
): Promise<GeneratedMosaic> {
  const tileSize = input.tileSize ?? defaultTileSize;
  const colorMix = input.colorMix ?? defaultColorMix;
  const overlayOpacity = input.overlayOpacity ?? defaultOverlayOpacity;
  const overlayBlur = input.overlayBlur ?? defaultOverlayBlur;
  const cellCount = input.grid.cols * input.grid.rows;

  if (input.tiles.length !== cellCount) {
    throw new Error(
      `Expected exactly ${cellCount} unique tiles, received ${input.tiles.length}.`,
    );
  }

  const targetCells = await buildTargetCells(input.targetImage, input.grid);
  const preparedTiles = await Promise.all(
    input.tiles.map((tile) => prepareTile(tile, tileSize)),
  );
  const assignments = assignTiles(targetCells, preparedTiles);
  const width = input.grid.cols * tileSize;
  const height = input.grid.rows * tileSize;

  const composites = await Promise.all(
    assignments.map(async (assignment) => ({
      input: await renderCorrectedTile(
        assignment.tile.image,
        assignment.tile.avgRgb,
        assignment.cell.avgRgb,
        colorMix,
      ),
      left: assignment.cell.x * tileSize,
      top: assignment.cell.y * tileSize,
    })),
  );

  const base = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const overlayBase = sharp(input.targetImage)
    .rotate()
    .resize(width, height, { fit: "cover" })
    .blur(overlayBlur);
  const overlaySoft = await overlayBase
    .clone()
    .ensureAlpha(overlayOpacity)
    .png()
    .toBuffer();
  const overlayHighlight = await overlayBase
    .clone()
    .ensureAlpha(overlayOpacity * 0.45)
    .png()
    .toBuffer();

  const image = await sharp(base)
    .composite([
      {
        input: overlaySoft,
        blend: "soft-light",
      },
      {
        input: overlayHighlight,
        blend: "overlay",
      },
    ])
    .png()
    .toBuffer();

  const deltas = assignments.map((assignment) => assignment.deltaE);

  return {
    image,
    width,
    height,
    placements: assignments
      .slice()
      .sort((left, right) => left.cell.index - right.cell.index)
      .map((assignment) => ({
        tileId: assignment.tile.id,
        index: assignment.cell.index,
        x: assignment.cell.x,
        y: assignment.cell.y,
        deltaE: Number(assignment.deltaE.toFixed(2)),
        importance: Number(assignment.cell.importance.toFixed(3)),
      })),
    metrics: {
      averageDeltaE: Number(
        (deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(
          2,
        ),
      ),
      maxDeltaE: Number(Math.max(...deltas).toFixed(2)),
    },
  };
}

async function buildTargetCells(
  targetImage: Buffer,
  grid: MosaicGrid,
): Promise<TargetCell[]> {
  const raw = await sharp(targetImage)
    .rotate()
    .resize(grid.cols, grid.rows, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const luminances = new Array<number>(grid.cols * grid.rows).fill(0);

  for (let index = 0; index < luminances.length; index += 1) {
    const offset = index * 3;
    luminances[index] = rgbToLuminance({
      r: raw[offset],
      g: raw[offset + 1],
      b: raw[offset + 2],
    });
  }

  const contrastValues = new Array<number>(grid.cols * grid.rows).fill(0);

  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.cols; x += 1) {
      const index = y * grid.cols + x;
      const center = luminances[index];
      const neighbors: number[] = [];

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }

          const nx = x + dx;
          const ny = y + dy;

          if (nx < 0 || nx >= grid.cols || ny < 0 || ny >= grid.rows) {
            continue;
          }

          neighbors.push(luminances[ny * grid.cols + nx]);
        }
      }

      const localContrast =
        neighbors.reduce((sum, neighbor) => sum + Math.abs(center - neighbor), 0) /
        Math.max(neighbors.length, 1);

      contrastValues[index] = localContrast;
    }
  }

  const maxContrast = Math.max(...contrastValues, 1);

  return contrastValues.map((contrast, index) => {
    const offset = index * 3;
    const x = index % grid.cols;
    const y = Math.floor(index / grid.cols);
    const rgb = {
      r: raw[offset],
      g: raw[offset + 1],
      b: raw[offset + 2],
    };

    return {
      index,
      x,
      y,
      avgRgb: rgb,
      avgLab: rgbToLab(rgb),
      importance: computeImportance({
        x,
        y,
        cols: grid.cols,
        rows: grid.rows,
        contrast: contrast / maxContrast,
      }),
    };
  });
}

function computeImportance(input: {
  x: number;
  y: number;
  cols: number;
  rows: number;
  contrast: number;
}) {
  const nx = input.cols === 1 ? 0 : input.x / (input.cols - 1);
  const ny = input.rows === 1 ? 0 : input.y / (input.rows - 1);
  const dx = (nx - 0.5) / 0.42;
  const dy = (ny - 0.42) / 0.5;
  const centerBias = Math.exp(-(dx * dx + dy * dy));
  const eyeBand =
    Math.exp(-(((ny - 0.36) * (ny - 0.36)) / 0.008)) *
    Math.exp(-(((nx - 0.5) * (nx - 0.5)) / 0.12));

  return clamp(0.35 + centerBias * 0.38 + input.contrast * 0.19 + eyeBand * 0.08);
}

async function prepareTile(
  tile: MosaicTileInput,
  tileSize: number,
): Promise<PreparedTile> {
  const image = await sharp(tile.image)
    .rotate()
    .resize(tileSize, tileSize, { fit: "cover" })
    .removeAlpha()
    .png()
    .toBuffer();
  const stats = await sharp(image).stats();
  const avgRgb = {
    r: stats.channels[0].mean,
    g: stats.channels[1].mean,
    b: stats.channels[2].mean,
  };

  return {
    id: tile.id,
    image,
    avgRgb,
    avgLab: rgbToLab(avgRgb),
  };
}

function assignTiles(targetCells: TargetCell[], tiles: PreparedTile[]) {
  const orderedCells = targetCells
    .slice()
    .sort((left, right) => {
      if (right.importance !== left.importance) {
        return right.importance - left.importance;
      }

      return left.index - right.index;
    });
  const remainingTiles = tiles.slice();

  return orderedCells.map((cell) => {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remainingTiles.length; index += 1) {
      const tile = remainingTiles[index];
      const colorDistance = deltaE(cell.avgLab, tile.avgLab);
      const brightnessPenalty = Math.abs(cell.avgLab.l - tile.avgLab.l) * 0.08;
      const score = colorDistance + brightnessPenalty;

      if (
        score < bestScore ||
        (score === bestScore && tile.id.localeCompare(remainingTiles[bestIndex].id) < 0)
      ) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [tile] = remainingTiles.splice(bestIndex, 1);

    return {
      cell,
      tile,
      deltaE: deltaE(cell.avgLab, tile.avgLab),
    };
  });
}

async function renderCorrectedTile(
  image: Buffer,
  sourceAverage: Rgb,
  targetAverage: Rgb,
  colorMix: number,
) {
  const gain = {
    r: clamp(targetAverage.r / Math.max(sourceAverage.r, 1), 0.78, 1.28),
    g: clamp(targetAverage.g / Math.max(sourceAverage.g, 1), 0.78, 1.28),
    b: clamp(targetAverage.b / Math.max(sourceAverage.b, 1), 0.78, 1.28),
  };
  const offset = {
    r: clamp(targetAverage.r - sourceAverage.r * gain.r, -18, 18),
    g: clamp(targetAverage.g - sourceAverage.g * gain.g, -18, 18),
    b: clamp(targetAverage.b - sourceAverage.b * gain.b, -18, 18),
  };
  const metadata = await sharp(image).metadata();
  const width = metadata.width ?? defaultTileSize;
  const height = metadata.height ?? defaultTileSize;

  return sharp(image)
    .linear(
      [gain.r, gain.g, gain.b],
      [offset.r, offset.g, offset.b],
    )
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="rgb(${Math.round(targetAverage.r)},${Math.round(targetAverage.g)},${Math.round(targetAverage.b)})" fill-opacity="${colorMix}"/></svg>`,
        ),
        blend: "overlay",
      },
    ])
    .png()
    .toBuffer();
}

function deltaE(left: Lab, right: Lab) {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b);
}

function rgbToLuminance(rgb: Rgb) {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
}

function rgbToLab(rgb: Rgb): Lab {
  const xyz = rgbToXyz(rgb);
  const refX = 95.047;
  const refY = 100;
  const refZ = 108.883;
  const x = pivotXyz(xyz.x / refX);
  const y = pivotXyz(xyz.y / refY);
  const z = pivotXyz(xyz.z / refZ);

  return {
    l: 116 * y - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  };
}

function rgbToXyz(rgb: Rgb) {
  const r = pivotRgb(rgb.r / 255);
  const g = pivotRgb(rgb.g / 255);
  const b = pivotRgb(rgb.b / 255);

  return {
    x: (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100,
    y: (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100,
    z: (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100,
  };
}

function pivotRgb(value: number) {
  return value > 0.04045
    ? ((value + 0.055) / 1.055) ** 2.4
    : value / 12.92;
}

function pivotXyz(value: number) {
  return value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}
