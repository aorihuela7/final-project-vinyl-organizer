import { expect, test } from "@playwright/test";

/** The demo works without an account: map, compartment view, record card, and search. */
test("a visitor tries the demo without signing up and finds a record", async ({ page, request }, testInfo) => {
  // Pick a real vinyl record from the demo collection to search for.
  const demo = (await (await request.get("/api/demo")).json()) as { records: Array<{ title: string; artist: string; media: string }> };
  const target = demo.records.find((r) => r.media === "vinyl" && r.title.length > 6 && /^[\w ]+$/.test(r.title))!;
  await page.goto("/");
  await page.getByRole("link", { name: "Try the demo collection" }).click();
  await expect(page.getByText("This demo lives only in this browser")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: "Living room" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Studio" })).toBeVisible();
  // Two blocked compartments (the turntable).
  await expect(page.getByRole("region", { name: "Living room" }).getByText("Blocked")).toHaveCount(2);
  await page.screenshot({ path: `docs/screenshots/demo-map-${testInfo.project.name}.png`, fullPage: true });

  // Search a record and see where it is and its neighbors.
  await page.getByLabel("Search for an artist or a title in your collection").fill(target.title);
  const result = page.getByRole("listbox", { name: "Search results" }).getByRole("option").first();
  await expect(result).toBeVisible();
  await result.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/% from the left/)).toBeVisible();
  await expect(dialog.getByText(/Just to the left|Just to the right/).first()).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Data provided by Discogs" })).toHaveAttribute("href", /discogs\.com\/release\//);
  // Covers load straight from Discogs' image host.
  const cover = dialog.locator("img").first();
  await expect(cover).toHaveAttribute("src", /^https:\/\/i\.discogs\.com\//);
  await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path: `docs/screenshots/demo-search-${testInfo.project.name}.png` });

  // The compartment is highlighted on the map.
  await dialog.getByRole("button", { name: "Show on the map" }).click();
  await expect(page.locator("button.ring-accent")).toHaveCount(1);

  // Open a compartment: spines in order.
  await page.locator("button.ring-accent").click();
  await expect(page.getByRole("dialog").getByText("Left → right")).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/demo-compartment-${testInfo.project.name}.png` });
});
