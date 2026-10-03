import type { Preferences } from "@shared/types";
import { MAX_GENRES, MAX_TOPICS } from "./preferences-options";
import { topicCount } from "./topic-actions";

type Update = (patch: Partial<Preferences>) => void;

// Add/remove a genre. Removing also drops that genre's subtopics + recency override
// so we never leave orphaned entries behind. Capped at MAX_GENRES.
export function toggleGenre(prefs: Preferences, update: Update, genre: string) {
  if (prefs.genres.includes(genre)) {
    const subtopics = { ...prefs.subtopics };
    delete subtopics[genre];
    update({ genres: prefs.genres.filter((g) => g !== genre), subtopics });
  } else if (prefs.genres.length < MAX_GENRES) {
    update({ genres: [...prefs.genres, genre] });
  }
}

// Subtopics are the actual report topics. Adding is capped at MAX_TOPICS total (subtopics + custom);
// removing is always allowed.
//
// `label` is how the reader saw the chip, when that differs from its internal name — a live
// suggestion shown in Spanish. It is kept, so the topic reads the same in Preferences tomorrow,
// after today's suggestions are gone. See i18n/topics.ts for why the name itself stays English.
export function toggleSubtopic(
  prefs: Preferences,
  update: Update,
  genre: string,
  sub: string,
  label?: string,
) {
  const current = prefs.subtopics[genre] ?? [];
  const isRemoving = current.includes(sub);
  if (!isRemoving && topicCount(prefs) >= MAX_TOPICS) return; // at the topic cap
  const next = isRemoving ? current.filter((s) => s !== sub) : [...current, sub];
  const patch: Partial<Preferences> = { subtopics: { ...prefs.subtopics, [genre]: next } };
  if (!isRemoving && label && label !== sub) {
    patch.topic_labels = { ...(prefs.topic_labels ?? {}), [sub]: label };
  }
  update(patch);
}
