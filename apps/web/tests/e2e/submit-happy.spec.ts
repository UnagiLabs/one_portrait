import { expect, test } from "@playwright/test";

import { installDefaultMocks, STUB_UNIT_ID } from "./fixtures/mock-network";
import {
  TINY_JPEG_BUFFER,
  TINY_JPEG_MIME,
  TINY_JPEG_NAME,
} from "./fixtures/tiny-jpeg";

test.describe("submit happy path", () => {
  test("signs in via stub wallet and posts a photo through to Kakera", async ({
    page,
  }) => {
    await installDefaultMocks(page);

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

    await expect(page.getByText("投稿が完了しました。")).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText("Kakera を受け取りました。")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("#1")).toBeVisible();

    await page.screenshot({
      path: "playwright-report/submit-success.png",
      fullPage: true,
    });
  });
});
