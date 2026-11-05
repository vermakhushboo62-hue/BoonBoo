// POST /api/patch  { by: "a"|"b", changes: [{ path, value }] }
// Saves each field separately so two people editing different fields never overwrite each other.

const MAX_CHANGES = 500;
const MAX_VALUE = 20000;          // one text field
const MAX_HISTORY = 1_000_000;    // archived past cycles are stored as one value
const PATH = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,8}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Expected JSON." }, 400); }
  const by = body.by === "a" || body.by === "b" ? body.by : null;
  const changes = Array.isArray(body.changes) ? body.changes : null;
  if (!changes || changes.length === 0 || changes.length > MAX_CHANGES) return json({ error: "Bad changes list." }, 400);

  for (const c of changes) {
    if (typeof c?.path !== "string" || !PATH.test(c.path) || typeof c.value !== "string") return json({ error: "Bad change." }, 400);
    if (c.value.length > (c.path === "history" ? MAX_HISTORY : MAX_VALUE)) return json({ error: `Too long: ${c.path}` }, 413);
  }

  const now = Date.now();
  const stmt = env.DB.prepare(
    `INSERT INTO fields (path, value, seq, by, updated_at)
     VALUES (?1, ?2, (SELECT COALESCE(MAX(seq), 0) + 1 FROM fields), ?3, ?4)
     ON CONFLICT (path) DO UPDATE SET value = excluded.value, seq = excluded.seq, by = excluded.by, updated_at = excluded.updated_at`
  );
  await env.DB.batch(changes.map((c) => stmt.bind(c.path, c.value, by, now)));
  const row = await env.DB.prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM fields").first();
  return json({ ok: true, cursor: row.cursor });
}
