import { defineConfig, devices } from "@playwright/test";

// Clerk's testing helpers read CLERK_SECRET_KEY and the publishable key from the environment.
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides the variables directly.
}

/**
 * End-to-end tests against the local dev server (`npm run dev`).
 * Start the server first, or let Playwright start it.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global.setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
