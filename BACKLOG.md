# BACKLOG.md — Daily

Execution ordered backlog. Work top to bottom. Do not jump phases.

## The goal this backlog serves

Daily is going on a CV. The target is not a production SaaS; it is an
artifact that proves competence to a recruiter who will look at it for ninety
seconds and then move on.

The test: a recruiter clicks a link and within two minutes understands what was
built, how it works, and that the author can take an AI system from idea to
running software.

Anything that does not serve that test is deferred, however interesting it is.
Billing, source selection, robustness, and polish beyond the demo path are all
out of scope until applications are sent.

Two constraints shape everything below:

1. **Cost.** API spend currently exhausts the budget with two or three users.
   Nothing in the demo path may trigger a paid API call.
2. **Access.** A recruiter will not create an account. The demo must require no
   email, no signup, and no waiting on a magic link.

---

## Phase 0 — Stop the token burn

Do this first. It is the only item actively costing money right now.

* [x] Disable the weekday cron. Live testers switch to on demand generation only.
* [x] Drop the default section cap from 8 to 4.
* [x] Make podcast generation an explicit user action, never automatic.

Notes: the cron is generating briefs for users who may never open the app. That
is the bulk of the spend. Turning it off solves most of the problem on its own.

---

## Phase 1 — Know what was built

Do this before seeding demo content. Seeding forces a walk through the whole
app, and that is much easier once every feature is understood.

* [x] Read the code for the **primer** feature. Write one plain sentence
      describing what it does. Add it to this file under "Feature glossary".
* [x] Do the same for any other feature that could not be explained under
      questioning. Candidates: "what you missed" recap, chapter generation,
      local time delivery handling.
* [x] Scan the **full git history** for secrets, not just the working tree.
      Keys removed in a later commit are still present in history.

Scan result (2026-09-18): clean across all 85 commits. No provider key prefixes
anywhere in history (OpenAI, Anthropic, Perplexity, Trigger, Stripe, AWS,
GitHub) and no Supabase JWTs. The only env files ever committed are the two
`.env.example` templates, both with empty values. `.gitignore` covers `.env` and
`.env.*` with an exception for the examples. No history rewrite is needed before
publishing in Phase 5.

Rationale: an interviewer asking "what does this do" and getting a vague answer
costs more than a missing feature ever would.

---

## Phase 2 — Demo mode

Approach: **reuse the existing app, do not fork it.** A parallel build drifts,
doubles every fix, and stops resembling the real product within a week. One
codebase that knows when it is being shown to a stranger.

* [x] Create a single demo user in the existing Supabase project.
* [x] Seed 3 to 4 briefs across varied topic sets, so the demo shows range
      (e.g. one tech heavy, one geopolitics, one mixed with custom interests).
* [x] Generate and store one podcast episode for the demo account, audio already
      in the storage bucket.
* [x] Add an `is_demo` flag on the user or preferences record.
* [x] Gate **every paid API call** behind that flag in one place, not scattered
      through the codebase. Blocked for demo: "Generate now", podcast
      generation, any cron inclusion. If the credentials leak and someone
      hammers the button, nothing should happen.
* [x] Build the "View demo" sign in path using fixed credentials, not magic
      link. These credentials are effectively public; that is acceptable.
* [x] Add a persistent demo banner: sample briefs, generation disabled.
* [x] Nightly Trigger.dev job to reset demo preferences to a clean state.

Design decision: preferences remain **editable** in demo mode. Customisation is
the core of the product and a recruiter should be able to click through genres,
subtopics, and custom interests. Existing RLS already makes reports and podcast
episodes read only from the frontend, so preferences are the only writable
surface.

Failure mode to avoid: a visitor edits preferences, presses a dead generate
button, and concludes the app is broken. Handle with banner copy, not logic.

---

## Phase 2.5 — Test the demo path

Scoped deliberately: the paths a recruiter will walk are the ones that must not
break. This is not general test coverage.

* [x] Playwright suite covering the demo path end to end: demo sign in, brief
      renders, history navigation, preferences editing, audio player docks and
      expands.
* [x] Assert the `is_demo` gate holds, at the level that actually protects the
      budget: signed in as the demo user, POST /api/generate and POST
      /api/podcast must return a refusal. A browser cannot observe "no paid call
      happened", and asserting only that the UI hides a button proves nothing,
      because the credentials are public and the endpoints can be hit directly.
* [x] Exploratory pass with Claude Code driving the browser, hunting broken
      states rather than following a script. Reachable by driving the UI: empty
      history, user with zero topics, very long custom interest strings.
* [x] Seed the states that cannot be reached by clicking as database rows, then
      assert the UI renders them: a report stuck in `generating`, a podcast
      episode marked `failed`. Demo mode blocks generation by design, so these
      cannot be produced through the app, and producing them for real would
      defeat Phase 0.
* [x] Wire the suite into CI, running against the deployed Vercel URL rather
      than a local dev server. Nothing to reproduce in CI, and it exercises the
      same thing a recruiter hits. Demo credentials in CI secrets are fine,
      being public by design.

Two reasons this sits before Phase 3 rather than in the deferred list. The demo
account will be seen in states never looked at personally, and a repo with tests
and a passing CI badge is one of the few things a technically inclined reviewer
will actually check.

Keep the assertions coarse: does it render, does it navigate, does the player
dock. A red badge on a public repo is worse than no badge, so nothing timing or
pixel sensitive, and nothing outside the demo path.

Expect this phase to feed Phase 3 rather than cleanly precede it. An exploratory
pass hunting broken states is how the Phase 3 list grows.

Result: 15 tests, green against the deployed app. The suite earned its keep on the
first run by catching all three API endpoints returning FUNCTION_INVOCATION_FAILED -
a real outage nobody had noticed, because the demo has no generate button and
suggest-subtopics fails silently into its fallback list. Cause: `apps/web` is an ES
module project, and Node ESM cannot resolve an extensionless relative import, so every
route importing `./_lib/...` died at module load. suggest-subtopics had been broken
since it was written.

The states that cannot be clicked into are covered by stubbing database responses
rather than writing rows, so CI needs no service-role key and the live demo is never
disturbed.

Explicitly **not** doing: an autonomous agent that recurrently tests the app and
proposes new features. It has no access to how real users behave, so it would
reproduce existing assumptions rather than break them, which is the only thing
that makes user testing worth doing. It would also trigger paid API calls, which
Phase 0 exists to stop. If agent driven testing is interesting in itself, build
it later as a separate project where the agent is the point.

For real user insight at two or three testers: add basic event logging (topics
chosen, podcast opened, where sessions end, return after first brief) and ask
them directly what confused them. Both beat simulation at this scale.

---

## Phase 3 — UX fixes visible in the demo

Only fixes a demo visitor will actually see. Everything else waits.

* [x] Remove style and tone options from the settings page.
* [x] Fix the catch up icon on new topics. Relabel to "New topic". Add a bubble.
* [x] Add a bubble for the "what you missed" feature, first occurrence only.
      Skip if it does not surface in the demo flow.
* [x] Glass treatment on floating surfaces only: mini player, bottom nav, coach
      mark bubbles, edit sheet. Tailwind already ships backdrop blur, so no new
      dependency. Deliberately not a wholesale restyle, which would fight the
      warm paper palette. Worth doing because it lands in the screenshots and
      the recording, which is what a recruiter actually sees.

Note: the two bubble items were dropped rather than built. Coach marks are switched
off for demo visitors, who arrive already briefed by the landing page, so a bubble no
visitor will see earns nothing before applications go out. The relabel was done,
because that one is visible.

The glass treatment was built, looked at on a real phone, and reverted. The palette is
white cards on near-white paper, so a translucent surface has almost no contrast behind
it to reveal: invisible at sensible opacity, washed out at the opacity where it finally
showed. Glass reads over dark or vibrant backgrounds, and this app is warm editorial
paper. Recorded here as a decision rather than quietly dropped - a reviewer asking "did
you consider a more modern visual treatment" gets a real answer.

---

## Phase 4 — The shopfront

The landing page becomes the CV link, not the app itself. A recruiter needs
framing before they need the product.

* [x] Architecture diagram. This carries more weight than the running app: it
      shows a multi stage pipeline across orchestration, retrieval, synthesis,
      and audio generation in three seconds.
* [ ] Short screen recording (roughly 15 to 30 seconds) covering the brief view
      and the podcast player docking. Nobody will sit and listen to audio in a
      browser tab; a clip communicates it instantly.
* [x] Landing page: problem, screenshots, and a single **Try the demo** button.
      The architecture diagram and the stack were built into this page first, then
      moved to the README — see the note below.
* [x] Domain decision: resolved WITHOUT buying one. The paid domains worth
      having were taken or not worth the money, so the project moved to
      `dailyeditionapp.vercel.app` ("edition" is the word the app and landing
      page already use), and the landing page now serves at the ROOT with the
      app at `/app`. The CV link is the bare address.
      Note for later: the Vercel config that is actually read is
      `apps/web/vercel.json`, not the repo root — the project's root directory
      is `apps/web`. It must use `routes`, not `rewrites`, or the root keeps
      serving the app. See `apps/web/src/lib/routes.ts`.

---

## Phase 5 — GitHub

* [x] Write the README. This is the deliverable, not the code. Most readers will
      read the README and skim two files. It carries:
      * the architecture diagram
      * the pipeline explanation, stage by stage
      * reasoning behind each stack choice (why Perplexity over NewsAPI, why
        Trigger.dev, why Supabase)
      * an honest roadmap of what is not built yet
* [x] Light tidy only: dead code, naming, folder coherence. **No refactors.**
      Legible and honestly described beats immaculate.
* [x] Publish the repository. Public at github.com/PedroColombas/daily.
      Checked first, because it cannot be undone: no API keys anywhere in the
      history, and the demo spending gate green against production.
* [x] **Wire the "View the code" button.** The button is already on the landing
      page, next to "Try the demo", and now points at the repo. It was
      deliberately inert until publication, because a link to a private repo
      404s — worse than a button that does nothing. `landing.spec.ts` asserts it
      is either unlinked or pointing at a real github.com URL, so a half-wired
      version fails CI rather than shipping.

Note on where the technical content lives. The architecture diagram, the stack
reasoning and the "not built yet" list were built into the landing page first and
then moved here, to the README. Two audiences, two documents: the landing page
sells the product to someone deciding whether to click the demo, and a pipeline
diagram in the middle of that interrupts it. A reader who wants to know how it
works is already willing to open a repo. The diagram now lives in `docs/`.

The roadmap section is where user selected sources and billing belong. Listing
them reads as product judgement, not as a gap.

---

## Phase 6 — Apply

* [ ] Point the CV link at the landing page, not the app.
* [ ] LinkedIn updates.

---

## Deferred until applications are out

Not abandoned. Just not before the CV goes out.

* User selected Perplexity sources (genuinely interesting design work; belongs
  in the README roadmap)
* Stripe billing
* Full coding best practice audit
* Full design and UX audit
* Dedicated staging environment (Vercel preview deployments per branch already
  cover this in practice)
* n8n. It is a visual workflow automation tool in the same category as
  Trigger.dev for these purposes. Rebuilding a working pipeline on it gains
  nothing a recruiter can see. Worth learning separately, on a different
  project, after applying.
* ElevenLabs voice upgrade
* Demo brief dates go stale. The seeded briefs are fixed to the days they were
  generated, so given enough time the demo shows dates from months back. Three
  ways out when it matters: shift the dates nightly (looks current, but the
  prose and the source dates do not move with them, so a careful reader sees
  the seam), re-seed for about a pound fifty, or simply name the month in the
  demo banner. The last is honest, free and cannot break.
* Podcast speed control, 0.5x to 1.5x in 0.1 steps. A standard feature, absent
  rather than broken, and the podcast is carried by the screen recording
  anyway. Small when it comes up: HTML audio has a playback rate built in.
* Autonomous testing agent that proposes features (see Phase 2.5 for reasoning)
* General test coverage beyond the demo path
* SwiftUI and Liquid Glass native rewrite. Not a refactor. SwiftUI is Apple's
  native framework, so this means rewriting the entire frontend in Swift, on a
  platform the pipeline never touches, and it needs a Mac and Xcode. It fails
  the access constraint outright: a native app cannot be opened from a CV link,
  and TestFlight or the App Store both put an account between the recruiter and
  the demo. It costs weeks rather than days, and it strengthens a mobile claim
  rather than the AI systems claim this artifact exists to make. Revisit only if
  the target roles become iOS ones, which would change the whole plan. The glass
  aesthetic itself is available on the web today and is handled in Phase 3.

---

## Feature glossary

One sentence per feature, written to be readable out loud in an interview.

* **Primer** — The first time you follow a topic it gets a catch-up rather than
  a news update: a wider month-long search window, a query asking for background
  and the current state of the field instead of the last day's headlines, and a
  synthesis prompt that orients a newcomer, fired once per topic per user and
  tracked in `user_topic_history`.
* **What you missed recap** — If briefs were generated while you were away and
  you never opened them, today's brief opens with a short catch-up condensed
  from exactly those briefs, keyed off what you have actually read
  (`report_reads`) rather than off elapsed time, and built from the stored
  reports so it costs no new research.
* **Chapters** — Every line of the podcast script is tagged with the report
  section it covers, which gives the player its jump points, stored as fractions
  of the script's total word count rather than timestamps because the real audio
  length is not known until it is rendered, so the player scales them to the
  actual duration on playback.
* **Local time delivery** — The delivery hour is stored as a whole hour in UTC
  so the hourly cron can match it directly, and the UI converts to and from the
  user's local hours on read and write, which keeps the round trip exact, with
  the accepted tradeoff that a fixed UTC hour drifts by an hour across a DST
  change.

---

## Timeline

* Phases 0 and 1: one evening
* Phase 2: two to three sessions, the substantial piece
* Phase 2.5: one session
* Phases 3 to 5: a few evenings
* Applications out inside two weeks

The version of this app that gets interviews is the one on the CV next month,
not the one that is production ready in March.
