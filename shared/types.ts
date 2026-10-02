// ============================================================
// Shared types — mirror the Supabase schema.
// Import these in both the React app and the Trigger.dev jobs.
// ============================================================

export type ReportMode = 'briefing' | 'standard' | 'deep_dive';
export type Voice = 'neutral' | 'analytical' | 'conversational' | 'critical';
export type ReportStatus = 'pending' | 'generating' | 'complete' | 'failed';
export type PodcastStatus = 'pending' | 'generating' | 'complete' | 'failed';

// Subscription tier + status (mirrors the subscriptions table / Stripe status). Tier CAPABILITIES
// (cadence, podcast, price) live in ./tiers.
export type Tier = 'free' | 'text' | 'studio';
export type SubscriptionStatus =
  | 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid';

// News recency window. Maps to Perplexity's search_recency_filter
// (day = 24h, week = 7d, month = 30d).
export type Recency = 'day' | 'week' | 'month';

// Level 2 subtopics, keyed by genre name
export type SubtopicMap = Record<string, string[]>;

// How much background a topic gets the FIRST time it appears in a user's brief:
// 'latest' = no primer, 'quick' = short primer, 'full' = thorough catch-up.
export type ContextDepth = 'latest' | 'quick' | 'full';

export interface Preferences {
  id: string;
  user_id: string;
  genres: string[];               // Level 1
  subtopics: SubtopicMap;         // Level 2
  custom_interests: string[];     // Level 3 — natural language, max 5
  exclusions: string;
  report_mode: ReportMode;
  voice: Voice;
  max_topics: number;             // 1–10
  context_depth: ContextDepth;    // catch-up depth for newly-followed topics
  podcast_enabled: boolean;
  delivery_hour: number;          // 0–23, UTC
  walkthrough_seen: boolean;      // deprecated — superseded by tips_seen (kept for back-compat)
  tips_seen: string[];            // keys of one-time coach-mark tips the user has dismissed
  is_demo: boolean;               // public demo account — blocked from all paid API calls
  topic_order: string[];          // user-chosen section order (keys); [] = specific-first default
  updated_at: string;
}

// Subscription / billing row (see migration 0013). Written only by the Stripe webhook; clients read.
export interface Subscription {
  user_id: string;
  tier: Tier;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;   // ISO; access valid until here. null = no Stripe expiry (free)
  cancel_at_period_end: boolean;
  trial_end: string | null;
  updated_at: string;
}

// A cited source behind a report section. Title + date come from Perplexity's
// search_results so the report can show how recent each item is.
export interface ReportSource {
  title?: string;
  url: string;
  date?: string;                  // publication date as returned by Perplexity
}

// A single topic section within a report
export interface ReportSection {
  topic: string;                  // editorial heading for the section
  category: string | null;        // originating genre (null for custom interests / "For you")
  summary: string;
  sources: ReportSource[];        // sources with optional title + date
  level: 1 | 2 | 3;               // which topic level produced this section
  timeframe?: Recency;            // the recency window this section covers
  isPrimer?: boolean;             // a first-time catch-up primer for this topic
}

// "While you were away" recap of briefs missed since the user last read one.
export interface ReportRecap {
  summary: string; // short catch-up across the missed period
  days: number;    // number of missed briefs covered
}

export interface ReportContent {
  sections: ReportSection[];
  recap?: ReportRecap | null;
}

export interface Report {
  id: string;
  user_id: string;
  date: string;                   // YYYY-MM-DD
  content: ReportContent | null;
  markdown: string | null;
  status: ReportStatus;
  error_message: string | null;
  created_at: string;
}

// A chapter marker within a podcast episode. `fraction` (0..1) is the start position as a
// share of the episode, multiplied by the real audio duration at play time.
export interface PodcastChapter {
  title: string;
  fraction: number;
}

export interface PodcastEpisode {
  id: string;
  report_id: string;
  user_id: string;
  script: string | null;
  audio_url: string | null;       // storage path
  duration_seconds: number | null;
  chapters: PodcastChapter[];     // per-topic markers for the player
  status: PodcastStatus;
  created_at: string;
}

// One paid call made by the pipeline — mirrors pipeline_usage (migration 0015). Pipeline-only:
// written by trigger/src/lib/usage.ts and read in SQL (the pipeline_usage_by_brief view); the app
// never touches it. Raw counts are the source of truth; cost_usd is an estimate stamped with the
// price list it was computed from.
export interface PipelineUsage {
  id: number;
  created_at: string;
  run_id: string | null;
  user_id: string | null;
  report_id: string | null;
  date: string | null;
  stage: 'resolve' | 'retrieve' | 'synthesise' | 'recap' | 'podcast_script' | 'tts';
  provider: 'anthropic' | 'perplexity' | 'openai' | 'elevenlabs';
  model: string;
  requests: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  duration_ms: number | null;
  cost_usd: number | null;
  price_version: string | null;
  extra: Record<string, unknown>;
}
