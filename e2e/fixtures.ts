import { test as base, type BrowserContext, type Page } from "@playwright/test";

/** Answers the guided tour offer in advance, so it doesn't cover the screens these tests drive. */
export async function skipTour(target: Page | BrowserContext) {
  await target.addInitScript(() => {
    try {
      localStorage.setItem("ro:tour", "dismissed");
    } catch {
      // nothing to do
    }
  });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await skipTour(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";

/** The record card: a column next to the map on larger screens, a bottom sheet on phones. */
export const recordCard = (page: Page) => page.locator("[data-record-card]");
