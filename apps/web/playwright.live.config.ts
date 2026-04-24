import { defineConfig, devices } from "@playwright/test";

const LIVE_BASE_URL =
  process.env.OP_LIVE_E2E_BASE_URL ??
  "https://one-portrait-web.bububutasan00.workers.dev/";

export default defineConfig({
  testDir: "./tests/live",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    [
      "html",
      {
        host: "0.0.0.0",
        port: 9324,
        open: "never",
        outputFolder: "playwright-report-live",
      },
    ],
    ["list"],
  ],
  use: {
    baseURL: LIVE_BASE_URL,
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "live-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
