// Works out a map of the visitor's own songs, in their browser: songs they played in the same sittings end up close together.
// Nothing leaves the page. Steps: split plays into sessions (30 minutes of silence ends one) -> songs x sessions matrix ->
// a low-rank "listened together" embedding (subspace iteration, i.e. a truncated SVD) -> t-SNE down to two dimensions.
import * as A from "./analysis.js";

const SESSION_GAP_MS = 30 * 60 * 1000;
const yieldNow = () => new Promise(r => setTimeout(r, 0));

/** Small seeded random numbers, so the same history always gives the same map. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function normal(rand) { return Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand()); }

/** Subspace iteration for the top k left singular vectors of the sparse matrix (CSR rows). Returns rows of U*S, one row per song. */
function lowRank(N, M, rowStart, colIdx, val, k, iters, rand) {
  let X = new Float64Array(N * k);
  for (let i = 0; i < X.length; i++) X[i] = normal(rand);
  const Z = new Float64Array(M * k);
  const orth = (V) => {   // modified Gram-Schmidt on the k columns
    for (let j = 0; j < k; j++) {
      for (let p = 0; p < j; p++) { let d = 0; for (let i = 0; i < N; i++) d += V[i * k + j] * V[i * k + p]; for (let i = 0; i < N; i++) V[i * k + j] -= d * V[i * k + p]; }
      let n = 0; for (let i = 0; i < N; i++) n += V[i * k + j] * V[i * k + j]; n = Math.sqrt(n) || 1;
      for (let i = 0; i < N; i++) V[i * k + j] /= n;
    }
  };
  const AtX = () => { Z.fill(0); for (let i = 0; i < N; i++) for (let e = rowStart[i]; e < rowStart[i + 1]; e++) { const c = colIdx[e] * k, w = val[e]; for (let j = 0; j < k; j++) Z[c + j] += w * X[i * k + j]; } };
  orth(X);
  for (let it = 0; it < iters; it++) {
    AtX();
    const Y = new Float64Array(N * k);
    for (let i = 0; i < N; i++) for (let e = rowStart[i]; e < rowStart[i + 1]; e++) { const c = colIdx[e] * k, w = val[e]; for (let j = 0; j < k; j++) Y[i * k + j] += w * Z[c + j]; }
    X = Y; orth(X);
  }
  AtX();
  const sigma = new Float64Array(k);
  for (let j = 0; j < k; j++) { let n = 0; for (let c = 0; c < M; c++) n += Z[c * k + j] * Z[c * k + j]; sigma[j] = Math.sqrt(n); }
  const E = new Float64Array(N * k);
  for (let i = 0; i < N; i++) { let n = 0; for (let j = 0; j < k; j++) { E[i * k + j] = X[i * k + j] * sigma[j]; n += E[i * k + j] ** 2; } n = Math.sqrt(n) || 1; for (let j = 0; j < k; j++) E[i * k + j] /= n; }
  return E;
}

/** Exact t-SNE (fine for about a thousand points). Calls onProgress(0..1) and gives the page time to breathe between batches. */
async function tsne(E, N, d, rand, onProgress, { perplexity = 25, iters = 320, exaggerate = 12, exaggerateIters = 90 } = {}) {
  const D2 = new Float32Array(N * N);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { let s = 0; for (let c = 0; c < d; c++) { const t = E[i * d + c] - E[j * d + c]; s += t * t; } D2[i * N + j] = D2[j * N + i] = s; }
  const P = new Float32Array(N * N), target = Math.log(perplexity);
  for (let i = 0; i < N; i++) {   // per-point bandwidth so each point has the wanted perplexity
    let beta = 1, lo = -Infinity, hi = Infinity;
    for (let tries = 0; tries < 50; tries++) {
      let sum = 0, sd = 0;
      for (let j = 0; j < N; j++) { if (j === i) continue; const p = Math.exp(-D2[i * N + j] * beta); P[i * N + j] = p; sum += p; sd += D2[i * N + j] * p; }
      const H = Math.log(sum) + beta * sd / sum, diff = H - target;
      if (Math.abs(diff) < 1e-4) break;
      if (diff > 0) { lo = beta; beta = hi === Infinity ? beta * 2 : (beta + hi) / 2; } else { hi = beta; beta = lo === -Infinity ? beta / 2 : (beta + lo) / 2; }
    }
    let sum = 0; for (let j = 0; j < N; j++) sum += P[i * N + j]; for (let j = 0; j < N; j++) P[i * N + j] /= sum || 1;
  }
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const v = (P[i * N + j] + P[j * N + i]) / (2 * N); P[i * N + j] = P[j * N + i] = Math.max(v, 1e-12); }
  const Y = new Float64Array(N * 2), dY = new Float64Array(N * 2), gains = new Float64Array(N * 2).fill(1), G = new Float64Array(N * 2), num = new Float32Array(N * N);
  for (let i = 0; i < N; i++) { Y[i * 2] = E[i * d + 1] * 0.5 + normal(rand) * 1e-3; Y[i * 2 + 1] = E[i * d + 2] * 0.5 + normal(rand) * 1e-3; }   // start from two of the embedding's own axes
  const lr = 200;
  for (let it = 0; it < iters; it++) {
    const ex = it < exaggerateIters ? exaggerate : 1, mom = it < exaggerateIters ? 0.5 : 0.8;
    let sumQ = 0;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const dx = Y[i * 2] - Y[j * 2], dy = Y[i * 2 + 1] - Y[j * 2 + 1], q = 1 / (1 + dx * dx + dy * dy); num[i * N + j] = q; sumQ += 2 * q; }
    G.fill(0);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const q = num[i * N + j], m = (ex * P[i * N + j] - q / sumQ) * q, dx = Y[i * 2] - Y[j * 2], dy = Y[i * 2 + 1] - Y[j * 2 + 1];
      G[i * 2] += m * dx; G[i * 2 + 1] += m * dy; G[j * 2] -= m * dx; G[j * 2 + 1] -= m * dy;
    }
    for (let a = 0; a < N * 2; a++) {
      const g = 4 * G[a];
      gains[a] = Math.sign(g) !== Math.sign(dY[a]) ? gains[a] + 0.2 : gains[a] * 0.8; if (gains[a] < 0.01) gains[a] = 0.01;
      dY[a] = mom * dY[a] - lr * gains[a] * g; Y[a] += dY[a];
    }
    let mx = 0, my = 0; for (let i = 0; i < N; i++) { mx += Y[i * 2]; my += Y[i * 2 + 1]; } mx /= N; my /= N;
    for (let i = 0; i < N; i++) { Y[i * 2] -= mx; Y[i * 2 + 1] -= my; }
    if (it % 8 === 7) { onProgress(0.2 + 0.8 * (it + 1) / iters); await yieldNow(); }
  }
  return Y;
}

/**
 * Every song the visitor played (30 seconds or more), placed on a 0..1000 square so that songs played in the same sittings sit close together.
 * The skeleton of the map comes from the most played songs (t-SNE); every other song is placed beside the skeleton songs it was played with.
 * Returns { songs, years } where each song is {i, x, y, plays, first, last, name, artist, id, yr: plays per year},
 * or { songs: [], reason } when there is too little history.
 */
export async function buildSongSpace(real, { coreSize = 1200, onProgress = () => {} } = {}) {
  const top = A.songs(real), N = top.length;      // merged by title + artist, most played first
  if (N < 60) return { songs: [], reason: "few" };
  const index = new Map(top.map((s, i) => [s.key, i]));
  const years = A.byYear(real).map(y => y.year), yi = new Map(years.map((y, i) => [y, i]));
  const yr = top.map(() => new Array(years.length).fill(0));
  const sessions = []; let cur = new Set(), prevEnd = null;
  for (const r of real) {
    if (prevEnd !== null && r.ts - r.ms - prevEnd > SESSION_GAP_MS) { if (cur.size >= 2) sessions.push([...cur]); cur = new Set(); }
    const i = index.get(r.key); cur.add(i); yr[i][yi.get(r.y)]++;
    prevEnd = r.ts;
  }
  if (cur.size >= 2) sessions.push([...cur]);
  if (sessions.length < 10) return { songs: [], reason: "few" };
  // songs x sessions, busy sessions counting for less, rows scaled to length 1
  const M = sessions.length, counts = new Int32Array(N);
  for (const s of sessions) for (const i of s) counts[i]++;
  const rowStart = new Int32Array(N + 1); for (let i = 0; i < N; i++) rowStart[i + 1] = rowStart[i] + counts[i];
  const colIdx = new Int32Array(rowStart[N]), val = new Float32Array(rowStart[N]), fill = rowStart.slice(0, N);
  sessions.forEach((s, c) => { const w = 1 / Math.log(2 + s.length); for (const i of s) { colIdx[fill[i]] = c; val[fill[i]++] = w; } });
  for (let i = 0; i < N; i++) { let n = 0; for (let e = rowStart[i]; e < rowStart[i + 1]; e++) n += val[e] * val[e]; n = Math.sqrt(n) || 1; for (let e = rowStart[i]; e < rowStart[i + 1]; e++) val[e] /= n; }
  onProgress(0.03); await yieldNow();
  const rand = rng(7), k = Math.min(24, N - 1);
  const E = lowRank(N, M, rowStart, colIdx, val, k, 25, rand);     // one row per song, length 1 (a zero row for a song never played with another)
  onProgress(0.15); await yieldNow();
  // the skeleton: the most played songs that were played with others
  const core = []; for (let i = 0; i < N && core.length < coreSize; i++) if (counts[i] > 0) core.push(i);
  if (core.length < 40) return { songs: [], reason: "few" };
  const Ec = new Float64Array(core.length * k); core.forEach((i, c) => { for (let j = 0; j < k; j++) Ec[c * k + j] = E[i * k + j]; });
  const Yc = await tsne(Ec, core.length, k, rand, p => onProgress(0.15 + 0.65 * (p - 0.2) / 0.8));
  const X = new Float64Array(N), Yv = new Float64Array(N), placed = new Uint8Array(N);
  core.forEach((i, c) => { X[i] = Yc[c * 2]; Yv[i] = Yc[c * 2 + 1]; placed[i] = 1; });
  // every other song goes to the weighted middle of the six skeleton songs it is closest to in the embedding
  const NB = 6, jitter = Math.sqrt((Math.max(...Yc.filter((_, a) => a % 2 === 0)) - Math.min(...Yc.filter((_, a) => a % 2 === 0))) ** 2) * 0.004;
  let done = 0;
  for (let i = 0; i < N; i++) {
    if (placed[i] || counts[i] === 0) continue;
    const best = []; // [similarity, core index], kept to NB entries
    for (let c = 0; c < core.length; c++) {
      let dot = 0; for (let j = 0; j < k; j++) dot += E[i * k + j] * Ec[c * k + j];
      if (best.length < NB || dot > best[best.length - 1][0]) { best.push([dot, c]); best.sort((a, b) => b[0] - a[0]); if (best.length > NB) best.pop(); }
    }
    let sx = 0, sy = 0, sw = 0;
    for (const [dot, c] of best) { const w = 1 / (Math.sqrt(Math.max(0, 2 - 2 * dot)) + 1e-3); sx += Yc[c * 2] * w; sy += Yc[c * 2 + 1] * w; sw += w; }
    X[i] = sx / sw + normal(rand) * jitter; Yv[i] = sy / sw + normal(rand) * jitter; placed[i] = 1;
    if (++done % 1500 === 0) { onProgress(0.8 + 0.17 * Math.min(1, done / Math.max(1, N - core.length))); await yieldNow(); }
  }
  // songs never played with another song carry no listening signal: put them beside their artist's other songs, or somewhere inside the map
  const byArtist = new Map();
  for (let i = 0; i < N; i++) if (placed[i]) { const a = top[i].artist; const g = byArtist.get(a) || [0, 0, 0]; g[0] += X[i]; g[1] += Yv[i]; g[2]++; byArtist.set(a, g); }
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
  for (let i = 0; i < N; i++) if (placed[i]) { mnX = Math.min(mnX, X[i]); mxX = Math.max(mxX, X[i]); mnY = Math.min(mnY, Yv[i]); mxY = Math.max(mxY, Yv[i]); }
  for (let i = 0; i < N; i++) if (!placed[i]) {
    const g = byArtist.get(top[i].artist);
    if (g) { X[i] = g[0] / g[2] + normal(rand) * jitter * 3; Yv[i] = g[1] / g[2] + normal(rand) * jitter * 3; }
    else { X[i] = mnX + rand() * (mxX - mnX); Yv[i] = mnY + rand() * (mxY - mnY); }
  }
  for (let i = 0; i < N; i++) { mnX = Math.min(mnX, X[i]); mxX = Math.max(mxX, X[i]); mnY = Math.min(mnY, Yv[i]); mxY = Math.max(mxY, Yv[i]); }
  const scale = 1000 / (Math.max(mxX - mnX, mxY - mnY) || 1);
  const songs = top.map((s, i) => {
    const c = yr[i], first = years[c.findIndex(v => v > 0)], last = years[c.length - 1 - [...c].reverse().findIndex(v => v > 0)];
    return { i, x: (X[i] - mnX) * scale, y: (Yv[i] - mnY) * scale, plays: s.plays, first, last, name: s.name, artist: s.artist, id: s.id, yr: c };
  });
  onProgress(1);
  return { songs, years };
}
