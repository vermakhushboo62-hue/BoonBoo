// Runs before every /api/* request: checks the couple code and makes sure the table exists.

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

export async function onRequest({ request, env, next }) {
  if (!env.DB || !env.BOONBOO_KEY) {
    return json({ error: "BoonBoo isn't set up yet: add the D1 binding DB and the BOONBOO_KEY secret." }, 503);
  }
  const given = request.headers.get("x-boonboo-key") || "";
  if (!given || !(await sameSecret(given, env.BOONBOO_KEY))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return json({ error: "That couple code isn't right." }, 401);
  }
  if (!ready) {
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    ready = true;
  }
  return next();
}
