import { logger } from "@trigger.dev/sdk";
import { supabase } from "./supabase";

// Every paid call the pipeline makes is recorded in pipeline_usage (migration 0015): tokens in and
// out, requests, duration, and an estimated cost. Until this existed the pipeline had never measured
// its own cost — every per-brief figure was an estimate — so this ledger is the baseline the cost
// work is judged against.
//
// Rules:
//  • Recording can never fail a run. Every write is caught and logged; the brief ships regardless.
//  • Raw counts are the source of truth. cost_usd is estimated at write time from the prices below
//    and stamped with PRICE_VERSION, so a later price change cannot silently reinterpret old rows.
//  • A retry that re-calls an API really did spend money, so it is recorded again. Never dedupe.
//  • A cache hit is recorded too, at zero cost. A saving you cannot see is one you cannot measure.

export type Stage = "resolve" | "retrieve" | "synthesise" | "recap" | "podcast_script" | "tts";
export type Provider = "anthropic" | "perplexity" | "openai" | "elevenlabs";

export interface UsageEvent {
  stage: Stage;
  provider: Provider;
  model: string;
  requests?: number; // default 1; 0 for a cache hit
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  durationMs?: number;
  // Perplexity reports its own cost on newer API versions; when present it beats the estimate.
  reportedCostUsd?: number;
  extra?: Record<string, unknown>;
}

export interface UsageContext {
  runId?: string;
  userId?: string;
  reportId?: string;
  date?: string;
}

export type Meter = (event: UsageEvent) => Promise<void>;

// For callers with nothing to record against — the local preview scripts.
export const noMeter: Meter = async () => {};

export const PRICE_VERSION = "2026-10-02";

// USD per million tokens. Cache reads are charged at 10% of input and cache writes at 125%
// (Anthropic's five-minute ephemeral cache). CHECK these against each provider's pricing page before
// trusting a baseline — a wrong number here is a wrong number in every row.
const TOKEN_PRICES: Record<
  string,
  { input: number; output: number; cacheRead?: number; cacheWrite?: number }
> = {
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "sonar-pro": { input: 3, output: 15 },
};

// Perplexity also charges per request, by search context size (USD per request).
const PERPLEXITY_REQUEST_USD: Record<string, number> = { low: 0.006, medium: 0.01, high: 0.014 };

// OpenAI prices gpt-4o-mini-tts at roughly $0.015 per minute of audio and returns no usage, so
// minutes are estimated from word count at 150 wpm — the same rate the player's duration uses.
const TTS_USD_PER_MINUTE = 0.015;

export function estimateCostUsd(e: UsageEvent): number | null {
  if (typeof e.reportedCostUsd === "number") return e.reportedCostUsd;
  if ((e.requests ?? 1) === 0) return 0;
  if (e.stage === "tts") {
    if (e.provider !== "openai") return null; // ElevenLabs is dormant and priced per plan
    const minutes = Number(e.extra?.estimated_minutes);
    return Number.isFinite(minutes) ? minutes * TTS_USD_PER_MINUTE : null;
  }
  const p = TOKEN_PRICES[e.model];
  if (!p) return null; // unknown model: raw counts still land; cost stays null rather than wrong
  const perM = (n: number | undefined, price: number | undefined) =>
    ((n ?? 0) / 1_000_000) * (price ?? 0);
  let usd =
    perM(e.inputTokens, p.input) +
    perM(e.outputTokens, p.output) +
    perM(e.cacheReadTokens, p.cacheRead) +
    perM(e.cacheWriteTokens, p.cacheWrite);
  if (e.provider === "perplexity") {
    const size = String(e.extra?.search_context_size ?? "medium");
    usd += (e.requests ?? 1) * (PERPLEXITY_REQUEST_USD[size] ?? PERPLEXITY_REQUEST_USD.medium);
  }
  return usd;
}

// The token counts off an Anthropic message — the same shape from create() and from
// stream().finalMessage().
export function anthropicUsage(message: {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
}): Pick<UsageEvent, "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens"> {
  const u = message.usage ?? {};
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

export function createMeter(ctx: UsageContext): Meter {
  return async (e) => {
    const cost = estimateCostUsd(e);
    if (cost === null && (e.requests ?? 1) > 0) {
      logger.warn("usage recorded without a price — add the model to TOKEN_PRICES", {
        model: e.model,
      });
    }
    try {
      // Awaited on purpose: a Supabase query only runs when awaited, and the task must not finish
      // before the row lands.
      const { error } = await supabase().from("pipeline_usage").insert({
        run_id: ctx.runId ?? null,
        user_id: ctx.userId ?? null,
        report_id: ctx.reportId ?? null,
        date: ctx.date ?? null,
        stage: e.stage,
        provider: e.provider,
        model: e.model,
        requests: e.requests ?? 1,
        input_tokens: e.inputTokens ?? null,
        output_tokens: e.outputTokens ?? null,
        cache_read_tokens: e.cacheReadTokens ?? null,
        cache_write_tokens: e.cacheWriteTokens ?? null,
        duration_ms: e.durationMs ?? null,
        cost_usd: cost,
        price_version: PRICE_VERSION,
        extra: e.extra ?? {},
      });
      if (error) logger.warn("usage not recorded", { stage: e.stage, error: error.message });
    } catch (err) {
      logger.warn("usage not recorded", {
        stage: e.stage,
        error: String((err as { message?: string })?.message ?? err),
      });
    }
  };
}
