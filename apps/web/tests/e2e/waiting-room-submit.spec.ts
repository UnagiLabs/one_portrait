import { expect, type Page, test } from "@playwright/test";

import { installDefaultMocks, STUB_UNIT_ID } from "./fixtures/mock-network";
import {
  TINY_JPEG_BUFFER,
  TINY_JPEG_MIME,
  TINY_JPEG_NAME,
} from "./fixtures/tiny-jpeg";

async function prepareSubmission(page: Page): Promise<string> {
  await page.goto(`/units/${STUB_UNIT_ID}`);

  await expect(
    page.getByText(/zkLogin アドレスを確認できました/),
  ).toBeVisible();

  await page
    .getByRole("checkbox", {
      name: /投稿した原画像は Walrus に保存され/,
    })
    .check();

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeEnabled();
  await fileInput.setInputFiles({
    name: TINY_JPEG_NAME,
    mimeType: TINY_JPEG_MIME,
    buffer: TINY_JPEG_BUFFER,
  });

  const preview = page.getByAltText("投稿プレビュー").first();
  await expect(preview).toBeVisible();

  const previewSrc = await preview.getAttribute("src");
  if (!previewSrc) {
    throw new Error("expected preview image src");
  }

  await page.getByRole("button", { name: "投稿を確定" }).click();
  return previewSrc;
}

test.describe("waiting room submit guards", () => {
  test("disables the file input until consent is checked", async ({ page }) => {
    await installDefaultMocks(page);

    await page.goto(`/units/${STUB_UNIT_ID}`);

    await expect(
      page.getByText(/zkLogin アドレスを確認できました/),
    ).toBeVisible();

    const consent = page.getByRole("checkbox", { name: /同意/ });
    const fileInput = page.locator('input[type="file"]');

    await expect(consent).not.toBeChecked();
    await expect(fileInput).toBeDisabled();

    await consent.check();

    await expect(fileInput).toBeEnabled();
  });

  test("keeps the submit button absent until a file is selected", async ({
    page,
  }) => {
    const state = await installDefaultMocks(page);

    await page.goto(`/units/${STUB_UNIT_ID}`);

    await expect(
      page.getByText(/zkLogin アドレスを確認できました/),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: /同意/ }).check();

    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await expect(page.getByRole("button", { name: "投稿を確定" })).toHaveCount(
      0,
    );
    await expect(page.getByAltText("投稿プレビュー")).toHaveCount(0);

    expect(state.sponsorRequests).toBe(0);
    expect(state.executeRequests).toBe(0);
    expect(state.publisherRequests).toBe(0);
  });

  test("retry keeps the same preview image without re-selecting the file", async ({
    page,
  }) => {
    const state = await installDefaultMocks(page, {
      executeApiMode: "recovering_http_error",
      transactionExecutionStatus: "failed",
      transactionBlockDelayMs: 800,
      kakeraVisibleAfterExecute: false,
    });
    const previewSrc = await prepareSubmission(page);

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

    const retryButton = page.getByRole("button", { name: "もう一度送信する" });
    await expect(retryButton).toBeVisible();

    await retryButton.click();

    await expect(page.getByAltText("投稿プレビュー").first()).toHaveAttribute(
      "src",
      previewSrc,
    );
    await expect.poll(() => state.executeRequests).toBe(2);
  });
});
