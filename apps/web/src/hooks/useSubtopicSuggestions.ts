import { useEffect, useRef, useState } from "react";
import type { Language } from "@shared/types";
import { fetchSubtopicSuggestions } from "../lib/api";

/**
 * Fetches subtopic chips for each selected genre (once per genre and language, cached).
 * Returns suggestions keyed by genre, their display labels in the reader's language (keyed by the
 * chip's internal name; empty in English), and a per-genre loading flag.
 */
export function useSubtopicSuggestions(genres: string[], lang: Language) {
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const genre of genres) {
      const key = `${lang}:${genre}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      setLoading((l) => ({ ...l, [genre]: true }));
      fetchSubtopicSuggestions(genre, lang).then((result) => {
        setSuggestions((s) => ({ ...s, [genre]: result.subtopics }));
        setLabels((l) => ({ ...l, ...result.labels }));
        setLoading((l) => ({ ...l, [genre]: false }));
      });
    }
  }, [genres, lang]);

  return { suggestions, labels, loading };
}
