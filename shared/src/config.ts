export const unitTileGrid = {
  cols: 28,
  rows: 35,
} as const;

export const unitTileCount = unitTileGrid.cols * unitTileGrid.rows;

export const renderedMosaicTileSizePx = 200;

export const renderedMosaicSize = {
  width: unitTileGrid.cols * renderedMosaicTileSizePx,
  height: unitTileGrid.rows * renderedMosaicTileSizePx,
} as const;
