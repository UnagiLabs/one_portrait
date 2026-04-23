import { getAthleteCatalog } from "../../../../lib/catalog";
import { loadPublicEnv } from "../../../../lib/env";
import {
  getAdminUnitSnapshot,
  getCurrentUnitIdForAthlete,
} from "../../../../lib/sui";

type AdminStatusLookupState = "missing" | "ready" | "unavailable";

export async function GET(): Promise<Response> {
  try {
    const { registryObjectId } = loadPublicEnv(process.env);
    const catalog = await getAthleteCatalog();

    const athletes = await Promise.all(
      catalog.map(async (athlete) => {
        try {
          const unitId = await getCurrentUnitIdForAthlete(
            athlete.athletePublicId,
            {
              registryObjectId,
            },
          );

          if (!unitId) {
            return {
              ...athlete,
              currentUnit: null,
              lookupState: "missing" as AdminStatusLookupState,
            };
          }

          return {
            ...athlete,
            currentUnit: await getAdminUnitSnapshot(unitId),
            lookupState: "ready" as AdminStatusLookupState,
          };
        } catch (error) {
          console.error(
            `Failed to resolve current unit for athlete ${athlete.athletePublicId}`,
            error,
          );

          return {
            ...athlete,
            currentUnit: null,
            lookupState: "unavailable" as AdminStatusLookupState,
          };
        }
      }),
    );

    return Response.json({ athletes });
  } catch (error) {
    console.error("Admin status route is unavailable", error);

    return Response.json(
      {
        code: "admin_unavailable",
        message: "Admin status route is unavailable.",
      },
      { status: 503 },
    );
  }
}
