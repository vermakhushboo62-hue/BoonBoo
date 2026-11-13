# BoonBoo 💗

A gentle ritual for two, wrapped in a psychedelic UI. Each of you uses it on your own phone,
and everything you write is shared right away.

- **Every Sunday (💌 Week):** write each other a short note: what you're thankful for, what
  you appreciated that week, and how you've noticed them growing. Then read them aloud.
- **Once a month (🌱 Month):** each choose one small thing to practise for yourself. Your
  partner doesn't track it; they write what they've *noticed*. At month end you each
  reflect, celebrate, and start a new month.
- **The heart (♥ Heart):** the left half is partner one's notes and the right half is
  partner two's, top to bottom = weeks 1–4. Each Sunday you both write, two pieces mend.
- **↗ Us:** all your notes week by week, both goals with what the other noticed, recent
  activity and past months. ⚙︎ holds names, backup and the gentle rules.

## Structure

```
public/                 the app (served as static files, no build step)
  index.html
  css/style.css         psychedelic theme
  js/app.js             phases, broken-heart SVG, timer, tracker, sync
src/worker.js           Cloudflare Worker: serves public/ and the shared-save API
wrangler.jsonc          Worker settings (static files, D1 database "boonboo")
```

API (every call needs the couple code in the `x-boonboo-key` header):

- `GET /api/changes?since=N` returns the fields changed since N.
- `POST /api/patch` saves the changed fields.

### How sharing works

- Every single answer, checkbox and tracker square is saved as its own row in a Cloudflare
  D1 database. Because of that, you can both type at the same time without overwriting each other.
- Each phone checks for the other's changes every 4 seconds, and straight away when you open the app.
- Each phone also keeps a full copy, so BoonBoo still works without signal and catches up later.
- Access needs the **couple code**, a secret only the two of you know. It's stored on
  Cloudflare as `BOONBOO_KEY` and typed in once per phone.
- If you open `public/index.html` without the Worker, BoonBoo saves on that device only.

## Hosting on Cloudflare Workers

The Worker `boonboo` is connected to this GitHub repo, so every push to `main` rebuilds
and redeploys it. On deploy, Cloudflare creates (or reuses) a D1 database named `boonboo`
and links it as `DB`, as set in `wrangler.jsonc`.

One manual step: set the couple code.
Workers & Pages → `boonboo` → Settings → Variables and Secrets → *Add* →
type **Secret**, name **`BOONBOO_KEY`**, value: a long phrase only you two know.
Then use *Deploy* (or push any change) so it takes effect.

Check it: open the site. The line under the logo should say **🔒 Enter your couple code**.
If it says **💾 Saved on this device**, the database or the secret isn't connected yet.

Optional extra lock: Cloudflare Zero Trust → Access → protect the site so only your two
email addresses can open it (free for up to 50 users).

## Run locally

Put `BOONBOO_KEY=test-code` in a file named `.dev.vars` in the repo root, then run:

```bash
npx wrangler dev
```

Then open http://localhost:8787 and enter `test-code`.
