import { expect, type Page, test } from "@playwright/test";

import { installDefaultMocks, STUB_UNIT_ID } from "./fixtures/mock-network";
import {
  TINY_JPEG_BUFFER,
  TINY_JPEG_MIME,
  TINY_JPEG_NAME,
} from "./fixtures/tiny-jpeg";

const CONSENT_LABEL =
  /I understand that the original image I submit will be stored on Walrus and can be retrieved by anyone who knows the blob_id\. I also agree that a Soulbound, non-transferable Kakera NFT will be issued to my wallet as proof of participation\./;

async function prepareSubmission(page: Page): Promise<string> {
  await page.goto(`/units/${STUB_UNIT_ID}`);

  await expect(page.getByText(/zkLogin address confirmed/)).toBeVisible();

  await page
    .getByRole("checkbox", {
      name: CONSENT_LABEL,
    })
    .check();

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeEnabled();
  await fileInput.setInputFiles({
    name: TINY_JPEG_NAME,
    mimeType: TINY_JPEG_MIME,
    buffer: TINY_JPEG_BUFFER,
  });

  const preview = page.getByAltText("Submission preview").first();
  await expect(preview).toBeVisible();

  const previewSrc = await preview.getAttribute("src");
  if (!previewSrc) {
    throw new Error("expected preview image src");
  }

  await page.getByRole("button", { name: "Confirm submission" }).click();
  return previewSrc;
}

test.describe("waiting room submit guards", () => {
  test("disables the file input until consent is checked", async ({ page }) => {
    await installDefaultMocks(page);

    await page.goto(`/units/${STUB_UNIT_ID}`);

    await expect(page.getByText(/zkLogin address confirmed/)).toBeVisible();

    const consent = page.getByRole("checkbox", { name: CONSENT_LABEL });
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

    await expect(page.getByText(/zkLogin address confirmed/)).toBeVisible();
    await page.getByRole("checkbox", { name: CONSENT_LABEL }).check();

    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Confirm submission" }),
    ).toHaveCount(0);
    await expect(page.getByAltText("Submission preview")).toHaveCount(0);

    expect(state.sponsorRequests).toBe(0);
    expect(state.executeRequests).toBe(0);
    expect(state.publisherRequests).toBe(0);
  });

  test("retry keeps the same preview image without re-selecting the file", async ({
    page,
  }) => {
    const state = await installDefaultMocks(page, {
      executeApiMode: "recovering_http_error",
      transactionExecutionStatus: "failed",
      transactionBlockDelayMs: 800,
      kakeraVisibleAfterExecute: false,
    });
    const previewSrc = await prepareSubmission(page);

    await expect(
      page.getByText("Checking the submission result. Please wait."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit again" }),
    ).toBeHidden();
    await expect(
      page.getByText("Could not complete the submission. Please submit again."),
    ).toBeVisible({
      timeout: 15_000,
    });

    const retryButton = page.getByRole("button", { name: "Submit again" });
    await expect(retryButton).toBeVisible();

    await retryButton.click();

    await expect(
      page.getByAltText("Submission preview").first(),
    ).toHaveAttribute("src", previewSrc);
    await expect.poll(() => state.executeRequests).toBe(2);
  });
});
