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
import { unitTileCount } from "@one-portrait/shared";
import Link from "next/link";

import { getAthleteByPublicId } from "../../../lib/catalog";
import { getDemoUnitProgress, isDemoModeEnabled } from "../../../lib/demo";
import {
  STUB_ATHLETE_ID,
  STUB_MASTER_ID,
  STUB_UNIT_ID,
} from "../../../lib/e2e/stub-data";
import { getUnitProgress } from "../../../lib/sui";
import type { WalrusEnv } from "../../../lib/walrus/put";

import { ParticipationAccess } from "./participation-access";
import { UnitRevealClient } from "./unit-reveal-client";

type UnitPageProps = {
  readonly params: Promise<{ readonly unitId: string }>;
  readonly searchParams: Promise<{
    readonly athleteName?: string;
    readonly op_e2e_unit_progress?: string;
  }>;
};

type ResolvedProgress = {
  readonly displayName: string | null;
  readonly submittedCount: number;
  readonly maxSlots: number;
  readonly athletePublicId: string | null;
  readonly masterId: string | null;
  readonly thumbnailUrl: string | null;
};

const FALLBACK_MAX_SLOTS = unitTileCount;
const VALID_SUI_NETWORKS = new Set([
  "mainnet",
  "testnet",
  "devnet",
  "localnet",
]);

export default async function UnitPage(
  props: UnitPageProps,
): Promise<React.ReactElement> {
  const { unitId } = await props.params;
  const searchParams = await props.searchParams;
  const demoMode = isDemoModeEnabled(process.env);
  const e2eBootstrapProgress = resolveE2EUnitProgress(
    unitId,
    searchParams.op_e2e_unit_progress,
  );

  const startupEnabled = hasValidStartupEnv();
  const packageId = readOptionalPublicValue("NEXT_PUBLIC_PACKAGE_ID");
  const walrusEnv = readWalrusEnv();
  const aggregatorBase = readOptionalPublicValue(
    "NEXT_PUBLIC_WALRUS_AGGREGATOR",
  );
  const progress = demoMode
    ? safeGetDemoUnitProgress(unitId)
    : (e2eBootstrapProgress ?? (await safeGetUnitProgress(unitId)));
  const athlete =
    demoMode && progress.athletePublicId
    ? await safeGetAthleteByPublicId(progress.athletePublicId)
    : null;

  const displayName = resolveDisplayName(
    searchParams.athleteName,
    progress.displayName ?? athlete?.displayName ?? null,
  );
  const thumbnailUrl = progress.thumbnailUrl ?? athlete?.thumbnailUrl ?? null;

  const hasProgress =
    progress.submittedCount >= 0 && progress.athletePublicId !== null;

  return (
    <main className="grain relative min-h-screen overflow-hidden text-[var(--ink)]">
      <div className="mx-auto grid max-w-6xl gap-px bg-[var(--rule)] lg:grid-cols-[1fr_380px]">
        <section className="relative flex min-h-[80vh] flex-col justify-between gap-10 bg-[var(--bg-2)] p-8 md:p-12 lg:p-14">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 45%, rgba(255, 122, 26, 0.08), transparent 65%)",
            }}
          />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <nav className="flex flex-wrap items-center gap-4">
              <Link
                className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)] hover:text-[var(--ink)]"
                href="/"
              >
                ← All athletes
              </Link>
              <Link
                className="font-mono-op text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)] hover:text-[var(--ink)]"
                href="/gallery"
              >
                Participation history
              </Link>
            </nav>
            <div className="text-right font-mono-op text-[11px] text-[var(--ink-dim)]">
              <div>
                {displayName}{" "}
                <span className="text-[var(--ember)]">— UNIT</span>
              </div>
              <div className="mt-1 break-all text-[var(--ink-faint)]">
                one_portrait::unit · {unitId.slice(0, 10)}…
              </div>
            </div>
          </div>

          <div className="relative z-10 grid justify-items-center gap-6 text-center">
            <div className="op-eyebrow">
              <span className="bar" />
              <span
                className="h-2 w-2 rounded-full bg-[var(--ember)]"
                style={{
                  boxShadow: "0 0 14px var(--ember)",
                  animation: "op-pulse 1s infinite",
                }}
              />
              <span>UNIT ACTIVE — HIDDEN UNTIL REVEAL</span>
            </div>

            {thumbnailUrl ? (
              // biome-ignore lint: external placeholder thumbnail
              <img
                alt={displayName}
                className="h-24 w-24 rounded-none border border-[var(--rule-strong)] object-cover"
                src={thumbnailUrl}
              />
            ) : null}

            <h1 className="font-display text-[clamp(40px,7vw,88px)] leading-[0.9] tracking-[-0.01em] text-[var(--ink)]">
              {displayName}
            </h1>
            <p className="font-mono-op text-[11px] break-all text-[var(--ink-faint)]">
              {unitId}
            </p>

            <div className="mt-4 w-full">
              {hasProgress ? (
                <UnitRevealClient
                  aggregatorBase={aggregatorBase}
                  displayName={displayName}
                  eventSubscriptionEnabled={
                    startupEnabled && packageId !== null
                  }
                  initialMasterId={progress.masterId}
                  initialSubmittedCount={progress.submittedCount}
                  maxSlots={progress.maxSlots}
                  packageId={packageId}
                  startupEnabled={startupEnabled}
                  unitId={unitId}
                />
              ) : (
                <p className="font-serif-display italic text-lg text-[var(--ink-dim)]">
                  待機中 / No active unit — on-chain progress is not available
                  right now.
                </p>
              )}
            </div>
          </div>

          <div className="relative z-10 text-right font-mono-op text-[11px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Sponsored transaction · 0 SUI required
            <br />
            Soulbound mint on submit · Walrus blob storage
          </div>
        </section>

        <aside className="flex flex-col gap-6 bg-[var(--bg-2)] p-6 lg:p-7">
          {demoMode ? (
            <DemoParticipationPreview />
          ) : (
            <ParticipationAccess
              packageId={packageId}
              startupEnabled={startupEnabled}
              unitId={unitId}
              walrusEnv={walrusEnv}
            />
          )}
        </aside>
      </div>

      {/*
       * Hook points for follow-up issues (kept as comments so reviewers can
       * see the intended seams without dead components floating around):
       *   - Submit button: zkLogin login + Enoki Sponsored Tx invoking
       *     `PACKAGE_ID::accessors::submit_photo`.
       *   - Reveal overlay: listen for MosaicReadyEvent on LiveProgress and
       *     render the mosaic blob from Walrus (client-only).
       *   - /api/finalize trigger: fire-and-forget POST on UnitFilledEvent.
       */}
    </main>
  );
}

function DemoParticipationPreview(): React.ReactElement {
  return (
    <section className="grid gap-3 border border-[var(--rule)] bg-[rgba(245,239,227,0.03)] p-5">
      <p className="op-eyebrow">
        <span className="bar" />
        <span>Demo login preview</span>
      </p>
      <p className="text-sm text-[var(--ink-dim)]">
        `dev:demo` では導線だけを確認します。実際のログインや投稿は行いません。
      </p>
      <div className="flex flex-wrap gap-3">
        <button className="op-btn-primary" type="button">
          Google zkLogin
        </button>
        <button className="op-btn-ghost" type="button">
          Sui wallet
        </button>
      </div>
    </section>
  );
}

function readOptionalPublicValue(key: string): string | null {
  const raw = process.env[key];
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.length > 0 ? value : null;
}

function readWalrusEnv(): WalrusEnv {
  return {
    NEXT_PUBLIC_WALRUS_PUBLISHER:
      readOptionalPublicValue("NEXT_PUBLIC_WALRUS_PUBLISHER") ?? undefined,
    NEXT_PUBLIC_WALRUS_AGGREGATOR:
      readOptionalPublicValue("NEXT_PUBLIC_WALRUS_AGGREGATOR") ?? undefined,
  };
}

function hasValidStartupEnv(): boolean {
  const suiNetwork = readOptionalPublicValue("NEXT_PUBLIC_SUI_NETWORK");
  const registryObjectId = readOptionalPublicValue(
    "NEXT_PUBLIC_REGISTRY_OBJECT_ID",
  );

  return (
    suiNetwork !== null &&
    VALID_SUI_NETWORKS.has(suiNetwork) &&
    registryObjectId !== null
  );
}

function safeGetDemoUnitProgress(unitId: string): ResolvedProgress {
  const view = getDemoUnitProgress(unitId);
  if (!view) {
    return degradedProgress();
  }

  return {
    displayName: view.displayName,
    submittedCount: view.submittedCount,
    maxSlots: view.maxSlots,
    athletePublicId: view.athletePublicId,
    masterId: view.masterId,
    thumbnailUrl: view.thumbnailUrl,
  };
}

async function safeGetUnitProgress(unitId: string): Promise<ResolvedProgress> {
  try {
    const view = await getUnitProgress(unitId);
    return {
      displayName: view.displayName,
      submittedCount: view.submittedCount,
      maxSlots: view.maxSlots,
      athletePublicId: view.athletePublicId,
      masterId: view.masterId,
      thumbnailUrl: view.thumbnailUrl,
    };
  } catch {
    return degradedProgress();
  }
}

async function safeGetAthleteByPublicId(athletePublicId: string) {
  try {
    return (await getAthleteByPublicId(athletePublicId)) ?? null;
  } catch {
    return null;
  }
}

function resolveDisplayName(
  routeAthleteName: string | undefined,
  catalogDisplayName: string | null,
): string {
  const normalizedRouteAthleteName = routeAthleteName?.trim();
  return (
    catalogDisplayName ??
    (normalizedRouteAthleteName
      ? normalizedRouteAthleteName
      : "選手情報を一時取得できません")
  );
}

function degradedProgress(): ResolvedProgress {
  return {
    displayName: null,
    submittedCount: -1,
    maxSlots: FALLBACK_MAX_SLOTS,
    athletePublicId: null,
    masterId: null,
    thumbnailUrl: null,
  };
}

function resolveE2EUnitProgress(
  unitId: string,
  rawOverride: string | undefined,
): ResolvedProgress | null {
  if (process.env.NEXT_PUBLIC_E2E_STUB_WALLET !== "1" || !rawOverride) {
    return null;
  }

  if (rawOverride === "missing") {
    return degradedProgress();
  }

  if (rawOverride === "active") {
    return activeProgress();
  }

  if (rawOverride === "finalized" && unitId === STUB_UNIT_ID) {
    return finalizedProgress();
  }

  return null;
}

function activeProgress(): ResolvedProgress {
  return {
    displayName: "Demo Athlete One",
    submittedCount: FALLBACK_MAX_SLOTS - 1,
    maxSlots: FALLBACK_MAX_SLOTS,
    athletePublicId: "1",
    masterId: null,
    thumbnailUrl: null,
  };
}

function finalizedProgress(): ResolvedProgress {
  return {
    displayName: "Demo Athlete One",
    submittedCount: FALLBACK_MAX_SLOTS,
    maxSlots: FALLBACK_MAX_SLOTS,
    athletePublicId: STUB_ATHLETE_ID,
    masterId: STUB_MASTER_ID,
    thumbnailUrl: null,
  };
}
