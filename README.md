# muse-storefront-demos

Generates branded, pixel-credible clones of fashion retailers' storefronts with Muse
virtual try-on embedded — as outbound sales assets. Type a retailer URL, get a live link
to send cold.

**Start here:** `docs/PROBLEM-MAP.md` — the dream outcome, all 42 mapped obstacles, and
every locked decision (D1–D11) with its rationale. Read it before changing behavior.
`docs/TRYON-INTEGRATION.md` — the Muse try-on API contract and the silent-failure trap
that D11 exists to prevent.

## Status (2026-08-06)
Pre-skill. One site built by hand to learn the shape before freezing it into a skill.

| | |
|---|---|
| Reference build | `sites/barcelino/` |
| Ledger | `demos.csv` — one row per run, aborts included (D9) |
| Raw scrape + screenshots | `.scrape/barcelino/` |

## Repo layout
```
docs/            decisions and integration contracts — canonical memory
sites/<brand>/   generated demo sites, self-contained and static
  index.html     the whole demo: page, try-on flow, disclosure bar
  assets/        logo, product images, shopper photo, baked try-on frame
demos.csv        the run ledger / control panel
.scrape/<brand>/ raw FireCrawl output + ground-truth screenshots (gitignored)
```

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
6. **Pre-generate the try-on frame** (D2) via `POST /api/outfits/tryon`, passing images as
   base64 `data:` URLs (D11 — this is not optional, see TRYON-INTEGRATION.md).
7. **QA gate** (D7/#41) — screenshot every state, compare against the real page, verdict
   pass / near-miss / abort.
8. **Publish + log** — a row in `demos.csv` either way (D9/#42).

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
