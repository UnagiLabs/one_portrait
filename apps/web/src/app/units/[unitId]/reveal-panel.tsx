"use client";

import type { MasterPlacementView } from "../../../lib/sui";

const DEFAULT_MOSAIC_COLUMNS = 20;
const DEFAULT_MOSAIC_ROWS = 25;

type RevealPanelProps = {
  readonly displayName: string;
  readonly mosaicUrl: string;
  readonly placement: MasterPlacementView | null;
};

export function RevealPanel({
  displayName,
  mosaicUrl,
  placement,
}: RevealPanelProps): React.ReactElement {
  return (
    <section
      className="mt-6 grid gap-4 rounded-[1.75rem] border border-emerald-300/25 bg-emerald-400/10 p-4"
      data-testid="reveal-panel"
    >
      <div className="grid gap-1">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">
          Reveal
        </p>
        <h2 className="font-serif text-2xl text-white">Completed mosaic</h2>
      </div>

      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70">
        {/* biome-ignore lint: remote Walrus aggregator image, next/image not configured for it yet. */}
        <img
          alt={`${displayName} completed mosaic`}
          className="block h-auto w-full"
          data-testid="reveal-image"
          src={mosaicUrl}
        />

        {placement ? (
          <div
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-200 bg-amber-300/25 shadow-[0_0_0_9999px_rgba(2,6,23,0.08)]"
            data-testid="placement-highlight"
            style={{
              left: `${((placement.x + 0.5) / DEFAULT_MOSAIC_COLUMNS) * 100}%`,
              top: `${((placement.y + 0.5) / DEFAULT_MOSAIC_ROWS) * 100}%`,
            }}
          />
        ) : null}
      </div>

      {placement ? (
        <p className="text-sm text-emerald-50/90">
          Your Kakera is highlighted at ({placement.x}, {placement.y}) as #
          {placement.submissionNo}.
        </p>
      ) : (
        <p className="text-sm text-emerald-50/90">
          The completed mosaic is ready.
        </p>
      )}
    </section>
  );
}
