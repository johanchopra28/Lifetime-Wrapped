// Reads a Spotify "Extended streaming history" zip (or its JSON files) entirely in the browser.
// Nothing is uploaded: files are read from the visitor's disk into memory, and only the fields the page needs are kept.
// Fields such as IP address, country and device are never copied out of the JSON.

const NAME_RE = /(?:^|\/)(?:Streaming_History_Audio_[^/]*|endsong_[^/]*)\.json$/i;

function u16(v, o) { return v.getUint16(o, true); }
function u32(v, o) { return v.getUint32(o, true); }

/** List the entries of a zip held in an ArrayBuffer (central directory; no zip64). */
export function zipEntries(buf) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (u32(v, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This does not look like a zip file.");
  const count = u16(v, eocd + 10);
  let p = u32(v, eocd + 16);
  const td = new TextDecoder();
  const out = [];
  for (let n = 0; n < count; n++) {
    if (u32(v, p) !== 0x02014b50) throw new Error("The zip file is damaged.");
    const flags = u16(v, p + 8), method = u16(v, p + 10), csize = u32(v, p + 20);
    const nameLen = u16(v, p + 28), extraLen = u16(v, p + 30), commentLen = u16(v, p + 32), offset = u32(v, p + 42);
    const name = td.decode(new Uint8Array(buf, p + 46, nameLen));
    out.push({ name, method, csize, offset, utf8: !!(flags & 0x800) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** The text of one zip entry. */
export async function zipEntryText(buf, e) {
  const v = new DataView(buf);
  if (u32(v, e.offset) !== 0x04034b50) throw new Error("The zip file is damaged.");
  const start = e.offset + 30 + u16(v, e.offset + 26) + u16(v, e.offset + 28);
  const data = new Uint8Array(buf, start, e.csize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new Error("This zip uses a compression method the page cannot read.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

function pick(list, into) {
  for (const r of list) {
    const uri = r.spotify_track_uri;
    if (!uri || !uri.startsWith("spotify:track:") || !r.master_metadata_track_name) continue;
    const ts = Date.parse(r.ts);
    if (!(ts > 0) || !(r.ms_played >= 0)) continue;
    into.push({ ts, ms: r.ms_played, id: uri.slice(14), name: r.master_metadata_track_name,
                artist: r.master_metadata_album_artist_name || "", album: r.master_metadata_album_album_name || "", skipped: r.skipped === true });
  }
}

/** files: FileList or array of File (zips and/or json). Returns {plays, files, skippedNonTrack}. */
export async function loadFiles(files, onProgress = () => {}) {
  const raw = [];
  let parsed = 0;
  const jobs = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      onProgress(`Opening ${f.name}`);
      const buf = await f.arrayBuffer();
      for (const e of zipEntries(buf)) if (NAME_RE.test(e.name)) jobs.push({ label: e.name, text: () => zipEntryText(buf, e) });
    } else if (/\.json$/i.test(f.name) && NAME_RE.test(f.name)) {
      jobs.push({ label: f.name, text: () => f.text() });
    }
  }
  if (!jobs.length) throw new Error("No streaming history files found. Look for files named Streaming_History_Audio_....json inside your Spotify zip.");
  for (const j of jobs) {
    onProgress(`Reading ${j.label.split("/").pop()} (${++parsed} of ${jobs.length})`);
    await new Promise(r => setTimeout(r, 0));   // let the page repaint between files
    pick(JSON.parse(await j.text()), raw);
  }
  // the same play can appear twice if two exports overlap
  const seen = new Set(), plays = [];
  for (const r of raw) { const k = r.ts + r.id; if (!seen.has(k)) { seen.add(k); plays.push(r); } }
  return { plays, files: jobs.length };
}
