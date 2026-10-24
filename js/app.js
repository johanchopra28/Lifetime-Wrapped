import * as A from "./analysis.js";
import { loadFiles } from "./load.js";
import { sampleHistory } from "./sample.js";
import { buildSongSpace } from "./embed.js";
import { mountGlobe, unmountGlobe } from "./globe.js";
import { esc, bars, hbars, stacked, heatmap, calendar, streamChart, streamTipHtml } from "./charts.js";

const $ = id => document.getElementById(id);
const n0 = v => Math.round(v).toLocaleString();
const pct = v => Math.round(v * 100) + "%";
const link = id => `https://open.spotify.com/track/${id}`;

const state = {
  raw: null, excluded: new Map(), data: null, tab: "life", year: null, month: null,
  cmpThen: null, cmpNow: null, drift: "songs", lane: 3, breakDays: 3, forgotMin: 40, forgotMonths: 12,
  missedCap: 15, missedShown: 50, artist: null, calYear: null, card: "all", sel: "", minDays: 3, covers: true,
};
let memoCache = new Map();
const memo = (name, fn, ...args) => {
  const k = name + JSON.stringify(args);
  if (!memoCache.has(k)) memoCache.set(k, fn(...args));
  return memoCache.get(k);
};
const lists = new Map();   // downloadable lists, by id

// ------------------------------------------------------------------ loading
async function handleFiles(files, sample = false) {
  state.sample = sample;
  state.covers = !sample;   // the sample's songs are made up, so there is nothing to look up for them
  const status = $("status");
  status.hidden = false;
  status.classList.remove("error");
  try {
    const { plays } = await loadFiles(files, msg => { status.textContent = msg; });
    state.raw = plays;
    state.excluded = new Map();
    status.textContent = `Working out your stats from ${n0(plays.length)} plays...`;
    await new Promise(r => setTimeout(r, 30));
    build();
    status.hidden = true;
  } catch (e) {
    status.textContent = e.message || String(e);
    status.classList.add("error");
  }
}

function build() {
  const plays = A.excludeSongs(state.raw, new Set(state.excluded.keys()));
  state.data = A.prepare(plays);
  memoCache = new Map();
  for (const id of coverQueue.splice(0)) settle(id);   // lookups queued for the previous history are no longer wanted
  const years = A.byYear(state.data.real).map(y => y.year);
  state.year = years[years.length - 1];
  state.month = null;
  state.cmpThen = years[Math.min(1, years.length - 1)];
  state.cmpNow = years[years.length - 1];
  state.calYear = years[years.length - 1];
  state.artist = null;
  $("landing").hidden = true;
  $("app").hidden = false;
  render();
}

// ------------------------------------------------------------------ small html helpers
function table(head, rows, cls = "", boxCls = "") {
  return `<div class="scroll ${boxCls}"><table class="${cls}"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const songCell = s => `<a href="${link(s.id)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>`;

/** A ranked song table with buttons to copy the Spotify links or download a CSV. */
function songTable(id, title, list, extra = [], boxCls = "") {
  lists.set(id, { title, list });
  const rows = list.map((s, i) => [String(i + 1), ...(state.covers ? [coverImg(s.id)] : []), songCell(s), esc(s.artist), ...extra.map(e => e.f(s))]);
  const buttons = list.length ? `<div class="actions"><button data-act="copy" data-id="${id}">Copy Spotify links</button><button data-act="csv" data-id="${id}">Download CSV</button></div>` : "";
  return table(["#", ...(state.covers ? [""] : []), "Song", "Artist", ...extra.map(e => e.h)], rows, state.covers ? "covers" : "", boxCls) + buttons;
}
const metric = (label, value, help = "") => `<div class="metric" ${help ? `title="${esc(help)}"` : ""}><span>${esc(label)}</span><b>${value}</b></div>`;

// ------------------------------------------------------------------ tabs
const TABS = [["life", "Lifetime"], ["year", "Year by year"], ["cmp", "Compare years"], ["when", "When you listen"], ["habits", "Habits"],
              ["forgot", "Forgotten favourites"], ["missed", "Missed from artists you love"], ["artist", "Artist deep dive"], ["globe", "Song globe"], ["card", "Wrapped card"]];

function render() {
  const { real, all } = state.data;
  const ov = memo("ov", () => A.overview(real, all));
  const traits = memo("traits", () => A.personality(real));
  $("metrics").innerHTML = metric("Hours listened", n0(ov.hours), `${(ov.hours / 24).toFixed(0)} full days of music`) + metric("Real plays", n0(ov.realPlays), "A real play is 30 seconds or more")
    + metric("Different songs", n0(ov.songs)) + metric("Different artists", n0(ov.artists)) + metric("Days you listened", n0(ov.activeDays), `About ${ov.perActiveDay.toFixed(0)} real plays a day`);
  $("range").textContent = (state.sample ? "Sample data, made up for this demo, not a real history. " : "") + `${A.dayText(ov.firstDay)} to ${A.dayText(ov.lastDay)}. ${n0(all.length)} plays in all; a real play lasts 30 seconds or more.`;
  $("personality").innerHTML = `<b>Your listening personality:</b> ${traits.map(t => `<span class="chip">${esc(t[0])}</span>`).join(" ")}<p class="muted">${traits.map(t => `<b>${esc(t[0])}:</b> ${esc(t[1])}`).join(" ")}</p>`;
  renderExclusions();
  $("tabs").innerHTML = TABS.map(([k, label]) => `<button role="tab" class="${state.tab === k ? "on" : ""}" data-act="tab" data-k="${k}">${esc(label)}</button>`).join("");
  renderPanel();
}

function renderPanel() {
  const fn = { life: tabLife, year: tabYear, cmp: tabCompare, when: tabWhen, habits: tabHabits, forgot: tabForgot, missed: tabMissed, artist: tabArtist, globe: tabGlobe, card: tabCard }[state.tab];
  unmountGlobe();
  $("panel").innerHTML = fn();
  if (state.tab === "globe") startGlobe();
  hydrateCovers();
  fitFrame();
}

function tabLife() {
  const { real } = state.data;
  const top = memo("top20", () => A.topSongs(real, 20));
  const ta = memo("ta15", () => A.topArtists(real, 15));
  const ms = memo("ms", () => A.milestones(real));
  const st = memo("streaks", () => A.streaks(real));
  const bd = memo("bd", () => A.busiestDays(real, 8));
  const yt = memo("yt", () => A.byYear(real).map(y => ({ year: y.year, top: A.topArtists(real, 1, y.year)[0] })));
  const brk = memo("brk" + state.breakDays, () => A.breaks(real, state.breakDays));
  const sl = A.byYear(real);
  const eras = memo("eras", () => {
    const top8 = A.topArtists(real, 8).map(a => a.artist);
    const at = new Map(top8.map((a, i) => [a, i])), counts = top8.map(() => new Map());
    for (const r of real) { const k = at.get(r.artist); if (k !== undefined) counts[k].set(r.y, (counts[k].get(r.y) || 0) + 1); }
    return streamChart(sl.map(y => String(y.year)), top8.map((a, i) => ({ name: a, color: PALETTE[i % PALETTE.length], values: sl.map(y => counts[i].get(y.year) || 0) })), { title: "Real plays" });
  });
  return `<h2>The songs of your life</h2>${songTable("top20", "Top songs", top, [{ h: "Real plays", f: s => n0(s.plays) }, { h: "Hours", f: s => s.hours.toFixed(1) }], "scrolly")}
  <div class="two"><div><h2>Top artists</h2>${hbars(ta.map(a => ({ label: a.artist, value: a.plays, tip: `${n0(a.hours)} hours, ${n0(a.songs)} songs` })))}</div>
  <div><h2>Artist eras</h2>${eras}<p class="muted">Number one artist each year: ${yt.map(y => `${y.year} ${esc(y.top.artist)}`).join(", ")}</p></div></div>
  <h2>Milestones</h2>${table(["Play", "Date", "Song", "Artist"], ms.map(m => ["#" + n0(m.n), new Date(m.ts).toLocaleDateString(), songCell(m), esc(m.artist)]))}
  <div class="metrics">${metric("Longest daily streak", `${st.streakDays} days`, `${A.dayText(st.streakStart)} to ${A.dayText(st.streakEnd)}`)}${metric("Longest break", `${st.gapDays} days`, st.gapStart ? `${A.dayText(st.gapStart)} to ${A.dayText(st.gapEnd)}` : "No break")}${metric("Biggest day", `${bd[0].plays} plays`, `${A.dayText(bd[0].dn)}, ${bd[0].hours.toFixed(1)} hours`)}</div>
  <h3>Your biggest listening days</h3>${table(["Day", "Real plays", "Hours"], bd.map(d => [A.dayText(d.dn), n0(d.plays), d.hours.toFixed(1)]))}
  <h3>Breaks</h3><label class="ctl">Show silences of at least <b>${state.breakDays}</b> days <input type="range" min="2" max="30" value="${state.breakDays}" data-bind="breakDays"></label>
  <p class="muted">${brk.length} breaks, with the song you stopped on and the one you came back with.</p>
  ${brk.length ? table(["From", "To", "Days silent", "Last song before", "First song after"], brk.slice(0, 50).map(b => [A.dayText(b.start), A.dayText(b.end), String(b.days), `${esc(b.lastSong)} (${esc(b.lastArtist)})`, `${esc(b.firstSong)} (${esc(b.firstArtist)})`])) : ""}`;
}

const PALETTE = ["#83c9ff", "#0068c9", "#ffabab", "#ff2b2b", "#7defa1", "#29b09d", "#ffd16a", "#ff8700"];   // Streamlit's chart colours

function tabYear() {
  const { real } = state.data;
  const yrs = memo("by", () => A.byYear(real));
  const yi = Math.max(yrs.findIndex(y => y.year === state.year), 0);
  const yc = memo("yc" + state.year, () => A.yearCard(real, state.year));
  const mon = memo("mon" + state.year, () => A.byMonth(real, state.year));
  const rul = memo("rul" + state.year, () => A.monthlyRulers(real, state.year));
  const monthTop = state.month ? memo(`mt${state.year}-${state.month}`, () => ({ s: A.topSongs(real, 10, state.year, state.month), a: A.topArtists(real, 10, state.year, state.month) })) : null;
  const yearTop = memo("yt10" + state.year, () => ({ s: A.topSongs(real, 100, state.year), a: A.topArtists(real, 10, state.year) }));
  return `<h2>Click a year</h2>${bars(yrs.map(y => ({ label: String(y.year), value: y.plays, tip: `${y.year}: ${n0(y.plays)} real plays, ${n0(y.hours)} hours` })), { selected: yi, clickable: true }).replace(/data-i=/g, 'data-act="year" data-i=')}
  <p class="muted">Showing ${state.year}. Click a bar to pick another year. The first year may be partial and the latest year is unfinished.</p>
  <div class="metrics">${metric(`${state.year} real plays`, n0(yc.plays))}${metric("Hours", n0(yc.hours))}${metric("Different songs", n0(yc.songs))}${metric("New to you", n0(yc.newSongs), "Songs first played this year")}${metric("Best month", A.MONTHS[yc.bestMonth - 1])}</div>
  <h2>The song that ruled each month of ${state.year}</h2>
  ${bars(mon.map(m => ({ label: A.MONTHS[m.month - 1], value: m.plays, tip: `${A.MONTHS[m.month - 1]}: ${n0(m.plays)} real plays` })), { height: 220, selected: state.month ? state.month - 1 : null, clickable: true }).replace(/data-i=/g, 'data-act="month" data-i=')}
  <p class="muted">Click a month to see its top songs.</p>
  ${table(["Month", "Song that ruled", "Artist", "Plays", "Share of the month"], rul.map(r => [A.MONTHS[r.month - 1], songCell(r), esc(r.artist), String(r.plays), `${pct(r.share)} of ${n0(r.monthPlays)}`]))}
  ${monthTop ? `<h2>${A.MONTHS[state.month - 1]} ${state.year}: top songs and artists</h2><div class="two"><div>${songTable(`m${state.year}-${state.month}`, `${A.MONTHS[state.month - 1]} ${state.year}`, monthTop.s, [{ h: "Plays", f: s => n0(s.plays) }])}</div><div>${table(["Artist", "Plays"], monthTop.a.map(a => [esc(a.artist), n0(a.plays)]))}</div></div>` : ""}
  <h2>${state.year}: top songs and artists</h2><div class="two"><div>${songTable(`y${state.year}`, `Top songs of ${state.year}`, yearTop.s.slice(0, 10), [{ h: "Plays", f: s => n0(s.plays) }, { h: "Hours", f: s => s.hours.toFixed(1) }])}
  <div class="actions"><button data-act="copy100" data-id="y${state.year}">Copy all 100 Spotify links</button></div></div><div>${table(["Artist", "Plays", "Songs"], yearTop.a.map(a => [esc(a.artist), n0(a.plays), n0(a.songs)]))}</div></div>`;
}

function tabCompare() {
  const { real } = state.data;
  const years = A.byYear(real).map(y => y.year);
  const sel = (bind, val) => `<select data-bind="${bind}">${years.map(y => `<option ${y === val ? "selected" : ""}>${y}</option>`).join("")}</select>`;
  const pt = A.yearProfile(real, +state.cmpThen), pn = A.yearProfile(real, +state.cmpNow);
  const cols = [["Real plays", "plays", n0], ["Hours", "hours", n0], ["Different songs", "songs", n0], ["Different artists", "artists", n0], ["Days you listened", "activeDays", n0], ["After midnight", "nightShare", pct]];
  const m = cols.map(([l, k, f]) => { const d = pn[k] - pt[k]; return metric(`${l} (${pn.year})`, `${f(pn[k])} <small class="${d >= 0 ? "up" : "down"}">${k === "nightShare" ? (d >= 0 ? "+" : "") + (d * 100).toFixed(0) + " pts" : (d >= 0 ? "+" : "") + n0(d)} vs ${pt.year}</small>`); }).join("");
  const side = y => `<div><h3>${y}: top songs</h3>${songTable(`cmp${y}`, `Top songs ${y}`, A.topSongs(real, 8, +y), [{ h: "Plays", f: s => n0(s.plays) }])}<h3>${y}: new artists <small>(first heard that year)</small></h3>${table(["Artist", "Plays"], A.newArtists(real, +y, 8).map(a => [esc(a.artist), n0(a.plays)]))}</div>`;
  const dr = (state.drift === "songs" ? memo("dr50", () => A.tasteDrift(real, 50, "key")) : memo("dr20", () => A.tasteDrift(real, 20, "artist"))).filter(d => d.year > years[1]);
  const fast = [...dr].sort((a, b) => a.shareCarried - b.shareCarried)[0], slow = [...dr].sort((a, b) => b.shareCarried - a.shareCarried)[0];
  return `<h2>Then vs now</h2><div class="two"><label class="ctl">Then ${sel("cmpThen", +state.cmpThen)}</label><label class="ctl">Now ${sel("cmpNow", +state.cmpNow)}</label></div>
  <div class="metrics">${m}</div><p class="muted">The latest year is unfinished, so its counts can look smaller than they will end up.</p>
  ${stacked(A.BANDS.map(b => b[0].split(" (")[0]), [{ name: String(pt.year), color: "var(--grey)", values: pt.bands.map(b => b.share) }, { name: String(pn.year), color: "var(--accent)", values: pn.bands.map(b => b.share) }], { height: 240, fmt: v => pct(v) })}
  <div class="two">${side(pt.year)}${side(pn.year)}</div>
  <h2>Taste drift</h2><div class="seg"><button class="${state.drift === "songs" ? "on" : ""}" data-act="drift" data-k="songs">Top 50 songs</button><button class="${state.drift === "artists" ? "on" : ""}" data-act="drift" data-k="artists">Top 20 artists</button></div>
  ${stacked(dr.map(d => String(d.year)), [{ name: "Also in last year's list", color: "var(--accent)", values: dr.map(d => d.carried) }, { name: "Heard before, not in last year's list", color: "var(--grey)", values: dr.map(d => d.returning) }, { name: "First heard that year", color: "#e8a33d", values: dr.map(d => d.new) }], { height: 280 })}
  ${dr.length ? `<p class="muted">Taste changed fastest in ${fast.year} (only ${pct(fast.shareCarried)} of the list carried over) and was steadiest in ${slow.year} (${pct(slow.shareCarried)}). ${years[1]} is left out because ${years[0]} may be a partial year.</p>` : ""}`;
}

function tabWhen() {
  const { real } = state.data;
  const bands = memo("bands", () => A.timeBands(real));
  const hw = memo("hw", () => A.hourWeekday(real));
  const years = A.byYear(real).map(y => y.year);
  const counts = memo("cal" + state.calYear, () => A.dailyCounts(real, +state.calYear));
  const night = bands[0];
  return `<h2>When you listen</h2><p><b>${pct(night.share)}</b> of your real plays happen between midnight and 6am. That is ${n0(night.plays)} plays.</p>
  ${hbars(bands.map(b => ({ label: b.band, value: b.share, tip: n0(b.plays) + " plays" })), { fmt: pct })}
  <h3>Hour by weekday</h3>${heatmap(A.WEEKDAYS, Array.from({ length: 24 }, (_, h) => String(h)), hw, { cell: 26 })}
  <h3>Calendar <select data-bind="calYear">${years.map(y => `<option ${y === +state.calYear ? "selected" : ""}>${y}</option>`).join("")}</select></h3>${calendar(+state.calYear, counts)}`;
}

function tabHabits() {
  const { real, all } = state.data;
  const sr = memo("sr", () => A.skipRates(all)), dv = memo("dv", () => A.discovery(real));
  const stats = [...A.songStats(real).values()];
  const th = [5, 20, 50, 100, 250].map(t => metric(`${t}+ plays`, n0(stats.filter(s => s.plays >= t).length), `Songs played ${t} or more times`)).join("");
  const ob = memo("ob", () => A.obsessions(real, 10)), cs = memo("cs", () => A.comfortSongs(real, 6, 10));
  const ml = memo("ml" + state.lane, () => A.memoryLane(real, 10, 50, state.lane));
  return `<h2>How much of what you start do you really listen to?</h2>
  ${stacked(sr.map(y => String(y.year)), [{ name: "Under 30 seconds", color: "var(--grey)", values: sr.map(y => y.plays - y.real) }, { name: "Played 30 seconds or more", color: "var(--accent)", values: sr.map(y => y.real) }], { pct: true, height: 260 })}
  <h2>New songs each year</h2>${bars(dv.map(d => ({ label: String(d.year), value: d.newSongs, tip: `${d.year}: ${n0(d.newSongs)} songs first heard, ${pct(d.shareNew)} of that year's plays` })), { height: 240 })}
  <h2>How much you repeat</h2><div class="metrics">${th}</div>
  <div class="two"><div><h3>One-day obsessions <small>(most plays of one song in a day)</small></h3>${songTable("ob", "One-day obsessions", ob, [{ h: "Plays that day", f: s => n0(s.playsThatDay) }, { h: "Day", f: s => A.dayText(s.dn) }])}</div>
  <div><h3>Comfort songs <small>(played in six or more different years)</small></h3>${songTable("cs", "Comfort songs", cs, [{ h: "Years", f: s => String(s.years) }, { h: "Plays", f: s => n0(s.plays) }])}</div></div>
  <h2>Down the memory lane</h2><p class="muted">On a day you play a song at all, you play it ${ml.average.toFixed(2)} times on average. These songs beat that: their plays per day you listened are above your usual. Songs with under 10 real plays are left out.</p>
  <div class="seg"><span>Played on at least</span>${[1, 2, 3].map(n => `<button class="${state.lane === n ? "on" : ""}" data-act="lane" data-k="${n}">${n} day${n > 1 ? "s" : ""}</button>`).join("")}</div>
  <p><b>${ml.list.length} songs shown</b> of ${n0(ml.total)}, ranked by plays per listening day.</p>
  ${songTable("lane", "Down the memory lane", ml.list, [{ h: "Plays/day", f: s => s.perDay.toFixed(2) }, { h: "Plays", f: s => n0(s.plays) }, { h: "Days played", f: s => n0(s.days) }, { h: "Replay days", f: s => n0(s.replayDays) }], "scrolly")}`;
}

function tabForgot() {
  const { real } = state.data;
  const f = memo(`f${state.forgotMin}-${state.forgotMonths}`, () => A.forgottenFavourites(real, state.forgotMin, Math.round(state.forgotMonths * 30.4), 40));
  return `<h2>Songs you loved and left behind</h2><div class="two">
  <label class="ctl">At least this many real plays: <b>${state.forgotMin}</b><input type="range" min="10" max="300" step="5" value="${state.forgotMin}" data-bind="forgotMin"></label>
  <label class="ctl">Not played for at least (months): <b>${state.forgotMonths}</b><input type="range" min="3" max="48" value="${state.forgotMonths}" data-bind="forgotMonths"></label></div>
  <p><b>${n0(f.total)} songs</b> match. The ones you played most, then dropped:</p>
  ${f.list.length ? songTable("forgot", "Forgotten favourites", f.list, [{ h: "Plays", f: s => n0(s.plays) }, { h: "Peak year", f: s => String(s.peakYear) }, { h: "Last played", f: s => A.dayText(s.lastDay) }, { h: "Quiet for", f: s => Math.round(s.quietDays / 30.4) + " months" }], "scrolly") : "<p>Nothing matches. Lower the numbers above.</p>"}`;
}

function tabMissed() {
  const { all } = state.data;
  const hl = memo("hl" + state.missedCap, () => A.hiddenLikes(all, state.missedCap));
  const list = hl.slice(0, state.missedShown);
  return `<h2>Songs you probably missed from artists you love</h2>
  <p class="muted">An assumption, not a fact. You rarely let a song you dislike play, so a song you finished, came back to, or share an artist with songs you play a lot probably landed, even if you never played it much.</p>
  <div class="two"><label class="ctl">Leave out songs played more than: <b>${state.missedCap}</b><input type="range" min="2" max="40" value="${state.missedCap}" data-bind="missedCap"></label>
  <label class="ctl">Songs shown <select data-bind="missedShown">${[25, 50, 100, 200].map(n => `<option ${n === +state.missedShown ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
  <p><b>The ${list.length} most likely out of ${n0(hl.length)} candidates.</b></p>
  ${songTable("missed", "Missed from artists you love", list, [{ h: "Score", f: s => s.score.toFixed(0) }, { h: "Plays", f: s => n0(s.plays) }, { h: "Days", f: s => n0(s.days) }, { h: "Skipped", f: s => n0(s.skips) }, { h: "Artist's other plays", f: s => n0(s.artistPlays) }])}
  <details><summary>How the score works</summary><p>Each part is between 0 and 1. <b>Score = 100 x (0.30 came back + 0.25 finished + 0.30 artist + 0.15 no skips).</b></p>
  <ul><li><b>Came back:</b> real plays on different days (1 day = 0, 4 or more = 1)</li><li><b>Finished:</b> share of plays that ran to the end (a song's length is its longest play)</li><li><b>Artist:</b> how much you play that artist's other songs, ranked against all songs</li><li><b>No skips:</b> 1 minus the share of plays dropped before 30 seconds</li></ul></details>`;
}

function tabArtist() {
  const { real } = state.data;
  const opts = memo("aopts", () => A.artistOptions(real, 20));
  if (!state.artist || !opts.some(o => o.artist === state.artist)) state.artist = opts[0]?.artist;
  if (!state.artist) return "<p>No artist has 20 real plays yet.</p>";
  const ap = memo("ap" + state.artist, () => A.artistProfile(real, state.artist));
  const first = new Date(ap.first.ts).toLocaleDateString(), last = new Date(ap.last.ts).toLocaleDateString();
  const mon = ap.monthly.map(m => ({ label: `${A.MONTHS[m.month - 1]} ${String(m.year).slice(2)}`, value: m.plays }));
  return `<h2>Artist deep dive</h2><label class="ctl">Pick an artist (type to search; 20+ real plays)
  <input list="artistList" value="${esc(state.artist)}" data-bind="artist" autocomplete="off"><datalist id="artistList">${opts.map(o => `<option value="${esc(o.artist)}">`).join("")}</datalist></label>
  <div class="metrics">${metric("Real plays", n0(ap.plays))}${metric("Hours", n0(ap.hours))}${metric("Different songs", n0(ap.songs))}${metric("Days you played them", n0(ap.activeDays))}${metric("Peak month", `${A.MONTHS[ap.peakMonth - 1]} ${ap.peakYear}`, `${ap.peakPlays} plays that month`)}</div>
  <p><b>First play:</b> ${first}, <i>${esc(ap.first.name)}</i>. <b>Latest play:</b> ${last}, <i>${esc(ap.last.name)}</i>.</p>
  ${mon.length > 60 ? bars(mon.slice(-60), { height: 220 }) : bars(mon, { height: 220 })}
  <div class="two"><div><h3>Your favourite songs by them</h3>${songTable("artist", "My " + state.artist, ap.topSongs, [{ h: "Plays", f: s => n0(s.plays) }, { h: "Hours", f: s => s.hours.toFixed(1) }])}</div>
  <div><h3>Quiet spells <small>(90+ days without them)</small></h3>${ap.quiet.length ? table(["From", "To", "Days"], ap.quiet.map(q => [A.dayText(q.start), A.dayText(q.end), String(q.days)])) : "<p class=muted>None. You never went three months without them.</p>"}</div></div>`;
}

function tabGlobe() {
  return `<h2>Song globe</h2><p class="muted">Every song in your history wrapped on a globe. Songs you played in the same sittings sit close together, and you spin it in any of eight directions. The map is worked out here in your browser from your history.</p>
  <p class="muted gl-status" id="globeStatus">Mapping your songs... 0%</p><div id="globeRoot"></div>`;
}
const GLOBE_COVERS = 2000, GLOBE_MIN = 150;   // covers loaded before the globe starts by itself; the fewest it will start with
async function startGlobe() {
  const data = state.data;
  const space = await memo("globe", () => buildSongSpace(data.real, { onProgress: p => { const el = $("globeStatus"); if (el) el.textContent = `Mapping your songs... ${Math.round(p * 100)}%`; } }));
  const root = $("globeRoot");
  if (state.tab !== "globe" || state.data !== data || !root) return;   // the visitor moved on while it was working
  const status = $("globeStatus"); if (status) status.remove();
  if (!space.songs.length) { root.innerHTML = `<p class="muted">The globe needs a longer history: at least 60 different songs played in listening sessions. Load your full Spotify export to see it.</p>`; fitFrame(); return; }
  const open = useCovers => { mountGlobe(root, space, { useCovers, coverUrl: id => coverCache.get(id), coverTarget: Math.min(GLOBE_COVERS, space.songs.length) }); fitFrame(); };
  if (!state.covers) { open(false); return; }
  // The globe only uses songs whose cover has loaded, so it never shows a blank tile. Load the most played songs first.
  const ids = space.songs.slice(0, GLOBE_COVERS).map(s => s.id), total = ids.length;
  root.innerHTML = `<div class="gl-loader"><p><b>Loading album covers</b></p><div class="gl-prog"><i></i></div><p class="gl-load-text muted"></p>
    <div class="gl-load-actions"><button class="gl-btn" type="button" data-go disabled>Start now</button><button class="gl-btn" type="button" data-plain>Use name tiles instead</button></div>
    <p class="muted">Covers come from Spotify one after another, so this takes a few minutes for a long history. The globe starts by itself when ${fmt0(total)} songs are ready, or you can start once ${GLOBE_MIN} are in. More songs join the globe while you spin it.</p></div>`;
  fitFrame();
  prefetchCovers(ids);
  const go = root.querySelector("[data-go]"), bar = root.querySelector(".gl-prog i"), text = root.querySelector(".gl-load-text");
  let timer = 0;
  const finish = useCovers => { clearInterval(timer); open(useCovers); };
  go.onclick = () => finish(true); root.querySelector("[data-plain]").onclick = () => finish(false);
  timer = setInterval(() => {
    if (state.tab !== "globe" || state.data !== data || !root.isConnected) { clearInterval(timer); return; }
    let ready = 0, tried = 0; for (const id of ids) { if (coverCache.has(id)) { tried++; if (coverCache.get(id)) ready++; } }
    bar.style.width = (100 * tried / total).toFixed(1) + "%"; text.textContent = `${fmt0(ready)} covers loaded of ${fmt0(total)} songs`;
    go.disabled = ready < GLOBE_MIN;
    if (tried >= total) finish(true);
  }, 400);
}
const fmt0 = n => n.toLocaleString();

function tabCard() {
  const { real } = state.data;
  const years = A.byYear(real).map(y => y.year);
  const sel = `<select data-bind="card"><option value="all" ${state.card === "all" ? "selected" : ""}>Lifetime</option>${years.map(y => `<option ${String(y) === String(state.card) ? "selected" : ""}>${y}</option>`).join("")}</select>`;
  let body;
  if (state.card === "all") {
    const ov = memo("ov", () => A.overview(real, state.data.all));
    const ts = A.topSongs(real, 5), ta = A.topArtists(real, 5), best = A.busiestDays(real, 1)[0];
    body = cardHtml({ label: "Lifetime", sub: `${A.dayText(ov.firstDay)} to ${A.dayText(ov.lastDay)}`, minutes: ov.hours * 60, plays: ov.realPlays,
      songs: ov.songs, artists: ov.artists, ts, ta, album: A.topAlbums(real, 1)[0], best });
  } else {
    const y = +state.card, c = A.yearCard(real, y);
    body = cardHtml({ label: String(y), sub: `${n0(c.newSongs)} songs new to you`, minutes: c.hours * 60, plays: c.plays,
      songs: c.songs, artists: c.artists, ts: c.topSongs, ta: c.topArtists, album: A.topAlbums(real, 1, y)[0], best: c.busiest });
  }
  return `<h2>Which wrapped? ${sel}</h2>${body}<p class="actions"><button data-act="card-png">Download card as image</button></p><p class="muted">Saved as a PNG on your own device. Nothing is uploaded anywhere.</p>`;
}
let lastCard = null;   // what the card on screen shows, so the download button can draw the same thing
function cardHtml(c) {
  lastCard = c;
  const { label, sub, minutes, plays, songs, artists, ts, ta, album, best } = c;
  const top = ts[0];
  // The cover only appears when the visitor has switched album covers on; otherwise a plain tile keeps the layout.
  const cover = state.covers
    ? `<img class="cover" data-id="${esc(top.id)}" alt="" ${coverCache.get(top.id) ? `src="${esc(coverCache.get(top.id))}"` : ""}>`
    : `<div class="cover-ph" aria-hidden="true">&#9835;</div>`;
  const albumHtml = album ? `<div class="k">Top album</div><div class="v">${esc(album.album)}</div>` : "";
  const bestHtml = best ? `<div class="k">Biggest day</div><div class="v">${n0(best.plays)} plays, ${A.dayText(best.dn)}</div>` : "";
  return `<div class="wcard"><h3>${esc(label)}</h3><p class="sub">${esc(sub)}</p>
  <div class="big"><div><b>${n0(minutes)}</b><span>minutes listened</span></div><div><b>${n0(plays)}</b><span>real plays</span></div><div><b>${n0(songs)}</b><span>different songs</span></div><div><b>${n0(artists)}</b><span>different artists</span></div></div>
  <div class="cgrid">
    <div>${cover}<div class="top1">#1 ${esc(top.name)}</div><div>${esc(top.artist)}, ${n0(top.plays)} plays</div></div>
    <div><h4>Top songs</h4><ol>${ts.map(x => `<li>${esc(x.name)} <small>${esc(x.artist)}</small></li>`).join("")}</ol></div>
    <div><h4>Top artists</h4><ol>${ta.map(x => `<li>${esc(x.artist)} <small>${n0(x.plays)} plays</small></li>`).join("")}</ol>${albumHtml}${bestHtml}</div>
  </div></div>`;
}

/** Draws the wrapped card on a canvas (1080 x 1350, the shape Instagram stories and posts like) and saves it as a PNG. No cover art, so nothing is cross-origin. */
function downloadCard() {
  const c = lastCard; if (!c) return;
  const W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d"), font = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#0b3d2e"); bg.addColorStop(.55, "#1db954"); bg.addColorStop(1, "#7be39a");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const clip = (t, w) => { t = String(t); while (g.measureText(t).width > w && t.length > 1) t = t.slice(0, -2) + "..."; return t; };
  const text = (t, x, y, size, weight, alpha, w) => { g.font = `${weight} ${size}px ${font}`; g.fillStyle = `rgba(255,255,255,${alpha})`; g.fillText(w ? clip(t, w) : t, x, y); };
  g.textBaseline = "alphabetic";
  text("LIFETIME WRAPPED", 80, 120, 28, 600, .8);
  text(c.label, 80, 230, 120, 800, 1);
  text(c.sub, 80, 290, 34, 400, .85, W - 160);
  [[c.minutes, "minutes listened"], [c.plays, "real plays"], [c.songs, "different songs"], [c.artists, "different artists"]].forEach(([v, l], k) => {
    const x = 80 + (k % 2) * 480, y = 420 + Math.floor(k / 2) * 150;
    text(n0(v), x, y, 70, 800, 1); text(l, x, y + 42, 28, 400, .85);
  });
  const top = c.ts[0];
  text("#1 SONG", 80, 760, 26, 600, .75);
  text(top.name, 80, 815, 48, 700, 1, W - 160); text(`${top.artist}, ${n0(top.plays)} plays`, 80, 862, 30, 400, .85, W - 160);
  const col = (title, rows, x) => { text(title, x, 960, 26, 600, .75); rows.forEach(([a, b], k) => { text(`${k + 1}. ${a}`, x, 1004 + k * 64, 30, 600, 1, 440); text(b, x + 38, 1036 + k * 64, 24, 400, .8, 400); }); };
  col("TOP SONGS", c.ts.map(x => [x.name, x.artist]), 80);
  col("TOP ARTISTS", c.ta.map(x => [x.artist, `${n0(x.plays)} plays`]), 570);
  text("Made privately in my browser with Lifetime Wrapped", 80, H - 22, 22, 400, .65);
  cv.toBlob(b => {
    if (!b) return;
    const url = URL.createObjectURL(b), a = document.createElement("a");
    a.href = url; a.download = "lifetime-wrapped-" + String(c.label).toLowerCase() + ".png"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

// ------------------------------------------------------------------ album covers
// For each song on screen, ask Spotify's public oEmbed service for its cover, then show the image. Only the song's Spotify ID is sent.
// Skipped for the made-up sample history.
const coverCache = new Map();       // track id -> image url, or "" when Spotify has none
const coverQueue = [];
let coverWorkers = 0;
const coverImg = id => `<img data-id="${esc(id)}" alt="" width="40" height="40" ${coverCache.get(id) ? `src="${esc(coverCache.get(id))}"` : ""}>`;
const safeImage = u => { try { const h = new URL(u).hostname; return h.endsWith(".spotifycdn.com") || h.endsWith(".scdn.co"); } catch { return false; } };

// Covers come from Spotify's public lookup, which answers too many requests too fast with an error the browser reports as a network failure.
// So lookups go out at a fixed pace, every worker backs off together when one fails, a failed song is tried again, the browser image cache is
// warmed (a cover shows the moment its tile does), and background lookups for places the visitor has already left are dropped.
const COVER_WORKERS = 3, COVER_GAP_MS = 200, COVER_TRIES = 6;
const coverWait = new Map(), coverImages = new Map(), coverTries = new Map(), urgentIds = new Set();   // coverImages keeps the preloaded images alive
let coverNext = 0, coverBackoff = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function waiterFor(id) { let w = coverWait.get(id); if (!w) { w = {}; w.promise = new Promise(r => { w.resolve = r; }); coverWait.set(id, w); } return w; }
function settle(id) { const w = coverWait.get(id); if (w) { w.resolve(); coverWait.delete(id); } urgentIds.delete(id); coverTries.delete(id); }
function enqueueCover(id, urgent) {
  if (coverCache.has(id)) return;
  waiterFor(id);
  if (urgent) urgentIds.add(id);
  const at = coverQueue.indexOf(id);
  if (at >= 0) { if (urgent && at > 0) { coverQueue.splice(at, 1); coverQueue.unshift(id); } return; }
  if (urgent) coverQueue.unshift(id); else coverQueue.push(id);
}
function startCoverWorkers() { while (coverWorkers < COVER_WORKERS && coverQueue.length) { coverWorkers++; coverWorker(); } }

/** Ask for the covers of everything in the panel now (urgent). */
function hydrateCovers() {
  if (!state.covers) return;
  for (const img of $("panel").querySelectorAll("img[data-id]")) {
    const id = img.dataset.id;
    if (coverCache.has(id)) { if (coverCache.get(id) && !img.src) img.src = coverCache.get(id); continue; }
    enqueueCover(id, true);
  }
  startCoverWorkers();
}
/**
 * Look these songs' covers up in the background; the promise resolves when each has loaded or been given up on.
 * With replace: true this list is the whole wish list: background lookups for anything not on it are dropped.
 */
function prefetchCovers(ids, { replace = false } = {}) {
  if (!state.covers) return Promise.resolve();
  if (replace) {
    const keep = new Set(ids);
    for (let i = coverQueue.length - 1; i >= 0; i--) if (!urgentIds.has(coverQueue[i]) && !keep.has(coverQueue[i])) settle(coverQueue.splice(i, 1)[0]);
  }
  const waits = [];
  for (const id of ids) { if (coverCache.has(id)) continue; enqueueCover(id, false); waits.push(waiterFor(id).promise); }
  startCoverWorkers();
  return Promise.all(waits);
}
/** The cover image url, "" when Spotify has none, or null when the lookup failed (rate limited or offline). */
async function lookupCover(id) {
  try {
    const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent("https://open.spotify.com/track/" + id)}`);
    if (r.ok) { const j = await r.json(); return safeImage(j.thumbnail_url) ? j.thumbnail_url : ""; }
    return r.status >= 500 || r.status === 429 ? null : "";
  } catch { return null; }
}
const preloadImage = url => new Promise(res => { const im = new Image(); im.onload = im.onerror = () => res(); im.src = url; coverImages.set(url, im); if (coverImages.size > 300) coverImages.delete(coverImages.keys().next().value); });

async function coverWorker() {
  while (coverQueue.length && state.covers) {
    const slot = Math.max(Date.now(), coverNext); coverNext = slot + COVER_GAP_MS;   // reserve the next free moment, so all workers together keep to one pace
    if (slot > Date.now()) await sleep(slot - Date.now());
    const id = coverQueue.shift();
    if (id === undefined) break;
    const url = await lookupCover(id);
    if (url === null) {   // failed: everyone waits longer, and this song goes back in the queue (a few times)
      coverBackoff = Math.min(30000, coverBackoff ? coverBackoff * 2 : 2000); coverNext = Math.max(coverNext, Date.now() + coverBackoff);
      const n = (coverTries.get(id) || 0) + 1; coverTries.set(id, n);
      if (n < COVER_TRIES) { coverQueue.unshift(id); continue; }
      settle(id); continue;
    }
    coverBackoff = 0;
    if (url) await preloadImage(url);
    coverCache.set(id, url);
    if (url) for (const img of document.querySelectorAll(`#panel img[data-id="${id}"]`)) img.src = url;
    settle(id);
  }
  coverWorkers--;
}

// ------------------------------------------------------------------ leave songs out
function renderExclusions() {
  const box = $("exclusions");
  const songs = memo("allsongs", () => A.songs(state.data.real).slice(0, 4000));
  const chips = [...state.excluded.entries()].map(([k, label]) => `<span class="chip">${esc(label)} <button data-act="unexclude" data-k="${esc(k)}" aria-label="Put back">x</button></span>`).join(" ");
  box.innerHTML = `<summary>Leave songs out (${state.excluded.size})</summary><p class="muted">Remove songs that skew your stats, like an alarm. Type a song and pick it.</p>
  <input list="songList" id="excludeInput" placeholder="Song name" autocomplete="off"><datalist id="songList">${songs.map(s => `<option value="${esc(s.name + " - " + s.artist)}">`).join("")}</datalist>
  <div class="chips">${chips}</div>`;
}

// ------------------------------------------------------------------ events
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = v => `"${String(v).replace(/"/g, '""')}"`;

document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const act = t.dataset.act;
  const rect = t.closest("g[data-i]") || t;
  const i = rect.dataset.i != null ? +rect.dataset.i : null;
  if (act === "tab") { state.tab = t.dataset.k; render(); }
  else if (act === "year") { const yrs = A.byYear(state.data.real); state.year = yrs[i].year; state.month = null; renderPanel(); }
  else if (act === "month") { state.month = state.month === i + 1 ? null : i + 1; renderPanel(); }
  else if (act === "drift") { state.drift = t.dataset.k; renderPanel(); }
  else if (act === "lane") { state.lane = +t.dataset.k; renderPanel(); }
  else if (act === "card-png") downloadCard();
  else if (act === "unexclude") { state.excluded.delete(t.dataset.k); build(); }
  else if (act === "copy" || act === "copy100") {
    const l = act === "copy100" ? A.topSongs(state.data.real, 100, state.year) : lists.get(t.dataset.id).list;
    await navigator.clipboard.writeText(l.map(s => link(s.id)).join("\n"));
    const old = t.textContent; t.textContent = `Copied ${l.length} links`; setTimeout(() => { t.textContent = old; }, 1500);
  } else if (act === "csv") {
    const { title, list } = lists.get(t.dataset.id);
    download(title.replace(/[^\w]+/g, "_") + ".csv", "Song,Artist,Spotify link\n" + list.map(s => [s.name, s.artist, link(s.id)].map(csvCell).join(",")).join("\n"), "text/csv");
  }
});

document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "fileInput") { handleFiles(t.files); return; }
  if (t.id === "excludeInput") {
    const v = t.value;
    const hit = A.songs(state.data.real).slice(0, 4000).find(s => s.name + " - " + s.artist === v);
    if (hit) { state.excluded.set(hit.key, hit.name + " - " + hit.artist); build(); }
    return;
  }
  const b = t.dataset?.bind;
  if (!b) return;
  state[b] = t.type === "range" ? +t.value : t.value;
  renderPanel();
});

for (const ev of ["dragenter", "dragover"]) $("drop").addEventListener(ev, e => { e.preventDefault(); $("drop").classList.add("over"); });
for (const ev of ["dragleave", "drop"]) $("drop").addEventListener(ev, e => { e.preventDefault(); $("drop").classList.remove("over"); });
$("drop").addEventListener("drop", e => handleFiles(e.dataTransfer.files));

// "Try it with sample data": a made-up history, generated here in the browser and fed through the normal loader.
$("sampleBtn").addEventListener("click", () => {
  const file = new File([JSON.stringify(sampleHistory())], "Streaming_History_Audio_sample.json", { type: "application/json" });
  handleFiles([file], true);
});

// When the page is shown inside a same-origin frame (the Streamlit version), size the frame to its content so the host page does
// all the scrolling, and make in-page links (#how, #privacy, #features) scroll that host page. Outside a frame nothing changes.
function hostFrame() {
  try { return window.frameElement && window.frameElement.ownerDocument ? window.frameElement : null; } catch { return null; }
}
function fitFrame() {
  const fe = hostFrame();
  if (!fe) return;
  const h = Math.ceil(document.body.getBoundingClientRect().height) + "px";
  fe.style.height = h;
  const box = fe.closest('[data-testid="stElementContainer"]');   // Streamlit fixes the height of the box around the frame too
  if (box) box.style.height = h;
}
if (hostFrame()) {
  new ResizeObserver(fitFrame).observe(document.body);
  document.addEventListener("load", fitFrame, true);   // cover images arriving change the height
  fitFrame();
}

// Glides `target` to the top of the view. The animation is driven from here (one scroll step per frame) instead of asking the
// browser for "smooth" scrolling, because browsers skip that when the system has animations turned off. In the Streamlit frame
// the host page does the scrolling, so that page's scroller is driven; outside a frame it is this page.
let glide = 0;
function scrollToElement(target) {
  const fe = hostFrame();
  const host = fe ? fe.ownerDocument : document;
  const scroller = fe ? (fe.closest('[data-testid="stMain"]') || host.scrollingElement) : host.scrollingElement;
  const base = scroller === host.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
  const inView = fe ? fe.getBoundingClientRect().top + target.getBoundingClientRect().top : target.getBoundingClientRect().top;
  const from = scroller.scrollTop;
  const to = Math.max(from + inView - base - 16, 0);
  const id = ++glide, started = performance.now();
  const ms = Math.min(900, 400 + Math.abs(to - from) * 0.25);
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const stop = () => { glide++; };                                // a wheel, touch or key press hands control back to the visitor
  for (const ev of ["wheel", "touchstart", "keydown"]) { document.addEventListener(ev, stop, { once: true, passive: true }); host.addEventListener(ev, stop, { once: true, passive: true }); }
  const step = () => {
    if (id !== glide) return;
    const t = Math.min((performance.now() - started) / ms, 1);
    scroller.scrollTo({ top: from + (to - from) * ease(t), behavior: "instant" });   // "instant" beats any CSS scroll-behavior, so frames are not re-smoothed
    if (t < 1) next();
  };
  // Normally one step per animation frame. A page that is not being painted (a background tab) gets no frames, so a timer
  // steps instead and the scroll still arrives.
  const next = () => { let ran = false; const run = () => { if (!ran) { ran = true; step(); } }; requestAnimationFrame(run); setTimeout(run, 50); };
  next();
}

document.addEventListener("click", e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.getAttribute("href").length < 2) return;
  const target = document.getElementById(a.getAttribute("href").slice(1));
  if (!target) return;
  e.preventDefault();   // a bare #link inside a frame would send the frame to the host page's address
  scrollToElement(target);
});

// Artist eras chart: click a legend name to isolate that artist; hover a year for the order that year.
let stream = { focus: null };
document.addEventListener("click", e => {
  const b = e.target.closest("[data-sfocus]");
  if (!b) return;
  const f = +b.dataset.sfocus, root = b.closest("[data-stream]");
  stream.focus = stream.focus === f ? null : f;
  root.querySelectorAll("[data-slayer]").forEach(p => p.setAttribute("fill-opacity", stream.focus === null || +p.dataset.slayer === stream.focus ? .5 : .08));
  root.querySelectorAll("[data-sedge]").forEach(p => p.setAttribute("stroke-opacity", stream.focus === null || +p.dataset.sedge === stream.focus ? 1 : .15));
  root.querySelectorAll(".sleg-b").forEach(c => { const on = stream.focus === null || +c.dataset.sfocus === stream.focus; c.classList.toggle("dim", !on); c.setAttribute("aria-pressed", String(+c.dataset.sfocus === stream.focus)); });
});
function streamTip() { let t = $("stip"); if (!t) { t = document.createElement("div"); t.id = "stip"; t.className = "stip"; document.body.appendChild(t); } return t; }
document.addEventListener("mousemove", e => {
  const yc = e.target.dataset && e.target.dataset.syc;
  const t = document.getElementById("stip");
  document.querySelectorAll(".stream .sx").forEach(l => { l.style.display = "none"; });
  if (yc === undefined) { if (t) t.style.opacity = 0; return; }
  const svg = e.target.closest("svg"), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  const col = e.target, cx = (+col.getAttribute("x") + +col.getAttribute("width") / 2);
  const line = svg.querySelector(".sx"); line.setAttribute("x1", cx); line.setAttribute("x2", cx); line.style.display = "";
  const tip = streamTip(); tip.innerHTML = streamTipHtml(+yc); tip.style.opacity = 1;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px";
  tip.style.top = Math.max(8, Math.min(e.clientY - tip.offsetHeight - 10, innerHeight - tip.offsetHeight - 8)) + "px";
});

window.__wrapped = { state, A, handleFiles, fitFrame };   // for testing in the browser console
