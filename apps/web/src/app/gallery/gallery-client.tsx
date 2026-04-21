"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useWallets,
} from "@mysten/dapp-kit";
import { isGoogleWallet } from "@mysten/enoki";
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
  const currentWallet = useCurrentWallet();
  const wallets = useWallets();
  const connectWallet = useConnectWallet();
  const [state, setState] = useState<LoadState>({
    kind: "idle",
    entries: [],
  });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [failedOriginalBlobIds, setFailedOriginalBlobIds] = useState<
    readonly string[]
  >([]);
  const googleWallet = wallets.find(isGoogleWallet) ?? null;
  const isConnecting = currentWallet.connectionStatus === "connecting";

  async function handleLogin(): Promise<void> {
    if (!googleWallet) {
      setConnectError("Google ログインの設定が見つかりません。");
      return;
    }

    try {
      setConnectError(null);
      await connectWallet.mutateAsync({ wallet: googleWallet });
    } catch (error) {
      setConnectError(toMessage(error));
    }
  }

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

    setState((current) => ({
      kind: "loading",
      entries: reloadNonce > 0 ? current.entries : [],
    }));
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
  }, [currentAccount?.address, demoEntries, packageId, reloadNonce]);

  if (!demoEntries && !currentAccount?.address) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">
          Wallet required
        </p>
        <p className="mt-3 text-slate-200">
          Connect a wallet to view your Kakera participation history.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-200"
            disabled={isConnecting}
            onClick={() => {
              void handleLogin();
            }}
            type="button"
          >
            {connectError ? "もう一度ログイン" : "Google でログイン"}
          </button>
        </div>
        {connectError ? (
          <p
            aria-live="polite"
            className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
            role="alert"
          >
            {connectError}
          </p>
        ) : null}
      </section>
    );
  }

  if (!demoEntries && (!packageId || state.kind === "error")) {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-7">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">
          Unavailable
        </p>
        <p className="mt-3 text-slate-200">
          Gallery unavailable right now. Check the public Sui configuration and
          try again.
        </p>
        {packageId ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="rounded-full border border-cyan-300/40 px-4 py-2 text-sm text-cyan-100 hover:border-cyan-200"
              onClick={() => {
                setReloadNonce((current) => current + 1);
              }}
              type="button"
            >
              もう一度確認する
            </button>
          </div>
        ) : null}
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
        <p className="mt-2 text-sm text-slate-300">
          投稿直後なら、少し待ってからもう一度確認してください。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-full border border-cyan-300/40 px-4 py-2 text-sm text-cyan-100 hover:border-cyan-200"
            onClick={() => {
              setReloadNonce((current) => current + 1);
            }}
            type="button"
          >
            もう一度確認する
          </button>
        </div>
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

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "処理に失敗しました。時間をおいて、もう一度お試しください。";
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
