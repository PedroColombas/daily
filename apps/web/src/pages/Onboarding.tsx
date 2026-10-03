import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Preferences } from "@shared/types";
import { planReportSections } from "@shared/plan-topics";
import { toggleGenre, toggleSubtopic } from "../lib/preferences-actions";
import { MAX_TOPICS } from "../lib/preferences-options";
import { topicCount } from "../lib/topic-actions";
import { GenrePicker } from "../components/preferences/GenrePicker";
import { SubtopicPicker } from "../components/preferences/SubtopicPicker";
import { CustomInterestsEditor } from "../components/preferences/CustomInterestsEditor";
import { Toggle } from "../components/ui/Toggle";
import { WelcomeScreen } from "../components/WelcomeScreen";
import { TopicManager } from "../components/preferences/TopicManager";
import { LanguageScreen } from "../components/LanguageScreen";
import { guessLanguage, useLanguage, useT } from "../i18n/LanguageProvider";

export function Onboarding({
  prefs,
  update,
  onDone,
}: {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  // Language first, before anything else is said — then a warm hello, then the wizard. The demo
  // skips the language screen: it is English-only (its briefs are), so the choice would be a lie.
  const [phase, setPhase] = useState<"language" | "welcome" | "wizard">(
    prefs.is_demo ? "welcome" : "language",
  );
  const [step, setStep] = useState(0);
  const total = t.wizard.steps.length;
  const count = topicCount(prefs);
  const atCap = count >= MAX_TOPICS;

  if (phase === "language") {
    return <FirstLanguage firstRun={prefs.genres.length === 0} onContinue={() => setPhase("welcome")} />;
  }

  // Then the welcome — a warm hello before the config wizard.
  if (phase === "welcome") return <WelcomeScreen onStart={() => setPhase("wizard")} />;

  function finish(to: string) {
    onDone();
    navigate(to);
  }

  if (step === total) {
    return (
      <div className="mx-auto h-full max-w-md overflow-y-auto px-6 pb-8 pt-6">
        <EditionPreview
          prefs={prefs}
          update={update}
          onBack={() => setStep(total - 1)}
          onStart={() => finish("/")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col px-6 pb-8 pt-5">
      {/* Progress */}
      <div className="flex flex-none items-center gap-1.5 pt-1">
        {t.wizard.steps.map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`}
          />
        ))}
      </div>

      <div className="mt-5 flex-none">
        <span className="text-[12px] font-bold uppercase tracking-[1px] text-[var(--accent)]">
          {t.wizard.stepOf(step + 1, total)}
        </span>
        <h1 className="mt-2 text-[25px] font-bold leading-tight tracking-tight">{t.wizard.steps[step].title}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted)]">{t.wizard.steps[step].subtitle}</p>
      </div>

      {/* Body */}
      <div className="mt-6 flex-1 overflow-y-auto">
        {step === 0 && (
          <GenrePicker selected={prefs.genres} onToggle={(g) => toggleGenre(prefs, update, g)} />
        )}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <CapNotice atCap={atCap} />
            <SubtopicPicker
              genres={prefs.genres}
              subtopics={prefs.subtopics}
              labels={prefs.topic_labels}
              onToggle={(genre, sub, label) => toggleSubtopic(prefs, update, genre, sub, label)}
            />
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-3">
            <CapNotice atCap={atCap} />
            <CustomInterestsEditor
              interests={prefs.custom_interests ?? []}
              onChange={(custom_interests) => update({ custom_interests })}
              atCap={atCap}
            />
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex flex-none items-center gap-3 pt-4">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="rounded-2xl border border-[var(--line)] px-5 py-3.5 text-[15px] font-semibold text-[var(--muted)]"
          >
            {t.common.back}
          </button>
        )}
        <button
          type="button"
          onClick={() => setStep(step + 1)}
          className="flex-1 rounded-2xl bg-[var(--accent)] py-3.5 text-[15px] font-semibold text-[var(--on-accent)]"
        >
          {step === total - 1 ? t.wizard.review : t.common.continue}
        </button>
      </div>
    </div>
  );
}

// Only the cap notice, and only once it bites. There used to be a running count beside it, but the
// count covers subtopics AND custom interests while each step shows only one of the two — so it
// read "4 of 4 topics" next to three visible chips. The notice earns its place; the count did not,
// because a chip that silently stops responding still needs explaining.
function CapNotice({ atCap }: { atCap: boolean }) {
  const t = useT();
  if (!atCap) return null;
  return <span className="px-1 text-[12px] text-[var(--faint)]">{t.wizard.capNotice}</span>;
}

// The language screen, wired to the account. On a first run it starts on the browser's language as
// a guess; on a replay, on the one the reader already has.
function FirstLanguage({ firstRun, onContinue }: { firstRun: boolean; onContinue: () => void }) {
  const { lang, chooseLanguage } = useLanguage();
  const [guess] = useState(() => (firstRun ? guessLanguage() : lang));
  // Show the guess straight away; it is only saved once the reader continues.
  useEffect(() => {
    if (guess !== lang) void chooseLanguage(guess, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <LanguageScreen
      onChoose={(next) => void chooseLanguage(next, false)}
      onContinue={() => {
        // Saved here, once, even when nothing changed — so the account always holds the language
        // the reader saw and accepted.
        void chooseLanguage(lang, true);
        onContinue();
      }}
    />
  );
}

function MicIcon() {
  return (
    <svg
      width="15"
      height="15"
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

function EditionPreview({
  prefs,
  update,
  onBack,
  onStart,
}: {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const t = useT();
  const sections = planReportSections(prefs);

  return (
    <div className="flex flex-col">
      <div>
        <span className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--accent)]">
          {t.wizard.allSet}
        </span>
        <h1 className="mt-3 text-[25px] font-bold leading-tight tracking-tight">{t.wizard.previewTitle}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted)]">{t.wizard.previewBlurb}</p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          {/* Podcast — a live on/off toggle (last chance to enable before the first brief) */}
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${
                  prefs.podcast_enabled
                    ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                    : "bg-[var(--line)]/60 text-[var(--faint)]"
                }`}
              >
                <MicIcon />
              </span>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-[1.1px] text-[var(--faint)]">
                  {t.wizard.podcast}
                </span>
                <span className="text-[13.5px] font-semibold text-[var(--ink)]">
                  {prefs.podcast_enabled ? t.wizard.podcastOn : t.wizard.podcastOff}
                </span>
              </div>
            </div>
            <Toggle
              checked={prefs.podcast_enabled}
              onChange={(podcast_enabled) => update({ podcast_enabled })}
            />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-[var(--faint)]">
          {t.wizard.inThisEdition}
        </span>
        <div className="mt-3">
          <TopicManager prefs={prefs} update={update} />
        </div>
      </div>

      {sections.length === 0 && (
        <p className="mt-4 text-center text-[12.5px] text-[var(--muted)]">
          {t.wizard.needOne}
        </p>
      )}
      <div className="flex items-center gap-3 pt-6">
        <button
          type="button"
          onClick={onBack}
          className="rounded-2xl border border-[var(--line)] px-5 py-3.5 text-[15px] font-semibold text-[var(--muted)]"
        >
          {t.common.back}
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={sections.length === 0}
          className="flex-1 rounded-2xl bg-[var(--accent)] py-3.5 text-[15px] font-semibold text-[var(--on-accent)] disabled:opacity-40"
        >
          {t.wizard.startReading}
        </button>
      </div>
    </div>
  );
}
