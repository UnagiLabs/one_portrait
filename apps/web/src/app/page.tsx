import { unitTileCount, unitTileGrid } from "@one-portrait/shared";
import Link from "next/link";

const mosaicAspectRatio = `${unitTileGrid.cols} / ${unitTileGrid.rows}`;

import { getAthleteCatalog } from "../lib/catalog";
import {
  getDemoCurrentUnitIdForAthlete,
  getDemoUnitProgress,
  isDemoModeEnabled,
} from "../lib/demo";
import { getActiveHomeUnits, RegistrySchemaError } from "../lib/sui";

function formatProgressCount(value: number): string {
  return String(value);
}

type HomePageProps = {
  readonly searchParams?: Promise<{
    readonly op_e2e_home_card_state?: string;
  }>;
};

type HomeEntry = {
  readonly athletePublicId: string;
  readonly displayName: string;
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

  const firstActive = entries.find(
    (
      entry,
    ): entry is HomeEntry & {
      readonly progress: { readonly kind: "active" } & HomeEntry["progress"];
    } => entry.progress.kind === "active",
  );

  return (
    <main className="grain relative min-h-screen overflow-hidden text-[var(--ink)]">
      <section className="relative grid gap-0 border-b border-[var(--rule)] lg:grid-cols-[1.1fr_1fr]">
        <div className="relative flex flex-col justify-between gap-12 border-b border-[var(--rule)] p-8 md:p-14 lg:border-r lg:border-b-0 lg:p-16">
          <div className="grid gap-7">
            <div className="op-eyebrow">
              <span className="bar" />
              <span>ONE Samurai · 2026.04.29 · Ariake Arena</span>
            </div>
            <h1 className="op-hero-title">
              <span className="line">{unitTileCount.toLocaleString()}</span>
              <span className="line">
                <span className="accent">fans,</span>
              </span>
              <span className="line">one reveal.</span>
            </h1>
            <p className="max-w-[460px] text-base leading-[1.55] text-[var(--ink-dim)]">
              A non-profit, on-chain co-creation experience.{" "}
              <b className="font-medium text-[var(--ink)]">
                {unitTileCount.toLocaleString()} fans.
              </b>{" "}
              <b className="font-medium text-[var(--ink)]">One photo each.</b>{" "}
              The moment the final tile lands, a single high-resolution mosaic
              is unveiled simultaneously to everyone — and a soulbound Kakera
              NFT is minted to every participant.
            </p>
            <div className="grid grid-cols-3 border-t border-[var(--rule)] pt-4">
              <HeroMeta k="Unit size" v={unitTileCount.toLocaleString()} />
              <HeroMeta em k="Gas cost" v="0 SUI" />
              <HeroMeta k="Transferable" v="Never" />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <a className="op-btn-primary" href="#arena">
                <span>Enter The Arena</span>
                <ArrowRight />
              </a>
              <Link className="op-btn-ghost" href="/gallery">
                Participation history
              </Link>
            </div>
          </div>
          <HeroFoot firstActive={firstActive ?? null} />
        </div>
        <div
          className="relative hidden min-h-[420px] place-items-center overflow-hidden lg:grid"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, rgba(255, 122, 26, 0.18), transparent 70%)",
          }}
        >
          <TeaserPanel />
        </div>
      </section>

      <section className="relative grid gap-10 p-8 md:p-14 lg:p-16" id="arena">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--rule)] pb-5">
          <div className="grid gap-4">
            <div className="op-eyebrow">
              <span className="bar" />
              <span>Step 01 — Pick your warrior</span>
            </div>
            <h2 className="font-display text-[clamp(40px,6vw,72px)] leading-[0.95] text-[var(--ink)]">
              Choose{" "}
              <em className="font-serif-display not-italic text-[var(--ember)]">
                <span className="italic">who</span>
              </em>
              <br />
              you stand for.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-[1.55] text-[var(--ink-dim)]">
            Each active unit holds {unitTileCount.toLocaleString()} tiles. Once
            filled, the mosaic is revealed to every participant at the same
            moment — and can never be filled again.
          </p>
        </div>

        {entries.length === 0 ? (
          <article className="op-surface grid gap-2 text-[var(--ink)]">
            <h3 className="font-display text-2xl">
              現在表示できる開催中ユニットはありません
            </h3>
            <p className="text-sm leading-6 text-[var(--ink-dim)]">
              `pending` な unit が作成されると、 ここに自動で表示されます。
            </p>
          </article>
        ) : (
          <div className="grid gap-px bg-[var(--rule)] md:grid-cols-2 xl:grid-cols-4">
            {entries.map((athlete, idx) => (
              <AthleteCard
                athlete={athlete}
                idx={idx}
                key={athlete.athletePublicId}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function HeroMeta({
  k,
  v,
  em,
}: {
  readonly k: string;
  readonly v: string;
  readonly em?: boolean;
}): React.ReactElement {
  return (
    <div className="px-0 pr-4 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-[var(--rule)] [&:not(:first-child)]:pl-5">
      <div className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
        {k}
      </div>
      <div
        className={`mt-1.5 font-display text-[26px] tracking-[0.02em] ${
          em ? "text-[var(--ember)]" : "text-[var(--ink)]"
        }`}
      >
        {v}
      </div>
    </div>
  );
}

function HeroFoot({
  firstActive,
}: {
  readonly firstActive:
    | (HomeEntry & {
        readonly progress: { readonly kind: "active" } & HomeEntry["progress"];
      })
    | null;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 font-mono-op text-[11px] tracking-[0.08em] text-[var(--ink-dim)]">
      <div>
        <div className="mb-2">
          {firstActive
            ? `Live unit — ${firstActive.displayName}`
            : "Live registry"}
        </div>
        <div className="font-display text-[56px] leading-none text-[var(--ink)]">
          {firstActive && firstActive.progress.kind === "active" ? (
            <>
              <em className="not-italic text-[var(--ember)]">
                {formatProgressCount(firstActive.progress.submittedCount)}
              </em>
              <span className="text-[var(--ink-faint)]"> / </span>
              {formatProgressCount(firstActive.progress.maxSlots)}
            </>
          ) : (
            <span className="text-[var(--ink-faint)]">— / —</span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div>Sui Testnet · Walrus · Move</div>
        <div className="mt-1 text-[var(--ink-faint)]">
          one_portrait::registry
        </div>
      </div>
    </div>
  );
}

function TeaserPanel(): React.ReactElement {
  return (
    <div
      className="relative w-[78%]"
      style={{ aspectRatio: mosaicAspectRatio }}
    >
      <div className="absolute -top-7 left-0 flex items-center gap-2.5 font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--ember)]"
          style={{ animation: "op-pulse 1.2s infinite" }}
        />
        <span>Hidden until reveal</span>
      </div>
      <div className="op-corners">
        <i className="tl" />
        <i className="tr" />
        <i className="bl" />
        <i className="br" />
      </div>
      <div className="relative h-full w-full overflow-hidden">
        {/* biome-ignore lint/performance/noImgElement: demo teaser asset */}
        <img
          alt=""
          aria-hidden
          className="h-full w-full object-cover"
          src="/demo/demo_mozaiku.png"
          style={{ filter: "blur(18px) saturate(1.2) brightness(0.9)" }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,122,26,0.25), rgba(212,50,14,0.18) 45%, rgba(10,6,4,0.55))",
            mixBlendMode: "multiply",
          }}
        />
      </div>
    </div>
  );
}

function AthleteCard({
  athlete,
  idx,
}: {
  readonly athlete: HomeEntry;
  readonly idx: number;
}): React.ReactElement {
  const href =
    athlete.progress.unitId !== null
      ? buildWaitingRoomHref(athlete.progress.unitId, athlete.displayName)
      : null;
  const isActive = athlete.progress.kind === "active";
  const statusLabel =
    athlete.progress.kind === "active"
      ? "LIVE"
      : athlete.progress.kind === "waiting"
        ? "WAITING"
        : "UNAVAILABLE";
  const body = (
    <article
      className={`op-athlete-card ${
        athlete.progress.kind === "unavailable" ? "is-unavailable" : ""
      }`}
    >
      <div className="grid gap-3">
        <div className="flex items-start justify-between">
          <div className="font-mono-op text-[11px] tracking-[0.14em] text-[var(--ink-faint)]">
            {String(idx + 1).padStart(2, "0")}
          </div>
          <div className="flex items-center gap-2 font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ember)]">
            {isActive ? <span className="op-status-dot" /> : null}
            <span>{statusLabel}</span>
          </div>
        </div>
        {/* biome-ignore lint/performance/noImgElement: operator card thumbnail */}
        <img
          alt={athlete.displayName}
          className="h-36 w-full object-cover grayscale-[0.2]"
          src={athlete.thumbnailUrl}
        />
        <div className="grid gap-1">
          <h2 className="font-display text-[32px] leading-[0.95] tracking-[-0.01em] text-[var(--ink)]">
            {athlete.displayName}
          </h2>
        </div>
      </div>
      <div className="grid gap-2">
        <ProgressLabel progress={athlete.progress} />
      </div>
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

function ArrowRight(): React.ReactElement {
  return (
    <svg
      className="h-2.5 w-6"
      fill="none"
      viewBox="0 0 24 10"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>arrow</title>
      <path
        d="M0 5 H22 M17 1 L22 5 L17 9"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    </svg>
  );
}

async function loadChainEntries(): Promise<readonly HomeEntry[]> {
  try {
    const units = await getActiveHomeUnits();
    return units.map((unit) => ({
      athletePublicId: unit.athletePublicId,
      displayName: unit.displayName,
      thumbnailUrl: unit.thumbnailUrl,
      progress: {
        kind: "active" as const,
        maxSlots: unit.maxSlots,
        submittedCount: unit.submittedCount,
        unitId: unit.unitId,
      },
    }));
  } catch (error) {
    if (error instanceof RegistrySchemaError) {
      console.error(
        `Configured NEXT_PUBLIC_REGISTRY_OBJECT_ID ${error.objectId} does not match the current contract schema.`,
        error,
      );
      return [];
    }

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
    const pct =
      progress.maxSlots > 0
        ? (progress.submittedCount / progress.maxSlots) * 100
        : 0;
    return (
      <>
        <div className="flex items-baseline justify-between font-mono-op text-[11px] text-[var(--ink-dim)]">
          <div>
            <span className="sr-only">
              {`${formatProgressCount(progress.submittedCount)} / ${formatProgressCount(progress.maxSlots)}`}
            </span>
            <span className="font-display text-[22px] text-[var(--ink)]">
              {formatProgressCount(progress.submittedCount)}
            </span>
            <span className="text-[var(--ink-faint)]">
              {" "}
              / {formatProgressCount(progress.maxSlots)}
            </span>
          </div>
          <div>{Math.round(pct)}%</div>
        </div>
        <div className="op-progress-bar">
          <div className="op-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </>
    );
  }

  if (progress.kind === "waiting") {
    return (
      <p className="font-mono-op text-[11px] uppercase tracking-[0.3em] text-[var(--ember)]">
        待機中 / No active unit
      </p>
    );
  }

  return (
    <p className="font-mono-op text-[11px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
      進捗を一時取得できません / Progress temporarily unavailable
    </p>
  );
}
