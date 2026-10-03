import type { Language } from "@shared/types";
import { useLanguage } from "../i18n/LanguageProvider";
import { Logo } from "./Logo";

// Each language names itself, in itself — a reader looking for theirs shouldn't have to read the
// other one first.
const OPTIONS: { value: Language; name: string; detail: string }[] = [
  { value: "en", name: "English", detail: "Briefs and podcasts in English" },
  { value: "es", name: "Español", detail: "Resúmenes y podcasts en español de España" },
];

// The very first screen, before the welcome and the wizard: everything after it — the app, the
// briefs, the podcast — is in the language picked here. Tapping an option switches the screen
// straight away, so the reader sees the choice take effect before they commit to it.
export function LanguageScreen({
  onChoose,
  onContinue,
}: {
  onChoose: (lang: Language) => void;
  onContinue: () => void;
}) {
  const { lang, t } = useLanguage();

  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col overflow-hidden px-7 pb-10 pt-14">
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col justify-center">
        <Logo size={30} />
        <h1 className="mt-8 text-[30px] font-bold leading-tight tracking-tight text-[var(--ink)]">
          {t.language.title}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted)]">{t.language.blurb}</p>

        <div role="radiogroup" aria-label={t.language.title} className="mt-7 flex flex-col gap-2.5">
          {OPTIONS.map((o) => {
            const selected = lang === o.value;
            return (
              <button
                key={o.value}
                role="radio"
                aria-checked={selected}
                lang={o.value}
                onClick={() => onChoose(o.value)}
                className={`flex items-center gap-3.5 rounded-2xl border bg-[var(--surface)] px-4 py-3.5 text-left transition-colors ${
                  selected ? "border-[var(--accent)]" : "border-[var(--line)]"
                }`}
              >
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                    selected ? "border-[var(--accent)]" : "border-[var(--line)]"
                  }`}
                  aria-hidden
                >
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />}
                </span>
                <span className="flex flex-col">
                  <span className="text-[16px] font-semibold text-[var(--ink)]">{o.name}</span>
                  <span className="text-[12.5px] text-[var(--muted)]">{o.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={onContinue}
        className="relative flex-none rounded-2xl bg-[var(--accent)] py-4 text-[16px] font-semibold text-[var(--on-accent)] shadow-[0_6px_18px_rgba(192,81,43,0.3)] active:opacity-80"
      >
        {t.common.continue}
      </button>
    </div>
  );
}
