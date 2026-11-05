# BoonBoo 💗

A 30-day ritual for two, wrapped in a psychedelic UI. The dashboard is a **shattered heart**:
each of its 8 shards is one phase, and a shard drifts back into place and lights up as you
complete that phase together. At 100% the heart is whole again and starts beating.

## Phases (shards)

| # | Phase | Mended when… |
|---|-------|--------------|
| 0 | Ground Rules | both partners agree to all six rules |
| 1 | One Honest Conversation | both answer the five questions (equal-time timer included) |
| 2 | Three Goals Each | each goal has *what / how often / how my partner will know* |
| 3 | Measurable Commitments | each goal is rewritten as an observable commitment |
| 4 | Progress Tracker | 4 weeks × 3 goals marked ✓ / ~ / ✕ for each person ("Copy weekly tracker" included) |
| 5 | Rewards | weekly + 30-day rewards agreed, three appreciations each |
| 6 | The Sunday Reset | the 20-minute weekly review is done for weeks 1–4 |
| 7 | 30-Day Evaluation | both answer independently (with "hide my answers"), then compare side by side and start the next cycle |

## Structure

```
index.html      page shell
css/style.css   psychedelic theme
js/app.js       state, phases, broken-heart SVG, timer, tracker
```

No build step and no dependencies apart from Google Fonts.

## Data and privacy

Everything is saved in the browser's `localStorage` on the device you use. Nothing is sent
anywhere. Use **Export backup** and **Import backup** in the footer to move data between devices.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploying to Cloudflare (planned)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect this GitHub repo.
2. Framework preset: **None**. Build command: *(empty)*. Output directory: `/`.
3. Every push to `main` redeploys.

Optional later: sync between two phones with Cloudflare D1 or KV plus a small Pages Function,
behind Cloudflare Access so only the two of you can sign in.
