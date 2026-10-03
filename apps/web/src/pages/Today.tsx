import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useLatestReport } from "../hooks/useLatestReport";
import { usePreferences } from "../hooks/usePreferences";
import { requestTodayBrief, requestPodcast } from "../lib/api";
import { markPending, readPending, clearPending } from "../lib/pending-generation";
import { formatDeliveryHour } from "../lib/delivery-time";
import {
  formatReportDate,
  formatReportDateInline,
  greeting,
  displayName,
  estimateReadMinutes,
  snippet,
} from "../lib/report-format";
import { usePlayer } from "../player/PlayerProvider";
import type { PlayerEpisode } from "../player/PlayerProvider";
import { PlayIcon } from "../components/ui/icons";
import { RecapCard } from "../components/RecapCard";
import { Coachmarks } from "../components/Coachmarks";

// If an on-demand generation hasn't landed in this long of FOREGROUND time (background time is
// excluded — see the visibility handler), stop waiting and show an error + retry. Generous, since
// the first all-primer run is the slowest; real failures surface faster via a failed report.
const GEN_TIMEOUT_MS = 8 * 60 * 1000;

// A demo visitor never watches a brief being written, because the demo's briefs already exist. Play
// the real compiling screen briefly on arrival so that part of the product isn't invisible to them.
const DEMO_INTRO_KEY = "demo-intro-played";
const DEMO_INTRO_MS = 2600;

export function Today() {
  const { user } = useAuth();
  const { report, lastComplete, episode, loading, refetch } = useLatestReport();
  // The brief actually shown. Usually the newest report; when that one failed or is still
  // being written, the most recent readable one instead.
  const brief = lastComplete;
  const { prefs, loading: prefsLoading, markTipsSeen } = usePreferences();
  const { play } = usePlayer();
  const navigate = useNavigate();

  // Initialise from the reload bridge: if an on-demand generation was just kicked off (record still
  // fresh), resume the compiling state even though React state was lost on reload. Read once.
  const bridge = useMemo(() => readPending(), []);
  const [generating, setGenerating] = useState<boolean>(bridge != null);
  const [genError, setGenError] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(bridge?.at ?? null);
  // created_at of the report we superseded when we kicked off — lets us tell this run's failure
  // apart from a stale one (server-vs-server, immune to clock skew and the visibility bump).
  const [baseline, setBaseline] = useState<string | null>(bridge?.baseline ?? null);
  // Optimistic flag covering the gap between asking for a podcast and its episode row appearing.
  const [podcastStarting, setPodcastStarting] = useState(false);
  // The reason the LAST attempt failed, straight from the server. Preferred over the message stored
  // on an older failed record, which otherwise gets shown for an unrelated new failure.
  const [genErrorMessage, setGenErrorMessage] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);

  const [introDone, setIntroDone] = useState(false);
  // Decided ONCE, in the first render where preferences are known. Deciding inside an effect would
  // land a frame too late and flash the brief before replacing it with the loading screen.
  const playIntro = useRef<boolean | null>(null);
  if (playIntro.current === null && !prefsLoading) {
    let alreadyPlayed = true;
    try {
      alreadyPlayed = sessionStorage.getItem(DEMO_INTRO_KEY) !== null;
      if (!alreadyPlayed) sessionStorage.setItem(DEMO_INTRO_KEY, "1");
    } catch {
      alreadyPlayed = true; // storage unavailable — skip the flourish rather than risk a stuck screen
    }
    playIntro.current = !!prefs?.is_demo && !alreadyPlayed;
  }
  const showDemoIntro = playIntro.current === true && !introDone;

  const waiting =
    generating || report?.status === "pending" || report?.status === "generating";

  // Timeout is measured from the local click; after a reload where only the reports row survives,
  // fall back to when that row started generating so the timeout still applies.
  const reportStart =
    (report?.status === "generating" || report?.status === "pending") && report?.created_at
      ? Date.parse(report.created_at)
      : null;
  const effectiveStart = startedAt ?? reportStart;

  // A failed report is THIS run's failure only once fetch-news (re)claimed its row — i.e. once its
  // created_at differs from the row we superseded. When we're not mid-generation (startedAt null)
  // any failed row is the failure to show; while a retry is in flight a stale failed row (created_at
  // still == baseline) is ignored until the run claims it.
  const failedIsCurrent =
    report?.status === "failed" &&
    (startedAt == null || report.created_at !== baseline);

  // A requested podcast is on its way. This REQUIRES an episode row: now that generation is never
  // automatic, "no episode" means "not asked for yet" rather than "coming soon" — otherwise the
  // loading card (and its poll) would spin forever on every brief.
  const podcastPending =
    !!prefs?.podcast_enabled &&
    !!brief &&
    !!episode &&
    (episode.status === "pending" || episode.status === "generating");

  // Offer to make one once the brief is done and there's no episode yet (or the last try failed).
  const canMakePodcast =
    !!prefs?.podcast_enabled && !!brief && (!episode || episode.status === "failed");

  // A failure is worth reporting, but it should never cost access to briefs already in hand.
  const failureMessage =
    genErrorMessage ?? (report?.status === "failed" ? report.error_message : undefined);
  const showFailure = (genError || (timedOut && waiting) || failedIsCurrent) && !errorDismissed;

  // Drop the optimistic flag once the brief actually completes.
  useEffect(() => {
    if (report?.status === "complete") setGenerating(false);
  }, [report?.status]);

  // Once the reports row reflects THIS run it drives the compiling state, so retire the bridge flag
  // — but not on a stale 'failed' row, so the bridge survives a retry until the run claims it.
  useEffect(() => {
    if (report && report.status !== "failed") clearPending();
  }, [report]);

  // Stop treating a run as in-progress once its own failure surfaces (also stops polling).
  useEffect(() => {
    if (failedIsCurrent) setGenerating(false);
  }, [failedIsCurrent]);

  // Poll while a brief is compiling, or while a requested podcast is still being generated.
  useEffect(() => {
    if (!waiting && !podcastPending && !podcastStarting) return;
    const t = setInterval(() => void refetch(), 4000);
    return () => clearInterval(t);
  }, [waiting, podcastPending, podcastStarting, refetch]);

  // Once the episode row exists its real status drives the UI — drop the optimistic flag.
  useEffect(() => {
    if (episode) setPodcastStarting(false);
  }, [episode]);

  useEffect(() => {
    if (!showDemoIntro) return;
    const t = setTimeout(() => setIntroDone(true), DEMO_INTRO_MS);
    return () => clearTimeout(t);
  }, [showDemoIntro]);

  // Safety net: if a generation never lands, stop waiting and surface an error.
  useEffect(() => {
    if (!waiting || effectiveStart == null) return;
    const remaining = GEN_TIMEOUT_MS - (Date.now() - effectiveStart);
    if (remaining <= 0) {
      setTimedOut(true);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), remaining);
    return () => clearTimeout(t);
  }, [waiting, effectiveStart]);

  // Returning from background (tab hidden / phone locked) leaves timers frozen and state stale.
  // Re-poll and restart the timeout window so background time isn't counted as "stalled".
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && waiting) {
        setTimedOut(false);
        setStartedAt(Date.now());
        void refetch();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [waiting, refetch]);

  async function generateNow() {
    const baselineCreatedAt = report?.created_at ?? null;
    setGenError(false);
    setGenErrorMessage(null);
    setErrorDismissed(false);
    setTimedOut(false);
    setStartedAt(Date.now());
    setBaseline(baselineCreatedAt);
    setGenerating(true);
    markPending(baselineCreatedAt);
    try {
      await requestTodayBrief();
    } catch (err) {
      setGenerating(false);
      setGenError(true);
      setGenErrorMessage(err instanceof Error ? err.message : null);
      clearPending();
    }
  }

  // Explicit, user-initiated podcast generation — never automatic, since audio is the most
  // expensive step in the pipeline.
  async function makePodcast() {
    if (!brief) return;
    setPodcastStarting(true);
    try {
      await requestPodcast(brief.id);
    } catch {
      setPodcastStarting(false);
    }
  }

  // Waits for preferences too: the demo intro needs to know whether this is the demo, and deciding
  // after the brief has rendered would show content and then snatch it away.
  if (loading || prefsLoading) {
    return <Centered>Loading your brief…</Centered>;
  }

  if (showDemoIntro) return <CompilingBrief />;

  // A failure with no earlier brief to fall back on still takes the screen - there is genuinely
  // nothing else to show. Otherwise it appears as a dismissible notice above the last good brief.
  if (showFailure && !brief) {
    return <GenerateError onRetry={generateNow} message={failureMessage} />;
  }

  if (waiting && !showFailure) {
    return <CompilingBrief />;
  }

  if (!brief) {
    return <EmptyState deliveryHour={prefs?.delivery_hour} onGenerate={generateNow} />;
  }

  if (!brief.content) {
    return <CompilingBrief />;
  }

  const sections = brief.content.sections;
  const name = displayName(user);
  // The screen shows the latest brief whatever its date, and with the daily schedule switched off
  // nothing else will produce a new one — so when the latest isn't today's, offer to fetch it.
  // UTC, to match the date the server stamps on a brief. Never for the demo: it can't generate, and
  // its briefs are meant to look like any reader's latest edition. Not alongside a failure either —
  // that notice already carries its own "Try again".
  const todayUtc = new Date().toISOString().slice(0, 10);
  const offerToday = !prefs?.is_demo && brief.date !== todayUtc && !showFailure;
  const minutes = estimateReadMinutes(sections.map((s) => s.summary));
  const playable: PlayerEpisode | null =
    episode?.status === "complete" && episode.audio_url
      ? {
          episodeId: episode.id,
          reportId: brief.id,
          date: brief.date,
          audioPath: episode.audio_url,
          durationSeconds: episode.duration_seconds,
          chapters: episode.chapters ?? [],
        }
      : null;

  return (
    <section className="px-6 pb-12 pt-6">
      {showFailure && (
        <div className="mb-5 flex flex-col gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5">
          <div>
            <p className="text-[13.5px] font-semibold">That brief didn&rsquo;t come through</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
              {failureMessage || "Something went wrong while generating it."}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void generateNow()}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--on-accent)]"
            >
              Try again
            </button>
            <button
              onClick={() => setErrorDismissed(true)}
              className="px-3 py-2 text-[13px] font-semibold text-[var(--muted)]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {offerToday && (
        <div
          data-stale-brief
          className="mb-5 flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold">
              This brief is from {formatReportDateInline(brief.date)}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
              Today&rsquo;s takes about 3&ndash;4 minutes to write.
            </p>
          </div>
          <button
            onClick={() => void generateNow()}
            className="flex-none rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--on-accent)] active:opacity-80"
          >
            Get today&rsquo;s
          </button>
        </div>
      )}

      <span className="text-[12px] font-semibold uppercase tracking-[1.8px] text-[var(--muted)]">
        {formatReportDate(brief.date)}
      </span>
      <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight">
        {greeting()}
        {name ? `, ${name}` : ""}
      </h1>
      <span className="mt-2 block text-[13.5px] text-[var(--muted)]">
        Your brief · {sections.length} {sections.length === 1 ? "topic" : "topics"} · {minutes} min read
      </span>

      {brief.content.recap && (
        <div className="mt-5" data-tour="recap">
          <RecapCard recap={brief.content.recap} />
        </div>
      )}

      {playable ? (
        <button
          onClick={() => void play(playable)}
          data-tour="podcast"
          className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left"
        >
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_3px_9px_rgba(192,81,43,0.34)]">
            <PlayIcon />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-semibold">Listen to today's brief</span>
            <span className="text-[12.5px] text-[var(--muted)]">
              {playable.durationSeconds
                ? `${Math.max(1, Math.round(playable.durationSeconds / 60))} min`
                : "Audio"}{" "}
              · AI narration
            </span>
          </span>
          <span className="flex h-[22px] items-end gap-[2.5px]">
            {[8, 15, 21, 12, 7].map((h, i) => (
              <span key={i} className="w-[2.5px] rounded bg-[var(--accent)]/50" style={{ height: h }} />
            ))}
          </span>
        </button>
      ) : podcastPending || podcastStarting ? (
        <div
          data-tour="podcast"
          className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"
        >
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[var(--accent)]/12">
            <span className="flex h-4 items-end gap-[2px]">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-full w-[2px] origin-bottom rounded-full bg-[var(--accent)]"
                  style={{ animation: `equalize 0.9s ease-in-out ${i * 0.15}s infinite` }}
                />
              ))}
            </span>
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-semibold">Preparing your podcast…</span>
            <span className="text-[12.5px] text-[var(--muted)]">The audio version is on its way</span>
          </span>
        </div>
      ) : canMakePodcast ? (
        <button
          onClick={() => void makePodcast()}
          data-tour="podcast"
          className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-3 text-left active:opacity-70"
        >
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
            <MicIcon />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-semibold">
              {episode?.status === "failed" ? "Try the podcast again" : "Make today's podcast"}
            </span>
            <span className="text-[12.5px] text-[var(--muted)]">
              A conversational audio version · takes a couple of minutes
            </span>
          </span>
        </button>
      ) : null}

      <div className="mt-5 flex flex-col">
        {sections.map((s, i) => (
          <button
            key={i}
            onClick={() => navigate(`/report/${brief.date}#s${i}`)}
            data-tour={i === 0 ? "topic" : undefined}
            className="flex flex-col gap-2 border-t border-[var(--line)] py-5 text-left transition-opacity active:opacity-60"
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--accent)]" />
              <span className="text-[11.5px] font-semibold uppercase tracking-[1.4px] text-[var(--muted)]">
                {s.category ?? "For you"}
              </span>
              {s.isPrimer && (
                <span className="rounded-full bg-[var(--accent)]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
                  New topic
                </span>
              )}
            </div>
            <h2 className="text-[20px] font-semibold leading-snug tracking-tight">{s.topic}</h2>
            <p className="hyphens-auto text-justify text-[15px] leading-relaxed text-[var(--ink)]/85">
              {snippet(s.summary)}
            </p>
            {s.sources.length > 0 && (
              <span className="text-[12.5px] text-[var(--faint)]">
                {s.sources.length} {s.sources.length === 1 ? "source" : "sources"}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contextual coach marks — fire once the first brief is on screen (real elements to point at).
          Recap + podcast tips are conditional: they only appear when those cards are actually here. */}
      {prefs && !prefs.is_demo && (
        <Coachmarks
          seen={prefs.tips_seen ?? []}
          onSeen={markTipsSeen}
          tips={[
            {
              key: "today-brief",
              target: '[data-tour="topic"]',
              title: "This is your brief",
              body: "Each card is a topic you chose, rewritten from today's news. Tap any card to read it in full.",
            },
            {
              key: "today-recap",
              target: '[data-tour="recap"]',
              enabled: !!brief.content.recap,
              title: "While you were away",
              body: "When you've been away, your brief opens with a quick catch-up on what you missed.",
            },
            {
              key: "today-podcast",
              target: '[data-tour="podcast"]',
              enabled: !!playable,
              title: "Listen, don't just read",
              body: "Your brief as a conversation — tap to play, or expand it for chapters and speed.",
            },
          ]}
        />
      )}
    </section>
  );
}

function EmptyState({
  deliveryHour,
  onGenerate,
}: {
  deliveryHour: number | undefined;
  onGenerate: () => void;
}) {
  return (
    <Centered>
      <h1 className="text-[22px] font-bold tracking-tight">You're all set</h1>
      <p className="mt-2 max-w-[280px] text-[14px] leading-relaxed text-[var(--muted)]">
        Your first brief will land{" "}
        {deliveryHour != null ? (
          <>
            tomorrow at{" "}
            <span className="font-semibold text-[var(--ink)]">{formatDeliveryHour(deliveryHour)}</span>
          </>
        ) : (
          "tomorrow morning"
        )}
        . Want to see it now?
      </p>
      <button
        onClick={onGenerate}
        data-tour="generate"
        className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[14.5px] font-semibold text-[var(--on-accent)] shadow-[0_4px_12px_rgba(192,81,43,0.32)] active:opacity-80"
      >
        Generate today's brief
      </button>
      <p className="mt-3 text-[12px] text-[var(--faint)]">Takes about 3–4 minutes.</p>
    </Centered>
  );
}

function MicIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v3" />
    </svg>
  );
}

function LoadingBars() {
  return (
    <div className="flex h-8 items-end gap-[3.5px]" role="status" aria-label="Compiling">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="h-full w-[3.5px] origin-bottom rounded-full bg-[var(--accent)]"
          style={{ animation: `equalize 0.9s ease-in-out ${i * 0.12}s infinite` }}
        />
      ))}
    </div>
  );
}

function CompilingBrief() {
  return (
    <Centered>
      <LoadingBars />
      <h1 className="mt-5 text-[22px] font-bold tracking-tight">Compiling your brief…</h1>
      <p className="mt-2 max-w-[280px] text-[14px] leading-relaxed text-[var(--muted)]">
        Gathering today's news and writing it up — this usually takes about 3–4 minutes, and it'll
        appear here on its own. You can leave this screen; it'll be here when you're back.
      </p>
    </Centered>
  );
}

function GenerateError({ onRetry, message }: { onRetry: () => void; message?: string | null }) {
  return (
    <Centered>
      <h1 className="text-[22px] font-bold tracking-tight">That didn't come through</h1>
      <p className="mt-2 max-w-[280px] text-[14px] leading-relaxed text-[var(--muted)]">
        {message || "Your brief didn't finish generating — it may have stalled. Give it another go."}
      </p>
      <button
        onClick={onRetry}
        className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[14.5px] font-semibold text-[var(--on-accent)] shadow-[0_4px_12px_rgba(192,81,43,0.32)] active:opacity-80"
      >
        Try again
      </button>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">{children}</div>
  );
}
