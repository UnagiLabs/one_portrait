import type { UnitStatus } from "../sui";

import type {
  FinalizeDispatchFailureCode,
  FinalizeDispatchRequest,
  FinalizeDispatchResult,
} from "./dispatch";
import { getFinalizeDispatchFailure } from "./dispatch";

export type FinalizeUnitSnapshot = {
  readonly unitId: string;
  readonly status: UnitStatus;
  readonly masterId: string | null;
};

export type FinalizeRouteResult =
  | {
      readonly code: FinalizeDispatchFailureCode;
      readonly message: string;
      readonly status: "ignored_dispatch_failed";
      readonly unitId: string;
    }
  | {
      readonly status: "ignored_finalized";
      readonly unitId: string;
    }
  | {
      readonly status: "ignored_pending";
      readonly unitId: string;
    }
  | {
      readonly status: "queued";
      readonly unitId: string;
    };

export type FinalizeRouteDeps = {
  readonly dispatch: (
    request: FinalizeDispatchRequest,
  ) => Promise<FinalizeDispatchResult>;
  readonly readUnitSnapshot: (unitId: string) => Promise<FinalizeUnitSnapshot>;
};

export function createFinalizeRouteService(deps: FinalizeRouteDeps) {
  return {
    async execute(unitId: string): Promise<FinalizeRouteResult> {
      const snapshot = await deps.readUnitSnapshot(unitId);
      if (snapshot.status === "pending") {
        return { status: "ignored_pending", unitId };
      }

      if (snapshot.status === "finalized" || snapshot.masterId !== null) {
        return { status: "ignored_finalized", unitId };
      }

      try {
        await deps.dispatch({ unitId });
      } catch (error) {
        console.error("Finalize dispatch failed", error);
        return {
          ...getFinalizeDispatchFailure(error),
          status: "ignored_dispatch_failed",
          unitId,
        };
      }

      return { status: "queued", unitId };
    },
  };
}
