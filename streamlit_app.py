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
</style>""", unsafe_allow_html=True)


def _stamp():
    """Changes whenever any file that goes into the page changes, so a redeploy never serves a stale cached page."""
    files = [ROOT / "index.html", ROOT / "style.css", ROOT / "bundle.py", *sorted((ROOT / "js").glob("*.js"))]
    return tuple((f.name, f.stat().st_mtime_ns, f.stat().st_size) for f in files)


@st.cache_data(show_spinner=False)
def page(stamp):
    return build()


components.html(page(_stamp()), height=2000, scrolling=True)
