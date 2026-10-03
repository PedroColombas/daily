import type { Language } from "@shared/types";

// The reader's language, as the pipeline uses it. It governs only what is WRITTEN — the report,
// the catch-up, the podcast script and its voices. What is SEARCHED does not change with it:
// retrieval is shared per (topic, day) across readers, and that sharing is what keeps a brief cheap.
// A Spanish reader's brief is written in Spanish from the same research an English reader's is.
//
// How each prompt is switched: the instructions stay in English — one copy of each prompt, so an
// improvement can never land in one language and be missed in the other — and a non-English reader
// gets one added line saying what to write in. English gets no line at all, so English prompts are
// unchanged byte for byte.

export function readerLanguage(value: unknown): Language {
  return value === "es" ? "es" : "en";
}

// How each prompt names the language. Spain Spanish, not a neutral or Latin American one.
export const LANGUAGE_NAME: Record<Language, string> = {
  en: "English",
  es: "Spanish as written and spoken in Spain (castellano, es-ES)",
};
