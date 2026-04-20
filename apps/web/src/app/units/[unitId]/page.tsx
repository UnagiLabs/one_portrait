/**
 * `/units/[unitId]` — waiting room for a single on-chain `Unit`.
 *
 * Server Component:
 *   - Reads the initial progress (`submittedCount / maxSlots`) from Sui.
 *   - Resolves the athlete display metadata via the catalog.
 *   - Hands both off to <LiveProgress/>, which keeps the counter ticking
 *     via `useUnitEvents` once the page hydrates on the client.
 *
 * RPC / env failures degrade gracefully to a "waiting" state instead of
 * throwing — the demo must not white-screen if a fullnode is slow.
 */
import Link from "next/link";

import { getAthleteByPublicId } from "../../../lib/catalog";
import { loadPublicEnv } from "../../../lib/env";
import { getUnitProgress } from "../../../lib/sui";

import { LiveProgress } from "./live-progress";
import { ParticipationAccess } from "./participation-access";

type UnitPageProps = {
  readonly params: Promise<{ readonly unitId: string }>;
};

type ResolvedProgress = {
  readonly submittedCount: number;
  readonly maxSlots: number;
  readonly athletePublicId: string | null;
};

const FALLBACK_MAX_SLOTS = 500;

export default async function UnitPage(
  props: UnitPageProps,
): Promise<React.ReactElement> {
  const { unitId } = await props.params;

  const packageId = safePackageId();
  const progress = await safeGetUnitProgress(unitId);
  const athlete = progress.athletePublicId
    ? await safeGetAthleteByPublicId(progress.athletePublicId)
    : null;

  const displayName = athlete?.displayName ?? "Athlete";
  const thumbnailUrl = athlete?.thumbnailUrl ?? null;

  const hasProgress =
    progress.submittedCount >= 0 && progress.athletePublicId !== null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#15366d,_#071120_55%,_#02060d)] px-6 py-16 text-slate-50">
      <div className="mx-auto grid max-w-3xl gap-8">
        <nav>
          <Link
            className="text-sm uppercase tracking-[0.3em] text-cyan-200/80 hover:text-cyan-100"
            href="/"
          >
            ← All athletes
          </Link>
        </nav>

        <header className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/6 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          {thumbnailUrl ? (
            // Intentionally using <img> over next/image: the MVP thumbnails
            // are external placeholder URLs and we want zero deploy-time
            // config for remotePatterns. Swap when real Walrus CDN lands.
            // biome-ignore lint: placeholder CDN, intentional use of <img>.
            <img
              alt={displayName}
              className="h-32 w-32 rounded-2xl border border-white/10 object-cover"
              src={thumbnailUrl}
            />
          ) : null}
          <div className="grid gap-1">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
              Waiting room
            </p>
            <h1 className="font-serif text-4xl text-white">{displayName}</h1>
            <p className="font-mono text-xs text-slate-400 break-all">
              {unitId}
            </p>
          </div>
        </header>

        <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">
            Progress
          </p>
          {hasProgress ? (
            <div className="mt-4">
              <LiveProgress
                initialSubmittedCount={progress.submittedCount}
                maxSlots={progress.maxSlots}
                packageId={packageId ?? ""}
                unitId={unitId}
              />
            </div>
          ) : (
            <p className="mt-4 text-slate-300">
              待機中 / No active unit — on-chain progress is not available right
              now.
            </p>
          )}
        </section>

        <ParticipationAccess />

        {/*
         * Hook points for follow-up issues (kept as comments so reviewers can
         * see the intended seams without dead components floating around):
         *   - Submit button: zkLogin login + Enoki Sponsored Tx invoking
         *     `PACKAGE_ID::accessors::submit_photo`.
         *   - Reveal overlay: listen for MosaicReadyEvent on LiveProgress and
         *     render the mosaic blob from Walrus (client-only).
         *   - /api/finalize trigger: fire-and-forget POST on UnitFilledEvent.
         */}
      </div>
    </main>
  );
}

function safePackageId(): string | null {
  try {
    return loadPublicEnv(process.env).packageId;
  } catch {
    return null;
  }
}

async function safeGetUnitProgress(unitId: string): Promise<ResolvedProgress> {
  try {
    const view = await getUnitProgress(unitId);
    return {
      submittedCount: view.submittedCount,
      maxSlots: view.maxSlots,
      athletePublicId: view.athletePublicId,
    };
  } catch {
    return {
      submittedCount: -1,
      maxSlots: FALLBACK_MAX_SLOTS,
      athletePublicId: null,
    };
  }
}

async function safeGetAthleteByPublicId(athletePublicId: string) {
  try {
    return (await getAthleteByPublicId(athletePublicId)) ?? null;
  } catch {
    return null;
  }
}
