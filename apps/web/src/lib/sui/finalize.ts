import type { SuiReadClient } from "./client";
import { getUnitProgress } from "./unit";

export type FinalizeUnitSnapshot = {
  readonly unitId: string;
  readonly status: "filled" | "finalized" | "pending";
  readonly masterId: string | null;
};

export async function getFinalizeUnitSnapshot(
  unitId: string,
  options?: { client?: SuiReadClient },
): Promise<FinalizeUnitSnapshot> {
  const progress = await getUnitProgress(unitId, options);
  return {
    unitId: progress.unitId,
    status: progress.status,
    masterId: progress.masterId,
  };
}
