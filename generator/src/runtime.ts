import type { GeneratorUnitSnapshot } from "@one-portrait/shared";

import type { MosaicPlacement } from "./assignment";
import {
  type composeMosaicPng,
  createSharpAverageColorSampler,
  type extractTargetTiles,
} from "./image";
import { type GeneratedFinalizeMosaic, generateFinalizeMosaic } from "./mosaic";
import {
  type AverageColorSampler,
  type PreparedFinalizeInput,
  prepareFinalizeInput,
} from "./prepare";
import type { SeedingInputEntry } from "./seeding-input";
import type {
  FinalizeTransactionResult,
  GeneratorFinalizeSnapshot,
  GeneratorUnitSnapshotLoader,
} from "./sui";
import { createWalrusReadClient, type WalrusReadClient } from "./walrus";
import {
  createWalrusWriteClient,
  type WalrusWriteClient,
} from "./walrus-write";

export type FinalizeRunResult =
  | {
      readonly status: "finalized";
      readonly unitId: string;
      readonly mosaicBlobId: string;
      readonly digest: string;
      readonly placementCount: number;
    }
  | {
      readonly status: "ignored_finalized" | "ignored_pending";
      readonly unitId: string;
    };

export type FinalizeRunner = {
  run(unitId: string): Promise<FinalizeRunResult>;
};

export type FinalizeRunnerDeps = {
  readonly assignPlacements: (input: {
    readonly submissions: PreparedFinalizeInput["submissions"];
    readonly targetTiles: Awaited<ReturnType<typeof extractTargetTiles>>;
  }) => MosaicPlacement[];
  readonly composeMosaicPng: typeof composeMosaicPng;
  readonly extractTargetTiles: typeof extractTargetTiles;
  readonly finalizeTransaction: (input: {
    readonly mosaicBlobId: string;
    readonly placements: readonly MosaicPlacement[];
    readonly unitId: string;
  }) => Promise<FinalizeTransactionResult>;
  readonly prepareInput: (
    snapshot: GeneratorUnitSnapshot,
  ) => Promise<PreparedFinalizeInput>;
  readonly putMosaic: WalrusWriteClient["putBlob"];
  readonly readUnitSnapshot: GeneratorUnitSnapshotLoader;
};

export type DefaultFinalizeRunnerDeps = {
  readonly demoFinalizeManifestPath?: string | null;
  readonly finalizeTransaction: FinalizeRunnerDeps["finalizeTransaction"];
  readonly generateFinalizeMosaic?: (
    prepared: PreparedFinalizeInput,
  ) => Promise<Pick<GeneratedFinalizeMosaic, "image" | "placements">>;
  readonly loadDemoManifestEntries?: (
    manifestPath: string,
  ) => Promise<readonly SeedingInputEntry[]>;
  readonly readUnitSnapshot: GeneratorUnitSnapshotLoader;
  readonly readDemoFile?: (filePath: string) => Promise<Uint8Array>;
  readonly sampleAverageColor?: AverageColorSampler;
  readonly walrusRead: WalrusReadClient;
  readonly walrusWrite: WalrusWriteClient;
};

export function createFinalizeRunner(deps: FinalizeRunnerDeps): FinalizeRunner {
  return {
    async run(unitId: string): Promise<FinalizeRunResult> {
      const snapshot = await deps.readUnitSnapshot(unitId);

      if (snapshot.status === "pending") {
        return {
          status: "ignored_pending",
          unitId,
        };
      }

      if (snapshot.status === "finalized" || snapshot.masterId !== null) {
        return {
          status: "ignored_finalized",
          unitId,
        };
      }

      const prepared = await deps.prepareInput(snapshot);
      const targetTiles = await deps.extractTargetTiles(
        prepared.targetImageBytes,
      );
      const placements = deps.assignPlacements({
        submissions: prepared.submissions,
        targetTiles,
      });
      const mosaicBytes = await deps.composeMosaicPng({
        submissions: prepared.submissions,
        placements,
      });
      const mosaic = await deps.putMosaic(mosaicBytes);
      const finalizePlacements = selectPlacementsForFinalize(
        prepared,
        placements,
      );
      const finalized = await deps.finalizeTransaction({
        unitId,
        mosaicBlobId: mosaic.blobId,
        placements: finalizePlacements,
      });

      return {
        status: "finalized",
        unitId,
        mosaicBlobId: mosaic.blobId,
        digest: finalized.digest,
        placementCount: finalizePlacements.length,
      };
    },
  };
}

export function createDefaultFinalizeRunner(
  deps: DefaultFinalizeRunnerDeps,
): FinalizeRunner {
  const buildFinalizeMosaic =
    deps.generateFinalizeMosaic ??
    ((prepared: PreparedFinalizeInput) =>
      generateFinalizeMosaic({
        targetImage: prepared.targetImageBytes,
        submissions: prepared.submissions,
      }));

  return {
    async run(unitId: string): Promise<FinalizeRunResult> {
      const snapshot = await deps.readUnitSnapshot(unitId);

      if (snapshot.status === "pending") {
        return {
          status: "ignored_pending",
          unitId,
        };
      }

      if (snapshot.status === "finalized" || snapshot.masterId !== null) {
        return {
          status: "ignored_finalized",
          unitId,
        };
      }

      const prepared = await prepareFinalizeInput(snapshot, {
        demoFinalizeManifestPath: deps.demoFinalizeManifestPath ?? null,
        loadDemoManifestEntries: deps.loadDemoManifestEntries,
        readDemoFile: deps.readDemoFile,
        walrus: deps.walrusRead,
        sampleAverageColor:
          deps.sampleAverageColor ?? createSharpAverageColorSampler(),
      });
      const mosaicResult = await buildFinalizeMosaic(prepared);
      const finalizePlacements = selectPlacementsForFinalize(
        prepared,
        mosaicResult.placements,
      );
      const mosaic = await deps.walrusWrite.putBlob(mosaicResult.image);
      const finalized = await deps.finalizeTransaction({
        unitId,
        mosaicBlobId: mosaic.blobId,
        placements: finalizePlacements,
      });

      return {
        status: "finalized",
        unitId,
        mosaicBlobId: mosaic.blobId,
        digest: finalized.digest,
        placementCount: finalizePlacements.length,
      };
    },
  };
}

export function createFinalizeRunnerFromEndpoints(input: {
  readonly demoFinalizeManifestPath?: string | null;
  readonly finalizeTransaction: FinalizeRunnerDeps["finalizeTransaction"];
  readonly readUnitSnapshot: GeneratorUnitSnapshotLoader;
  readonly walrusAggregatorBaseUrl: string;
  readonly walrusPublisherBaseUrl: string;
}): FinalizeRunner {
  return createDefaultFinalizeRunner({
    demoFinalizeManifestPath: input.demoFinalizeManifestPath ?? null,
    readUnitSnapshot: input.readUnitSnapshot,
    finalizeTransaction: input.finalizeTransaction,
    walrusRead: createWalrusReadClient({
      aggregatorBaseUrl: input.walrusAggregatorBaseUrl,
    }),
    walrusWrite: createWalrusWriteClient({
      publisherBaseUrl: input.walrusPublisherBaseUrl,
      aggregatorBaseUrl: input.walrusAggregatorBaseUrl,
    }),
  });
}

function selectPlacementsForFinalize(
  prepared: PreparedFinalizeInput,
  placements: readonly MosaicPlacement[],
): MosaicPlacement[] {
  const allowedBlobIds = new Set(prepared.finalizeWalrusBlobIds);

  return placements.filter((placement) =>
    allowedBlobIds.has(placement.walrusBlobId),
  );
}

export type { GeneratorFinalizeSnapshot };
