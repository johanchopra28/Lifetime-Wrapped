// Lifetime Wrapped analysis. Pure functions on plain arrays, no DOM, so they can be tested.
// A "real play" is a play of 30 seconds or more. Songs are merged by title + artist, so a song released twice counts once.
// Times use the browser's own time zone.

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const BANDS = [["Night (12am-6am)", 0, 6], ["Morning (6am-12pm)", 6, 12], ["Afternoon (12pm-5pm)", 12, 17], ["Evening (5pm-12am)", 17, 24]];
export const REAL_MS = 30000;
const DAY_MS = 86400000;

// ------------------------------------------------------------------ preparing
export function songKey(name, artist) {
  return (name || "").toLowerCase() + "|" + (artist || "").toLowerCase();
}

/** raw: [{ts (ms since epoch, when the play ended), ms, id, name, artist, album, skipped}] -> rows with local date parts. */
export function prepare(raw) {
  const rows = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const dt = new Date(r.ts);
    const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
    rows[i] = {
      ts: r.ts, ms: r.ms, id: r.id, name: r.name, artist: r.artist, album: r.album, skipped: r.skipped,
      key: songKey(r.name, r.artist), real: r.ms >= REAL_MS, hours: r.ms / 3600000,
      y, mo: m, dn: Math.floor(Date.UTC(y, m - 1, d) / DAY_MS), h: dt.getHours(), wd: (dt.getDay() + 6) % 7,
    };
  }
  rows.sort((a, b) => a.ts - b.ts);
  return { all: rows, real: rows.filter(r => r.real) };
}

/** Drop plays of the given songs (keys from songKey) before preparing. */
export function excludeSongs(raw, keys) {
  if (!keys.size) return raw;
  return raw.filter(r => !keys.has(songKey(r.name, r.artist)));
}

export function dayString(dn) {
  return new Date(dn * DAY_MS).toISOString().slice(0, 10);
}
export function dayText(dn) {
  const d = new Date(dn * DAY_MS);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ------------------------------------------------------------------ helpers
function inc(map, key, by = 1) { map.set(key, (map.get(key) || 0) + by); }
function byPlaysThenHours(a, b) { return b.plays - a.plays || b.hours - a.hours || (a.key < b.key ? -1 : 1); }
export function slice(rows, year, month) {
  let r = rows;
  if (year != null) r = r.filter(x => x.y === year);
  if (month != null) r = r.filter(x => x.mo === month);
  return r;
}

/** One entry per song: the most played release supplies the id, title, artist and album. */
export function songs(rows) {
  const per = new Map();
  for (const r of rows) {
    let s = per.get(r.key);
    if (!s) { s = { key: r.key, plays: 0, hours: 0, ids: new Map() }; per.set(r.key, s); }
    s.plays++; s.hours += r.hours;
    let i = s.ids.get(r.id);
    if (!i) { i = { n: 0, name: r.name, artist: r.artist, album: r.album }; s.ids.set(r.id, i); }
    i.n++;
  }
  const out = [];
  for (const s of per.values()) {
    let bestId = null, best = null;
    for (const [id, i] of s.ids) if (!best || i.n > best.n) { bestId = id; best = i; }
    out.push({ key: s.key, id: bestId, name: best.name, artist: best.artist, album: best.album, plays: s.plays, hours: s.hours });
  }
  return out.sort(byPlaysThenHours);
}

export function topSongs(real, n = 20, year, month) { return songs(slice(real, year, month)).slice(0, n); }

export function topArtists(real, n = 20, year, month) {
  const per = new Map();
  for (const r of slice(real, year, month)) {
    let a = per.get(r.artist);
    if (!a) { a = { key: r.artist, artist: r.artist, plays: 0, hours: 0, keys: new Set() }; per.set(r.artist, a); }
    a.plays++; a.hours += r.hours; a.keys.add(r.key);
  }
  return [...per.values()].map(a => ({ artist: a.artist, key: a.artist, plays: a.plays, hours: a.hours, songs: a.keys.size }))
    .sort(byPlaysThenHours).slice(0, n);
}

// ------------------------------------------------------------------ totals
/** The albums played most (by real plays), optionally for one year. Plays with no album name are ignored. */
export function topAlbums(real, n = 1, year) {
  const m = new Map();
  for (const r of slice(real, year)) {
    if (!r.album) continue;
    const k = r.album + "|" + r.artist;
    let a = m.get(k);
    if (!a) { a = { album: r.album, artist: r.artist, plays: 0 }; m.set(k, a); }
    a.plays++;
  }
  return [...m.values()].sort((a, b) => b.plays - a.plays).slice(0, n);
}

export function overview(real, all) {
  const days = new Set(real.map(r => r.dn));
  const keys = new Set(), artists = new Set();
  let hours = 0;
  for (const r of real) { keys.add(r.key); artists.add(r.artist); hours += r.hours; }
  const sorted = [...days].sort((a, b) => a - b);
  return { realPlays: real.length, allPlays: all.length, hours, songs: keys.size, artists: artists.size,
           firstDay: sorted[0], lastDay: sorted[sorted.length - 1], activeDays: days.size,
           perActiveDay: days.size ? real.length / days.size : 0 };
}

export function byYear(real) {
  const m = new Map();
  for (const r of real) {
    let y = m.get(r.y);
    if (!y) { y = { year: r.y, plays: 0, hours: 0, keys: new Set(), artists: new Set() }; m.set(r.y, y); }
    y.plays++; y.hours += r.hours; y.keys.add(r.key); y.artists.add(r.artist);
  }
  return [...m.values()].sort((a, b) => a.year - b.year).map(y => ({ year: y.year, plays: y.plays, hours: y.hours, songs: y.keys.size, artists: y.artists.size }));
}

export function byMonth(real, year) {
  const out = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, plays: 0, hours: 0 }));
  for (const r of real) if (r.y === year) { out[r.mo - 1].plays++; out[r.mo - 1].hours += r.hours; }
  return out;
}

export function monthlyRulers(real, year) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const chunk = real.filter(r => r.y === year && r.mo === m);
    if (!chunk.length) continue;
    const top = songs(chunk)[0];
    out.push({ month: m, ...top, monthPlays: chunk.length, share: top.plays / chunk.length });
  }
  return out;
}

export function hourWeekday(real) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const r of real) grid[r.wd][r.h]++;
  return grid;
}

export function timeBands(real) {
  const total = Math.max(real.length, 1);
  return BANDS.map(([band, lo, hi]) => {
    let n = 0;
    for (const r of real) if (r.h >= lo && r.h < hi) n++;
    return { band, plays: n, share: n / total };
  });
}

export function dailyCounts(real, year) {
  const m = new Map();
  for (const r of real) if (r.y === year) inc(m, r.dn);
  return m;
}

export function streaks(real) {
  const days = [...new Set(real.map(r => r.dn))].sort((a, b) => a - b);
  if (!days.length) return { streakDays: 0 };
  let run = 1, best = 1, bestEnd = days[0], gap = 0, gapStart = null, gapEnd = null, runStart = days[0], bestStart = days[0];
  for (let i = 1; i < days.length; i++) {
    const diff = days[i] - days[i - 1];
    if (diff === 1) { run++; } else { run = 1; runStart = days[i]; }
    if (run > best) { best = run; bestEnd = days[i]; bestStart = runStart; }
    if (diff - 1 > gap) { gap = diff - 1; gapStart = days[i - 1] + 1; gapEnd = days[i] - 1; }
  }
  return { streakDays: best, streakStart: bestStart, streakEnd: bestEnd, gapDays: gap, gapStart, gapEnd };
}

export function busiestDays(real, n = 10) {
  const m = new Map();
  for (const r of real) { let d = m.get(r.dn); if (!d) { d = { dn: r.dn, plays: 0, hours: 0 }; m.set(r.dn, d); } d.plays++; d.hours += r.hours; }
  return [...m.values()].sort((a, b) => b.plays - a.plays || b.hours - a.hours || a.dn - b.dn).slice(0, n);
}

export function milestones(real, marks = [1, 1000, 10000, 50000, 100000, 150000]) {
  return marks.filter(k => k <= real.length).map(k => ({ n: k, ...real[k - 1] }));
}

export function discovery(real) {
  const first = new Map();
  for (const r of real) if (!first.has(r.key) || r.y < first.get(r.key)) first.set(r.key, r.y);
  const per = new Map();
  for (const r of real) {
    let y = per.get(r.y);
    if (!y) { y = { year: r.y, plays: 0, playsNew: 0, newKeys: new Set() }; per.set(r.y, y); }
    y.plays++;
    if (first.get(r.key) === r.y) { y.playsNew++; y.newKeys.add(r.key); }
  }
  return [...per.values()].sort((a, b) => a.year - b.year).map(y => ({ year: y.year, newSongs: y.newKeys.size, plays: y.plays, playsOfNew: y.playsNew, shareNew: y.playsNew / y.plays }));
}

export function skipRates(all) {
  const per = new Map();
  for (const r of all) {
    let y = per.get(r.y);
    if (!y) { y = { year: r.y, plays: 0, real: 0 }; per.set(r.y, y); }
    y.plays++; if (r.real) y.real++;
  }
  return [...per.values()].sort((a, b) => a.year - b.year).map(y => ({ ...y, shareReal: y.real / y.plays }));
}

// ------------------------------------------------------------------ per-song statistics (cached per array)
const statsCache = new WeakMap();
export function songStats(real) {
  if (statsCache.has(real)) return statsCache.get(real);
  const per = new Map();
  for (const r of real) {
    let s = per.get(r.key);
    if (!s) { s = { key: r.key, artist: r.artist, plays: 0, days: new Map(), years: new Map(), last: r.dn, first: r.dn }; per.set(r.key, s); }
    s.plays++; inc(s.days, r.dn); inc(s.years, r.y);
    if (r.dn > s.last) s.last = r.dn;
    if (r.dn < s.first) s.first = r.dn;
  }
  const rep = new Map(songs(real).map(s => [s.key, s]));
  for (const s of per.values()) Object.assign(s, { id: rep.get(s.key).id, name: rep.get(s.key).name, album: rep.get(s.key).album });
  statsCache.set(real, per);
  return per;
}

export function comfortSongs(real, minYears = 5, n = 25) {
  return [...songStats(real).values()].filter(s => s.years.size >= minYears)
    .sort((a, b) => b.years.size - a.years.size || b.plays - a.plays).slice(0, n)
    .map(s => ({ ...s, years: s.years.size, firstYear: Math.min(...s.years.keys()), lastYear: Math.max(...s.years.keys()) }));
}

export function forgottenFavourites(real, minPlays = 20, quietDays = 365, n = 40) {
  const asOf = real[real.length - 1].dn;
  const out = [];
  for (const s of songStats(real).values()) {
    if (s.plays < minPlays || !(s.last < asOf - quietDays)) continue;
    let peak = null, peakN = 0;
    for (const [y, c] of s.years) if (c > peakN || (c === peakN && y < peak)) { peak = y; peakN = c; }
    out.push({ ...s, peakYear: peak, quietDays: asOf - s.last, lastDay: s.last });
  }
  out.sort((a, b) => b.plays - a.plays || (a.key < b.key ? -1 : 1));
  return { total: out.length, list: out.slice(0, n) };
}

export function obsessions(real, n = 15) {
  const best = new Map();
  const per = new Map();
  for (const r of real) inc(per, r.key + "\u0001" + r.dn);
  for (const [k, c] of per) {
    const [key, dn] = k.split("\u0001");
    const b = best.get(key);
    if (!b || c > b.c || (c === b.c && +dn < b.dn)) best.set(key, { c, dn: +dn });
  }
  const rep = new Map(songs(real).map(s => [s.key, s]));
  return [...best.entries()].sort((a, b) => b[1].c - a[1].c || a[1].dn - b[1].dn).slice(0, n)
    .map(([key, b]) => ({ ...rep.get(key), playsThatDay: b.c, dn: b.dn }));
}

// ------------------------------------------------------------------ replays
export function replayAverage(real) {
  const per = new Map();
  for (const r of real) inc(per, r.key + "\u0001" + r.dn);
  let sum = 0;
  for (const c of per.values()) sum += c;
  return per.size ? sum / per.size : 0;
}

/** Songs you replay more than your usual: plays per listening day above the overall average. */
export function memoryLane(real, minPlays = 10, n = 50, minDays = 3) {
  const avg = replayAverage(real);
  const rep = new Map(songs(real).map(s => [s.key, s]));
  const out = [];
  for (const s of songStats(real).values()) {
    const days = s.days.size;
    const perDay = s.plays / days;
    if (s.plays < minPlays || days < minDays || !(perDay > avg)) continue;
    let replayDays = 0;
    for (const c of s.days.values()) if (c > 1) replayDays++;
    out.push({ ...rep.get(s.key), perDay, days, replayDays });
  }
  out.sort((a, b) => b.perDay - a.perDay || b.plays - a.plays);
  return { average: avg, total: out.length, list: out.slice(0, n) };
}

// ------------------------------------------------------------------ missed from artists you love
export const HIDDEN_WEIGHTS = { cameBack: 0.30, finished: 0.25, artist: 0.30, noSkips: 0.15 };

/** all = every play including those under 30 s. A guess from behaviour, not a record of likes. */
export function hiddenLikes(all, maxPlays = 15, weights = HIDDEN_WEIGHTS) {
  const length = new Map();
  for (const r of all) if (r.ms > (length.get(r.key) || 0)) length.set(r.key, r.ms);
  const per = new Map();
  const artistReal = new Map();
  for (const r of all) {
    let s = per.get(r.key);
    if (!s) { s = { key: r.key, artist: r.artist, playsAll: 0, realPlays: 0, finishedPlays: 0, days: new Set() }; per.set(r.key, s); }
    s.playsAll++;
    if (r.real) {
      s.realPlays++; s.days.add(r.dn); inc(artistReal, r.artist);
      const len = length.get(r.key);
      if (len < 60000 || r.ms >= 0.9 * len) s.finishedPlays++;
    }
  }
  const cand = [...per.values()].filter(s => s.realPlays >= 1 && s.realPlays <= maxPlays);
  for (const s of cand) { s.artistPlays = (artistReal.get(s.artist) || 0) - s.realPlays; s.skips = s.playsAll - s.realPlays; }
  // percentile rank of the artist's other plays among candidates (average rank for ties, like pandas rank(pct=True))
  const order = cand.map(s => s.artistPlays).sort((a, b) => a - b);
  const rankOf = new Map();
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j < order.length && order[j] === order[i]) j++;
    rankOf.set(order[i], ((i + 1 + j) / 2) / order.length);
    i = j;
  }
  const rep = new Map(songs(all.filter(r => r.real)).map(s => [s.key, s]));
  for (const s of cand) {
    s.daysN = s.days.size;
    s.parts = { cameBack: Math.min(Math.max(s.daysN - 1, 0), 3) / 3, finished: s.finishedPlays / s.realPlays,
                artist: rankOf.get(s.artistPlays), noSkips: 1 - s.skips / s.playsAll };
    s.score = 100 * (weights.cameBack * s.parts.cameBack + weights.finished * s.parts.finished + weights.artist * s.parts.artist + weights.noSkips * s.parts.noSkips);
    Object.assign(s, { id: rep.get(s.key).id, name: rep.get(s.key).name, album: rep.get(s.key).album });
  }
  cand.sort((a, b) => b.score - a.score || b.realPlays - a.realPlays);
  return cand.map(s => ({ key: s.key, id: s.id, name: s.name, artist: s.artist, album: s.album, score: s.score, plays: s.realPlays,
                          days: s.daysN, skips: s.skips, artistPlays: s.artistPlays, finishedPlays: s.finishedPlays }));
}

// ------------------------------------------------------------------ personality
export function personality(real) {
  if (!real.length) return [];
  const out = [];
  const bands = timeBands(real);
  const night = bands[0].share;
  const top = [...bands].sort((a, b) => b.share - a.share)[0];
  if (night >= 0.25) out.push(["Night owl", `${Math.round(night * 100)}% of your plays happen between midnight and 6am.`]);
  else out.push([top.band.split(" (")[0] + " listener", `${Math.round(top.share * 100)}% of your plays fall in the ${top.band.toLowerCase()}.`]);
  const per = new Map();
  for (const r of real) inc(per, r.key + "\u0001" + r.dn);
  let rep = 0;
  for (const c of per.values()) if (c > 1) rep++;
  const replay = rep / per.size;
  out.push(replay >= 0.12 ? ["Binge repeater", `On ${Math.round(replay * 100)}% of the days you play a song, you play it again the same day.`]
                          : ["One-and-done", `You replay a song on the same day only ${Math.round(replay * 100)}% of the time.`]);
  const ap = new Map();
  for (const r of real) inc(ap, r.artist);
  const top10 = [...ap.values()].sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0) / real.length;
  out.push(top10 >= 0.2 ? ["Artist loyalist", `Your top 10 artists make up ${Math.round(top10 * 100)}% of all your plays.`]
                        : ["Wide explorer", `Your top 10 artists make up only ${Math.round(top10 * 100)}% of your plays.`]);
  const per1000 = new Set(real.map(r => r.key)).size / real.length * 1000;
  out.push(per1000 >= 120 ? ["Collector", `${Math.round(per1000)} different songs for every 1,000 plays.`]
                          : ["Keeper", `Only ${Math.round(per1000)} different songs for every 1,000 plays: you play favourites on repeat.`]);
  const span = real[real.length - 1].dn - real[0].dn + 1;   // real is sorted by time
  const active = new Set(real.map(r => r.dn)).size / span;
  if (active >= 0.8) out.push(["Daily habit", `You listened on ${Math.round(active * 100)}% of all days since you started.`]);
  else if (active < 0.5) out.push(["In bursts", `You listened on only ${Math.round(active * 100)}% of days since you started.`]);
  return out;
}

// ------------------------------------------------------------------ compare years, artists, breaks, drift
export function yearProfile(real, year) {
  const r = real.filter(x => x.y === year);
  if (!r.length) return null;
  const first = new Map();
  for (const x of real) if (!first.has(x.key) || x.y < first.get(x.key)) first.set(x.key, x.y);
  const keys = new Set(r.map(x => x.key));
  let newSongs = 0;
  for (const k of keys) if (first.get(k) === year) newSongs++;
  // Python counts every song first heard in `year` (same thing here, since keys are those played that year)
  const days = new Set(r.map(x => x.dn));
  let hours = 0;
  for (const x of r) hours += x.hours;
  const bands = timeBands(r);
  return { year, plays: r.length, hours, songs: keys.size, artists: new Set(r.map(x => x.artist)).size, newSongs,
           activeDays: days.size, perActiveDay: r.length / days.size, nightShare: bands[0].share, bands };
}

export function newArtists(real, year, n = 10) {
  const first = new Map();
  for (const r of real) if (!first.has(r.artist) || r.y < first.get(r.artist)) first.set(r.artist, r.y);
  const per = new Map();
  for (const r of real) if (r.y === year && first.get(r.artist) === year) {
    let a = per.get(r.artist);
    if (!a) { a = { artist: r.artist, plays: 0, hours: 0 }; per.set(r.artist, a); }
    a.plays++; a.hours += r.hours;
  }
  return [...per.values()].sort((a, b) => b.plays - a.plays || b.hours - a.hours).slice(0, n);
}

export function artistOptions(real, minPlays = 20) {
  const c = new Map();
  for (const r of real) inc(c, r.artist);
  return [...c.entries()].filter(([, n]) => n >= minPlays).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([a, n]) => ({ artist: a, plays: n }));
}

export function artistProfile(real, artist, gapDays = 90) {
  const r = real.filter(x => x.artist === artist);
  if (!r.length) return null;
  const ym = new Map();
  for (const x of r) inc(ym, x.y * 100 + x.mo);
  let peak = null, peakN = 0;
  for (const [k, c] of [...ym.entries()].sort((a, b) => a[0] - b[0])) if (c > peakN) { peak = k; peakN = c; }
  const days = [...new Set(r.map(x => x.dn))].sort((a, b) => a - b);
  const quiet = [];
  for (let i = 1; i < days.length; i++) {
    const silent = days[i] - days[i - 1] - 1;
    if (silent >= gapDays) quiet.push({ start: days[i - 1] + 1, end: days[i] - 1, days: silent });
  }
  quiet.sort((a, b) => b.days - a.days);
  const hours = r.reduce((a, x) => a + x.hours, 0);
  const monthly = [...ym.entries()].sort((a, b) => a[0] - b[0]).map(([k, c]) => ({ year: Math.floor(k / 100), month: k % 100, plays: c }));
  return { plays: r.length, hours, songs: new Set(r.map(x => x.key)).size, activeDays: days.length, first: r[0], last: r[r.length - 1],
           peakYear: Math.floor(peak / 100), peakMonth: peak % 100, peakPlays: peakN, monthly, topSongs: songs(r).slice(0, 10), quiet };
}

export function breaks(real, minDays = 14) {
  const out = [];
  let prev = null;
  for (const r of real) {
    if (prev && r.dn - prev.dn - 1 >= minDays) {
      out.push({ start: prev.dn + 1, end: r.dn - 1, days: r.dn - prev.dn - 1, lastSong: prev.name, lastArtist: prev.artist, firstSong: r.name, firstArtist: r.artist });
    }
    prev = r;
  }
  return out.sort((a, b) => b.days - a.days);
}

/** Per year, how much of its top-n list (songs or artists) carried over from the year before, is new, or came back. */
export function tasteDrift(real, n = 50, by = "key") {
  const first = new Map();
  const per = new Map();
  for (const r of real) {
    const k = by === "key" ? r.key : r.artist;
    if (!first.has(k) || r.y < first.get(k)) first.set(k, r.y);
    let y = per.get(r.y);
    if (!y) { y = new Map(); per.set(r.y, y); }
    inc(y, k);
  }
  const tops = new Map();
  for (const [y, m] of per) tops.set(y, [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(e => e[0]));
  const years = [...tops.keys()].sort((a, b) => a - b);
  return years.slice(1).map(y => {
    const cur = tops.get(y), prev = new Set(tops.get(y - 1) || []);
    const carried = cur.filter(k => prev.has(k)).length, nw = cur.filter(k => first.get(k) === y).length;
    return { year: y, size: cur.length, carried, new: nw, returning: cur.length - carried - nw, shareCarried: carried / cur.length };
  });
}

export function yearCard(real, year) {
  const r = real.filter(x => x.y === year);
  if (!r.length) return null;
  const p = yearProfile(real, year);
  const months = byMonth(real, year);
  const bestMonth = [...months].sort((a, b) => b.plays - a.plays)[0].month;
  const busiest = busiestDays(r, 1)[0];
  return { ...p, topSongs: topSongs(real, 5, year), topArtists: topArtists(real, 5, year), bestMonth, busiest, streak: streaks(r).streakDays };
}
