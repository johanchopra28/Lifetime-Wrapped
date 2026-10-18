"""Lifetime Wrapped on Streamlit.

Streamlit only serves the page. The page itself (plain HTML and JavaScript, see index.html and js/) runs in the visitor's
browser and reads their Spotify zip there, so the file is never sent to Streamlit's servers or anywhere else.

    streamlit run streamlit_app.py
"""
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

from bundle import build

ROOT = Path(__file__).resolve().parent

st.set_page_config(page_title="Lifetime Wrapped", page_icon=":material/auto_awesome:", layout="wide", initial_sidebar_state="collapsed")
st.markdown("""<style>
.block-container {padding: 0 !important; max-width: 100% !important;}
header[data-testid="stHeader"], footer, #MainMenu, [data-testid="stSidebar"] {display: none !important;}
iframe {border: 0; display: block;}
[data-testid="stElementContainer"]:has(> iframe) {height: auto !important; flex: 0 0 auto !important;}   /* the page inside sizes its own frame; keep the box around it in step (Streamlit fixes both its height and its flex size) */
.creds {display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; padding: 18px 12px 28px; font: 14px system-ui, sans-serif; color: #8995a3;}
.creds a {display: inline-flex; gap: 7px; align-items: center; padding: 5px 13px 5px 10px; border-radius: 999px; background: #24292f; color: #fff !important;
  text-decoration: none !important; font-weight: 600; border: 1px solid #3b434c; transition: border-color .12s, transform .12s;}
.creds a:hover {border-color: #1ed760; transform: translateY(-1px);}
.creds svg {width: 16px; height: 16px; fill: #fff;}
</style>""", unsafe_allow_html=True)

GITHUB_MARK = ('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>')
CREATORS = [("Sarthak Sharma", "https://github.com/sarthakgh29"), ("Johan Chopra", "https://github.com/johanchopra28")]   # in this order


def _stamp():
    """Changes whenever any file that goes into the page changes, so a redeploy never serves a stale cached page."""
    files = [ROOT / "index.html", ROOT / "style.css", ROOT / "bundle.py", *sorted((ROOT / "js").glob("*.js"))]
    return tuple((f.name, f.stat().st_mtime_ns, f.stat().st_size) for f in files)


@st.cache_data(show_spinner=False)
def page(stamp):
    return build()


components.html(page(_stamp()), height=2000, scrolling=True)

links = " ".join(f'<a href="{url}" target="_blank" rel="noopener noreferrer">{GITHUB_MARK}{name}</a>' for name, url in CREATORS)
st.markdown(f'<div class="creds">Created by {links}</div>', unsafe_allow_html=True)
