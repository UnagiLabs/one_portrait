import { expect, type Page, test } from "@playwright/test";

import {
  installDefaultMocks,
  STUB_DIGEST,
  STUB_UNIT_ID,
} from "./fixtures/mock-network";
import {
  TINY_JPEG_BUFFER,
  TINY_JPEG_MIME,
  TINY_JPEG_NAME,
} from "./fixtures/tiny-jpeg";

const CONSENT_LABEL =
  /I understand that the original image I submit will be stored on Walrus and can be retrieved by anyone who knows the blob_id\. I also agree that a Soulbound, non-transferable Kakera NFT will be issued to my wallet as proof of participation\./;

async function submitPhoto(page: Page): Promise<void> {
  await page.goto(`/units/${STUB_UNIT_ID}`);

  await expect(page.getByText(/zkLogin address confirmed/)).toBeVisible();

  await page
    .getByRole("checkbox", {
      name: CONSENT_LABEL,
    })
    .check();

  await page.locator('input[type="file"]').setInputFiles({
    name: TINY_JPEG_NAME,
    mimeType: TINY_JPEG_MIME,
    buffer: TINY_JPEG_BUFFER,
  });

  await expect(page.getByAltText("Submission preview").first()).toBeVisible();

  await page.getByRole("button", { name: "Confirm submission" }).click();
}

async function submitPhotoWithExpectedWallet(
  page: Page,
  connectedCopy: RegExp,
): Promise<void> {
  await page.goto(`/units/${STUB_UNIT_ID}`);

  await expect(page.getByText(connectedCopy)).toBeVisible();

  await page
    .getByRole("checkbox", {
      name: CONSENT_LABEL,
    })
    .check();

  await page.locator('input[type="file"]').setInputFiles({
    name: TINY_JPEG_NAME,
    mimeType: TINY_JPEG_MIME,
    buffer: TINY_JPEG_BUFFER,
  });

  await expect(page.getByAltText("Submission preview").first()).toBeVisible();

  await page.getByRole("button", { name: "Confirm submission" }).click();
}

test.describe("submit happy path", () => {
  test("signs in via stub wallet and posts a photo through to Kakera", async ({
    page,
  }) => {
    await installDefaultMocks(page);
    await submitPhoto(page);

    await expect(page.getByText("Submission complete.")).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText("Kakera received.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("#1")).toBeVisible();

    await page.screenshot({
      path: "playwright-report/submit-success.png",
      fullPage: true,
    });
  });

  test("shows unit status and gallery CTAs after successful submission on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installDefaultMocks(page);
    await submitPhoto(page);

    const unitStatusLink = page.getByRole("link", {
      name: "View completion status",
    });
    const galleryLink = page.getByRole("link", {
      name: "View history gallery",
    });
    await expect(unitStatusLink).toBeVisible({ timeout: 15_000 });
    await expect(unitStatusLink).toHaveAttribute(
      "href",
      `/units/${STUB_UNIT_ID}`,
    );
    await expect(galleryLink).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(
        "You can watch the reveal and finalize status on this Unit page, and review your participation record in the history gallery.",
      ),
    ).toBeVisible();

    await galleryLink.click();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /participation gallery/i,
      }),
    ).toBeVisible();
  });

  test("recovers to the participation card when execute HTTP fails but the digest confirms success", async ({
    page,
  }) => {
    await installDefaultMocks(page, {
      executeApiMode: "recovering_http_error",
      transactionExecutionStatus: "success",
      kakeraVisibleAfterExecute: true,
    });
    await submitPhoto(page);

    await expect(page.getByText("Submission complete.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(STUB_DIGEST)).toBeVisible();
    await expect(page.getByText("Kakera received.")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("recovers to the participation card when the digest is still unknown but Kakera is already visible", async ({
    page,
  }) => {
    await installDefaultMocks(page, {
      executeApiMode: "recovering_http_error",
      transactionExecutionStatus: "unknown",
      kakeraVisibleAfterExecute: true,
    });
    await submitPhoto(page);

    await expect(page.getByText("Submission complete.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(STUB_DIGEST)).toBeVisible();
    await expect(page.getByText("Kakera received.")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("keeps the recovery message first and only shows retry after confirmed failure", async ({
    page,
  }) => {
    await installDefaultMocks(page, {
      executeApiMode: "recovering_http_error",
      transactionExecutionStatus: "failed",
      transactionBlockDelayMs: 800,
      kakeraVisibleAfterExecute: false,
    });
    await submitPhoto(page);

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
    await expect(
      page.getByRole("button", { name: "Submit again" }),
    ).toBeVisible();
  });

  test("submits successfully from a normal Sui wallet through the sponsored sender flow", async ({
    page,
  }) => {
    await installDefaultMocks(page, { autoConnectWalletKind: "sui" });
    await submitPhotoWithExpectedWallet(page, /Sui wallet address confirmed/);

    await expect(page.getByText("Submission complete.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Kakera received.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("#1")).toBeVisible();
  });
});
