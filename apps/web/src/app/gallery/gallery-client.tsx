"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";

import type { AthleteCatalogEntry } from "../../lib/catalog";
import type { GalleryEntryView } from "../../lib/sui";
import { getGalleryEntry, getSuiClient, listOwnedKakera } from "../../lib/sui";

type GalleryClientProps = {
  readonly catalog: readonly AthleteCatalogEntry[];
  readonly packageId: string;
};

type LoadState =
  | { readonly kind: "idle"; readonly entries: readonly GalleryEntryView[] }
  | { readonly kind: "loading"; readonly entries: readonly GalleryEntryView[] }
  | { readonly kind: "ready"; readonly entries: readonly GalleryEntryView[] }
  | { readonly kind: "error"; readonly entries: readonly GalleryEntryView[] };

export function GalleryClient({
  catalog,
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
              return null;
            }
          }),
        );

        if (cancelled) {
          return;
        }

        setState({
          kind: "ready",
          entries: resolved
            .filter((entry): entry is GalleryEntryView => entry !== null)
            .sort((left, right) => right.submissionNo - left.submissionNo),
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
  }, [currentAccount?.address, packageId]);

  if (!currentAccount?.address) {
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
  readonly entry: GalleryEntryView;
  readonly originalImageFailed: boolean;
  readonly onOriginalImageError: () => void;
};

function GalleryCard({
  athlete,
  entry,
  originalImageFailed,
  onOriginalImageError,
}: GalleryCardProps): React.ReactElement {
  const displayName =
    athlete?.displayName ?? `Athlete #${entry.athletePublicId}`;
  const originalPhotoUrl = buildWalrusAggregatorUrl(entry.walrusBlobId);
  const completedMosaicUrl =
    entry.status.kind === "completed"
      ? buildWalrusAggregatorUrl(entry.mosaicWalrusBlobId)
      : null;

  return (
    <article className="grid gap-5 rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7">
      <div className="grid gap-1">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
          {entry.status.kind === "completed" ? "Completed" : "Pending"}
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

        {entry.status.kind === "completed" ? (
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
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">Status</dt>
              <dd>Completed</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">Master</dt>
              <dd className="font-mono text-xs break-all">
                Master {entry.masterId}
              </dd>
            </div>
            {entry.placement ? (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Placement</dt>
                <dd>
                  Placed at {entry.placement.x}, {entry.placement.y}
                </dd>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Placement</dt>
                <dd>Placement pending index sync</dd>
              </div>
            )}
          </>
        )}
      </dl>
    </article>
  );
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

  const aggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR?.trim().replace(
    /\/+$/,
    "",
  );

  if (!aggregator) {
    return null;
  }

  return `${aggregator}/v1/blobs/${blobId}`;
}
