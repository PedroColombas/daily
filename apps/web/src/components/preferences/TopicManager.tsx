import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Reorder } from "motion/react";
import type { Preferences } from "@shared/types";
import { GENRES, SUBTOPIC_FALLBACK, MAX_TOPICS } from "../../lib/preferences-options";
import {
  topicEntries,
  topicCount,
  entryKey,
  entryLabel,
  entryTypeLabel,
  addEntry,
  editEntry,
  removeEntry,
  type TopicEntry,
} from "../../lib/topic-actions";
import { useT, useTopicLabel } from "../../i18n/LanguageProvider";

// The report's topics, managed directly: drag to reorder, tap a card to edit, or delete via the
// trash icon on each card. Topics are subtopics (a focus within a genre) or your own words.
export function TopicManager({
  prefs,
  update,
}: {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
}) {
  const [entries, setEntries] = useState<TopicEntry[]>(() => topicEntries(prefs));
  const [editing, setEditing] = useState<TopicEntry | "new" | null>(null);
  const t = useT();
  const label = useTopicLabel(prefs.topic_labels);

  // Re-sync the list when the SET of topics changes (add/edit/delete) — not on a bare reorder.
  const setSignal = topicEntries(prefs).map(entryKey).sort().join("|");
  useEffect(() => {
    setEntries(topicEntries(prefs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSignal]);

  const count = topicCount(prefs);
  const atCap = count >= MAX_TOPICS;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[12px] text-[var(--muted)]">
          {t.topics.count(count, MAX_TOPICS)}
        </span>
        {atCap && <span className="text-[11.5px] text-[var(--faint)]">{t.topics.deleteToAdd}</span>}
      </div>

      {entries.length > 0 && (
        <Reorder.Group
          axis="y"
          values={entries}
          onReorder={(next) => {
            setEntries(next);
            update({ topic_order: next.map(entryKey) });
          }}
          className="flex flex-col gap-2"
        >
          {entries.map((e, i) => (
            <Reorder.Item
              key={entryKey(e)}
              value={e}
              className="flex items-center gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 active:cursor-grabbing"
            >
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--accent)]/12 text-[12px] font-bold text-[var(--accent)]">
                {i + 1}
              </span>
              <button onClick={() => setEditing(e)} className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-[14px] font-semibold leading-snug">{entryLabel(e, label)}</span>
                <span className="text-[11.5px] text-[var(--faint)]">
                  {entryTypeLabel(e, t.topics.ownWords, label)}
                </span>
              </button>
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  update(removeEntry(prefs, e));
                }}
                aria-label={t.topics.deleteAria(entryLabel(e, label))}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--faint)] active:bg-red-500/10 active:text-red-600"
              >
                <TrashIcon />
              </button>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      <button
        onClick={() => setEditing("new")}
        disabled={atCap}
        className="rounded-2xl border border-dashed border-[var(--line)] py-3 text-[13.5px] font-semibold text-[var(--muted)] active:opacity-60 disabled:opacity-40"
      >
        {t.topics.add}
      </button>

      {editing && (
        <TopicEditSheet
          prefs={prefs}
          update={update}
          entry={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2m1 0-1 14H7L6 6" />
    </svg>
  );
}

function TopicEditSheet({
  prefs,
  update,
  entry,
  onClose,
}: {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  entry: TopicEntry | null; // null = adding
  onClose: () => void;
}) {
  const isNew = entry === null;
  const t = useT();
  const label = useTopicLabel(prefs.topic_labels);
  const [mode, setMode] = useState<"genre" | "custom">(entry?.kind === "custom" ? "custom" : "genre");
  const [genre, setGenre] = useState(entry?.kind === "subtopic" ? entry.genre : "");
  const [sub, setSub] = useState(entry?.kind === "subtopic" ? entry.sub : "");
  const [text, setText] = useState(entry?.kind === "custom" ? entry.text : "");

  const suggestions = genre ? SUBTOPIC_FALLBACK[genre] ?? [] : [];
  // Always include the currently-selected subtopic, even if it isn't in the suggestion set.
  const subChips = Array.from(new Set([...suggestions, ...(sub ? [sub] : [])]));
  const canSave = mode === "custom" ? text.trim().length > 0 : genre.length > 0 && sub.trim().length > 0;

  function save() {
    const next: TopicEntry =
      mode === "custom"
        ? { kind: "custom", text: text.trim() }
        : { kind: "subtopic", genre, sub: sub.trim() };
    if (!canSave) return;
    update(isNew ? addEntry(prefs, next) : editEntry(prefs, entry, next));
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-md rounded-t-3xl border-t border-[var(--line)] bg-[var(--paper)] p-5 pb-8"
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--line)]" />
        <h3 className="text-[17px] font-bold tracking-tight">{isNew ? t.topics.addTitle : t.topics.editTitle}</h3>

        {isNew && (
          <div className="mt-3 flex gap-1 rounded-full bg-[var(--line)]/60 p-0.5">
            {(["genre", "custom"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-full py-1.5 text-[12.5px] font-medium ${
                  mode === m ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
                }`}
              >
                {m === "genre" ? t.topics.fromGenre : t.topics.ownWords}
              </button>
            ))}
          </div>
        )}

        {mode === "genre" ? (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--faint)]">
                {t.topics.genre}
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      setGenre(g);
                      setSub("");
                    }}
                    className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${
                      genre === g
                        ? "bg-[var(--accent)] text-[var(--on-accent)]"
                        : "border border-[var(--line)] text-[var(--muted)]"
                    }`}
                  >
                    {label(g)}
                  </button>
                ))}
              </div>
            </div>
            {genre && (
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--faint)]">
                  {t.topics.subtopic}
                </span>
                <p className="mt-1 text-[11.5px] text-[var(--muted)]">{t.topics.pickFocus(label(genre))}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {subChips.map((sg) => (
                    <button
                      key={sg}
                      onClick={() => setSub(sg)}
                      className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${
                        sub === sg
                          ? "bg-[var(--accent)] text-[var(--on-accent)]"
                          : "border border-[var(--line)] text-[var(--muted)]"
                      }`}
                    >
                      {label(sg)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--faint)]">
              {t.topics.topic}
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder={t.topics.placeholderLong}
              className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]"
            />
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          {!isNew && (
            <button
              onClick={() => {
                update(removeEntry(prefs, entry));
                onClose();
              }}
              className="rounded-full border border-red-500/40 px-4 py-2 text-[14px] font-semibold text-red-600 active:bg-red-500/10 dark:border-red-400/40 dark:text-red-400"
            >
              {t.common.remove}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[14px] font-semibold text-[var(--muted)] active:bg-[var(--line)]/50"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-[14px] font-semibold text-[var(--on-accent)] disabled:opacity-40"
          >
            {t.common.save}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
