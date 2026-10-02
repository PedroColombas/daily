import { defineConfig, devices } from "@playwright/test";

// The suite runs against a DEPLOYED url rather than a local dev server. That is the thing a visitor
// actually opens, and it means CI needs no database, no local environment and no secrets beyond the
// public address — the demo signs itself in with credentials the app already ships.
const baseURL = process.env.DEMO_BASE_URL;
if (!baseURL) {
  throw new Error(
    "Set DEMO_BASE_URL to the deployed app, e.g. DEMO_BASE_URL=https://your-app.vercel.app npm test",
  );
}

// Preview deployments sit behind a Vercel login. With the bypass secret set, global-setup.ts trades
// it for a cookie the tests carry; without it (e.g. against the public production domain) nothing
// changes.
const bypass = !!process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./tests",
  globalSetup: bypass ? "./global-setup.ts" : undefined,
  // Assertions here are deliberately coarse — does it render, does it navigate, does the player
  // dock. A red badge on a public repo is worse than no badge, so nothing depends on timing or
  // pixels, and nothing outside the demo path is covered.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    // The app is mobile-first, so it is tested at phone size rather than on a desktop viewport.
    ...devices["Pixel 7"],
    baseURL,
    ...(bypass ? { storageState: ".auth/vercel-bypass.json" } : {}),
    trace: "on-first-retry",
  },
});
