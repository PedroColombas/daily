import { useState, type ReactNode } from "react";
import type { Language, Preferences as Prefs } from "@shared/types";
import { usePreferences } from "../hooks/usePreferences";
import { useLatestReport } from "../hooks/useLatestReport";
import { requestTodayBrief } from "../lib/api";
import { markPending } from "../lib/pending-generation";
import { DeliveryTimeSelect } from "../components/preferences/DeliveryTimeSelect";
import { TopicManager } from "../components/preferences/TopicManager";
import { Toggle } from "../components/ui/Toggle";
import { Coachmarks } from "../components/Coachmarks";
import { MAX_TOPICS } from "../lib/preferences-options";
import { useSetup } from "../lib/setup";
import { readTheme, applyTheme, type Theme } from "../lib/theme";
import { useLanguage } from "../i18n/LanguageProvider";
import type { Strings } from "../i18n/strings";

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-[1.1px] text-[var(--faint)]">
      {children}
    </span>
  );
}

export function Preferences() {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  function setTheme(next: Theme) {
    setThemeState(next);
    applyTheme(next);
  }

  const { prefs, loading, status, update, markTipsSeen } = usePreferences();
  const { t, lang, chooseLanguage } = useLanguage();
  const setup = useSetup();
  const { report } = useLatestReport();
  const [topicsChanged, setTopicsChanged] = useState(false);
  const [regen, setRegen] = useState<"idle" | "submitting" | "done">("idle");

  if (loading || !prefs) {
    return <div className="px-6 py-10 text-[14px] text-[var(--faint)]">{t.prefs.loading}</div>;
  }

  const statusLabel =
    status === "saving"
      ? t.prefs.saving
      : status === "saved"
        ? t.prefs.saved
        : status === "error"
          ? t.prefs.saveError
          : "";

  // Only prompt to regenerate when today's brief already exists and was built with the OLD topics.
  // If there's no brief yet (before delivery, or a fresh day), the changes apply on the next run.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const todayComplete = report?.date === todayUtc && report.status === "complete";

  // Wrap the topic manager's update: a change to the topic SET (add / edit / remove) means today's
  // brief is now stale, so offer to regenerate. A bare reorder (topic_order only) doesn't change
  // the news, so it stays silent — the new order just applies next run.
  const topicUpdate = (patch: Partial<Prefs>) => {
    const contentChange =
      "genres" in patch || "subtopics" in patch || "custom_interests" in patch;
    if (contentChange) {
      setTopicsChanged(true);
      if (regen === "done") setRegen("idle"); // a further edit re-opens the prompt
    }
    update(patch);
  };

  async function regenerate() {
    if (!report) return;
    setRegen("submitting");
    // Prime the reload bridge so Today shows the compiling state the instant the user switches to it
    // (before fetch-news reclaims the row), same as the first-run generate flow.
    markPending(report.created_at);
    try {
      await requestTodayBrief(true);
      setRegen("done");
    } catch {
      setRegen("idle"); // let them try again
    }
  }

  return (
    <section className="flex flex-col gap-7 px-5 pb-10 pt-7">
      <div className="flex items-baseline justify-between px-1">
        <h1 className="text-[28px] font-bold tracking-tight">{t.prefs.title}</h1>
        {statusLabel && (
          <span
            className={`text-[12.5px] font-medium ${
              status === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--faint)]"
            }`}
          >
            {statusLabel}
          </span>
        )}
      </div>

      {/* Your topics — each is a section; drag to reorder, tap to edit, or add */}
      <div className="flex flex-col gap-3" data-tour="prefs-topics">
        <div className="px-1">
          <SectionLabel>{t.prefs.topicsLabel}</SectionLabel>
          <p className="mt-1 text-[12.5px] text-[var(--muted)]">{t.prefs.topicsBlurb}</p>
          {prefs.is_demo && (
            <p className="mt-1.5 text-[12.5px] font-medium text-[var(--accent)]">{t.prefs.demoNote}</p>
          )}
        </div>
        {topicsChanged && todayComplete && (
          <RegenBanner
            state={regen}
            onRegenerate={regenerate}
            onDismiss={() => setTopicsChanged(false)}
          />
        )}
        <TopicManager prefs={prefs} update={topicUpdate} />
      </div>

      {/* Delivery time */}
      <div className="flex items-center justify-between px-1" data-tour="prefs-delivery">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14.5px] font-semibold">{t.prefs.deliveryTitle}</span>
          <span className="text-[12px] text-[var(--muted)]">{t.prefs.deliveryBlurb}</span>
        </div>
        <DeliveryTimeSelect
          valueUtc={prefs.delivery_hour}
          onChange={(delivery_hour) => update({ delivery_hour })}
        />
      </div>

      {/* Daily podcast */}
      <div className="flex items-center justify-between px-1" data-tour="prefs-podcast">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14.5px] font-semibold">{t.prefs.podcastTitle}</span>
          <span className="text-[12px] text-[var(--muted)]">{t.prefs.podcastBlurb}</span>
        </div>
        <Toggle checked={prefs.podcast_enabled} onChange={(podcast_enabled) => update({ podcast_enabled })} />
      </div>

      {/* Language — the app switches at once; briefs follow from the next one, since a brief is
          written once. Not offered in the demo, which is English-only: its briefs are. */}
      {!prefs.is_demo && (
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-[14.5px] font-semibold">{t.prefs.languageTitle}</span>
            <span className="text-[12px] text-[var(--muted)]">{t.prefs.languageBlurb}</span>
          </div>
          <LanguageSelect value={lang} onChange={(next) => void chooseLanguage(next, true)} />
        </div>
      )}

      {/* Appearance — a device setting, not an account one, so it is the one control on this page
          that is not backed by the preferences table. See lib/theme.ts. */}
      <div className="flex items-center justify-between px-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14.5px] font-semibold">{t.prefs.appearanceTitle}</span>
          <span className="text-[12px] text-[var(--muted)]">
            {theme === "system"
              ? t.prefs.followingDevice
              : theme === "light"
                ? t.prefs.alwaysLight
                : t.prefs.alwaysDark}
          </span>
        </div>
        <AppearanceSelect value={theme} onChange={setTheme} words={t.prefs} />
      </div>

      {/* Replay of the setup wizard — otherwise the screen that does the most to explain the
          product is only ever seen once, on a first run. */}
      {setup && (
        <button
          onClick={setup.openSetup}
          className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-3.5 text-left active:opacity-70"
        >
          <span className="block text-[14.5px] font-semibold">{t.prefs.replayTitle}</span>
          <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{t.prefs.replayBlurb}</span>
        </button>
      )}

      {/* Coach marks teach a returning user over time. A demo visitor arrives already briefed by
          the landing page and has about ninety seconds, so bubbles only get in their way. */}
      {!prefs.is_demo && (
        <Coachmarks
          seen={prefs.tips_seen ?? []}
          onSeen={markTipsSeen}
          tips={[
            {
              key: "prefs-topics",
              target: '[data-tour="prefs-topics"]',
              placement: "below", // sit under the topic cards, pointing up, so it never covers them
              title: t.prefs.tips.topicsTitle,
              body: t.prefs.tips.topicsBody(MAX_TOPICS),
            },
            {
              key: "prefs-delivery",
              target: '[data-tour="prefs-delivery"]',
              title: t.prefs.tips.deliveryTitle,
              body: t.prefs.tips.deliveryBody,
            },
            {
              key: "prefs-podcast",
              target: '[data-tour="prefs-podcast"]',
              title: t.prefs.tips.podcastTitle,
              body: t.prefs.tips.podcastBody,
            },
          ]}
        />
      )}
    </section>
  );
}

function AppearanceSelect({
  value,
  onChange,
  words,
}: {
  value: Theme;
  onChange: (t: Theme) => void;
  words: Strings["prefs"];
}) {
  const label = { system: words.themeAuto, light: words.themeLight, dark: words.themeDark };
  return (
    <div className="flex gap-1 rounded-full bg-[var(--line)]/60 p-0.5">
      {(["system", "light", "dark"] as const).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          aria-pressed={value === t}
          className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${
            value === t ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
          }`}
        >
          {label[t]}
        </button>
      ))}
    </div>
  );
}

// Each language named in itself, as on the language screen.
function LanguageSelect({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  const options: { value: Language; label: string }[] = [
    { value: "en", label: "English" },
    { value: "es", label: "Español" },
  ];
  return (
    <div className="flex flex-none gap-1 rounded-full bg-[var(--line)]/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          lang={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${
            value === o.value ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RegenBanner({
  state,
  onRegenerate,
  onDismiss,
}: {
  state: "idle" | "submitting" | "done";
  onRegenerate: () => void;
  onDismiss: () => void;
}) {
  const t = useLanguage().t;
  if (state === "done") {
    return (
      <div className="rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/8 p-3.5">
        <p className="text-[13px] font-medium leading-relaxed text-[var(--ink)]">
          {t.prefs.regenDone}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/8 p-3.5">
      <div>
        <p className="text-[13.5px] font-semibold text-[var(--ink)]">{t.prefs.regenTitle}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{t.prefs.regenBody}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onRegenerate}
          disabled={state === "submitting"}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--on-accent)] disabled:opacity-50"
        >
          {state === "submitting" ? t.prefs.regenStarting : t.prefs.regenNow}
        </button>
        <button onClick={onDismiss} className="px-3 py-2 text-[13px] font-semibold text-[var(--muted)]">
          {t.prefs.regenWait}
        </button>
      </div>
    </div>
  );
}
