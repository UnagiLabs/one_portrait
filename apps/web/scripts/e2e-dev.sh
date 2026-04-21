#!/bin/bash
# Wrapper that exports the stub env matrix and starts Next.js in dev mode for
# Playwright E2E. Env values are synthetic and never touch real backends:
# Sui RPC, Enoki, Walrus are all intercepted by tests/e2e/fixtures/mock-network.ts.
#
# Why a wrapper instead of `webServer.env` in playwright.config.ts: passing
# env via that option did not propagate `NEXT_PUBLIC_*` reliably with next@16
# + turbopack. Exporting in the subshell — and shadowing the developer's
# `.env` for the duration of the run via `.env.local` — works consistently.
# `.env.local` is gitignored.
#
# Port: defaults to 3100 (matches playwright.config.ts), overridable via
# `E2E_PORT`. We pre-check the port and bail loudly because Next.js silently
# falls back to the next available port, which would leave Playwright waiting
# on a URL that never responds.

set -e

# `E2E_PORT` is resolved by `playwright.config.ts` (which probes for a free
# port before spawning us) and inherited through Playwright's process env.
# When the wrapper is invoked directly (outside Playwright), default to 3100.
PORT=${E2E_PORT:-3100}

# Belt-and-suspenders: if the port became busy between Playwright's probe
# and our invocation, bail loudly — `next dev` silently falls back to a
# different port otherwise, which breaks Playwright's `webServer.url` wait.
if (echo > /dev/tcp/127.0.0.1/"$PORT") 2>/dev/null; then
  cat >&2 <<MSG
[e2e-dev.sh] Port $PORT is already in use. Free the port or set E2E_PORT to
an unused one (e.g. \`E2E_PORT=4000 pnpm run test:e2e\`). Aborting so that
Playwright doesn't time out waiting for an unrelated process.
MSG
  exit 1
fi

# Nuke turbopack cache so stale compile outputs from a previous run cannot
# leak through.
rm -rf .next

# `.env.local` wins over `.env` in Next.js. Write it unconditionally so the
# stub matrix is applied even when a developer has an existing `.env` with
# blank values (the default after `cp .env.example .env`). Playwright tends
# to SIGKILL the webServer on shutdown, so we cannot reliably remove the
# file in a trap — instead the next E2E run overwrites it. If a developer
# wants to restore real `.env` semantics they can `rm apps/web/.env.local`.
cat >.env.local <<'ENV'
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_PACKAGE_ID=0x0000000000000000000000000000000000000000000000000000000000000001
NEXT_PUBLIC_REGISTRY_OBJECT_ID=0x0000000000000000000000000000000000000000000000000000000000000002
NEXT_PUBLIC_ENOKI_API_KEY=enoki-e2e-stub
NEXT_PUBLIC_GOOGLE_CLIENT_ID=google-e2e-stub
NEXT_PUBLIC_WALRUS_PUBLISHER=https://publisher.e2e.stub
NEXT_PUBLIC_WALRUS_AGGREGATOR=https://aggregator.e2e.stub
NEXT_PUBLIC_E2E_STUB_WALLET=1
ENOKI_PRIVATE_API_KEY=enoki-private-e2e-stub
ENV

exec npx --no-install next dev -p "$PORT"
