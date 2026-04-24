"use client";

import { unitTileGrid } from "@one-portrait/shared";
import type { MasterPlacementView } from "../../../lib/sui";

type RevealPanelProps = {
  readonly displayName: string;
  readonly mosaicUrl: string;
  readonly originalPhotoUrl?: string | null;
  readonly placement: MasterPlacementView | null;
};

export function RevealPanel({
  displayName,
  mosaicUrl,
  originalPhotoUrl: _originalPhotoUrl,
  placement,
}: RevealPanelProps): React.ReactElement {
  return (
    <section
      className="mt-8 grid gap-5 border border-[var(--rule-strong)] bg-[rgba(10,6,4,0.85)] p-5 text-left"
      data-testid="reveal-panel"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="grid gap-1">
          <p className="op-eyebrow">
            <span className="bar" />
            <span>◉ Revealed</span>
          </p>
          <h2 className="font-display text-[28px] leading-[0.95] tracking-[-0.01em] text-[var(--ink)]">
            Completed mosaic
          </h2>
        </div>
        <div className="text-right font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          <div>Simultaneous to every participant</div>
        </div>
      </div>

      <div
        className="op-reveal-surface relative"
        style={{
          aspectRatio: `${unitTileGrid.cols} / ${unitTileGrid.rows}`,
        }}
      >
        {/* biome-ignore lint: remote Walrus aggregator image, next/image not configured for it yet. */}
        <img
          alt={`${displayName} completed mosaic`}
          className="block h-full w-full object-cover"
          data-testid="reveal-image"
          src={mosaicUrl}
        />

        {placement ? (
          <div
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--fire-1)] bg-[rgba(255,209,102,0.25)] shadow-[0_0_0_9999px_rgba(2,6,23,0.12)]"
            data-testid="placement-highlight"
            style={{
              left: `${((placement.x + 0.5) / unitTileGrid.cols) * 100}%`,
              top: `${((placement.y + 0.5) / unitTileGrid.rows) * 100}%`,
            }}
          />
        ) : null}
      </div>

      {placement ? (
        <p className="font-serif-display italic text-[15px] text-[var(--ink)]">
          Your Kakera is highlighted at ({placement.x}, {placement.y}) as #
          {placement.submissionNo}.
        </p>
      ) : (
        <p className="font-serif-display italic text-[15px] text-[var(--ink-dim)]">
          The completed mosaic is ready.
        </p>
      )}
    </section>
  );
}
