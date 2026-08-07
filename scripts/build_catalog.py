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
    """Real categories only. A tab bar with nothing behind it is decoration."""
    n = name.lower(); t = ["new"]
    if "leather" in n: t.append("leather")
    elif "blazer" in n: t.append("blazers")
    elif "jacket" in n: t.append("jackets")
    elif "polo" in n or "knit" in n: t.append("knitwear")
    elif "tee" in n or "shirt" in n or "button down" in n: t.append("shirts")
    elif any(w in n for w in ("pant", "jean", "bermuda", "short", "trouser")): t.append("trousers")
    else: t.append("jackets")
    return t


DESIGNERS = ("Ravazzolo", "Kinross", "Loro Piana")


def house(name):
    for d in DESIGNERS:
        if name.lower().startswith(d.lower()):
            return d.upper()
    return "BARCELINO"

def category(name):
    n = name.lower()
    for key, lbl in (("leather", "Leather Jacket"), ("blazer", "Blazer"), ("jacket", "Jacket"),
                     ("polo", "Polo"), ("knit", "Knitwear"), ("tee", "T-Shirt"),
                     ("button down", "Shirt"), ("shirt", "Shirt"), ("bermuda", "Shorts"),
                     ("short", "Shorts"), ("jean", "Jeans"), ("pant", "Trousers")):
        if key in n:
            return lbl
    return "Jacket"


def short(name):
    n = re.sub(r"\s*\|.*$", "", name).replace("&amp;", "&").strip()
    n = re.sub(r"^(Men.s|Mens)\s+", "", n).strip()
    return n

out = [{
    "slug": p["slug"],
    "name": short(p["name"]),
    "short": short(p["name"]),
    "price": p["price"].replace("&amp;", "&"),
    "image": p["image"],
    "house": house(short(p["name"])),
    "category": category(p["name"]),
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
        # lambda replacement: the JSON blob contains \uXXXX escapes (curly
        # apostrophes in product names) which re.sub would try to interpret.
        html = re.sub(r"const CATALOG = .*?\n\];\n|const CATALOG = .*?;\n",
                      lambda m: "const CATALOG = " + blob + ";\n", html, count=1, flags=re.S)
    else:
        continue
    open(path, "w").write(html)
    print(f"injected {len(out)} products into sites/{brand}/{name}")
for p in out: print(f"  {p['price']:>22}  {p['short'][:46]:<46} {','.join(p['tags'][1:])}")
