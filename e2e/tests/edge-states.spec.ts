import { test, expect, type Page } from "@playwright/test";

// States a visitor cannot click their way into, because the demo deliberately has briefs and cannot
// generate: a brief stuck mid-write, a podcast that failed, an account with no history at all.
//
// These are produced by STUBBING the database responses rather than writing rows. Writing rows
// would need the service-role key in CI — a key that grants full database access — and would
// disturb the live demo while the tests ran. Stubbing needs no secrets and touches nothing.

const TODAY = new Date().toISOString().slice(0, 10);

const COMPLETE_REPORT = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "demo",
  date: TODAY,
  status: "complete",
  error_message: null,
  created_at: new Date().toISOString(),
  markdown: "## A topic\n\nSome words.",
  content: {
    recap: null,
    sections: [
      {
        topic: "A seeded topic",
        category: "Technology",
        summary: "A short summary used only to give the screen something to render.",
        sources: [{ title: "Example", url: "https://example.com", date: TODAY }],
        level: 2,
        timeframe: "day",
        isPrimer: false,
      },
    ],
  },
};

// Returns whatever the app asks for from a given table.
async function stubTable(page: Page, table: string, body: unknown): Promise<void> {
  await page.route(`**/rest/v1/${table}*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    }),
  );
}

async function enterDemo(page: Page): Promise<void> {
  await page.goto("/app");
  await page.getByRole("button", { name: /view the demo/i }).click();
}

// Every test here intercepts requests. One still in flight when its test ends would otherwise throw
// "route.fetch: Test ended" into whichever test runs next in that worker — a failure blamed on an
// unrelated test, which then knocks out the one after it too.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test.describe("states that cannot be reached by clicking", () => {
  test("a brief still being written shows the compiling screen", async ({ page }) => {
    await stubTable(page, "reports", [{ ...COMPLETE_REPORT, status: "generating", content: null, markdown: null }]);
    await stubTable(page, "podcast_episodes", []);
    await enterDemo(page);

    await expect(page.getByText(/compiling your brief/i)).toBeVisible();
    // The wait is honest about how long it takes rather than leaving someone guessing.
    await expect(page.getByText(/minutes/i)).toBeVisible();
  });

  test("a failed podcast offers another go rather than spinning", async ({ page }) => {
    await stubTable(page, "reports", [COMPLETE_REPORT]);
    await stubTable(page, "podcast_episodes", [
      {
        id: "22222222-2222-2222-2222-222222222222",
        report_id: COMPLETE_REPORT.id,
        user_id: "demo",
        script: null,
        audio_url: null,
        duration_seconds: null,
        chapters: [],
        status: "failed",
        created_at: new Date().toISOString(),
      },
    ]);
    await enterDemo(page);

    // The important part: it must NOT sit on "preparing your podcast" forever.
    await expect(page.getByText(/try the podcast again/i)).toBeVisible();
    await expect(page.getByText(/preparing your podcast/i)).toBeHidden();
  });

  test("an account with no briefs yet explains itself", async ({ page }) => {
    await stubTable(page, "reports", []);
    await stubTable(page, "podcast_episodes", []);
    await enterDemo(page);

    await page.getByRole("link", { name: "History" }).click();
    await expect(page.getByText(/past reports will appear here/i)).toBeVisible();
  });
});

test.describe("awkward content", () => {
  test("a very long custom interest does not break the layout", async ({ page }) => {
    const monster = "what a specific person is doing about ".repeat(12) + "semiconductors";

    await page.route("**/rest/v1/preferences*", async (route) => {
      const res = await route.fetch();
      const rows = (await res.json()) as Record<string, unknown>[];
      // Keep the real row — notably is_demo — and only swap the topics, so the rest of the app
      // behaves exactly as it does for a visitor.
      const patched = rows.map((r) => ({ ...r, custom_interests: [monster], subtopics: {} }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(patched) });
    });
    await enterDemo(page);

    await page.getByRole("link", { name: "Prefs" }).click();
    await expect(page.locator('[data-tour="prefs-topics"]')).toBeVisible();

    // Nothing should be able to push the page sideways on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "a long topic pushed the page sideways").toBeLessThanOrEqual(1);
  });
});
