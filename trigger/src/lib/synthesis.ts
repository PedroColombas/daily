import { anthropic, MODELS, firstText } from "./anthropic";
import { anthropicUsage, noMeter, type Meter } from "./usage";
import type { Preferences, ReportContent, ReportSection } from "@shared/types";
import type { FetchedTopic } from "../jobs/fetch-news";

// ─────────────────────────────────────────────────────────────────────────────
// Report synthesis — DESIGNED WITH THE OWNER. Pure LLM logic (no Trigger/DB deps) so it
// can be previewed in isolation (scripts/preview-synthesis.ts); generate-report wraps it.
//   • Structured outputs (output_config.format): the model returns ONLY the sections; the report
//     markdown is rendered in code from them — halving output vs having the model emit it twice
//     (which overloaded heavy all-primer first briefs into stubbing sections).
//   • Length and tone are FIXED (standard length, analytical tone). They used to be user
//     preferences; removed because they earned nothing. Exclusions remain a hard filter.
//   • Claude tags each section with the index of the fetched topic it's based on; we
//     re-attach the real sources/level/timeframe in code, so URLs are never invented.
//   • Model: Opus (MODELS.synthesis). A guard rejects a degraded (stubbed/short-changed) response.
// ─────────────────────────────────────────────────────────────────────────────

// Static — identical for every user + run. Deliberately NOT marked for prompt caching: measured
// 2026-10-03, the cache was written on every brief and read on none (one synthesis per reader per
// day never lands inside the five-minute window), and this prompt is ~5% of what synthesis reads,
// so even a perfect hit rate would save almost nothing.
// (Opus only caches a prefix once it's >=4096 tokens; below that this silently no-ops.)
const SYNTHESIS_SYSTEM = `You are the synthesis engine for a personalised daily news briefing. You receive pre-fetched, per-topic research and turn it into a single report.

STRUCTURE: For each topic, write a short heading then 2-3 tight paragraphs covering what happened, the key facts, and why it matters.

TONE: Explanatory and analytical. Connect cause and effect, add context and implications. Measured, expert tone.

RULES:
- Ground every claim in the provided research. Do not invent facts, events, numbers, or quotes.
- Attribute claims in the prose to their source by name, and on the source's first mention add a brief, neutral note on what the outlet is and how reliable it is - e.g. "According to Nature, a peer-reviewed scientific journal, researchers...", or "Reuters, an international news agency, reports...". Add this note ONLY for outlets you genuinely recognise; if you do not recognise a source, say so honestly rather than implying authority (e.g. "according to [name], a personal blog whose claims aren't independently verified, ..."). Never overstate reliability. Draw the outlet name from the source's title or URL.
- Keep one section per topic. Never merge two topics into one section.
- State each topic's time window in the prose using its recency value (day = the last 24 hours, week = the last 7 days, month = the last 30 days).
- If a topic's research is thin or empty, say so in one sentence rather than padding.
- Apply exclusions as a hard filter: omit anything matching, even if present in the research.

CATCH-UP PRIMERS: Topics marked "primer": true are ones the reader is following for the FIRST time. For those sections, orient a newcomer - set up the current state of the field and why it matters, give the essential background, then the key recent developments, rather than just today's headline. A primer section may run a little longer than a normal one. Use the given catch-up depth: "quick" = the essentials in a tight paragraph or two; "full" = a thorough but readable get-up-to-speed briefing. Sections not marked primer stay focused on the latest developments.

OUTPUT: Return JSON matching the schema - a "sections" array, one entry per topic you include, each with "topic_index" (the index of the topic in the input array it is based on), a "heading", and a "summary". Do NOT emit a full markdown document or source lists - the report layout and citations are assembled in code.`;

const SYNTHESIS_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic_index: {
            type: "integer",
            description: "Index of the input topic this section is based on",
          },
          heading: { type: "string", description: "Display heading for the section" },
          summary: {
            type: "string",
            description: "The write-up for this topic, in the selected mode and voice",
          },
        },
        required: ["topic_index", "heading", "summary"],
        additionalProperties: false,
      },
    },
  },
  required: ["sections"],
  additionalProperties: false,
};

interface SynthesisOutput {
  sections: { topic_index: number; heading: string; summary: string }[];
}

export async function synthesize(
  prefs: Preferences,
  topics: FetchedTopic[],
  meter: Meter = noMeter,
): Promise<{ content: ReportContent; markdown: string }> {
  // Per-user, volatile content goes in the user turn — after the cached system prefix.
  const topicsForModel = topics.map((t, index) => ({
    index,
    topic: t.topic,
    recency: t.recency,
    primer: t.isPrimer,
    content: t.content,
    // The outlet behind each citation, in order — Perplexity's [1] is the first. The model only
    // needs these to name outlets in the prose ("Reuters reported…"); the full sources (titles,
    // URLs, dates) are re-attached by index in code below. Passing them whole was ~3/4 of
    // everything synthesis read (measured 2026-10-03) for no use.
    sources: t.sources.map((s) => outletOf(s.url)),
  }));

  const userMessage =
    `Catch-up depth (for primer topics): ${prefs.context_depth}\n` +
    `Exclusions: ${prefs.exclusions || "none"}\n\n` +
    `Topics (JSON array; use each item's "index" as topic_index). Items with "primer": true are new to the reader — write those as a catch-up. ` +
    `Each item's "sources" names the outlet behind each citation in its content, in order — [1] is the first:\n` +
    `${JSON.stringify(topicsForModel)}\n\n` +
    "Write the report now.";

  const model = MODELS.synthesis;
  const started = Date.now();

  // Streamed: a new user's first brief is ALL primers (longer), so the output is still sizeable even
  // with markdown built in code; adaptive thinking shares this budget too. A non-streaming request at
  // this max_tokens can exceed the SDK's 10-minute limit and errors, so we stream and collect the
  // final message (the recommended path for large outputs anyway).
  const message = await anthropic()
    .messages.stream({
      model,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: {
        format: { type: "json_schema", schema: SYNTHESIS_SCHEMA },
        effort: "medium",
      },
      system: SYNTHESIS_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    })
    .finalMessage();

  // Recorded before the quality guards below: a degraded response still cost money.
  await meter({
    stage: "synthesise",
    provider: "anthropic",
    model,
    ...anthropicUsage(message),
    durationMs: Date.now() - started,
    extra: {
      topics: topics.length,
      primers: topics.filter((t) => t.isPrimer).length,
      stop_reason: message.stop_reason,
      effort: "medium",
    },
  });

  // A truncated (max_tokens) or text-less response would fail JSON.parse with a cryptic
  // "Unexpected end of JSON input" — surface a clear, diagnosable error instead (Trigger retries).
  const raw = firstText(message.content);
  if (message.stop_reason === "max_tokens" || !raw.trim()) {
    throw new Error(
      `Synthesis returned no usable JSON (stop_reason=${message.stop_reason}, text length=${raw.length}). ` +
        "Likely truncated — the brief may have too many/too-long sections for the token budget.",
    );
  }
  const parsed = JSON.parse(raw) as SynthesisOutput;

  // Re-attach the real sources / level / timeframe from the fetched topics by index, so
  // URLs and metadata are never model-invented. Out-of-range indices are dropped.
  const sections: ReportSection[] = parsed.sections
    .filter((s) => topics[s.topic_index] !== undefined)
    .map((s): ReportSection => {
      const t = topics[s.topic_index];
      return {
        topic: s.heading || t.topic,
        category: t.genre,
        summary: s.summary,
        sources: t.sources,
        level: t.level,
        timeframe: t.recency,
        isPrimer: t.isPrimer,
      };
    });

  // Guard against a model that "gives up" on a heavy brief — dropping topics or stubbing sections
  // with placeholder text (seen on all-primer first briefs). Fail loudly so Trigger retries rather
  // than shipping a broken report.
  const minSections = topics.length;
  const stub = sections.find(
    (s) => s.summary.trim().length < 15 || /\bplaceholder\b/i.test(`${s.topic} ${s.summary}`),
  );
  if (sections.length < minSections || stub) {
    throw new Error(
      `Synthesis degraded: ${sections.length}/${topics.length} sections` +
        (stub ? `, stubbed "${stub.topic}"` : "") +
        " — retrying.",
    );
  }

  return { content: { sections }, markdown: renderReportMarkdown(sections) };
}

// "https://www.reuters.com/world/…" -> "reuters.com". Falls back to the raw string if it isn't a URL.
function outletOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Render the report markdown in code from the finished sections — heading, the model's prose, then a
// per-section source list from the REAL attached sources (so citations can't drift). Replaces having
// the model emit the whole report a second time. Consumed by share, the podcast, and the recap.
function renderReportMarkdown(sections: ReportSection[]): string {
  return sections
    .map((s) => {
      const sourceList = s.sources
        .map((src) => `- [${src.title || src.url}](${src.url})${src.date ? ` — ${src.date}` : ""}`)
        .join("\n");
      return `## ${s.topic}\n\n${s.summary.trim()}${sourceList ? `\n\n${sourceList}` : ""}`;
    })
    .join("\n\n");
}
