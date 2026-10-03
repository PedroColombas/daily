import type { Preferences } from "@shared/types";
import { planReportSections } from "@shared/plan-topics";

// A single managed topic (one report section). Genres are CONTAINERS, not topics — a brief is made
// of subtopics (a focus within a genre) + the user's own custom interests.
export type TopicEntry =
  | { kind: "subtopic"; genre: string; sub: string }
  | { kind: "custom"; text: string };

export function entryKey(e: TopicEntry): string {
  return e.kind === "custom" ? `interest:${e.text}` : `sub:${e.genre}:${e.sub}`;
}

// Display text for an entry. `label` turns an internal topic name into what the reader sees (their
// language); custom interests are the reader's own words and are shown exactly as typed.
export function entryLabel(e: TopicEntry, label: (name: string) => string = (n) => n): string {
  return e.kind === "custom" ? e.text : label(e.sub);
}

export function entryTypeLabel(
  e: TopicEntry,
  ownWords: string,
  label: (name: string) => string = (n) => n,
): string {
  return e.kind === "custom" ? ownWords : label(e.genre);
}

// The user's topics, in report order (same source of truth as the pipeline).
export function topicEntries(prefs: Preferences): TopicEntry[] {
  return planReportSections(prefs).map((t): TopicEntry =>
    t.level === 3
      ? { kind: "custom", text: t.topic }
      : { kind: "subtopic", genre: t.genre ?? "", sub: t.topic },
  );
}

// Total topics = subtopics + NON-EMPTY custom interests (genres are containers, not topics; empty
// interest inputs don't become sections). Drives the cap.
export function topicCount(prefs: Preferences): number {
  const subs = Object.values(prefs.subtopics ?? {}).reduce((n, s) => n + s.length, 0);
  const custom = (prefs.custom_interests ?? []).filter((s) => s.trim()).length;
  return subs + custom;
}

// ── mutations — each returns a Partial<Preferences> patch to hand to update() ──

export function removeEntry(prefs: Preferences, e: TopicEntry): Partial<Preferences> {
  const key = entryKey(e);
  const topic_order = (prefs.topic_order ?? []).filter((k) => k !== key);
  if (e.kind === "subtopic") {
    const subs = (prefs.subtopics[e.genre] ?? []).filter((s) => s !== e.sub);
    return { subtopics: { ...prefs.subtopics, [e.genre]: subs }, topic_order };
  }
  return { custom_interests: (prefs.custom_interests ?? []).filter((t) => t !== e.text), topic_order };
}

export function addEntry(prefs: Preferences, e: TopicEntry): Partial<Preferences> {
  const key = entryKey(e);
  const order = prefs.topic_order ?? [];
  const topic_order = order.includes(key) ? order : [...order, key];
  if (e.kind === "subtopic") {
    const subs = prefs.subtopics[e.genre] ?? [];
    if (subs.includes(e.sub)) return {};
    // Ensure the parent genre is selected — it's the container the subtopic lives under.
    const genres = prefs.genres.includes(e.genre) ? prefs.genres : [...prefs.genres, e.genre];
    return { genres, subtopics: { ...prefs.subtopics, [e.genre]: [...subs, e.sub] }, topic_order };
  }
  const text = e.text.trim();
  const current = prefs.custom_interests ?? [];
  if (!text || current.includes(text)) return {};
  return { custom_interests: [...current, text], topic_order };
}

// Replace one entry with another, keeping its position in the order.
export function editEntry(prefs: Preferences, oldE: TopicEntry, newE: TopicEntry): Partial<Preferences> {
  if (entryKey(oldE) === entryKey(newE)) return {};
  const afterRemove = { ...prefs, ...removeEntry(prefs, oldE) } as Preferences;
  const after = { ...afterRemove, ...addEntry(afterRemove, newE) } as Preferences;
  const oldKey = entryKey(oldE);
  const newKey = entryKey(newE);
  const order = (prefs.topic_order ?? []).map((k) => (k === oldKey ? newKey : k));
  const topic_order = order.includes(newKey) ? order : [...order, newKey];
  return {
    genres: after.genres,
    subtopics: after.subtopics,
    custom_interests: after.custom_interests,
    topic_order,
  };
}
