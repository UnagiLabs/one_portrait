import { expect, test } from "@playwright/test";

import { installDefaultMocks, STUB_MASTER_ID } from "./fixtures/mock-network";

test.describe("gallery states", () => {
  test("shows the empty gallery state", async ({ page }) => {
    await installDefaultMocks(page);

    await page.goto("/gallery");

    await expect(page.getByText("Empty")).toBeVisible();
    await expect(
      page.getByText(/まだ Kakera が見つかりません。/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "もう一度確認する" }),
    ).toBeVisible();
  });

  test("shows a completed gallery entry with mosaic and metadata", async ({
    page,
  }) => {
    await installDefaultMocks(page, { galleryEntryMode: "completed" });

    await page.goto("/gallery");

    await expect(
      page.getByAltText(/Demo Athlete One completed mosaic/i),
    ).toBeVisible();
    await expect(
      page.getByText("Completed", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Placed at 12, 8/i)).toBeVisible();
    await expect(page.getByText(`Master ${STUB_MASTER_ID}`)).toBeVisible();
  });

  test("keeps a completed card visible when the original image fails", async ({
    page,
  }) => {
    await installDefaultMocks(page, {
      galleryEntryMode: "completed",
      originalImageMode: "original_blob_not_found",
    });

    await page.goto("/gallery");

    await expect(
      page.getByText("Completed", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Original photo unavailable/i)).toBeVisible();
    await expect(
      page.getByAltText(/Demo Athlete One completed mosaic/i),
    ).toBeVisible();
    await expect(page.getByText(/Placed at 12, 8/i)).toBeVisible();
  });

  test("renders an entry unavailable gallery card when hydration fails", async ({
    page,
  }) => {
    await installDefaultMocks(page, { galleryEntryMode: "hydration_error" });

    await page.goto("/gallery");

    await expect(
      page.getByText("Unavailable", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Entry unavailable right now/i)).toBeVisible();
    await expect(page.getByText(/Submission #1/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: /Participation gallery/i }),
    ).toBeVisible();
  });

  test("retries a temporary gallery failure and recovers to empty", async ({
    page,
  }) => {
    await installDefaultMocks(page, { ownedObjectsFailuresBeforeSuccess: 2 });

    await page.goto("/gallery");

    await expect(page.getByText("Unavailable")).toBeVisible();
    await expect(page.getByText(/履歴を読み込めませんでした。/)).toBeVisible();

    await page.getByRole("button", { name: "もう一度確認する" }).click();

    await expect(page.getByText("Empty")).toBeVisible();
    await expect(
      page.getByText(/まだ Kakera が見つかりません。/),
    ).toBeVisible();
  });

  test("shows the config-missing gallery shell from the request selector", async ({
    page,
  }) => {
    await installDefaultMocks(page);

    await page.goto("/gallery?op_e2e_gallery_state=config-missing");

    await expect(page.getByText("Unavailable")).toBeVisible();
    await expect(page.getByText(/公開設定を確認できません。/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "もう一度確認する" }),
    ).toHaveCount(0);
  });
});
