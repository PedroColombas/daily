// What research the shared search cache holds — topic, day, size — to pick bake-off inputs from.
// Read-only. Run from trigger/:  node --env-file=.env scripts/bakeoff-inventory.mjs
// Origin only: the Data API page shows the URL with /rest/v1/ already on the end.
const url = process.env.SUPABASE_URL && new URL(process.env.SUPABASE_URL).origin;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in trigger/.env");

const res = await fetch(
  `${url}/rest/v1/topic_news_cache?select=topic_key,date,content,sources&order=date.desc&limit=60`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
if (!res.ok) throw new Error(`cache read failed: ${res.status} ${await res.text()}`);
const rows = await res.json();
for (const r of rows) {
  console.log(`${r.date}  ${r.topic_key.padEnd(48)}  ${String(r.content.length).padStart(6)} chars  ${r.sources.length} sources`);
}
console.log(`${rows.length} rows`);
