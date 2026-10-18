"""Reference numbers for the site, worked out with the Python version (wrapped.py in the pipeline project).

    python tests/reference.py "<folder with Streaming_History_Audio_*.json>" "<path to spotify-mood-pipeline>" > tests/fixtures/reference.json

Run the same export through the site, then compare with tests/compare.js (paste it in the browser console).
"""
import glob
import json
import os
import sys

import pandas as pd

folder, pipeline = sys.argv[1], sys.argv[2]
sys.path.insert(0, pipeline)
import wrapped as w   # noqa: E402

rows = []
for f in sorted(glob.glob(os.path.join(folder, "Streaming_History_Audio_*.json"))):
    for r in json.load(open(f, encoding="utf-8")):
        uri = r.get("spotify_track_uri")
        if not uri or not uri.startswith("spotify:track:") or not r.get("master_metadata_track_name"):
            continue
        rows.append(dict(played_at=r["ts"], track_id=uri[14:], track_name=r["master_metadata_track_name"],
                         artist_name=r.get("master_metadata_album_artist_name") or "", album_name=r.get("master_metadata_album_album_name") or "",
                         seconds_played=r["ms_played"] / 1000, is_real_play=r["ms_played"] >= 30000, skipped=bool(r.get("skipped"))))
df = pd.DataFrame(rows).drop_duplicates(["played_at", "track_id"])
d = w.prepare(df)
real = w.real_plays(d)
ov = w.overview(real, d)
yp = w.year_profile(real, 2023) if hasattr(w, "year_profile") else None
ml = w.memory_lane(real, 10, 5)
hl = w.hidden_likes(d, 15).head(5)
dr = w.taste_drift(real, 50)
out = {
    "all": len(d), "real": len(real), "songs": ov["distinct_songs"], "artists": ov["distinct_artists"], "hours": round(ov["hours"], 3),
    "activeDays": ov["active_days"],
    "top5": [[r.track_name, int(r.plays)] for r in w.top_songs(real, 5).itertuples()],
    "topArtists5": [[r.artist_name, int(r.plays)] for r in w.top_artists(real, 5).itertuples()],
    "y2023": {"plays": yp["plays"], "songs": yp["songs"], "newSongs": yp["new_songs"], "activeDays": yp["active_days"], "night": round(yp["night_share"], 4)},
    "replayAverage": round(w.replay_average(real), 6),
    "lane5": [[r.track_name, int(r.plays)] for r in ml.itertuples()],
    "missed5": [[r.track_name, round(float(r.score), 3)] for r in hl.itertuples()],
    "drift2024": {k: int(dr[dr.year == 2024].iloc[0][k]) for k in ("carried", "new", "returning")},
    "streak": w.streaks(real)["streak_days"], "gap": w.streaks(real)["gap_days"],
    "nightShare": round(float(w.time_bands(real).iloc[0]["share"]), 4),
    "forgotten": len(w.forgotten_favourites(real, 40, 365, n=100000)),
    "comfort6": len(w.comfort_songs(real, 6, 100000)),
}
print(json.dumps(out, ensure_ascii=False))
