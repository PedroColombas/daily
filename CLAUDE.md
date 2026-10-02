# CLAUDE.md — Daily

Context for Claude Code. Read this first before working on the project.

## What this is

A mobile-first (iPhone) web app where a user configures news topic preferences
and report style, a backend pipeline runs daily to compile a summarised report,
and results are served back in the app. Includes a **podcast mode** that converts
each report into an AI-generated audio summary.

The customisation layer is the core product value — how precisely a user can
shape what appears in their report is the whole point. Treat it as the priority,
not an afterthought.

## Owner context

- Comfortable with Claude.ai and Claude Code; **prefers minimal coding** where
  possible — favour clear, maintainable solutions over clever ones, and explain
  tradeoffs rather than silently picking.
- Has already built an email cleaner agent with Trigger.dev + Composio +
  Anthropic, so the orchestration pattern is familiar ground. Lean on that.
- UI is **primarily for iPhone use**. Design every screen mobile-first.

## Tech stack (decided — do not relitigate)

| Layer | Choice |
|-------|--------|
| Frontend | React + Vercel (PWA — manifest + service worker from day one) |
| Database + storage | Supabase (Postgres + Storage + Auth) |
| Scheduling / orchestration | Trigger.dev |
| News fetching | **Perplexity API** (`sonar-pro`) — chosen over NewsAPI for richer synthesised inputs and no scraping layer |
| Report generation + podcast script | Anthropic API (Claude) |
| Text-to-speech | **OpenAI `gpt-4o-mini-tts`** (only). ElevenLabs trialled + dropped; dormant code kept behind a flag in `trigger/src/lib/tts.ts`. Podcast audio is assembled through ffmpeg (uniform re-encode) |
| Email delivery | Composio + Gmail — DEPRIORITISED, not in MVP |
| Auth | Supabase Auth, multi-user. Magic link + optional Google OAuth |

## Key product decisions (already made)

- **Multi-user** from day one, Supabase Auth, RLS on every table.
- **Weekday cadence** — automatic briefs Mon–Fri only; Monday's brief sweeps up the weekend
  (wider news window). No Sat/Sun auto-briefs. On-demand "generate now" exists and works any day.
  ⚠️ **The cron is currently DISABLED for cost control** (BACKLOG Phase 0) — generation is on-demand
  only. Re-enable by restoring the `cron` in `daily-report.ts` AND setting `ENABLE_DAILY_CRON=true`
  in the Trigger env.
- **Text-to-speech: OpenAI only** (`gpt-4o-mini-tts`). ElevenLabs was trialled and dropped (not
  worth the cost); its code path is kept dormant in `trigger/src/lib/tts.ts` behind a flag.
- **Podcast generation is an explicit user action**, never automatic — it is the most expensive step.
  The app requests it per report via `POST /api/podcast`; `generate-report` no longer chains into it.
- **Synthesis model** — Opus 4.8 (`MODELS.synthesis`). Sonnet 4.6 was tried as a cost saving and
  reverted — it stubbed sections on primer-heavy first briefs. Worth revisiting only with a proper
  before/after on quality.
- Audio stored in **Supabase Storage**, private bucket, namespaced
  `podcast-audio/{user_id}/{report_id}.mp3`.
- **One Perplexity query per topic** (not one composite). This determines report
  quality — the owner explicitly wants to design these prompts together in
  detail. Do NOT rush the query-generation logic; flag it for collaborative work.
- App Store path: build PWA-first; wrap with Capacitor later if needed. No code
  changes required for that, so don't pre-optimise for it.

### Topic model
1. **Genre** — a CONTAINER, not a section. User picks up to 5 genres to browse; a genre alone
   produces nothing. (Changed after user testing — genres used to become broad sections too, which
   inflated topic counts.)
2. **Subtopics** — chosen within a genre; these ARE report sections.
3. **Custom interests** — free-text natural language; also sections. At pipeline time a cheap Claude
   call translates each into a Perplexity search query, interpreted fresh each run so it stays topical.

A brief = subtopics + custom interests only (see `planReportSections`). **Hard cap of 4 total topics**
(`MAX_SECTIONS` in `shared/plan-topics.ts`, re-exported as `MAX_TOPICS` for the UI) with a live count.
The cap is enforced in the SHARED planner, so the pipeline can't exceed it either — every section is a
paid Perplexity query plus synthesis tokens. (Was 8; dropped to 4 for cost control, BACKLOG Phase 0.)

Plus: **exclusions** (free text, injected into the Claude summarisation prompt) and
**delivery_hour** (UTC). The `max_topics`, `report_mode` and `voice` columns are now unused.

### Report length + tone — REMOVED (2026-09)
Length (`briefing` / `standard` / `deep_dive`) and voice (`neutral` / `analytical` /
`conversational` / `critical`) used to be user preferences. Removed because they earned nothing a
reader noticed and widened the surface the demo had to explain. Synthesis is now FIXED at standard
length and an analytical tone, baked into the prompt. The podcast script is, as before, always
conversational.

The `report_mode` and `voice` columns are left in the table UNUSED rather than dropped — same as
`max_topics`. Dropping is irreversible and buys nothing.

## Repo structure

```
daily/
├── CLAUDE.md                  # this file
├── README.md                  # the public one — what this is, and why each choice
├── BACKLOG.md                 # execution order; work top to bottom, do not jump phases
├── apps/web/                  # React PWA → Vercel
│   ├── src/{pages,components,hooks,lib,auth}/
│   ├── api/                   # Vercel serverless functions (generate, podcast, suggest)
│   └── public/landing/        # the landing page — served at / ; the app lives at /app
├── trigger/src/               # Trigger.dev pipeline (separate deploy)
│   ├── jobs/                  # one file per stage + the cron + the demo seeders
│   ├── lib/                   # Perplexity, Anthropic, TTS, audio assembly, concurrency
│   └── fixtures/              # demo + TTS-test data
├── supabase/migrations/       # 0001–0014; schema, RLS, storage
├── shared/                    # types + the topic planner, used by BOTH app and pipeline
├── e2e/                       # Playwright, run against the deployed app
└── docs/                      # architecture diagram + design/ (Claude Design exports)
```

`shared/` matters: `plan-topics.ts` is the one function that decides what a brief
contains, so the app's preview and the pipeline's real section list cannot drift.

## Current state

**Everything below is built, deployed and covered by the e2e suite.** The app is live
on Vercel, the pipeline is deployed to Trigger.dev, and a public demo account serves
seeded briefs with all paid calls gated off.

- **Data** — 14 migrations. RLS on every table; reports and podcasts are read-only from
  the frontend, the pipeline writes as service_role. Private `podcast-audio` bucket.
- **Pipeline** — `fetch-news` (Perplexity, one query per topic, shared per-day cache) →
  `generate-report` (Opus synthesis, primers, "while you were away" recaps) →
  `generate-podcast` (Sonnet script, OpenAI TTS, ffmpeg assembly). `daily-report` is the
  cron orchestrator. Plus `seed-demo-briefs`, `reset-demo`, `seed-test-episode`.
- **App** — auth, bottom nav, Today / History / Report / Preferences / Profile, the setup
  wizard, and the docked podcast player.
- **Shopfront** — landing page at `/landing/`, architecture diagram, README.

Schema is the source of truth. If you change a table, update BOTH the migration AND
`shared/types.ts` in the same change.

Two things are deliberately OFF, for cost, not because they are broken: the weekday cron
(see the note above) and automatic podcast generation. Do not switch either on to "fix"
something.

## What to work on next

**Read `BACKLOG.md` — it is the ordered plan and it overrides any stale list here.**
It is written around one goal: this is a portfolio artifact, so nothing in the demo path
may trigger a paid API call, and a visitor must never need an account.

## How to make changes without touching the demo

The demo is not a separate app: it is the demo account signed into the same app, code and
database. So:

- **Work on a branch, never directly on `main`.** Each branch gets a private Vercel preview, and the
  e2e suite runs against it automatically. Merge only when it is green.
- **Database changes go live the moment they are run in Supabase**, whatever the branch, and there
  is one database. Keep them additive (new columns with defaults, new tables) — no renames or drops.
- **Previews use the real database.** Testing on the owner's account there writes real data.
- **Anything that changes report format must still render the four frozen demo briefs.**
- **A feature wanted live but not in the demo** — gate it on `prefs.is_demo`.

## Conventions

- TypeScript everywhere. Import shared types from `shared/types.ts`; never
  redefine schema shapes locally.
- Pipeline code uses the Supabase **service_role** key (server-side only, never
  shipped to client). Frontend uses the **anon** key.
- Secrets via env vars — never hardcode. Expected:
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `OPENAI_API_KEY`,
  `ELEVENLABS_API_KEY` (optional — enables the ElevenLabs voice path; falls back to OpenAI TTS if unset).
- Mobile-first CSS always — single column, bottom nav, thumb-zone actions.
- `delivery_hour` is UTC in the DB; convert to/from local time in the UI.
- When adding a pipeline step, make it idempotent and safe to retry (Trigger.dev
  may re-run). Check report `status` before regenerating.
- Keep each build phase's work coherent; don't jump ahead across phases.

## Anthropic API notes

- Use Claude for: Level 3 interest → query translation (cheap, fast call),
  report synthesis, and podcast script rewriting.
- Keep the query-translation call small and cheap; keep synthesis on a stronger
  model. Make the model choice a config constant so it's easy to tune.

## When in doubt

Surface tradeoffs to the owner rather than guessing — especially on anything
touching report quality (Perplexity prompts, synthesis prompts). The owner
wants to be hands-on with those.
