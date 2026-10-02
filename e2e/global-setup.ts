import { request, type FullConfig } from "@playwright/test";

// Vercel locks preview deployments behind a Vercel login. Given the project's "Protection Bypass for
// Automation" secret, swap it ONCE for Vercel's bypass cookie and hand that cookie to every test,
// browser and API alike (Playwright applies storageState to both).
//
// A cookie rather than sending the secret as a header on every request, deliberately: a header set
// in `use` goes out on every request the page makes, including to Supabase and Google Fonts — that
// would hand the secret to third parties. The cookie is scoped to the preview's own domain.
export default async function globalSetup(config: FullConfig) {
  const { baseURL, storageState } = config.projects[0].use;
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret || typeof storageState !== "string") return;

  const ctx = await request.newContext({ baseURL });
  const res = await ctx.get("/", {
    headers: { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" },
  });
  // A wrong secret is NOT an error status: Vercel redirects to its own login page, which answers
  // 200. So check where the request ended up, not just that it succeeded.
  const landedOnPreview = new URL(res.url()).host === new URL(String(baseURL)).host;
  if (!res.ok() || !landedOnPreview) {
    throw new Error(
      `Vercel refused the bypass (ended at ${new URL(res.url()).host}) — check VERCEL_AUTOMATION_BYPASS_SECRET`,
    );
  }
  await ctx.storageState({ path: storageState });
  await ctx.dispose();
}
