import type { Page } from "@playwright/test";
import { expect, recordCard, test } from "./fixtures";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * The v1 core task as a brand-new person, on the local dev server.
 * Sign-up uses Clerk's documented testing approach for development instances:
 * a testing token (bot protection) and a `+clerk_test` email (no real inbox).
 */

function newAccount(tag: string) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { email: `e2e-${tag}-${id}+clerk_test@example.com`, password: `Shelf-${id}-Vinyl!42` };
}

async function fillSignUp(page: Page, email: string, password: string) {
  await page.locator("input[name=emailAddress]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

test("signs up, imports a Discogs collection by username, builds a shelf, and finds a record", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The full import runs once; the mobile run covers the demo path.");
  test.setTimeout(240_000);
  await setupClerkTestingToken({ page });
  const account = newAccount("import");

  // 1. Type the Discogs username on the landing page, without an account.
  await page.goto("/");
  await page.getByLabel("Your Discogs username").fill("aorihuelar");
  await page.getByRole("button", { name: "Import", exact: true }).click();

  // 2. Sign up right before the import (Clerk modal).
  await fillSignUp(page, account.email, account.password);
  await page.waitForURL("**/app", { timeout: 60_000 });

  // 3. The import runs in steps with progress, then asks to build the shelf.
  await expect(page.getByRole("heading", { name: "Build your shelf" })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/[\d,]+ records imported/)).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/setup-${testInfo.project.name}.png`, fullPage: true });

  // Build it from a template: the suggestion has cube shelves; block a compartment and switch one shelf to columns.
  const firstShelf = page.locator("article").first();
  await firstShelf.getByRole("button", { name: /row 1, column 1: available/ }).click();
  await expect(firstShelf.getByRole("button", { name: /row 1, column 1: blocked/ })).toBeVisible();
  await firstShelf.getByLabel("By columns (top to bottom)").check();

  // Sort order: genre → artist.
  await page.getByLabel("First by").selectOption("genre");
  await page.getByLabel("Then by").first().selectOption("artist");

  // 4. Generate the map.
  await page.getByRole("button", { name: "Generate map" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText(/Map generated/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: /^Cube shelf \d+×\d+/ })).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/map-${testInfo.project.name}.png`, fullPage: true });

  // 5. Search a record and see shelf, row, column, how far in, and its neighbors.
  await page.getByLabel("Search for an artist or a title in your collection").fill("Faith George Michael");
  await page.getByRole("listbox", { name: "Search results" }).getByRole("option").first().click();
  const card = recordCard(page);
  await expect(card.getByText(/Cube shelf \d+×\d+( \(\d\))?, row \d+, column \d+/).first()).toBeVisible();
  await expect(card.getByText(/\d+% in from the left/)).toBeVisible();
  await expect(card.getByText(/Just to the left|Just to the right/).first()).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/record-${testInfo.project.name}.png` });

  // Reload: the map is persisted, not recomputed.
  await page.reload();
  await expect(page.getByRole("region", { name: /^Cube shelf \d+×\d+/ })).toBeVisible({ timeout: 60_000 });
});

test("signs up, loads the demo into the account, and adds a new purchase", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await setupClerkTestingToken({ page });
  const account = newAccount(`demo-${testInfo.project.name}`);

  await page.goto("/sign-up");
  await fillSignUp(page, account.email, account.password);
  await page.waitForURL("**/app", { timeout: 60_000 });

  await page.getByRole("button", { name: "Load the demo" }).click();
  await expect(page.getByRole("region", { name: "Living room" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("region", { name: "Studio" })).toBeVisible();
  await expect(page.getByText("This demo lives only in this browser")).toHaveCount(0);

  // "Add a new record" with Discogs search, then Add record.
  await page.getByRole("button", { name: "+ Add a new record" }).click();
  const add = page.getByRole("dialog");
  await add.getByRole("searchbox").fill("Kind of Blue Miles Davis");
  await add.getByRole("button", { name: /Miles Davis/ }).first().click({ timeout: 30_000 });
  await expect(add.getByText(/It goes in/)).toBeVisible({ timeout: 30_000 });
  await expect(add.getByText(/It fits|moves\./)).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/add-${testInfo.project.name}.png` });
  await add.getByRole("button", { name: "Add record" }).click();
  await expect(page.getByText(/^Record added/)).toBeVisible({ timeout: 30_000 });

  // It's saved: after a reload, search finds it on the shelf.
  await page.reload();
  await expect(page.getByRole("region", { name: "Living room" })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Search for an artist or a title in your collection").fill("Kind of Blue");
  await expect(page.getByRole("listbox", { name: "Search results" }).getByText(/% in from the left/).first()).toBeVisible();
});
