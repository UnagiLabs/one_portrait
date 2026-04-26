import { expect, type Page, test } from "@playwright/test";

import {
  TINY_JPEG_BUFFER,
  TINY_JPEG_MIME,
  TINY_JPEG_NAME,
} from "./fixtures/tiny-jpeg";

type ForbiddenNetworkState = {
  readonly calls: Map<string, number>;
  readonly total: () => number;
};

const FORBIDDEN_ROUTES: readonly [string, string | RegExp][] = [
  ["enoki sponsor", "**/api/enoki/submit-photo/sponsor"],
  ["enoki execute", "**/api/enoki/submit-photo/execute"],
  ["finalize", "**/api/finalize"],
  ["admin finalize", "**/api/admin/finalize"],
  ["admin create unit", "**/api/admin/create-unit"],
  ["generator dispatch", /\/dispatch(?:\?|$)/],
  ["walrus publisher", /publisher(?:\.[^/]+)?\/.*\/v1\/blobs(?:\?|\/|$)/],
  ["walrus blobs", /\/v1\/blobs(?:\?|\/|$)/],
];

async function installForbiddenNetworkGuards(
  page: Page,
): Promise<ForbiddenNetworkState> {
  const calls = new Map<string, number>(
    FORBIDDEN_ROUTES.map(([name]) => [name, 0]),
  );

  for (const [name, routePattern] of FORBIDDEN_ROUTES) {
    await page.route(routePattern, async (route) => {
      calls.set(name, (calls.get(name) ?? 0) + 1);
      await route.fulfill({
        status: 418,
        contentType: "application/json",
        body: JSON.stringify({ error: `forbidden ${name}` }),
      });
    });
  }

  return {
    calls,
    total: () =>
      Array.from(calls.values()).reduce((sum, count) => sum + count, 0),
  };
}

async function selectTinyImage(page: Page): Promise<void> {
  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeVisible();
  await fileInput.setInputFiles({
    name: TINY_JPEG_NAME,
    mimeType: TINY_JPEG_MIME,
    buffer: TINY_JPEG_BUFFER,
  });
}

async function expectNoForbiddenNetworkCalls(
  state: ForbiddenNetworkState,
): Promise<void> {
  await expect.poll(() => state.total()).toBe(0);
  expect(Object.fromEntries(state.calls)).toEqual(
    Object.fromEntries(FORBIDDEN_ROUTES.map(([name]) => [name, 0])),
  );
}

async function expectHighlightInsideMosaic(page: Page): Promise<void> {
  const highlightBox = await page
    .getByTestId("placement-highlight")
    .boundingBox();
  const mosaicBox = await page.getByTestId("reveal-image").boundingBox();

  expect(highlightBox).not.toBeNull();
  expect(mosaicBox).not.toBeNull();

  if (!highlightBox || !mosaicBox) {
    return;
  }

  expect(highlightBox.x).toBeGreaterThanOrEqual(mosaicBox.x - 1);
  expect(highlightBox.y).toBeGreaterThanOrEqual(mosaicBox.y - 1);
  expect(highlightBox.x + highlightBox.width).toBeLessThanOrEqual(
    mosaicBox.x + mosaicBox.width + 1,
  );
  expect(highlightBox.y + highlightBox.height).toBeLessThanOrEqual(
    mosaicBox.y + mosaicBox.height + 1,
  );
}

async function expectElementsDoNotOverlap(
  page: Page,
  firstTestId: string,
  secondAltText: string,
): Promise<void> {
  const firstBox = await page.getByTestId(firstTestId).boundingBox();
  const secondBox = await page.getByAltText(secondAltText).boundingBox();

  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();

  if (!firstBox || !secondBox) {
    return;
  }

  const separated =
    firstBox.x + firstBox.width <= secondBox.x ||
    secondBox.x + secondBox.width <= firstBox.x ||
    firstBox.y + firstBox.height <= secondBox.y ||
    secondBox.y + secondBox.height <= firstBox.y;

  expect(separated).toBe(true);
}

async function runDemoStageFlow(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/demo");

  await expect(
    page.getByRole("main", { name: /Takeru Unit demo/i }),
  ).toBeVisible();
  await expect(page.getByText(/1999\s*\/\s*2000/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Google zkLogin/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Sui wallet/i })).toBeVisible();

  await page.getByRole("button", { name: /Google zkLogin/i }).click();

  await expect(page.getByText(/Demo wallet address confirmed/i)).toBeVisible();
  await expect(page.getByText(/0xdemo\.\.\.2000/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Confirm submission/i }),
  ).toBeVisible();

  await selectTinyImage(page);

  await expect(page.getByText(/1999\s*\/\s*2000/)).toBeVisible();
  await expect(page.getByText(/2000\s*\/\s*2000/)).toHaveCount(0);
  await expect(page.getByAltText("Selected submission preview")).toBeVisible();
  await expect(page.getByTestId("demo-completion-reveal")).toHaveCount(0);

  await page.getByRole("button", { name: /Confirm submission/i }).click();

  await expect(page.getByText(/2000\s*\/\s*2000/)).toBeVisible();
  await expect(page.getByText(/1999\s*\/\s*2000/)).toHaveCount(0);
  await expect(page.getByTestId("demo-reveal-overlay")).toBeVisible();
  await expect(page.getByTestId("demo-reveal-canvas")).toBeVisible();
  await expect(
    page.getByText(/Photo tiles converge into one mosaic/i),
  ).toBeVisible();
  await expectFullScreenOverlay(page);
  await expect(page.getByTestId("demo-reveal-overlay")).toHaveCount(0, {
    timeout: 10_000,
  });

  await expect(page.getByTestId("demo-completion-reveal")).toBeVisible();
  await expect(page.getByAltText("Takeru completed mosaic")).toBeVisible();
  await expect(page.getByAltText("Takeru original submission")).toBeVisible();
  await expect(page.getByTestId("placement-highlight")).toBeVisible();
  await expect(
    page.getByText(/highlighted at \(37, 46\) as #2000/i),
  ).toBeVisible();
  await expectHighlightInsideMosaic(page);
  await expectElementsDoNotOverlap(
    page,
    "placement-highlight",
    "Takeru original submission",
  );

  await page.getByRole("button", { name: /Hide highlight/i }).click();

  await expect(page.getByTestId("placement-highlight")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Show highlight/i }),
  ).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: /Show highlight/i }).click();

  await expect(page.getByTestId("placement-highlight")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Hide highlight/i }),
  ).toHaveAttribute("aria-pressed", "true");
}

async function expectFullScreenOverlay(page: Page): Promise<void> {
  const overlayBox = await page
    .getByTestId("demo-reveal-overlay")
    .boundingBox();
  const viewport = page.viewportSize();

  expect(overlayBox).not.toBeNull();
  expect(viewport).not.toBeNull();

  if (!overlayBox || !viewport) {
    return;
  }

  expect(overlayBox.x).toBeLessThanOrEqual(1);
  expect(overlayBox.y).toBeLessThanOrEqual(1);
  expect(overlayBox.width).toBeGreaterThanOrEqual(viewport.width - 2);
  expect(overlayBox.height).toBeGreaterThanOrEqual(viewport.height - 2);
}

test.describe("/demo stage flow", () => {
  test("completes the desktop demo locally without upload or finalize calls", async ({
    page,
  }) => {
    const forbiddenNetwork = await installForbiddenNetworkGuards(page);

    await runDemoStageFlow(page);

    await expectNoForbiddenNetworkCalls(forbiddenNetwork);
  });

  test("keeps the main demo operation usable on a mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const forbiddenNetwork = await installForbiddenNetworkGuards(page);

    await runDemoStageFlow(page);

    await expectNoForbiddenNetworkCalls(forbiddenNetwork);
  });
});
