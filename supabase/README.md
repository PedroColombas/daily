# Data layer

Postgres, auth and audio storage, all on Supabase. Everything else — the app and the
pipeline — builds on what is defined here, so the migrations are the source of truth for
the data model. If a table changes, `shared/types.ts` changes in the same commit.

## Migrations

Applied in order. `0001`–`0003` are the foundation; the rest are features as they landed.

| | |
|---|---|
| `0001_initial_schema` | `preferences`, `reports`, `podcast_episodes`; an `updated_at` trigger; and `on_auth_user_created`, which inserts a default preferences row so the app never has to handle "no preferences yet" |
| `0002_rls_policies` | Row-level security on every table |
| `0003_storage` | Private `podcast-audio` bucket and its per-user read policy |
| `0004_recency` → `0006_context_depth` → `0007_drop_recency` | A user-selectable news window, replaced by a single "how much catch-up do you want" control, then the dead columns dropped |
| `0005_podcast_chapters` | Per-topic chapter marks on an episode |
| `0008_report_reads` | Which briefs a reader has opened — this is what the catch-up is computed from |
| `0009_walkthrough_seen`, `0012_tips_seen` | First-run guidance, shown once |
| `0010_topic_order` | Reader-defined section order |
| `0011_topic_news_cache` | Per-`(topic, day)` Perplexity results, shared across all readers |
| `0013_subscriptions` | Tier and status. Modelled, not charged — there is no checkout |
| `0014_is_demo` | Marks the public demo account, which every paid endpoint checks |
| `0015_pipeline_usage` | One row per paid API call — tokens, requests, duration and an estimated cost — plus the `pipeline_usage_by_brief` view that sums them per brief |
| `0016_language` | The reader's language (English or Spain Spanish), and display labels for live-suggested topics, whose internal names stay English |

## Design decisions baked into the schema

- **Preferences exist from signup.** A trigger creates the row, so there is no "user without
  preferences" state to handle anywhere in the app.
- **Reports and podcasts are read-only from the frontend.** RLS grants users no insert or
  update policy on those tables; only the pipeline, holding the service role, writes them.
  This is what makes it safe to ship a public demo account's credentials.
- **Storage is private**, served through signed URLs, namespaced `{user_id}/{report_id}.mp3`.
- **One report per user per day**, enforced by `unique(user_id, date)`. That constraint is
  also the pipeline's idempotency anchor — a Trigger retry cannot produce a second brief.

## Setting up a fresh project

1. **Create the project.** Note the Project URL and, from Settings → API, the `anon` key
   (used by the React app) and the `service_role` key (used only by the pipeline, never
   shipped to a browser).

2. **Apply the migrations**, in filename order:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   Or paste each file into the dashboard's SQL editor, one at a time, in order.

3. **Configure auth.** Enable Email — magic link, so there is no password to type on a
   phone — and optionally Google. Under URL Configuration, set the Site URL to your
   deployed domain and add `http://localhost:5173` for local development.

4. **Check it worked.** Add a user from the dashboard and confirm a `preferences` row
   appeared with their id, and that the `podcast-audio` bucket exists.
