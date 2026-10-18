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
 * The visitor's most played songs, placed on a 0..1000 square so that songs played in the same sittings sit close together.
 * Returns { songs, years } where each song is {i, x, y, plays, first, last, name, artist, id, yr: plays per year}, or { songs: [], reason } when there is too little history.
 */
export async function buildSongSpace(real, { maxSongs = 1200, onProgress = () => {} } = {}) {
  const top = A.songs(real).slice(0, maxSongs), N = top.length;
  if (N < 60) return { songs: [], reason: "few" };
  const index = new Map(top.map((s, i) => [s.key, i]));
  const years = A.byYear(real).map(y => y.year), yi = new Map(years.map((y, i) => [y, i]));
  const yr = top.map(() => new Array(years.length).fill(0));
  const sessions = []; let cur = new Set(), prevEnd = null;
  for (const r of real) {
    if (prevEnd !== null && r.ts - r.ms - prevEnd > SESSION_GAP_MS) { if (cur.size >= 2) sessions.push([...cur]); cur = new Set(); }
    const i = index.get(r.key); if (i !== undefined) { cur.add(i); yr[i][yi.get(r.y)]++; }
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
  onProgress(0.05); await yieldNow();
  const rand = rng(7), k = Math.min(24, N - 1);
  const E = lowRank(N, M, rowStart, colIdx, val, k, 25, rand);
  onProgress(0.2); await yieldNow();
  const Y = await tsne(E, N, k, rand, onProgress);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, Y[i * 2]); maxX = Math.max(maxX, Y[i * 2]); minY = Math.min(minY, Y[i * 2 + 1]); maxY = Math.max(maxY, Y[i * 2 + 1]); }
  const scale = 1000 / (Math.max(maxX - minX, maxY - minY) || 1);
  const songs = top.map((s, i) => {
    const counts = yr[i], first = years[counts.findIndex(v => v > 0)], last = years[counts.length - 1 - [...counts].reverse().findIndex(v => v > 0)];
    return { i, x: (Y[i * 2] - minX) * scale, y: (Y[i * 2 + 1] - minY) * scale, plays: s.plays, first, last, name: s.name, artist: s.artist, id: s.id, yr: counts };
  });
  onProgress(1);
  return { songs, years };
}
