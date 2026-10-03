import { Logo } from "./Logo";
import { useT } from "../i18n/LanguageProvider";

// First-run welcome — a simple, warm hello before the setup wizard. Visual-first, minimal copy.
// (Replaces the old multi-slide trailer, which belonged in the app's marketing, not the app.)
export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const t = useT();
  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col overflow-hidden px-7 pb-10 pt-14">
      {/* Warm ambient wash */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col justify-center">
        {/* The wordmark carries this screen. Per the logo spec it is the only mark, so the old
            three-line device that used to sit above the headline is gone rather than competing. */}
        <h1 className="text-[38px] font-bold leading-[1.06] tracking-tight text-[var(--ink)]">
          {t.welcome.title}
          {/* The arc overshoots the cap height, so the spec asks for 0.5em clear above it. In em,
              not px, so it holds if the headline size ever changes. */}
          <span className="block" style={{ paddingTop: "0.5em" }}>
            <Logo size={38} />.
          </span>
        </h1>
        <p className="mt-4 text-[16.5px] leading-relaxed text-[var(--muted)]">
          {t.welcome.blurb}
        </p>
      </div>

      <button
        onClick={onStart}
        className="relative flex-none rounded-2xl bg-[var(--accent)] py-4 text-[16px] font-semibold text-[var(--on-accent)] shadow-[0_6px_18px_rgba(192,81,43,0.3)] active:opacity-80"
      >
        {t.welcome.start}
      </button>
      <p className="relative mt-3 text-center text-[12px] text-[var(--faint)]">
        {t.welcome.time}
      </p>
    </div>
  );
}
