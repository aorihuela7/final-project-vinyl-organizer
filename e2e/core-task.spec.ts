import { expect, test, type Page } from "@playwright/test";
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

  // Build it from a template: the suggestion has Kallax shelves; block a compartment and switch one shelf to columns.
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
  await expect(page.getByRole("region", { name: "Kallax 1" })).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/map-${testInfo.project.name}.png`, fullPage: true });

  // 5. Search a record and see shelf, row, column, how far in, and its neighbors.
  await page.getByLabel("Search your records").fill("Faith George Michael");
  await page.getByRole("list", { name: "Search results" }).getByRole("button").first().click();
  const card = page.getByRole("dialog");
  await expect(card.getByText(/Kallax \d · row \d, column \d/)).toBeVisible();
  await expect(card.getByText(/\d+% from the left/)).toBeVisible();
  await expect(card.getByText(/^Between /)).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/record-${testInfo.project.name}.png` });

  // Reload: the map is persisted, not recomputed.
  await page.reload();
  await expect(page.getByRole("region", { name: "Kallax 1" })).toBeVisible({ timeout: 60_000 });
});

test("signs up, loads the demo into the account, calibrates, and adds a new purchase", async ({ page }, testInfo) => {
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

  // Calibration: open the second compartment and say its first record is the last one of the first compartment.
  const living = page.getByRole("region", { name: "Living room" });
  await living.getByRole("button").first().click();
  const firstSheet = page.getByRole("dialog");
  const lastOfFirst = (await firstSheet.locator("ol li").last().innerText()).split("\n").find((l) => l.includes("·")) ?? "";
  const lastArtist = lastOfFirst.split(" · ")[0]!.replace(/^\d+\s*/, "").trim();
  const lastTitle = lastOfFirst.split(" · ").slice(1).join(" · ").trim();
  await firstSheet.getByRole("button", { name: "Close" }).click();
  await living.getByRole("button").nth(1).click();
  const sheet = page.getByRole("dialog");
  const before = Number((await sheet.getByText(/of \d+ records/).innerText()).split(" ")[0]);
  await sheet.getByRole("button", { name: "The first record here is different…" }).click();
  await sheet.getByLabel("Which record is really the first one in this compartment?").fill(`${lastArtist} ${lastTitle}`.slice(0, 40));
  await sheet.getByRole("list").first().getByRole("button").first().click();
  await expect(sheet.getByText(new RegExp(`^${before + 1} of \\d+ records`))).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole("button", { name: "Close" }).click();

  // "Where does this record go?" with Discogs search, then Add.
  await page.getByRole("button", { name: "Where does this record go?" }).click();
  const add = page.getByRole("dialog");
  await add.getByRole("searchbox").fill("Kind of Blue Miles Davis");
  await add.getByRole("button", { name: /Miles Davis/ }).first().click({ timeout: 30_000 });
  await expect(add.getByText(/from the left/)).toBeVisible({ timeout: 30_000 });
  await expect(add.getByText(/It fits|moves\./)).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/add-${testInfo.project.name}.png` });
  await add.getByRole("button", { name: "Add to my shelf" }).click();
  await expect(page.getByText(/^Added\./)).toBeVisible({ timeout: 30_000 });

  // It's saved: after a reload, search finds it on the shelf.
  await page.reload();
  await expect(page.getByRole("region", { name: "Living room" })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Search your records").fill("Kind of Blue");
  await expect(page.getByRole("list", { name: "Search results" }).getByText(/% from the left/).first()).toBeVisible();
});
