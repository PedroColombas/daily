import OpenAI from "openai";
import { requireEnv } from "./env";
import { mapWithConcurrency } from "./concurrency";

// Lazy client (Trigger §2).
let client: OpenAI | null = null;

export function openai(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  }
  return client;
}

// TTS config — tunable. gpt-4o-mini-tts supports an `instructions` param to steer
// delivery (tone/pace), which the podcast step uses. ElevenLabs is the v2 path (CLAUDE.md).
export const TTS_MODEL = "gpt-4o-mini-tts";

// gpt-4o-mini-tts caps at ~2000 input tokens per request, so longer text must be
// segmented. We chunk conservatively by characters (~1000 tokens of headroom).
export const MAX_TTS_CHARS = 4000;

// OpenAI TTS is one request per chunk; its rate limits are generous, so run several concurrently.
const TTS_CONCURRENCY = 6;

export interface SpeechOptions {
  voice: string; // OpenAI voice timbre, e.g. "nova"
  instructions?: string; // delivery steering (gpt-4o-mini-tts only)
}

// One TTS request → one mp3 buffer.
async function synthesizeChunk(text: string, opts: SpeechOptions): Promise<Buffer> {
  const response = await openai().audio.speech.create({
    model: TTS_MODEL,
    // `voice` is an SDK string-literal union; cast at the boundary so config can drive it.
    voice: opts.voice as never,
    input: text,
    instructions: opts.instructions,
    response_format: "mp3",
  });
  return Buffer.from(await response.arrayBuffer());
}

export async function synthesizeSpeech(text: string, opts: SpeechOptions): Promise<Buffer> {
  // Chunks synthesised concurrently; concatenating mp3 frame buffers plays back fine (the whole
  // episode is later re-encoded to a uniform stream via ffmpeg).
  const parts = await mapWithConcurrency(chunkText(text, MAX_TTS_CHARS), TTS_CONCURRENCY, (c) =>
    synthesizeChunk(c, opts),
  );
  return Buffer.concat(parts);
}

// A single spoken turn in a multi-voice dialogue.
export interface DialogueTurn {
  speaker: string;
  text: string;
  section?: number; // 0-based report section index this turn covers (drives podcast chapters)
}

// Synthesise a dialogue: each turn is spoken in its speaker's voice, segments concatenated in order.
// `speakers` maps a speaker key → voice + delivery. We flatten every turn into its chunks and
// synthesise the whole episode through one bounded pool — far faster than one turn at a time. Order
// is preserved for a clean concat.
export async function synthesizeDialogue(
  turns: DialogueTurn[],
  speakers: Record<string, SpeechOptions>,
): Promise<Buffer> {
  const segments: { text: string; opts: SpeechOptions }[] = [];
  for (const turn of turns) {
    const voice = speakers[turn.speaker];
    if (!voice || !turn.text.trim()) continue; // skip unknown speakers / empty turns
    for (const chunk of chunkText(turn.text, MAX_TTS_CHARS)) {
      segments.push({ text: chunk, opts: voice });
    }
  }
  if (segments.length === 0) return Buffer.alloc(0);
  const parts = await mapWithConcurrency(segments, TTS_CONCURRENCY, (s) =>
    synthesizeChunk(s.text, s.opts),
  );
  return Buffer.concat(parts);
}

// Split into <=maxChars chunks on sentence boundaries; hard-split any oversized sentence.
// Exported so other TTS providers (elevenlabs-tts) can reuse the same segmentation.
export function chunkText(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += maxChars) {
        chunks.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }
    if ((current + sentence).length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current);

  return chunks.length > 0 ? chunks : [text];
}
