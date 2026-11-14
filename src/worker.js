// BoonBoo Worker: serves the app from public/ and the shared-save API under /api/.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

//   GET  /api/changes?since=N  → fields changed after sequence number N
//   POST /api/patch            → save changed fields { by: "a"|"b", changes: [{ path, value }] }
//   POST /api/insights         → Claude reads the couple's answers and suggests couple tasks
// Every request to /api/* needs the couple code (secret BOONBOO_KEY) in the x-boonboo-key header.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS fields (
     path TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     seq INTEGER NOT NULL,
     by TEXT,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS fields_seq ON fields (seq)`,
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
];
let ready = false;

const LIMIT = 2000;               // rows per pull
const MAX_CHANGES = 500;          // fields per save
const MAX_VALUE = 20000;          // one text field
const MAX_HISTORY = 1_000_000;    // archived past cycles are stored as one value
const PATH = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,8}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Compare SHA-256 digests so the check takes the same time whatever the input.
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

async function changes(url, env) {
  const since = Math.max(0, parseInt(url.searchParams.get("since") || "0", 10) || 0);
  const { results } = await env.DB
    .prepare("SELECT path, value, seq, by, updated_at FROM fields WHERE seq > ?1 ORDER BY seq LIMIT ?2")
    .bind(since, LIMIT)
    .all();
  const cursor = results.length ? results[results.length - 1].seq : since;
  return json({ changes: results, cursor, more: results.length === LIMIT });
}

// Each field is its own row, so two people editing different fields never overwrite each other.
async function patch(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Expected JSON." }, 400); }
  const by = body.by === "a" || body.by === "b" ? body.by : null;
  const list = Array.isArray(body.changes) ? body.changes : null;
  if (!list || list.length === 0 || list.length > MAX_CHANGES) return json({ error: "Bad changes list." }, 400);
  for (const c of list) {
    if (typeof c?.path !== "string" || !PATH.test(c.path) || typeof c.value !== "string") return json({ error: "Bad change." }, 400);
    if (c.value.length > (c.path === "history" ? MAX_HISTORY : MAX_VALUE)) return json({ error: `Too long: ${c.path}` }, 413);
  }
  const now = Date.now();
  const stmt = env.DB.prepare(
    `INSERT INTO fields (path, value, seq, by, updated_at)
     VALUES (?1, ?2, (SELECT COALESCE(MAX(seq), 0) + 1 FROM fields), ?3, ?4)
     ON CONFLICT (path) DO UPDATE SET value = excluded.value, seq = excluded.seq, by = excluded.by, updated_at = excluded.updated_at`
  );
  await env.DB.batch(list.map((c) => stmt.bind(c.path, c.value, by, now)));
  return json({ ok: true });
}

/* ---------------- AI insights ----------------
   The prompt is built here from what's in the database, never from the request body. */

const Insights = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  growth: z.array(z.string()),
  tasks: z.array(z.object({ title: z.string(), why: z.string(), when: z.string() })),
  care_note: z.string(),
});

const SYSTEM = `You are the gentle guide inside BoonBoo, an app a couple uses together to appreciate each other.
You read what both partners have written and reply to both of them at once.

How to write:
- Warm, plain and specific. Use their names and echo their own words where you can.
- Never take sides, assign blame, diagnose, or label either person.
- Frame growth as something they do together, not something one partner must fix.
- Keep it short: this is read on a phone.

What to return:
- summary: 2-3 sentences on what this relationship means to them and where it's heading.
- strengths: 2-3 things that are clearly working between them.
- growth: 2-3 gentle areas to grow together, each one sentence.
- tasks: 3-5 small couple tasks they can actually do soon. Each has a short title (under 8 words),
  a one-sentence "why" tied to something they wrote, and "when" (e.g. "This week", "Every evening",
  "This weekend", "This month"). Favour tasks that match how each of them likes to feel loved.
- care_note: empty string, unless something they wrote suggests fear, harm, control or a crisis;
  then one kind sentence encouraging them to talk to a qualified counsellor or local support service.`;

const QUESTIONS = {
  meaning: "What this relationship means to me",
  love: "What I love most about us",
  improve: "What I'd like us to improve",
  need: "What I need more of from my partner",
  feel: "How I most feel loved",
};

const FEEL_LABELS = { words: "kind words", time: "quality time", help: "help with things", touch: "hugs and closeness", gifts: "little surprises" };

async function insights(env) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "AI suggestions aren't switched on yet.", code: "ai-off" }, 503);

  const last = await env.DB.prepare("SELECT v FROM meta WHERE k = 'ai_last'").first();
  if (last && Date.now() - Number(last.v) < 60_000) return json({ error: "Give it a minute before asking again." }, 429);

  const { results } = await env.DB
    .prepare("SELECT path, value FROM fields WHERE path LIKE 'about.%' OR path LIKE 'names.%' OR path LIKE 'month.%' OR path LIKE 'week.%'")
    .all();
  const d = {};
  for (const r of results) { try { d[r.path] = JSON.parse(r.value); } catch { /* skip */ } }
  const name = (p) => (typeof d[`names.${p}`] === "string" && d[`names.${p}`].trim()) || (p === "a" ? "Partner A" : "Partner B");
  const has = (v) => typeof v === "string" && v.trim().length > 0;

  const answered = ["a", "b"].filter((p) => Object.keys(QUESTIONS).some((k) => has(d[`about.${p}.${k}`])));
  if (!answered.length) return json({ error: "Answer the welcome questions first." }, 400);

  const lines = [];
  for (const p of ["a", "b"]) {
    const other = name(p === "a" ? "b" : "a");
    lines.push(`## ${name(p)}`);
    for (const [k, q] of Object.entries(QUESTIONS)) {
      let v = d[`about.${p}.${k}`];
      if (!has(v)) continue;
      if (k === "feel") v = v.split(",").map((x) => FEEL_LABELS[x] || x).join(", ");
      lines.push(`- ${q}: ${v}`);
    }
    if (has(d[`month.${p}.goal`])) lines.push(`- Their goal this month: ${d[`month.${p}.goal`]}`);
    if (has(d[`month.${p}.observe`])) lines.push(`- What they've noticed about ${other}'s goal: ${d[`month.${p}.observe`]}`);
    for (let w = 0; w < 4; w++) {
      const note = ["thankful", "appreciated", "noticed"].map((k) => d[`week.${w}.${p}.${k}`]).filter(has);
      if (note.length) lines.push(`- Week ${w + 1} note to ${other}: ${note.join(" / ")}`);
    }
    if (!answered.includes(p)) lines.push(`- (${name(p)} hasn't answered the welcome questions yet.)`);
    lines.push("");
  }

  await env.DB.prepare("INSERT INTO meta (k, v) VALUES ('ai_last', ?1) ON CONFLICT (k) DO UPDATE SET v = excluded.v")
    .bind(String(Date.now())).run();

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
  try {
    const msg = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Insights) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Here is what ${name("a")} and ${name("b")} have shared in BoonBoo:\n\n${lines.join("\n")}` }],
    });
    if (msg.stop_reason === "refusal" || !msg.parsed_output) {
      return json({ error: "Couldn't create suggestions this time. Please try again later." }, 502);
    }
    return json({ insights: msg.parsed_output, at: Date.now() });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "The AI is busy right now. Try again in a minute." }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "The AI key isn't valid. Check ANTHROPIC_API_KEY in Cloudflare." }, 502);
    if (err instanceof Anthropic.APIError) return json({ error: "The AI couldn't answer right now. Try again later." }, 502);
    throw err;
  }
}

async function api(request, env, url) {
  if (!env.DB || !env.BOONBOO_KEY) {
    return json({ error: "BoonBoo isn't set up yet: it needs the D1 binding DB and the BOONBOO_KEY secret." }, 503);
  }
  const given = request.headers.get("x-boonboo-key") || "";
  if (!given || !(await sameSecret(given, env.BOONBOO_KEY))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return json({ error: "That couple code isn't right." }, 401);
  }
  if (!ready) { await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))); ready = true; }

  if (url.pathname === "/api/changes" && request.method === "GET") return changes(url, env);
  if (url.pathname === "/api/patch" && request.method === "POST") return patch(request, env);
  if (url.pathname === "/api/insights" && request.method === "POST") return insights(env);
  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(request, env, url); }
      catch (err) { return json({ error: "Server error: " + err.message }, 500); }
    }
    return env.ASSETS.fetch(request);
  },
};
