import { unitTileCount, unitTileGrid } from "@one-portrait/shared";
import Link from "next/link";

import { type AthleteCatalogEntry, getAthleteCatalog } from "../lib/catalog";
import { getDemoUnitProgress, isDemoModeEnabled } from "../lib/demo";
import { getActiveHomeUnits, RegistrySchemaError } from "../lib/sui";
import {
  HomeMosaicReveal,
  HomeScrollMotion,
  HomeSubmitSection,
} from "./home-experience";

const mosaicAspectRatio = `${unitTileGrid.cols} / ${unitTileGrid.rows}`;

function formatProgressCount(value: number): string {
  return String(value);
}

type HomePageProps = {
  readonly searchParams?: Promise<{
    readonly op_e2e_home_card_state?: string;
  }>;
};

type HomeEntry = {
  readonly unitId: string | null;
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

type PortraitWork = Pick<
  AthleteCatalogEntry,
  "displayName" | "slug" | "thumbnailUrl"
> & {
  readonly href?: string;
  readonly progressLabel?: string;
  readonly region: string;
  readonly state?: "complete" | "live" | "unavailable";
  readonly status: string;
};

function buildPortraitWorkRail(
  catalog: readonly AthleteCatalogEntry[],
  entries: readonly HomeEntry[],
) {
  const works = catalog.map((catalogEntry, index): PortraitWork => {
    const work = toPortraitWork(catalogEntry);
    const entry = entries[index];
    if (!entry) {
      return work;
    }

    const isComplete =
      entry.progress.kind === "active" &&
      entry.progress.submittedCount >= entry.progress.maxSlots;
    const progressLabel =
      entry.progress.kind === "active"
        ? `${formatProgressCount(entry.progress.submittedCount)} / ${formatProgressCount(entry.progress.maxSlots)}`
        : undefined;

    return {
      ...work,
      href:
        !isComplete && entry.progress.unitId !== null
          ? buildWaitingRoomHref(entry.progress.unitId, work.displayName)
          : undefined,
      progressLabel,
      state:
        entry.progress.kind === "active"
          ? isComplete
            ? "complete"
            : "live"
          : entry.progress.kind === "unavailable"
            ? "unavailable"
            : undefined,
      status: getPortraitWorkStatus(entry.progress, isComplete),
    };
  });

  return [
    ...works.map((work) => ({ ...work, railId: `first-${work.slug}` })),
    ...works.map((work) => ({ ...work, railId: `second-${work.slug}` })),
  ];
}

function toPortraitWork(entry: AthleteCatalogEntry): PortraitWork {
  return {
    displayName: entry.displayName,
    region: entry.region ?? "",
    slug: entry.slug,
    status: entry.status ?? "",
    thumbnailUrl: entry.thumbnailUrl,
  };
}

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
  const catalog = await getAthleteCatalog();
  const portraitWorkRail = buildPortraitWorkRail(catalog, entries);

  return (
    <main className="grain relative min-h-screen overflow-hidden text-[var(--ink)]">
      <HomeScrollMotion />
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
              <a className="op-btn-primary" href="#portrait-works">
                <span>Enter The Arena</span>
                <ArrowRight />
              </a>
              <Link className="op-btn-ghost" href="/gallery">
                Participation history
              </Link>
            </div>
          </div>
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

      <section
        aria-label="Available portrait works"
        id="portrait-works"
        className="op-home-portrait-flow"
      >
        <div className="op-home-portrait-flow-head">
          <div className="grid gap-3">
            <div className="op-eyebrow">
              <span className="bar" />
              <span>Step 01 — Choose your portrait</span>
            </div>
            <h2 className="op-home-scroll-reveal" data-op-motion="headline">
              Choose the portrait you help complete.
            </h2>
          </div>
          <p>
            Each portrait opens as a shared unit. Pick who you stand for, submit
            one photo, and become part of the final reveal.
          </p>
        </div>
        <div className="op-home-portrait-rail">
          <div className="op-home-portrait-track">
            {portraitWorkRail.map((work) => (
              <PortraitWorkCard key={work.railId} work={work} />
            ))}
          </div>
        </div>
      </section>

      <HomeSubmitSection />

      <HomeMosaicReveal />
    </main>
  );
}

function PortraitWorkCard({
  work,
}: {
  readonly work: PortraitWork & { readonly railId: string };
}): React.ReactElement {
  const isComplete = work.state === "complete";
  const isLive = work.state === "live";
  const isUnavailable = work.state === "unavailable";
  const card = (
    <article
      className={`op-home-portrait-card${isLive ? " is-live" : ""}${
        isComplete ? " is-complete" : ""
      }`}
      data-complete={isComplete ? "true" : undefined}
      data-live={isLive ? "true" : undefined}
      data-unavailable={isUnavailable ? "true" : undefined}
    >
      {/* biome-ignore lint/performance/noImgElement: temporary public portrait artwork */}
      <img alt={work.displayName} src={work.thumbnailUrl} />
      {isLive ? (
        <div className="op-home-portrait-card-badge is-live">
          <span />
          <b className="sr-only">Live</b>
        </div>
      ) : null}
      {isComplete ? (
        <div className="op-home-portrait-card-badge is-complete">
          <span />
          <b>Complete</b>
        </div>
      ) : null}
      <div className="op-home-portrait-card-body">
        <div className="flex items-center justify-between gap-4">
          <span>{work.region}</span>
          <span
            className={`op-home-portrait-card-status${
              isLive ? " is-live" : ""
            }${isUnavailable ? " is-unavailable" : ""}`}
          >
            {work.status}
          </span>
        </div>
        <h3>{work.displayName}</h3>
        {work.progressLabel ? (
          <p className="op-home-portrait-card-progress">{work.progressLabel}</p>
        ) : null}
        <div className="op-home-portrait-card-meter">
          <i />
        </div>
      </div>
    </article>
  );

  if (!work.href) {
    return card;
  }

  return (
    <Link
      aria-label={`${work.displayName} portrait upload page`}
      className="op-home-portrait-card-link"
      href={work.href}
    >
      {card}
    </Link>
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

function TeaserPanel(): React.ReactElement {
  return (
    <div
      className="op-home-teaser-panel relative w-[78%]"
      style={{ aspectRatio: mosaicAspectRatio }}
    >
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
          className="op-home-teaser-image h-full w-full object-cover"
          src="/demo/demo_mozaiku.png"
        />
        <div className="op-home-teaser-scan" aria-hidden />
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
      unitId: unit.unitId,
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
    const unitId = athlete.unitId ?? null;
    const override = resolveE2ECardOverride(
      athlete.unitId,
      rawOverride,
      unitId,
    );
    if (override) {
      entries.push({
        ...athlete,
        unitId,
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
      unitId,
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

function getPortraitWorkStatus(
  progress: HomeEntry["progress"],
  isComplete: boolean,
): string {
  if (progress.kind === "active") {
    return isComplete ? "Complete" : "Live";
  }

  if (progress.kind === "waiting") {
    return "Waiting / No active unit";
  }

  return "Progress temporarily unavailable";
}

function resolveE2ECardOverride(
  entryUnitId: string | undefined,
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
    const [targetUnitId, kind] = token.split(":");
    if (targetUnitId !== entryUnitId) {
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
