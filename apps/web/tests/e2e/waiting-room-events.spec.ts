import { unitTileCount } from "@one-portrait/shared";
import { expect, test } from "@playwright/test";

import { installDefaultMocks, STUB_UNIT_ID } from "./fixtures/mock-network";

test.describe("waiting room events", () => {
  test("bootstrap renders the active waiting room deterministically", async ({
    page,
  }) => {
    await installDefaultMocks(page);

    await page.goto(
      `/units/${STUB_UNIT_ID}?athleteName=${encodeURIComponent("Demo Athlete One")}&op_e2e_unit_progress=active`,
    );

    await expect(
      page.getByRole("heading", { name: "Demo Athlete One" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        new RegExp(`${unitTileCount - 1}\\s*/\\s*${unitTileCount}`),
      ),
    ).toBeVisible();
  });
});
