"use client";

import { unitTileGrid } from "@one-portrait/shared";
import { useState } from "react";
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
  originalPhotoUrl,
  placement,
}: RevealPanelProps): React.ReactElement {
  const [highlightVisible, setHighlightVisible] = useState(true);
  const hasPlacement = placement !== null;
  const highlightLabel = highlightVisible ? "Hide highlight" : "Show highlight";

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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)] lg:items-start">
        <div
          className="op-reveal-surface relative overflow-hidden border border-[var(--rule)] bg-[rgba(0,0,0,0.12)]"
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

          {placement && highlightVisible ? (
            <div
              className="pointer-events-none absolute box-border border-[2px] border-[var(--ember)] bg-[rgba(212,50,14,0.12)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),0_0_0_1px_rgba(212,50,14,0.4)]"
              data-testid="placement-highlight"
              style={{
                left: `${(placement.x / unitTileGrid.cols) * 100}%`,
                top: `${(placement.y / unitTileGrid.rows) * 100}%`,
                width: `${100 / unitTileGrid.cols}%`,
                height: `${100 / unitTileGrid.rows}%`,
              }}
            />
          ) : null}
        </div>

        <aside className="grid gap-4">
          <section className="grid gap-2 border border-[var(--rule)] bg-[rgba(245,239,227,0.04)] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                Your photo
              </p>
              {hasPlacement ? (
                <button
                  className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ember)] hover:text-[var(--ink)]"
                  aria-pressed={highlightVisible}
                  onClick={() => setHighlightVisible((current) => !current)}
                  type="button"
                >
                  {highlightLabel}
                </button>
              ) : null}
            </div>

            <div className="overflow-hidden border border-[var(--rule-strong)] bg-[rgba(0,0,0,0.2)]">
              {originalPhotoUrl ? (
                // biome-ignore lint: remote Walrus aggregator image, next/image not configured for it yet.
                <img
                  alt={`${displayName} original submission`}
                  className="block aspect-[4/3] w-full object-cover"
                  src={originalPhotoUrl}
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center p-6 text-center font-serif-display italic text-[15px] text-[var(--ink-dim)]">
                  Original photo unavailable
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-2 border border-[var(--rule)] bg-[rgba(245,239,227,0.03)] p-4">
            <p className="font-mono-op text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Placement
            </p>
            {placement ? (
              <p className="font-serif-display italic text-[15px] text-[var(--ink)]">
                Your Kakera is highlighted at ({placement.x}, {placement.y})
                as #{placement.submissionNo}.
              </p>
            ) : (
              <p className="font-serif-display italic text-[15px] text-[var(--ink-dim)]">
                The completed mosaic is ready.
              </p>
            )}
            {hasPlacement ? (
              <p className="font-mono-op text-[11px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                Toggle the red frame when you want only the full mosaic.
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </section>
  );
}
