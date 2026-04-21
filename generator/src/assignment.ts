import {
  type MosaicRgb,
  renderedMosaicTileSizePx,
  unitTileGrid,
} from "@one-portrait/shared";

import { deltaE } from "./color";
import type { PreparedSubmission } from "./prepare";

export const DEFAULT_MOSAIC_COLUMNS = unitTileGrid.cols;
export const DEFAULT_MOSAIC_ROWS = unitTileGrid.rows;
export const DEFAULT_TILE_SIZE_PX = renderedMosaicTileSizePx;

export type TargetTile = {
  readonly averageColor: MosaicRgb;
  readonly index: number;
  readonly x: number;
  readonly y: number;
};

export type MosaicPlacement = {
  readonly submitter: string;
  readonly submissionNo: number;
  readonly targetColor: MosaicRgb;
  readonly walrusBlobId: string;
  readonly x: number;
  readonly y: number;
};

export function assignGreedyPlacements(input: {
  readonly submissions: readonly PreparedSubmission[];
  readonly targetTiles: readonly TargetTile[];
}): MosaicPlacement[] {
  if (input.submissions.length !== input.targetTiles.length) {
    throw new Error("Submission count and target tile count must match.");
  }

  const remainingSubmissions = sortPreparedSubmissions(input.submissions);
  const orderedTiles = sortTargetTiles(input.targetTiles);
  const placements: MosaicPlacement[] = [];

  for (const tile of orderedTiles) {
    const selectedIndex = findBestSubmissionIndex(tile, remainingSubmissions);
    const selected = remainingSubmissions.splice(selectedIndex, 1)[0];

    if (!selected) {
      throw new Error("Greedy assignment exhausted submissions unexpectedly.");
    }

    placements.push({
      walrusBlobId: selected.walrusBlobId,
      submitter: selected.submitter,
      submissionNo: selected.submissionNo,
      x: tile.x,
      y: tile.y,
      targetColor: tile.averageColor,
    });
  }

  return placements;
}

function sortPreparedSubmissions(
  submissions: readonly PreparedSubmission[],
): PreparedSubmission[] {
  return [...submissions].sort(compareSubmissionOrder);
}

function sortTargetTiles(targetTiles: readonly TargetTile[]): TargetTile[] {
  return [...targetTiles].sort((left, right) => {
    if (left.y !== right.y) {
      return left.y - right.y;
    }

    if (left.x !== right.x) {
      return left.x - right.x;
    }

    return left.index - right.index;
  });
}

function findBestSubmissionIndex(
  tile: TargetTile,
  submissions: readonly PreparedSubmission[],
): number {
  let bestIndex = 0;

  for (let index = 1; index < submissions.length; index += 1) {
    const candidate = submissions[index];
    const best = submissions[bestIndex];

    if (!candidate || !best) {
      continue;
    }

    const candidateDistance = deltaE(candidate.averageColor, tile.averageColor);
    const bestDistance = deltaE(best.averageColor, tile.averageColor);

    if (candidateDistance < bestDistance) {
      bestIndex = index;
      continue;
    }

    if (
      candidateDistance === bestDistance &&
      compareSubmissionOrder(candidate, best) < 0
    ) {
      bestIndex = index;
    }
  }

  return bestIndex;
}

function compareSubmissionOrder(
  left: Pick<PreparedSubmission, "submissionNo" | "walrusBlobId">,
  right: Pick<PreparedSubmission, "submissionNo" | "walrusBlobId">,
): number {
  if (left.submissionNo !== right.submissionNo) {
    return left.submissionNo - right.submissionNo;
  }

  return left.walrusBlobId.localeCompare(right.walrusBlobId);
}
