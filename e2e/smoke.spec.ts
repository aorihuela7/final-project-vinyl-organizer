import { expect, test } from "./fixtures";

test("home page shows the pitch, the demo entry, and the Discogs notice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try the demo collection" })).toBeVisible();
  await expect(page.getByText("is not affiliated with, sponsored or endorsed by Discogs")).toBeVisible();
});

test("sign-up page renders the Clerk form", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.locator("input[name=emailAddress]")).toBeVisible();
  await expect(page.locator("input[name=password]")).toBeVisible();
});
