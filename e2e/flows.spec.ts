import { expect, test } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { ensureTestUser, openSession, supabaseAs } from "../scripts/lib/clerk-test";

test.describe.configure({ mode: "serial" });

function newAccount(tag: string) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { email: `e2e-${tag}-${id}+clerk_test@example.com`, password: `Shelf-${id}-Vinyl!42` };
}

test("the demo built without an account is saved when the visitor signs up", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once.");
  test.setTimeout(180_000);
  await setupClerkTestingToken({ page });
  await page.goto("/app?start=demo");
  await expect(page.getByRole("region", { name: "Living room" })).toBeVisible({ timeout: 60_000 });

  // Change something locally: unblock a compartment and regenerate.
  await page.getByRole("tab", { name: "Shelves & order" }).click();
  await page.locator("article").first().getByRole("button", { name: /row 2, column 2: blocked/ }).click();
  await page.getByRole("button", { name: "Generate map" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Recompute" }).click();
  await expect(page.getByText(/Map updated/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Living room" }).getByText("Blocked")).toHaveCount(1);

  const account = newAccount("save");
  await page.getByRole("button", { name: "Sign up to save" }).click();
  await page.locator("input[name=emailAddress]").fill(account.email);
  await page.locator("input[name=password]").fill(account.password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByText("Your demo shelf is saved to your account.")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("region", { name: "Living room" }).getByText("Blocked")).toHaveCount(1);
  await expect(page.getByText("This demo lives only in this browser")).toHaveCount(0);
});

test("an import resumes after the tab is closed", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once.");
  test.setTimeout(240_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await setupClerkTestingToken({ page });
  const account = newAccount("resume");
  await page.goto("/");
  await page.getByLabel("Your Discogs username").fill("aorihuelar");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.locator("input[name=emailAddress]").fill(account.email);
  await page.locator("input[name=password]").fill(account.password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText(/of 1,704 records/)).toBeVisible({ timeout: 60_000 });

  // Close the tab mid-import.
  await page.close();
  const again = await context.newPage();
  await setupClerkTestingToken({ page: again });
  await again.goto("/app");
  await expect(again.getByRole("heading", { name: "Build your shelf" })).toBeVisible({ timeout: 180_000 });
  await expect(again.getByText(/1,704 records imported/)).toBeVisible();
  await context.close();
});

test("data older than 6 hours is refreshed with an 'Updating…' notice", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once.");
  test.setTimeout(180_000);
  // The demo-check test user already has the demo imported (scripts/import-check.ts).
  const email = "demo-check+clerk_test@example.com";
  const userId = await ensureTestUser(email);
  const session = await openSession(userId);
  const supabase = supabaseAs(() => session.token());
  const old = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("collections").update({ last_synced_at: old }).eq("user_id", userId);
  expect(error).toBeNull();

  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/app");
  await expect(page.getByText("Updating from Discogs…")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Updating from Discogs…")).toHaveCount(0, { timeout: 120_000 });
  const { data } = await supabase.from("collections").select("last_synced_at").single();
  expect(new Date(data!.last_synced_at as string).getTime()).toBeGreaterThan(Date.now() - 5 * 60 * 1000);
});
