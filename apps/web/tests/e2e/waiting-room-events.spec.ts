import { unitTileCount } from "@one-portrait/shared";
import { expect, type Page, test } from "@playwright/test";

import { installDefaultMocks, STUB_UNIT_ID } from "./fixtures/mock-network";

async function openActiveWaitingRoom(
  page: Page,
  options: Parameters<typeof installDefaultMocks>[1] = {},
): Promise<Awaited<ReturnType<typeof installDefaultMocks>>> {
  const state = await installDefaultMocks(page, options);

  await page.goto(
    `/units/${STUB_UNIT_ID}?athleteName=${encodeURIComponent("Demo Athlete One")}&op_e2e_unit_progress=active`,
  );

  await expect(
    page.getByRole("heading", { name: "Demo Athlete One" }),
  ).toBeVisible();

  return state;
}

test.describe("waiting room events", () => {
  test("bootstrap renders the active waiting room deterministically", async ({
    page,
  }) => {
    await openActiveWaitingRoom(page);

    await expect(
      page.getByRole("heading", { name: "Demo Athlete One" }),
    ).toBeVisible();
    await expect(page.getByTestId("live-progress-counter")).toContainText(
      new RegExp(
        `${(unitTileCount - 1).toLocaleString()}\\s*/\\s*${unitTileCount.toLocaleString()}`,
      ),
    );
  });

  test("SubmittedEvent increments the counter and UnitFilledEvent finalizes only once", async ({
    page,
  }) => {
    const state = await openActiveWaitingRoom(page, {
      waitingRoomEventMode: "active",
    });

    await expect(page.getByTestId("live-progress-counter")).toContainText(
      new RegExp(
        `${unitTileCount.toLocaleString()}\\s*/\\s*${unitTileCount.toLocaleString()}`,
      ),
      { timeout: 15_000 },
    );
    await expect(page.getByText("Filled")).toBeVisible();
    await expect.poll(() => state.finalizeRequests).toBe(1);
    await expect.poll(() => state.lastFinalizeUnitId).toBe(STUB_UNIT_ID);
  });

  test("MosaicReadyEvent reveals the panel and highlights the owned Kakera placement", async ({
    page,
  }) => {
    await openActiveWaitingRoom(page, {
      galleryEntryMode: "completed",
      waitingRoomEventMode: "active",
    });

    await expect(page.getByTestId("reveal-panel")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("placement-highlight")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/Your Kakera is highlighted at \(12, 8\) as #1\./),
    ).toBeVisible();
  });
});
