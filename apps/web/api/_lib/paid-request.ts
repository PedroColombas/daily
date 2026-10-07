// Shared guard for EVERY endpoint that spends money on a paid API (Anthropic, Perplexity, OpenAI).
//
// The public demo account's credentials ship in the browser bundle deliberately, so anyone can sign
// in as it and call these endpoints directly. Protection therefore has to live here, on the server
// - hiding a button in the UI stops nobody. This verifies the caller's session and then refuses if
// the account is flagged as the demo.
//
// Deliberately uses plain fetch rather than @supabase/supabase-js: two REST calls do the whole job,
// and pulling the SDK into every serverless function only makes them bigger and slower to start.

export interface PaidRequestAuth {
  userId?: string;
  // Passed back so a caller can make further queries AS THE USER, with their RLS applying.
  token?: string;
  supabaseUrl?: string;
  anonKey?: string;
  status?: number;
  error?: string;
}

function authHeaders(anonKey: string, token: string): Record<string, string> {
  return { apikey: anonKey, Authorization: `Bearer ${token}` };
}

export async function authorisePaidRequest(
  authHeader: string | undefined,
): Promise<PaidRequestAuth> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return { status: 500, error: "Server is missing required env vars" };
  }

  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, error: "Missing auth token" };

  // Who is calling? The token is verified by Supabase, never trusted from the request body.
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: authHeaders(anonKey, token),
  });
  if (!userRes.ok) return { status: 401, error: "Invalid session" };
  const user = (await userRes.json()) as { id?: string };
  if (!user?.id) return { status: 401, error: "Invalid session" };

  // Is it the demo? Sent with the caller's own token, so RLS scopes it to their row.
  const prefsRes = await fetch(
    `${supabaseUrl}/rest/v1/preferences?user_id=eq.${encodeURIComponent(user.id)}&select=is_demo`,
    { headers: authHeaders(anonKey, token) },
  );

  // Fails CLOSED on purpose: if we cannot establish whether this is the demo, refuse rather than
  // risk spending. The likeliest cause is migration 0014 not being applied, which this log names.
  if (!prefsRes.ok) {
    console.error(
      "could not read is_demo (is migration 0014 applied?):",
      prefsRes.status,
      await prefsRes.text(),
    );
    return { status: 503, error: "Could not verify the account. Please try again." };
  }
  const rows = (await prefsRes.json()) as { is_demo?: boolean }[];
  if (rows?.[0]?.is_demo) {
    return { status: 403, error: "This is a read-only demo - generating new briefs is disabled." };
  }

  return { userId: user.id, token, supabaseUrl, anonKey };
}

// The report's podcast episode, if one exists, looked up AS THE CALLER (RLS: their own only).
export async function fetchOwnEpisode(
  auth: PaidRequestAuth,
  reportId: string,
): Promise<{ status: string; created_at: string } | null | "error"> {
  const res = await fetch(
    `${auth.supabaseUrl}/rest/v1/podcast_episodes?report_id=eq.${encodeURIComponent(reportId)}&select=status,created_at`,
    { headers: authHeaders(auth.anonKey as string, auth.token as string) },
  );
  if (!res.ok) {
    console.error("episode lookup failed:", res.status, await res.text());
    return "error";
  }
  const rows = (await res.json()) as { status: string; created_at: string }[];
  return rows?.[0] ?? null;
}

// Look a report up AS THE CALLER, so RLS proves ownership: someone else's id simply returns
// nothing, whatever id was posted.
export async function fetchOwnReport(
  auth: PaidRequestAuth,
  reportId: string,
): Promise<{ id: string; status: string } | null | "error"> {
  const res = await fetch(
    `${auth.supabaseUrl}/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}&select=id,status`,
    { headers: authHeaders(auth.anonKey as string, auth.token as string) },
  );
  if (!res.ok) {
    console.error("report lookup failed:", res.status, await res.text());
    return "error";
  }
  const rows = (await res.json()) as { id: string; status: string }[];
  return rows?.[0] ?? null;
}
