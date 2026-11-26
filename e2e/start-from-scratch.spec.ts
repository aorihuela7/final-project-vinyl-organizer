import type { Page } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { ZERO_START } from "../src/lib/config";
import { ensureTestUser } from "../scripts/lib/clerk-test";
import { expect, skipTour, test } from "./fixtures";

/** For people without a Discogs collection: public ones to try, and starting from scratch. */
test("focusing the username field lists public collections with their size from Discogs", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const field = page.getByRole("combobox", { name: "Your Discogs username" });
  await field.click();
  const list = page.getByRole("listbox", { name: "No Discogs account? Try a public collection" });
  await expect(list).toBeVisible({ timeout: 30_000 });
  const first = list.getByRole("option").first();
  await expect(first).toHaveText(/^[a-z0-9]+ \(\d[\d,]* records?, .+\)$/, { timeout: 30_000 });
  const username = (await first.locator(".font-semibold").innerText()).trim();
  await first.hover();
  await expect(page.getByRole("link", { name: "Data provided by Discogs" })).toHaveAttribute("href", `https://www.discogs.com/user/${username}/collection`);
  await page.screenshot({ path: `test-results/samples-${test.info().project.name}.png` });
  await first.click();
  await expect(field).toHaveValue(username);
  await expect(list).toHaveCount(0);

  // Typing narrows the list; Escape closes it.
  await field.fill("w");
  await expect(list.getByRole("option")).not.toHaveCount(0);
  for (const option of await list.getByRole("option").all()) await expect(option).toHaveText(/^w/);
  await field.press("Escape");
  await expect(list).toHaveCount(0);
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

  // The same record again: the app says where it already is.
  await a.getByRole("button", { name: "+ Add a new record" }).first().click();
  const again = a.getByRole("dialog");
  await again.getByRole("searchbox").fill("Kind of Blue Miles Davis");
  await again.getByRole("button", { name: /Miles Davis/ }).first().click({ timeout: 30_000 });
  await expect(again.getByText(/You already have this record/)).toBeVisible({ timeout: 30_000 });
  await again.getByRole("button", { name: "Close" }).click();

  // Undo right after adding puts everything back.
  await a.getByRole("button", { name: "+ Add a new record" }).first().click();
  const another = a.getByRole("dialog");
  await another.getByRole("searchbox").fill("Blue Train John Coltrane");
  await another.getByRole("button", { name: /Coltrane/ }).first().click({ timeout: 30_000 });
  await expect(another.getByRole("button", { name: "Add record" })).toBeEnabled({ timeout: 30_000 });
  await another.getByRole("button", { name: "Add record" }).click();
  await expect(a.getByText("2 records, sorted by artist", { exact: false })).toBeVisible({ timeout: 30_000 });
  await a.getByRole("button", { name: "Undo" }).click();
  await expect(a.getByText(/^Undone:/)).toBeVisible({ timeout: 30_000 });
  await expect(a.getByText("1 record, sorted by artist", { exact: false })).toBeVisible();

  // A record added by hand can be removed from its card.
  await a.getByLabel("Search for an artist or a title in your collection").fill("Kind of Blue");
  await a.getByRole("listbox", { name: "Search results" }).getByRole("option").first().click();
  await a.locator("[data-record-card]").getByRole("button", { name: "Remove from my collection" }).click();
  await a.getByRole("button", { name: "Remove it" }).click();
  await expect(a.getByText(/is off your shelf/)).toBeVisible({ timeout: 30_000 });
  await expect(a.getByText("0 records, sorted by artist", { exact: false })).toBeVisible();
  await a.reload();
  await expect(a.getByText("Your shelf is empty.", { exact: false })).toBeVisible({ timeout: 60_000 });

  // Add it back, so the next step has something to replace.
  await a.getByRole("button", { name: "+ Add a new record" }).first().click();
  const back = a.getByRole("dialog");
  await back.getByRole("searchbox").fill("Kind of Blue Miles Davis");
  await back.getByRole("button", { name: /Miles Davis/ }).first().click({ timeout: 30_000 });
  await expect(back.getByRole("button", { name: "Add record" })).toBeEnabled({ timeout: 30_000 });
  await back.getByRole("button", { name: "Add record" }).click();
  await expect(a.getByText("1 record, sorted by artist", { exact: false })).toBeVisible({ timeout: 30_000 });

  // Choosing the demo from the landing page asks before replacing what they built.
  await a.goto("/app?start=demo");
  await expect(a.getByRole("heading", { name: "Replace your collection with the demo collection?" })).toBeVisible({ timeout: 60_000 });
  await expect(a.getByText("Your 1 record and your shelves are replaced")).toBeVisible();
  await a.getByRole("button", { name: "Keep my collection" }).click();
  await expect(a.locator("[data-map]")).toBeVisible();
  await expect(a.getByText("1 record, sorted by artist")).toBeVisible();
  await a.goto("/app?start=demo");
  await a.getByRole("button", { name: "Replace my collection" }).click();
  await expect(a.getByRole("region", { name: "Living room" })).toBeVisible({ timeout: 120_000 });
  await expect(a.getByText("The demo collection replaced your previous one.")).toBeVisible();

  // Person B, on another browser, also starts from scratch: their collection is empty.
  const second = await browser.newContext();
  await skipTour(second);
  const b = await second.newPage();
  await signInAndStartFromScratch(b, "scratch-b");

  await first.close();
  await second.close();
});

test("a full shelf grows from \"Add a new record\", and the record opens again once the map is generated", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(240_000);
  const email = `e2e-grow-${Date.now().toString(36)}+clerk_test@example.com`;
  // A shelf of one compartment for one record, so it fills with two.
  await ensureTestUser(email);
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/app");
  await page.getByRole("button", { name: "Start from scratch" }).click();
  await expect(page.getByRole("heading", { name: "Build your shelf" })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Records per compartment").fill("1");
  await page.getByRole("button", { name: "Generate map" }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Generate" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator("[data-map]")).toBeVisible({ timeout: 60_000 });
  const add = async (q: string, re: RegExp) => {
    await page.getByRole("button", { name: "+ Add a new record" }).first().click();
    const d = page.getByRole("dialog");
    await d.getByRole("searchbox").fill(q);
    await d.getByRole("button", { name: re }).first().click({ timeout: 30_000 });
    return d;
  };
  let d = await add("Kind of Blue Miles Davis", /Miles Davis/);
  await expect(d.getByRole("button", { name: "Add record" })).toBeEnabled({ timeout: 30_000 });
  await d.getByRole("button", { name: "Add record" }).click();
  await expect(page.getByText("1 record, sorted", { exact: false })).toBeVisible({ timeout: 30_000 });
  d = await add("Blue Train John Coltrane", /Coltrane/);
  await expect(d.getByRole("button", { name: "Make the shelf bigger" })).toBeVisible({ timeout: 30_000 });
  await d.getByRole("button", { name: "Make the shelf bigger" }).click();
  await expect(page.getByText(/We made your shelf bigger/)).toBeVisible();
  // One cube of 1 record, 2 records plus 20%: three cubes, and the name follows.
  await expect(page.getByLabel("Name")).toHaveValue("Cube shelf 3×1");
  await page.getByRole("button", { name: "Generate map" }).click();
  const confirm2 = page.getByRole("dialog").getByRole("button", { name: /Generate|Recompute|Update/ });
  if (await confirm2.first().isVisible().catch(() => false)) await confirm2.first().click();
  const reopened = page.getByRole("dialog", { name: "Add a new record" });
  await expect(reopened.getByText("Blue Train").first()).toBeVisible({ timeout: 60_000 });
  await expect(reopened.getByRole("button", { name: "Add record" })).toBeEnabled({ timeout: 30_000 });
  await reopened.getByRole("button", { name: "Add record" }).click();
  await expect(page.getByText("2 records, sorted", { exact: false })).toBeVisible({ timeout: 30_000 });
});
