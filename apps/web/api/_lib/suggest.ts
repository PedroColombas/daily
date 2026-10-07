import Anthropic from "@anthropic-ai/sdk";

// Cheap/fast model — same tier the pipeline uses for Level-3 query translation.
const MODEL = "claude-haiku-4-5-20251001";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

// Note: Anthropic structured-output schemas only allow array minItems of 0 or 1,
// so count (6–8) and length (1–3 words) are steered by the prompt + trimmed in code.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subtopics"],
  properties: {
    subtopics: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

// The Spanish variant: the same English names (they are the internal keys), each with the label a
// reader in Spain is shown.
const LABELLED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subtopics"],
  properties: {
    subtopics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "label"],
        properties: {
          name: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
} as const;

const SPANISH_LABELS =
  `\n\nThe reader reads in Spanish (Spain). For each subtopic give "name" — the English label, ` +
  `following the rules above — and "label": how a newspaper in Spain would name that same section ` +
  `(sentence case — capital first letter — and as short as the English).`;

const SYSTEM = `You suggest subtopics a news reader can follow within a broad news genre.
Favour DURABLE THEMES that are currently prominent in the news — ongoing areas of development and active storylines — NOT one-off events or dated headlines. A good subtopic still makes sense a month from now (e.g. "AI Regulation", not "Tuesday's Senate vote").
Rules:
- Each subtopic is 1–3 words, Title Case, no punctuation or trailing explanation.
- 6–8 distinct items, no overlap; order by current prominence.
- Do not repeat the genre name itself; avoid niche jargon.`;

function firstText(content: Array<{ type: string; text?: string }>): string {
  const block = content.find((b) => b.type === "text" && typeof b.text === "string");
  return block?.text ?? "";
}

// Quick read of what's currently active in a genre (past week), via Perplexity.
// Returns synthesised text that Claude then distils into clean theme labels.
async function fetchTrendingContext(genre: string, perplexityKey: string): Promise<string> {
  const res = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${perplexityKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content:
            "You are a news research assistant. Identify the main ongoing themes and storylines currently active in a news genre.",
        },
        {
          role: "user",
          content: `Genre: ${genre}\n\nList the 8–10 most prominent ongoing themes and storylines in ${genre} news over the past week. Give short theme labels, not full headlines.`,
        },
      ],
      search_recency_filter: "week",
      web_search_options: { search_context_size: "low" },
    }),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status} ${res.statusText}`);
  const data: any = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Perplexity returned no content");
  return content;
}

function cleanList(list: unknown, genre: string): string[] {
  const arr = Array.isArray(list) ? list : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    const key = s.toLowerCase();
    if (!s || seen.has(key) || key === genre.toLowerCase()) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 8) break;
  }
  return out;
}

export interface Suggestions {
  subtopics: string[];
  labels?: Record<string, string>;
}

// Distil clean, durable theme chips — optionally informed by fresh news context.
async function distillThemes(
  genre: string,
  context: string,
  apiKey: string,
  language: "en" | "es",
): Promise<Suggestions> {
  const client = new Anthropic({ apiKey });
  const userContent = context
    ? `Genre: ${genre}\n\nRecent news context (what's currently active):\n${context}\n\nFrom this, propose the subtopics.`
    : `Genre: ${genre}`;

  const spanish = language === "es";
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: spanish ? 600 : 300,
    system: spanish ? SYSTEM + SPANISH_LABELS : SYSTEM,
    messages: [{ role: "user", content: userContent }],
    // Structured output constrains the reply to the schema above.
    output_config: { format: { type: "json_schema", schema: spanish ? LABELLED_SCHEMA : SCHEMA } },
  } as Anthropic.Messages.MessageCreateParamsNonStreaming);

  const parsed = JSON.parse(firstText(response.content)) as { subtopics?: unknown };
  if (!spanish) return { subtopics: cleanList(parsed.subtopics, genre) };

  const items = Array.isArray(parsed.subtopics) ? parsed.subtopics : [];
  const labels: Record<string, string> = {};
  for (const item of items as { name?: unknown; label?: unknown }[]) {
    if (typeof item?.name === "string" && typeof item.label === "string" && item.label.trim()) {
      // First letter capitalised: the model sometimes returns Spanish labels all in lower case.
      const label = item.label.trim();
      labels[item.name.trim()] = label.charAt(0).toLocaleUpperCase("es") + label.slice(1);
    }
  }
  const subtopics = cleanList(
    items.map((i) => (i as { name?: unknown })?.name),
    genre,
  );
  return { subtopics, labels: Object.fromEntries(subtopics.filter((s) => labels[s]).map((s) => [s, labels[s]])) };
}

/**
 * Suggest ~6–8 subtopic chips for a genre, grounded in current news when a Perplexity
 * key is available. Server-side only — the caller supplies the keys (never exposed to the
 * browser). Degrades gracefully: no/failed Perplexity → evergreen Claude suggestions;
 * a thrown error → caller's static fallback.
 */
export async function suggestSubtopics(
  genre: string,
  anthropicKey: string,
  perplexityKey?: string,
  language: "en" | "es" = "en",
): Promise<Suggestions> {
  const trimmed = genre.trim();
  if (!trimmed) return { subtopics: [] };

  let context = "";
  if (perplexityKey) {
    try {
      context = await fetchTrendingContext(trimmed, perplexityKey);
    } catch (err) {
      console.error("trending context failed; falling back to evergreen suggestions:", err);
    }
  }

  return distillThemes(trimmed, context, anthropicKey, language);
}
