# AGENTS.md

Codex should treat this file as the primary repository instruction source.

For Claude Code compatibility, `CLAUDE.md` or `.claude/` settings may also exist in the repo, but Codex should rely on this file first and use those only as supplemental background when needed.

## Project overview

**ONE Portrait** is a non-profit, on-chain co-creation experience on Sui and Walrus.

- 500 fans each upload one photo through zkLogin + Enoki Sponsored Transactions.
- The 500th submission triggers a synchronous reveal of a single mosaic portrait of a ONE Championship athlete.
- Each participant receives a Soulbound NFT ("Kakera / 欠片") that encodes their own tile of the mosaic.
- The mosaic itself is assembled off-chain and pinned to Walrus, while the on-chain Move package records every tile placement and mints Kakera at submission time.

See [`docs/spec.md`](docs/spec.md) for the product spec and [`docs/tech.md`](docs/tech.md) for architecture, sequences, and Move data model.

## Working rules

- Prefer zero-based redesign over preserving weak legacy structure. This project is pre-launch.
- Do not overvalue migration cost.
- Prefer simple designs and avoid speculative abstraction.
- Favor correctness over matching existing patterns.
- Do not add backfills or migration scripts for data that does not yet exist in production.

## Primary workspace

The main application directory is not fixed yet. As the codebase grows, expect at least two workspaces:

- A Next.js (App Router + TypeScript) package for the fan-facing web app.
- A Sui Move package named `one_portrait` for the on-chain contracts.

Run app commands from the relevant sub-workspace (for example a future `web/` or `one_portrait_web/`), not from repo root, unless a command explicitly targets repo root.

## Development commands

Once the Node workspace exists, the preferred verification order is:

```bash
npm run check
npm run typecheck
npm test
```

When changes affect deployment or runtime behavior broadly, also run:

```bash
npm run build
```

For the Move package, once it exists:

```bash
sui move build
sui move test
```

Only use commands that actually exist in the workspace at the time; do not invent scripts.

## Architecture summary

- Frontend: Next.js App Router + TypeScript, hosted on Cloudflare Workers via OpenNext.
- Styling: Tailwind CSS + shadcn/ui.
- Auth: zkLogin (Sui) with Enoki Sponsored Transactions.
- Sui SDK: `@mysten/sui` for PTB construction and event subscription.
- Storage: Walrus (Publisher / Aggregator HTTP API) for fan photos and the finished mosaic.
- Smart contract: a single Sui Move package named `one_portrait`.
  - `Unit` (shared): per-athlete 500-tile unit with progress, submitters, status, and optional `master_id`.
  - `MasterPortrait`: holds `placements: Table<blob_id, Placement>` for on-chain blob → tile resolution.
  - `Kakera` (Soulbound): the per-participant NFT, enforced at the Move type level (`key`-only, no `store`).
- Finalize: Cloudflare Worker plus an on-demand container (sharp / libvips) that composes the mosaic and pins it to Walrus. Triggered by the participant browser that observes `UnitFilled`; idempotency is enforced in Move by `status == Filled && master_id.is_none()`.

## Technical constraints

- All fan-facing transactions are Sponsored. Fans must not need to hold SUI.
- `submit_photo` must mint Kakera inside the same transaction that records the submission.
- Kakera must never implement `store`. Soulbound is a type-level guarantee, not a runtime check.
- The mosaic must not be rendered in the browser before `finalize` has run. The reveal has to be synchronous across viewers.
- Walrus blob IDs are the canonical identifier for a photo. On-chain state references blobs by ID, never by path.

## Testing and environment

- Local `.env` files (once introduced, likely under the Next.js workspace) must never contain production secrets, and must not be committed.
- When tests touch Walrus or Sui, prefer the testnet endpoints that match `docs/tech.md`.
- `ENOKI_*` credentials are operator-only and must not be checked in.

## Auth and routing notes

- Fan-facing flows use zkLogin (Google) and ephemeral Sui addresses.
- `/api/finalize` is a Cloudflare Worker route that only the Move contract state can authorize as "safe to run" via `UnitFilled`. The route itself must stay idempotent and must not trust client-side counters.
- Admin / operator surfaces (if any) are expected to sit behind a platform-level gate (for example Cloudflare Access), not behind ad-hoc Next.js middleware.

## Repo-local Codex surfaces

This repository uses repo-local Codex configuration, synced from the `kurumachi` template so the same workflow behaves consistently across projects:

- `.agents/skills/`: reusable repo-local workflows.
  - `gh-issue-implement`: end-to-end issue execution with Codex as implementer and Claude as read-only auditor.
  - `prepare-pr`: PR title and body convention, Japanese.
  - `cleanup-gone-branches`: safe deletion of local branches whose upstream is gone.
  - `claude-consult`: read-only second opinion via the local `claude` CLI.
  - `draft-commit-message`: Japanese commit message draft from the current diff.
- `.codex/hooks.json`: deterministic hook wiring (PostToolUse `post-edit-check.sh`, Stop `stop-quality-gate.sh`).
- `.codex/hooks/`: hook and Claude-audit scripts. These are workspace-aware: they auto-detect the nearest `package.json`, so they stay silent until a real Node workspace is added.
- `.codex/agents/`: project-scoped custom subagents (`issue_planner`, `issue_step_worker`, `verification_reviewer`).

When a task matches one of the repo-local skills, prefer that skill over improvising a new flow.

## Devcontainer surfaces

This repository also ships a Devcontainer that isolates Codex and Claude Code behind Docker boundaries while letting them run permissionless inside:

- `Dockerfile`, `docker-compose.yml`, `.devcontainer/` — Playwright + Node 24 + gh + Codex + Claude Code, `cap_drop: [ALL]` and `no-new-privileges:true`.
- `.codex/config.toml` — `approval_policy = "never"`, `sandbox_mode = "danger-full-access"`.
- `.claude/settings.json` — `Bash(*)`, `WebFetch`, `WebSearch` in `permissions.allow`.

Host credentials (`~/.claude`, `~/.codex`, `~/.gitconfig`, `~/.config/gh`) are mounted read-only and synced into container-local volumes by `.devcontainer/post-start.sh`.
