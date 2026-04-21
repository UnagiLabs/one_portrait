import { expect, test } from "@playwright/test";

import { installDefaultMocks } from "./fixtures/mock-network";

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

  test("retries a temporary gallery failure and recovers to empty", async ({
    page,
  }) => {
    await installDefaultMocks(page, { ownedObjectsFailuresBeforeSuccess: 2 });

    await page.goto("/gallery");

    await expect(page.getByText("Unavailable")).toBeVisible();
    await expect(
      page.getByText(/履歴を読み込めませんでした。/),
    ).toBeVisible();

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
    await expect(
      page.getByText(/公開設定を確認できません。/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "もう一度確認する" }),
    ).toHaveCount(0);
  });
});
