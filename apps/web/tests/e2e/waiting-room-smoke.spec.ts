import { expect, test } from "@playwright/test";

import { installDefaultMocks, STUB_UNIT_ID } from "./fixtures/mock-network";

test.describe("waiting room smoke", () => {
  test("navigates from the waiting room to the participation gallery", async ({
    page,
  }) => {
    await installDefaultMocks(page);

    await page.goto(`/units/${STUB_UNIT_ID}`);

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
