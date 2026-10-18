// Small dependency-free SVG charts. Each function returns an HTML string; the page wires clicks with data-i attributes.

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Vertical bars. data: [{label, value, tip}], selected: index or null. Bars carry data-i for clicks. */
export function bars(data, { height = 260, fmt = v => v.toLocaleString(), selected = null, clickable = false, cls = "bar" } = {}) {
  const W = 720, padL = 46, padB = 28, padT = 10, H = height;
  const max = niceMax(Math.max(...data.map(d => d.value), 0));
  const bw = (W - padL) / data.length;
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ae28a"/><stop offset="1" stop-color="#1ed760" stop-opacity=".55"/></linearGradient></defs>`;
  for (let t = 0; t <= 4; t++) {
    const y = padT + (H - padT - padB) * (1 - t / 4);
    out += `<line class="grid" x1="${padL}" x2="${W}" y1="${y}" y2="${y}"/><text class="axis" x="${padL - 6}" y="${y + 4}" text-anchor="end">${fmt(max * t / 4)}</text>`;
  }
  data.forEach((d, i) => {
    const h = (H - padT - padB) * (d.value / max);
    const x = padL + i * bw + bw * 0.12, w = bw * 0.76, y = H - padB - h;
    const dim = selected != null && selected !== i ? " dim" : "";
    out += `<g class="${cls}${dim}${clickable ? " click" : ""}" data-i="${i}"><title>${esc(d.tip || `${d.label}: ${fmt(d.value)}`)}</title>`
         + `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(h, 0)}" rx="2"/><rect class="hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}"/>`
         + `<text class="axis" x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text></g>`;
  });
  return out + "</svg>";
}

/** Horizontal bars for rankings. data: [{label, value, tip}]. */
export function hbars(data, { fmt = v => v.toLocaleString() } = {}) {
  const max = Math.max(...data.map(d => d.value), 1);
  return `<div class="hbars">` + data.map(d => `<div class="hrow" title="${esc(d.tip || "")}"><span class="hlabel">${esc(d.label)}</span>`
    + `<span class="htrack"><span class="hfill" style="width:${(d.value / max * 100).toFixed(1)}%"></span></span><span class="hval">${fmt(d.value)}</span></div>`).join("") + `</div>`;
}

/** Stacked bars. series: [{name, color (css var or colour), values[]}], labels[]. */
export function stacked(labels, series, { height = 280, fmt = v => v.toLocaleString(), pct = false } = {}) {
  const W = 720, padL = 46, padB = 28, padT = 10, H = height;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
  const max = pct ? 1 : niceMax(Math.max(...totals, 0));
  const bw = (W - padL) / labels.length;
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  for (let t = 0; t <= 4; t++) {
    const y = padT + (H - padT - padB) * (1 - t / 4);
    out += `<line class="grid" x1="${padL}" x2="${W}" y1="${y}" y2="${y}"/><text class="axis" x="${padL - 6}" y="${y + 4}" text-anchor="end">${pct ? Math.round(t * 25) + "%" : fmt(max * t / 4)}</text>`;
  }
  labels.forEach((lab, i) => {
    let acc = 0;
    const tot = pct ? totals[i] || 1 : 1;
    const x = padL + i * bw + bw * 0.12, w = bw * 0.76;
    for (const s of series) {
      const v = pct ? s.values[i] / tot : s.values[i];
      const h = (H - padT - padB) * (v / max), y = H - padB - (H - padT - padB) * ((acc + v) / max);
      out += `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(h, 0)}" fill="${s.color}"><title>${esc(lab)} ${esc(s.name)}: ${pct ? Math.round(v * 100) + "%" : fmt(s.values[i])}</title></rect>`;
      acc += v;
    }
    out += `<text class="axis" x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
  });
  out += "</svg>";
  return out + `<div class="legend">` + series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("") + `</div>`;
}

/** Grid heatmap. rows/cols are labels, values[row][col]. */
export function heatmap(rows, cols, values, { cell = 24 } = {}) {
  const max = Math.max(...values.flat(), 1);
  const padL = 40, padT = 18, W = padL + cols.length * cell, H = padT + rows.length * cell;
  let out = `<svg class="chart heat" viewBox="0 0 ${W} ${H}" role="img">`;
  cols.forEach((c, j) => { if (j % 3 === 0) out += `<text class="axis" x="${padL + j * cell + cell / 2}" y="11" text-anchor="middle">${esc(c)}</text>`; });
  rows.forEach((r, i) => {
    out += `<text class="axis" x="${padL - 6}" y="${padT + i * cell + cell / 2 + 4}" text-anchor="end">${esc(r)}</text>`;
    cols.forEach((c, j) => {
      const v = values[i][j];
      out += `<rect x="${padL + j * cell + 1}" y="${padT + i * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="var(--accent)" fill-opacity="${(0.06 + 0.94 * v / max).toFixed(3)}"><title>${esc(r)} ${esc(c)}: ${v.toLocaleString()} plays</title></rect>`;
    });
  });
  return out + "</svg>";
}

/** Calendar heatmap for one year. counts: Map(dayNumber -> plays). */
export function calendar(year, counts) {
  const DAY = 86400000, cell = 12;
  const jan1 = Math.floor(Date.UTC(year, 0, 1) / DAY), dec31 = Math.floor(Date.UTC(year, 11, 31) / DAY);
  const startWd = (new Date(jan1 * DAY).getUTCDay() + 6) % 7;
  const max = Math.max(...counts.values(), 1);
  const weeks = Math.ceil((dec31 - jan1 + 1 + startWd) / 7);
  let out = `<svg class="chart cal" viewBox="0 0 ${weeks * cell + 30} ${7 * cell + 16}" role="img">`;
  ["Mon", "Wed", "Fri"].forEach((d, k) => { out += `<text class="axis" x="0" y="${16 + k * 2 * cell + 9}">${d}</text>`; });
  for (let dn = jan1; dn <= dec31; dn++) {
    const idx = dn - jan1 + startWd, wk = Math.floor(idx / 7), wd = idx % 7;
    const v = counts.get(dn) || 0;
    const date = new Date(dn * DAY).toISOString().slice(0, 10);
    out += `<rect x="${30 + wk * cell}" y="${16 + wd * cell}" width="${cell - 2}" height="${cell - 2}" rx="2" fill="${v ? "var(--accent)" : "var(--cell)"}" fill-opacity="${v ? (0.2 + 0.8 * v / max).toFixed(2) : 1}"><title>${date}: ${v} plays</title></rect>`;
  }
  return out + "</svg>";
}

// ------------------------------------------------------------------ stream chart (stacked area with smooth, translucent layers)
let streamData = null;

/** Smooth line through the points that never overshoots between them (monotone cubic), so layers do not bulge past each other. */
function curvePath(pts) {
  const n = pts.length, f = v => v.toFixed(1);
  const dx = [], sl = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); sl.push((pts[i + 1][1] - pts[i][1]) / dx[i]); }
  const m = [sl[0]];
  for (let i = 1; i < n - 1; i++) m.push(sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2);
  m.push(sl[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / sl[i], b = m[i + 1] / sl[i], h = Math.hypot(a, b);
    if (h > 3) { m[i] = 3 * a / h * sl[i]; m[i + 1] = 3 * b / h * sl[i]; }
  }
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i][0] + dx[i] / 3, x2 = pts[i + 1][0] - dx[i] / 3;
    d += `C${f(x1)},${f(pts[i][1] + m[i] * dx[i] / 3)} ${f(x2)},${f(pts[i + 1][1] - m[i + 1] * dx[i] / 3)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return d;
}

/** series: [{name, color, values[]}], labels: x labels. Layers are translucent gradients with a fine line on each top edge.
 *  Needs at least two labels. Clicks on [data-sfocus] and hovers on [data-syc] are wired in app.js. */
export function streamChart(labels, series, { title = "Real plays" } = {}) {
  streamData = { labels, series };
  const n = labels.length;
  if (n < 2) return `<p class="muted">Not enough years to draw this yet.</p>`;
  const W = 560, H = 340, pl = 50, pr = 22, pt = 10, pb = 26;
  const stack = labels.map((_, i) => series.reduce((s, a) => s + a.values[i], 0));
  const top = Math.max(...stack, 1), p = Math.pow(10, Math.floor(Math.log10(top))), fr = top / p;
  const max = (fr <= 1 ? 1 : fr <= 2 ? 2 : fr <= 5 ? 5 : 10) * p;
  const x = i => pl + i * (W - pl - pr) / (n - 1), y = v => H - pb - (H - pb - pt) * v / max;
  const base = labels.map(() => 0), edges = [];
  const layers = series.map((a, k) => {
    const lo = base.slice(), hi = labels.map((_, i) => base[i] + a.values[i]);
    hi.forEach((v, i) => { base[i] = v; });
    const up = curvePath(hi.map((v, i) => [x(i), y(v)]));
    const dn = curvePath(lo.map((v, i) => [x(i), y(v)]).reverse()).replace(/^M/, "L");
    edges.push(`<path data-sedge="${k}" d="${up}" fill="none" stroke="${a.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
    return `<path data-slayer="${k}" d="${up}${dn}Z" fill="${a.color}" fill-opacity=".5"/>`;
  }).join("");
  const ticks = [0, .25, .5, .75, 1].map(f => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(max * f)}" y2="${y(max * f)}"/><text class="num" x="${pl - 8}" y="${y(max * f) + 4}" text-anchor="end">${Math.round(max * f).toLocaleString()}</text>`).join("");
  const xs = labels.map((l, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`).join("");
  const cw = (W - pl - pr) / (n - 1);
  const cols = labels.map((_, i) => `<rect data-syc="${i}" x="${x(i) - cw / 2}" y="${pt}" width="${cw}" height="${H - pb - pt}" fill="transparent"/>`).join("");
  const legend = series.map((a, k) => `<button type="button" class="sleg-b" data-sfocus="${k}" aria-pressed="false"><i style="background:${a.color}"></i>${esc(a.name)}</button>`).join("");
  return `<div class="stream" data-stream><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stacked area chart of plays per year">${ticks}${layers}${edges.join("")}
    <line class="sx" y1="${pt}" y2="${H - pb}" style="display:none"/><text transform="translate(11 ${(H - pb + pt) / 2}) rotate(-90)" text-anchor="middle">${esc(title)}</text>${xs}${cols}</svg>
    <div class="sleg">${legend}</div><p class="muted shint">Hover a year for the order that year. Click a name to isolate that artist.</p></div>`;
}

/** Tooltip html for column i of the last stream chart. */
export function streamTipHtml(i) {
  if (!streamData) return "";
  const { labels, series } = streamData;
  const total = series.reduce((s, a) => s + a.values[i], 0);
  const rows = series.map(a => [a.name, a.values[i], a.color]).filter(r => r[1] > 0).sort((p, q) => q[1] - p[1])
    .map(r => `<span style="color:${r[2]}">&#9632;</span> ${esc(r[0])} <span class="m">${r[1].toLocaleString()}</span>`).join("<br>");
  return `<b>${esc(labels[i])}</b> <span class="m">${total.toLocaleString()} plays from these artists</span><br>${rows}`;
}
