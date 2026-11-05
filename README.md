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
public/                 the app (served as-is, no build step)
  index.html
  css/style.css         psychedelic theme
  js/app.js             phases, broken-heart SVG, timer, tracker, sync
functions/api/          Cloudflare Pages Functions (the shared save)
  _middleware.js        checks the couple code, creates the table on first use
  changes.js            GET  /api/changes?since=N  → fields changed since N
  patch.js              POST /api/patch            → save changed fields
```

### How sharing works

- Every single answer, checkbox and tracker square is saved as its own row in a Cloudflare
  D1 database. Because of that, you can both type at the same time without overwriting each other.
- Each phone checks for the other's changes every 4 seconds, and straight away when you open the app.
- Each phone also keeps a full copy, so BoonBoo still works without signal and catches up later.
- Access needs the **couple code**, a secret only the two of you know. It's stored on the
  server as `BOONBOO_KEY` and typed in once per phone.
- If you open `public/index.html` without the server, BoonBoo saves on that device only.

## Put it on Cloudflare (one-time, about 10 minutes)

1. **Create the database:** Cloudflare dashboard → Storage & Databases → D1 → *Create* →
   name it `boonboo`. (BoonBoo creates its table automatically on first use.)
2. **Create the site:** Workers & Pages → *Create* → *Pages* → *Connect to Git* → pick
   `BoonBoo`.
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`public`**
3. **Connect the database:** your Pages project → Settings → Bindings → *Add* → D1 database →
   variable name **`DB`** → database `boonboo`.
4. **Set the couple code:** Settings → Variables and Secrets → *Add* → type **Secret** →
   name **`BOONBOO_KEY`** → value: a long phrase only you two know (for example
   `four-random-words-we-love`). Longer is safer.
5. **Redeploy** (Deployments → ⋯ → *Retry deployment*) so the binding and secret take effect.
6. Open the `*.pages.dev` link on both phones, enter the couple code, tap your name, and
   use *Add to Home Screen*.

Every push to `main` redeploys automatically.

Optional extra lock: Cloudflare Zero Trust → Access → protect the site so only your two
email addresses can open it (free for up to 50 users).

## Run locally

```bash
npx wrangler pages dev public --d1 DB=boonboo-local --binding BOONBOO_KEY=test-code
```

Then open http://localhost:8788 and enter `test-code`.
