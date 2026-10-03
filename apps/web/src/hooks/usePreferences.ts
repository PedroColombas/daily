import { useCallback, useEffect, useRef, useState } from "react";
import type { Preferences } from "@shared/types";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// Columns the frontend is allowed to edit (everything except id / user_id / updated_at).
const EDITABLE_COLUMNS = [
  "genres",
  "subtopics",
  "custom_interests",
  "exclusions",
  "max_topics",
  "context_depth",
  "podcast_enabled",
  "delivery_hour",
  "walkthrough_seen",
  "topic_order",
  "topic_labels",
] as const;
// Not here: `language`, which is written on its own by the LanguageProvider (see there for why),
// and `tips_seen`, written by markTipsSeen below.

function editableSubset(prefs: Preferences): Partial<Preferences> {
  const out: Record<string, unknown> = {};
  for (const col of EDITABLE_COLUMNS) out[col] = prefs[col];
  // Don't persist blank custom interests left mid-edit.
  out.custom_interests = (prefs.custom_interests ?? []).map((s) => s.trim()).filter(Boolean);
  return out as Partial<Preferences>;
}

/**
 * Loads the signed-in user's single preferences row and auto-saves edits
 * (debounced) back to Supabase. The row is created on signup by a DB trigger;
 * we insert a default if it's somehow missing.
 */
export function usePreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Only auto-save after the user actually edits — not on the initial load.
  const dirty = useRef(false);
  // Latest prefs snapshot, so callbacks can read current state synchronously (see markTipsSeen).
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    dirty.current = false;

    (async () => {
      const { data } = await supabase
        .from("preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;

      if (data) {
        setPrefs(data as Preferences);
      } else {
        // Fallback: trigger didn't create a row — insert one with DB defaults.
        const { data: inserted } = await supabase
          .from("preferences")
          .insert({ user_id: user.id })
          .select()
          .single();
        if (active && inserted) setPrefs(inserted as Preferences);
      }
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [user]);

  // Debounced auto-save: whenever prefs change after an edit, persist the editable subset.
  useEffect(() => {
    if (!user || !prefs || !dirty.current) return;
    // The public demo explores freely but never persists. A visitor can click through genres,
    // subtopics and interests and watch the screen respond exactly as a real user would, and a
    // refresh restores the seeded set. Without this, one visitor deleting the topics would leave
    // the demo empty for everyone until the nightly reset.
    if (prefs.is_demo) return;
    setStatus("saving");
    const timer = setTimeout(async () => {
      const { error } = await supabase
        .from("preferences")
        .update(editableSubset(prefs))
        .eq("user_id", user.id);
      setStatus(error ? "error" : "saved");
    }, 700);
    return () => clearTimeout(timer);
  }, [prefs, user]);

  const update = useCallback((patch: Partial<Preferences>) => {
    dirty.current = true;
    setPrefs((cur) => (cur ? { ...cur, ...patch } : cur));
  }, []);

  // Record dismissed coach-mark tips. Kept OUT of the generic auto-save (EDITABLE_COLUMNS) and
  // written directly so a failure — e.g. the tips_seen column not migrated yet — is swallowed and
  // never blocks other preference saves. Reads the latest prefs via a ref and computes the merged
  // set synchronously: a setState updater's result isn't available at the call site, so computing it
  // there is the only way to guarantee the DB write fires — otherwise the dismissal wouldn't persist
  // and the tip would reappear on the next visit.
  const markTipsSeen = useCallback(
    (keys: string[]) => {
      const cur = prefsRef.current;
      if (!user || !cur || keys.length === 0) return;
      if (cur.is_demo) return; // same reason: the demo never writes
      const have = new Set(cur.tips_seen ?? []);
      const merged = [...have];
      for (const k of keys) if (!have.has(k)) merged.push(k);
      if (merged.length === have.size) return; // nothing new to persist
      setPrefs((p) => (p ? { ...p, tips_seen: merged } : p));
      // A Supabase query only executes when awaited — fire it and swallow failures (best-effort, so a
      // missing column etc. never blocks the UI). Without the await the request is never even sent.
      void (async () => {
        try {
          const { error } = await supabase
            .from("preferences")
            .update({ tips_seen: merged })
            .eq("user_id", user.id);
          if (error) console.warn("Couldn't save tips_seen:", error.message);
        } catch (err) {
          console.warn("Couldn't save tips_seen:", err);
        }
      })();
    },
    [user],
  );

  return { prefs, loading, status, update, markTipsSeen };
}
