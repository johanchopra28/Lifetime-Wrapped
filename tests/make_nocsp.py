"""Writes tests/index_nocsp.html: the site without its Content-Security-Policy, for the browser tests (tests/compare.js).

    python tests/make_nocsp.py

Run it before testing. The file is not committed, so it never gets published without the policy.
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
s = (root / "index.html").read_text(encoding="utf-8")
s = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', "", s)
s = s.replace('href="style.css"', 'href="../style.css"').replace('src="js/app.js"', 'src="../js/app.js"')
(root / "tests" / "index_nocsp.html").write_text(s, encoding="utf-8")
print("wrote tests/index_nocsp.html")
