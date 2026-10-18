# Lifetime Wrapped

A static web page that turns your Spotify **Extended streaming history** into a lifetime "wrapped": top songs and artists, the song that ruled each month, compare any two years, taste drift, when you listen, repeat habits, songs you left behind, songs you probably missed from artists you love, an artist deep dive and shareable cards.

## Privacy

- The file is read **in your browser**. There is no server, no upload, no database, no cookies and no analytics.
- `index.html` sets a Content Security Policy that blocks every network request except album covers. To show covers, the page asks Spotify's public oEmbed service (open.spotify.com) for the art of the songs on screen and loads the images from Spotify's image servers, so those songs' Spotify IDs (and the visitor's IP address, as with any web request) are sent to Spotify. The file itself, the visitor's name and the full history are never sent. The sample data skips the lookups because its songs are made up.
- Only song, artist, album, play length and time are read. IP address, country and device in the export are ignored.
- There are no outside libraries or CDN links: plain HTML, CSS and JavaScript (`js/`), so it can be read in full.
- Settings such as songs you leave out live in memory only and vanish when the tab closes.

## Run it

Any static file server works (ES modules do not load from `file://`):

```
python -m http.server 8600
```

then open http://localhost:8600 and choose your zip.

## Host it on Streamlit

`streamlit_app.py` serves the same page from a Streamlit app. Streamlit only delivers the page; the file is still read in the visitor's browser, so nothing is uploaded to Streamlit either.

```
pip install -r requirements.txt
streamlit run streamlit_app.py
```

To put it on Streamlit Community Cloud: push this folder to a GitHub repository, then at share.streamlit.io choose **New app**, pick the repository and branch, and set the main file to `streamlit_app.py`. `bundle.py` builds the single page at start-up, so there is nothing else to generate.

## Publish it elsewhere

Upload the folder to any static host (GitHub Pages, Netlify, Cloudflare Pages). Serve `index.html`, `style.css` and `js/`. Leave `tests/` out.

## Get the data

Spotify account, Privacy settings, Download your data, tick **Extended streaming history**. Spotify emails the zip (can take days). The page reads files named `Streaming_History_Audio_*.json` (and the older `endsong_*.json`), from the zip or picked directly.

## What is deliberately not here

- Playlist creation (needs a Spotify login; Spotify limits new apps to a handful of users). Every song list has **Copy Spotify links** and **Download CSV** instead.
- Audio-feature moods (they need an outside service and a key). Album covers are looked up from Spotify as described under Privacy.

## Layout

- `js/load.js` reads the zip (central directory plus the browser's own `DecompressionStream`) and picks the fields it needs.
- `js/analysis.js` is all the maths, as plain functions on arrays.
- `js/charts.js` draws SVG charts; `js/app.js` is the page.
- `tests/reference.py` + `tests/compare.js` check the maths against the Python version of the same analysis (`wrapped.py` in the Spotify pipeline project). On a real 327,508-play export all 18 compared figures matched exactly.

## Notes on the maths

- A real play is 30 seconds or more. Songs are merged by lowercase title + artist, so a song released twice counts once.
- Times use the visitor's time zone.
- "Missed from artists you love" is a guess from behaviour (finishing, coming back on other days, how much you play the artist, early skips), not a record of likes.
