import type { Page } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { ZERO_START } from "../src/lib/config";
import { ensureTestUser } from "../scripts/lib/clerk-test";
import { expect, skipTour, test } from "./fixtures";

/** For people without a Discogs collection: public ones to try, and starting from scratch. */
test("the import field lists public collections with their size from Discogs", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const list = page.getByLabel("No Discogs account? Try a public collection");
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list.locator("option").nth(1)).toHaveText(/^[a-z0-9]+ \(\d[\d,]* records?, .+\)$/);
  await list.selectOption({ index: 1 });
  const username = await list.inputValue();
  await expect(page.getByLabel("Your Discogs username")).toHaveValue(username);
  await expect(page.getByRole("link", { name: "Data provided by Discogs" })).toHaveAttribute("href", `https://www.discogs.com/user/${username}/collection`);
});

async function signInAndStartFromScratch(page: Page, tag: string) {
  const email = `e2e-${tag}-${Date.now().toString(36)}+clerk_test@example.com`;
  await ensureTestUser(email);
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/app");
  await page.getByRole("button", { name: "Start from scratch" }).click();
  await expect(page.getByRole("heading", { name: "Build your shelf" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Your collection is empty for now.", { exact: false })).toBeVisible();
  await expect(page.getByText("Started from scratch: 0 records added by hand.")).toBeVisible();
  // The empty Discogs account behind it never shows.
  await expect(page.locator("body")).not.toContainText(ZERO_START.username);
}

test("start from scratch: an empty collection, and records added by hand stay in their account", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once.");
  test.setTimeout(300_000);

  // Person A starts from scratch, builds a shelf, and adds a record.
  const first = await browser.newContext();
  await skipTour(first);
  const a = await first.newPage();
  await signInAndStartFromScratch(a, "scratch-a");
  await a.getByRole("button", { name: "Generate map" }).click();
  const confirm = a.getByRole("dialog").getByRole("button", { name: "Generate" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(a.getByText("Your shelf is empty.", { exact: false })).toBeVisible({ timeout: 60_000 });
  await a.getByRole("button", { name: "+ Add a new record" }).first().click();
  const add = a.getByRole("dialog");
  await add.getByRole("searchbox").fill("Kind of Blue Miles Davis");
  await add.getByRole("button", { name: /Miles Davis/ }).first().click({ timeout: 30_000 });
  await expect(add.getByText(/It goes in/)).toBeVisible({ timeout: 30_000 });
  await add.getByRole("button", { name: "Add record" }).click();
  await expect(a.getByText(/^Record added/)).toBeVisible({ timeout: 30_000 });
  await a.reload();
  await expect(a.locator("[data-map]")).toBeVisible({ timeout: 60_000 });
  await a.getByLabel("Search for an artist or a title in your collection").fill("Kind of Blue");
  await expect(a.getByRole("listbox", { name: "Search results" }).getByText(/% in from the left/).first()).toBeVisible();
  await expect(a.getByText("Your shelf is empty.", { exact: false })).toHaveCount(0);

  // Person B, on another browser, also starts from scratch: their collection is empty.
  const second = await browser.newContext();
  await skipTour(second);
  const b = await second.newPage();
  await signInAndStartFromScratch(b, "scratch-b");

  await first.close();
  await second.close();
});
