-- ============================================================
-- Daily — Pipeline usage ledger
-- Migration 0015
--
-- One row per paid call the pipeline makes (a Perplexity search, a Claude synthesis, OpenAI
-- speech…) with raw token counts, request count, duration, and an estimated cost. Written by the
-- pipeline (trigger/src/lib/usage.ts); nothing in the app reads it.
--
-- Raw counts are the source of truth. cost_usd is an estimate made at write time from the prices
-- in usage.ts and stamped with price_version, so a later price change cannot silently reinterpret
-- old rows. Cache hits are recorded as zero-cost rows with requests = 0.
--
-- Pipeline-only, like topic_news_cache: RLS is ON with NO policies, so the service_role pipeline
-- bypasses it while anon/authenticated clients get nothing.
-- ============================================================
create table if not exists pipeline_usage (
  id                 bigint generated always as identity primary key,
  created_at         timestamptz not null default now(),
  run_id             text,            -- Trigger.dev run id, to find the run's log
  user_id            uuid,            -- whose brief this spend was for (a shared-cache fill is charged to the first reader)
  report_id          uuid,            -- null for retrieval, which runs before the report row exists
  date               date,            -- the brief's date; with user_id this identifies a report
  stage              text not null,   -- resolve | retrieve | synthesise | recap | podcast_script | tts
  provider           text not null,   -- anthropic | perplexity | openai | elevenlabs
  model              text not null,
  requests           integer not null default 1,
  input_tokens       integer,
  output_tokens      integer,
  cache_read_tokens  integer,
  cache_write_tokens integer,
  duration_ms        integer,
  cost_usd           numeric(10, 6),  -- estimated; null when the model has no known price
  price_version      text,
  extra              jsonb not null default '{}'::jsonb  -- search_context_size, cache state, characters…
);

create index if not exists pipeline_usage_user_date_idx on pipeline_usage (user_id, date);
create index if not exists pipeline_usage_created_idx on pipeline_usage (created_at);

alter table pipeline_usage enable row level security;
-- No policies on purpose — written and read only by the pipeline (service_role bypasses RLS).

-- What a brief cost: one row per (reader, day), split into the report and its podcast, with a
-- per-stage breakdown. Keyed on (user_id, date) rather than report_id because retrieval runs before
-- the report row exists. security_invoker so the view honours the table's RLS: anon gets nothing.
create or replace view pipeline_usage_by_brief with (security_invoker = true) as
with per_stage as (
  select user_id, date, stage,
         sum(cost_usd)          as cost_usd,
         sum(requests)          as requests,
         sum(input_tokens)      as input_tokens,
         sum(output_tokens)     as output_tokens,
         sum(cache_read_tokens) as cache_read_tokens
  from pipeline_usage
  where user_id is not null and date is not null
  group by user_id, date, stage
)
select
  user_id,
  date,
  round(sum(cost_usd) filter (where stage in ('resolve', 'retrieve', 'synthesise', 'recap')), 4) as report_usd,
  round(sum(cost_usd) filter (where stage in ('podcast_script', 'tts')), 4)                        as podcast_usd,
  round(sum(cost_usd), 4)                                                                           as total_usd,
  jsonb_object_agg(
    stage,
    jsonb_build_object(
      'usd', round(cost_usd, 4), 'requests', requests,
      'in', input_tokens, 'out', output_tokens, 'cache_read', cache_read_tokens
    )
    order by stage
  ) as by_stage
from per_stage
group by user_id, date
order by date desc, user_id;
