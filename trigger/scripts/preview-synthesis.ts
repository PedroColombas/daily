// Local preview of the REAL Opus 4.8 synthesis prompt — uses ONLY the Anthropic key.
// No Supabase / Perplexity / OpenAI needed; it feeds hand-made sample topics through the
// same synthesize() the pipeline uses, and prints the report.
//
// Run from the trigger/ directory:
//   PowerShell:  $env:ANTHROPIC_API_KEY="sk-ant-..."; npm run preview:synthesis
// In Spanish:   $env:PREVIEW_LANGUAGE="es"; npm run preview:synthesis

import { synthesize } from "../src/lib/synthesis";
import type { Preferences } from "@shared/types";
import type { FetchedTopic } from "../src/jobs/fetch-news";
import { readerLanguage } from "../src/lib/language";

const prefs: Preferences = {
  id: "preview",
  user_id: "preview",
  genres: ["Technology", "Science"],
  subtopics: {},
  custom_interests: [],
  exclusions: "",
  // Unused by synthesis since length and tone were fixed; kept because the type requires them.
  report_mode: "standard",
  voice: "analytical",
  max_topics: 5,
  context_depth: "quick",
  podcast_enabled: true,
  delivery_hour: 6,
  walkthrough_seen: true,
  tips_seen: [],
  is_demo: false,
  topic_order: [],
  language: readerLanguage(process.env.PREVIEW_LANGUAGE),
  topic_labels: {},
  updated_at: "2026-06-21T00:00:00Z",
};

// Sample research — stands in for what fetch-news would hand to synthesis. Fictional.
const topics: FetchedTopic[] = [
  {
    topic: "AI accelerator export rules",
    level: 1,
    genre: "Technology",
    recency: "week",
    query: "Latest AI chip export policy developments",
    topicKey: "genre:Technology",
    isPrimer: true,
    content:
      "Several governments tightened rules on exports of advanced AI accelerators this week. A new licensing tier was introduced covering chips above a set performance threshold, and at least two major manufacturers said they would adjust their product lines for affected markets. Analysts estimate the change touches a multi-billion-dollar slice of annual sales, though enforcement timelines remain unclear and some provisions face legal challenge.",
    sources: [
      {
        title: "Reuters: New licensing tier for AI chips",
        url: "https://example.com/reuters-chip-rules",
        date: "2026-06-19",
      },
      {
        title: "Financial Times: Manufacturers react to export curbs",
        url: "https://example.com/ft-chip-reaction",
        date: "2026-06-18",
      },
    ],
  },
  {
    topic: "Fusion energy milestone",
    level: 1,
    genre: "Science",
    recency: "month",
    query: "Recent fusion energy net-positive results",
    topicKey: "genre:Science",
    isPrimer: false,
    content:
      "A research consortium reported sustaining a net-energy-positive fusion reaction for a record duration in tests over the past month, crediting improved magnetic confinement and a new fuel-pellet design. Independent reviewers caution it is a laboratory milestone rather than a path to grid power, with commercial timelines likely a decade or more away.",
    sources: [
      {
        title: "Nature: Record fusion burn duration reported",
        url: "https://example.com/nature-fusion",
        date: "2026-06-02",
      },
      {
        title: "Science Daily: What the fusion result means",
        url: "https://example.com/sciencedaily-fusion",
        date: "2026-06-05",
      },
    ],
  },
  {
    topic: "Open-weights model release",
    level: 2,
    genre: "Technology",
    recency: "day",
    query: "New open-source AI model release today",
    topicKey: "sub:Technology:Open weights",
    isPrimer: false,
    content:
      "An AI lab released a new open-weights model in the last day, claiming parity with larger proprietary systems on several reasoning benchmarks while running on consumer hardware. Early testers report strong coding performance but mixed results on long-context tasks. The permissive license allows commercial use.",
    sources: [
      {
        title: "VentureBeat: Lab ships open-weights model",
        url: "https://example.com/vb-oss-model",
        date: "2026-06-21",
      },
    ],
  },
];

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Set ANTHROPIC_API_KEY first. PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."',
    );
    process.exit(1);
  }

  console.log(`\n=== Synthesis preview ===\n`);
  const { content, markdown } = await synthesize(prefs, topics);

  console.log("----- MARKDOWN -----\n");
  console.log(markdown);

  console.log("\n----- STRUCTURED SECTIONS -----\n");
  for (const s of content.sections) {
    console.log(`• [${s.timeframe}] ${s.topic} — ${s.sources.length} source(s)`);
  }
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
