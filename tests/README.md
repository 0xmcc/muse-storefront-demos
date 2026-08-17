# tests

Browser tests for the storefront demos. Chromium via Playwright.

```
cd tests
npm install
npx playwright install chromium   # first run only
npx playwright test
```

The config starts its own static server on `:8799` against
`sites/barcelino`, so nothing else needs to be running. Every call to
`api/tryon` is stubbed in the spec — no backend, no Gemini spend, and the
loading state can be held open indefinitely instead of raced.

`fitting-label.spec.js` covers the fitting-room loading treatment. It reads
**rendered pixels**, not the DOM: this state has broken twice, and both times
the markup and stylesheet looked correct — the text was simply not something a
person could see. Contrast is measured by screenshotting the text's own line
box and comparing luminance extremes inside it.

The shopper photo comes from `~/Downloads/linkedinPFP.jpeg`.

## capture.js

Screenshots the same states for eyeballing, and prints the measured contrast
alongside each file it writes:

```
node capture.js out.png          # cold frame, first look generating
node capture.js out.png --over   # next look generating over the current one
node capture.js out.png --rest   # a look landed, treatment cleared
node capture.js out.png --crop   # the frame alone, not the whole studio
```

`--variant=NAME` swaps in one of the loading treatments that were built and
compared before `soft` was chosen — `plate`, `veil`, `bare`. They are applied
as stylesheet overrides, so the comparison can be re-run without touching the
page. Measured on 2026-08-17 (cold frame / over a look):

| variant | | |
|---|---|---|
| `soft` | 15.71:1 / 15.84:1 | ships — cream wash, ink text |
| `plate` | 11.62:1 / 12.31:1 | safe, but a black box in a boutique |
| `veil` | 6.87:1 / 8.53:1 | good over photography, a slab when empty |
| `bare` | 2.61:1 / 3.62:1 | no backdrop — this was the original bug |

Needs the static server up: `python3 -m http.server 8799 --directory ../sites/barcelino`
