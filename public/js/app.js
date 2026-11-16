/* BoonBoo — a monthly ritual for two.
   Weekly: write each other a note of thanks, appreciation and what you've noticed.
   Monthly: one gentle goal each, for yourself; your partner notices instead of tracking. */
(() => {
  "use strict";

  const KEY = "boonboo-v1";
  const WEEKS = 4;
  const P = ["a", "b"];

  // The weekly note each of you writes TO the other. `n` is the partner's name (or "you").
  const NOTE_Q = [
    ["thankful", (n) => `I'm thankful for ${n} because…`, "Something about who they are, not only what they did"],
    ["appreciated", (n) => `This week I appreciated when ${n}…`, "One specific moment: what happened and how it felt"],
    ["noticed", (n) => `I noticed ${n} growing in…`, "A small change you've seen, said kindly"],
  ];

  const GOAL_IDEAS = [
    "Listen without trying to fix",
    "Put my phone away at dinner",
    "Say what I feel instead of going quiet",
    "Say sorry first when I'm wrong",
    "Follow through on what I say",
    "Plan one small thing for us each week",
  ];
  const VERDICT = { yes: "Yes 🌟", growing: "Growing 🌱", no: "Not yet" };

  // Welcome questions each partner answers once (shared, and read by the AI guide)
  const ABOUT_Q = [
    ["meaning", "What does this relationship mean to you?", "In your own words, big or small"],
    ["love", "What do you love most about us?", "The things that make us, us"],
    ["improve", "What would you like us to improve?", "Gently: what would make us even better"],
    ["need", (n) => `What do you need more of from ${n}?`, "Time, words, help, closeness…"],
  ];
  const FEEL = [["words", "Kind words"], ["time", "Quality time"], ["help", "Help with things"], ["touch", "Hugs & closeness"], ["gifts", "Little surprises"]];
  const STARTER_TASKS = {
    words: { title: "Leave each other a note", why: "Kind words land best when they're unexpected.", when: "This week" },
    time: { title: "A phone-free walk together", why: "Twenty minutes with nothing else competing for you.", when: "This weekend" },
    help: { title: "Swap one chore you each dislike", why: "Taking something off their plate says “I see you”.", when: "This week" },
    touch: { title: "A long hug before the day starts", why: "Closeness first thing sets the tone for the day.", when: "Every morning" },
    gifts: { title: "A tiny surprise under five", why: "It's the thought: proof you were thinking of them.", when: "This week" },
    ask: { title: "Ask three curious questions", why: "Find out something new about each other.", when: "One evening" },
  };

  /* ---------------- state ---------------- */
  const arr = (n, f) => Array.from({ length: n }, (_, i) => (typeof f === "function" ? f(i) : f));
  const blankNote = () => ({ thankful: "", appreciated: "", noticed: "" });
  // month[p]: p's own goal and end-of-month reflection, plus p's observation of the partner's progress
  const blankGoal = () => ({ goal: "", notice: "", observe: "", score: "", reflect: "" });
  const blankAbout = () => ({ meaning: "", love: "", improve: "", need: "", feel: "", done: false });

  function fresh() {
    return {
      v: 2,
      names: { a: "Boon", b: "Boo" },
      startDate: null,
      week: arr(WEEKS, () => ({ a: blankNote(), b: blankNote() })),   // week[w][p] = p's note to the partner
      month: { a: blankGoal(), b: blankGoal(), celebrate: "" },
      about: { a: blankAbout(), b: blankAbout() },
      ai: "",                    // latest AI insights, stored as one JSON string
      aiDone: arr(6, false),     // couple tasks ticked off
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
  // Keep only what this version knows about (older versions had a tracker, rules, etc.).
  function adopt(saved) {
    const base = fresh(), m = merge(base, saved || {});
    for (const k of Object.keys(m)) if (!(k in base)) delete m[k];
    m.v = 2;
    return m;
  }

  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? adopt(JSON.parse(raw)) : fresh(); }
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
        local: "💾 This device only",
        locked: "🔒 Locked",
        online: "💞 Synced",
        saving: "✨ Saving…",
        offline: "⚠️ Offline",
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

  /* ---------------- helpers ---------------- */
  const filled = (s) => typeof s === "string" && s.trim().length > 0;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const name = (p) => esc(S.names[p] || (p === "a" ? "Partner A" : "Partner B"));
  const tag = (p) => `<div class="person-tag"><span class="dot ${p}"></span>${name(p)}${Sync.me === p ? '<span class="you">you</span>' : ""}</div>`;
  const pct = (x) => Math.round(x * 100);
  const other = (p) => (p === "a" ? "b" : "a");
  let localViewer = (() => { try { return localStorage.getItem("boonboo-viewer") || "a"; } catch { return "a"; } })();
  const viewer = () => Sync.me || localViewer;

  function field(path, label, { area = false, ph = "", hint = "", rerender = false } = {}) {
    const v = esc(get(path));
    const attrs = `data-bind="${path}" placeholder="${esc(ph)}"${rerender ? " data-rerender" : ""}`;
    const input = area ? `<textarea ${attrs}>${v}</textarea>` : `<input type="text" ${attrs} value="${v}" />`;
    return `<label class="fld"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span>${input}</label>`;
  }
  const head = (eyebrow, title, lead = "") =>
    `<div class="phase-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ""}</div></div>`;

  function nextSunday(from = new Date()) {
    const d = new Date(from); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d;
  }
  const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  function cycleDay() {
    if (!S.startDate) return null;
    const start = new Date(S.startDate + "T00:00:00");
    return Math.max(1, Math.floor((Date.now() - start.getTime()) / 864e5) + 1);
  }
  const thisWeek = () => { const d = cycleDay(); return d ? Math.min(Math.ceil(d / 7), WEEKS) - 1 : 0; };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  // notes
  const noteHas = (n) => !!n && NOTE_Q.some(([k]) => filled(n[k]));
  const notePct = (n) => NOTE_Q.filter(([k]) => filled(n[k])).length / NOTE_Q.length;
  const noteBody = (n, about) =>
    NOTE_Q.filter(([k]) => filled(n[k])).map(([k, label]) => `<p><strong>${label(about)}</strong><br>${esc(n[k])}</p>`).join("");

  // heart: left half = partner A's weekly notes, right half = partner B's, top to bottom = weeks 1–4
  const PIECES = arr(8, (k) => ({ w: k >> 1, p: k % 2 ? "b" : "a" }));
  const pieceProgress = () => PIECES.map(({ w, p }) => notePct(S.week[w][p]));
  const overall = () => pieceProgress().reduce((s, x) => s + x, 0) / PIECES.length;

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
     alternating left/right, so the heart mends from the top down, week by week. */
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
    const prog = pieceProgress();
    const whole = prog.every((p) => p >= 1);
    // A real heart is red; the left half leans pink (partner A), the right half violet (partner B).
    const defs = PIECES.map(({ p }, k) =>
      `<linearGradient id="g${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff1f4b"/><stop offset="0.65" stop-color="#e0105f"/><stop offset="1" stop-color="${p === "a" ? "#ff2bd6" : "#a12bff"}"/></linearGradient>`).join("");
    const shards = SHARDS.shards.map((s, k) => {
      const p = prog[k], q = 1 - p, { w, p: who } = PIECES[k];
      const dx = s.side * (6 + Math.abs(s.cx - 100) * 0.12) * q;
      const dy = (s.row - 1.5) * 5 * q;
      const rot = s.side * 7 * q;
      const label = `Week ${w + 1}: ${S.names[who] || who}'s note — ${p >= 1 ? "written" : p > 0 ? "started" : "not yet"}`;
      const style = `transform-origin:${s.cx}px ${s.cy}px;transform:translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg);filter:saturate(${(0.2 + p * 1.1).toFixed(2)}) brightness(${(0.5 + p * 0.6).toFixed(2)});opacity:${(0.6 + p * 0.4).toFixed(2)}`;
      return `<g class="shard" data-go="week" data-wk="${w}" style="${style}" role="link" tabindex="0" aria-label="${esc(label)}"><title>${esc(label)}</title>
        <g clip-path="url(#heartClip)"><polygon points="${s.poly}" fill="url(#g${k})"/><polygon points="${s.poly}" fill="url(#swirl)" opacity="0.35"/></g>
        <g clip-path="url(#heartClip)"><polygon points="${s.poly}" fill="none" stroke="#fff" stroke-opacity="${(0.15 + p * 0.5).toFixed(2)}" stroke-width="1.2"/></g></g>`;
    }).join("");
    const cracks = SHARDS.cracks.map(([pts, i, j]) => {
      const healed = Math.min(prog[i], prog[j]);
      return `<polyline class="crack" points="${pts}" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" opacity="${((1 - healed) * 0.8).toFixed(2)}" clip-path="url(#heartClip)" filter="url(#glow)"/>`;
    }).join("");
    const total = pct(overall());
    return `<svg class="heart-svg${whole ? " whole" : ""}" viewBox="-30 -28 260 245" role="img" aria-label="Our heart is ${total}% mended">
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
  const status = (ok, yes, no) => `<span class="status ${ok ? "ok" : ""}">${ok ? "✓ " + yes : no}</span>`;

  views.dashboard = () => {
    const me = viewer(), them = other(me), wk = thisWeek(), day = cycleDay();
    const sunday = new Date().getDay() === 0;
    const myGoal = S.month[me].goal, theirGoal = S.month[them].goal;
    const start = !day ? `<div class="card love">
        <div class="eyebrow">Welcome to BoonBoo</div><h2>A month of noticing each other</h2>
        <ul class="ritual">
          <li><strong>Every Sunday</strong>, write each other a short note: what you're thankful for, what you appreciated, how you've seen them grow.</li>
          <li><strong>Once a month</strong>, each choose one small thing to practise for yourself. Your partner doesn't track it; they notice it.</li>
          <li>Every note mends a piece of the heart.</li>
        </ul>
        <button class="btn" data-action="start" style="margin-top:8px">Begin our month</button>
      </div>` : "";
    return `
    <section class="dash">
      <div class="card heart-card">
        <div class="heart-wrap">${heartSVG()}</div>
        <p class="muted" style="margin-top:6px">Left half: ${name("a")}'s notes · Right half: ${name("b")}'s.<br>Each Sunday you both write, two pieces mend.</p>
      </div>
      <div class="stack">
        ${start}
        ${insightsCard()}
        <div class="card">
          <div class="row" style="justify-content:space-between"><div class="eyebrow">💌 This week${day ? ` · week ${wk + 1} of ${WEEKS}` : ""}</div>
            <span class="muted" style="font-size:14px">${sunday ? "It's Sunday ✨" : `Next: ${fmtDate(nextSunday())}`}</span></div>
          <div class="srow"><span>Your note to ${name(them)}</span>${status(notePct(S.week[wk][me]) >= 1, "Written", noteHas(S.week[wk][me]) ? "Started" : "Not yet")}</div>
          <div class="srow"><span>${name(them)}'s note to you</span>${status(noteHas(S.week[wk][them]), "Arrived", "Waiting")}</div>
          <a class="btn" href="#week" style="margin-top:12px">${noteHas(S.week[wk][them]) ? "Read & write" : "Write this week's note"}</a>
        </div>
        <div class="card">
          <div class="eyebrow">🌱 This month</div>
          <div class="srow"><span>Your goal</span><span class="${myGoal ? "" : "muted"}">${esc(myGoal) || "Not chosen yet"}</span></div>
          <div class="srow"><span>${name(them)}'s goal</span><span class="${theirGoal ? "" : "muted"}">${esc(theirGoal) || "Not chosen yet"}</span></div>
          ${day ? `<div class="bar" style="margin-top:12px"><i style="width:${Math.min(100, (day / 30) * 100)}%"></i></div>
            <p class="muted" style="font-size:14px;margin:6px 0 0">Day ${Math.min(day, 30)} of 30${day >= 28 ? " · time to reflect together 🎉" : ""}</p>` : ""}
          <a class="btn ghost" href="#month" style="margin-top:12px">Open the month</a>
        </div>
      </div>
    </section>`;
  };

  let weekPick = null;
  views.week = () => {
    const me = viewer(), them = other(me), w = weekPick ?? thisWeek();
    const theirs = S.week[w][them];
    return `
    ${head(`Sunday practice · week ${w + 1}`, "Notes for each other", "Sit together for ten minutes. Each write to the other, then read your notes aloud.")}
    <div class="seg" style="margin-bottom:16px">${arr(WEEKS, (i) => `<button class="${i === w ? "on" : ""}" data-week="${i}">Week ${i + 1}</button>`).join("")}</div>
    <div class="card love">
      <div class="eyebrow">💌 Your note to ${name(them)}</div>
      ${NOTE_Q.map(([k, label, ph]) => field(`week.${w}.${me}.${k}`, label(name(them)), { area: true, ph })).join("")}
      <p class="muted" style="margin:0;font-size:14px">Be specific. Be kind. No “but”.</p>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="eyebrow">💌 From ${name(them)}</div>
      ${noteHas(theirs) ? noteBody(theirs, "you") : `<p class="muted">${name(them)} hasn't written week ${w + 1}'s note yet. It appears here as soon as they do.</p>`}
    </div>`;
  };

  views.month = () => {
    const me = viewer(), them = other(me), m = S.month;
    const day = cycleDay();
    return `
    ${head("Monthly practice", "One goal each", "Choose one small thing to practise for yourself this month. Your partner won't track it; they'll notice it.")}
    <div class="card love">
      <div class="eyebrow">🌱 Your goal</div>
      ${field(`month.${me}.goal`, "This month I'm practising…", { ph: "One small, kind change" })}
      ${filled(m[me].goal) ? "" : `<div style="margin:-4px 0 12px">${GOAL_IDEAS.map((g) => `<button class="chip" data-idea="${esc(g)}">${esc(g)}</button>`).join("")}</div>`}
      ${field(`month.${me}.notice`, `${name(them)} will notice it when I…`, { area: true, ph: "What it looks like day to day" })}
      ${filled(m[them].observe) ? `<div class="received"><strong>👀 What ${name(them)} has noticed</strong><br>${esc(m[them].observe)}</div>` : ""}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="eyebrow">🌱 ${name(them)}'s goal</div>
      ${filled(m[them].goal)
        ? `<p class="gt">${esc(m[them].goal)}</p>${filled(m[them].notice) ? `<p class="muted">How you'll notice: ${esc(m[them].notice)}</p>` : ""}
           ${field(`month.${me}.observe`, `What I've noticed about ${name(them)}'s progress`, { area: true, ph: "Moments you've seen them practise it" })}`
        : `<p class="muted">${name(them)} hasn't chosen a goal yet.</p>`}
    </div>
    <h2 style="margin-top:26px">At the end of the month</h2>
    <div class="card">
      <div class="fld"><span>Did I practise my goal?</span>
        <div class="seg">${Object.entries(VERDICT).map(([k, v]) => `<button class="${m[me].score === k ? "on" : ""}" data-set="month.${me}.score" data-val="${k}">${v}</button>`).join("")}</div></div>
      ${field(`month.${me}.reflect`, "What did I learn?", { area: true, ph: "What helped, what got in the way" })}
      ${filled(m[them].reflect) || m[them].score ? `<div class="received"><strong>${name(them)}'s reflection</strong>${m[them].score ? ` · ${VERDICT[m[them].score]}` : ""}<br>${esc(m[them].reflect)}</div>` : ""}
      ${field("month.celebrate", "How we'll celebrate the month 🎉", { ph: "A special dinner, a day trip, something you've both wanted…" })}
      <button class="btn" data-action="new-month">Start a new month</button>
      <p class="muted" style="font-size:14px;margin:8px 0 0">${day ? `Day ${Math.min(day, 30)} of 30. ` : ""}This month's notes and goals are saved; you start fresh.${S.history.length ? ` Months together: ${S.history.length}.` : ""}</p>
    </div>`;
  };

  /* ---------------- us: everything you've shared ---------------- */
  function label(path) {
    const k = path.split("."), n = (i) => Number(k[i]) + 1;
    switch (k[0]) {
      case "week": return `wrote you a note 💌 (week ${n(1)})`;
      case "month":
        if (k[1] === "celebrate") return "planned the celebration 🎉";
        return { goal: "chose their goal for the month 🌱", notice: "chose their goal for the month 🌱", observe: "noticed your progress 👀", score: "reflected on their month", reflect: "reflected on their month" }[k[2]] || "updated the month";
      case "about": return "answered the welcome questions 💬";
      case "ai": return "got new couple tasks ✨";
      case "aiDone": return "ticked off a couple task ✅";
      case "names": return "changed the names";
      case "startDate": return "started the month";
      default: return "made an update";
    }
  }
  function ago(t) {
    const s = Math.max(1, Math.round((Date.now() - t) / 1000));
    if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago";
  }
  function feed(p, limit = 6) {
    const items = Object.entries(Sync.meta).filter(([path, m]) => m.by === p && /^(week|month|names|startDate|about|ai)/.test(path)).sort((a, b) => b[1].at - a[1].at);
    const out = []; const seen = new Set();
    for (const [path, m] of items) { const l = label(path); if (seen.has(l)) continue; seen.add(l); out.push(`<li><span>${esc(l)}</span><span class="muted">${ago(m.at)}</span></li>`); if (out.length >= limit) break; }
    if (!out.length) return `<p class="muted">${Sync.mode === "local" ? "Activity shows here once you're both connected." : `Nothing from ${name(p)} yet.`}</p>`;
    return `<ul class="feed">${out.join("")}</ul>`;
  }

  let aboutEditing = false;
  views.us = () => {
    const me = viewer(), them = other(me);
    const weeks = arr(WEEKS, (w) => w).reverse().filter((w) => P.some((p) => noteHas(S.week[w][p])));
    const timeline = weeks.length
      ? weeks.map((w, i) => `<details ${i === 0 ? "open" : ""}><summary>Week ${w + 1}</summary><div class="grid2">
          ${P.map((p) => `<div class="note"><div class="person-tag" style="font-size:16px"><span class="dot ${p}"></span>${name(p)} → ${name(other(p))}</div>
            ${noteHas(S.week[w][p]) ? noteBody(S.week[w][p], name(other(p))) : `<p class="muted">Not written.</p>`}</div>`).join("")}
        </div></details>`).join("")
      : `<p class="muted">Your weekly notes collect here. Write the first one on the <a href="#week">Week</a> tab.</p>`;
    const ai = aiData();
    const aboutRead = (p) => `${ABOUT_Q.filter(([k]) => filled(S.about[p][k])).map(([k, q]) =>
        `<p><strong>${aboutLabel(q, name(other(p)))}</strong><br>${esc(S.about[p][k])}</p>`).join("")}
        ${feelSet(p).size ? `<p><strong>Feels most loved through</strong><br>${FEEL.filter(([k]) => feelSet(p).has(k)).map(([, l]) => l).join(", ")}</p>` : ""}
        ${!ABOUT_Q.some(([k]) => filled(S.about[p][k])) && !feelSet(p).size ? `<p class="muted">Not answered yet.</p>` : ""}`;
    const aboutEdit = (p) => `${ABOUT_Q.map(([k, q, ph]) => field(`about.${p}.${k}`, aboutLabel(q, name(other(p))), { area: true, ph })).join("")}
        <div class="fld"><span>How do you most feel loved?</span>
          <div class="feel">${FEEL.map(([k, l]) => `<button class="chip ${feelSet(p).has(k) ? "on" : ""}" data-feel="${k}">${l}</button>`).join("")}</div></div>
        <button class="btn sm" data-about-edit="0">Done ✓</button>`;
    const aboutBlock = `<div class="card" style="margin-top:16px"><div class="eyebrow">💬 What this means to us</div>
      <div class="grid2">${[me, other(me)].map((p) => `<div class="note">
        <div class="row" style="justify-content:space-between">${tag(p)}${p === me && !aboutEditing ? `<button class="btn ghost sm" data-about-edit="1">✏️ Edit</button>` : ""}</div>
        ${p === me && aboutEditing ? aboutEdit(p) : aboutRead(p)}</div>`).join("")}</div></div>`;
    const aiBlock = ai ? `<div class="card" style="margin-top:16px"><div class="eyebrow">✨ What BoonBoo sees</div><p>${esc(ai.summary)}</p>
      <h3>Working well</h3><ul class="ritual">${ai.strengths.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3>Growing together</h3><ul class="ritual">${ai.growth.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p class="muted" style="font-size:13px;margin:8px 0 0">Suggested ${ago(ai.at)}. A reflection to talk about, not a judgement.</p></div>` : "";
    return `
    ${head("Us", "How we see each other")}
    ${aiBlock}${aboutBlock}
    <div class="card love"><div class="eyebrow">💌 Our notes</div>${timeline}</div>
    <div class="grid2" style="margin-top:16px">
      ${P.map((p) => `<div class="card">${tag(p)}
        <p class="gt">${esc(S.month[p].goal) || '<span class="muted">No goal chosen yet</span>'}</p>
        ${filled(S.month[other(p)].observe) ? `<div class="received"><strong>👀 ${name(other(p))} noticed</strong><br>${esc(S.month[other(p)].observe)}</div>` : ""}
        ${S.month[p].score ? `<p style="margin-top:10px"><span class="verdict ${S.month[p].score}">${VERDICT[S.month[p].score]}</span> ${esc(S.month[p].reflect)}</p>` : ""}
      </div>`).join("")}
    </div>
    <div class="card" style="margin-top:16px"><h3>Latest from ${name(them)}</h3>${feed(them)}</div>
    ${S.history.length ? `<div class="card" style="margin-top:16px"><h3>Past months</h3><ul class="feed">${S.history.slice().reverse().map((h) =>
      `<li><span>${h.startDate ? new Date(h.startDate + "T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "A month"} · ${P.map((p) => esc(h.month?.[p]?.goal || "—")).join(" · ")}</span></li>`).join("")}</ul></div>` : ""}`;
  };

  /* ---------------- welcome questions ---------------- */
  let welcomeStep = 0;
  const aboutLabel = (q, them) => (typeof q === "function" ? q(them) : q);
  const feelSet = (p) => new Set((S.about[p].feel || "").split(",").filter(Boolean));
  const needsWelcome = () => !S.about[viewer()].done;

  views.welcome = () => {
    const me = viewer(), them = other(me), total = ABOUT_Q.length + 1, i = Math.min(welcomeStep, total - 1);
    const dots = arr(total, (k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("");
    let body;
    if (i < ABOUT_Q.length) {
      const [k, q, ph] = ABOUT_Q[i];
      body = `<h1 class="q">${aboutLabel(q, name(them))}</h1>
        <textarea class="big" data-bind="about.${me}.${k}" placeholder="${esc(ph)}" autofocus>${esc(S.about[me][k])}</textarea>`;
    } else {
      const set = feelSet(me);
      body = `<h1 class="q">How do you most feel loved?</h1><p class="muted">Pick any that fit.</p>
        <div class="feel">${FEEL.map(([k, l]) => `<button class="chip ${set.has(k) ? "on" : ""}" data-feel="${k}">${l}</button>`).join("")}</div>`;
    }
    return `<section class="card welcome">
      <div class="row" style="justify-content:space-between"><div class="eyebrow">Hi ${name(me)} · ${i + 1} of ${total}</div><div class="dots">${dots}</div></div>
      ${i === 0 ? `<p class="muted">A few questions before you begin. ${name(them)} answers too, and BoonBoo uses both to suggest things to do together.</p>` : ""}
      ${body}
      <div class="row" style="justify-content:space-between;margin-top:16px">
        ${i > 0 ? `<button class="btn ghost" data-step="${i - 1}">← Back</button>` : `<button class="btn ghost" data-action="welcome-skip">Skip for now</button>`}
        ${i < total - 1 ? `<button class="btn" data-step="${i + 1}">Next →</button>` : `<button class="btn" data-action="welcome-done">Done 💗</button>`}
      </div>
    </section>`;
  };

  /* ---------------- AI insights & couple tasks ---------------- */
  const aiData = () => { try { return S.ai ? JSON.parse(S.ai) : null; } catch { return null; } };
  let aiBusy = false, aiError = "";
  function starterTasks() {
    const want = [...new Set([...feelSet("a"), ...feelSet("b")])];
    const keys = [...want, "ask", "time", "words"].filter((k, i, a) => a.indexOf(k) === i).slice(0, 3);
    return keys.map((k) => STARTER_TASKS[k]);
  }
  function taskList(tasks, live) {
    return `<ul class="tasks">${tasks.map((t, i) => {
      const done = live && S.aiDone[i];
      return `<li class="${done ? "done" : ""}">${live ? `<button class="tick" data-task="${i}" aria-label="Mark done">${done ? "✓" : ""}</button>` : `<span class="tick ghosty">✦</span>`}
        <div><strong>${esc(t.title)}</strong> <span class="when">${esc(t.when)}</span><br><span class="muted">${esc(t.why)}</span></div></li>`;
    }).join("")}</ul>`;
  }
  function insightsCard() {
    const me = viewer(), them = other(me), ai = aiData();
    const bothDone = S.about.a.done && S.about.b.done;
    const btn = (label) => `<button class="btn ${ai ? "ghost sm" : ""}" data-action="get-insights" ${aiBusy ? "disabled" : ""}>${aiBusy ? "Thinking… ✨" : label}</button>`;
    if (ai) {
      return `<div class="card love">
        <div class="eyebrow">✨ Couple tasks for you two</div>
        <p>${esc(ai.summary)}</p>
        ${taskList(ai.tasks.slice(0, S.aiDone.length), true)}
        ${ai.care_note ? `<div class="received">${esc(ai.care_note)}</div>` : ""}
        ${aiError ? `<p class="err">${esc(aiError)}</p>` : ""}
        <div class="row" style="justify-content:space-between;margin-top:10px"><a href="#us" class="muted" style="font-size:14px">Full insights in Us →</a>${btn("Refresh")}</div>
      </div>`;
    }
    const lead = !S.about[me].done ? `<p class="muted">Answer a few questions and BoonBoo will suggest things to do together.</p><button class="btn" data-action="welcome-open">Answer the questions</button>`
      : !bothDone ? `<p class="muted">Waiting for ${name(them)} to answer the welcome questions. You can still ask now, but it's better with both.</p>${btn("Suggest couple tasks")}`
      : `<p class="muted">You've both answered. Let BoonBoo read them and suggest a few things to do together.</p>${btn("Suggest couple tasks")}`;
    return `<div class="card love"><div class="eyebrow">✨ Couple tasks</div>${lead}
      ${aiError ? `<p class="err">${esc(aiError)}</p>` : ""}
      ${S.about[me].done ? `<h3 style="margin-top:16px">Starter ideas</h3>${taskList(starterTasks(), false)}` : ""}</div>`;
  }

  views.settings = () => {
    const synced = ["online", "saving", "offline"].includes(Sync.mode);
    return `
    ${head("Settings", "Settings")}
    <div class="card stack">
      <div class="grid2" style="gap:12px">
        ${field("names.a", '<span class="dot a"></span> Partner one', { ph: "Name", rerender: true })}
        ${field("names.b", '<span class="dot b"></span> Partner two', { ph: "Name", rerender: true })}
      </div>
      ${synced ? `<p class="muted" style="margin:0">This phone belongs to <strong>${name(Sync.me)}</strong>.</p>` :
        `<div class="row"><span class="muted">This device is</span><div class="seg">${P.map((p) => `<button class="${viewer() === p ? "on" : ""}" data-viewer="${p}">${name(p)}</button>`).join("")}</div></div>`}
      <p class="muted" style="margin:0">${synced ? "🔒 Shared only between the two of you, protected by your couple code." : "🔒 Saved on this device only."}</p>
      <div class="row">
        <button class="btn ghost sm" data-action="export">Export backup</button>
        <label class="btn ghost sm">Import backup<input type="file" accept="application/json" id="importFile" hidden /></label>
        ${synced ? `<button class="btn ghost sm" data-action="unlink">Disconnect this phone</button>` : ""}
        <button class="btn ghost sm danger" data-action="wipe">Erase everything</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Welcome questions</h3>
      <p class="muted">Change your answers any time; new couple tasks use the latest ones.</p>
      <button class="btn ghost sm" data-action="welcome-open">Edit my answers</button></div>
    <div class="card" style="margin-top:16px"><h3>Our gentle rules</h3>
      <ul class="ritual">
        <li>Listen first, then respond.</li>
        <li>Be specific and kind. No “but”.</li>
        <li>Notice, don't keep score.</li>
        <li>A missed week is fine. Just come back next Sunday.</li>
      </ul></div>`;
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
          <small class="muted">So BoonBoo knows which notes are yours.</small></div>
        ${Sync.error ? `<p class="err">${esc(Sync.error)}</p>` : ""}
        <button class="btn" type="submit">Connect</button>
      </form>
    </section>`;
  }


  /* ---------------- routing / render ---------------- */
  function route() { const h = location.hash.slice(1); return views[h] ? h : "dashboard"; }

  const TABS = [["dashboard", "♥", "Heart"], ["week", "💌", "Week"], ["month", "🌱", "Month"], ["us", "↗", "Us"]];
  function renderNav() {
    const cur = route();
    document.getElementById("tabs").innerHTML = TABS.map(([id, ic, label]) =>
      `<a href="#${id}" ${cur === id ? 'aria-current="page"' : ""}><span class="ti">${ic}</span>${label}</a>`).join("");
    document.body.classList.toggle("compact", cur !== "dashboard");
    document.querySelector(".gear").hidden = Sync.mode === "locked";
  }

  function render(scrollTop = false) {
    Sync.dirty = false;
    if (Sync.mode === "locked") {
      document.getElementById("tabs").innerHTML = "";
      document.querySelector(".gear").hidden = true;
      document.getElementById("view").innerHTML = connectView();
      return;
    }
    if (needsWelcome() && !welcomeSkipped) {
      document.getElementById("view").innerHTML = views.welcome();
      document.getElementById("tabs").innerHTML = "";
      document.querySelector(".gear").hidden = true;
      document.body.classList.add("compact");
      return;
    }
    document.getElementById("view").innerHTML = views[route()]();
    renderNav();
    if (scrollTop) window.scrollTo({ top: 0 });
  }
  const refreshLive = () => { if (!(needsWelcome() && !welcomeSkipped)) renderNav(); };
  let welcomeSkipped = (() => { try { return sessionStorage.getItem("boonboo-skip") === "1"; } catch { return false; } })();

  /* ---------------- actions ---------------- */
  async function getInsights() {
    if (aiBusy) return;
    if (Sync.mode === "local") { aiError = "AI suggestions need both phones connected with your couple code."; return render(); }
    aiBusy = true; aiError = ""; render();
    try {
      await Sync.push();
      const r = await Sync.api("insights", { method: "POST", body: "{}" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        aiError = data.code === "ai-off" ? "AI suggestions aren't switched on yet, so here are some starter ideas." : (data.error || "Something went wrong. Try again later.");
      } else {
        S.ai = JSON.stringify({ ...data.insights, at: data.at });
        S.aiDone = arr(6, false);
        save(); confetti(50);
      }
    } catch { aiError = "Couldn't reach BoonBoo. Check your internet."; }
    aiBusy = false; render();
  }

  const actions = {
    "get-insights"() { getInsights(); },
    "welcome-open"() { welcomeStep = 0; welcomeSkipped = false; S.about[viewer()].done = false; save(); render(true); },
    "welcome-skip"() { welcomeSkipped = true; try { sessionStorage.setItem("boonboo-skip", "1"); } catch { /* ignore */ } render(true); },
    "welcome-done"() {
      S.about[viewer()].done = true; save(); welcomeStep = 0; location.hash = "#dashboard"; render(true); confetti(60);
      toast("Thank you 💗 Your answers help BoonBoo suggest things to do together.");
    },
    start() { S.startDate = today(); save(); render(); confetti(); toast("Your month begins. Write your first note on Sunday 💌"); },
    "new-month"() {
      if (!confirm("Start a new month? This month's notes and goals are saved to your history and you both start fresh.")) return;
      const f = fresh();
      S.history.push({ ended: today(), startDate: S.startDate, week: S.week, month: S.month });
      Object.assign(S, { startDate: today(), week: f.week, month: f.month });
      save(); weekPick = null; location.hash = "#dashboard"; render(true); confetti(120);
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
    const t = e.target.closest("[data-action],[data-week],[data-set],[data-go],[data-me],[data-viewer],[data-idea],[data-step],[data-feel],[data-task],[data-about-edit]");
    if (!t) return;
    const d = t.dataset;
    if (d.action) return actions[d.action]?.();
    if (d.me) { connectAs = d.me; const code = document.getElementById("coupleCode")?.value || ""; render(); const c = document.getElementById("coupleCode"); if (c) { c.value = code; c.focus(); } return; }
    if (d.go) { if (d.wk != null) weekPick = Number(d.wk); location.hash = "#" + d.go; if (route() === d.go) render(true); return; }
    if (d.week) { weekPick = Number(d.week); render(); return; }
    if (d.viewer) { localViewer = d.viewer; try { localStorage.setItem("boonboo-viewer", d.viewer); } catch { /* ignore */ } render(); return; }
    if (d.set) { set(d.set, get(d.set) === d.val ? "" : d.val); save(); render(); if (get(d.set) === "yes") confetti(60); return; }
    if (d.step) { welcomeStep = Number(d.step); render(); document.querySelector(".welcome textarea")?.focus(); return; }
    if (d.aboutEdit) { aboutEditing = d.aboutEdit === "1"; render(); if (aboutEditing) document.querySelector('[data-bind^="about."]')?.focus(); else toast("Saved 💗"); return; }
    if (d.feel) { const set = feelSet(viewer()); set.has(d.feel) ? set.delete(d.feel) : set.add(d.feel); S.about[viewer()].feel = [...set].join(","); save(); render(); return; }
    if (d.task) { const i = Number(d.task); S.aiDone[i] = !S.aiDone[i]; save(); render(); if (S.aiDone[i]) confetti(30); return; }
    if (d.idea) { set(`month.${viewer()}.goal`, d.idea); save(); render(); return; }
  });

  document.addEventListener("keydown", (e) => {
    const g = e.target.closest?.("[data-go]");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); g.click(); }
  });

  document.addEventListener("input", (e) => {
    const p = e.target.dataset?.bind; if (!p) return;
    set(p, e.target.type === "checkbox" ? e.target.checked : e.target.value); save(); refreshLive();
  });
  document.addEventListener("change", (e) => { if (e.target.dataset && "rerender" in e.target.dataset) render(); });

  document.addEventListener("change", async (e) => {
    if (e.target.id !== "importFile") return;
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || ![1, 2].includes(data.v)) throw new Error("not a BoonBoo backup");
      S = adopt(data); save(); render(true); toast("Backup restored ✨");
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

  window.addEventListener("hashchange", () => render(true));
  Sync.setMode("local");
  render();
  Sync.start();
})();
