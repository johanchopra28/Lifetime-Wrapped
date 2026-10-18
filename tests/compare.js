// Paste into the browser console on tests/index_nocsp.html after loading the same export (see tests/reference.py).
// Prints which numbers differ from the Python version.
(async () => {
  const ref = await (await fetch("/tests/fixtures/reference.json")).json();
  const { A, state } = window.__wrapped;
  const { real, all } = state.data;
  const ov = A.overview(real, all);
  const yp = A.yearProfile(real, 2023);
  const dr = A.tasteDrift(real, 50).find(d => d.year === 2024);
  const st = A.streaks(real);
  const mine = {
    all: all.length, real: real.length, songs: ov.songs, artists: ov.artists, hours: +ov.hours.toFixed(3), activeDays: ov.activeDays,
    top5: A.topSongs(real, 5).map(s => [s.name, s.plays]), topArtists5: A.topArtists(real, 5).map(a => [a.artist, a.plays]),
    y2023: { plays: yp.plays, songs: yp.songs, newSongs: yp.newSongs, activeDays: yp.activeDays, night: +yp.nightShare.toFixed(4) },
    replayAverage: +A.replayAverage(real).toFixed(6), lane5: A.memoryLane(real, 10, 5).list.map(s => [s.name, s.plays]),
    missed5: A.hiddenLikes(all, 15).slice(0, 5).map(s => [s.name, +s.score.toFixed(3)]),
    drift2024: { carried: dr.carried, new: dr.new, returning: dr.returning }, streak: st.streakDays, gap: st.gapDays,
    nightShare: +A.timeBands(real)[0].share.toFixed(4), forgotten: A.forgottenFavourites(real, 40, 365, 100000).total,
    comfort6: A.comfortSongs(real, 6, 100000).length,
  };
  const bad = {};
  for (const k of Object.keys(ref)) if (JSON.stringify(ref[k]) !== JSON.stringify(mine[k])) bad[k] = { python: ref[k], site: mine[k] };
  return { checked: Object.keys(ref).length, differences: bad };
})()
