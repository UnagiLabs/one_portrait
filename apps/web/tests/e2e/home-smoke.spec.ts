import { expect, test } from "@playwright/test";

import { installDefaultMocks } from "./fixtures/mock-network";

test.describe("home smoke", () => {
  test("renders the landing hero and athlete cards", async ({ page }) => {
    await installDefaultMocks(page);

    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: /500 faces/i }),
    ).toBeVisible();

    const athleteHeadings = page.getByRole("heading", { level: 2 });
    await expect(athleteHeadings.first()).toBeVisible();
    expect(await athleteHeadings.count()).toBeGreaterThanOrEqual(1);
  });
});
