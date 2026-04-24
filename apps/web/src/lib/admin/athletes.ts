import {
  type AdminUnitSnapshot,
  getAdminUnitSnapshot,
  getRegistryObject,
} from "../sui";

export type AdminAthleteEntry = {
  readonly athletePublicId: string;
  readonly currentUnit: AdminUnitSnapshot | null;
  readonly displayName: string;
  readonly entryId?: string;
  readonly lookupState: "missing" | "ready" | "unavailable";
  readonly metadataState: "missing" | "ready";
  readonly slug: string;
  readonly thumbnailUrl: string;
};

export async function loadAdminAthletes(): Promise<
  readonly AdminAthleteEntry[]
> {
  const registry = await getRegistryObject();

  return Promise.all(
    registry.unitIds.map(async (unitId) => {
      try {
        return buildEntry(await getAdminUnitSnapshot(unitId), "ready");
      } catch (error) {
        console.error(`Failed to load admin unit snapshot for unit ${unitId}`, error);
        return buildUnavailableEntry(unitId);
      }
    }),
  );
}

function buildEntry(
  currentUnit: AdminUnitSnapshot,
  lookupState: AdminAthleteEntry["lookupState"],
): AdminAthleteEntry {
  return {
    athletePublicId: currentUnit.athletePublicId,
    currentUnit,
    displayName: currentUnit.displayName,
    entryId: currentUnit.unitId,
    lookupState,
    metadataState: "ready",
    slug: `unit-${currentUnit.unitId.slice(2, 10).toLowerCase()}`,
    thumbnailUrl: currentUnit.thumbnailUrl,
  };
}

function buildUnavailableEntry(unitId: string): AdminAthleteEntry {
  return {
    athletePublicId: "unavailable",
    currentUnit: null,
    displayName: `Unit ${unitId.slice(0, 10)}…`,
    entryId: unitId,
    lookupState: "unavailable",
    metadataState: "missing",
    slug: `unit-${unitId.slice(2, 10).toLowerCase()}`,
    thumbnailUrl: "https://placehold.co/512x512/png?text=Unit",
  };
}
