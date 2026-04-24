import { expect, test } from "@playwright/test";

const displayName = `Live Zero Demo ${Date.now()}`;
const thumbnailUrl =
  "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?w=320";
const targetJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCABAAEADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAbEAACAgMBAAAAAAAAAAAAAAAAFQFiUpGhYf/EABYBAQEBAAAAAAAAAAAAAAAAAAAFCP/EABcRAQEBAQAAAAAAAAAAAAAAAAATFGH/2gAMAwEAAhEDEQA/AKln70ydBru4z96IFxn70QLjP3ogXGfvRAuM/eiBcZ+9EC4z96IF0i0nIrwRtA0nIQNA0nIQNA0nIQNA0nIQNA0nIQNA0nIQNA0nIQNCRZxlGyxBGuM4yjYgXGcZRsQLjOMo2IFxnGUbEC4zjKNiBcZxlGxAuM4yjYgXSTS/SxBF0DS/RA0DS/RA0DS/RA0DS/RA0DS/RA0DS/RA0DS/RA0JFnaNliCPfoztGxAv0Z2jYgX6M7RsQL9Gdo2IF+jO0bEC/RnaNiBfoztGxAv1JM7dK8EW4zt0QLjO3RAuM7dEC4zt0QLjO3RAuM7dEC4zt0QLpFpGRZgjX6NIyEC/RpGQgX6NIyEC/RpGQgX6NIyEC/RpGQgX6NIyEC/Ui0sWII1xpYQLjSwgXGlhAuNLCBcaWEC40sIFxpYQLv/Z",
  "base64",
);

test.describe.configure({ mode: "serial" });

test.skip(
  process.env.OP_LIVE_E2E !== "1",
  "Set OP_LIVE_E2E=1 to run the live Cloudflare/Sui/Walrus admin flow.",
);

test("creates and finalizes a zero-upload demo unit from the live admin page", async ({
  page,
  request,
}) => {
  const health = await request.get("/api/admin/health");
  const healthText = await health.text();
  expect(health.ok(), healthText).toBe(true);
  expect(JSON.parse(healthText)).toMatchObject({
    dispatchAuthorization: { status: "ok" },
    generatorReadiness: { status: "ok" },
  });

  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Demo admin console" }),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        await page.getByRole("button", { name: "Refresh status" }).click();
        return await page.getByText("worker_kv").count();
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);

  await page.getByLabel("displayName").fill(displayName);
  await page.getByLabel("thumbnail URL").fill(thumbnailUrl);
  await page.getByLabel("Target image").setInputFiles({
    name: "target.jpg",
    mimeType: "image/jpeg",
    buffer: targetJpeg,
  });
  await expect(page.getByText("Target image uploaded")).toBeVisible({
    timeout: 60_000,
  });

  await page.getByRole("radio", { name: /Demo/ }).check();
  await page.getByLabel("Demo real upload count").fill("0");
  await expect(
    page.getByText(/Treat as filled immediately after creating 0 photos/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create unit" }).click();

  const action = page.getByText(/Unit ID: 0x[0-9a-fA-F]+/);
  await expect(action).toBeVisible({ timeout: 120_000 });
  const unitId = extractUnitId((await action.textContent()) ?? "");

  await expect
    .poll(
      async () => {
        await page.getByRole("button", { name: "Refresh status" }).click();
        const unitCard = page.locator("article").filter({ hasText: unitId });
        return (await unitCard.count()) > 0
          ? await unitCard.first().textContent()
          : "";
      },
      { timeout: 120_000 },
    )
    .toContain("filled");

  const unitCard = page.locator("article").filter({ hasText: unitId }).first();
  await expect(unitCard).toContainText("2000 / 2000");
  await expect(unitCard).toContainText("0 / 0");
  await unitCard.getByRole("button", { name: /Retry finalize/ }).click();
  await expect(page.getByText("Finalize retried")).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByText(/Status: finalized/)).toBeVisible();

  await page.goto(
    `/units/${unitId}?athleteName=${encodeURIComponent(displayName)}`,
  );
  await expect(page.locator(".op-big-counter")).toContainText(
    /2000\s*\/\s*2000/,
    { timeout: 60_000 },
  );
  await expect(page.getByTestId("reveal-image")).toBeVisible({
    timeout: 120_000,
  });
});

function extractUnitId(value: string): string {
  const match = value.match(/0x[0-9a-fA-F]+/);
  if (!match) {
    throw new Error(`Could not find unit id in action detail: ${value}`);
  }
  return match[0];
}
