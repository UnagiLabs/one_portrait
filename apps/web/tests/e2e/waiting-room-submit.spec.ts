import { expect, test } from "@playwright/test";

import { installDefaultMocks, STUB_UNIT_ID } from "./fixtures/mock-network";

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
});
