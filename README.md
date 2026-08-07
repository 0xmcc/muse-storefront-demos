# muse-storefront-demos

Generates branded, pixel-credible clones of fashion retailers' storefronts with Muse
virtual try-on embedded — as outbound sales assets. Type a retailer URL, get a live link
to send cold.

**Start here:** `docs/PROBLEM-MAP.md` — the dream outcome, all 42 mapped obstacles, and
every locked decision (D1–D11) with its rationale. Read it before changing behavior.
`docs/TRYON-INTEGRATION.md` — the Muse try-on API contract and the silent-failure trap
that D11 exists to prevent.
`docs/HERO-IMAGE-METHOD.md` — how the landing hero was produced, as a repeatable
three-pass method (articulate feedback → art direction → extract asset). Read before
making a hero for the next retailer; the extraction prompt is the non-obvious part.

## Status (2026-08-06)
Pre-skill. One site built by hand to learn the shape before freezing it into a skill.

| | |
|---|---|
| Reference build | `sites/barcelino/` |
| — product page | `index.html` — their real PDP, studio opens from the PDP button |
| — try-on destination | `virtual-try-on.html` — the landing journey, built from `landing.template.html` |
| Brand style profile | `sites/barcelino/brand.json` (D14) |
| Ledger | `demos.csv` — one row per run, aborts included (D9) |
| Raw scrape + screenshots | `.scrape/barcelino/` |

## Repo layout
```
docs/            decisions and integration contracts — canonical memory
sites/<brand>/   generated demo sites
  brand.json     the reusable style profile (D14) — read this before rebuilding
  index.html     product page with try-on entry point
  tryon.html     the full-screen try-on studio
  assets/        logo, product images, catalog, shopper photo
scripts/         generate_tryon.py (the Muse seam) · serve.py (proxy) · build_catalog.py
demos.csv        the run ledger / control panel
.scrape/<brand>/ raw FireCrawl output + ground-truth screenshots (gitignored)
```

## Running a demo
Try-on is generated LIVE (D12) through a proxy that holds the Muse credentials (D13),
so a demo needs the server — it is not a static file any more.

```bash
python3 scripts/serve.py --brand barcelino     # http://localhost:8765
```
`/tryon.html` is the L'Oréal-style studio: your photo on the left, the generated look on
the right, a category-tabbed carousel of the retailer's real catalog underneath. Click any
garment and it generates against the live Muse backend in ~16s.

`/virtual-try-on.html` is the destination page: hero with before/after plates, intro,
step walkthrough built from real screenshots of the studio itself, trust cards, editorial
prose, FAQ, AI-services band, footer. Every CTA opens the same studio.

Rebuild it after touching either the template or the studio — the studio's CSS, markup and
controller are lifted out of `index.html` at build time so the two cannot drift:
```bash
python3 scripts/build_landing.py barcelino
```

QA hooks: `?studio=1` opens the studio; `?fitting=1` freezes the fitting veil without
spending a call; `?auto=<slug>` fires a real generation on load for headless capture.

## How a build works
1. **Scrape structure** — FireCrawl `/v2/scrape` with `rawHtml` + full-page `screenshot`.
   Homepage, one category, one PDP. Hard page budget (#12).
   Key is in `~/.claude/settings.local.json` under `mcpServers.firecrawl.env`. The HTTP API
   is called directly — no MCP server required, so this runs anywhere.
2. **Extract design tokens** — fonts and colors from the site's real compiled CSS, not
   guessed. Log any font substitution rather than hiding it (#9).
3. **Fetch products** — individual PDPs are often reachable with plain `curl`, which costs
   zero FireCrawl credits. Always try curl before spending a scrape.
4. **Localize every asset** — download images; never hotlink (#4).
5. **Build** a static `index.html` on the retailer's real tokens, images, and copy.
6. **Write `brand.json`** (D14) — fonts, tokens, layout metrics, copy, scraping gotchas.
   This is the reusable artifact; the HTML is downstream of it.
7. **Wire live try-on** (D12) through `scripts/serve.py`, which calls
   `POST /api/outfits/tryon` passing images as base64 `data:` URLs (D11 — not optional,
   see TRYON-INTEGRATION.md). Credentials stay server-side (D13).
8. **QA gate** (D7/#41) — screenshot every state, compare against the real page, verdict
   pass / near-miss / abort.
9. **Publish + log** — a row in `demos.csv` either way (D9/#42).

## QA state hooks
Any demo page supports `?state=` so every screen is screenshottable headlessly with no
browser driver:

| URL | state |
|---|---|
| `index.html` | product page |
| `index.html?state=intro` | try-on intro modal |
| `index.html?state=gen` | generating (ring frozen at 65% for a stable diff) |
| `index.html?state=result` | try-on result + Complete the Look |

```bash
cd sites/barcelino && python3 -m http.server 8765
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --hide-scrollbars --window-size=1440,2600 --screenshot=out.png \
  --virtual-time-budget=3500 "http://localhost:8765/index.html?state=result"
```

## Open questions blocking completion
- **OQ2** — Muse API credentials. Either `MUSE_API_BASE` + `APP_API_KEY`
  (+ `DEV_PRO_OVERRIDE_KEY`), or a `GOOGLE_API_KEY` to run `muse-backend` locally.
  Until then every run records `tryon_status: stub` and the result panel renders an honest
  "TRY-ON FRAME PENDING" placeholder — **never a stand-in image passed off as real**.
- **OQ3** — hosting target for demo URLs (#13, #32, #38).
- **OQ4** — the fixed shopper photo (D5). Drop one image at
  `sites/<brand>/assets/shopper.jpg`; the modal and generating states reference it.

## Non-goals (v1)
Target-list building, outreach copy, open tracking, agency-objection positioning.
See PROBLEM-MAP.md before adding any of them.
