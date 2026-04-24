import { expect, type Page, test } from "@playwright/test";

import { installDefaultMocks, STUB_UNIT_ID } from "./fixtures/mock-network";
import {
  TINY_JPEG_BUFFER,
  TINY_JPEG_MIME,
  TINY_JPEG_NAME,
} from "./fixtures/tiny-jpeg";

const DEMO_UNIT_ID =
  "0x00000000000000000000000000000000000000000000000000000000000000d2";
const DEMO_SECOND_UNIT_ID =
  "0x00000000000000000000000000000000000000000000000000000000000000d4";
const CONSENT_LABEL =
  /I understand that the original image I submit will be stored on Walrus and can be retrieved by anyone who knows the blob_id\. I also agree that a Soulbound, non-transferable Kakera NFT will be issued to my wallet as proof of participation\./;

async function submitPhoto(page: Page): Promise<void> {
  await page.goto(`/units/${STUB_UNIT_ID}`);

  await expect(page.getByText(/zkLogin address confirmed/)).toBeVisible();

  await page
    .getByRole("checkbox", {
      name: CONSENT_LABEL,
    })
    .check();

  await page.locator('input[type="file"]').setInputFiles({
    name: TINY_JPEG_NAME,
    mimeType: TINY_JPEG_MIME,
    buffer: TINY_JPEG_BUFFER,
  });

  await expect(page.getByAltText("Submission preview").first()).toBeVisible();
  await page.getByRole("button", { name: "Confirm submission" }).click();
}

test.describe("readiness regression", () => {
  test("keeps the top page path to the gallery", async ({ page }) => {
    await installDefaultMocks(page);

    await page.goto("/");

    await page.getByRole("link", { name: /participation history/i }).click();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /participation gallery/i,
      }),
    ).toBeVisible();
  });

  test("keeps the waiting room path to the gallery", async ({ page }) => {
    await installDefaultMocks(page);

    await page.goto(`/units/${STUB_UNIT_ID}`);

    await page.getByRole("link", { name: /participation history/i }).click();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /participation gallery/i,
      }),
    ).toBeVisible();
  });

  test("keeps the gallery connect CTA for signed-out visitors", async ({
    page,
  }) => {
    await installDefaultMocks(page, { autoConnectWallet: false });

    await page.goto("/gallery");

    await expect(
      page.getByText(
        /Connect Google zkLogin or Sui wallet to load your Kakera history./,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Google zkLogin" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sui wallet" }),
    ).toBeVisible();
  });

  test("keeps the Sui wallet connect dialog inside the gallery viewport", async ({
    page,
  }) => {
    await installDefaultMocks(page, { autoConnectWallet: false });

    await page.goto("/gallery");
    await page.getByRole("button", { name: "Sui wallet" }).click();

    const dialog = page.getByRole("dialog", { name: "Connect a Wallet" });
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();

    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();

    if (!box || !viewport) {
      throw new Error(
        "Connect dialog bounding box or viewport was unavailable",
      );
    }

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });

  test("keeps the post-submit gallery CTA", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installDefaultMocks(page);
    await submitPhoto(page);

    await expect(page.getByText("Submission complete.")).toBeVisible({
      timeout: 15_000,
    });

    const galleryLink = page.getByRole("link", {
      name: "View history gallery",
    });
    await expect(galleryLink).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(
        /You can watch the reveal and finalize\s*status on this Unit page, and review your participation record in the history gallery./,
      ),
    ).toBeVisible();

    await galleryLink.click();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /participation gallery/i,
      }),
    ).toBeVisible();
  });

  test("keeps degraded cards distinct on the top page", async ({ page }) => {
    await installDefaultMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(
      `/?op_e2e_home_card_state=${DEMO_UNIT_ID}:waiting,${DEMO_SECOND_UNIT_ID}:unavailable`,
    );

    await expect(
      page.getByText(/Waiting \/ No active unit/i).first(),
    ).toBeVisible();
    await expect(
      page
        .getByText(/Progress temporarily unavailable|temporarily unavailable/i)
        .first(),
    ).toBeVisible();

    const hasNoHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(hasNoHorizontalOverflow).toBe(true);
  });

  test("keeps the waiting room fallback readable in degraded mode", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(
      `/units/${STUB_UNIT_ID}?athleteName=${encodeURIComponent("Demo Athlete One")}&op_e2e_unit_progress=missing`,
    );

    await expect(
      page.getByRole("heading", { level: 1, name: "Demo Athlete One" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Waiting \/ No active unit|on-chain progress is not available/i,
      ),
    ).toBeVisible();

    const hasNoHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(hasNoHorizontalOverflow).toBe(true);
  });
});
