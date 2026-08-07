#!/usr/bin/env python3
"""Inject the scraped catalog into a demo site's try-on studio.

Reads .scrape/<brand>/catalog.json and replaces the __CATALOG__ token in
sites/<brand>/tryon.html. Re-runnable: it rewrites from tryon.template.html
when present, otherwise it patches in place only if the token is still there.
"""
import json, re, sys, os
brand = sys.argv[1] if len(sys.argv) > 1 else "barcelino"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = json.load(open(f"{REPO}/.scrape/{brand}/catalog.json"))

def tags(name):
    n = name.lower(); t = ["new"]
    if "leather" in n: t.append("leather")
    elif "blazer" in n: t.append("blazers")
    else: t.append("jackets")
    return t

def short(name):
    return re.sub(r"\s*\|\s*Men.?s\s*$", "", name).replace("&amp;", "&").strip()

out = [{
    "slug": p["slug"],
    "name": short(p["name"]),
    "short": short(p["name"]),
    "price": p["price"].replace("&amp;", "&"),
    "image": p["image"],
    "category": "Leather Jacket" if "leather" in p["name"].lower()
                else ("Blazer" if "blazer" in p["name"].lower() else "Jacket"),
    "tags": tags(p["name"]),
} for p in src]

blob = json.dumps(out, indent=2)
for name in ("index.html",):
    path = f"{REPO}/sites/{brand}/{name}"
    if not os.path.exists(path):
        continue
    html = open(path).read()
    if "__CATALOG__" in html:
        html = html.replace("__CATALOG__", blob)
    elif "const CATALOG = " in html:
        html = re.sub(r"const CATALOG = .*?\n\];\n|const CATALOG = .*?;\n",
                      "const CATALOG = " + blob + ";\n", html, count=1, flags=re.S)
    else:
        continue
    open(path, "w").write(html)
    print(f"injected {len(out)} products into sites/{brand}/{name}")
for p in out: print(f"  {p['price']:>22}  {p['short'][:46]:<46} {','.join(p['tags'][1:])}")
