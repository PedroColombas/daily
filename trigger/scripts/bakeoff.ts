// Model bake-off for report synthesis — the same research, the same prompt, the same quality guard,
// sent to several models side by side, so a cheaper model can be judged on real briefs before it
// goes anywhere near production. Nothing here writes to the database or touches a live brief.
//
//   • Input: real research from the shared search cache (topic_news_cache), read-only.
//   • Prompt: production's own — SYNTHESIS_SYSTEM, synthesisUserMessage, SYNTHESIS_SCHEMA.
//   • Judged by: production's own guard (finishSynthesis), plus a few cheap checks, plus the owner,
//     reading the results blind in bakeoff-out/report.html.
//
// Run from trigger/:
//   npx tsx scripts/bakeoff.ts                      everything
//   npx tsx scripts/bakeoff.ts --only=glm,qwen      some candidates (results merge into earlier ones)
//   npx tsx scripts/bakeoff.ts --brief=C            one brief
//   npx tsx scripts/bakeoff.ts --page-only          rebuild report.html from saved results, no calls
//
// Keys come from trigger/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY) and,
// for ANTHROPIC_API_KEY, ../apps/web/.env.local if it is not in trigger/.env. Never printed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { anthropic, firstText } from "../src/lib/anthropic";
import { anthropicUsage, estimateCostUsd } from "../src/lib/usage";
import {
  SYNTHESIS_SCHEMA,
  SYNTHESIS_SYSTEM,
  finishSynthesis,
  outletOf,
  synthesisUserMessage,
} from "../src/lib/synthesis";
import type { FetchedTopic } from "../src/jobs/fetch-news";
import type { Language, Preferences, ReportSection, ReportSource } from "@shared/types";

for (const file of [".env", "../apps/web/.env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file); // never overrides a value already set
}

// ── What is tested ──────────────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  label: string;
  via: "anthropic" | "openrouter";
  model: string;
  // Claude only: production runs Opus with adaptive thinking at medium effort. Haiku 4.5 supports
  // neither, so it runs plain.
  thinking?: boolean;
}

// Open-weight picks from OpenRouter's live list (2026-10-07), all with structured-output support:
// a large model, a mid-priced one, and a small one, to see where quality falls off.
const CANDIDATES: Candidate[] = [
  { id: "opus", label: "Claude Opus 4.8 (current)", via: "anthropic", model: "claude-opus-4-8", thinking: true },
  { id: "sonnet", label: "Claude Sonnet 4.6", via: "anthropic", model: "claude-sonnet-4-6", thinking: true },
  { id: "haiku", label: "Claude Haiku 4.5", via: "anthropic", model: "claude-haiku-4-5-20251001" },
  { id: "deepseek", label: "DeepSeek V4 Pro (open weights)", via: "openrouter", model: "deepseek/deepseek-v4-pro-0813" },
  { id: "glm", label: "GLM 5.3 (open weights)", via: "openrouter", model: "z-ai/glm-5.3" },
  { id: "qwen", label: "Qwen3.8 27B (open weights)", via: "openrouter", model: "qwen/qwen3.8-27b" },
  // Owner's picks (2026-10-07).
  { id: "mimo", label: "MiMo-V2.6-Pro (open weights)", via: "openrouter", model: "xiaomi/mimo-v2.6-pro" },
  { id: "dsflash", label: "DeepSeek V4.1 Flash (open weights)", via: "openrouter", model: "deepseek/deepseek-v4.1-flash" },
];

interface BriefSpec {
  id: string;
  title: string;
  language: Language;
  topics: { key: string; date: string }[]; // a "primer:" key is a first-time catch-up
}

// Built from what the cache actually holds. A tests telling overlapping stories apart, B mixes in a
// first-time catch-up (the heaviest kind of section), C is in Spanish.
const BRIEFS: BriefSpec[] = [
  {
    id: "A",
    title: "Four overlapping world-affairs topics (16 Sept)",
    language: "en",
    topics: [
      { key: "sub:Politics:Geopolitics", date: "2026-09-16" },
      { key: "sub:World:Conflicts", date: "2026-09-16" },
      { key: "sub:World:Diplomacy", date: "2026-09-16" },
      { key: "sub:Politics:Defense", date: "2026-09-16" },
    ],
  },
  {
    id: "B",
    title: "Three tech topics plus a first-time catch-up",
    language: "en",
    topics: [
      { key: "sub:Technology:AI", date: "2026-09-15" },
      { key: "sub:Technology:Cybersecurity", date: "2026-09-15" },
      { key: "sub:Technology:Semiconductors", date: "2026-09-15" },
      { key: "primer:sub:Climate:Emissions", date: "2026-10-06" },
    ],
  },
  {
    id: "C",
    title: "Your October topics, written in Spanish",
    language: "es",
    topics: [
      { key: "sub:Climate:Emissions", date: "2026-10-07" },
      { key: "sub:Health:Biotech", date: "2026-10-05" },
      { key: "sub:Technology:AI", date: "2026-10-03" },
    ],
  },
];

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────────

async function loadTopics(spec: BriefSpec): Promise<FetchedTopic[]> {
  const base = new URL(requireVar("SUPABASE_URL")).origin; // the dashboard shows it with /rest/v1/
  const key = requireVar("SUPABASE_SERVICE_ROLE_KEY");
  const out: FetchedTopic[] = [];
  for (const t of spec.topics) {
    const res = await fetch(
      `${base}/rest/v1/topic_news_cache?select=content,sources` +
        `&topic_key=eq.${encodeURIComponent(t.key)}&date=eq.${t.date}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) throw new Error(`cache read failed for ${t.key}: ${res.status}`);
    const [row] = (await res.json()) as { content: string; sources: ReportSource[] }[];
    if (!row) throw new Error(`no cached research for ${t.key} on ${t.date}`);
    const isPrimer = t.key.startsWith("primer:");
    const [, genre, sub] = t.key.replace(/^primer:/, "").split(":");
    out.push({
      topic: sub,
      level: 2,
      genre,
      recency: isPrimer ? "month" : "day",
      query: "",
      topicKey: t.key.replace(/^primer:/, ""),
      isPrimer,
      content: row.content,
      sources: row.sources,
    });
  }
  return out;
}

function prefsFor(spec: BriefSpec): Preferences {
  return {
    id: "bakeoff",
    user_id: "bakeoff",
    genres: [],
    subtopics: {},
    custom_interests: [],
    exclusions: "",
    report_mode: "standard",
    voice: "analytical",
    max_topics: 4,
    context_depth: "quick", // the column's default
    podcast_enabled: false,
    delivery_hour: 6,
    walkthrough_seen: true,
    tips_seen: [],
    is_demo: false,
    topic_order: [],
    language: spec.language,
    topic_labels: {},
    updated_at: new Date().toISOString(),
  };
}

// ── Calling each model ──────────────────────────────────────────────────────────────────────────

interface Reply {
  raw: string;
  truncated: boolean;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  costUsd: number | null;
  provider?: string;
}

async function callAnthropic(c: Candidate, userMessage: string): Promise<Reply> {
  const message = await anthropic()
    .messages.stream({
      model: c.model,
      max_tokens: 32000,
      ...(c.thinking ? { thinking: { type: "adaptive" as const } } : {}),
      output_config: {
        format: { type: "json_schema", schema: SYNTHESIS_SCHEMA },
        ...(c.thinking ? { effort: "medium" as const } : {}),
      },
      system: SYNTHESIS_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    })
    .finalMessage();
  const usage = anthropicUsage(message);
  return {
    raw: firstText(message.content),
    truncated: message.stop_reason === "max_tokens",
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    costUsd: estimateCostUsd({ stage: "synthesise", provider: "anthropic", model: c.model, ...usage }),
    provider: "anthropic",
  };
}

async function callOpenRouter(c: Candidate, userMessage: string): Promise<Reply> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireVar("OPENROUTER_API_KEY")}`,
      "Content-Type": "application/json",
      "X-Title": "Daily model bake-off",
    },
    body: JSON.stringify({
      model: c.model,
      max_tokens: 32000,
      messages: [
        { role: "system", content: SYNTHESIS_SYSTEM },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "report", strict: true, schema: SYNTHESIS_SCHEMA },
      },
      // Only route to hosts that honour the schema — the report depends on it.
      provider: { require_parameters: true },
      usage: { include: true }, // OpenRouter then reports what the call actually cost
    }),
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    provider?: string;
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  const choice = data.choices?.[0];
  return {
    raw: choice?.message?.content ?? "",
    truncated: choice?.finish_reason === "length",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
    costUsd: typeof data.usage?.cost === "number" ? data.usage.cost : null,
    provider: data.provider,
  };
}

// ── Checks ──────────────────────────────────────────────────────────────────────────────────────

interface Result {
  brief: string;
  candidate: string;
  ok: boolean; // passed production's own guard
  error?: string;
  fencedJson?: boolean; // wrapped its JSON in a code fence despite the schema — production would reject it
  sections?: ReportSection[];
  seconds: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number | null;
  provider?: string;
  words?: number;
  outletsNamed?: number; // distinct outlets from its sources that the prose names
  outletsAvailable?: number;
  spanish?: boolean; // for the Spanish brief: does it actually read as Spanish?
  at: string;
}

// "www.reuters.com" -> "reuters"; "ft.com" -> "ft". The part a writer would name.
function outletWord(url: string): string {
  const host = outletOf(url).split(".");
  return (host.length > 2 ? host[host.length - 2] : host[0]).toLowerCase();
}

function checks(sections: ReportSection[], topics: FetchedTopic[], language: Language) {
  const prose = sections.map((s) => `${s.topic}\n${s.summary}`).join("\n").toLowerCase();
  const outlets = new Set(
    topics.flatMap((t) => t.sources.map((s) => outletWord(s.url))).filter((w) => w.length >= 2),
  );
  const named = [...outlets].filter((w) => new RegExp(`\\b${w.replace(/[^a-z0-9]/g, "")}\\b`).test(prose));
  const count = (re: RegExp) => (prose.match(re) ?? []).length;
  const es = count(/\b(el|la|los|las|del|que|por|con|para|una|según|como)\b/g);
  const en = count(/\b(the|and|of|that|with|for|according|which)\b/g);
  return {
    words: prose.split(/\s+/).filter(Boolean).length,
    outletsNamed: named.length,
    outletsAvailable: outlets.size,
    spanish: language === "es" ? es > en * 3 : undefined,
  };
}

async function run(spec: BriefSpec, topics: FetchedTopic[], c: Candidate): Promise<Result> {
  const { userMessage, language } = synthesisUserMessage(prefsFor(spec), topics);
  const started = Date.now();
  const base = { brief: spec.id, candidate: c.id, at: new Date().toISOString() };
  try {
    const reply = c.via === "anthropic" ? await callAnthropic(c, userMessage) : await callOpenRouter(c, userMessage);
    const seconds = Math.round((Date.now() - started) / 1000);
    const meta = {
      seconds,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
      reasoningTokens: reply.reasoningTokens,
      costUsd: reply.costUsd,
      provider: reply.provider,
    };
    // Judged exactly as production would judge it first; a fenced reply is then unwrapped so its
    // writing can still be read, but it is marked — production would have failed it.
    let raw = reply.raw;
    const fenced = /^\s*```/.test(raw);
    if (fenced) raw = raw.replace(/^\s*```(?:json)?\s*/, "").replace(/```\s*$/, "");
    try {
      const { content } = finishSynthesis(raw, reply.truncated, topics, language);
      return { ...base, ...meta, ok: !fenced, fencedJson: fenced || undefined, sections: content.sections, ...checks(content.sections, topics, language) };
    } catch (err) {
      return { ...base, ...meta, ok: false, error: String((err as Error).message ?? err) };
    }
  } catch (err) {
    return { ...base, ok: false, seconds: Math.round((Date.now() - started) / 1000), error: String((err as Error).message ?? err) };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────────

const OUT_DIR = "bakeoff-out";
const RESULTS = `${OUT_DIR}/results.json`;

async function main() {
  if (process.argv.includes("--page-only")) {
    writeFileSync(`${OUT_DIR}/report.html`, renderReport(JSON.parse(readFileSync(RESULTS, "utf8"))));
    console.log(`Wrote ${OUT_DIR}/report.html (from saved results)`);
    return;
  }
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]?.split(",");
  const only = arg("only");
  const briefIds = arg("brief");
  const candidates = CANDIDATES.filter((c) => !only || only.includes(c.id));
  const briefs = BRIEFS.filter((b) => !briefIds || briefIds.includes(b.id));

  mkdirSync(OUT_DIR, { recursive: true });
  const previous: Result[] = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : [];
  const results = new Map(previous.map((r) => [`${r.brief}/${r.candidate}`, r]));

  const jobs: { spec: BriefSpec; topics: FetchedTopic[]; c: Candidate }[] = [];
  for (const spec of briefs) {
    const topics = await loadTopics(spec);
    for (const c of candidates) jobs.push({ spec, topics, c });
  }
  console.log(`${jobs.length} runs: ${briefs.map((b) => b.id).join(", ")} × ${candidates.map((c) => c.id).join(", ")}`);

  // A few at a time: each is one long request, and the providers' limits are generous.
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { spec, topics, c } = jobs[next++];
      const r = await run(spec, topics, c);
      results.set(`${r.brief}/${r.candidate}`, r);
      writeFileSync(RESULTS, JSON.stringify([...results.values()], null, 2));
      const cost = r.costUsd == null ? "?" : `$${r.costUsd.toFixed(4)}`;
      console.log(`${r.ok ? "ok  " : "FAIL"} ${r.brief} ${c.id.padEnd(9)} ${String(r.seconds).padStart(4)}s ${cost}${r.error ? `  ${r.error.slice(0, 160)}` : ""}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  writeFileSync(`${OUT_DIR}/report.html`, renderReport([...results.values()]));
  console.log(`\nWrote ${OUT_DIR}/report.html`);
}

function requireVar(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name} in trigger/.env`);
  return v;
}

// ── The page the owner reads ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

function prose(md: string): string {
  return md
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Same order for everyone opening the page, different per brief, so position gives nothing away.
function shuffled<T>(items: T[], seed: string): T[] {
  let h = [...seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((h = (h * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Briefs whose order has been seen (the owner revealed the models before scoring them) get a fresh
// order in which every report has moved — so the old positions give nothing away either.
const RESHUFFLED = new Set(["B", "C"]);

function orderFor<T extends { candidate: string }>(rows: T[], briefId: string): T[] {
  const first = shuffled(rows, briefId);
  if (!RESHUFFLED.has(briefId)) return first;
  for (let round = 1; round < 500; round++) {
    const next = shuffled(rows, `${briefId}:${round}`);
    if (next.every((r, i) => r.candidate !== first[i].candidate)) return next;
  }
  return first;
}

function renderReport(all: Result[]): string {
  const label = (id: string) => CANDIDATES.find((c) => c.id === id)?.label ?? id;
  const briefsHtml = BRIEFS.filter((b) => all.some((r) => r.brief === b.id))
    .map((b) => {
      const rows = orderFor(all.filter((r) => r.brief === b.id), b.id);
      const cards = rows
        .map((r, i) => {
          const n = i + 1;
          const body = r.sections
            ? r.sections.map((s) => `<h4>${esc(s.topic)}${s.isPrimer ? ' <span class="tag">catch-up</span>' : ""}</h4>${prose(s.summary)}`).join("")
            : `<p class="fail">No usable report: ${esc(r.error ?? "unknown")}</p>`;
          const facts = [
            r.ok ? "passed the production guard" : `<b>failed</b>${r.fencedJson ? " (JSON in a code fence)" : ""}`,
            r.costUsd != null ? `$${r.costUsd.toFixed(4)}` : "cost unknown",
            `${r.seconds}s`,
            r.words ? `${r.words} words` : "",
            r.outletsAvailable ? `names ${r.outletsNamed} of ${r.outletsAvailable} outlets` : "",
            r.spanish === undefined ? "" : r.spanish ? "reads as Spanish" : "<b>not in Spanish</b>",
            r.reasoningTokens ? `${r.reasoningTokens} thinking tokens` : "",
            r.provider ? `via ${esc(r.provider)}` : "",
          ].filter(Boolean).join(" · ");
          return `<article class="card" data-key="${b.id}/${r.candidate}">
  <header><span class="num">Report ${n}</span>
    <label>Your score <select data-rate="${b.id}/${r.candidate}"><option value="">–</option>${[1, 2, 3, 4, 5].map((v) => `<option>${v}</option>`).join("")}</select></label>
  </header>
  <div class="reveal"><strong>${esc(label(r.candidate))}</strong><br>${facts}</div>
  <div class="body">${body}</div>
</article>`;
        })
        .join("\n");
      return `<section><h2>Brief ${b.id} — ${esc(b.title)}</h2><div class="cards">${cards}</div></section>`;
    })
    .join("\n");

  const summaryRows = CANDIDATES.filter((c) => all.some((r) => r.candidate === c.id))
    .map((c) => {
      const rs = all.filter((r) => r.candidate === c.id);
      const costs = rs.map((r) => r.costUsd).filter((x): x is number => typeof x === "number");
      const avg = costs.length ? costs.reduce((a, x) => a + x, 0) / costs.length : null;
      return `<tr data-cand="${c.id}"><td>${esc(c.label)}</td><td>${rs.filter((r) => r.ok).length}/${rs.length}</td>
<td>${avg == null ? "?" : "$" + avg.toFixed(4)}</td><td>${Math.round(rs.reduce((a, r) => a + r.seconds, 0) / rs.length)}s</td><td class="score">–</td></tr>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Model bake-off</title>
<style>
:root{--paper:#faf8f4;--surface:#fff;--ink:#2d2014;--muted:#6b5d50;--line:#e6dfd4;--accent:#c0512b;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--paper:#17130f;--surface:#211b16;--ink:#f1ebe3;--muted:#b3a697;--line:#3a3129;--accent:#e07a52;--bad:#f97066}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1500px;margin:0 auto;padding:24px 16px 80px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:40px 0 12px}
.lede{color:var(--muted);max-width:70ch}button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:9px 18px;background:var(--accent);color:#fff;cursor:pointer}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;align-items:start}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px}
.card header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.num{font-weight:700;color:var(--accent)}
label{font-size:13px;color:var(--muted)}select{font:inherit;margin-left:4px}
.card h4{margin:14px 0 4px;font-size:15.5px}.card p{margin:0 0 8px;color:var(--ink)}.tag{font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:.06em}
.reveal{display:none;font-size:12.5px;color:var(--muted);background:var(--paper);border-radius:10px;padding:8px 10px;margin-bottom:6px}
body.revealed .reveal{display:block}.fail{color:var(--bad)}
table{border-collapse:collapse;margin-top:16px;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:6px 12px;text-align:left}
#summary{display:none}body.revealed #summary{display:block}
</style></head><body><main>
<h1>Model bake-off — report writing</h1>
<p class="lede">Each brief was written by every model from the same research, with production's prompt. Reports are shuffled and unnamed. Score each one from <strong>1 (worst) to 5 (best)</strong> on how good a brief it is to read: accurate, clear, each topic its own story, sources named. Then reveal which model wrote it. Scores are kept in this browser only.</p>
<button id="reveal">Reveal models</button>
<div id="summary"><table><thead><tr><th>Model</th><th>Passed</th><th>Avg cost / brief</th><th>Avg time</th><th>Your avg score</th></tr></thead><tbody>${summaryRows}</tbody></table></div>
${briefsHtml}
</main><script>
const KEY="bakeoff-scores";let scores={};try{scores=JSON.parse(localStorage.getItem(KEY)||"{}")}catch{}
document.querySelectorAll("select[data-rate]").forEach(s=>{s.value=scores[s.dataset.rate]||"";s.onchange=()=>{scores[s.dataset.rate]=s.value;try{localStorage.setItem(KEY,JSON.stringify(scores))}catch{};summarise()}});
function summarise(){document.querySelectorAll("tr[data-cand]").forEach(tr=>{const v=Object.entries(scores).filter(([k,x])=>x&&k.endsWith("/"+tr.dataset.cand)).map(([,x])=>+x);tr.querySelector(".score").textContent=v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1)+" ("+v.length+")":"–"})}
summarise();document.getElementById("reveal").onclick=e=>{document.body.classList.toggle("revealed");e.target.textContent=document.body.classList.contains("revealed")?"Hide models":"Reveal models"};
</script></body></html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
