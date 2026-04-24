import { expect, test } from "@playwright/test";

import { STUB_MASTER_ID, STUB_UNIT_ID } from "../../src/lib/e2e/stub-data";
import { installDefaultMocks } from "./fixtures/mock-network";

test.describe("gallery states", () => {
  test("shows the empty gallery state", async ({ page }) => {
    await installDefaultMocks(page);

    await page.goto("/gallery");

    await expect(page.getByText("Empty", { exact: true })).toBeVisible();
    await expect(page.getByText(/No Kakera found yet./)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Check again" }),
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

  test("navigates from a completed card to the finalized unit page", async ({
    page,
  }) => {
    await installDefaultMocks(page, { galleryEntryMode: "completed" });

    await page.goto("/gallery");

    const unitLink = page.getByRole("link", {
      name: /View position on Unit page/i,
    });

    await expect(unitLink).toHaveAttribute(
      "href",
      `/units/${STUB_UNIT_ID}?athleteName=Demo+Athlete+One&op_e2e_unit_progress=finalized`,
    );

    await unitLink.click();

    await expect(page).toHaveURL(
      new RegExp(
        `/units/${STUB_UNIT_ID}\\?athleteName=Demo\\+Athlete\\+One&op_e2e_unit_progress=finalized`,
      ),
    );
    await expect(page.getByTestId("reveal-image")).toBeVisible();
    await expect(page.getByTestId("placement-highlight")).toBeVisible();
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
    await expect(page.getByText(/Could not load history./)).toBeVisible();

    await page.getByRole("button", { name: "Check again" }).click();

    await expect(page.getByText("Empty", { exact: true })).toBeVisible();
    await expect(page.getByText(/No Kakera found yet./)).toBeVisible();
  });

  test("shows the config-missing gallery shell from the request selector", async ({
    page,
  }) => {
    await installDefaultMocks(page);

    await page.goto("/gallery?op_e2e_gallery_state=config-missing");

    await expect(page.getByText("Unavailable")).toBeVisible();
    await expect(
      page.getByText(/Could not verify public configuration./),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Check again" })).toHaveCount(
      0,
    );
  });
});
