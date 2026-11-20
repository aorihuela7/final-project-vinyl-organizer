import { expect, test } from "@playwright/test";
import { recordCard, skipTour } from "./fixtures";

/** v2: the guided tour, the language selector, tracklists, and singles on their own shelf. */
test("the tour is offered on the first demo visit and walks through eight steps", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/app?start=demo");
  const offer = page.getByRole("dialog", { name: "Want a quick tour?" });
  await expect(offer).toBeVisible({ timeout: 60_000 });
  await offer.getByRole("button", { name: "Show me around" }).click();
  for (let i = 1; i <= 8; i++) {
    const step = page.getByRole("dialog").filter({ hasText: `${i} of 8` });
    await expect(step).toBeVisible();
    await expect(step.getByRole("button", { name: i === 8 ? "Done" : "Next" })).toBeFocused();
    await step.getByRole("button", { name: i === 8 ? "Done" : "Next" }).click();
  }
  await page.reload();
  await expect(page.locator("[data-map]")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("dialog", { name: "Want a quick tour?" })).toHaveCount(0);
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
