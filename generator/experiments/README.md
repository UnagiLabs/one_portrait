# Generator Experiments

This directory contains research utilities for improving mosaic quality.

These scripts are intentionally separate from the production finalize path.

## What Belongs Here

- Local quality comparisons that do not run in the live finalize path.
- Dataset collection and curation helpers for demo experiments.
- One-off target analysis utilities such as MediaPipe-based face/subject weighting.

If a script is required for the actual demo operation, it should stay under `generator/scripts/` instead.

## Dataset Collection

- `sync-demo-tiles.ts`
  Builds a lightweight demo tile set.
- `sync-free-portrait-tiles.ts`
  Collects a portrait-heavy tile set from Openverse.
- `sync-face-close-tiles.ts`
  Collects a face/headshot-biased tile set from Openverse.

## Analysis And Rendering

- `analyze_target.py`
  Uses MediaPipe to analyze a target image and emits per-cell subject/face weights.
- `render-mosaic.ts`
  Renders a local comparison mosaic from a target image and one or more tile directories.

## Batch Comparison

- `evaluate-improved-mosaic-counts.ts`
  Runs multiple grid/count variants and writes a summary for side-by-side review.

## Python Dependency

Only `analyze_target.py` requires Python.
Its dependencies are listed in `../python-requirements.txt`.

```bash
python3 -m venv generator/.venv
source generator/.venv/bin/activate
pip install -r generator/python-requirements.txt
```

## Common Commands

```bash
pnpm --filter generator experiment:sync-demo-tiles
pnpm --filter generator experiment:sync-free-portrait-tiles
pnpm --filter generator experiment:sync-face-close-tiles
pnpm --filter generator experiment:render-mosaic -- --target /path/to/target.png --tiles-dir /path/to/tiles
pnpm --filter generator experiment:counts
```

Outputs under `generator/assets/*` and `generator/artifacts/` are Git-ignored local state.
