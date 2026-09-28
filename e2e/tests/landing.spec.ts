import { test, expect } from "@playwright/test";

// The landing page is the CV link, so it has to survive the app's service worker. The PWA falls
// every navigation back to the app shell by default, which silently turns /landing into the login
// screen — and only in a real browser, since curl has no service worker to be fooled by.
test("the landing page is not swallowed by the app's service worker", async ({ page }) => {
  // Visit the app first, so the service worker registers and takes control.
  await page.goto("/app");
  await page.evaluate(async () => {
    await navigator.serviceWorker?.ready;
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/^Daily —/);
  await expect(page.getByRole("heading", { name: /fully briefed/i })).toBeVisible();
});

test("the landing page leads into the demo, and the shots all load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /try the demo/i }).first()).toBeVisible();

  // Every image has to actually load; a broken path is invisible against the pale phone mock.
  const images = page.locator("img");
  const count = await images.count();
  expect(count).toBe(6); // one phone shot per section
  for (let i = 0; i < count; i++) {
    await expect
      .poll(() => images.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  }

  // The repo link appears twice — once at the fold, once in the closer — so a visitor who never
  // scrolls still has a route to the code. Both must point somewhere real: a button wired to "#"
  // or "" is the failure worth catching, because it looks alive and goes nowhere.
  const code = page.locator("[data-code-link]");
  await expect(code).toHaveCount(2);
  for (const href of await code.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) {
    expect(href).toMatch(/^https:\/\/github\.com\//);
  }

  // The demo opens in a new tab on purpose: clicking it early must not discard the page, or an
  // impatient visitor loses the only route to the repo along with it.
  const demo = page.getByRole("link", { name: /try the demo/i });
  await expect(demo).toHaveCount(2);
  for (const target of await demo.evaluateAll((els) => els.map((e) => e.getAttribute("target")))) {
    expect(target).toBe("_blank");
  }

  // The finding from user testing was that people did not realise the page continued, so the cue
  // has to be reachable without scrolling first.
  await expect(page.getByRole("link", { name: /see what it does/i })).toBeInViewport();
});
