"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useCurrentWallet,
  useWallets,
} from "@mysten/dapp-kit";
import { isGoogleWallet } from "@mysten/enoki";
import { unitTileGrid } from "@one-portrait/shared";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { AthleteCatalogEntry } from "../../lib/catalog";
import { getDemoModeSource, isDemoModeEnabled } from "../../lib/demo";
import type { GalleryEntryView, OwnedKakera } from "../../lib/sui";
import { getGalleryEntry, getSuiClient, listOwnedKakera } from "../../lib/sui";
import { SuiWalletConnectModal } from "../sui-wallet-connect-modal";

export type GalleryClientProps = {
  readonly catalog: readonly AthleteCatalogEntry[];
  readonly demoEntries?: readonly GalleryRenderableEntry[];
  readonly packageId: string;
};

type GalleryRenderableEntry = GalleryEntryView | GalleryUnavailableEntry;

type GalleryUnavailableEntry = {
  readonly unitId: string;
  readonly displayName: string;
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
  const [failedOriginalBlobIds, setFailedOriginalBlobIds] = useState<
    readonly string[]
  >([]);
  if (demoEntries) {
    return (
      <GalleryEntriesSection
        catalog={catalog}
        entries={demoEntries}
        failedOriginalBlobIds={failedOriginalBlobIds}
        onOriginalImageError={(walrusBlobId) => {
          setFailedOriginalBlobIds((current) => {
            if (current.includes(walrusBlobId)) {
              return current;
            }
            return [...current, walrusBlobId];
          });
        }}
      />
    );
  }

  if (!packageId) {
    return (
      <GalleryStatusShell
        description="The Sui connection public configuration is incomplete, so the gallery cannot open."
        label="Unavailable"
        title="Could not verify public configuration."
        tone="warning"
      />
    );
  }

  return <ConnectedGalleryClient catalog={catalog} packageId={packageId} />;
}

function ConnectedGalleryClient({
  catalog,
  packageId,
}: Omit<GalleryClientProps, "demoEntries">): React.ReactElement {
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
  const [suiWalletModalOpen, setSuiWalletModalOpen] = useState(false);
  const [failedOriginalBlobIds, setFailedOriginalBlobIds] = useState<
    readonly string[]
  >([]);
  const googleWallet = wallets.find(isGoogleWallet) ?? null;
  const isConnecting = currentWallet.connectionStatus === "connecting";

  async function handleLogin(): Promise<void> {
    if (!googleWallet) {
      setConnectError("Google login configuration was not found.");
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
    if (!currentAccount?.address) {
      setState({
        kind: "idle",
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
  }, [currentAccount?.address, packageId, reloadNonce]);

  if (!currentAccount?.address) {
    return (
      <GalleryStatusShell
        description="Connect Google zkLogin or Sui wallet to load your Kakera history."
        label="Wallet required"
        tone="info"
      >
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="op-btn-primary"
            disabled={isConnecting}
            onClick={() => {
              void handleLogin();
            }}
            type="button"
          >
            {isConnecting
              ? "Connecting Google zkLogin..."
              : connectError
                ? "Retry Google zkLogin"
                : "Google zkLogin"}
          </button>
          <SuiWalletConnectModal
            onOpenChange={setSuiWalletModalOpen}
            open={suiWalletModalOpen}
            trigger={
              <button className="op-btn-ghost" type="button">
                Sui wallet
              </button>
            }
          />
        </div>
        {connectError ? (
          <p
            aria-live="polite"
            className="op-alert-warn mt-4 font-mono-op text-[11px] tracking-[0.08em]"
            role="alert"
          >
            {connectError}
          </p>
        ) : null}
      </GalleryStatusShell>
    );
  }

  if (state.kind === "error") {
    return (
      <GalleryStatusShell
        description="Wait a moment and check again."
        label="Unavailable"
        title="Could not load history."
        tone="warning"
      >
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="op-btn-outline"
            onClick={() => {
              setReloadNonce((current) => current + 1);
            }}
            type="button"
          >
            Check again
          </button>
        </div>
      </GalleryStatusShell>
    );
  }

  if (state.kind === "loading") {
    return (
      <GalleryStatusShell
        description="Login confirmed. Reading Kakera from Sui."
        label="Loading"
        tone="info"
      />
    );
  }

  if (state.entries.length === 0) {
    return (
      <GalleryStatusShell
        description="No Kakera found yet."
        label="Empty"
        note="If you just submitted, wait a moment and check again."
        title="This wallet history is still empty."
        tone="empty"
      >
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="op-btn-outline"
            onClick={() => {
              setReloadNonce((current) => current + 1);
            }}
            type="button"
          >
            Check again
          </button>
        </div>
      </GalleryStatusShell>
    );
  }

  return (
    <GalleryEntriesSection
      catalog={catalog}
      entries={state.entries}
      failedOriginalBlobIds={failedOriginalBlobIds}
      onOriginalImageError={(walrusBlobId) => {
        setFailedOriginalBlobIds((current) => {
          if (current.includes(walrusBlobId)) {
            return current;
          }
          return [...current, walrusBlobId];
        });
      }}
    />
  );
}

type GalleryEntriesSectionProps = {
  readonly catalog: readonly AthleteCatalogEntry[];
  readonly entries: readonly GalleryRenderableEntry[];
  readonly failedOriginalBlobIds: readonly string[];
  readonly onOriginalImageError: (walrusBlobId: string) => void;
};

function GalleryEntriesSection({
  catalog,
  entries,
  failedOriginalBlobIds,
  onOriginalImageError,
}: GalleryEntriesSectionProps): React.ReactElement {
  return (
    <section className="op-gallery-grid">
      {entries.map((entry) => (
        <GalleryCard
          athlete={findAthlete(catalog, entry.unitId)}
          entry={entry}
          key={`${entry.unitId}:${entry.walrusBlobId}`}
          originalImageFailed={failedOriginalBlobIds.includes(
            entry.walrusBlobId,
          )}
          onOriginalImageError={() => {
            onOriginalImageError(entry.walrusBlobId);
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

  return "Processing failed. Please wait a moment and try again.";
}

type GalleryStatusShellProps = {
  readonly label: string;
  readonly description: string;
  readonly title?: string;
  readonly note?: string;
  readonly tone: "info" | "warning" | "empty";
  readonly children?: React.ReactNode;
};

function GalleryStatusShell({
  label,
  description,
  title,
  note,
  tone,
  children,
}: GalleryStatusShellProps): React.ReactElement {
  const toneClasses =
    tone === "warning"
      ? {
          shell: "border-[rgba(255,193,99,0.25)] bg-[rgba(255,193,99,0.06)]",
          label: "text-[var(--ember)]",
        }
      : tone === "empty"
        ? {
            shell: "border-[rgba(20,184,138,0.25)] bg-[rgba(20,184,138,0.06)]",
            label: "text-[var(--ok)]",
          }
        : {
            shell: "border-[rgba(77,162,255,0.25)] bg-[rgba(77,162,255,0.06)]",
            label: "text-[var(--sui)]",
          };

  return (
    <section className={`border p-7 ${toneClasses.shell}`}>
      <p
        className={`font-mono-op text-[11px] uppercase tracking-[0.2em] ${toneClasses.label}`}
      >
        {label}
      </p>
      {title ? (
        <h2 className="mt-3 font-display text-[28px] leading-[0.95] tracking-[-0.01em] text-[var(--ink)]">
          {title}
        </h2>
      ) : null}
      <p className="mt-3 text-[15px] leading-[1.55] text-[var(--ink)]">
        {description}
      </p>
      {note ? (
        <p className="mt-2 text-sm text-[var(--ink-dim)]">{note}</p>
      ) : null}
      {children}
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
  const displayName = athlete?.displayName ?? entry.displayName;
  const originalPhotoUrl = buildWalrusAggregatorUrl(entry.walrusBlobId);
  const completedMosaicUrl = completedEntry
    ? buildWalrusAggregatorUrl(completedEntry.mosaicWalrusBlobId)
    : null;

  const statusLabel =
    entry.status.kind === "completed"
      ? "Complete"
      : entry.status.kind === "pending"
        ? "Pending"
        : "Unavailable";

  return (
    <article
      className={`op-kakera-card relative grid gap-5 bg-[var(--bg-2)] p-6 ${
        completedEntry ? "is-complete" : ""
      }`}
    >
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="op-kakera-status-chip">{statusLabel}</p>
          <h2 className="font-display text-[30px] leading-[0.95] tracking-[-0.01em] text-[var(--ink)]">
            {displayName}
          </h2>
          <p className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            Kakera · Submission #{entry.submissionNo}
          </p>
        </div>
        <div className="op-kakera-card-mark">
          <span>K</span>
        </div>
      </div>

      <div className="relative z-10 grid gap-4">
        <section className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Your photo
            </p>
            {completedEntry ? (
              <p className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ok)]">
                Mosaic ready
              </p>
            ) : null}
          </div>
          <div className="op-kakera-photo-frame">
            {originalPhotoUrl && !originalImageFailed ? (
              // biome-ignore lint: Walrus aggregator image is a dynamic external URL.
              <img
                alt={`${displayName} original submission`}
                className="op-kakera-photo"
                onError={onOriginalImageError}
                src={originalPhotoUrl}
              />
            ) : (
              <div className="op-kakera-photo-unavailable">
                Original photo unavailable
              </div>
            )}
          </div>
        </section>

        {completedEntry !== null ? (
          <section className="op-kakera-mosaic-strip">
            <div>
              <p className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ok)]">
                Completed mosaic
              </p>
              <p className="mt-1 text-xs text-[var(--ink-dim)]">
                Your Kakera is placed in the final portrait.
              </p>
            </div>
            {completedMosaicUrl ? (
              <div
                className="op-kakera-mosaic-thumb"
                style={{
                  aspectRatio: `${unitTileGrid.cols} / ${unitTileGrid.rows}`,
                }}
              >
                {/* biome-ignore lint: Walrus aggregator image is a dynamic external URL. */}
                <img
                  alt={`${displayName} completed mosaic`}
                  className="block h-full w-full object-cover"
                  src={completedMosaicUrl}
                />
              </div>
            ) : (
              <div
                className="op-kakera-mosaic-thumb op-kakera-mosaic-thumb-empty"
                style={{
                  aspectRatio: `${unitTileGrid.cols} / ${unitTileGrid.rows}`,
                }}
              >
                Mosaic unavailable
              </div>
            )}
          </section>
        ) : null}
      </div>

      <div className="relative z-10 grid gap-1">
        <p className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          Unit
        </p>
        <p className="font-mono-op text-[11px] break-all text-[var(--ink-dim)]">
          {entry.unitId}
        </p>
      </div>

      {completedEntry ? (
        <div className="relative z-10">
          <Link
            className="op-btn-outline"
            href={buildUnitPageHref({
              displayName,
              unitId: entry.unitId,
            })}
          >
            View position on Unit page
          </Link>
        </div>
      ) : null}

      <dl className="relative z-10 grid gap-2 border-t border-[var(--rule)] pt-4 text-sm text-[var(--ink)]">
        {entry.status.kind === "pending" ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Status
            </dt>
            <dd className="font-mono-op text-[12px]">Waiting for reveal</dd>
          </div>
        ) : entry.status.kind === "unavailable" ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Status
            </dt>
            <dd className="font-mono-op text-[12px]">
              Entry unavailable right now
            </dd>
          </div>
        ) : completedEntry !== null ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                Status
              </dt>
              <dd className="font-mono-op text-[12px] text-[var(--ok)]">
                Complete
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                Master
              </dt>
              <dd className="font-mono-op text-[11px] break-all text-right text-[var(--sui)]">
                Master {completedEntry.masterId}
              </dd>
            </div>
            {completedEntry.placement ? (
              <div className="flex items-center justify-between gap-4">
                <dt className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                  Placement
                </dt>
                <dd className="font-mono-op text-[12px]">
                  Placed at {completedEntry.placement.x},{" "}
                  {completedEntry.placement.y}
                </dd>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <dt className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                  Placement
                </dt>
                <dd className="font-mono-op text-[12px]">
                  Placement pending index sync
                </dd>
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
  unitId: string,
): AthleteCatalogEntry | null {
  return catalog.find((entry) => entry.unitId === unitId) ?? null;
}

const demoBlobAssetMap: Record<string, string> = {
  "demo-mosaic-one": "/demo/demo_mozaiku.png",
};

function buildWalrusAggregatorUrl(blobId: string | null): string | null {
  if (!blobId) {
    return null;
  }

  if (isDemoModeEnabled(getDemoModeSource())) {
    return (
      demoBlobAssetMap[blobId] ??
      `https://placehold.co/960x540/png?text=${encodeURIComponent(blobId)}`
    );
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

function buildUnitPageHref(args: {
  readonly unitId: string;
  readonly displayName: string;
}): string {
  const searchParams = new URLSearchParams({
    athleteName: args.displayName,
  });

  if (process.env.NEXT_PUBLIC_E2E_STUB_WALLET === "1") {
    searchParams.set("op_e2e_unit_progress", "finalized");
  }

  return `/units/${args.unitId}?${searchParams.toString()}`;
}

function createUnavailableEntry(kakera: OwnedKakera): GalleryUnavailableEntry {
  return {
    unitId: kakera.unitId,
    displayName: `Unit ${kakera.unitId.slice(0, 10)}...`,
    walrusBlobId: kakera.walrusBlobId,
    submissionNo: kakera.submissionNo,
    mintedAtMs: kakera.mintedAtMs,
    status: { kind: "unavailable" },
  };
}
