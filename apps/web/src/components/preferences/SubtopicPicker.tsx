import type { SubtopicMap } from "@shared/types";
import { Chip } from "../ui/Chip";
import { useSubtopicSuggestions } from "../../hooks/useSubtopicSuggestions";
import { useLanguage, useTopicLabel } from "../../i18n/LanguageProvider";
import { capitalFirst } from "../../i18n/topics";

// Per-genre suggestion chips. Renders the union of fetched suggestions + already-selected
// subtopics, so a previously-picked subtopic always stays visible and toggleable.
export function SubtopicPicker({
  genres,
  subtopics,
  labels,
  onToggle,
}: {
  genres: string[];
  subtopics: SubtopicMap;
  labels?: Record<string, string>; // the reader's stored labels (preferences.topic_labels)
  onToggle: (genre: string, sub: string, label: string) => void;
}) {
  const { lang, t } = useLanguage();
  const { suggestions, labels: liveLabels, loading } = useSubtopicSuggestions(genres, lang);
  const stored = useTopicLabel(labels);
  // Today's suggestion labels first (they came with the chip), then anything already stored.
  const label = (name: string) => (liveLabels[name] ? capitalFirst(liveLabels[name]) : stored(name));

  if (genres.length === 0) {
    return <p className="text-[13px] text-[var(--muted)]">{t.topics.pickGenreFirst}</p>;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {genres.map((genre) => {
        const chips = Array.from(
          new Set([...(suggestions[genre] ?? []), ...(subtopics[genre] ?? [])]),
        );
        return (
          <div key={genre} className="flex flex-col gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[1px] text-[var(--faint)]">
              {stored(genre)}
            </span>
            {loading[genre] && chips.length === 0 ? (
              <span className="text-[12.5px] text-[var(--faint)]">{t.topics.finding}</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {chips.map((sub) => (
                  <Chip
                    key={sub}
                    label={label(sub)}
                    size="sm"
                    selected={(subtopics[genre] ?? []).includes(sub)}
                    onClick={() => onToggle(genre, sub, label(sub))}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
