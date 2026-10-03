import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Language } from "@shared/types";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import { STRINGS, type Strings } from "./strings";
import { topicLabel } from "./topics";

// The reader's language, held app-wide. It lives in a context rather than in usePreferences because
// that hook keeps a separate copy of the row per screen: a language changed on Preferences would
// otherwise only reach the screen it was changed on.
//
// The account (preferences.language) is the source of truth once signed in; App syncs it in on
// load. The device remembers the last one too, so the sign-in screen can greet a returning reader
// in their language before any account is loaded.

const LANG_KEY = "daily-language";

function readStored(): Language {
  try {
    return localStorage.getItem(LANG_KEY) === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

function remember(lang: Language) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage unavailable — the account still holds it */
  }
}

// The browser's language, as a first guess on the language screen. Only a guess: the reader picks.
export function guessLanguage(): Language {
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es")
    ? "es"
    : "en";
}

// Dates follow the app's language, not the browser's: a Spanish interface with English dates (or
// the reverse) reads as a bug. English keeps the browser's own English variant, so a US reader still
// gets "June 27" and a UK one "27 June".
function localeFor(lang: Language): string {
  if (lang === "es") return "es-ES";
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  return nav?.toLowerCase().startsWith("en") ? nav : "en-GB";
}

interface LanguageContextValue {
  lang: Language;
  t: Strings;
  locale: string;
  // Show the app in this language. `persist` also remembers it on this device. Used when an
  // account's saved language is loaded.
  showLanguage: (lang: Language, persist: boolean) => void;
  // The reader chose a language: show it, remember it, and save it to their account. The demo
  // passes save=false — it never writes.
  chooseLanguage: (lang: Language, save: boolean) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [lang, setLang] = useState<Language>(readStored);

  useEffect(() => {
    document.documentElement.lang = lang === "es" ? "es" : "en";
  }, [lang]);

  const showLanguage = useCallback((next: Language, persist: boolean) => {
    setLang(next);
    if (persist) remember(next);
  }, []);

  const chooseLanguage = useCallback(
    async (next: Language, save: boolean) => {
      setLang(next);
      if (!save) return;
      remember(next);
      if (!user) return;
      // Written on its own rather than through usePreferences' auto-save, which writes every
      // editable column from that screen's copy of the row — a stale copy elsewhere would then put
      // the old language back. Awaited: a Supabase query only runs when awaited.
      try {
        const { error } = await supabase
          .from("preferences")
          .update({ language: next })
          .eq("user_id", user.id);
        if (error) console.warn("Couldn't save language:", error.message);
      } catch (err) {
        console.warn("Couldn't save language:", err);
      }
    },
    [user],
  );

  const value = useMemo(
    () => ({ lang, t: STRINGS[lang], locale: localeFor(lang), showLanguage, chooseLanguage }),
    [lang, showLanguage, chooseLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}

// The interface strings in the current language.
export function useT(): Strings {
  return useLanguage().t;
}

// Shows a topic's internal name in the current language. Pass the reader's stored labels where
// there are any (preferences.topic_labels), for topics that were suggested live.
export function useTopicLabel(labels?: Record<string, string> | null): (name: string) => string {
  const { lang } = useLanguage();
  return useCallback((name: string) => topicLabel(name, lang, labels), [lang, labels]);
}
