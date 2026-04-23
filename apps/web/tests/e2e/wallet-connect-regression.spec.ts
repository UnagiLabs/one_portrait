import { expect, test } from "@playwright/test";

import { installDefaultMocks } from "./fixtures/mock-network";

test.describe("wallet connect regression", () => {
  test("connects a Sui wallet from the header login menu", async ({ page }) => {
    await installDefaultMocks(page, { autoConnectWallet: false });

    await page.goto("/");

    await page.getByRole("button", { name: "ログイン" }).click();
    await page.getByRole("button", { name: "Sui wallet" }).click();

    const connectDialog = page.getByRole("dialog", {
      name: "Connect a Wallet",
    });
    await expect(connectDialog).toBeVisible();

    await page
      .getByRole("button", { name: "ONE Portrait E2E Sui Stub" })
      .click();

    await expect(
      page.getByRole("button", { name: "0xe2e0...0001" }),
    ).toBeVisible();
  });

  test("keeps the page-local gallery Sui wallet CTA working", async ({
    page,
  }) => {
    await installDefaultMocks(page, { autoConnectWallet: false });

    await page.goto("/gallery");

    await page.getByRole("button", { name: "Sui wallet" }).click();

    const connectDialog = page.getByRole("dialog", {
      name: "Connect a Wallet",
    });
    await expect(connectDialog).toBeVisible();

    await page
      .getByRole("button", { name: "ONE Portrait E2E Sui Stub" })
      .click();

    await expect(page.getByText("Empty")).toBeVisible();
    await expect(
      page.getByText(/まだ Kakera が見つかりません。/),
    ).toBeVisible();
  });
});
