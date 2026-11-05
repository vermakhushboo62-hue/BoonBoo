# BoonBoo 💗

A 30-day ritual for two, wrapped in a psychedelic UI. The dashboard is a **broken heart**:
each of its 8 pieces is one phase. A piece turns red and moves back into place as you
complete that phase together, mending from the top down. At 100% the cracks disappear and
the heart beats again.

Each of you uses BoonBoo on your own phone, and everything is shared right away.

## Phases (heart pieces)

| # | Phase | Mended when… |
|---|-------|--------------|
| 0 | Ground Rules | both partners agree to all six rules |
| 1 | One Honest Conversation | both answer the five questions (equal-time timer included) |
| 2 | Three Goals Each | each goal has *what / how often / how my partner will know* |
| 3 | Measurable Commitments | each goal is rewritten as an observable commitment |
| 4 | Progress Tracker | 4 weeks × 3 goals marked ✓ / ~ / ✕ for each person ("Copy weekly tracker" included) |
| 5 | Rewards | weekly + 30-day rewards agreed, three appreciations each |
| 6 | The Sunday Reset | the 20-minute weekly review is done for weeks 1–4 |
| 7 | 30-Day Evaluation | both answer, compare side by side, start the next cycle |

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
