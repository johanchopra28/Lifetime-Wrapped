"""Lifetime Wrapped on Streamlit.

Streamlit only serves the page. The page itself (plain HTML and JavaScript, see index.html and js/) runs in the visitor's
browser and reads their Spotify zip there, so the file is never sent to Streamlit's servers or anywhere else.

    streamlit run streamlit_app.py
"""
import streamlit as st
import streamlit.components.v1 as components

from bundle import build

st.set_page_config(page_title="Lifetime Wrapped", page_icon=":material/auto_awesome:", layout="wide", initial_sidebar_state="collapsed")
st.markdown("""<style>
.block-container {padding: 0 !important; max-width: 100% !important;}
header[data-testid="stHeader"], footer, #MainMenu, [data-testid="stSidebar"] {display: none !important;}
iframe {border: 0; display: block;}
</style>""", unsafe_allow_html=True)


@st.cache_data(show_spinner=False)
def page():
    return build()


components.html(page(), height=2000, scrolling=True)
