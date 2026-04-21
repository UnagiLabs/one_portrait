/**
 * Home — lists every athlete in the off-chain catalog and, for each, shows
 * the current on-chain unit progress (from the `Registry` → `Unit` lookup).
 *
 * Server Component:
 *   - `getAthleteCatalog()` is the single off-chain source of truth for
 *     display metadata (name, slug, thumbnail).
 *   - `getCurrentUnitIdForAthlete()` + `getUnitProgress()` fetch the on-chain
 *     progress. Both are wrapped in try/catch so an env miss or a slow
 *     fullnode degrades the card to a waiting state instead of crashing the
 *     whole page.
 *
 * Hook points (kept as comments so reviewers can find the intended seams
 * without dead code):
 *   - Per-card submit CTA (zkLogin + Enoki Sponsored Tx) → later issue.
 *   - Catalog → CMS / signed JSON manifest swap → out of scope.
 */

import { unitTileCount } from "@one-portrait/shared";
import Link from "next/link";

import { getAthleteCatalog } from "../lib/catalog";
import { loadPublicEnv } from "../lib/env";
import { getCurrentUnitIdForAthlete, getUnitProgress } from "../lib/sui";

type CardProgress =
  | {
      readonly kind: "active";
      readonly unitId: string;
      readonly submittedCount: number;
      readonly maxSlots: number;
    }
  | { readonly kind: "waiting" }
  | { readonly kind: "unavailable" };

type ResolvedEnv = {
  readonly registryObjectId: string;
};

const FALLBACK_MAX_SLOTS = unitTileCount;

export default async function HomePage(): Promise<React.ReactElement> {
  const catalog = await getAthleteCatalog();
  const env = safeLoadEnv();

  const entries = await Promise.all(
    catalog.map(async (athlete) => ({
      athlete,
      progress: env
        ? await resolveProgress(athlete.athletePublicId, env)
        : ({ kind: "unavailable" } as CardProgress),
    })),
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#15366d,_#071120_55%,_#02060d)] px-6 py-16 text-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <section className="grid gap-6 rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-200/80">
            one portrait
          </p>
          <h1 className="max-w-3xl font-serif text-5xl leading-tight text-white md:text-6xl">
            {unitTileCount} faces, one reveal.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-200">
            Pick an athlete to open their waiting room. Each mosaic reveals the
            moment the {unitTileCount}th photo lands.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          {entries.map(({ athlete, progress }) => (
            <AthleteCard
              key={athlete.athletePublicId}
              athlete={athlete}
              progress={progress}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

type AthleteCardProps = {
  readonly athlete: {
    readonly athletePublicId: string;
    readonly slug: string;
    readonly displayName: string;
    readonly thumbnailUrl: string;
  };
  readonly progress: CardProgress;
};

function AthleteCard({
  athlete,
  progress,
}: AthleteCardProps): React.ReactElement {
  const body = (
    <article className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7 transition hover:border-cyan-200/40">
      {/* External placeholder URL — keeping <img> over next/image so no
          remotePatterns config is needed for the demo. */}
      {/* biome-ignore lint: placeholder CDN, intentional use of <img>. */}
      <img
        alt={athlete.displayName}
        className="h-40 w-40 self-center rounded-2xl border border-white/10 object-cover"
        src={athlete.thumbnailUrl}
      />
      <div className="grid gap-1 text-center">
        <h2 className="font-serif text-2xl text-white">
          {athlete.displayName}
        </h2>
        <p className="font-mono text-xs text-slate-400">{athlete.slug}</p>
      </div>
      <ProgressLabel progress={progress} />
    </article>
  );

  if (progress.kind === "active") {
    return (
      <Link className="contents" href={`/units/${progress.unitId}`}>
        {body}
      </Link>
    );
  }
  return body;
}

function ProgressLabel({
  progress,
}: {
  readonly progress: CardProgress;
}): React.ReactElement {
  if (progress.kind === "active") {
    return (
      <p className="font-mono text-lg tabular-nums text-white">
        {progress.submittedCount} / {progress.maxSlots}
      </p>
    );
  }
  if (progress.kind === "waiting") {
    return (
      <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">
        待機中 / No active unit
      </p>
    );
  }
  return (
    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
      Progress unavailable
    </p>
  );
}

function safeLoadEnv(): ResolvedEnv | null {
  try {
    const env = loadPublicEnv(process.env);
    return { registryObjectId: env.registryObjectId };
  } catch {
    return null;
  }
}

async function resolveProgress(
  athletePublicId: string,
  env: ResolvedEnv,
): Promise<CardProgress> {
  try {
    const unitId = await getCurrentUnitIdForAthlete(athletePublicId, {
      registryObjectId: env.registryObjectId,
    });
    if (!unitId) {
      return { kind: "waiting" };
    }
    try {
      const view = await getUnitProgress(unitId);
      return {
        kind: "active",
        unitId,
        submittedCount: view.submittedCount,
        maxSlots: view.maxSlots,
      };
    } catch {
      return {
        kind: "active",
        unitId,
        submittedCount: 0,
        maxSlots: FALLBACK_MAX_SLOTS,
      };
    }
  } catch {
    return { kind: "unavailable" };
  }
}
