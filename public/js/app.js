/* BoonBoo — a 30-day ritual for two. Data lives in localStorage only. */
(() => {
  "use strict";

  const KEY = "boonboo-v1";
  const WEEKS = 4;
  const P = ["a", "b"];

  const PHASES = [
    { id: "rules",    n: "0", title: "Ground Rules",            short: "Rules",    c: ["#ff2bd6", "#ff7a1a"] },
    { id: "talk",     n: "1", title: "One Honest Conversation", short: "Talk",     c: ["#ff7a1a", "#ffe14d"] },
    { id: "goals",    n: "2", title: "Three Goals Each",        short: "Goals",    c: ["#ffe14d", "#9dff3a"] },
    { id: "measure",  n: "3", title: "Measurable Commitments",  short: "Measure",  c: ["#9dff3a", "#00ffb0"] },
    { id: "track",    n: "4", title: "Progress Tracker",        short: "Track",    c: ["#00ffb0", "#00e5ff"] },
    { id: "rewards",  n: "5", title: "Rewards",                 short: "Rewards",  c: ["#00e5ff", "#8a2bff"] },
    { id: "review",   n: "6", title: "The Sunday Reset",        short: "Sunday",   c: ["#8a2bff", "#d42bff"] },
    { id: "evaluate", n: "7", title: "30-Day Evaluation",       short: "30 Days",  c: ["#d42bff", "#ff2bd6"] },
  ];

  const RULES = [
    ["No scorekeeping during arguments.", "The tracker is for improvement, not ammunition."],
    ["No empty promises.", "Commit only to what you can realistically deliver."],
    ["No hiding from difficult conversations.", "If either of us needs a break, we agree on when to resume."],
    ["Equal accountability.", "We both have three goals. Nobody is the teacher or student."],
    ["Progress over perfection.", "A setback is a chance to correct, not to abandon the exercise."],
    ["Actions matter more than words.", "Trust is rebuilt through repeated, observable behaviour."],
  ];

  const TALK_Q = [
    "What is bothering me?",
    "What do I feel is missing in our relationship?",
    "What am I personally doing that contributes to the problem?",
    "What do I need from my partner?",
    "What am I willing to change?",
  ];

  const REVIEW_Q = [
    "What did I accomplish this week?",
    "Where did I fall short?",
    "What stopped me from following through?",
    "What did my partner do that I appreciated?",
    "What will I do differently next week?",
  ];

  const EVAL_Q = [
    "Have I become more accountable?",
    "Have I become more comfortable facing difficult conversations?",
    "Do I feel heard and respected?",
    "Have I seen consistent changes in my partner?",
    "Do I want to continue building on this?",
  ];

  const GOAL_EXAMPLES = [
    "Take ownership of household responsibilities.",
    "Be more transparent and consistent.",
    "Address difficult conversations instead of avoiding them.",
    "Communicate instead of withdrawing.",
    "Follow through on commitments.",
    "Make dedicated time for the relationship.",
  ];

  const MEASURE_EXAMPLES = [
    ["Be responsible", "Complete agreed responsibilities without repeated reminders."],
    ["Be loyal", "Maintain agreed relationship boundaries and be transparent."],
    ["Communicate better", "Discuss difficult issues instead of avoiding them."],
    ["Spend more time together", "Have two distraction-free sessions every week."],
    ["Be emotionally available", "Listen and acknowledge concerns without dismissing them."],
  ];

  const CELL = { "": "", done: "✓", partial: "~", missed: "✕" };
  const CELL_NEXT = { "": "done", done: "partial", partial: "missed", missed: "" };

  /* ---------------- state ---------------- */
  const arr = (n, f) => Array.from({ length: n }, (_, i) => (typeof f === "function" ? f(i) : f));
  const blankGoal = () => ({ what: "", freq: "", proof: "", measurable: "" });

  function fresh() {
    return {
      v: 1,
      names: { a: "Boon", b: "Boo" },
      startDate: null,
      rules: { a: arr(6, false), b: arr(6, false) },
      talk: { minutes: 15, prep: arr(3, false), a: arr(5, ""), b: arr(5, ""), respond: "" },
      goals: { a: arr(3, blankGoal), b: arr(3, blankGoal) },
      track: { a: arr(3, () => arr(WEEKS, "")), b: arr(3, () => arr(WEEKS, "")), notes: arr(WEEKS, () => ({ well: "", improve: "" })) },
      rewards: { weekly: "", monthly: "", earned: arr(WEEKS, false), monthlyEarned: false, appreciate: { a: arr(3, ""), b: arr(3, "") } },
      review: arr(WEEKS, () => ({ a: arr(5, ""), b: arr(5, ""), corrective: "" })),
      evaluate: { a: arr(5, () => ({ score: "", note: "" })), b: arr(5, () => ({ score: "", note: "" })), next: "" },
      history: [],
    };
  }

  function merge(base, saved) {
    if (Array.isArray(base)) return Array.isArray(saved) ? base.map((v, i) => (i in saved ? merge(v, saved[i]) : v)).concat(saved.slice(base.length)) : base;
    if (base && typeof base === "object") {
      const out = { ...base };
      if (saved && typeof saved === "object") for (const k of Object.keys(saved)) out[k] = k in base ? merge(base[k], saved[k]) : saved[k];
      return out;
    }
    return saved === undefined || (base !== null && typeof saved !== typeof base) ? base : saved;
  }

  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? merge(fresh(), JSON.parse(raw)) : fresh(); }
    catch { return fresh(); }
  }
  let S = load();
  const saveLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ } };
  const save = () => { saveLocal(); Sync.schedulePush(); };

  const get = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), S);
  function set(path, val) {
    const ks = path.split("."); const last = ks.pop();
    const o = ks.reduce((o, k) => o[k], S); o[last] = val;
  }

  /* ---------------- sync between your two phones ----------------
     Each leaf value (one text box, one checkbox, one tracker square) is saved as its own
     row on the server, so you can both type at the same time without overwriting each
     other. The phone keeps a full copy in localStorage and keeps working offline. */
  const LINK_KEY = "boonboo-link";
  const Sync = {
    mode: "local",      // local | locked | online | saving | offline
    key: "", me: "",
    cursor: 0,
    base: {},           // the server's value for each path, as last seen
    timer: null, poll: null, pushing: false, again: false,
    error: "", dirty: false,

    // who last changed each field, and when (powers the "recent activity" feed)
    meta: (() => { try { return JSON.parse(localStorage.getItem("boonboo-meta")) || {}; } catch { return {}; } })(),
    note(c) { if (c.by) this.meta[c.path] = { by: c.by, at: c.updated_at || Date.now() }; },
    saveMeta() { try { localStorage.setItem("boonboo-meta", JSON.stringify(this.meta)); } catch { /* ignore */ } },

    readLink() { try { return JSON.parse(localStorage.getItem(LINK_KEY)) || {}; } catch { return {}; } },
    writeLink() { try { localStorage.setItem(LINK_KEY, JSON.stringify({ key: this.key, me: this.me })); } catch { /* ignore */ } },

    api(path, opts = {}, key = this.key) {
      return fetch("/api/" + path, { ...opts, cache: "no-store", headers: { "content-type": "application/json", "x-boonboo-key": key } });
    },

    async start() {
      const link = this.readLink();
      this.key = link.key || ""; this.me = link.me || "";
      let r;
      try { r = await this.api("changes?since=0"); } catch { return this.setMode("local"); }
      const isJson = (r.headers.get("content-type") || "").includes("json");
      if (r.status === 401 && isJson) { this.setMode("locked"); return render(true); }
      if (!r.ok || !isJson) return this.setMode("local");   // no server (e.g. opened locally)
      await this.first(await r.json());
    },

    async connect(key, me) {
      let r;
      try { r = await this.api("changes?since=0", {}, key); } catch { this.error = "Couldn't reach BoonBoo. Check your internet."; return render(); }
      if (r.status === 401) { this.error = "That couple code isn't right."; return render(); }
      if (!r.ok) { this.error = "Something went wrong on the server. Try again in a minute."; return render(); }
      this.key = key; this.me = me; this.error = ""; this.writeLink();
      await this.first(await r.json());
      confetti(60); toast("Connected. You're in this together now 💞");
    },

    // First contact: what's on the server wins; anything only on this phone gets uploaded.
    async first(data) {
      this.cursor = 0; this.base = {};
      for (;;) {
        for (const c of data.changes) { applyPath(c.path, c.value); this.base[c.path] = c.value; this.note(c); }
        this.cursor = data.cursor;
        if (!data.more) break;
        data = await (await this.api("changes?since=" + this.cursor)).json();
      }
      saveLocal(); this.saveMeta();
      this.setMode("online");
      render();
      await this.push();
      clearInterval(this.poll);
      this.poll = setInterval(() => { if (document.visibilityState === "visible") this.pull(); }, 4000);
    },

    async pull() {
      if (!["online", "saving", "offline"].includes(this.mode)) return;
      let data;
      try {
        const r = await this.api("changes?since=" + this.cursor);
        if (r.status === 401) { this.setMode("locked"); return render(true); }
        if (!r.ok) throw new Error(r.status);
        data = await r.json();
      } catch { return this.setMode("offline"); }
      const local = flatten(S), changed = [];
      for (const c of data.changes) {
        const unsent = local[c.path] !== this.base[c.path];   // you edited it and it hasn't been saved yet
        this.base[c.path] = c.value; this.note(c);
        if (unsent || local[c.path] === c.value) continue;
        applyPath(c.path, c.value); changed.push(c.path);
      }
      this.cursor = data.cursor;
      if (this.mode === "offline") this.setMode("online");
      this.saveMeta();
      if (changed.length) { saveLocal(); showRemote(changed); }
      if (data.more) this.pull();
    },

    schedulePush() {
      if (!["online", "saving", "offline"].includes(this.mode)) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.push(), 500);
    },

    async push() {
      if (this.pushing) { this.again = true; return; }
      const local = flatten(S);
      const changes = Object.keys(local).filter((p) => local[p] !== this.base[p]).map((p) => ({ path: p, value: local[p] }));
      if (!changes.length) return;
      this.pushing = true; this.setMode("saving");
      try {
        for (let i = 0; i < changes.length; i += 400) {
          const part = changes.slice(i, i + 400);
          const r = await this.api("patch", { method: "POST", body: JSON.stringify({ by: this.me, changes: part }) });
          if (r.status === 401) { this.pushing = false; this.setMode("locked"); return render(true); }
          if (!r.ok) throw new Error(r.status);
          for (const c of part) { this.base[c.path] = c.value; this.note({ path: c.path, by: this.me, updated_at: Date.now() }); }
          this.saveMeta();
        }
        this.setMode("online");
      } catch {
        this.setMode("offline");
        clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 8000);
      }
      this.pushing = false;
      if (this.again) { this.again = false; this.push(); }
    },

    forget() {
      clearInterval(this.poll);
      try { localStorage.removeItem(LINK_KEY); } catch { /* ignore */ }
      this.key = ""; this.me = ""; this.setMode("locked"); render(true);
    },

    setMode(m) {
      this.mode = m;
      const el = document.getElementById("sync"); if (!el) return;
      const txt = {
        local: "💾 Saved on this device",
        locked: "🔒 Enter your couple code",
        online: "💞 Shared between your phones",
        saving: "✨ Saving…",
        offline: "⚠️ Offline: will save when you're back",
      }[m];
      el.textContent = txt; el.dataset.mode = m;
      const ub = document.getElementById("unlinkBtn");
      if (ub) ub.hidden = !["online", "saving", "offline"].includes(m);
      const pv = document.getElementById("privacy");
      if (pv) pv.textContent = m === "local"
        ? "🔒 Everything stays on this device — nothing is sent anywhere."
        : "🔒 Shared only between the two of you, protected by your couple code.";
    },
  };

  // Every leaf of the state as "path" → JSON text. Past cycles (history) are kept as one value.
  function flatten(o, pre = "", out = {}) {
    for (const k of Object.keys(o)) {
      const p = pre ? pre + "." + k : k, v = o[k];
      if (p === "history" || v === null || typeof v !== "object") out[p] = JSON.stringify(v);
      else flatten(v, p, out);
    }
    return out;
  }
  function applyPath(path, value) {
    try {
      const ks = path.split("."), last = ks.pop();
      let o = S;
      for (const k of ks) { if (o[k] == null || typeof o[k] !== "object") return; o = o[k]; }
      o[last] = JSON.parse(value);
    } catch { /* unknown or malformed field from a newer version: ignore */ }
  }
  // Show your partner's changes without yanking the box you're typing in.
  function showRemote(paths) {
    const ae = document.activeElement;
    if (ae && ae.dataset && ae.dataset.bind) {
      for (const p of paths) {
        const el = document.querySelector(`[data-bind="${p}"]`);
        if (!el || el === ae) continue;
        if (el.type === "checkbox") el.checked = !!get(p); else el.value = get(p) ?? "";
      }
      Sync.dirty = true;
      refreshLive();
    } else {
      render();
    }
  }

  /* ---------------- progress ---------------- */
  const filled = (s) => typeof s === "string" && s.trim().length > 0;
  const frac = (xs) => (xs.length ? xs.filter(Boolean).length / xs.length : 0);

  const progress = {
    rules: () => frac([...S.rules.a, ...S.rules.b]),
    talk: () => frac([...S.talk.a, ...S.talk.b].map(filled)),
    goals: () => frac(P.flatMap((p) => S.goals[p].flatMap((g) => [g.what, g.freq, g.proof].map(filled)))),
    measure: () => frac(P.flatMap((p) => S.goals[p].map((g) => filled(g.measurable)))),
    track: () => frac(P.flatMap((p) => S.track[p].flat().map((c) => c !== ""))),
    rewards: () => frac([filled(S.rewards.weekly), filled(S.rewards.monthly), ...P.flatMap((p) => S.rewards.appreciate[p].map(filled))]),
    review: () => frac(S.review.flatMap((w) => P.map((p) => w[p].filter(filled).length >= 3))),
    evaluate: () => frac(P.flatMap((p) => S.evaluate[p].map((e) => e.score !== ""))),
  };
  const overall = () => PHASES.reduce((s, ph) => s + progress[ph.id](), 0) / PHASES.length;

  /* ---------------- helpers ---------------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const name = (p) => esc(S.names[p] || (p === "a" ? "Partner A" : "Partner B"));
  const tag = (p) => `<div class="person-tag"><span class="dot ${p}"></span>${name(p)}${Sync.me === p ? '<span class="you">you</span>' : ""}</div>`;
  const pct = (x) => Math.round(x * 100);

  function field(path, label, { area = false, ph = "", hint = "", rerender = false } = {}) {
    const v = esc(get(path));
    const attrs = `data-bind="${path}" placeholder="${esc(ph)}"${rerender ? " data-rerender" : ""}`;
    const input = area ? `<textarea ${attrs}>${v}</textarea>` : `<input type="text" ${attrs} value="${v}" />`;
    return `<label class="fld"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span>${input}</label>`;
  }
  const check = (path, label) =>
    `<label class="check"><input type="checkbox" data-bind="${path}" ${get(path) ? "checked" : ""} /><span>${label}</span></label>`;

  function head(id, lead) {
    const ph = PHASES.find((x) => x.id === id);
    return `<div class="phase-head"><div><div class="eyebrow">Phase ${ph.n} · ${pct(progress[id]())}% mended</div><h1>${ph.title}</h1>${lead ? `<p class="lead">${lead}</p>` : ""}</div>${nextBtn(id)}</div>`;
  }
  function nextBtn(id) {
    const i = PHASES.findIndex((x) => x.id === id);
    const nx = PHASES[i + 1];
    return nx ? `<a class="btn" href="#${nx.id}">Next: ${nx.short} →</a>` : `<a class="btn" href="#dashboard">See our heart →</a>`;
  }

  function nextSunday(from = new Date()) {
    const d = new Date(from); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d;
  }
  const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  function cycleDay() {
    if (!S.startDate) return null;
    const start = new Date(S.startDate + "T00:00:00");
    const days = Math.floor((Date.now() - start.getTime()) / 864e5) + 1;
    return Math.max(1, days);
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2400);
  }
  function confetti(n = 70) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cols = ["#ff2bd6", "#ffe14d", "#9dff3a", "#00e5ff", "#8a2bff", "#ff7a1a"];
    for (let i = 0; i < n; i++) {
      const c = document.createElement("i");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = cols[i % cols.length];
      c.style.animationDuration = 1.8 + Math.random() * 1.8 + "s";
      c.style.animationDelay = Math.random() * 0.4 + "s";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4200);
    }
  }

  /* ---------------- the broken heart ---------------- */
  const HEART = "M100 182 C 42 138, 0 104, 0 58 C 0 24, 26 2, 56 2 C 76 2, 92 14, 100 32 C 108 14, 124 2, 144 2 C 174 2, 200 24, 200 58 C 200 104, 158 138, 100 182 Z";
  /* A classic broken heart: one jagged crack splits it into left and right halves, and
     three side cracks split each half into four pieces. Pieces are numbered top to bottom,
     alternating left/right, so the heart mends from the top down as the phases progress. */
  const SHARDS = (() => {
    const C = [[100, -30], [100, 25], [93, 50], [107, 72], [91, 96], [109, 118], [93, 140], [106, 160], [100, 195], [100, 240]];
    const L = [ // side cracks on the left, each starting on the centre crack
      [C[2], [70, 40], [45, 52], [20, 38], [-40, 45]],
      [C[4], [65, 90], [42, 104], [18, 92], [-40, 100]],
      [C[6], [72, 132], [55, 150], [30, 140], [-40, 150]],
    ];
    const R = [
      [C[3], [130, 62], [152, 76], [178, 60], [240, 66]],
      [C[5], [135, 112], [158, 124], [182, 108], [240, 115]],
      [C[7], [125, 150], [145, 165], [165, 150], [240, 160]],
    ];
    const rev = (a) => a.slice().reverse();
    const left = [
      [C[0], C[1], C[2], ...L[0].slice(1), [-40, -30]],
      [C[2], C[3], C[4], ...L[1].slice(1), ...rev(L[0].slice(1))],
      [C[4], C[5], C[6], ...L[2].slice(1), ...rev(L[1].slice(1))],
      [C[6], C[7], C[8], C[9], [-40, 240], ...rev(L[2].slice(1))],
    ];
    const right = [
      [C[0], C[1], C[2], C[3], ...R[0].slice(1), [240, -30]],
      [C[3], C[4], C[5], ...R[1].slice(1), ...rev(R[0].slice(1))],
      [C[5], C[6], C[7], ...R[2].slice(1), ...rev(R[1].slice(1))],
      [C[7], C[8], C[9], [240, 240], ...rev(R[2].slice(1))],
    ];
    const centres = { L: [[52, 32], [52, 75], [55, 118], [75, 158]], R: [[148, 34], [150, 90], [145, 135], [118, 168]] };
    const str = (pts) => pts.map((p) => p.join(",")).join(" ");
    const shards = [];
    for (let row = 0; row < 4; row++) {
      shards.push({ side: -1, row, poly: str(left[row]), cx: centres.L[row][0], cy: centres.L[row][1] });
      shards.push({ side: 1, row, poly: str(right[row]), cx: centres.R[row][0], cy: centres.R[row][1] });
    }
    // cracks, each with the two shard indices it separates
    const seg = (a, b) => str([C[a], C[b]]);
    const cracks = [
      [seg(1, 2), 0, 1], [seg(2, 3), 1, 2], [seg(3, 4), 2, 3], [seg(4, 5), 3, 4],
      [seg(5, 6), 4, 5], [seg(6, 7), 5, 6], [seg(7, 8), 6, 7],
      [str(L[0]), 0, 2], [str(L[1]), 2, 4], [str(L[2]), 4, 6],
      [str(R[0]), 1, 3], [str(R[1]), 3, 5], [str(R[2]), 5, 7],
    ];
    return { shards, cracks };
  })();

  function heartSVG() {
    const prog = PHASES.map((ph) => progress[ph.id]());
    const whole = prog.every((p) => p >= 1);
    // A real heart is red: every piece goes from deep red to a hint of its phase colour.
    const defs = PHASES.map((ph, k) =>
      `<linearGradient id="g${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff1f4b"/><stop offset="0.65" stop-color="#e0105f"/><stop offset="1" stop-color="${ph.c[1]}"/></linearGradient>`).join("");
    const shards = SHARDS.shards.map((s, k) => {
      const p = prog[k], q = 1 - p;
      const dx = s.side * (6 + Math.abs(s.cx - 100) * 0.12) * q;
      const dy = (s.row - 1.5) * 5 * q;
      const rot = s.side * 7 * q;
      const style = `transform-origin:${s.cx}px ${s.cy}px;transform:translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg);filter:saturate(${(0.2 + p * 1.1).toFixed(2)}) brightness(${(0.5 + p * 0.6).toFixed(2)});opacity:${(0.6 + p * 0.4).toFixed(2)}`;
      return `<g class="shard" data-go="${PHASES[k].id}" style="${style}" role="link" tabindex="0" aria-label="${PHASES[k].title}: ${pct(p)}% mended"><title>${PHASES[k].title} — ${pct(p)}% mended</title>
        <g clip-path="url(#heartClip)"><polygon points="${s.poly}" fill="url(#g${k})"/><polygon points="${s.poly}" fill="url(#swirl)" opacity="0.35"/></g>
        <g clip-path="url(#heartClip)"><polygon points="${s.poly}" fill="none" stroke="#fff" stroke-opacity="${(0.15 + p * 0.5).toFixed(2)}" stroke-width="1.2"/></g></g>`;
    }).join("");
    const cracks = SHARDS.cracks.map(([pts, i, j]) => {
      const healed = Math.min(prog[i], prog[j]);
      return `<polyline class="crack" points="${pts}" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" opacity="${((1 - healed) * 0.8).toFixed(2)}" clip-path="url(#heartClip)" filter="url(#glow)"/>`;
    }).join("");
    const total = pct(overall());
    return `<svg class="heart-svg${whole ? " whole" : ""}" viewBox="-40 -40 280 270" role="img" aria-label="Our heart is ${total}% mended">
      <defs>${defs}
        <clipPath id="heartClip"><path d="${HEART}"/></clipPath>
        <pattern id="swirl" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="4" fill="none" stroke="#000" stroke-width="1.4"/></pattern>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <radialGradient id="aura"><stop offset="0" stop-color="#ff2bd6" stop-opacity="${(0.15 + overall() * 0.55).toFixed(2)}"/><stop offset="1" stop-color="#ff2bd6" stop-opacity="0"/></radialGradient>
      </defs>
      <circle cx="100" cy="92" r="135" fill="url(#aura)"/>
      <path d="${HEART}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-dasharray="3 5"/>
      <g class="heart-body">${shards}${cracks}</g>
      <text x="100" y="92" text-anchor="middle" class="heart-pct" fill="#fff" stroke="#1a0033" stroke-width="5" paint-order="stroke">${total}%</text>
      <text x="100" y="112" text-anchor="middle" font-size="10" letter-spacing="2" fill="#fff" stroke="#1a0033" stroke-width="3" paint-order="stroke">${whole ? "WHOLE AGAIN" : "MENDED"}</text>
    </svg>`;
  }

  /* ---------------- views ---------------- */
  const views = {};

  views.dashboard = () => {
    const day = cycleDay();
    const sun = nextSunday();
    const isSunday = new Date().getDay() === 0;
    const plist = PHASES.map((ph) => {
      const p = progress[ph.id]();
      return `<li><a href="#${ph.id}"><div class="top-line"><span>${ph.n}. ${ph.title}</span><span>${pct(p)}%</span></div><div class="bar"><i style="width:${pct(p)}%"></i></div></a></li>`;
    }).join("");
    const legend = PHASES.map((ph) => `<a href="#${ph.id}"><b>${ph.n}</b>${ph.short}</a>`).join("");
    return `
    <section class="dash">
      <div class="card heart-card">
        <div class="eyebrow">Our heart</div>
        <div class="heart-wrap">${heartSVG()}</div>
        <div class="heart-legend">${legend}</div>
        <p class="muted" style="margin-top:12px">Every piece is one phase, mending from the top down. Do the work together and watch the halves come back together. Tap a piece to jump in.</p>
      </div>
      <div class="stack">
        ${growthCard()}
        <div class="card">
          <div class="eyebrow">Who's in</div>
          <div class="grid2" style="gap:12px;margin-top:8px">
            ${field("names.a", '<span class="dot a"></span> Partner one', { ph: "Name", rerender: true })}
            ${field("names.b", '<span class="dot b"></span> Partner two', { ph: "Name", rerender: true })}
          </div>
        </div>
        <div class="card">
          <div class="eyebrow">Our 30 days</div>
          ${day
            ? `<div class="row" style="justify-content:space-between"><div><div class="big-num">Day ${Math.min(day, 30)}<span class="muted" style="font-size:22px"> / 30</span></div>
                <p class="muted">Week ${Math.min(Math.ceil(day / 7), WEEKS)} · started ${new Date(S.startDate + "T00:00:00").toLocaleDateString()}</p></div>
                ${day >= 30 ? `<a class="btn" href="#evaluate">Time to evaluate →</a>` : ""}</div>
                <div class="bar" style="margin-top:8px"><i style="width:${Math.min(100, (day / 30) * 100)}%"></i></div>`
            : `<p>Not started yet. Begin when you've both agreed to the ground rules.</p><button class="btn" data-action="start">Begin our 30 days</button>`}
        </div>
        <div class="card">
          <div class="eyebrow">The Sunday Reset</div>
          <h3>${isSunday ? "It's Sunday — reset time ✨" : `Next reset: ${fmtDate(sun)}`}</h3>
          <ul class="ritual">
            <li>20 minutes every Sunday</li><li>One honest conversation</li><li>Three goals each</li>
            <li>One appreciation each</li><li>One shared reward when earned</li><li>Repeat for 30 days</li>
          </ul>
          <a class="btn sm" href="#review" style="margin-top:10px">Open this week's reset</a>
        </div>
        <div class="card"><div class="eyebrow">Phases</div><ul class="plist" style="margin-top:10px">${plist}</ul></div>
      </div>
    </section>`;
  };

  views.rules = () => `
    ${head("rules", "These are what make the whole thing work. Each of you reads them and agrees, separately, in your own column.")}
    <div class="grid2">
      ${P.map((p) => `<div class="card">${tag(p)}${RULES.map((r, i) => check(`rules.${p}.${i}`, `<strong>${i + 1}. ${r[0]}</strong> <span class="muted">${r[1]}</span>`)).join("")}</div>`).join("")}
    </div>
    <div class="rule" style="margin-top:18px"><strong>A distinction:</strong> rewards in this tool recognise genuine effort and consistency. They are never a bargaining chip for basic respect, loyalty or honesty.</div>`;

  views.talk = () => `
    ${head("talk", "Set aside 30–45 minutes without phones, distractions or interruptions. Each person gets equal time to answer the same five questions.")}
    <div class="rule"><strong>Rule:</strong> no interrupting, defending, blaming or dismissing. First listen, then respond.</div>
    <div class="grid2" style="margin-top:18px">
      <div class="card">
        <h3>Before you begin</h3>
        ${check("talk.prep.0", "We've set aside 30–45 minutes")}
        ${check("talk.prep.1", "Phones are away, on silent, out of reach")}
        ${check("talk.prep.2", "No interruptions expected (kids, guests, work)")}
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between"><h3 style="margin:0">Equal-time timer</h3>
          <label class="row" style="gap:6px;font-size:14px">Min each <input type="number" min="1" max="60" style="width:70px" data-bind="talk.minutes" data-num value="${S.talk.minutes}" /></label></div>
        <div class="timer" style="margin-top:12px">
          ${P.map((p) => `<div class="speaker" id="spk-${p}"><div class="who">${name(p)} speaks</div><div class="clock" id="clk-${p}">--:--</div></div>`).join("")}
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" data-action="timer-toggle" id="tBtn">Start</button>
          <button class="btn ghost sm" data-action="timer-switch">Switch speaker</button>
          <button class="btn ghost sm" data-action="timer-reset">Reset</button>
        </div>
      </div>
    </div>
    <div class="grid2" style="margin-top:18px">
      ${P.map((p) => `<div class="card">${tag(p)}${TALK_Q.map((q, i) => field(`talk.${p}.${i}`, `${i + 1}. ${q}`, { area: true, ph: "In my own words…" })).join("")}</div>`).join("")}
    </div>
    <div class="card" style="margin-top:18px">
      ${field("talk.respond", "After listening: what did we each hear?", { area: true, ph: "Reflect back what you heard before responding. “What I heard you say is…”" })}
    </div>`;

  views.goals = () => `
    ${head("goals", "Each person identifies three specific goals about behaviours that can actually be changed. These are examples, not assumptions about either of you.")}
    <div class="card"><h3>Need a starting point?</h3><p class="muted">Tap an example to drop it into your next empty goal.</p>
      <div class="grid2">${P.map((p) => `<div><div class="person-tag" style="font-size:16px"><span class="dot ${p}"></span>for ${name(p)}</div>${GOAL_EXAMPLES.map((g) => `<button class="chip" data-fill="${p}" data-text="${esc(g)}">${esc(g)}</button>`).join("")}</div>`).join("")}</div>
    </div>
    <div class="grid2" style="margin-top:18px">
      ${P.map((p) => `<div class="card">${tag(p)}${S.goals[p].map((g, i) => `
        <h3 style="color:var(--sun)">Goal ${i + 1}</h3>
        ${field(`goals.${p}.${i}.what`, "What exactly will I do?", { ph: "A specific behaviour" })}
        ${field(`goals.${p}.${i}.freq`, "How frequently?", { ph: "e.g. every evening, twice a week" })}
        ${field(`goals.${p}.${i}.proof`, "How will my partner know I've followed through?", { ph: "Something they can observe" })}`).join('<hr style="border:0;border-top:1px solid var(--line);margin:18px 0">')}</div>`).join("")}
    </div>`;

  views.measure = () => `
    ${head("measure", "Avoid vague goals like “be more responsible” or “be more loving”. Turn each goal into a commitment someone could actually observe.")}
    <div class="card table-scroll"><table><thead><tr><th>Vague goal</th><th>Measurable commitment</th></tr></thead>
      <tbody>${MEASURE_EXAMPLES.map(([v, m]) => `<tr><td class="muted">${v}</td><td>${m}</td></tr>`).join("")}</tbody></table></div>
    <div class="grid2" style="margin-top:18px">
      ${P.map((p) => `<div class="card">${tag(p)}${S.goals[p].map((g, i) =>
        field(`goals.${p}.${i}.measurable`, `Goal ${i + 1}: ${esc(g.what) || '<span class="muted">(not written yet)</span>'}`, {
          area: true, ph: "What I'll do, how often, and how you'll see it", hint: [g.freq, g.proof].filter(filled).map(esc).join(" · "),
        })).join("")}</div>`).join("")}
    </div>`;

  const goalLabel = (p, i) => {
    const g = S.goals[p][i];
    return esc(g.measurable || g.what) || `<span class="muted">Goal ${i + 1}</span>`;
  };

  views.track = () => `
    ${head("track", "Evidence means observable actions, not surveillance. Each person records their own progress; review it together once a week.")}
    <div class="row" style="justify-content:space-between;margin-bottom:12px">
      <div class="legend-row"><span style="--c:var(--done)">✓ followed through</span><span style="--c:var(--partial)">~ partly</span><span style="--c:var(--missed)">✕ missed</span><span>tap a square to change it</span></div>
      <button class="btn sm" data-action="copy-tracker">Copy weekly tracker</button>
    </div>
    <div class="grid2">
      ${P.map((p) => `<div class="card table-scroll">${tag(p)}<table class="tracker"><thead><tr><th>Goal</th>${arr(WEEKS, (w) => `<th>W${w + 1}</th>`).join("")}</tr></thead><tbody>
        ${S.track[p].map((row, i) => `<tr><td class="goal-name">${goalLabel(p, i)}</td>${row.map((c, w) =>
          `<td><button class="cell ${c}" data-cycle="track.${p}.${i}.${w}" aria-label="${name(p)} goal ${i + 1} week ${w + 1}: ${c || "not marked"}">${CELL[c]}</button></td>`).join("")}</tr>`).join("")}
      </tbody></table></div>`).join("")}
    </div>
    <div class="grid2" style="margin-top:18px">
      ${S.track.notes.map((_, w) => `<div class="card"><h3>Week ${w + 1}</h3>
        ${field(`track.notes.${w}.well`, "What went well?", { area: true })}
        ${field(`track.notes.${w}.improve`, "What needs improvement?", { area: true })}</div>`).join("")}
    </div>`;

  views.rewards = () => `
    ${head("rewards", "This is where it becomes motivating rather than another responsibility. Agree on rewards before starting.")}
    <div class="grid3">
      <div class="card"><div class="eyebrow">Weekly · small win</div>
        ${field("rewards.weekly", "Our weekly reward", { ph: "A favourite meal, a movie night, a coffee date…" })}
        <p class="muted" style="font-size:14px">Earned it?</p>
        <div class="row">${S.rewards.earned.map((e, w) => `<button class="cell ${e ? "done" : ""}" data-toggle="rewards.earned.${w}" aria-label="Week ${w + 1} reward earned">${e ? "★" : w + 1}</button>`).join("")}</div>
      </div>
      <div class="card"><div class="eyebrow">30 days · big win</div>
        ${field("rewards.monthly", "Our 30-day reward", { ph: "A special dinner, a day trip, something you've both wanted…" })}
        <button class="btn ${S.rewards.monthlyEarned ? "" : "ghost"} sm" data-toggle="rewards.monthlyEarned">${S.rewards.monthlyEarned ? "★ Earned!" : "Mark as earned"}</button>
      </div>
      <div class="card"><div class="eyebrow">Recognition</div><h3>Three appreciations each</h3>
        <p class="muted">Share three things you appreciated about the other's efforts. Write yours below.</p></div>
    </div>
    <div class="grid2" style="margin-top:18px">
      ${P.map((p) => `<div class="card">${tag(p)}<p class="muted">What I appreciated about ${name(p === "a" ? "b" : "a")}'s effort:</p>
        ${S.rewards.appreciate[p].map((_, i) => field(`rewards.appreciate.${p}.${i}`, `${i + 1}.`, { ph: "I noticed when you…" })).join("")}</div>`).join("")}
    </div>
    <div class="rule" style="margin-top:18px"><strong>One important distinction:</strong> rewards recognise genuine effort and consistency. They are never used to bargain for basic respect, loyalty or honesty.</div>`;

  let reviewWeek = null;
  views.review = () => {
    if (reviewWeek === null) { const d = cycleDay(); reviewWeek = d ? Math.min(Math.ceil(d / 7), WEEKS) - 1 : 0; }
    const w = reviewWeek;
    return `
    ${head("review", `Every Sunday, sit together for 20 minutes. Next one: <strong>${fmtDate(nextSunday())}</strong>.`)}
    <div class="row" style="margin-bottom:16px"><span class="muted">Review for</span>
      <div class="seg">${arr(WEEKS, (i) => `<button class="${i === w ? "on" : ""}" data-week="${i}">Week ${i + 1}</button>`).join("")}</div>
    </div>
    <div class="grid2">
      ${P.map((p) => `<div class="card">${tag(p)}${REVIEW_Q.map((q, i) => field(`review.${w}.${p}.${i}`, `${i + 1}. ${q}`, { area: true })).join("")}</div>`).join("")}
    </div>
    <div class="card" style="margin-top:18px">
      ${field(`review.${w}.corrective`, "If someone missed a goal: why, and what's our corrective action?", { area: true, ph: "Discuss the reason, agree on one concrete fix." })}
      <p class="muted" style="margin:0">Don't turn the review into a trial.</p>
    </div>`;
  };

  const hiddenEval = { a: false, b: false };
  const VERDICT = { yes: "Yes", growing: "Getting there", no: "Not yet" };
  views.evaluate = () => {
    const done = P.every((p) => S.evaluate[p].every((e) => e.score));
    return `
    ${head("evaluate", "At the end of the month, each of you answers independently. Hide your column while your partner answers, then compare together.")}
    <div class="grid2">
      ${P.map((p) => `<div class="card"><div class="row" style="justify-content:space-between">${tag(p)}
        <button class="btn ghost sm" data-hide="${p}">${hiddenEval[p] ? "Show my answers" : "Hide my answers"}</button></div>
        <div class="${hiddenEval[p] ? "hidden-col" : ""}">
        ${EVAL_Q.map((q, i) => `<div class="fld"><span>${i + 1}. ${q}</span>
          <div class="seg" style="margin-bottom:8px">${Object.entries(VERDICT).map(([k, v]) => `<button class="${S.evaluate[p][i].score === k ? "on" : ""}" data-set="evaluate.${p}.${i}.score" data-val="${k}">${v}</button>`).join("")}</div>
          <input type="text" data-bind="evaluate.${p}.${i}.note" value="${esc(S.evaluate[p][i].note)}" placeholder="Why? (optional)" /></div>`).join("")}
        </div></div>`).join("")}
    </div>
    ${done ? `<div class="card table-scroll" style="margin-top:18px"><h2>Side by side</h2>
      <table class="compare"><thead><tr><th>Question</th><th>${name("a")}</th><th>${name("b")}</th></tr></thead><tbody>
      ${EVAL_Q.map((q, i) => `<tr><td>${q}</td>${P.map((p) => { const e = S.evaluate[p][i]; return `<td><span class="verdict ${e.score}">${VERDICT[e.score]}</span>${e.note ? `<div class="muted" style="font-size:14px;margin-top:4px">${esc(e.note)}</div>` : ""}</td>`; }).join("")}</tr>`).join("")}
      </tbody></table></div>` : `<p class="muted" style="margin-top:14px">The side-by-side comparison appears once you've both answered all five.</p>`}
    <div class="card" style="margin-top:18px">
      ${field("evaluate.next", "Our next 30-day goals", { area: true, ph: "What we keep, what we change, what we add" })}
      <button class="btn" data-action="new-cycle">Start the next 30 days</button>
      <p class="muted" style="font-size:14px;margin-top:8px">Saves this month to your history, keeps your goals and clears the tracker, reviews and evaluation.</p>
      ${S.history.length ? `<p class="muted" style="font-size:14px">Cycles completed: ${S.history.length}</p>` : ""}
    </div>`;
  };

  let connectAs = "";
  function connectView() {
    return `<section class="card connect">
      <div class="eyebrow">Welcome to BoonBoo</div>
      <h1>Join your shared heart</h1>
      <p class="muted">Enter the couple code the two of you chose. You only need to do this once on each phone.</p>
      <form id="connectForm" autocomplete="off">
        <label class="fld"><span>Couple code</span><input type="password" id="coupleCode" required autocomplete="current-password" placeholder="Your secret code" /></label>
        <div class="fld"><span>Who's holding this phone?</span>
          <div class="row">${P.map((p) => `<button type="button" class="btn ${connectAs === p ? "" : "ghost"}" data-me="${p}"><span class="dot ${p}"></span> ${name(p)}</button>`).join("")}</div>
          <small class="muted">This just marks your column with “you”. You can still see and edit everything.</small></div>
        ${Sync.error ? `<p class="err">${esc(Sync.error)}</p>` : ""}
        <button class="btn" type="submit">Connect</button>
      </form>
    </section>`;
  }


  /* ---------------- growth & analytics ---------------- */
  const SCORE = { done: 1, partial: 0.5, missed: 0 };
  const SERIES = { a: "#f0209f", b: "#0aa0d8" };   // validated pair (dark surface, CVD-safe)
  const other = (p) => (p === "a" ? "b" : "a");
  let localViewer = (() => { try { return localStorage.getItem("boonboo-viewer") || "a"; } catch { return "a"; } })();
  const viewer = () => Sync.me || localViewer;
  const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const marked = (cells) => cells.filter((c) => c in SCORE).map((c) => SCORE[c]);
  const weekRate = (p, w) => avg(marked(S.track[p].map((row) => row[w])));
  const goalRate = (p, i) => avg(marked(S.track[p][i]));
  const allRate = (p) => avg(marked(S.track[p].flat()));
  const pctOr = (x, dash = "—") => (x == null ? dash : pct(x) + "%");
  function thisWeek() { const d = cycleDay(); return d ? Math.min(Math.ceil(d / 7), WEEKS) - 1 : 0; }
  function streak(p) { // consecutive weeks (ending with the latest marked week) at 75%+
    let n = 0;
    for (let w = WEEKS - 1; w >= 0; w--) { const r = weekRate(p, w); if (r == null) { if (n) break; continue; } if (r >= 0.75) n++; else break; }
    return n;
  }
  const countFilled = (xs) => xs.filter(filled).length;
  const reviewsDone = (p) => S.review.filter((w) => w[p].filter(filled).length >= 3).length;

  function lineChart() {
    const W = 400, H = 210, L = 40, R = 58, T = 16, B = 30;
    const x = (w) => L + (w * (W - L - R)) / (WEEKS - 1);
    const y = (v) => T + (1 - v) * (H - T - B);
    const grid = [0, 0.5, 1].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.12)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${v * 100}%</text>`).join("");
    const xs = arr(WEEKS, (w) => `<text x="${x(w)}" y="${H - 10}" text-anchor="middle" class="ax">W${w + 1}</text>`).join("");
    const lines = P.map((p) => {
      const pts = arr(WEEKS, (w) => [w, weekRate(p, w)]).filter(([, v]) => v != null);
      if (!pts.length) return "";
      const d = pts.map(([w, v], i) => `${i ? "L" : "M"}${x(w)},${y(v)}`).join(" ");
      const dots = pts.map(([w, v]) => `<circle cx="${x(w)}" cy="${y(v)}" r="5" fill="${SERIES[p]}" stroke="#140630" stroke-width="2"/>
        <circle cx="${x(w)}" cy="${y(v)}" r="16" fill="transparent" data-tip="${name(p)} · Week ${w + 1}: ${pct(v)}% followed through"/>`).join("");
      const [lw, lv] = pts[pts.length - 1];
      return `<path d="${d}" fill="none" stroke="${SERIES[p]}" stroke-width="2" stroke-linejoin="round" ${p === "b" ? 'stroke-dasharray="6 4"' : ""}/>${dots}
        <text x="${x(lw) + 10}" y="${y(lv) + (p === "a" ? -6 : 14)}" class="lbl">${name(p)}</text>`;
    }).join("");
    const empty = P.every((p) => allRate(p) == null);
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Weekly follow-through for both partners">${grid}${xs}${lines}
      ${empty ? `<text x="${(W + L - R) / 2}" y="${H / 2}" text-anchor="middle" class="ax">Mark squares in the tracker to see your growth</text>` : ""}</svg>`;
  }
  const legend = () => `<div class="legend">${P.map((p) => `<span><svg width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" stroke="${SERIES[p]}" stroke-width="2" ${p === "b" ? 'stroke-dasharray="6 4"' : ""}/></svg>${name(p)}</span>`).join("")}</div>`;
  const chartTable = () => `<details class="tbl"><summary>Show as table</summary><table><thead><tr><th></th>${arr(WEEKS, (w) => `<th>W${w + 1}</th>`).join("")}</tr></thead>
    <tbody>${P.map((p) => `<tr><td>${name(p)}</td>${arr(WEEKS, (w) => `<td>${pctOr(weekRate(p, w))}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;

  function statTiles(p) {
    const wk = thisWeek();
    return `<div class="tiles">
      <div class="tile"><div class="tv">${pctOr(allRate(p))}</div><div class="tl">follow-through overall</div></div>
      <div class="tile"><div class="tv">${pctOr(weekRate(p, wk))}</div><div class="tl">this week (W${wk + 1})</div></div>
      <div class="tile"><div class="tv">${streak(p)}</div><div class="tl">week streak at 75%+</div></div>
      <div class="tile"><div class="tv">${reviewsDone(p)}/${WEEKS}</div><div class="tl">Sunday reviews</div></div>
    </div>`;
  }

  function label(path) {
    const k = path.split("."), n = (i) => Number(k[i]) + 1;
    switch (k[0]) {
      case "rules": return "agreed to a ground rule";
      case "talk": return k[2] ? `answered “${TALK_Q[k[2]]}”` : "updated the honest conversation";
      case "goals": return k[3] === "measurable" ? `made goal ${n(2)} measurable` : `updated goal ${n(2)}`;
      case "track": return k[1] === "notes" ? `wrote week ${n(2)} notes` : `marked goal ${n(2)}, week ${n(3)}: ${{ done: "✓ done", partial: "~ partly", missed: "✕ missed", "": "cleared" }[get(path)] ?? "updated"}`;
      case "rewards": return k[1] === "appreciate" ? "shared an appreciation 💗" : k[1] === "earned" || k[1] === "monthlyEarned" ? "marked a reward earned ★" : "updated the rewards";
      case "review": return `wrote their Sunday review (week ${n(1)})`;
      case "evaluate": return "answered the 30-day evaluation";
      case "names": return "changed the names";
      case "startDate": return "started the 30 days";
      default: return "made an update";
    }
  }
  function ago(t) {
    const s = Math.max(1, Math.round((Date.now() - t) / 1000));
    if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago";
  }
  function feed(p, limit = 8) {
    const items = Object.entries(Sync.meta).filter(([, m]) => m.by === p).sort((a, b) => b[1].at - a[1].at);
    const out = []; const seen = new Set();
    for (const [path, m] of items) { const l = label(path); if (seen.has(l)) continue; seen.add(l); out.push(`<li><span>${esc(l)}</span><span class="muted">${ago(m.at)}</span></li>`); if (out.length >= limit) break; }
    if (!out.length) return `<p class="muted">${Sync.mode === "local" ? "Activity shows here once you're both connected." : `Nothing from ${name(p)} yet.`}</p>`;
    return `<ul class="feed">${out.join("")}</ul>`;
  }

  function growthCard() {
    const me = viewer(), them = other(me);
    return `<div class="card"><div class="row" style="justify-content:space-between"><div class="eyebrow">Our growth</div><a class="btn ghost sm" href="#us">All insights →</a></div>
      <div class="duo">${P.map((p) => `<div><div class="person-tag" style="font-size:16px;margin:0"><span class="dot ${p}"></span>${name(p)}</div><div class="tv">${pctOr(allRate(p))}</div><div class="tl">follow-through · ${streak(p)} wk streak</div></div>`).join("")}</div>
      ${legend()}${lineChart()}
      <h3 style="margin-top:12px">Latest from ${name(them)}</h3>${feed(them, 3)}
    </div>`;
  }

  const viewerSwitch = () => Sync.me ? "" :
    `<div class="row" style="margin-bottom:14px"><span class="muted">Viewing as</span><div class="seg">${P.map((p) => `<button class="${viewer() === p ? "on" : ""}" data-viewer="${p}">${name(p)}</button>`).join("")}</div></div>`;

  views.me = () => {
    const p = viewer(), wk = thisWeek(), them = other(p);
    const goals = S.goals[p];
    const lastReview = [...S.review].map((r, w) => [r, w]).reverse().find(([r]) => r[p].some(filled));
    return `
    ${viewerSwitch()}
    <div class="phase-head"><div><div class="eyebrow">My space</div><h1>Hi ${name(p)} 👋</h1><p class="lead">Your goals and this week's follow-through. Tap a button each time you act on a goal.</p></div>
      <a class="btn" href="#us">See ${name(them)}'s growth →</a></div>
    ${statTiles(p)}
    <div class="card" style="margin-top:18px"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${meWeek(wk) === wk ? "This week" : "Looking back"} · Week ${meWeek(wk) + 1}</h2>
      <div class="seg">${arr(WEEKS, (w) => `<button class="${w === meWeek(wk) ? "on" : ""}" data-meweek="${w}">W${w + 1}</button>`).join("")}</div></div>
      ${goals.map((g, i) => {
        const c = S.track[p][i][meWeek(wk)];
        return `<div class="mygoal"><div><div class="eyebrow" style="color:var(--sun)">Goal ${i + 1}</div>
          <div class="gt">${esc(g.measurable || g.what) || `<a href="#goals">Write this goal →</a>`}</div>
          <div class="muted" style="font-size:14px">${[g.freq, g.proof && "Proof: " + g.proof].filter(filled).map(esc).join(" · ")}</div></div>
          <div class="seg big">${["done", "partial", "missed"].map((v) => `<button class="${c === v ? "on " + v : ""}" data-set="track.${p}.${i}.${meWeek(wk)}" data-val="${v}" aria-label="${v}">${CELL[v]}</button>`).join("")}</div></div>`;
      }).join("")}
      <p class="muted" style="font-size:14px;margin:8px 0 0">Goal ${goals.map((_, i) => `${i + 1}: ${pctOr(goalRate(p, i))}`).join(" · ")} across all weeks.</p>
    </div>
    <div class="grid2" style="margin-top:18px">
      <div class="card"><h3>What ${name(them)} appreciates about me</h3>
        ${S.rewards.appreciate[them].some(filled) ? `<ul class="ritual">${S.rewards.appreciate[them].filter(filled).map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : `<p class="muted">Nothing yet.</p>`}</div>
      <div class="card"><h3>My last Sunday review${lastReview ? ` · Week ${lastReview[1] + 1}` : ""}</h3>
        ${lastReview ? REVIEW_Q.map((q, i) => filled(lastReview[0][p][i]) ? `<p><strong>${q}</strong><br>${esc(lastReview[0][p][i])}</p>` : "").join("") : `<p class="muted">Not yet. <a href="#review">Do this week's reset →</a></p>`}</div>
    </div>`;
  };
  let meWeekPick = null;
  const meWeek = (wk) => (meWeekPick == null ? wk : meWeekPick);

  views.us = () => {
    const me = viewer(), them = other(me);
    const t = S.talk[them], g = S.goals[them];
    const lastReview = [...S.review].map((r, w) => [r, w]).reverse().find(([r]) => r[them].some(filled));
    const ev = S.evaluate[them];
    const VERD = { yes: "Yes", growing: "Getting there", no: "Not yet" };
    const goalBars = (p) => S.goals[p].map((gg, i) => {
      const r = goalRate(p, i);
      return `<div class="gbar" data-tip="${name(p)} · Goal ${i + 1}: ${pctOr(r, "not tracked yet")}"><div class="gl"><span>${esc(gg.measurable || gg.what) || `Goal ${i + 1}`}</span><span>${pctOr(r)}</span></div>
        <div class="track"><i style="width:${r == null ? 0 : pct(r)}%;background:${SERIES[p]}"></i></div></div>`;
    }).join("");
    return `
    ${viewerSwitch()}
    <div class="phase-head"><div><div class="eyebrow">Insights</div><h1>Our growth</h1><p class="lead">How you're both following through, and everything ${name(them)} has shared.</p></div></div>
    <div class="card"><h2>Weekly follow-through</h2><p class="muted" style="font-size:14px">✓ counts 100%, ~ counts 50%, ✕ counts 0%. Only marked squares count.</p>
      ${legend()}${lineChart()}${chartTable()}</div>
    <div class="grid2" style="margin-top:18px">
      ${P.map((p) => `<div class="card">${tag(p)}${statTiles(p)}<h3 style="margin-top:16px">By goal</h3>${goalBars(p)}</div>`).join("")}
    </div>
    <div class="grid2" style="margin-top:18px">
      <div class="card"><h2>Recent from ${name(them)}</h2>${feed(them)}</div>
      <div class="card"><h2>${name(them)}'s goals</h2>
        ${g.map((gg, i) => `<p><strong>Goal ${i + 1}:</strong> ${esc(gg.measurable || gg.what) || '<span class="muted">not written yet</span>'}${filled(gg.freq) ? `<br><span class="muted">${esc(gg.freq)}${filled(gg.proof) ? " · Proof: " + esc(gg.proof) : ""}</span>` : ""}</p>`).join("")}</div>
    </div>
    <div class="card" style="margin-top:18px"><h2>${name(them)}'s responses</h2>
      <details open><summary>Latest Sunday review${lastReview ? ` · Week ${lastReview[1] + 1}` : ""}</summary>
        ${lastReview ? REVIEW_Q.map((q, i) => filled(lastReview[0][them][i]) ? `<p><strong>${q}</strong><br>${esc(lastReview[0][them][i])}</p>` : "").join("") : `<p class="muted">No review yet.</p>`}</details>
      <details><summary>Honest conversation</summary>
        ${t.some(filled) ? TALK_Q.map((q, i) => filled(t[i]) ? `<p><strong>${q}</strong><br>${esc(t[i])}</p>` : "").join("") : `<p class="muted">No answers yet.</p>`}</details>
      <details><summary>Appreciations for ${name(me)}</summary>
        ${S.rewards.appreciate[them].some(filled) ? `<ul class="ritual">${S.rewards.appreciate[them].filter(filled).map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : `<p class="muted">None yet.</p>`}</details>
      <details><summary>30-day evaluation</summary>
        ${ev.some((e) => e.score) ? EVAL_Q.map((q, i) => ev[i].score ? `<p><strong>${q}</strong><br><span class="verdict ${ev[i].score}">${VERD[ev[i].score]}</span> ${esc(ev[i].note)}</p>` : "").join("") : `<p class="muted">Not answered yet.</p>`}</details>
    </div>`;
  };

  /* ---------------- routing / render ---------------- */
  function route() { const h = location.hash.slice(1); return views[h] ? h : "dashboard"; }

  function renderNav() {
    const cur = route();
    document.getElementById("nav").innerHTML =
      `<a class="pill" href="#dashboard" ${cur === "dashboard" ? 'aria-current="page"' : ""} style="--p:${overall()}"><span class="num">♥</span>Heart</a>` +
      `<a class="pill" href="#me" ${cur === "me" ? 'aria-current="page"' : ""}><span class="num">★</span>Me</a>` +
      `<a class="pill" href="#us" ${cur === "us" ? 'aria-current="page"' : ""}><span class="num">↗</span>Us</a>` +
      PHASES.map((ph) => `<a class="pill" href="#${ph.id}" ${cur === ph.id ? 'aria-current="page"' : ""} style="--p:${progress[ph.id]()}"><span class="num">${ph.n}</span>${ph.short}</a>`).join("");
    document.querySelector(".pill[aria-current]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function render(scrollTop = false) {
    Sync.dirty = false;
    document.querySelector(".foot-actions").hidden = Sync.mode === "locked";
    if (Sync.mode === "locked") {
      stopTimerIfLeaving("connect");
      document.getElementById("nav").innerHTML = "";
      document.getElementById("view").innerHTML = connectView();
      return;
    }
    const cur = route();
    stopTimerIfLeaving(cur);
    document.getElementById("view").innerHTML = views[cur]();
    renderNav();
    if (cur === "talk") paintTimer();
    if (scrollTop) window.scrollTo({ top: 0 });
  }

  function refreshLive() {
    renderNav();
    const eb = document.querySelector(".phase-head .eyebrow");
    const cur = route(), ph = PHASES.find((x) => x.id === cur);
    if (eb && ph) eb.textContent = `Phase ${ph.n} · ${pct(progress[cur]())}% mended`;
  }

  /* ---------------- timer ---------------- */
  const T = { who: "a", left: { a: null, b: null }, run: null };
  const secs = () => Math.max(1, Number(S.talk.minutes) || 15) * 60;
  function paintTimer() {
    for (const p of P) {
      if (T.left[p] === null) T.left[p] = secs();
      const el = document.getElementById("clk-" + p); if (!el) return;
      const s = T.left[p];
      el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      document.getElementById("spk-" + p).classList.toggle("on", T.who === p);
    }
    const b = document.getElementById("tBtn"); if (b) b.textContent = T.run ? "Pause" : "Start";
  }
  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.6);
        o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.7);
      });
    } catch { /* no audio */ }
  }
  function tick() {
    T.left[T.who] = Math.max(0, T.left[T.who] - 1);
    if (T.left[T.who] === 0) {
      clearInterval(T.run); T.run = null; chime();
      toast(`Time's up for ${S.names[T.who]}. Now switch — listen first, then respond.`);
    }
    paintTimer();
  }
  function stopTimerIfLeaving(cur) { if (cur !== "talk" && T.run) { clearInterval(T.run); T.run = null; } }

  /* ---------------- actions ---------------- */
  function trackerText() {
    const sym = { "": "·", done: "✓", partial: "~", missed: "✕" };
    const lines = ["BoonBoo — our weekly commitment tracker", ""];
    for (const p of P) {
      lines.push(`${S.names[p]}            W1 W2 W3 W4`);
      S.track[p].forEach((row, i) => {
        const g = S.goals[p][i];
        lines.push(`  Goal ${i + 1}: ${(g.measurable || g.what || "—").replace(/\s+/g, " ")}`);
        lines.push(`           ${row.map((c) => " " + sym[c]).join(" ")}`);
      });
      lines.push("");
    }
    S.track.notes.forEach((n, w) => {
      if (filled(n.well) || filled(n.improve)) lines.push(`Week ${w + 1} — went well: ${n.well || "—"} | improve: ${n.improve || "—"}`);
    });
    return lines.join("\n");
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
      document.execCommand("copy"); t.remove();
    }
    toast("Weekly tracker copied 📋");
  }

  const actions = {
    start() { S.startDate = today(); save(); render(); confetti(); toast("Day 1. You've got this, together."); },
    "timer-toggle"() {
      if (T.run) { clearInterval(T.run); T.run = null; }
      else { if (T.left[T.who] === 0) T.left[T.who] = secs(); T.run = setInterval(tick, 1000); }
      paintTimer();
    },
    "timer-switch"() { T.who = T.who === "a" ? "b" : "a"; paintTimer(); },
    "timer-reset"() { if (T.run) clearInterval(T.run); T.run = null; T.who = "a"; T.left = { a: secs(), b: secs() }; paintTimer(); },
    "copy-tracker"() { copy(trackerText()); },
    "new-cycle"() {
      if (!confirm("Start the next 30 days? This month is saved to history; goals stay, the tracker, reviews and evaluation are cleared.")) return;
      const f = fresh();
      S.history.push({ ended: today(), startDate: S.startDate, goals: S.goals, track: S.track, evaluate: S.evaluate, rewards: S.rewards });
      Object.assign(S, { startDate: today(), track: f.track, review: f.review, evaluate: { ...f.evaluate, next: "" },
        rewards: { ...S.rewards, earned: f.rewards.earned, monthlyEarned: false, appreciate: f.rewards.appreciate } });
      save(); reviewWeek = null; location.hash = "#dashboard"; render(true); confetti(120);
    },
    export() {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `boonboo-${today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    unlink() {
      if (confirm("Disconnect this phone? Your shared data stays safe online; you'll need the couple code to reconnect.")) Sync.forget();
    },
    wipe() {
      const both = Sync.mode !== "local";
      if (!confirm(both
        ? "Erase everything for BOTH of you, on both phones? This can't be undone. (Export a backup first if you want one.)"
        : "Erase everything on this device? This can't be undone. (Export a backup first if you want one.)")) return;
      S = fresh(); save(); location.hash = "#dashboard"; render(true);
    },
  };

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action],[data-cycle],[data-toggle],[data-fill],[data-week],[data-set],[data-hide],[data-go],[data-me],[data-meweek],[data-viewer]");
    if (!t) return;
    const d = t.dataset;
    if (d.action) return actions[d.action]?.();
    if (d.me) { connectAs = d.me; const code = document.getElementById("coupleCode")?.value || ""; render(); const c = document.getElementById("coupleCode"); if (c) { c.value = code; c.focus(); } return; }
    if (d.go) { location.hash = "#" + d.go; return; }
    if (d.cycle) {
      const next = CELL_NEXT[get(d.cycle)]; set(d.cycle, next); save();
      t.className = "cell " + next; t.textContent = CELL[next];
      if (next === "done") { const r = t.getBoundingClientRect(); if (r) confetti(12); }
      return refreshLive();
    }
    if (d.toggle) {
      const v = !get(d.toggle); set(d.toggle, v); save(); render();
      if (v) { confetti(90); toast("Reward earned. Enjoy it — you both showed up. 💗"); }
      return;
    }
    if (d.fill) {
      const g = S.goals[d.fill].find((x) => !filled(x.what));
      if (!g) return toast("All three goals already have text — edit one directly.");
      g.what = d.text; save(); render(); return;
    }
    if (d.week) { reviewWeek = Number(d.week); render(); return; }
    if (d.meweek) { meWeekPick = Number(d.meweek); render(); return; }
    if (d.viewer) { localViewer = d.viewer; try { localStorage.setItem("boonboo-viewer", d.viewer); } catch { /* ignore */ } render(); return; }
    if (d.set) { set(d.set, get(d.set) === d.val ? "" : d.val); save(); render(); return; }
    if (d.hide) { hiddenEval[d.hide] = !hiddenEval[d.hide]; render(); return; }
  });

  document.addEventListener("keydown", (e) => {
    const g = e.target.closest?.("[data-go]");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = "#" + g.dataset.go; }
  });

  document.addEventListener("input", (e) => {
    const p = e.target.dataset?.bind; if (!p) return;
    let v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    if ("num" in e.target.dataset) { v = Math.min(60, Math.max(1, Number(v) || 15)); if (!T.run) { T.left = { a: v * 60, b: v * 60 }; } }
    set(p, v); save(); refreshLive();
    if ("num" in e.target.dataset) paintTimer();
  });
  document.addEventListener("change", (e) => { if (e.target.dataset && "rerender" in e.target.dataset) render(); });

  document.getElementById("importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.v !== 1) throw new Error("not a BoonBoo backup");
      S = merge(fresh(), data); save(); render(true); toast("Backup restored ✨");
    } catch (err) { toast("Couldn't read that file: " + err.message); }
    e.target.value = "";
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id !== "connectForm") return;
    e.preventDefault();
    const code = document.getElementById("coupleCode").value.trim();
    if (!connectAs) { Sync.error = "Tap your name so we know whose phone this is."; const c = code; render(); document.getElementById("coupleCode").value = c; return; }
    Sync.connect(code, connectAs);
  });

  // While you're typing, your partner's edits update other boxes in place; the rest of
  // the page refreshes once you leave the box.
  document.addEventListener("focusout", () => {
    setTimeout(() => { if (Sync.dirty && !document.activeElement?.dataset?.bind) render(); }, 400);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") Sync.pull(); });

  const tip = document.getElementById("tip");
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip; tip.hidden = false;
    const r = t.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2)) + "px";
    tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + "px";
  });
  window.addEventListener("scroll", () => { tip.hidden = true; }, { passive: true });

  window.addEventListener("hashchange", () => render(true));
  Sync.setMode("local");
  render();
  Sync.start();
})();
