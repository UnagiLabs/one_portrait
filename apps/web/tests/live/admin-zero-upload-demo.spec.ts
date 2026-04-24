import { expect, test } from "@playwright/test";

const displayName = `Live Zero Demo ${Date.now()}`;
const thumbnailUrl =
  "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?w=320";
const targetPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAABmJLR0QA/wD/AP+gvaeTAAAAWUlEQVRoge3PQQ3AIADAQMA+LfqX5FGBwVSgeNPM5mZ2fQF8G2AbYBtgG2AbYBtgG2AbYBtgG2AbYBtgG2AbYBtgG2AbYBtgG2AbYBtgG2AbYBtgG2AbYPsF2QExRwLFdQAAAABJRU5ErkJggg==",
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
    page.getByRole("heading", { name: "デモ管理コンソール" }),
  ).toBeVisible();

  await page.getByLabel("displayName").fill(displayName);
  await page.getByLabel("thumbnail URL").fill(thumbnailUrl);
  await page.getByLabel("対象画像").setInputFiles({
    name: "target.png",
    mimeType: "image/png",
    buffer: targetPng,
  });
  await expect(page.getByText("対象画像をアップロードしました")).toBeVisible({
    timeout: 60_000,
  });

  await page.getByRole("radio", { name: /デモ/ }).check();
  await page.getByLabel("デモ実アップロード枚数").fill("0");
  await expect(page.getByText(/0 枚作成直後/)).toBeVisible();
  await page.getByRole("button", { name: "ユニットを作成" }).click();

  const action = page.getByText(/ユニットID: 0x[0-9a-fA-F]+/);
  await expect(action).toBeVisible({ timeout: 120_000 });
  const unitId = extractUnitId((await action.textContent()) ?? "");

  await expect
    .poll(
      async () => {
        await page.getByRole("button", { name: "状態を更新" }).click();
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
  await unitCard.getByRole("button", { name: /finalize を再試行/ }).click();
  await expect(page.getByText("finalize を再試行しました")).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByText(/ステータス: finalized/)).toBeVisible();

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
