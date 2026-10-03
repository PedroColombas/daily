import { task, logger } from "@trigger.dev/sdk";
import { supabase } from "../lib/supabase";
import { anthropic, MODELS, firstText } from "../lib/anthropic";
import { perplexitySearch, PERPLEXITY_MODEL } from "../lib/perplexity";
import { anthropicUsage, createMeter, type Meter } from "../lib/usage";
import { withDiagnostics } from "../lib/diagnostics";
import { mapWithConcurrency, withRetry } from "../lib/concurrency";
import { generateReport } from "./generate-report";
import { planReportSections, type PlannedTopic } from "../../../shared/plan-topics";
import type { Preferences, Recency, ReportSource } from "@shared/types";

// A topic resolved to a single editorial-brief Perplexity query (one query per topic).
export interface TopicQuery {
  topic: string; // clean label shown in the report
  level: 1 | 2 | 3; // genre / subtopic / custom interest
  genre: string | null; // originating genre (L1 = itself, L2 = parent, L3 = none)
  recency: Recency; // resolved news window for this topic
  query: string; // the editorial-brief user prompt
  topicKey: string; // stable key for new-topic detection (user_topic_history)
  isPrimer: boolean; // first-time catch-up primer for this user
}

export interface FetchedTopic extends TopicQuery {
  content: string; // Perplexity's synthesised answer
  sources: ReportSource[]; // dated citations
}

// Per-topic Perplexity fetches run ONE AT A TIME. Verified 2026-09: a single sonar-pro request with
// these exact params succeeds, while two in flight return 429 request_rate_limit_exceeded — i.e. the
// account's limit is on SIMULTANEOUS requests, not throughput, so spacing retries out cannot help.
// With the 4-section cap this costs ~30s per brief and is the difference between working and not.
// Raise it only against a rate limit confirmed in the Perplexity dashboard.
const PERPLEXITY_CONCURRENCY = 1;

export const fetchNews = task({
  id: "fetch-news",
  maxDuration: 300,
  run: async (payload: { userId: string; date: string; force?: boolean }, { ctx }) => {
    const { userId, date, force } = payload;
    // Every paid call this run makes lands in the usage ledger against this reader and date.
    const meter = createMeter({ runId: ctx.run.id, userId, date });

    try {
      // If today's brief is already complete (a duplicate click, a Trigger retry, or the daily
      // cron after an on-demand run), don't redo the work or downgrade the finished report.
      // EXCEPT when force is set (the user changed their topics and asked to regenerate today) —
      // then we deliberately rebuild over the finished report.
      const { data: current } = await supabase()
        .from("reports")
        .select("status")
        .eq("user_id", userId)
        .eq("date", date)
        .maybeSingle();
      if (!force && current?.status === "complete") {
        logger.info("report already complete — skipping fetch", { userId, date });
        return { userId, date, skipped: true };
      }

      // Load prefs first so we can bail on an un-onboarded user before creating any row.
      const { data, error } = await supabase()
        .from("preferences")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (error) throw error;
      const prefs = data as Preferences;

      // No-topics guard: an un-onboarded user (no subtopics / interests) has nothing to generate.
      // Skip entirely rather than create an empty brief and waste a synthesis call. The daily cron
      // fans out to every user at their delivery hour, including those who haven't set up yet.
      if (planReportSections(prefs).length === 0) {
        logger.info("no topics — skipping generation", { userId, date });
        return { userId, date, skipped: "no-topics" };
      }

      // Claim the reports row and mark it generating up front, so the app shows the compiling
      // state immediately and it SURVIVES A RELOAD. (Previously the row appeared only once
      // generate-report ran — i.e. after the whole Perplexity stage — leaving a multi-minute gap
      // where a reload saw no row and fell back to the "Generate" button, letting the user
      // re-trigger a duplicate run.)
      await supabase()
        .from("reports")
        .upsert(
          {
            user_id: userId,
            date,
            status: "generating",
            error_message: null,
            // Stamp when THIS generation started. created_at is otherwise only set on insert, so a
            // reclaimed row (e.g. retrying a hours-old failed brief) would keep a stale time and the
            // app's reload timeout + failed-vs-stale checks would misfire.
            created_at: new Date().toISOString(),
          },
          { onConflict: "user_id,date" },
        );

      // Topics this user has already been briefed on — a topic only gets a catch-up primer
      // the first time it appears.
      const { data: history } = await supabase()
        .from("user_topic_history")
        .select("topic_key")
        .eq("user_id", userId);
      const briefed = new Set((history ?? []).map((h) => h.topic_key as string));

      // Monday's brief sweeps up the weekend (wider window). Derived from the brief DATE so the cron
      // and on-demand paths always agree — and so the shared cache key (topic, date) fully determines
      // the window (a payload flag would let callers disagree and cross-contaminate the cache).
      const weekendCatchup = new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
      const topics = await buildTopicQueries(prefs, briefed, weekendCatchup, meter);
      logger.info("resolved topic queries", {
        userId,
        count: topics.length,
        windows: topics.map((t) => `${t.topic}:${t.recency}${t.isPrimer ? ":primer" : ""}`),
      });

      // One Perplexity query per topic, run with bounded concurrency (was sequential — the slow part
      // of a first brief). Canonical topics (genre/subtopic) share one result per (topic, day) via
      // topic_news_cache across ALL users — first-time primers included, under their own key, since a
      // primer's query depends only on the topic. Custom interests stay per-user. withRetry rides out a transient 429 from parallel calls. Order is preserved.
      const fetched: FetchedTopic[] = await mapWithConcurrency(
        topics,
        PERPLEXITY_CONCURRENCY,
        async (t) => {
          const shareable = t.level === 1 || t.level === 2;
          const result = shareable
            ? await getCachedOrFetch(t, date, meter)
            : await withRetry(() =>
                withDiagnostics(`perplexity:${t.topic}`, () =>
                  perplexitySearch(
                    t.query,
                    {
                      recency: t.recency,
                      system: SYSTEM_PROMPT,
                      contextSize: t.isPrimer ? "high" : "medium",
                      meta: {
                        topic: t.topic,
                        topic_key: t.topicKey,
                        cache: "not_shareable",
                        primer: t.isPrimer,
                      },
                    },
                    meter,
                  ),
                ),
              );
          return { ...t, content: result.content, sources: result.sources };
        },
      );
      logger.info("fetched all topics", { userId, count: fetched.length });

      // Hand off to synthesis (fire-and-forget; generate-report owns the reports row).
      // Pass force through so a regenerate also rebuilds the report + podcast, not just re-fetches.
      await generateReport.trigger({ userId, date, topics: fetched, force });

      return { userId, date, topicCount: fetched.length };
    } catch (err) {
      // fetch-news fails BEFORE generate-report creates the reports row, so without this the app
      // would just spin until it times out. Record a failed report (unless a good one already
      // exists) so the UI surfaces an error — with a clearer message for quota/billing — in
      // seconds rather than minutes.
      const { data: existing } = await supabase()
        .from("reports")
        .select("status")
        .eq("user_id", userId)
        .eq("date", date)
        .maybeSingle();
      if (existing?.status !== "complete") {
        await supabase()
          .from("reports")
          .upsert(
            { user_id: userId, date, status: "failed", error_message: friendlyFetchError(err) },
            { onConflict: "user_id,date" },
          );
      }
      throw err; // rethrow so Trigger records + retries
    }
  },
});

// Shared per-(topic, day) Perplexity cache for canonical topics. Hit → reuse; miss → fetch once and
// populate (ignoring conflicts if another user won the race). The shared-query cost saver: on a
// topic followed by many users, all but the first reuse a single result. Only the raw news is
// shared — synthesis stays per-user, so personalisation is untouched.
async function getCachedOrFetch(
  t: TopicQuery,
  date: string,
  meter: Meter,
): Promise<{ content: string; sources: ReportSource[] }> {
  // A first-time primer is a different search (background, wider window, deeper context) from the
  // day's headlines for the same topic, so it is cached under its own key. Its query depends only on
  // the topic — how much catch-up a reader wants is applied later, in synthesis — so it is identical
  // for every reader new to that topic that day. It is also the most expensive search there is
  // ($0.043 vs ~$0.023, measured 2026-10-03), so sharing it makes onboarding cheaper at scale.
  const cacheKey = t.isPrimer ? `primer:${t.topicKey}` : t.topicKey;
  const db = supabase();
  const { data: hit, error: readErr } = await db
    .from("topic_news_cache")
    .select("content, sources")
    .eq("topic_key", cacheKey)
    .eq("date", date)
    .maybeSingle();
  // A read failure degrades safely to a fresh fetch — but log it, or a broken cache (unapplied
  // migration, RLS/grant drift) would silently revert everyone to full-price queries with no signal.
  if (readErr) logger.warn("topic cache read failed", { topicKey: cacheKey, error: readErr.message });
  if (hit) {
    logger.info("topic cache hit", { topicKey: cacheKey, date });
    // A hit is a search not paid for. Recorded at zero cost so the saving shows in the ledger —
    // the hit rate is one of the numbers the cost work needs.
    await meter({
      stage: "retrieve",
      provider: "perplexity",
      model: PERPLEXITY_MODEL,
      requests: 0,
      extra: { topic: t.topic, topic_key: cacheKey, cache: "hit", primer: t.isPrimer },
    });
    return { content: hit.content as string, sources: (hit.sources ?? []) as ReportSource[] };
  }

  const result = await withRetry(() =>
    withDiagnostics(`perplexity:${t.topic}`, () =>
      perplexitySearch(
        t.query,
        {
          recency: t.recency,
          system: SYSTEM_PROMPT,
          contextSize: t.isPrimer ? "high" : "medium",
          meta: { topic: t.topic, topic_key: cacheKey, cache: "miss", primer: t.isPrimer },
        },
        meter,
      ),
    ),
  );
  // Populate the shared cache. ignoreDuplicates → if another user won the race, keep their row.
  const { error: writeErr } = await db
    .from("topic_news_cache")
    .upsert(
      { topic_key: cacheKey, date, content: result.content, sources: result.sources },
      { onConflict: "topic_key,date", ignoreDuplicates: true },
    );
  if (writeErr) logger.warn("topic cache write failed", { topicKey: cacheKey, error: writeErr.message });
  return { content: result.content, sources: result.sources };
}

// Turn a raw pipeline error into a short, user-facing reason for reports.error_message.
function friendlyFetchError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err);
  if (/insufficient_quota|exceeded your current quota|\b429\b|rate.?limit|too many requests|quota/i.test(msg)) {
    return "The news service is temporarily unavailable (usage limit reached). Please try again shortly.";
  }
  // Provider BILLING exhaustion is a different animal from a transient rate limit: retrying never
  // clears it. Called out separately because it otherwise lands in the generic bucket below, which
  // leaves a failed brief giving no hint that the fix is "top up the account". (Cost us a debugging
  // round trip when the Anthropic balance ran out mid-seed.)
  if (/credit balance is too low|payment required|insufficient funds|out of credit|billing/i.test(msg)) {
    return "Couldn't generate — the AI provider account is out of credit.";
  }
  return "Couldn't gather today's news — something went wrong. Please try again.";
}

// ─────────────────────────────────────────────────────────────────────────────
// Query generation — DESIGNED WITH THE OWNER.
//   • Editorial-brief shape: ask Perplexity to do the editorial work (key facts +
//     why it matters), one shared template across all three topic levels.
//   • Topic resolution: genres/subtopics are deterministic; free-text custom
//     interests get a cheap Claude call to extract a clean topic label.
//   • Window: latest (24h) per topic; a topic NEW to the user gets a one-time catch-up
//     primer (wider "month" window + background query) unless context_depth is "latest".
//   • Every topic the user keeps becomes a section — no cap. planReportSections decides the
//     set and order; here we resolve each into a query.
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a news research assistant compiling source material for a personalised daily " +
  "briefing. Report only concrete, verifiable developments — with names, numbers, and " +
  "dates. Be specific and factual; do not speculate unless you clearly label it as " +
  "analysis. If little of substance happened in the window, say so briefly rather than " +
  "padding the answer.";

const WINDOW_TEXT: Record<Recency, string> = {
  day: "the last 24 hours",
  week: "the last 7 days",
  month: "the last 30 days",
};

function editorialQuery(topic: string, recency: Recency): string {
  return (
    `Summarise the most significant ${topic} developments from ${WINDOW_TEXT[recency]}. ` +
    "For each story, give what happened, the key facts, and why it matters. " +
    "Prioritise the most important and most recent developments."
  );
}

const DAILY_WINDOW: Recency = "day"; // latest news for an already-followed topic
const PRIMER_WINDOW: Recency = "month"; // wider window for a first-time catch-up primer
const WEEKEND_WINDOW: Recency = "week"; // Monday brief — wide enough to reach back over the weekend

// Monday's brief covers the weekend + the gap since Friday's. "week" recency lets Perplexity reach
// back far enough; the prompt keeps the focus on the last few days rather than the whole week.
function weekendEditorialQuery(topic: string): string {
  return (
    `Summarise the most significant ${topic} developments from the past few days, including over ` +
    "the weekend. For each story, give what happened, the key facts, and why it matters. " +
    "Prioritise the most important and most recent developments."
  );
}

// A first-time catch-up: background + state of the field, not just today's headlines.
function primerQuery(topic: string): string {
  return (
    `Provide background to bring a reader up to speed on ${topic}: the current state of the ` +
    `field, the key players and context, and the most important recent developments and ongoing ` +
    `storylines. Focus on what someone newly following ${topic} needs to understand — not just ` +
    `the last day's headlines.`
  );
}

// Stable identifier per topic for new-topic detection (independent of the resolved L3 label).
function topicKey(p: PlannedTopic): string {
  if (p.level === 3) return `interest:${p.topic}`;
  if (p.level === 2) return `sub:${p.genre}:${p.topic}`;
  return `genre:${p.topic}`;
}

async function buildTopicQueries(
  prefs: Preferences,
  briefed: Set<string>,
  weekendCatchup: boolean,
  meter: Meter,
): Promise<TopicQuery[]> {
  // Which sections (and their order) is shared with the app's edition preview via
  // planReportSections, so the two never drift. Here we resolve each into a query.
  const out: TopicQuery[] = [];
  for (const planned of planReportSections(prefs)) {
    const key = topicKey(planned);
    // A topic new to this user gets a one-time catch-up primer (unless they chose "latest").
    const isPrimer = prefs.context_depth !== "latest" && !briefed.has(key);

    // L3 custom interests: sharpen the raw free-text into a clean search label.
    const topic =
      planned.level === 3 ? await resolveInterestTopic(planned.topic, meter) : planned.topic;
    // Primer takes precedence; otherwise Monday's weekend sweep widens the window.
    const recency = isPrimer ? PRIMER_WINDOW : weekendCatchup ? WEEKEND_WINDOW : DAILY_WINDOW;

    out.push({
      topic,
      level: planned.level,
      genre: planned.genre,
      recency,
      query: isPrimer
        ? primerQuery(topic)
        : weekendCatchup
          ? weekendEditorialQuery(topic)
          : editorialQuery(topic, recency),
      topicKey: key,
      isPrimer,
    });
  }
  return out;
}

async function resolveInterestTopic(interest: string, meter: Meter): Promise<string> {
  const started = Date.now();
  const message = await withDiagnostics("resolve-interest", () =>
    anthropic().messages.create({
      model: MODELS.queryTranslation,
      max_tokens: 64,
      system:
        "Turn the user's free-text interest into a short, search-ready news topic label. " +
        "Return ONLY a concise noun phrase (max ~8 words) capturing the core subject — no " +
        "quotes, no trailing punctuation.",
      messages: [{ role: "user", content: interest }],
    }),
  );
  await meter({
    stage: "resolve",
    provider: "anthropic",
    model: MODELS.queryTranslation,
    ...anthropicUsage(message),
    durationMs: Date.now() - started,
  });
  return firstText(message.content).trim() || interest;
}
