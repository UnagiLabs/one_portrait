import { expect, type Page, test } from "@playwright/test";

import {
  installDefaultMocks,
  STUB_DIGEST,
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

test.describe("submit happy path", () => {
  test("signs in via stub wallet and posts a photo through to Kakera", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await submitPhoto(page);

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

  test("recovers to the participation card when execute HTTP fails but the digest confirms success", async ({
    page,
  }) => {
    await installDefaultMocks(page, {
      executeApiMode: "recovering_http_error",
      transactionExecutionStatus: "success",
      kakeraVisibleAfterExecute: true,
    });
    await submitPhoto(page);

    await expect(page.getByText("投稿が完了しました。")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(STUB_DIGEST)).toBeVisible();
    await expect(page.getByText("Kakera を受け取りました。")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("recovers to the participation card when the digest is still unknown but Kakera is already visible", async ({
    page,
  }) => {
    await installDefaultMocks(page, {
      executeApiMode: "recovering_http_error",
      transactionExecutionStatus: "unknown",
      kakeraVisibleAfterExecute: true,
    });
    await submitPhoto(page);

    await expect(page.getByText("投稿が完了しました。")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(STUB_DIGEST)).toBeVisible();
    await expect(page.getByText("Kakera を受け取りました。")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("keeps the recovery message first and only shows retry after confirmed failure", async ({
    page,
  }) => {
    await installDefaultMocks(page, {
      executeApiMode: "recovering_http_error",
      transactionExecutionStatus: "failed",
      transactionBlockDelayMs: 800,
      kakeraVisibleAfterExecute: false,
    });
    await submitPhoto(page);

    await expect(
      page.getByText("投稿結果を確認しています。しばらくお待ちください。"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "もう一度送信する" }),
    ).toBeHidden();
    await expect(
      page.getByText("投稿を完了できませんでした。もう一度送信してください。"),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: "もう一度送信する" }),
    ).toBeVisible();
  });
});
