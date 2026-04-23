import Link from "next/link";

import { getAdminHealth, type AdminHealthSummary } from "../../lib/admin/health";
import { getAthleteCatalog } from "../../lib/catalog";
import { loadPublicEnv } from "../../lib/env";
import {
  getAdminUnitSnapshot,
  getCurrentUnitIdForAthlete,
  type AdminUnitSnapshot,
} from "../../lib/sui";

import {
  AdminClient,
  type AdminAthleteEntry,
} from "./admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage(): Promise<React.ReactElement> {
  const [athletes, health] = await Promise.all([
    loadInitialAthletes(),
    getAdminHealth(),
  ]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#2e2210,_#13100b_55%,_#060504)] px-6 py-16 text-stone-100">
      <div className="mx-auto grid max-w-6xl gap-8">
        <nav>
          <Link
            className="text-sm uppercase tracking-[0.3em] text-amber-200/80 hover:text-amber-100"
            href="/"
          >
            ← Demo home
          </Link>
        </nav>

        <header className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">
            Operator
          </p>
          <h1 className="font-serif text-4xl text-white md:text-5xl">
            Demo admin console
          </h1>
          <p className="max-w-3xl text-base leading-7 text-stone-200">
            Upload the target image, create the next unit, rotate the current
            unit, and retry finalize from one page.
          </p>
        </header>

        <AdminClient initialAthletes={athletes} initialHealth={health} />
      </div>
    </main>
  );
}

async function loadInitialAthletes(): Promise<readonly AdminAthleteEntry[]> {
  const catalog = await getAthleteCatalog();

  try {
    const { registryObjectId } = loadPublicEnv(process.env);

    return await Promise.all(
      catalog.map(async (athlete) => {
        try {
          const unitId = await getCurrentUnitIdForAthlete(
            athlete.athletePublicId,
            {
              registryObjectId,
            },
          );

          if (!unitId) {
            return buildEntry(athlete, "missing", null);
          }

          return buildEntry(
            athlete,
            "ready",
            await getAdminUnitSnapshot(unitId),
          );
        } catch (error) {
          console.error(
            `Failed to load admin entry for athlete ${athlete.athletePublicId}`,
            error,
          );

          return buildEntry(athlete, "unavailable", null);
        }
      }),
    );
  } catch (error) {
    console.error("Admin page is missing required env", error);

    return catalog.map((athlete) => buildEntry(athlete, "unavailable", null));
  }
}

function buildEntry(
  athlete: {
    readonly athletePublicId: string;
    readonly displayName: string;
    readonly slug: string;
    readonly thumbnailUrl: string;
  },
  lookupState: AdminAthleteEntry["lookupState"],
  currentUnit: AdminUnitSnapshot | null,
): AdminAthleteEntry {
  return {
    ...athlete,
    currentUnit,
    lookupState,
  };
}
