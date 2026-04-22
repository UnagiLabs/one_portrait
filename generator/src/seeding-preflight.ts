import type { GeneratorSeedingSnapshot } from "./sui";

export type SeedingPreflightResult = {
  readonly availableSenderAddresses: readonly string[];
  readonly currentSubmittedCount: number;
  readonly maxSlots: number;
  readonly remainingCount: number;
  readonly targetCount: number;
};

export function validateSeedingPreflight(
  snapshot: GeneratorSeedingSnapshot,
  targetCount: number,
  senderPool: readonly string[],
): SeedingPreflightResult {
  if (snapshot.status !== "pending") {
    throw new Error("Seeding preflight requires the unit status to be pending.");
  }

  if (targetCount >= snapshot.maxSlots) {
    throw new Error("targetCount must be less than maxSlots.");
  }

  if (targetCount < snapshot.submittedCount) {
    throw new Error("targetCount cannot be below submittedCount.");
  }

  ensureUniqueSenderPool(senderPool);

  const usedSubmitters = new Set(snapshot.submitterAddresses);
  const availableSenderAddresses = senderPool.filter(
    (senderAddress) => !usedSubmitters.has(senderAddress),
  );
  const remainingCount = targetCount - snapshot.submittedCount;

  if (availableSenderAddresses.length < remainingCount) {
    throw new Error(
      "Not enough available sender addresses for remainingCount.",
    );
  }

  return {
    targetCount,
    remainingCount,
    availableSenderAddresses,
    currentSubmittedCount: snapshot.submittedCount,
    maxSlots: snapshot.maxSlots,
  };
}

function ensureUniqueSenderPool(senderPool: readonly string[]): void {
  const seen = new Set<string>();

  for (const senderAddress of senderPool) {
    if (seen.has(senderAddress)) {
      throw new Error(`Sender pool contains duplicate address: ${senderAddress}`);
    }

    seen.add(senderAddress);
  }
}
