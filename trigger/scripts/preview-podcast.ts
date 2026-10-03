// Local preview of the REAL two-person podcast interview script — uses ONLY the Anthropic
// key (no TTS / OpenAI needed). Feeds a sample report through the same writeScript() the
// pipeline uses and prints the transcript, so you can tune the host/expert personas.
//
// Run from the trigger/ directory:
//   PowerShell:  $env:ANTHROPIC_API_KEY="sk-ant-..."; npm run preview:podcast
// In Spanish:   $env:PREVIEW_LANGUAGE="es"; npm run preview:podcast
//   (the sample report is English, as most research is — the script is still written in Spanish)
//
// (The voices themselves are tuned later, with an OpenAI key, when you can hear them.)

import { writeScript } from "../src/lib/podcast-script";
import { readerLanguage } from "../src/lib/language";

// Stand-in for a synthesised report (what generate-report would hand to the podcast step).
const SAMPLE_REPORT = `# Your briefing — 21 June 2026

## AI accelerator export rules
According to Reuters, several governments tightened rules on exporting advanced AI accelerators over the last 7 days, introducing a new licensing tier for chips above a set performance threshold. The Financial Times reports that at least two major manufacturers will adjust their product lines for affected markets, touching a multi-billion-dollar slice of annual sales, though enforcement timelines remain unclear.

Sources: [Reuters: New licensing tier for AI chips](https://example.com/reuters-chip-rules) — 2026-06-19; [Financial Times: Manufacturers react](https://example.com/ft-chip-reaction) — 2026-06-18

## Fusion energy milestone
Nature reports that a research consortium sustained a net-energy-positive fusion reaction for a record duration in tests over the last 30 days, crediting improved magnetic confinement and a new fuel-pellet design. Independent reviewers stress it is a laboratory milestone rather than a path to grid power, with commercial timelines likely a decade or more away.

Sources: [Nature: Record fusion burn](https://example.com/nature-fusion) — 2026-06-02

## Open-weights model release
VentureBeat reports that an AI lab released a new open-weights model in the last 24 hours, claiming parity with larger proprietary systems on several reasoning benchmarks while running on consumer hardware. Early testers note strong coding performance but mixed results on long-context tasks; the permissive license allows commercial use.

Sources: [VentureBeat: Lab ships open-weights model](https://example.com/vb-oss-model) — 2026-06-21`;

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Set ANTHROPIC_API_KEY first. PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."',
    );
    process.exit(1);
  }

  console.log("\n=== Podcast interview preview (script only — no audio) ===\n");
  // Mark the first topic as a catch-up so the preview shows the primer framing.
  const turns = await writeScript(
    SAMPLE_REPORT,
    [
      { heading: "AI accelerator export rules", isPrimer: true },
      { heading: "Fusion energy milestone", isPrimer: false },
      { heading: "Open-weights model release", isPrimer: false },
    ],
    undefined,
    undefined,
    readerLanguage(process.env.PREVIEW_LANGUAGE),
  );

  for (const turn of turns) {
    const label = turn.speaker === "host" ? "HOST" : "EXPERT";
    console.log(`${label}: ${turn.text}\n`);
  }
  console.log(`(${turns.length} turns)\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
