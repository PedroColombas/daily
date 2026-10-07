import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authorisePaidRequest, fetchOwnEpisode, fetchOwnReport } from "./_lib/paid-request.js";

// An episode still marked as being made after this long is treated as stuck (the task's own limit is
// ten minutes), so asking again is allowed rather than locked out for good. Measured from when the
// episode row was first created, so a retry of an old failed episode is not covered by this check;
// the idempotency key below still merges repeats within the same minute.
const STUCK_AFTER_MS = 20 * 60 * 1000;

// POST /api/podcast   (header: Authorization: Bearer <supabase access token>, body: { reportId })
// Generates the podcast for ONE report, on explicit user request. Audio is the most expensive step
// in the pipeline, so it is never produced automatically - the user has to ask for it.
//
// The shared guard verifies the session and refuses the demo account; the report is then looked up
// THROUGH that session, so RLS proves ownership: you can only ever make a podcast for your own
// report, whatever id you post.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const triggerKey = process.env.TRIGGER_SECRET_KEY;
  if (!triggerKey) return res.status(500).json({ error: "Server is missing required env vars" });

  const reportId = (req.body as { reportId?: string } | undefined)?.reportId;
  if (!reportId) return res.status(400).json({ error: "Missing reportId" });

  const auth = await authorisePaidRequest(req.headers.authorization);
  if (!auth.userId) return res.status(auth.status ?? 401).json({ error: auth.error });

  const report = await fetchOwnReport(auth, reportId);
  if (report === "error") return res.status(502).json({ error: "Could not start the podcast" });
  if (!report) return res.status(404).json({ error: "Report not found" });
  if (report.status !== "complete") {
    return res.status(409).json({ error: "That brief is not ready yet" });
  }

  // One episode per brief, made once. Each run pays for a script and every minute of speech, so a
  // second request — a double tap, or the app open in two places — must not start a second run.
  // Measured 2026-10-05: one podcast was made twice, ~$0.18 thrown away.
  const episode = await fetchOwnEpisode(auth, reportId);
  if (episode === "error") return res.status(502).json({ error: "Could not start the podcast" });
  if (episode?.status === "complete") {
    return res.status(409).json({ error: "That podcast has already been made" });
  }
  const inProgress =
    (episode?.status === "pending" || episode?.status === "generating") &&
    Date.now() - Date.parse(episode.created_at) < STUCK_AFTER_MS;
  if (inProgress) {
    // Not an error: what they asked for is already on its way, and the app is already waiting for it.
    return res.status(200).json({ ok: true, alreadyRunning: true });
  }

  // The check above can't see a run started a moment ago, before it has written its episode row —
  // two taps a second apart both pass it. Trigger hands back the existing run for a repeated key
  // instead of starting another, so the key covers exactly that window: the same brief, in the same
  // state, in the same minute. It includes the state so that retrying after a failure is a new key
  // rather than the failed run handed back.
  const minute = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `podcast-${reportId}-${episode?.status ?? "none"}-${minute}`;

  try {
    const resp = await fetch("https://api.trigger.dev/api/v1/tasks/generate-podcast/trigger", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${triggerKey}`,
        "Content-Type": "application/json",
      },
      // force: the user asked deliberately (e.g. retrying a failed episode), so rebuild rather
      // than keep a stale row. The button is only offered when there is no complete episode.
      body: JSON.stringify({
        payload: { reportId, force: true },
        options: { ttl: "15m", idempotencyKey },
      }),
    });

    if (!resp.ok) {
      console.error("trigger failed:", resp.status, await resp.text());
      return res.status(502).json({ error: "Could not start the podcast" });
    }
    const data = (await resp.json()) as { id?: string };
    return res.status(200).json({ ok: true, runId: data.id ?? null });
  } catch (err) {
    console.error("podcast request failed:", err);
    return res.status(502).json({ error: "Could not start the podcast" });
  }
}
