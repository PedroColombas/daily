import type { Language } from "@shared/types";
import { SUBTOPIC_FALLBACK } from "./preferences-options";
import { supabase } from "./supabase";

// Suggestions: internal names (always English — see i18n/topics.ts), plus their labels in the
// reader's language when that isn't English.
export interface SubtopicSuggestions {
  subtopics: string[];
  labels: Record<string, string>;
}

// English keeps the key it always had, so existing caches stay valid.
const cachePrefix = (lang: Language) => (lang === "en" ? "subtopics:" : `subtopics:${lang}:`);

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function readCache(genre: string, lang: Language): SubtopicSuggestions | null {
  try {
    const raw = localStorage.getItem(cachePrefix(lang) + genre);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { date: string; subtopics: string[]; labels?: Record<string, string> };
    if (cached.date === today() && Array.isArray(cached.subtopics) && cached.subtopics.length > 0) {
      return { subtopics: cached.subtopics, labels: cached.labels ?? {} };
    }
  } catch {
    /* ignore malformed cache */
  }
  return null;
}

function writeCache(genre: string, lang: Language, result: SubtopicSuggestions): void {
  try {
    localStorage.setItem(cachePrefix(lang) + genre, JSON.stringify({ date: today(), ...result }));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/**
 * Fetch subtopic suggestions for a genre from the server-side endpoint, cached
 * per genre and language for the day (the suggestions are trend-grounded, so once a day is plenty).
 * Falls back to the static map on any failure so the UI always has chips to show — the static
 * chips are translated in the app, so they need no labels from here.
 */
export async function fetchSubtopicSuggestions(
  genre: string,
  lang: Language = "en",
): Promise<SubtopicSuggestions> {
  const cached = readCache(genre, lang);
  if (cached) return cached;

  try {
    // The endpoint spends money, so it now requires a session and refuses the demo account. A
    // refusal is harmless here — the catch below serves the built-in list instead.
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch("/api/suggest-subtopics", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ genre, language: lang }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as { subtopics?: string[]; labels?: Record<string, string> };
    if (Array.isArray(data.subtopics) && data.subtopics.length > 0) {
      const result = { subtopics: data.subtopics, labels: data.labels ?? {} };
      writeCache(genre, lang, result);
      return result;
    }
    throw new Error("empty suggestions");
  } catch {
    return { subtopics: SUBTOPIC_FALLBACK[genre] ?? [], labels: {} };
  }
}

// Pull the server's own explanation out of a failed response. Without this the UI only ever saw a
// status code, so a precise message ("this is a read-only demo") arrived as "generate failed: 403".
async function serverError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    /* no JSON body */
  }
  return fallback;
}

/**
 * Ask the backend to generate today's brief on demand for the signed-in user. Used for the
 * first-run "Generate now" (force = false: fills an empty day) and for "Regenerate today" after
 * a topic change (force = true: rebuilds over an already-complete brief). The server verifies the
 * session and triggers the pipeline; the caller then polls for the report to appear.
 */
export async function requestTodayBrief(force = false): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ force }),
  });
  if (!res.ok) throw new Error(await serverError(res, "Couldn't start generation."));
}

/**
 * Ask the backend to generate the podcast for ONE report. Podcast generation is an explicit user
 * action (never automatic) so audio — the priciest step — is only ever produced on request. The
 * server verifies the session AND that the report belongs to the caller before triggering.
 */
export async function requestPodcast(reportId: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch("/api/podcast", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ reportId }),
  });
  if (!res.ok) throw new Error(await serverError(res, "Couldn't start the podcast."));
}
