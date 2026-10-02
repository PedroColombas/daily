import { logger } from "@trigger.dev/sdk";
import { optionalEnv } from "./env";
import {
  synthesizeDialogue as openaiSynthesizeDialogue,
  chunkText,
  MAX_TTS_CHARS,
  TTS_MODEL,
  type DialogueTurn,
  type SpeechOptions,
} from "./openai-tts";
import { noMeter, type Meter, type UsageEvent } from "./usage";
import { elevenSynthesizeDialogue, ELEVEN_MODEL, type ElevenVoice } from "./elevenlabs-tts";
import { introMp3 } from "./intro-audio";
import { encodeUniformMp3 } from "./audio-encode";

// Podcast narration engine. ElevenLabs (multilingual_v2) is the quality path; OpenAI is the
// fallback, used automatically when the ElevenLabs key is absent or a call fails — so the daily
// podcast never breaks on a TTS outage or an empty balance. Flip TTS_PROVIDER to "openai" to
// force the old engine.
export type { DialogueTurn };

type TtsProvider = "elevenlabs" | "openai";
// Reverted to OpenAI — gpt-4o-mini-tts felt more natural here than ElevenLabs (v3 included), and
// it's far cheaper. The ElevenLabs path is kept intact; flip back to "elevenlabs" to re-enable.
const TTS_PROVIDER: TtsProvider = "openai";

// ── Casts: role → voice, per provider. The single place to tune the podcast's voices. ──

const OPENAI_CAST: Record<string, SpeechOptions> = {
  host: {
    voice: "nova",
    instructions:
      "A warm, curious podcast host chatting with an expert. Relaxed and genuinely engaged, " +
      "with natural intonation and an easy, unhurried pace — like a real person talking, not " +
      "reading aloud. Let reactions and questions sound spontaneous.",
  },
  expert: {
    // "ash" is brighter and less deep than "onyx", which read heavy/monotone. Easy to swap —
    // other lively male options: "verse", "ballad", "echo".
    voice: "ash",
    instructions:
      "A sharp, personable analyst being interviewed. Bright, upbeat and animated — real energy " +
      "and varied intonation, never flat, heavy, or monotone. Explains things conversationally, " +
      "like an enthusiastic friend who genuinely finds this interesting; keep it light on its feet.",
  },
};

// Female host + male expert (owner-chosen voices). To change, swap either voiceId with any voice
// from your ElevenLabs dashboard (Voices → ⋯ → "Copy voice ID"). If an id is invalid the call
// throws and we fall back to OpenAI, so podcasts keep working meanwhile.
// stability is 0.5 because eleven_v3 only accepts 0 / 0.5 / 1 (0=Creative, 0.5=Natural, 1=Robust);
// 0.5 is also valid for multilingual/flash, so it's safe across models.
const ELEVEN_CAST: Record<string, ElevenVoice> = {
  host: {
    voiceId: "AZLM4CsYOQDuqgTHYzxW", // female host
    settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
  },
  expert: {
    voiceId: "fvVBPXuE7f1iX3dZLKFy", // male expert
    settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
  },
};

// Narrate a set of turns to a single voice track. Tries ElevenLabs first (when enabled and keyed),
// falls back to OpenAI on any failure.
async function narrate(turns: DialogueTurn[], meter: Meter): Promise<Buffer> {
  const started = Date.now();
  const useEleven = TTS_PROVIDER === "elevenlabs" && !!optionalEnv("ELEVENLABS_API_KEY");
  if (useEleven) {
    try {
      const audio = await elevenSynthesizeDialogue(turns, ELEVEN_CAST);
      // So the run log clearly states which engine + model actually narrated (verifiable, no guessing).
      logger.info(`TTS narrated via ElevenLabs (${ELEVEN_MODEL})`);
      await meter({
        ...ttsEvent(turns),
        provider: "elevenlabs",
        model: ELEVEN_MODEL,
        durationMs: Date.now() - started,
      });
      return audio;
    } catch (err) {
      logger.warn("ElevenLabs TTS failed — falling back to OpenAI", {
        error: String((err as { message?: string })?.message ?? err),
      });
    }
  }
  logger.info("TTS narrated via OpenAI");
  const audio = await openaiSynthesizeDialogue(turns, OPENAI_CAST);
  await meter({
    ...ttsEvent(turns),
    provider: "openai",
    model: TTS_MODEL,
    durationMs: Date.now() - started,
  });
  return audio;
}

// Speech APIs return no usage, so what a narration costs is derived from the text: one request per
// chunk, and minutes estimated at 150 wpm (the same rate the player's duration estimate uses).
function ttsEvent(turns: DialogueTurn[]): Pick<UsageEvent, "stage" | "requests" | "extra"> {
  const spoken = turns.filter((t) => t.text.trim());
  const characters = spoken.reduce((n, t) => n + t.text.length, 0);
  const words = spoken.reduce((n, t) => n + t.text.trim().split(/\s+/).length, 0);
  const requests = spoken.reduce((n, t) => n + chunkText(t.text, MAX_TTS_CHARS).length, 0);
  return {
    stage: "tts",
    requests,
    extra: { turns: spoken.length, characters, words, estimated_minutes: words / 150 },
  };
}

// Narrate the full episode with the branded intro sting placed after the host's opening (welcome +
// preview + any recap) and before the expert first speaks. The three pieces are re-encoded to ONE
// uniform mp3 via ffmpeg so the 44.1kHz/stereo sting can't be silently dropped by iOS's decoder
// (which locks onto the first frame's format). If ffmpeg fails for ANY reason we ship voice-only
// (opening + rest, no sting) so an episode never breaks on the audio-assembly step.
export async function synthesizeDialogue(
  turns: DialogueTurn[],
  meter: Meter = noMeter,
): Promise<Buffer> {
  if (turns.length === 0) return Buffer.alloc(0);

  // The sting lands right after the host's opening welcome + topic preview (the first turn) and
  // BEFORE any catch-up recap — the script is structured welcome+preview → catch-up → topics.
  const split = 1;

  const opening = await narrate(turns.slice(0, split), meter);
  const rest = split < turns.length ? await narrate(turns.slice(split), meter) : Buffer.alloc(0);

  try {
    // encodeUniformMp3 drops empty buffers, so an empty `rest` (few-turn episode) is safe.
    const mixed = await encodeUniformMp3([opening, introMp3(), rest]);
    if (mixed.length === 0) throw new Error("uniform encode returned empty audio");
    return mixed;
  } catch (err) {
    logger.warn("intro re-encode failed — shipping voice-only episode (no sting)", {
      error: String((err as { message?: string })?.message ?? err),
    });
    // Voice-only fallback: both pieces are same-format OpenAI mp3, so a raw join is clean.
    return Buffer.concat([opening, rest]);
  }
}
