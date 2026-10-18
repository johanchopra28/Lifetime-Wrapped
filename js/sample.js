// A made-up listening history for the "Try it with sample data" button, so the page can be explored before the real
// export arrives (Spotify can take days). Every artist, song and play here is invented and generated on the spot in the
// visitor's browser; nothing is fetched. The records use the same field names as Spotify's export, so the normal loader
// reads them exactly as it would a real file.

function rng(seed) {   // small seeded generator: the same sample every time
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// name, albums, songs (most played first), and how much of each year (2022..2026) goes to this artist
const ARTISTS = [
  ["Marlow & Pine", ["Night Bus Home", "Paper Crowns"], ["Night Bus Home", "Paper Crowns", "Thread and Needle", "Harbour Lights", "Long Way Round", "Small Hours"], [5, 6, 3, 1, 1]],
  ["Tessa Orr", ["Salt Air", "Honey Static"], ["Salt Air", "Honey Static", "Kerosene", "Winter Coat", "Two Rooms"], [1, 2, 6, 7, 5]],
  ["The Quiet Hours", ["Glasshouse"], ["Glasshouse", "Slow Burn", "Evenfall", "Tin Roof", "Lanterns"], [4, 4, 4, 3, 2]],
  ["Juno Vale", ["Cold Coffee"], ["Cold Coffee", "Paper Planes", "Static Bloom", "Overpass"], [0, 1, 4, 6, 3]],
  ["Nadir Khan", ["Low Tide"], ["Low Tide", "Saffron Sky", "Ninth Floor", "Undertow"], [3, 2, 2, 1, 1]],
  ["Sol Archer", ["Daylight Debt"], ["Daylight Debt", "Rust Belt", "Copper Wire", "Soft Landing"], [2, 1, 1, 2, 4]],
  ["Wren & the Tides", ["Shoreline"], ["Shoreline", "Driftwood", "Salt Lamp"], [3, 3, 1, 0, 0]],
  ["Ayla Meridian", ["Afterglow"], ["Afterglow", "Velvet Hour", "Moth to Neon", "Golden Fold"], [0, 0, 2, 4, 5]],
];
const HOUR_WEIGHT = [7, 6, 5, 3, 1, 1, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 5, 6, 7, 8, 8];   // late-night listener

function pickWeighted(weights, r) {
  let total = 0;
  for (const w of weights) total += w;
  let x = r() * total;
  for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return i; }
  return weights.length - 1;
}

/** Records shaped like Spotify's Streaming_History_Audio_*.json entries (only the fields the page reads). */
export function sampleHistory() {
  const r = rng(20261018);
  const out = [];
  const end = Date.UTC(2026, 9, 17);
  for (let day = Date.UTC(2022, 0, 1); day <= end; day += 86400000) {
    const d = new Date(day);
    const year = d.getUTCFullYear(), yi = year - 2022;
    if (r() < 0.22) continue;                                   // days with no listening
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const burst = year === 2024 && d.getUTCMonth() >= 5 && d.getUTCMonth() <= 7 ? 1.6 : 1;
    const plays = Math.round((4 + r() * 16) * (weekend ? 1.3 : 1) * burst);
    for (let p = 0; p < plays; p++) {
      const a = pickWeighted(ARTISTS.map(x => x[3][yi] + 0.15), r);
      const [artist, albums, songs] = ARTISTS[a];
      const s = Math.min(songs.length - 1, Math.floor(Math.pow(r(), 1.7) * songs.length));
      const hour = pickWeighted(HOUR_WEIGHT, r);
      const ts = new Date(day + hour * 3600000 + Math.floor(r() * 3600000));
      const short = r() < 0.16;
      const ms = short ? 3000 + Math.floor(r() * 24000) : 150000 + Math.floor(r() * 120000);
      out.push({
        ts: ts.toISOString(),
        ms_played: ms,
        spotify_track_uri: "spotify:track:" + ("SAMPLE" + String(a).padStart(2, "0") + String(s).padStart(2, "0")).padEnd(22, "x"),
        master_metadata_track_name: songs[s],
        master_metadata_album_artist_name: artist,
        master_metadata_album_album_name: albums[s % albums.length],
        skipped: short,
      });
    }
  }
  return out;
}
