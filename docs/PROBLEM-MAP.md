# Storefront Demo Generator — Problem Map & Decision Log

Created: 2026-08-06 · Status: pre-build
Owner: Marko Calvo-Cruz

## Purpose
Source-of-truth for WHY this tool is built the way it is. Read before changing behavior.
Companion product: Muse embedded AI virtual try-on for fashion retailers.
Try-on integration details live in `TRYON-INTEGRATION.md`.

## Dream Outcome
Type a fashion retailer's URL. Return to a live, hosted, pixel-credible clone of their
storefront — their logo, type, palette, real products — with Muse virtual try-on working
inside it. Send the link cold. Do it 40x/week without opening a design file, and have the
40th be as good as the first.

**Classification: SALES WEAPON, not product prototype.** (Marko, 2026-08-06)
Consequence: throughput + credibility > fidelity + cleverness. An 85%-right demo in 12
minutes beats a 99% clone in a day. This ruling governs every trade-off below.

## Locked decisions
| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| D1 | Use the retailer's REAL catalog. No catalog → abort, not generic fallback | The mechanism IS "that's my jacket, on a person." Stock products destroy it | 2026-08-06 |
| ~~D2~~ | ~~Try-on results PRE-GENERATED at build time~~ ⚠️ **SUPERSEDED by D12 on 2026-08-06** | Original rationale (never fail on a call) still valid but Marko chose live. Kept for legibility | 2026-08-06 |
| ~~D3~~ | ~~Generate ~1 hero product per site~~ ⚠️ **SUPERSEDED by D12** | Live generation means no build-time budget; the constraint moved to per-click cost | 2026-08-06 |
| D4 | Persistent but visually QUIET "concept demo / not affiliated" disclosure | Legal + anti-phishing cover without undercutting the illusion | 2026-08-06 |
| D5 | ONE fixed, known shopper photo reused across all sites | Consistency + reviewability. Per-prospect face deferred | 2026-08-06 |
| D6 | UI plays the REAL generating-state animation over a canned result | "It should feel real" — perceived latency is part of the demo | 2026-08-06 |
| D7 | Mandatory QA gate before publish | See #41 — the failure mode that kills the machine at scale | 2026-08-06 |
| D8 | Upload modal ships with the shopper photo PRE-LOADED | Preserves the full narrative, zero live dependency, no deception. Answers "how does it know which page has the pre-generated thing" | 2026-08-06 |
| D9 | Every run appends one row to a tracking CSV — INCLUDING aborts | A silent failure is the thing the QA gate exists to prevent. Failures get louder treatment, not quieter | 2026-08-06 |
| D10 | `qa_verdict` is a column AND it gates publishing | pass → publish · near-miss → publish + flags · abort → row written, nothing published | 2026-08-06 |
| D12 | **Try-on generated LIVE, per click, via a server-side proxy.** Nothing pre-baked | Marko, 2026-08-06. Reverses D2. The demo shows the real product doing the real thing. Measured latency ~16s, not the ~60s assumed — which is what makes it viable | 2026-08-06 |
| D13 | Muse credentials NEVER reach the browser. The page calls `/api/tryon` on its own origin; the server holds the key | A demo mailed to 40 boutiques with the app key + Pro override in source hands anyone a permanent Muse Pro bypass | 2026-08-06 |
| D14 | Each retailer gets a `brand.json` style profile — the reusable context artifact the skill will emit | Separates *what we learned about this brand* from *the page we built*, so a second page (or a rebuild) never re-derives it | 2026-08-06 |
| D15 | **Optimise perceived speed WITHOUT speculative generation.** Memoise every look the user requested; never generate a garment they did not select | Corrected 2026-08-06 after Marko caught it. The first v3 build pre-styled the whole rail in the background — 8 calls on page open whether or not anything was clicked. That is pre-generation with extra steps and it violates D12 ("nothing pre-baked"). Caching requested work is fine; speculating is not | 2026-08-06 |
| D15a | **Cost controls are not mine to loosen.** The per-IP cap stays at 12/10min unless Marko changes it | The same build quietly raised it 12→30 to make room for the prefetch. Reverted | 2026-08-06 |
| D16 | **Fitting-room language, never machine language.** "Preparing your fitting" / "Styling your look", no percentages, no progress bars | "Processing / Rendering / Generating" is what makes a thing read as an AI demo. Also dropped the ✦ sparkle from the reference — a sparkle is the universal AI tell and Barcelino would never ship one | 2026-08-06 |
| D17 | The studio lives INSIDE the retailer's own page, opened by exactly one new nav item | Brief: do not redesign the site. An invented hero page (built in v2) was a redesign and was removed | 2026-08-06 |
| D21 | **Upload step between consent and the studio** — editorial artwork as the emotional centrepiece, one primary action | The moment should read as arriving at a private fitting, not as picking a file. Artwork occupies the larger half; every part is a discrete layer (artwork, dim, mark, title, rule, copy, CTA, spinner, assurances, close) so any one can be restyled without touching the others | 2026-08-07 |
| D22 | **"Continue with a sample photograph" escape hatch** on the upload step | Not in the brief; added deliberately. In a live pitch a boutique owner often will not upload their own face, and without this the demo dead-ends at the one screen that must never dead-end. Styled as a quiet secondary so it never competes with the primary action | 2026-08-07 |
| D19 | **Consent gate before the studio**, asked once per session, dismissing straight into the fitting | Mirrors the reference's pre-try-on privacy step. Uses the same centred-modal-over-blurred-storefront language so it reads as step one of one flow, not a second application. Session-scoped (not permanent) so the demo is re-showable on a fresh tab when presenting | 2026-08-07 |
| D20 | **Policy links in demos are inert placeholders, never fabricated legal documents in the retailer's name** | A real-looking Privacy Policy or Terms of Use under Barcelino's name is the one part of this that could actually cause them a problem. Links are dotted, `cursor:not-allowed`, titled "Placeholder — not active", with a line under the checkboxes saying so | 2026-08-07 |
| D18 | **No before/after in the landing hero.** The hero sells the aspiration, not the technology | 2026-08-07. Side-by-side is a beauty-app pattern — it exists because makeup *changes your appearance*. Fashion is different: the first reaction should be "I want to wear that", and only later "that could be me". Supersedes the earlier landing brief's "elegant side-by-side demonstration". See [[HERO-IMAGE-METHOD]] | 2026-08-07 |
| D11 | Product images passed to try-on as base64 `data:` URLs, not remote URLs | The Muse backend accepts data URLs and would otherwise SILENTLY skip hotlink-blocked images, producing a plausible-but-wrong garment. See TRYON-INTEGRATION.md | 2026-08-06 |

## Problem map
Triage key: EXAMPLE = visible in one output · CONTRACT = property across runs ·
TRIGGER = about the human · NON-GOAL = real problem, different machine.
Value drivers: DO=Dream Outcome · LOA=Likelihood of Achievement · TD=Time Delay · ES=Effort/Sacrifice

### Phase 1 — Target, input, extraction
| # | Obstacle | Driver | Triage | Resolution |
|---|----------|--------|--------|-----------|
| 1 | Which boutiques are worth doing | DO | NON-GOAL | List-building is a separate machine |
| 2 | Shopify / Squarespace / Wix / custom scrape differently | LOA | CONTRACT | Platform-agnostic extraction; detect + adapt |
| 3 | Cloudflare / bot-block returns nothing | LOA | CONTRACT | Clean abort with stated reason. Never a partial site |
| 4 | Hotlink-protected images 404 on the clone | LOA | CONTRACT | All assets downloaded + served locally. Never hotlink. See also D11 |
| 5 | Editorial lookbooks, not flat garment shots | LOA | EXAMPLE | Feeds QA gate: unusable source → skip that product |
| 6 | Brochure site, no catalog at all (common in luxury) | LOA | EXAMPLE | ABORT per D1, `abort_reason: no_catalog` |
| 7 | 5,000 SKUs — which to include | ES | CONTRACT | Deterministic hero-product selection rule |
| 8 | Menswear / womenswear / both | ES | CONTRACT | Detect; drives shopper-photo choice |
| 9 | Licensed webfonts can't legally be served | LOA | CONTRACT | Nearest free substitute, substitution LOGGED not hidden |
| 10 | Logo is inline SVG / raster / wordmark-in-font | ES | CONTRACT | Try in that order; fail loud if none |
| 11 | Palette: CSS vars vs computed from screenshot | ES | CONTRACT | Prefer declared tokens; fall back to extraction |
| 12 | FireCrawl credits burn per site x 40/wk | TD | CONTRACT | Hard page budget per run |
| 13 | No hosted URL to send | DO | CONTRACT | Run ends at a live link or the run did not happen |

### Phase 2 — Generation
| # | Obstacle | Driver | Triage | Resolution |
|---|----------|--------|--------|-----------|
| 14 | It LOOKS AI-generated (generic Tailwind tells) | LOA | EXAMPLE+CONTRACT | Highest-severity failure. Instant credibility death |
| 15 | Layout mismatch vs their real PDP | LOA | EXAMPLE | Mirror observed structure, don't impose a template |
| 16 | Try-on composite looks BAD | LOA | EXAMPLE (abort) | Worse than no demo. QA gate must catch |
| 17 | 30s dead air while generating | TD | EXAMPLE | Solved by D2+D6 |
| 18 | Try-on API cost per generation | TD | CONTRACT | Bounded by D3 |
| 19 | Canned vs live | LOA | RESOLVED | D2 |
| 20 | Canned = dishonest? Live = fails on call? | LOA | CONTRACT | D4 + D8 resolve the honesty question |
| 21 | Whose face is the shopper | ES | RESOLVED | D5; per-prospect variant deferred |
| 22 | Hosting their logo/photos/copy on our domain | LOA | CONTRACT | D4 + one-command takedown (#38) |
| 23 | A brand clone on a foreign domain IS the phishing silhouette | LOA | CONTRACT (hard) | noindex; checkout/account inert; disclosure; takedown |
| 24 | Must read as demo, never as knockoff | DO | EXAMPLE+CONTRACT | D4 |
| 25 | Half-broken clone: missing images, dead nav | LOA | CONTRACT | Verify before publish (#41) |
| 26 | Mobile — owners read cold email on phones | LOA | EXAMPLE | Mobile is a first-class check, not an afterthought |
| 27 | 4hrs/site != 40/week | TD | CONTRACT | Wall-clock budget per run |
| 28 | Same URL twice → two different sites | LOA | CONTRACT | Re-runs must be stable enough to iterate on |
| 29 | Model drift degrades output in 6 months | LOA | CONTRACT | QA gate is the drift detector |

### Phase 3 — Send & aftermath
| # | Obstacle | Driver | Triage | Resolution |
|---|----------|--------|--------|-----------|
| 30 | Subject line / outreach copy | DO | NON-GOAL | Separate skill |
| 31 | Hand-recording each demo doesn't scale | TD | CONTRACT | Minimum: shareable link + auto screenshots |
| 32 | Link rot before they open it | LOA | CONTRACT | Durable hosting |
| 33 | No open-tracking | DO | NON-GOAL (v1) | |
| 34 | Demo writes a check the product can't cash | LOA | TRIGGER | Know the real integration timeline BEFORE sending |
| 35 | "Just build my whole site" — seductive, wrong business | DO | TRIGGER | Decide the answer before it's asked |
| 36 | Forwarded to their agency: "we can do that" | LOA | NON-GOAL | Positioning problem, not a build problem |
| 37 | Cost per demo x 40/week | ES | CONTRACT | Track actual spend per run |
| 38 | Brand takedown request | LOA | CONTRACT | One command, fully unpublished |
| 39 | Double-sending the same boutique | ES | TRIGGER | Local ledger of generated sites (the CSV) |
| 40 | Demo #40 is worse than #1 and nobody notices | LOA | CONTRACT | #41 |
| 41 | **Nothing catches a bad generation before it ships** | LOA | CONTRACT (D7) | Raised by Marko. THE scale-killer. Pre-generation FREEZES the bad frame in permanently |
| 42 | **A run that fails must still be visible** | DO | CONTRACT (D9) | Aborts write a CSV row. Silence is the enemy |
| 43 | **Live generation would leak the Muse app key + Pro override into page source** | LOA | CONTRACT (D13) | Surfaced by the v2 live decision. Would hand out free Muse Pro to anyone with devtools |
| 44 | Live means cost per VISITOR, not per build — a demo left open is a drain | ES | CONTRACT | Per-IP rate limit in the proxy (12 / 10 min). Revisit before any public link |
| 45 | Generations return ~9:16 portrait; a landscape stage crops away either the face or the garment | LOA | EXAMPLE | Show the full frame matted on cream. Never crop the product out of a product demo |
| 46 | The demo is no longer a static file — it needs a running server | TD | CONTRACT | Changes hosting (OQ3): needs a serverless function, not a static bucket |
| 47 | A ~16s model cannot feel "nearly instantaneous" on its own | TD | CONTRACT (D15) | Partly solved by memoising requested looks + same-frame feedback. NOT solved by speculative generation — that trades the user's money for the illusion. First swap to a new garment is genuinely ~16s and that is honest |
| 50 | **An optimisation can silently reintroduce a rejected decision** | LOA | TRIGGER | "Background prefetch" was pre-generation renamed. Before adding any speed trick, ask: does this spend a call the user did not ask for? |
| 53 | A demo that requires the prospect to upload their own face can stall at the worst moment | DO | TRIGGER (D22) | The sample-photo path keeps the pitch moving. Watch whether prospects actually use it — if they always do, the upload step is friction rather than theatre |
| 52 | **A shared controller can be shipped without the DOM it binds** | LOA | CONTRACT | `build_landing.py` extracted markup from the studio marker onward, so adding the consent block *above* it shipped the landing page a controller that bound `#c1` — throwing and killing the whole try-on on that page. Extraction now starts at the consent marker. When one page is composed from another, the extraction boundary is a real interface: widen it when you add markup above it |
| 48 | Generated looks read as "AI artwork" rather than campaign photography | LOA | CONTRACT | Fixed in the PROMPT, not the UI: a house-style editorial brief (lighting, drape, tailoring, identity) lives in `serve.py` as EDITORIAL_NOTES |
| 49 | Portrait generations sit in a landscape well, leaving a wide cream mat | ES | EXAMPLE | **SOLVED 2026-08-07.** The try-on model returns 768x1376 portrait regardless of what the prompt asks for — aspect is not promptable. Instead of cropping, the same frame is blurred, scaled and used as an ambient backdrop with the untouched portrait composited over it. Frame reads full-bleed and wide; nothing is cropped away |
| 51 | A tab bar with no product behind it is decoration | DO | CONTRACT | The reference wants 7 categories. Rather than fake them, the catalog was widened to 19 real products across jackets / blazers / knitwear / shirts / trousers / leather. Never ship a tab that opens onto nothing |

## Output contract (v1)
Every run produces exactly two things:
1. **A demo site** — static, self-contained, published at a durable URL (unless aborted).
2. **One row appended to `demos.csv`** — always, including aborts.

### `demos.csv` schema
| column | notes |
|--------|-------|
| `run_date` | ISO date |
| `brand` | e.g. Barcelino |
| `source_url` | scraped origin |
| `demo_url` | blank if aborted |
| `platform` | shopify / squarespace / wix / custom |
| `products_found` | integer |
| `hero_product` | product used for the try-on |
| `qa_verdict` | **pass · near-miss · abort** |
| `qa_flags` | `;`-separated, e.g. `font_substituted;palette_low_confidence` |
| `abort_reason` | blank unless abort |
| `tryon_status` | ok · stub · failed |
| `cost_usd` | actual spend |
| `wall_clock_min` | integer |
| `sent` | manual, filled by Marko |
| `notes` | manual |

Canonical format is CSV in-repo: git-diffable, portable, opens in Numbers/Sheets,
readable by a fresh agent with no credentials.

### QA gate criteria
**ABORT — never publish:**
- No catalog found (#6)
- Try-on composite is anatomically broken, garment-mismatched, or identity-destroyed (#16)
- Brand logo could not be extracted by any method (#10)
- >30% of product images failed to localize (#4, #25)
- Nav or PDP renders broken on mobile (#26)

**NEAR-MISS — publish, flag in CSV, surface to Marko:**
- Font substituted for a licensed webface (#9)
- Fewer than ~6 products found (thin but usable)
- Palette extracted from screenshot rather than declared tokens (#11)
- Try-on is good but not great — plausible, on-model, right garment, slightly off lighting

**Escalation rule (Marko, 2026-08-06):** if output is not perfect but is very close,
ASK rather than loop. Do not burn tokens iterating on details a human would miss.

## Declared non-goals (v1)
Target-list building (#1) · outreach copy (#30) · open tracking (#33) · agency-objection
positioning (#36). Real problems. Deliberately out of scope. Not to be smuggled in later
without a decision recorded here.

## Open questions
- **OQ1 — RESOLVED.** Try-on generation = `POST /api/outfits/tryon` on `0xmcc/muse-backend`.
  See `TRYON-INTEGRATION.md`.
- **OQ2 — RESOLVED 2026-08-06.** `MUSE_API_BASE` + `APP_API_KEY` + `DEV_PRO_OVERRIDE_KEY`
  read from `0xmcc/muse-mobile` `eas.json`, stored in `.env` (chmod 600, gitignored).
  Verified end to end against the live backend. See TRYON-INTEGRATION.md.
- **OQ3 — OPEN, and now harder.** Where demos get hosted. D12 means these are no longer
  static pages: each needs a server-side `/api/tryon` holding the credentials (#46).
  `scripts/serve.py` is the local dev version and maps 1:1 onto a Vercel/Cloudflare
  function — keep the request shape identical so the front end doesn't change.
  Also unresolved: per-visitor spend on a public link (#44).
- **OQ5 — OPEN.** Hero imagery is currently a stock editorial model, not the shopper.
  It sells the brand well but no longer demonstrates the product; the proof now lives
  entirely in the step walkthrough. Decide whether that split is right before this goes
  out, and whether each retailer's demo needs its own hero shot.
- **OQ4 — RESOLVED 2026-08-06.** Shopper photo is Marko's Twitter avatar, cropped to a
  3:4 portrait to exclude the dog, at `sites/<brand>/assets/shopper.jpg`.
  ⚠ Known limitation: it is a head-and-shoulders selfie with no torso, so the model must
  invent the entire body below the chest. It produced a good result for Barcelino, but a
  clean full-length photo would be more reliable across many sites. Revisit if try-on
  quality varies. See [[D5]].
