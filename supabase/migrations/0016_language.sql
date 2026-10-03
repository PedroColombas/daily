-- ============================================================
-- Daily — Reader language
-- Migration 0016
--
-- language: the language the reader reads in. It sets the app's interface and the language the
-- pipeline WRITES in (report, catch-up, podcast). It does not change what is searched: retrieval
-- stays shared per (topic, day) whatever the reader's language, so two readers of the same topic
-- still share one search.
--
-- topic_labels: how a topic is shown to this reader, keyed by its internal name. A topic keeps one
-- internal name (English — "Semiconductors") so search sharing, topic history and section order all
-- keep working; a Spanish reader sees "Semiconductores". The built-in topics are translated in the
-- app itself; this only holds the labels of topics suggested live, which no fixed list can cover.
--
-- Additive, with defaults: every existing reader becomes 'en' with no labels, which is exactly what
-- they have today.
-- ============================================================
alter table public.preferences
  add column if not exists language text not null default 'en'
    check (language in ('en', 'es')),
  add column if not exists topic_labels jsonb not null default '{}'::jsonb;
