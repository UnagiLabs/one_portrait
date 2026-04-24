import { unitTileCount } from "@one-portrait/shared";
import { expect, test } from "@playwright/test";

import { demoUnitId } from "../../src/lib/demo";
import { installDefaultMocks } from "./fixtures/mock-network";

test.describe("home smoke", () => {
  test("renders the landing hero and athlete cards", async ({ page }) => {
    await installDefaultMocks(page);

    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: new RegExp(`${unitTileCount.toLocaleString()}[\\s\\S]*fans`, "i"),
      }),
    ).toBeVisible();

    const athleteHeadings = page.getByRole("heading", { level: 2 });
    await expect(athleteHeadings.first()).toBeVisible();
    expect(await athleteHeadings.count()).toBeGreaterThanOrEqual(1);
  });

  test("navigates from the landing hero to the participation gallery", async ({
    page,
  }) => {
    await installDefaultMocks(page);

    await page.goto("/");

    const historyLink = page.getByRole("link", {
      name: /participation history/i,
    });
    await expect(historyLink).toBeVisible();

    await historyLink.click();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /participation gallery/i,
      }),
    ).toBeVisible();
  });

  test("shows a connect action in the gallery for signed-out visitors", async ({
    page,
  }) => {
    await installDefaultMocks(page, { autoConnectWallet: false });

    await page.goto("/");
    await page.getByRole("link", { name: /participation history/i }).click();

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

  test("keeps the home page readable on a mobile viewport", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: new RegExp(`${unitTileCount.toLocaleString()}[\\s\\S]*fans`, "i"),
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    const hasNoHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(hasNoHorizontalOverflow).toBe(true);
  });

  test("keeps the waiting room readable on a mobile viewport", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(
      `/units/${demoUnitId}?athleteName=${encodeURIComponent("Demo Athlete One")}`,
    );

    await expect(
      page.getByRole("heading", { level: 1, name: "Demo Athlete One" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Waiting|No active unit|on-chain progress is not available/i,
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
