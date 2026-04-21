import { unitTileCount } from "@one-portrait/shared";
import { expect, test } from "@playwright/test";

import { installDefaultMocks } from "./fixtures/mock-network";

test.describe("home smoke", () => {
  test("renders the landing hero and athlete cards", async ({ page }) => {
    await installDefaultMocks(page);

    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: new RegExp(`${unitTileCount} faces`, "i"),
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
});
