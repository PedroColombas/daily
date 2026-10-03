import type { VercelRequest, VercelResponse } from "@vercel/node";
import { suggestSubtopics } from "./_lib/suggest.js";
import { authorisePaidRequest } from "./_lib/paid-request.js";

// POST /api/suggest-subtopics  { genre: string, language?: "en" | "es" }
//   ->  { subtopics: string[], labels?: Record<string, string> }
// `subtopics` are always English: they are the topics' internal names, which the pipeline searches
// with and shares a cache on. For a Spanish reader, `labels` maps each to what they are shown.
// Runs server-side so ANTHROPIC_API_KEY never reaches the client.
//
// This SPENDS MONEY (Anthropic + Perplexity) and used to be open to the internet - anyone who found
// the URL could drain both accounts in a loop. It now requires a session and refuses the demo
// account. A refusal costs the caller nothing: the client falls back to the built-in subtopic list,
// so the chips still appear and nothing looks broken.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
  }

  const genre = typeof req.body?.genre === "string" ? req.body.genre : "";
  if (!genre.trim()) {
    return res.status(400).json({ error: "Missing genre" });
  }

  const language = req.body?.language === "es" ? "es" : "en";

  const auth = await authorisePaidRequest(req.headers.authorization);
  if (!auth.userId) return res.status(auth.status ?? 401).json({ error: auth.error });

  try {
    const result = await suggestSubtopics(genre, apiKey, process.env.PERPLEXITY_API_KEY, language);
    return res.status(200).json(result);
  } catch (err) {
    console.error("suggest-subtopics failed:", err);
    return res.status(502).json({ error: "Suggestion failed" });
  }
}
