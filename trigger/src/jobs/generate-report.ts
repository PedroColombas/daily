import { task, logger } from "@trigger.dev/sdk";
import { supabase } from "../lib/supabase";
import { withDiagnostics } from "../lib/diagnostics";
import { synthesize } from "../lib/synthesis";
import { writeRecap } from "../lib/recap";
import { createMeter } from "../lib/usage";
import type { Preferences, ReportContent, ReportRecap } from "@shared/types";
import type { FetchedTopic } from "./fetch-news";

export const generateReport = task({
  id: "generate-report",
  // Headroom for a large streamed synthesis (a primer-heavy first brief) + the optional recap.
  maxDuration: 600,
  run: async (
    payload: { userId: string; date: string; topics: FetchedTopic[]; force?: boolean },
    { ctx },
  ) => {
    const { userId, date, topics, force } = payload;
    const db = supabase();

    // Idempotency anchor: reports.unique(user_id, date). If a complete report already
    // exists for today, this is a retry/duplicate — stop (Trigger.dev may re-run). Unless force
    // (a user-requested regenerate after a topic change), which deliberately rebuilds.
    const { data: existing } = await db
      .from("reports")
      .select("id, status")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();
    if (!force && existing?.status === "complete") {
      logger.info("report already complete — skipping", { userId, date });
      return { reportId: existing.id as string, skipped: true };
    }

    // Create or claim the row, mark it generating.
    const { data: row, error: upsertError } = await db
      .from("reports")
      .upsert(
        { user_id: userId, date, status: "generating", error_message: null },
        { onConflict: "user_id,date" },
      )
      .select("id")
      .single();
    if (upsertError) throw upsertError;
    const reportId = row!.id as string;
    const meter = createMeter({ runId: ctx.run.id, userId, reportId, date });

    try {
      const { data: prefsData, error: prefsError } = await db
        .from("preferences")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (prefsError) throw prefsError;
      const prefs = prefsData as Preferences;

      const { content, markdown } = await withDiagnostics("synthesis", () =>
        synthesize(prefs, topics, meter),
      );

      // "While you were away" recap from briefs missed since the user last read one.
      const { data: readRows } = await db
        .from("report_reads")
        .select("report_id")
        .eq("user_id", userId);
      const readIds = new Set((readRows ?? []).map((r) => r.report_id as string));
      let recap: ReportRecap | null = null;
      if (readIds.size > 0) {
        const { data: priorRows } = await db
          .from("reports")
          .select("id, date, markdown")
          .eq("user_id", userId)
          .eq("status", "complete")
          .lt("date", date)
          .order("date", { ascending: false });
        const prior = (priorRows ?? []) as { id: string; date: string; markdown: string | null }[];
        const lastReadDate = prior
          .filter((r) => readIds.has(r.id))
          .map((r) => r.date)
          .sort()
          .at(-1);
        const missed = lastReadDate ? prior.filter((r) => r.date > lastReadDate) : [];
        if (missed.length > 0) {
          const summary = await withDiagnostics("recap", () =>
            writeRecap(
              missed.map((m) => ({ date: m.date, markdown: m.markdown ?? "" })),
              meter,
            ),
          );
          if (summary) recap = { summary, days: missed.length };
        }
      }
      const finalContent: ReportContent = { ...content, recap };

      await db
        .from("reports")
        .update({ content: finalContent, markdown, status: "complete" })
        .eq("id", reportId);

      // Record these topics as briefed, so future reports skip the catch-up primer.
      if (topics.length > 0) {
        await db
          .from("user_topic_history")
          .upsert(
            topics.map((t) => ({ user_id: userId, topic_key: t.topicKey })),
            { onConflict: "user_id,topic_key", ignoreDuplicates: true },
          );
      }

      logger.info("report complete", {
        userId,
        date,
        reportId,
        sections: content.sections.length,
      });

      // Podcast generation is deliberately NOT automatic (it's the most expensive step): the user
      // asks for it per report from the app (POST /api/podcast -> generate-podcast task).

      return { reportId, skipped: false };
    } catch (error: any) {
      await db
        .from("reports")
        .update({ status: "failed", error_message: String(error?.message ?? error) })
        .eq("id", reportId);
      throw error; // rethrow so Trigger.dev records + retries
    }
  },
});
