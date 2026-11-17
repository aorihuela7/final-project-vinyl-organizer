import { clerkSetup } from "@clerk/testing/playwright";

/** Gets a Clerk testing token so sign-up in tests isn't stopped by bot protection (development instances only). */
export default async function globalSetup() {
  await clerkSetup();
}
