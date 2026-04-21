"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";

import type { MasterPlacementView } from "../../../lib/sui";
import {
  findOwnedKakeraForUnit,
  getGalleryEntry,
  getMasterPlacement,
  getSuiClient,
} from "../../../lib/sui";

import { LiveProgress } from "./live-progress";
import { RevealPanel } from "./reveal-panel";

type UnitRevealClientProps = {
  readonly displayName: string;
  readonly packageId: string;
  readonly unitId: string;
  readonly initialSubmittedCount: number;
  readonly maxSlots: number;
  readonly initialMasterId: string | null;
};

type RevealState = {
  readonly masterId: string;
  readonly mosaicWalrusBlobId: string | null;
  readonly placement: MasterPlacementView | null;
};

const EMPTY_WALRUS_BLOB_ID = "";

export function UnitRevealClient(
  props: UnitRevealClientProps,
): React.ReactElement {
  const {
    displayName,
    packageId,
    unitId,
    initialSubmittedCount,
    maxSlots,
    initialMasterId,
  } = props;

  const currentAccount = useCurrentAccount();
  const [reveal, setReveal] = useState<RevealState | null>(
    initialMasterId
      ? {
          masterId: initialMasterId,
          mosaicWalrusBlobId: null,
          placement: null,
        }
      : null,
  );
  const revealMasterId = reveal?.masterId ?? null;
  const revealBlobId = reveal?.mosaicWalrusBlobId ?? null;
  const revealPlacement = reveal?.placement ?? null;

  useEffect(() => {
    if (revealMasterId == null) {
      return;
    }

    let cancelled = false;

    const loadReveal = async (): Promise<void> => {
      const suiClient = getSuiClient();
      let mosaicWalrusBlobId = revealBlobId;
      let placement = revealPlacement;
      let ownedWalrusBlobId: string | null = null;

      if (currentAccount?.address && packageId) {
        try {
          const kakera = await findOwnedKakeraForUnit({
            ownerAddress: currentAccount.address,
            packageId,
            suiClient,
            unitId,
          });

          if (kakera) {
            ownedWalrusBlobId = kakera.walrusBlobId;

            try {
              const entry = await getGalleryEntry({
                client: suiClient,
                kakera,
              });

              if (entry.status.kind === "completed") {
                mosaicWalrusBlobId = entry.mosaicWalrusBlobId;
                placement = entry.placement;
              }
            } catch {
              // Placement recovery is best-effort. A failure here must not
              // block the completed mosaic itself from rendering.
            }
          }
        } catch {
          // Current-account Kakera lookup is opportunistic only.
        }
      }

      if (!mosaicWalrusBlobId) {
        try {
          const master = await getMasterPlacement({
            client: suiClient,
            masterId: revealMasterId,
            walrusBlobId: ownedWalrusBlobId ?? EMPTY_WALRUS_BLOB_ID,
          });

          mosaicWalrusBlobId = master.mosaicWalrusBlobId;
          if (placement == null) {
            placement = master.placement;
          }
        } catch {
          // If this also fails, keep the current state. An event-driven reveal
          // may already have supplied the mosaic blob id.
        }
      }

      if (cancelled || !mosaicWalrusBlobId) {
        return;
      }

      setReveal((current) => {
        if (current == null || current.masterId !== revealMasterId) {
          return current;
        }

        if (
          current.mosaicWalrusBlobId === mosaicWalrusBlobId &&
          samePlacement(current.placement, placement)
        ) {
          return current;
        }

        return {
          masterId: current.masterId,
          mosaicWalrusBlobId,
          placement,
        };
      });
    };

    void loadReveal();

    return () => {
      cancelled = true;
    };
  }, [
    currentAccount?.address,
    packageId,
    revealBlobId,
    revealMasterId,
    revealPlacement,
    unitId,
  ]);

  const mosaicUrl = buildWalrusAggregatorUrl(
    reveal?.mosaicWalrusBlobId ?? null,
  );

  return (
    <>
      <LiveProgress
        initialSubmittedCount={initialSubmittedCount}
        maxSlots={maxSlots}
        onMosaicReady={(event) => {
          setReveal({
            masterId: event.masterId,
            mosaicWalrusBlobId: decodeByteString(event.mosaicWalrusBlobId),
            placement: null,
          });
        }}
        packageId={packageId}
        unitId={unitId}
      />

      {reveal && mosaicUrl ? (
        <RevealPanel
          displayName={displayName}
          mosaicUrl={mosaicUrl}
          placement={reveal.placement}
        />
      ) : null}
    </>
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

function decodeByteString(value: readonly number[]): string {
  return new TextDecoder().decode(new Uint8Array(value));
}

function samePlacement(
  left: MasterPlacementView | null,
  right: MasterPlacementView | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (left == null || right == null) {
    return false;
  }

  return (
    left.x === right.x &&
    left.y === right.y &&
    left.submitter === right.submitter &&
    left.submissionNo === right.submissionNo
  );
}
