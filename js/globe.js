// The song globe: an endless grid of the visitor's songs wrapped on a sphere. The lit song faces you, the eight around it are faded,
// the rest curve away. Move in any of eight directions; the grid is remembered, so a place always holds the same songs.
// Songs come from embed.js (placed on a map by who they were played with). Runs entirely in the page.
import { esc } from "./charts.js";

const A = c => String.fromCharCode(c);   // arrows built from character codes so no text encoding can garble them
const DIRS = [["NW", -135, -1, -1, A(0x2196)], ["N", -90, 0, -1, A(0x2191)], ["NE", -45, 1, -1, A(0x2197)], ["W", 180, -1, 0, A(0x2190)], ["E", 0, 1, 0, A(0x2192)], ["SW", 135, -1, 1, A(0x2199)], ["S", 90, 0, 1, A(0x2193)], ["SE", 45, 1, 1, A(0x2198)]];
const DIR_AT = new Map(DIRS.map((d, k) => [d[2] + "," + d[3], k]));
const KEYMAP = { ArrowUp: 1, ArrowDown: 6, ArrowLeft: 3, ArrowRight: 4, q: 0, e: 2, z: 5, c: 7, Q: 0, E: 2, Z: 5, C: 7, "7": 0, "8": 1, "9": 2, "4": 3, "6": 4, "1": 5, "2": 6, "3": 7 };
const RING = 3, AHEAD = 4, STEP = 0.27;   // tiles kept around the middle; cells decided this far out; radians between neighbouring tiles
const fmt = n => n.toLocaleString("en-US");
const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hue(str) { let h = 0; for (let k = 0; k < str.length; k++) h = (h * 31 + str.charCodeAt(k)) >>> 0; return h % 360; }

const QUEUE_MAX = 100;   // the most songs Spotify takes in one paste
const queue = [];        // songs the visitor tapped to queue: {id, name, artist}. Kept only in this page, never saved or sent anywhere.
export const clearQueue = () => { queue.length = 0; };
let active = null;   // the one mounted globe, so it can be taken down when the tab changes

export function unmountGlobe() { if (active) { active.destroy(); active = null; } }

/**
 * root: element to fill. space: { songs, years } from embed.js.
 * opts: { useCovers, coverUrl(id) -> the cover url if it has loaded }. With covers on, the globe only ever uses songs whose cover has loaded.
 */
export function mountGlobe(root, space, opts) {
  unmountGlobe();
  const S = space.songs, years = space.years;
  const q = sel => root.querySelector(sel);
  let savedStyle = null;
  try { savedStyle = localStorage.getItem("gridScroll2"); } catch (e) { /* storage may be blocked */ }
  const st = { busy: false, scroll: savedStyle === "reversed" ? "reversed" : "natural" };
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ready = s => !opts.useCovers || !!opts.coverUrl(s.id);   // a song can appear once its cover is in
  const xs = S.map(s => s.x), ys = S.map(s => s.y), WX = Math.max(...xs) - Math.min(...xs) + 20, WY = Math.max(...ys) - Math.min(...ys) + 20;

  root.innerHTML = `<div class="gl">
    <div class="gl-bar"><button class="gl-btn" data-a="shuffle">Random song</button><button class="gl-btn" data-a="back">Back</button>
      <span>Scrolling <span class="gl-seg" data-a="scroll"></span></span><span class="muted gl-count"></span></div>
    <div class="gl-wrap"><div class="gl-stage" tabindex="0" aria-label="Song globe. Use the arrow keys, scroll or swipe to spin it."><div class="gl-globe"></div></div><aside class="gl-info"></aside></div>
    <div class="gl-tray" hidden></div>
    <p class="muted gl-hint">Spin: click a faded tile, scroll or swipe in any direction (drag it like a map: swipe down to go north, swipe right to go west; if that feels backwards on your trackpad, switch "Scrolling" above), or use the arrow keys, with Q, E, Z and C for the corners. Backspace goes back, Space picks a random song, Enter pins the song you are on.
    Songs sit near others you played in the same sittings, so "north" just means the next song that way on that map. Come back to a spot and you find the same songs.</p></div>`;
  const stage = q(".gl-stage"), globe = q(".gl-globe");

  // ---- the endless grid: cell (gx, gy) holds one song; cells are filled in as you move and remembered
  const cells = new Map(), used = new Set(), tiles = new Map();
  let pos = [0, 0], hist = [], T = 160, R = 480;
  const key = (x, y) => x + "," + y, cheb = (x, y) => Math.max(Math.abs(x - pos[0]), Math.abs(y - pos[1]));

  /** The nearest unused song from song i in direction k (within 75 degrees; nearer the exact direction wins ties). At an edge of the map it wraps round to the far side. */
  function pickInDir(i, k) {
    const c = S[i];
    const search = wrapped => {
      const wrap = (v, size) => ((v + size / 2) % size + size) % size - size / 2;
      let b = null, bs = 1e9;
      for (const s of S) {
        if (s.i === i || used.has(s.i) || !ready(s)) continue;
        const dx = wrapped ? wrap(s.x - c.x, WX) : s.x - c.x, dy = wrapped ? wrap(s.y - c.y, WY) : s.y - c.y;
        const dist = Math.hypot(dx, dy) || 0.01, dev = angDiff(Math.atan2(dy, dx) * 180 / Math.PI, DIRS[k][1]);
        if (dev > 75) continue;
        const score = dist * Math.pow(1 + dev / 30, 2); if (score < bs) { bs = score; b = s.i; }
      }
      return b;
    };
    let b = search(false); if (b === null) b = search(true);
    if (b === null) { let bd = 1e9; for (const s of S) { if (used.has(s.i) || !ready(s)) continue; const d = Math.hypot(s.x - c.x, s.y - c.y); if (d < bd) { bd = d; b = s.i; } } }
    return b;
  }
  function recycle() {   // every song is in use: forget the cells far from you so their songs can come back
    for (const k of [...cells.keys()]) { const [x, y] = k.split(",").map(Number); if (cheb(x, y) > AHEAD + 1) cells.delete(k); }
    used.clear(); for (const v of cells.values()) used.add(v);
  }
  function assignCell(gx, gy) {
    if (cells.has(key(gx, gy))) return;
    let ref = null, rd = 1e9;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {   // the filled neighbouring cell nearest the middle
      const v = cells.get(key(gx + dx, gy + dy)); if (v === undefined) continue;
      const d = cheb(gx + dx, gy + dy) + (dx && dy ? 0.5 : 0); if (d < rd) { rd = d; ref = [v, DIR_AT.get(-dx + "," + -dy)]; }
    }
    if (!ref) return;
    let s = pickInDir(ref[0], ref[1]);
    if (s === null) { recycle(); s = pickInDir(ref[0], ref[1]); }
    if (s === null) { const pool = S.filter(ready); s = pool[Math.floor(Math.random() * pool.length)].i; }
    cells.set(key(gx, gy), s); used.add(s);
  }
  const ensure = () => { for (let r = 1; r <= AHEAD; r++) for (let x = pos[0] - r; x <= pos[0] + r; x++) for (let y = pos[1] - r; y <= pos[1] + r; y++) if (cheb(x, y) === r) assignCell(x, y); };

  // ---- the sphere
  function size() {
    const W = stage.clientWidth || 600; T = W * 0.262; R = T / (STEP * 0.95);
    stage.style.perspective = R * 3.2 + "px"; globe.style.transform = `translateZ(${-R}px)`;
    for (const el of tiles.values()) { el.style.width = el.style.height = T + "px"; el.style.marginLeft = el.style.marginTop = -T / 2 + "px"; }
  }
  function makeTile(gx, gy) {
    const s = S[cells.get(key(gx, gy))], el = document.createElement("button"), url = opts.useCovers ? opts.coverUrl(s.id) : null;
    el.className = "gl-tile"; el.style.width = el.style.height = T + "px"; el.style.marginLeft = el.style.marginTop = -T / 2 + "px";
    el.innerHTML = `<div class="gl-fb" style="background:linear-gradient(135deg,hsl(${hue(s.artist)},55%,34%),hsl(${(hue(s.artist) + 45) % 360},60%,16%))"></div>${opts.useCovers ? `<img alt="" draggable="false" ${url ? `src="${esc(url)}"` : ""}>` : ""}
      <div class="gl-cap"><b>${esc(s.name)}</b><span>${esc(s.artist)}</span></div><span class="gl-dir"></span>`;
    el.dataset.g = key(gx, gy); globe.appendChild(el); tiles.set(key(gx, gy), el);
    return el;
  }
  function draw(fx, fy) {   // every tile for a view centred on (fx, fy), which can sit between cells while the globe turns
    for (const [k, el] of tiles) {
      const [gx, gy] = k.split(",").map(Number), u = gx - fx, v = gy - fy, dc = Math.max(Math.abs(u), Math.abs(v)), w = Math.max(0, 1 - dc);
      const op = dc <= 1 ? 0.3 + 0.7 * w : 0.3 * (1 - smooth(1, 3.2, dc));      // the eight around the lit tile stay faded, the rest die away toward the rim
      el.style.opacity = op.toFixed(3); el.style.setProperty("--w", w.toFixed(3));
      el.style.transform = `rotateY(${u * STEP}rad) rotateX(${-v * STEP}rad) translateZ(${R}px) scale(${1 + 0.07 * w})`;
      el.style.zIndex = Math.round(100 - dc * 20); el.style.pointerEvents = op > 0.1 ? "auto" : "none";
    }
  }
  function mark() {   // arrows on the eight tiles around the target cell
    for (const [k, el] of tiles) {
      const [gx, gy] = k.split(",").map(Number), rx = gx - pos[0], ry = gy - pos[1], c = rx === 0 && ry === 0, r1 = !c && Math.abs(rx) <= 1 && Math.abs(ry) <= 1;
      el.querySelector(".gl-dir").textContent = r1 ? DIRS[DIR_AT.get(rx + "," + ry)][4] : "";
      el.setAttribute("aria-label", c ? "The song you are on" : r1 ? DIRS[DIR_AT.get(rx + "," + ry)][0] : ""); el.tabIndex = c || r1 ? 0 : -1;
    }
  }
  function sync() {
    for (let x = pos[0] - RING; x <= pos[0] + RING; x++) for (let y = pos[1] - RING; y <= pos[1] + RING; y++) if (cells.has(key(x, y)) && !tiles.has(key(x, y))) makeTile(x, y);
    for (const [k, el] of tiles) { const [x, y] = k.split(",").map(Number); if (cheb(x, y) > RING + 1 || !cells.has(k)) { el.remove(); tiles.delete(k); } }
    mark();
  }

  // ---- gliding: the view centre follows the target with a loose spring (damping ratio 0.7): it eases in, swings about 5% past each song and settles back
  let fx = 0, fy = 0, vx = 0, vy = 0, raf = 0, last = 0;
  const K = 110, C = 1.4 * Math.sqrt(K);
  function step(dt) {
    vx += ((pos[0] - fx) * K - vx * C) * dt; vy += ((pos[1] - fy) * K - vy * C) * dt; fx += vx * dt; fy += vy * dt;
    const done = Math.abs(pos[0] - fx) < 0.0008 && Math.abs(pos[1] - fy) < 0.0008 && Math.abs(vx) < 0.003 && Math.abs(vy) < 0.003;
    if (done) { fx = pos[0]; fy = pos[1]; vx = vy = 0; }
    return done;
  }
  function tick(t) { const dt = Math.min(0.04, (t - last) / 1000); last = t; const done = step(dt); draw(fx, fy); raf = done ? 0 : requestAnimationFrame(tick); }
  function glide() { if (reduceMotion) { fx = pos[0]; fy = pos[1]; vx = vy = 0; draw(fx, fy); return; } if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }

  // ---- side panel
  function panels() {
    const c = S[cells.get(key(pos[0], pos[1]))], mx = Math.max(...c.yr, 1), bw = Math.min(30, 240 / years.length);
    const bars = c.yr.map((v, k) => `<rect x="${k * bw + 4}" y="${46 - 40 * v / mx}" width="${bw * 0.72}" height="${Math.max(40 * v / mx, v ? 2 : 0)}" rx="3" fill="#83c9ff"/><text x="${k * bw + 4 + bw * 0.36}" y="58" text-anchor="middle">${String(years[k]).slice(2)}</text>${v ? `<text class="n" x="${k * bw + 4 + bw * 0.36}" y="${42 - 40 * v / mx}" text-anchor="middle">${v}</text>` : ""}`).join("");
    q(".gl-info").innerHTML = `<h3>${esc(c.name)}</h3><p class="muted gl-artist">${esc(c.artist)}</p>
      <div class="gl-stats"><div><b>${fmt(c.plays)}</b><span>real plays</span></div><div><b>${c.first}</b><span>first heard</span></div><div><b>${c.last}</b><span>last played</span></div></div>
      <svg viewBox="0 0 ${Math.max(246, years.length * bw + 8)} 64" style="width:100%;max-width:300px;height:auto">${bars}</svg>
      <p class="gl-row"><button class="gl-btn gl-add" data-a="queue"></button> <a class="gl-link" href="https://open.spotify.com/track/${esc(c.id)}" target="_blank" rel="noopener noreferrer">Open on Spotify</a></p>
      <h4 class="muted">Where you are on the map</h4><canvas class="gl-mini" width="600" height="600"></canvas>`;
    drawMini(); paintAdd();
  }
  // ---- the queue tray: tap a song to add it, then copy the links (paste them into a Spotify playlist) or download a list
  const here = () => S[cells.get(key(pos[0], pos[1]))];
  const inQueue = id => queue.findIndex(x => x.id === id);
  function paintAdd() {
    const b = q(".gl-add"); if (!b) return; const c = here(), i = inQueue(c.id);
    b.textContent = i >= 0 ? "Pinned, tap to unpin" : queue.length >= QUEUE_MAX ? `Pins are full (${QUEUE_MAX})` : "Pin this song";
    b.disabled = i < 0 && queue.length >= QUEUE_MAX; b.classList.toggle("on", i >= 0);
  }
  function toggleQueue() {
    const c = here(), i = inQueue(c.id);
    if (i >= 0) queue.splice(i, 1); else if (queue.length < QUEUE_MAX) queue.push({ id: c.id, name: c.name, artist: c.artist });
    paintAdd(); paintTray();
  }
  function paintTray() {
    const tray = q(".gl-tray"); if (!tray) return;
    tray.hidden = !queue.length;
    if (queue.length) tray.innerHTML = `<div class="gl-trayhead"><b>Pinned songs</b><span class="muted">${queue.length} song${queue.length === 1 ? "" : "s"}</span>
      <span class="gl-trayact"><button class="gl-btn" data-q="copy">Copy Spotify links</button><button class="gl-btn" data-q="csv">Download CSV</button><button class="gl-btn" data-q="clear">Clear</button></span></div>
      <ol class="gl-queue">${queue.map((s, i) => { const u = opts.useCovers ? opts.coverUrl(s.id) : ""; return `<li>${u ? `<img src="${esc(u)}" alt="" width="40" height="40">` : `<span class="gl-ph"></span>`}<span><b>${esc(s.name)}</b><small>${esc(s.artist)}</small></span><button data-q="rm" data-i="${i}" aria-label="Remove ${esc(s.name)}">&times;</button></li>`; }).join("")}</ol>`;
    else tray.innerHTML = "";
    if (opts.onResize) opts.onResize();
  }
  function trayAction(t) {
    const act = t.dataset.q;
    if (act === "rm") { queue.splice(+t.dataset.i, 1); paintAdd(); paintTray(); }
    else if (act === "clear") { queue.length = 0; paintAdd(); paintTray(); }
    else if (act === "copy") {
      const old = t.textContent;
      Promise.resolve(navigator.clipboard.writeText(queue.map(s => `https://open.spotify.com/track/${s.id}`).join("\n"))).then(() => { t.textContent = `Copied ${queue.length} links`; setTimeout(() => { t.textContent = old; }, 1500); }, () => { t.textContent = "Could not copy"; setTimeout(() => { t.textContent = old; }, 1500); });
    } else if (act === "csv") {
      const cell = v => `"${String(v).replace(/"/g, '""')}"`;
      const url = URL.createObjectURL(new Blob(["Song,Artist,Spotify link\n" + queue.map(s => [s.name, s.artist, `https://open.spotify.com/track/${s.id}`].map(cell).join(",")).join("\n")], { type: "text/csv" }));
      const a = document.createElement("a"); a.href = url; a.download = "Song_globe_pinned.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  root.addEventListener("click", e => {
    const t = e.target.closest("[data-q]"); if (t) { trayAction(t); return; }
    if (e.target.closest('[data-a="queue"]')) toggleQueue();
  });
  function drawMini() {
    const cv = q(".gl-mini"); if (!cv) return; const g = cv.getContext("2d"), W = cv.width, k = W / 1040, o = 20 * k;
    g.fillStyle = "#0b0e13"; g.fillRect(0, 0, W, W);
    g.fillStyle = "rgba(131,201,255,.3)"; for (const s of S) if (ready(s)) g.fillRect(s.x * k + o - 1.5, s.y * k + o - 1.5, 3.4, 3.4);
    const at = p => { const v = cells.get(key(p[0], p[1])); return v === undefined ? null : S[v]; };
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2; g.beginPath(); let first = true;
    for (const p of hist.slice(-14).concat([pos])) { const s = at(p); if (!s) continue; first ? g.moveTo(s.x * k + o, s.y * k + o) : g.lineTo(s.x * k + o, s.y * k + o); first = false; } g.stroke();
    g.fillStyle = "#ffd16a";
    for (const d of DIRS) { const s = at([pos[0] + d[2], pos[1] + d[3]]); if (s) { g.beginPath(); g.arc(s.x * k + o, s.y * k + o, 6, 0, 6.2832); g.fill(); } }
    const c = at(pos); g.beginPath(); g.arc(c.x * k + o, c.y * k + o, 10, 0, 6.2832); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#0b0e13"; g.stroke();
  }

  function setPos(np) { pos = np; ensure(); sync(); panels(); glide(); }
  function stepOnce(k) { hist.push(pos.slice()); if (hist.length > 400) hist.shift(); setPos([pos[0] + DIRS[k][2], pos[1] + DIRS[k][3]]); }
  let chain = null;
  const stopChain = () => { if (chain) { clearTimeout(chain.timer); chain = null; } };
  function move(k) {
    stopChain();
    if (st.busy) return; st.busy = true; setTimeout(() => { st.busy = false; }, 90);   // short lock: quick flicks chain smoothly because the glide just retargets
    stepOnce(k);
  }
  /** A hard flick turns the globe several songs: n steps in direction k, each a little later than the one before, so it slows like a spinning ball. */
  function spin(k, n) {
    n = Math.max(1, Math.round(n));
    if (chain && chain.k === k) { chain.left = Math.min(8, chain.left + n); return; }   // a flick that carries on the same way adds to the spin
    stopChain();
    const c = chain = { k, left: Math.min(8, n), i: 0, timer: 0 };
    const tick = () => { if (chain !== c) return; if (c.left <= 0) { chain = null; return; } c.left--; stepOnce(k); c.i++; c.timer = setTimeout(tick, 70 + 26 * c.i); };
    tick();
  }
  const back = () => { stopChain(); if (hist.length) setPos(hist.pop()); };
  function random() {
    for (const el of tiles.values()) el.remove(); tiles.clear(); cells.clear(); used.clear(); hist = []; pos = [0, 0]; fx = fy = vx = vy = 0;
    const pool = S.filter(ready), s = pool[Math.floor(Math.random() * pool.length)].i; cells.set(key(0, 0), s); used.add(s);
    ensure(); size(); sync(); draw(fx, fy); panels();
  }

  // ---- input
  let swiped = false, down = null, ax = 0, ay = 0, wt = 0;
  const dirFromVector = (dx, dy) => { const ang = Math.atan2(dy, dx) * 180 / Math.PI; let best = 0, bd = 1e9; DIRS.forEach((d, k) => { const v = angDiff(ang, d[1]); if (v < bd) { bd = v; best = k; } }); return best; };
  globe.addEventListener("click", e => {
    const t = e.target.closest(".gl-tile"); if (!t || swiped) return;
    const [x, y] = t.dataset.g.split(",").map(Number), dx = Math.sign(x - pos[0]), dy = Math.sign(y - pos[1]); if (dx || dy) move(DIR_AT.get(dx + "," + dy));
  });
  const onKey = e => {
    if (!root.isConnected || !(root.contains(document.activeElement) || document.activeElement === document.body)) return;
    if (KEYMAP[e.key] !== undefined) { e.preventDefault(); move(KEYMAP[e.key]); }
    else if (e.key === "Backspace") { e.preventDefault(); back(); }
    else if (e.key === " ") { e.preventDefault(); random(); }
    else if (e.key === "Enter" && !/^(BUTTON|A|INPUT|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); toggleQueue(); }   // Enter queues the song you are on (a focused button keeps its own Enter)
  };
  document.addEventListener("keydown", onKey);
  stage.addEventListener("wheel", e => {
    e.preventDefault(); ax += e.deltaX; ay += e.deltaY; clearTimeout(wt); wt = setTimeout(() => { ax = ay = 0; }, 180);
    if (Math.hypot(ax, ay) > 60) { const f = st.scroll === "reversed" ? -1 : 1; spin(dirFromVector(f * ax, f * ay), Math.min(6, Math.floor(Math.hypot(ax, ay) / 75)) || 1); ax = ay = 0; }   // a bigger scroll turns it further. natural: scrolling up (finger down on a trackpad, wheel rolled up) goes north
  }, { passive: false });
  let samples = [];
  stage.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; swiped = false; samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }]; });
  stage.addEventListener("pointermove", e => { if (down) { samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp }); if (samples.length > 10) samples.shift(); } });
  stage.addEventListener("pointerup", e => {
    if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y, dist = Math.hypot(dx, dy); down = null;
    if (dist > 46) {
      const recent = samples.filter(m => e.timeStamp - m.t <= 120), a = recent[0] || samples[0];
      const speed = Math.hypot(e.clientX - a.x, e.clientY - a.y) / Math.max(16, e.timeStamp - a.t);   // pixels per millisecond at the moment of release
      const steps = Math.min(8, Math.max(1, Math.round(1 + Math.max(0, speed - 0.7) * 2.2 + Math.max(0, dist - 120) / 140)));   // a light drag moves one song, a hard flick up to eight
      swiped = true; spin(dirFromVector(-dx, -dy), steps); setTimeout(() => { swiped = false; }, 50);   // like turning a globe: the view moves opposite to the finger, so swipe down = north, swipe right = west
    }
  });
  const seg = q('[data-a="scroll"]');
  seg.innerHTML = [["natural", "Natural"], ["reversed", "Reversed"]].map(([k, l]) => `<button data-s="${k}" aria-pressed="${st.scroll === k}" title="${k === "natural" ? "Finger down (or wheel up) goes north, finger right goes west" : "Finger up (or wheel down) goes north, finger left goes west"}">${l}</button>`).join("");
  seg.addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (!b) return; st.scroll = b.dataset.s; seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); try { localStorage.setItem("gridScroll2", st.scroll); } catch (err) { /* ignore */ } });
  q(".gl-bar").addEventListener("click", e => { const a = e.target.closest("[data-a]"); if (!a) return; if (a.dataset.a === "shuffle") random(); else if (a.dataset.a === "back") back(); });
  const ro = new ResizeObserver(() => { if (cells.size) { size(); draw(fx, fy); } }); ro.observe(stage);

  const countEl = q(".gl-count");
  const target = Math.min(opts.coverTarget || S.length, S.length);   // the most played songs the loader fetches covers for (S is most played first)
  const paintCount = () => { countEl.textContent = opts.useCovers ? `${fmt(S.slice(0, target).filter(ready).length)} of ${fmt(target)} most played songs` : `${fmt(S.length)} songs to spin through`; };
  paintTray();
  paintCount(); const countTimer = setInterval(paintCount, 2000);
  random();
  active = { destroy() { cancelAnimationFrame(raf); raf = 0; clearInterval(countTimer); stopChain(); ro.disconnect(); document.removeEventListener("keydown", onKey); }, step, peek: () => [fx, fy], state: () => ({ pos, cells, S }) };
  return active;
}
