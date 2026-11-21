import { expect, test } from "./fixtures";

/** Screenshots of the main screens for review (saved locally in docs/screenshots/, not committed). */
test("captures the main screens", async ({ page }, testInfo) => {
  const shot = (name: string, fullPage = false) => page.screenshot({ path: `docs/screenshots/${name}-${testInfo.project.name}.png`, fullPage });
  await page.goto("/");
  await shot("home", true);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Let's map your shelf" })).toBeVisible();
  await shot("onboarding");
  await page.getByRole("button", { name: "Load the demo" }).click();
  await expect(page.getByRole("region", { name: "Living room" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Shelves & order" }).click();
  await shot("configurator", true);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "+ Add a new record" }).click();
  await page.getByRole("dialog").getByRole("searchbox").fill("Thriller Michael Jackson");
  await page.getByRole("dialog").getByRole("button", { name: /Michael Jackson/ }).first().click({ timeout: 30_000 });
  await expect(page.getByRole("dialog").getByText(/It goes in/)).toBeVisible({ timeout: 30_000 });
  await shot("where-does-it-go");
});
