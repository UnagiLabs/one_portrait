#!/bin/bash
# Wrapper for Playwright E2E. The actual startup logic lives in
# `scripts/run-e2e-dev.mjs`, which injects stub env only into the spawned
# Next.js process so the developer's `.env.local` stays untouched.

set -euo pipefail

exec node ./scripts/run-e2e-dev.mjs
