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
