import { requireEnv } from "./env";
import { noMeter, type Meter } from "./usage";
import type { Recency, ReportSource } from "@shared/types";

// Perplexity is OpenAI-compatible over plain HTTP — no SDK needed. We surface non-2xx and
// empty responses as real errors (COMPOSIO_TRIGGER_LEARNINGS Patterns §3) so an undefined
// result never flows silently downstream.

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
export const PERPLEXITY_MODEL = "sonar-pro"; // per CLAUDE.md

export interface PerplexityResult {
  content: string;
  sources: ReportSource[];
}

export interface PerplexityOptions {
  recency: Recency; // -> search_recency_filter (day / week / month)
  system?: string; // optional system prompt
  contextSize?: "low" | "medium" | "high"; // search depth; defaults to medium
  meta?: Record<string, unknown>; // tags for the usage ledger (topic, cache state…)
}

export async function perplexitySearch(
  userPrompt: string,
  opts: PerplexityOptions,
  meter: Meter = noMeter,
): Promise<PerplexityResult> {
  const messages = opts.system
    ? [
        { role: "system", content: opts.system },
        { role: "user", content: userPrompt },
      ]
    : [{ role: "user", content: userPrompt }];

  const started = Date.now();
  const res = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("PERPLEXITY_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages,
      search_recency_filter: opts.recency,
      web_search_options: { search_context_size: opts.contextSize ?? "medium" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Perplexity ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }

  const data: any = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Perplexity returned no content: ${JSON.stringify(data).slice(0, 500)}`);
  }

  const sources = extractSources(data);

  // Perplexity bills per request (by context size) plus per token; newer API versions also return
  // their own cost figure, which the meter prefers over the estimate when present.
  const u = data?.usage ?? {};
  await meter({
    stage: "retrieve",
    provider: "perplexity",
    model: PERPLEXITY_MODEL,
    inputTokens: u.prompt_tokens,
    outputTokens: u.completion_tokens,
    durationMs: Date.now() - started,
    reportedCostUsd: typeof u?.cost?.total_cost === "number" ? u.cost.total_cost : undefined,
    extra: {
      search_context_size: opts.contextSize ?? "medium",
      recency: opts.recency,
      sources: sources.length,
      usage: u,
      ...(opts.meta ?? {}),
    },
  });

  return { content, sources };
}

// Prefer the rich search_results (title + url + date); fall back to the citations URL list.
function extractSources(data: any): ReportSource[] {
  const results = data?.search_results;
  if (Array.isArray(results)) {
    const mapped = results
      .filter((r: any) => typeof r?.url === "string")
      .map((r: any): ReportSource => ({ title: r.title, url: r.url, date: r.date }));
    if (mapped.length > 0) return mapped;
  }

  const citations = data?.citations;
  if (Array.isArray(citations)) {
    return citations
      .filter((u: any): u is string => typeof u === "string")
      .map((url: string): ReportSource => ({ url }));
  }

  return [];
}
