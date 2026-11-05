// GET /api/changes?since=<seq> → every field updated after that sequence number.

const LIMIT = 2000;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const since = Math.max(0, parseInt(new URL(request.url).searchParams.get("since") || "0", 10) || 0);
  const { results } = await env.DB
    .prepare("SELECT path, value, seq, by FROM fields WHERE seq > ?1 ORDER BY seq LIMIT ?2")
    .bind(since, LIMIT)
    .all();
  const cursor = results.length ? results[results.length - 1].seq : since;
  return json({ changes: results, cursor, more: results.length === LIMIT });
}
