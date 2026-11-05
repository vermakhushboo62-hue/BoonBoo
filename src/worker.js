// BoonBoo Worker: serves the app from public/ and the shared-save API under /api/.
//   GET  /api/changes?since=N  → fields changed after sequence number N
//   POST /api/patch            → save changed fields { by: "a"|"b", changes: [{ path, value }] }
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
    .prepare("SELECT path, value, seq, by FROM fields WHERE seq > ?1 ORDER BY seq LIMIT ?2")
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
