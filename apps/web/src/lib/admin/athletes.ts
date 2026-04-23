import {
  getAdminUnitSnapshot,
  type AdminUnitSnapshot,
  listRegistryAthletes,
} from "../sui";

export type AdminAthleteEntry = {
  readonly athletePublicId: string;
  readonly currentUnit: AdminUnitSnapshot | null;
  readonly displayName: string;
  readonly lookupState: "missing" | "ready" | "unavailable";
  readonly metadataState: "missing" | "ready";
  readonly slug: string;
  readonly thumbnailUrl: string;
};

export async function loadAdminAthletes(): Promise<
  readonly AdminAthleteEntry[]
> {
  const athletes = await listRegistryAthletes();

  return Promise.all(
    athletes.map(async (athlete) => {
      if (!athlete.currentUnitId) {
        return buildEntry(athlete, "missing", null);
      }

      try {
        return buildEntry(
          athlete,
          "ready",
          await getAdminUnitSnapshot(athlete.currentUnitId),
        );
      } catch (error) {
        console.error(
          `Failed to load admin unit snapshot for athlete ${athlete.athletePublicId}`,
          error,
        );

        return buildEntry(athlete, "unavailable", null);
      }
    }),
  );
}

function buildEntry(
  athlete: Awaited<ReturnType<typeof listRegistryAthletes>>[number],
  lookupState: AdminAthleteEntry["lookupState"],
  currentUnit: AdminUnitSnapshot | null,
): AdminAthleteEntry {
  const fallbackLabel = `Athlete #${athlete.athletePublicId}`;

  return {
    athletePublicId: athlete.athletePublicId,
    currentUnit,
    displayName: athlete.metadata?.displayName ?? fallbackLabel,
    lookupState,
    metadataState: athlete.metadata ? "ready" : "missing",
    slug: athlete.metadata?.slug ?? `athlete-${athlete.athletePublicId}`,
    thumbnailUrl:
      athlete.metadata?.thumbnailUrl ??
      `https://placehold.co/512x512/png?text=Athlete+${athlete.athletePublicId}`,
  };
}
