import { createServer } from "node:net";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Probe a port: if `preferred` is free, use it; otherwise let the OS assign
 * one. Both Playwright (`baseURL`, `webServer.url`) and the wrapper script
 * read the resolved value from `process.env.E2E_PORT` so they stay in sync —
 * Next.js otherwise silently picks a different port and Playwright would
 * wait on the old URL forever.
 */
async function findFreePort(preferred: number): Promise<number> {
  const tryListen = (port: number) =>
    new Promise<number | null>((resolve) => {
      const server = createServer();
      server.unref();
      server.once("error", () => resolve(null));
      server.once("listening", () => {
        const addr = server.address();
        const resolved = addr && typeof addr === "object" ? addr.port : port;
        server.close(() => resolve(resolved));
      });
      server.listen(port, "127.0.0.1");
    });

  return (await tryListen(preferred)) ?? (await tryListen(0)) ?? preferred;
}

/**
 * Playwright config for the ONE Portrait web app.
 *
 * Scope: mocked E2E only. All outbound network (Sui RPC, Enoki sponsor/execute,
 * Walrus Publisher) is stubbed through `page.route()` inside
 * `tests/e2e/fixtures/mock-network.ts`; the dev server therefore runs with
 * dummy env values that are enough to pass `loadPublicEnv` but never hit the
 * real backends. The `NEXT_PUBLIC_E2E_STUB_WALLET=1` flag swaps the real Enoki
 * wallet for a Wallet Standard stub (see `src/lib/enoki/stub-wallet.ts`).
 */

// Port resolution order:
//   1. explicit `E2E_PORT` env (honoured as-is — useful for CI pinning)
//   2. 3100 if free (preferred so local `next dev` on 3000 can coexist)
//   3. any free port assigned by the OS
// The resolved value is written back to `process.env.E2E_PORT` so the
// wrapper script (`scripts/e2e-dev.sh`) starts Next.js on the same port.
const PORT = process.env.E2E_PORT
  ? Number(process.env.E2E_PORT)
  : await findFreePort(3100);
process.env.E2E_PORT = String(PORT);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    [
      "html",
      {
        host: "0.0.0.0",
        port: 9323,
        open: "never",
        outputFolder: "playwright-report",
      },
    ],
    ["list"],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Env values are exported inside the wrapper script — Playwright's
    // `webServer.env` option did not propagate `NEXT_PUBLIC_*` reliably with
    // next@16.2.4 + turbopack.
    command: "./scripts/e2e-dev.sh",
    cwd: CONFIG_DIR,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
});
