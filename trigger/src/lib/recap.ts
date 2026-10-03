import { anthropic, MODELS, firstText } from "./anthropic";
import { anthropicUsage, noMeter, type Meter } from "./usage";
import { LANGUAGE_NAME } from "./language";
import type { Language } from "@shared/types";

// "While you were away" — condense the briefs a returning reader missed into a short recap.
// Built from already-generated reports (no new fetch). Mid-tier model (a condensation).
export async function writeRecap(
  missed: { date: string; markdown: string }[],
  meter: Meter = noMeter,
  language: Language = "en",
): Promise<string> {
  const usable = missed.filter((m) => m.markdown && m.markdown.trim());
  if (usable.length === 0) return "";
  const days = usable.length;

  const system =
    `You're writing a short "While you were away" recap for a reader returning to their daily ` +
    `brief after missing ${days} day${days === 1 ? "" : "s"}. Below are the briefs they missed ` +
    `(newest first), with their dates. Condense them into a brief catch-up of what mattered most ` +
    `across that gap — lead with the biggest developments, group by theme rather than replaying it ` +
    `day by day, and note where a story moved over several days. Keep it tight: a short paragraph ` +
    `or two. Write in an analytical tone. Don't cover today's news — that follows right below this recap. ` +
    `Do not begin with a title, heading, or date line — the app already shows a heading; start directly ` +
    `with the recap, in plain prose (no markdown headings or bold).` +
    // The missed briefs may be in another language — a reader who switched since — so the language
    // is stated outright rather than left to follow the input. See lib/language.ts.
    (language === "en" ? "" : ` Write the recap in ${LANGUAGE_NAME[language]}.`);

  const userMessage = usable.map((m) => `Brief — ${m.date}\n\n${m.markdown}`).join("\n\n———\n\n");

  const started = Date.now();
  const message = await anthropic().messages.create({
    model: MODELS.podcastScript, // Sonnet — a condensation/rewrite, not the heavy synthesis
    max_tokens: 1200,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  await meter({
    stage: "recap",
    provider: "anthropic",
    model: MODELS.podcastScript,
    ...anthropicUsage(message),
    durationMs: Date.now() - started,
    extra: { missed_days: days, language },
  });

  // Defensive: drop a leading title/heading line the model may still add (the card has its own).
  return firstText(message.content)
    .trim()
    .replace(/^\s*(#{1,6}\s+[^\n]*|[^\n]*(while you were away|mientras no estabas)[^\n]*)\n+/i, "")
    .trim();
}
