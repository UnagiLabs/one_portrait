"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";

import type { AthleteCatalogEntry } from "../../lib/catalog";
import { getDemoModeSource, isDemoModeEnabled } from "../../lib/demo";
import type { GalleryEntryView, OwnedKakera } from "../../lib/sui";
import { getGalleryEntry, getSuiClient, listOwnedKakera } from "../../lib/sui";

type GalleryClientProps = {
  readonly catalog: readonly AthleteCatalogEntry[];
  readonly demoEntries?: readonly GalleryRenderableEntry[];
  readonly packageId: string;
};

type GalleryRenderableEntry = GalleryEntryView | GalleryUnavailableEntry;

type GalleryUnavailableEntry = {
  readonly unitId: string;
  readonly athletePublicId: string;
  readonly walrusBlobId: string;
  readonly submissionNo: number;
  readonly mintedAtMs: number;
  readonly status: { readonly kind: "unavailable" };
};

type CompletedGalleryEntry = Extract<
  GalleryEntryView,
  { readonly status: { readonly kind: "completed" } }
>;

type LoadState =
  | {
      readonly kind: "idle";
      readonly entries: readonly GalleryRenderableEntry[];
    }
  | {
      readonly kind: "loading";
      readonly entries: readonly GalleryRenderableEntry[];
    }
  | {
      readonly kind: "ready";
      readonly entries: readonly GalleryRenderableEntry[];
    }
  | {
      readonly kind: "error";
      readonly entries: readonly GalleryRenderableEntry[];
    };

export function GalleryClient({
  catalog,
  demoEntries,
  packageId,
}: GalleryClientProps): React.ReactElement {
  const currentAccount = useCurrentAccount();
  const [state, setState] = useState<LoadState>({
    kind: "idle",
    entries: [],
  });
  const [failedOriginalBlobIds, setFailedOriginalBlobIds] = useState<
    readonly string[]
  >([]);

  useEffect(() => {
    if (demoEntries) {
      setState({
        kind: "ready",
        entries: demoEntries,
      });
      setFailedOriginalBlobIds([]);
      return;
    }

    if (!currentAccount?.address || !packageId) {
      setState({
        kind: currentAccount?.address ? "error" : "idle",
        entries: [],
      });
      setFailedOriginalBlobIds([]);
      return;
    }

    let cancelled = false;

    setState({ kind: "loading", entries: [] });
    setFailedOriginalBlobIds([]);

    const loadEntries = async (): Promise<void> => {
      try {
        const suiClient = getSuiClient();
        const kakera = await listOwnedKakera({
          ownerAddress: currentAccount.address,
          packageId,
          suiClient,
        });

        if (cancelled) {
          return;
        }

        if (kakera.length === 0) {
          setState({ kind: "ready", entries: [] });
          return;
        }

        const resolved = await Promise.all(
          kakera.map(async (owned) => {
            try {
              return await getGalleryEntry({
                client: suiClient,
                kakera: owned,
              });
            } catch {
              return createUnavailableEntry(owned);
            }
          }),
        );

        if (cancelled) {
          return;
        }

        setState({
          kind: "ready",
          entries: resolved.sort(
            (left, right) => right.mintedAtMs - left.mintedAtMs,
          ),
        });
      } catch {
        if (!cancelled) {
          setState({ kind: "error", entries: [] });
        }
      }
    };

    void loadEntries();

    return () => {
      cancelled = true;
    };
  }, [currentAccount?.address, demoEntries, packageId]);

  if (!demoEntries && !currentAccount?.address) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
          Wallet required
        </p>
        <p className="mt-3 text-slate-200">
          Connect a wallet to view your Kakera participation history.
        </p>
      </section>
    );
  }

  if (!packageId || state.kind === "error") {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">
          Unavailable
        </p>
        <p className="mt-3 text-slate-200">
          Gallery unavailable right now. Check the public Sui configuration and
          try again.
        </p>
      </section>
    );
  }

  if (state.kind === "loading") {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
          Loading
        </p>
        <p className="mt-3 text-slate-200">Reading owned Kakera from Sui…</p>
      </section>
    );
  }

  if (state.entries.length === 0) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
          Empty
        </p>
        <p className="mt-3 text-slate-200">No Kakera found for this wallet.</p>
      </section>
    );
  }

  return (
    <section className="grid gap-6 md:grid-cols-2">
      {state.entries.map((entry) => (
        <GalleryCard
          athlete={findAthlete(catalog, entry.athletePublicId)}
          entry={entry}
          key={`${entry.unitId}:${entry.walrusBlobId}`}
          originalImageFailed={failedOriginalBlobIds.includes(
            entry.walrusBlobId,
          )}
          onOriginalImageError={() => {
            setFailedOriginalBlobIds((current) => {
              if (current.includes(entry.walrusBlobId)) {
                return current;
              }
              return [...current, entry.walrusBlobId];
            });
          }}
        />
      ))}
    </section>
  );
}

type GalleryCardProps = {
  readonly athlete: AthleteCatalogEntry | null;
  readonly entry: GalleryRenderableEntry;
  readonly originalImageFailed: boolean;
  readonly onOriginalImageError: () => void;
};

function GalleryCard({
  athlete,
  entry,
  originalImageFailed,
  onOriginalImageError,
}: GalleryCardProps): React.ReactElement {
  const completedEntry = isCompletedEntry(entry) ? entry : null;
  const displayName =
    athlete?.displayName ?? `Athlete #${entry.athletePublicId}`;
  const originalPhotoUrl = buildWalrusAggregatorUrl(entry.walrusBlobId);
  const completedMosaicUrl = completedEntry
    ? buildWalrusAggregatorUrl(completedEntry.mosaicWalrusBlobId)
    : null;

  return (
    <article className="grid gap-5 rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7">
      <div className="grid gap-1">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
          {entry.status.kind === "completed"
            ? "Completed"
            : entry.status.kind === "pending"
              ? "Pending"
              : "Unavailable"}
        </p>
        <h2 className="font-serif text-2xl text-white">{displayName}</h2>
        <p className="font-mono text-xs text-slate-400">{entry.unitId}</p>
      </div>

      <div className="grid gap-4">
        <section className="grid gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Original
          </p>
          {originalPhotoUrl && !originalImageFailed ? (
            // biome-ignore lint: Walrus aggregator image is a dynamic external URL.
            <img
              alt={`${displayName} original submission`}
              className="h-48 w-full rounded-2xl border border-white/10 object-cover"
              onError={onOriginalImageError}
              src={originalPhotoUrl}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 px-4 py-10 text-sm text-slate-300">
              Original photo unavailable
            </div>
          )}
        </section>

        {completedEntry !== null ? (
          <section className="grid gap-2">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">
              Mosaic
            </p>
            {completedMosaicUrl ? (
              // biome-ignore lint: Walrus aggregator image is a dynamic external URL.
              <img
                alt={`${displayName} completed mosaic`}
                className="w-full rounded-2xl border border-emerald-300/20 bg-slate-900/70"
                src={completedMosaicUrl}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 px-4 py-10 text-sm text-slate-300">
                Completed mosaic unavailable
              </div>
            )}
          </section>
        ) : null}
      </div>

      <dl className="grid gap-2 text-sm text-slate-200">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-400">Submission</dt>
          <dd>Submission #{entry.submissionNo}</dd>
        </div>
        {entry.status.kind === "pending" ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-400">Status</dt>
            <dd>Waiting for reveal</dd>
          </div>
        ) : entry.status.kind === "unavailable" ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-400">Status</dt>
            <dd>Entry unavailable right now</dd>
          </div>
        ) : completedEntry !== null ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">Status</dt>
              <dd>Completed</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">Master</dt>
              <dd className="font-mono text-xs break-all">
                Master {completedEntry.masterId}
              </dd>
            </div>
            {completedEntry.placement ? (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Placement</dt>
                <dd>
                  Placed at {completedEntry.placement.x},{" "}
                  {completedEntry.placement.y}
                </dd>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Placement</dt>
                <dd>Placement pending index sync</dd>
              </div>
            )}
          </>
        ) : null}
      </dl>
    </article>
  );
}

function isCompletedEntry(
  entry: GalleryRenderableEntry,
): entry is CompletedGalleryEntry {
  return entry.status.kind === "completed";
}

function findAthlete(
  catalog: readonly AthleteCatalogEntry[],
  athletePublicId: string,
): AthleteCatalogEntry | null {
  return (
    catalog.find((entry) => entry.athletePublicId === athletePublicId) ?? null
  );
}

function buildWalrusAggregatorUrl(blobId: string | null): string | null {
  if (!blobId) {
    return null;
  }

  if (isDemoModeEnabled(getDemoModeSource())) {
    return `https://placehold.co/960x540/png?text=${encodeURIComponent(blobId)}`;
  }

  const aggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR?.trim().replace(
    /\/+$/,
    "",
  );

  if (!aggregator) {
    return null;
  }

  return `${aggregator}/v1/blobs/${blobId}`;
}

function createUnavailableEntry(kakera: OwnedKakera): GalleryUnavailableEntry {
  return {
    unitId: kakera.unitId,
    athletePublicId: kakera.athletePublicId,
    walrusBlobId: kakera.walrusBlobId,
    submissionNo: kakera.submissionNo,
    mintedAtMs: kakera.mintedAtMs,
    status: { kind: "unavailable" },
  };
}
