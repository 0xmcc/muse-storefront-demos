#!/usr/bin/env python3
"""Compose the Virtual Try-On landing page from its template.

The studio (CSS, markup, controller) is lifted verbatim out of index.html so the
landing page and the product page can never drift apart. Re-run after changing
either the template or the studio.

    python3 scripts/build_landing.py [brand]
"""
import os
import re
import sys

brand = sys.argv[1] if len(sys.argv) > 1 else "barcelino"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
site = f"{REPO}/sites/{brand}"

index = open(f"{site}/index.html").read()
tpl = open(f"{site}/landing.template.html").read()

# whole <style> block: tokens, header, footer, studio — everything shared
base_css = re.search(r"<style>(.*?)</style>", index, re.S).group(1)

markup = index[index.index("<!-- ============ VIRTUAL TRY-ON STUDIO ============ -->"):
               index.index("<!-- D4: disclosure")]

js = re.search(r"<script>(.*?)</script>\s*</body>", index, re.S).group(1)

out = tpl
for token, value in (("__BASE_CSS__", base_css),
                     ("__STUDIO_MARKUP__", markup),
                     ("__STUDIO_JS__", js)):
    if token not in out:
        sys.exit(f"template is missing {token}")
    out = out.replace(token, value)

path = f"{site}/virtual-try-on.html"
open(path, "w").write(out)
print(f"built {path} ({len(out):,} bytes)")
