"""Builds the whole site (index.html + style.css + js/*.js) into ONE self-contained HTML string.

Used by streamlit_app.py to serve the page, and runnable on its own:
    python bundle.py > lifetime_wrapped_single.html

The JavaScript is not changed, only wrapped: each module becomes a function scope and the import lines become lookups.
The Content Security Policy is kept, with the one difference that scripts and styles are inline.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODULES = ["analysis", "load", "charts", "sample", "embed", "globe", "app"]   # dependency order
CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
       "img-src data: https://*.spotifycdn.com https://*.scdn.co; connect-src https://open.spotify.com; "
       "base-uri 'none'; form-action 'none'")


def _wrap(name):
    src = (ROOT / "js" / f"{name}.js").read_text(encoding="utf-8")
    exports = re.findall(r"^export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z_$][\w$]*)", src, re.M)
    src = re.sub(r"^export\s+", "", src, flags=re.M)

    def imports(m):
        what, mod = m.group(1).strip(), m.group(2)
        if what.startswith("* as "):
            return f"const {what[5:]} = M_{mod};"
        return f"const {what} = M_{mod};"

    src = re.sub(r'^import\s+(.+?)\s+from\s+"\./(\w+)\.js";', imports, src, flags=re.M)
    if exports:
        return f"const M_{name} = (() => {{\n{src}\nreturn {{ {', '.join(exports)} }};\n}})();"
    return f"(() => {{\n{src}\n}})();"


def build():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    js = "\n".join(_wrap(m) for m in MODULES)
    html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', lambda m: f'<meta http-equiv="Content-Security-Policy" content="{CSP}">', html)
    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
    html = html.replace('<script type="module" src="js/app.js"></script>', f"<script>\n{js}\n</script>")
    assert "<style>" in html and "const M_analysis" in html, "bundle failed"
    return html


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    print(build())
