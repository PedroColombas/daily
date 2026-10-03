import { task, logger } from "@trigger.dev/sdk";
import { supabase } from "../lib/supabase";
import { withDiagnostics } from "../lib/diagnostics";
import { writeScript } from "../lib/podcast-script";
import { synthesizeDialogue, type DialogueTurn } from "../lib/tts";
import { INTRO_SECONDS } from "../lib/intro-audio";
import { createMeter } from "../lib/usage";
import { readerLanguage } from "../lib/language";
import type { ReportContent } from "@shared/types";

const AUDIO_BUCKET = "podcast-audio";

export const generatePodcast = task({
  id: "generate-podcast",
  // Headroom for the slower expressive TTS models (eleven_v3). Parallel synthesis keeps real time
  // well under this; the bump is a safety margin so a long episode can't be killed mid-render.
  maxDuration: 600,
  run: async (payload: { reportId: string; force?: boolean; turns?: DialogueTurn[] }, { ctx }) => {
    const { reportId, force } = payload;
    const db = supabase();

    const { data: report, error: reportError } = await db
      .from("reports")
      .select("id, user_id, date, markdown, content")
      .eq("id", reportId)
      .single();
    if (reportError) throw reportError;
    const userId = report!.user_id as string;
    const markdown = report!.markdown as string | null;
    const content = report!.content as ReportContent | null;
    const sections = content?.sections ?? [];
    const recap = content?.recap?.summary;
    // The episode is in the language its brief was written in — not the reader's current setting,
    // which may have changed since. Briefs from before languages existed carry none: English.
    const language = readerLanguage(content?.language);

    // Idempotency anchor: podcast_episodes.unique(report_id).
    const { data: existing } = await db
      .from("podcast_episodes")
      .select("id, status")
      .eq("report_id", reportId)
      .maybeSingle();
    if (!force && existing?.status === "complete") {
      logger.info("podcast already complete — skipping", { reportId });
      return { episodeId: existing.id as string, skipped: true };
    }

    const { data: row, error: upsertError } = await db
      .from("podcast_episodes")
      .upsert(
        { report_id: reportId, user_id: userId, status: "generating" },
        { onConflict: "report_id" },
      )
      .select("id")
      .single();
    if (upsertError) throw upsertError;
    const episodeId = row!.id as string;
    const meter = createMeter({
      runId: ctx.run.id,
      userId,
      reportId,
      date: report!.date as string,
    });

    try {
      if (!markdown && !payload.turns) throw new Error("report has no markdown to narrate");

      // 1. Write a two-person interview script (host asks, expert answers) as structured turns,
      //    each tagged with the report section it covers (for chapters). A supplied script (from
      //    the seed-test-episode dev task) skips this Anthropic call.
      const turns =
        payload.turns ??
        (await withDiagnostics("podcast-script", () =>
          writeScript(
            spokenInput(sections) ?? markdown!,
            sections.map((s) => ({ heading: s.topic, isPrimer: Boolean(s.isPrimer) })),
            recap,
            meter,
            language,
          ),
        ));
      if (turns.length === 0) throw new Error("podcast script came back empty");
      const script = renderTranscript(turns);
      const chapters = computeChapters(turns, sections);

      // 2. Synthesise each turn in its speaker's voice; concatenate the segments in order.
      //    (ElevenLabs when configured, else OpenAI — the tts facade picks + falls back.)
      const audio = await withDiagnostics("tts", () => synthesizeDialogue(turns, meter, language));

      // 3. Upload to the private bucket, namespaced by user (service_role bypasses storage
      //    RLS). `audio_url` stores the PATH, not a URL — see schema + 0003_storage.sql.
      const path = `${userId}/${reportId}.mp3`;
      const { error: uploadError } = await db.storage
        .from(AUDIO_BUCKET)
        .upload(path, audio, { contentType: "audio/mpeg", upsert: true });
      if (uploadError) throw uploadError;

      await db
        .from("podcast_episodes")
        .update({
          script,
          audio_url: path,
          duration_seconds: estimateDurationSeconds(turns),
          chapters,
          status: "complete",
        })
        .eq("id", episodeId);
      logger.info("podcast complete", { reportId, episodeId, path, turns: turns.length });

      return { episodeId, skipped: false };
    } catch (error: any) {
      await db.from("podcast_episodes").update({ status: "failed" }).eq("id", episodeId);
      throw error;
    }
  },
});

// What the script writer reads: each section's heading and prose, without the per-section source
// lists the report markdown carries. Those lists were ~2/3 of the script step's input (measured
// 2026-10-03), and a web address is no use in audio — the prose already names its outlets.
// Null for an old report with no structured sections, which then falls back to its markdown.
function spokenInput(sections: { topic: string; summary: string }[]): string | null {
  if (sections.length === 0) return null;
  return sections.map((s) => `## ${s.topic}\n\n${s.summary.trim()}`).join("\n\n");
}

// Render the dialogue as a readable transcript for the `script` column / any transcript UI.
function renderTranscript(turns: DialogueTurn[]): string {
  return turns
    .map((t) => `${t.speaker === "host" ? "Host" : "Expert"}: ${t.text.trim()}`)
    .join("\n\n");
}

// Rough runtime estimate for the player UI (~150 words per minute across all turns), plus the
// intro sting's real length (the word count doesn't know about the prepended audio).
function estimateDurationSeconds(turns: DialogueTurn[]): number {
  const words = turns
    .map((t) => t.text.trim().split(/\s+/).filter(Boolean).length)
    .reduce((sum, n) => sum + n, 0);
  return Math.max(1, Math.round((words / 150) * 60 + INTRO_SECONDS));
}

// One chapter per topic, positioned by cumulative word count as a fraction (0..1) of the
// whole script — the player scales these to the real audio duration. First appearance of
// each section wins; sorted by position.
function computeChapters(
  turns: DialogueTurn[],
  sections: { topic: string }[],
): { title: string; fraction: number }[] {
  if (sections.length === 0) return [];
  const counts = turns.map((t) => t.text.trim().split(/\s+/).filter(Boolean).length);
  const total = counts.reduce((sum, n) => sum + n, 0) || 1;

  const seen = new Set<number>();
  const chapters: { title: string; fraction: number }[] = [];
  let cumulative = 0;
  turns.forEach((turn, i) => {
    const idx = Math.max(0, Math.min(sections.length - 1, turn.section ?? 0));
    if (!seen.has(idx)) {
      seen.add(idx);
      chapters.push({ title: sections[idx].topic, fraction: cumulative / total });
    }
    cumulative += counts[i];
  });

  return chapters.sort((a, b) => a.fraction - b.fraction);
}
