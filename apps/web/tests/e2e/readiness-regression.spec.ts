import { expect, type Page, test } from "@playwright/test";

import {
  installDefaultMocks,
  STUB_UNIT_ID,
} from "./fixtures/mock-network";
import {
  TINY_JPEG_BUFFER,
  TINY_JPEG_MIME,
  TINY_JPEG_NAME,
} from "./fixtures/tiny-jpeg";

async function submitPhoto(page: Page): Promise<void> {
  await page.goto(`/units/${STUB_UNIT_ID}`);

  await expect(
    page.getByText(/zkLogin アドレスを確認できました/),
  ).toBeVisible();

  await page
    .getByRole("checkbox", {
      name: /投稿した原画像は Walrus に保存され/,
    })
    .check();

  await page.locator('input[type="file"]').setInputFiles({
    name: TINY_JPEG_NAME,
    mimeType: TINY_JPEG_MIME,
    buffer: TINY_JPEG_BUFFER,
  });

  await expect(page.getByAltText("投稿プレビュー").first()).toBeVisible();
  await page.getByRole("button", { name: "投稿を確定" }).click();
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
        /先に Google でログインすると、あなたの Kakera 履歴を読み込めます。/,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Google でログイン" }),
    ).toBeVisible();
  });

  test("keeps the post-submit gallery CTA", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installDefaultMocks(page);
    await submitPhoto(page);

    await expect(page.getByText("投稿が完了しました。")).toBeVisible({
      timeout: 15_000,
    });

    const galleryLink = page.getByRole("link", {
      name: "履歴ギャラリーを見る",
    });
    await expect(galleryLink).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("次は履歴ギャラリーで参加記録を確認できます。"),
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

    await page.goto("/?op_e2e_home_card_state=1:waiting,2:unavailable");

    await expect(page.getByText(/待機中|No active unit/i)).toBeVisible();
    await expect(
      page
        .getByText(/進捗を一時取得できません|temporarily unavailable/i)
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
        /待機中|No active unit|on-chain progress is not available/i,
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
