import * as A from "./analysis.js";
import { loadFiles } from "./load.js";
import { esc, bars, hbars, stacked, heatmap, calendar } from "./charts.js";

const $ = id => document.getElementById(id);
const n0 = v => Math.round(v).toLocaleString();
const pct = v => Math.round(v * 100) + "%";
const link = id => `https://open.spotify.com/track/${id}`;

const state = {
  raw: null, excluded: new Map(), data: null, tab: "life", year: null, month: null,
  cmpThen: null, cmpNow: null, drift: "songs", lane: 3, breakDays: 3, forgotMin: 40, forgotMonths: 12,
  missedCap: 15, missedShown: 50, artist: null, calYear: null, card: "all", sel: "", minDays: 3,
};
let memoCache = new Map();
const memo = (name, fn, ...args) => {
  const k = name + JSON.stringify(args);
  if (!memoCache.has(k)) memoCache.set(k, fn(...args));
  return memoCache.get(k);
};
const lists = new Map();   // downloadable lists, by id

// ------------------------------------------------------------------ loading
async function handleFiles(files) {
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
function table(head, rows, cls = "") {
  return `<div class="scroll"><table class="${cls}"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const songCell = s => `<a href="${link(s.id)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>`;

/** A ranked song table with buttons to copy the Spotify links or download a CSV. */
function songTable(id, title, list, extra = []) {
  lists.set(id, { title, list });
  const rows = list.map((s, i) => [String(i + 1), songCell(s), esc(s.artist), ...extra.map(e => e.f(s))]);
  const buttons = list.length ? `<div class="actions"><button data-act="copy" data-id="${id}">Copy Spotify links</button><button data-act="csv" data-id="${id}">Download CSV</button></div>` : "";
  return table(["#", "Song", "Artist", ...extra.map(e => e.h)], rows) + buttons;
}
const metric = (label, value, help = "") => `<div class="metric" ${help ? `title="${esc(help)}"` : ""}><span>${esc(label)}</span><b>${value}</b></div>`;

// ------------------------------------------------------------------ tabs
const TABS = [["life", "Lifetime"], ["year", "Year by year"], ["cmp", "Compare years"], ["when", "When you listen"], ["habits", "Habits"],
              ["forgot", "Forgotten favourites"], ["missed", "Missed from artists you love"], ["artist", "Artist deep dive"], ["card", "Wrapped card"]];

function render() {
  const { real, all } = state.data;
  const ov = memo("ov", () => A.overview(real, all));
  const traits = memo("traits", () => A.personality(real));
  $("metrics").innerHTML = metric("Hours listened", n0(ov.hours), `${(ov.hours / 24).toFixed(0)} full days of music`) + metric("Real plays", n0(ov.realPlays), "A real play is 30 seconds or more")
    + metric("Different songs", n0(ov.songs)) + metric("Different artists", n0(ov.artists)) + metric("Days you listened", n0(ov.activeDays), `About ${ov.perActiveDay.toFixed(0)} real plays a day`);
  $("range").textContent = `${A.dayText(ov.firstDay)} to ${A.dayText(ov.lastDay)}. ${n0(all.length)} plays in all; a real play lasts 30 seconds or more.`;
  $("personality").innerHTML = `<b>Your listening personality:</b> ${traits.map(t => `<span class="chip">${esc(t[0])}</span>`).join(" ")}<p class="muted">${traits.map(t => `<b>${esc(t[0])}:</b> ${esc(t[1])}`).join(" ")}</p>`;
  renderExclusions();
  $("tabs").innerHTML = TABS.map(([k, label]) => `<button role="tab" class="${state.tab === k ? "on" : ""}" data-act="tab" data-k="${k}">${esc(label)}</button>`).join("");
  renderPanel();
}

function renderPanel() {
  const fn = { life: tabLife, year: tabYear, cmp: tabCompare, when: tabWhen, habits: tabHabits, forgot: tabForgot, missed: tabMissed, artist: tabArtist, card: tabCard }[state.tab];
  $("panel").innerHTML = fn();
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
  const top8 = A.topArtists(real, 8).map(a => a.artist);
  const eras = stacked(sl.map(y => String(y.year)), top8.map((a, i) => ({ name: a, color: PALETTE[i % PALETTE.length],
    values: sl.map(y => real.reduce((c, r) => c + (r.y === y.year && r.artist === a ? 1 : 0), 0)) })), { height: 300 });
  return `<h2>The songs of your life</h2>${songTable("top20", "Top songs", top, [{ h: "Real plays", f: s => n0(s.plays) }, { h: "Hours", f: s => s.hours.toFixed(1) }])}
  <div class="two"><div><h2>Top artists</h2>${hbars(ta.map(a => ({ label: a.artist, value: a.plays, tip: `${n0(a.hours)} hours, ${n0(a.songs)} songs` })))}</div>
  <div><h2>Artist eras</h2>${eras}<p class="muted">Number one artist each year: ${yt.map(y => `${y.year} ${esc(y.top.artist)}`).join(", ")}</p></div></div>
  <h2>Milestones</h2>${table(["Play", "Date", "Song", "Artist"], ms.map(m => ["#" + n0(m.n), new Date(m.ts).toLocaleDateString(), songCell(m), esc(m.artist)]))}
  <div class="metrics">${metric("Longest daily streak", `${st.streakDays} days`, `${A.dayText(st.streakStart)} to ${A.dayText(st.streakEnd)}`)}${metric("Longest break", `${st.gapDays} days`, st.gapStart ? `${A.dayText(st.gapStart)} to ${A.dayText(st.gapEnd)}` : "No break")}${metric("Biggest day", `${bd[0].plays} plays`, `${A.dayText(bd[0].dn)}, ${bd[0].hours.toFixed(1)} hours`)}</div>
  <h3>Your biggest listening days</h3>${table(["Day", "Real plays", "Hours"], bd.map(d => [A.dayText(d.dn), n0(d.plays), d.hours.toFixed(1)]))}
  <h3>Breaks</h3><label class="ctl">Show silences of at least <b>${state.breakDays}</b> days <input type="range" min="2" max="30" value="${state.breakDays}" data-bind="breakDays"></label>
  <p class="muted">${brk.length} breaks, with the song you stopped on and the one you came back with.</p>
  ${brk.length ? table(["From", "To", "Days silent", "Last song before", "First song after"], brk.slice(0, 50).map(b => [A.dayText(b.start), A.dayText(b.end), String(b.days), `${esc(b.lastSong)} (${esc(b.lastArtist)})`, `${esc(b.firstSong)} (${esc(b.firstArtist)})`])) : ""}`;
}

const PALETTE = ["#1db954", "#e8a33d", "#5b9bd5", "#e33a3a", "#b07cd8", "#4cc9c0", "#d96ba0", "#8a919c"];

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
  ${songTable("lane", "Down the memory lane", ml.list, [{ h: "Plays/day", f: s => s.perDay.toFixed(2) }, { h: "Plays", f: s => n0(s.plays) }, { h: "Days played", f: s => n0(s.days) }, { h: "Replay days", f: s => n0(s.replayDays) }])}`;
}

function tabForgot() {
  const { real } = state.data;
  const f = memo(`f${state.forgotMin}-${state.forgotMonths}`, () => A.forgottenFavourites(real, state.forgotMin, Math.round(state.forgotMonths * 30.4), 40));
  return `<h2>Songs you loved and left behind</h2><div class="two">
  <label class="ctl">At least this many real plays: <b>${state.forgotMin}</b><input type="range" min="10" max="300" step="5" value="${state.forgotMin}" data-bind="forgotMin"></label>
  <label class="ctl">Not played for at least (months): <b>${state.forgotMonths}</b><input type="range" min="3" max="48" value="${state.forgotMonths}" data-bind="forgotMonths"></label></div>
  <p><b>${n0(f.total)} songs</b> match. The ones you played most, then dropped:</p>
  ${f.list.length ? songTable("forgot", "Forgotten favourites", f.list, [{ h: "Plays", f: s => n0(s.plays) }, { h: "Peak year", f: s => String(s.peakYear) }, { h: "Last played", f: s => A.dayText(s.lastDay) }, { h: "Quiet for", f: s => Math.round(s.quietDays / 30.4) + " months" }]) : "<p>Nothing matches. Lower the numbers above.</p>"}`;
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

function tabCard() {
  const { real } = state.data;
  const years = A.byYear(real).map(y => y.year);
  const sel = `<select data-bind="card"><option value="all" ${state.card === "all" ? "selected" : ""}>Lifetime</option>${years.map(y => `<option ${String(y) === String(state.card) ? "selected" : ""}>${y}</option>`).join("")}</select>`;
  let body;
  if (state.card === "all") {
    const ov = memo("ov", () => A.overview(real, state.data.all));
    const ts = A.topSongs(real, 5), ta = A.topArtists(real, 5);
    body = cardHtml("Lifetime", `${A.dayText(ov.firstDay)} to ${A.dayText(ov.lastDay)}`, ov.hours * 60, ov.realPlays, ov.songs, ov.artists, ts, ta);
  } else {
    const y = +state.card, c = A.yearCard(real, y);
    body = cardHtml(String(y), `Best month: ${A.MONTHS[c.bestMonth - 1]}`, c.hours * 60, c.plays, c.songs, c.artists, c.topSongs, c.topArtists);
  }
  return `<h2>Which wrapped? ${sel}</h2>${body}<p class="muted">Screenshot the card to share it. Nothing is uploaded anywhere.</p>`;
}
function cardHtml(label, sub, minutes, plays, songs, artists, ts, ta) {
  return `<div class="wcard"><h3>${esc(label)}</h3><p class="sub">${esc(sub)}</p>
  <div class="big"><div><b>${n0(minutes)}</b><span>minutes listened</span></div><div><b>${n0(plays)}</b><span>real plays</span></div><div><b>${n0(songs)}</b><span>different songs</span></div><div><b>${n0(artists)}</b><span>different artists</span></div></div>
  <div class="two"><div><h4>Top songs</h4><ol>${ts.map(s => `<li>${esc(s.name)} <small>${esc(s.artist)}</small></li>`).join("")}</ol></div><div><h4>Top artists</h4><ol>${ta.map(a => `<li>${esc(a.artist)} <small>${n0(a.plays)} plays</small></li>`).join("")}</ol></div></div></div>`;
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

window.__wrapped = { state, A, handleFiles };   // for testing in the browser console
