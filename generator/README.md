# Generator

`generator/` is the workspace for ONE Portrait's mosaic-generation logic.

## Start Here

- If you only need the mosaic-generation logic, start from `src/core.ts`.
- If you are wiring the generator into Sui/Walrus finalize flow, start from `src/integration.ts`, `src/runtime.ts`, `src/server.ts`, and `scripts/seed-demo-submissions.ts`.
- If you are comparing mosaic quality, dataset mixes, or local render output, start from `experiments/README.md`.
- If you are cleaning local disk usage, review `assets/archives/`, `assets/demo-tiles/`, `assets/datasets/`, and `artifacts/` first.

## Production Path

- `src/core.ts`
  Pure mosaic-generation entrypoint. Prefer this when the caller does not care about chain/storage wiring.
- `src/integration.ts`
  Sui/Walrus runtime adapter entrypoint. Use this only for finalize/seed flows.
- `src/`
  Finalize generator implementation. Runtime, Sui/Walrus integration, and the core mosaic pipeline live here.
- `scripts/`
  Operational scripts used by the demo/runbooks. Right now the important one is `seed-demo-submissions.ts`.
- `test/`
  Tests for the production generator code.

## Experiments

- `experiments/`
  Quality research, local rendering, and dataset collection scripts.
  These are not part of the live finalize path.
  If someone wants to trim the repo for demo operations, this directory is the safe first place to review.

## Local Data

- `assets/archives/`
  Compressed experiment tile archives. Git-ignored.
- `assets/demo-tiles/`
  Expanded lightweight demo tile cache. Git-ignored.
- `assets/datasets/`
  Expanded Openverse-based experiment datasets. Git-ignored.
- `artifacts/`
  Local experiment outputs such as PNGs and analysis JSON. Git-ignored.

## Common Commands

```bash
pnpm --filter generator typecheck
pnpm --filter generator test
pnpm --filter generator seed:demo-submissions -- --help
pnpm --filter generator experiment:render-mosaic -- --help
```

Experiment command details live in [experiments/README.md](./experiments/README.md).
