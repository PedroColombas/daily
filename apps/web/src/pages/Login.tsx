import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth, demoAvailable } from "../auth/AuthProvider";
import { Logo } from "../components/Logo";
import { useT } from "../i18n/LanguageProvider";

export function Login() {
  const { signInWithEmail, signInWithGoogle, signInAsDemo } = useAuth();
  // The sign-in screen speaks the language this device last used — there is no account yet to ask.
  const t = useT().login;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const { error: signInError } = await signInWithEmail(email.trim());
    if (signInError) {
      setError(signInError);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  async function onGoogle() {
    setError(null);
    const { error: googleError } = await signInWithGoogle();
    if (googleError) setError(googleError);
  }

  async function onDemo() {
    setError(null);
    setStatus("sending");
    const { error: demoError } = await signInAsDemo();
    if (demoError) {
      setError(demoError);
      setStatus("error");
    }
    // On success the auth listener swaps this screen out, so there is nothing to reset.
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col px-7 pb-8 pt-6">
      {/* Wordmark + promise — vertically centred */}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Logo size={34} />
        <h1 className="mt-5 text-[27px] font-bold leading-tight tracking-tight">{t.tagline}</h1>
        <p className="mt-3 max-w-[260px] text-[14.5px] leading-relaxed text-[var(--muted)]">
          {t.blurb}
        </p>
      </div>

      {/* Sign-in actions */}
      {status === "sent" ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-center">
          <p className="text-[15px] leading-relaxed text-[var(--ink)]">
            {t.sentBefore}
            <strong>{email}</strong>
            {t.sentAfter}
          </p>
          <button
            onClick={() => setStatus("idle")}
            className="mt-3 text-[13.5px] font-semibold text-[var(--faint)]"
          >
            {t.differentEmail}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => void onGoogle()}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-3.5 text-[15px] font-semibold"
          >
            <span className="text-base font-bold text-[var(--accent)]">G</span>
            {t.google}
          </button>

          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-[var(--line)]" />
            <span className="text-xs font-medium text-[var(--faint)]">{t.or}</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder={t.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-base outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-2xl bg-[var(--accent)] py-3.5 text-[15px] font-semibold text-[var(--on-accent)] disabled:opacity-50"
            >
              {status === "sending" ? t.sending : t.continueEmail}
            </button>
          </form>

          {error && <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>}

          {demoAvailable && (
            <>
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-[var(--line)]" />
                <span className="text-xs font-medium text-[var(--faint)]">{t.justLooking}</span>
                <span className="h-px flex-1 bg-[var(--line)]" />
              </div>
              <button
                onClick={() => void onDemo()}
                disabled={status === "sending"}
                className="rounded-2xl border border-dashed border-[var(--accent)]/50 py-3.5 text-[15px] font-semibold text-[var(--accent)] disabled:opacity-50"
              >
                {t.demo}
              </button>
            </>
          )}

          <p className="mx-4 mt-2 text-center text-[11px] leading-relaxed text-[var(--faint)]">
            {t.termsBefore}
            <span className="font-semibold text-[var(--ink)]">{t.terms}</span>
            {t.and}
            <span className="font-semibold text-[var(--ink)]">{t.privacy}</span>
            {t.termsAfter}
          </p>
        </div>
      )}
    </div>
  );
}
