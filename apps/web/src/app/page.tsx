import { unitTileCount } from "@one-portrait/shared";
import Link from "next/link";

import { getAthleteCatalog } from "../lib/catalog";
import {
  getDemoCurrentUnitIdForAthlete,
  getDemoUnitProgress,
  isDemoModeEnabled,
} from "../lib/demo";
import { getActiveHomeUnits } from "../lib/sui";

type HomePageProps = {
  readonly searchParams?: Promise<{
    readonly op_e2e_home_card_state?: string;
  }>;
};

type HomeEntry = {
  readonly athletePublicId: string;
  readonly displayName: string;
  readonly slug: string;
  readonly thumbnailUrl: string;
  readonly progress:
    | {
        readonly kind: "active";
        readonly maxSlots: number;
        readonly submittedCount: number;
        readonly unitId: string;
      }
    | {
        readonly kind: "waiting";
        readonly unitId: string | null;
      }
    | {
        readonly kind: "unavailable";
        readonly unitId: string | null;
      };
};

export default async function HomePage(
  props: HomePageProps = {},
): Promise<React.ReactElement> {
  const demoMode = isDemoModeEnabled(process.env);
  const searchParams = (await props.searchParams) ?? {};
  const useDemoEntries =
    demoMode || process.env.NEXT_PUBLIC_E2E_STUB_WALLET === "1";
  const entries = useDemoEntries
    ? await loadDemoEntries(searchParams.op_e2e_home_card_state)
    : await loadChainEntries();

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
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center rounded-full border border-cyan-200/40 bg-cyan-300 px-5 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-200"
              href="/gallery"
            >
              Participation history
            </Link>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          {entries.length === 0 ? (
            <article className="grid gap-2 rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7 text-slate-200 md:col-span-2">
              <h2 className="font-serif text-2xl text-white">
                現在表示できる開催中ユニットはありません
              </h2>
              <p className="text-sm leading-6">
                metadata 登録済みで `pending` な current unit が作成されると、
                ここに自動で表示されます。
              </p>
            </article>
          ) : null}

          {entries.map((athlete) => (
            <AthleteCard athlete={athlete} key={athlete.athletePublicId} />
          ))}
        </section>
      </div>
    </main>
  );
}

function AthleteCard({
  athlete,
}: {
  readonly athlete: HomeEntry;
}): React.ReactElement {
  const href =
    athlete.progress.unitId !== null
      ? buildWaitingRoomHref(athlete.progress.unitId, athlete.displayName)
      : null;
  const body = (
    <article className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7 transition hover:border-cyan-200/40">
      {/* biome-ignore lint/performance/noImgElement: operator card */}
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
      <ProgressLabel progress={athlete.progress} />
    </article>
  );

  if (!href) {
    return body;
  }

  return (
    <Link className="contents" href={href}>
      {body}
    </Link>
  );
}

async function loadChainEntries(): Promise<readonly HomeEntry[]> {
  try {
    const units = await getActiveHomeUnits();
    return units.map((unit) => ({
      athletePublicId: unit.athletePublicId,
      displayName: unit.displayName,
      slug: unit.slug,
      thumbnailUrl: unit.thumbnailUrl,
      progress: {
        kind: "active" as const,
        maxSlots: unit.maxSlots,
        submittedCount: unit.submittedCount,
        unitId: unit.unitId,
      },
    }));
  } catch (error) {
    console.error("Failed to load active home units", error);
    return [];
  }
}

async function loadDemoEntries(
  rawOverride: string | undefined,
): Promise<readonly HomeEntry[]> {
  const catalog = await getAthleteCatalog();
  const entries: HomeEntry[] = [];

  for (const athlete of catalog) {
    const unitId = getDemoCurrentUnitIdForAthlete(athlete.athletePublicId);
    const override = resolveE2ECardOverride(
      athlete.athletePublicId,
      rawOverride,
      unitId,
    );
    if (override) {
      entries.push({
        ...athlete,
        progress: override,
      });
      continue;
    }

    if (!unitId) {
      continue;
    }

    const progress = getDemoUnitProgress(unitId);
    if (!progress) {
      continue;
    }

    entries.push({
      ...athlete,
      progress: {
        kind: "active",
        maxSlots: progress.maxSlots,
        submittedCount: progress.submittedCount,
        unitId,
      },
    });
  }

  return entries;
}

function buildWaitingRoomHref(unitId: string, athleteName: string): string {
  const params = new URLSearchParams({ athleteName });
  return `/units/${unitId}?${params.toString()}`;
}

function resolveE2ECardOverride(
  athletePublicId: string,
  rawOverride: string | undefined,
  unitId: string | null,
):
  | {
      readonly kind: "waiting";
      readonly unitId: string | null;
    }
  | {
      readonly kind: "unavailable";
      readonly unitId: string | null;
    }
  | null {
  if (process.env.NEXT_PUBLIC_E2E_STUB_WALLET !== "1" || !rawOverride) {
    return null;
  }

  const tokens = rawOverride
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const [targetAthleteId, kind] = token.split(":");
    if (targetAthleteId !== athletePublicId) {
      continue;
    }

    if (kind === "waiting") {
      return { kind: "waiting", unitId };
    }

    if (kind === "unavailable") {
      return { kind: "unavailable", unitId };
    }
  }

  return null;
}

function ProgressLabel({
  progress,
}: {
  readonly progress: HomeEntry["progress"];
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
      進捗を一時取得できません / Progress temporarily unavailable
    </p>
  );
}
