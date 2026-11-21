import { expect, test } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { ensureTestUser } from "../scripts/lib/clerk-test";
import { recordCard, skipTour } from "./fixtures";

/** v2: the guided tour, the language selector, tracklists, and singles on their own shelf. */
test("the tour is offered on the first demo visit and walks through seven steps", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/app?start=demo");
  const offer = page.getByRole("dialog", { name: "Want a quick tour?" });
  await expect(offer).toBeVisible({ timeout: 60_000 });
  await offer.getByRole("button", { name: "Show me around" }).click();
  for (let i = 1; i <= 7; i++) {
    const step = page.getByRole("dialog").filter({ hasText: `${i} of 7` });
    await expect(step).toBeVisible();
    await expect(step.getByRole("button", { name: i === 7 ? "Done" : "Next" })).toBeFocused();
    await step.getByRole("button", { name: i === 7 ? "Done" : "Next" }).click();
  }
  await page.reload();
  await expect(page.locator("[data-map]")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("dialog", { name: "Want a quick tour?" })).toHaveCount(0);

  // Help in the header shows it again, without an account.
  await page.getByRole("button", { name: /^Help/ }).click();
  await expect(page.getByRole("dialog").filter({ hasText: "1 of 7" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog").filter({ hasText: "1 of 7" })).toHaveCount(0);
});

test("changing the language keeps the open record and translates the app", async ({ page }) => {
  test.setTimeout(120_000);
  await skipTour(page);
  await page.goto("/app?start=demo");
  await expect(page.locator("[data-map]")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Search for an artist or a title in your collection").fill("a");
  await page.getByRole("listbox", { name: "Search results" }).getByRole("option").first().click();
  await expect(recordCard(page)).toBeVisible();
  if (await page.getByRole("dialog").count()) await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();
  await page.getByLabel("Language").selectOption("es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByPlaceholder("Busca un artista o un título en tu colección")).toBeVisible();
  // The Discogs notice stays in English, as the terms require.
  await expect(page.getByText("is not affiliated with, sponsored or endorsed by Discogs")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sabe dónde está cada disco, y dónde va el próximo.");
});

test("picking a record inside a compartment moves the outline and the rail marker to it", async ({ page }) => {
  test.setTimeout(120_000);
  await skipTour(page);
  await page.goto("/app?start=demo");
  await expect(page.locator("[data-map]")).toBeVisible({ timeout: 60_000 });
  const foundSlot = page.locator('[data-map] [data-slot]:has([data-found="true"])');
  const marker = page.locator('[data-map] nav[data-tour="rail"] span[aria-hidden][style*="left"]');

  // First a search: its compartment gets the outline and the marker moves to it.
  await page.getByLabel("Search for an artist or a title in your collection").fill("a");
  await page.getByRole("listbox", { name: "Search results" }).getByRole("option").first().click();
  await expect(foundSlot).toHaveCount(1);
  await expect(marker).toHaveCount(1);
  const slotBefore = await foundSlot.getAttribute("data-slot");
  const markerBefore = await marker.getAttribute("style");
  // On phones the record card is a sheet over the map.
  if (await page.getByRole("dialog").count()) await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();

  // Then open another compartment on the map and pick a record from its list.
  const slots = page.locator("[data-map] [data-slot]");
  const other = (await slots.first().getAttribute("data-slot")) !== slotBefore ? slots.first() : slots.nth(1);
  const otherId = await other.getAttribute("data-slot");
  await other.getByRole("button").first().click();
  const compartment = page.getByRole("dialog");
  await expect(compartment.getByText("Records in this compartment, left to right")).toBeVisible();
  await compartment.locator("ol button").first().click();
  await expect(recordCard(page)).toBeVisible();

  // The map follows the record that's open, not the one found before.
  await expect(foundSlot).toHaveAttribute("data-slot", otherId!);
  await expect(marker).toHaveCount(1);
  await expect(marker).not.toHaveAttribute("style", markerBefore!);
});

test("a record shows its tracklist from Discogs, and singles live on their own shelf", async ({ page, request }) => {
  test.setTimeout(120_000);
  await skipTour(page);
  const demo = (await (await request.get("/api/demo")).json()) as { records: Array<{ title: string; format_group?: string }> };
  const hasSingles = demo.records.some((r) => r.format_group === "single");
  await page.goto("/app?start=demo");
  await expect(page.locator("[data-map]")).toBeVisible({ timeout: 60_000 });
  if (hasSingles) await expect(page.getByRole("region", { name: "Singles box" })).toBeVisible();
  await page.getByLabel("Search for an artist or a title in your collection").fill("e");
  await page.getByRole("listbox", { name: "Search results" }).getByRole("option").first().click();
  const card = recordCard(page);
  await expect(card.getByRole("heading", { name: "Tracklist" })).toBeVisible();
  await expect(card.getByText(/^(A|B|1)1?$/).first().or(card.getByText("Discogs has no tracklist for this release."))).toBeVisible({ timeout: 30_000 });
});

test("a record taken out to a temporary location shows where it is, and goes back to its spot", async ({ page }) => {
  test.setTimeout(120_000);
  await skipTour(page);
  await page.goto("/app?start=demo");
  await expect(page.locator("[data-map]")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Search for an artist or a title in your collection").fill("a");
  await page.getByRole("listbox", { name: "Search results" }).getByRole("option").first().click();
  const card = recordCard(page);
  await card.getByRole("button", { name: "Take it out…" }).click();
  await card.getByRole("button", { name: "Gig bag" }).click();
  await expect(card.getByText("Out of the shelf: in Gig bag.")).toBeVisible();
  // It stays out after a reload, listed by place.
  await page.reload();
  await expect(page.getByText("1 record out of the shelf")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Put it back" }).first().click();
  await expect(page.getByText(/Back on the shelf/)).toBeVisible();
  await expect(page.getByText("1 record out of the shelf")).toHaveCount(0);
});

test("guest mode: a read-only link shows the shelf without an account, until it's turned off", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once.");
  test.setTimeout(240_000);
  await skipTour(page);
  const email = `e2e-guest-${Date.now().toString(36)}+clerk_test@example.com`;
  await ensureTestUser(email);
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/app?start=demo");
  await expect(page.getByRole("region", { name: "Living room" })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Shelves & order" }).click();
  await page.getByRole("button", { name: "Create a link" }).click();
  const url = await page.getByLabel("Guest link").inputValue();
  expect(url).toMatch(/\/s\/[A-Za-z0-9_-]{20,}$/);

  const guestContext = await browser.newContext();
  await skipTour(guestContext);
  const guest = await guestContext.newPage();
  await guest.goto(url);
  await expect(guest.getByRole("heading", { name: "A shared shelf" })).toBeVisible({ timeout: 60_000 });
  await expect(guest.getByRole("region", { name: "Living room" })).toBeVisible();
  await guest.getByLabel("Search for an artist or a title in your collection").fill("a");
  await guest.getByRole("listbox", { name: "Search results" }).getByRole("option").first().click();
  await expect(recordCard(guest)).toBeVisible();
  // Read-only: no taking out, no calibrating, no adding.
  await expect(guest.getByRole("button", { name: "Take it out…" })).toHaveCount(0);
  await expect(guest.getByRole("button", { name: "+ Add a new record" })).toHaveCount(0);

  await page.getByRole("button", { name: "Turn off the link" }).click();
  await expect(page.getByText("The link is off.")).toBeVisible();
  await guest.reload();
  await expect(guest.getByText("This link doesn't work anymore")).toBeVisible({ timeout: 60_000 });
  await guestContext.close();
});
