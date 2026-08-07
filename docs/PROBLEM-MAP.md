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
| D2 | Try-on results PRE-GENERATED at build time, not live | Weapon must never fail while a prospect watches. Live gen is the product; canned is the demo | 2026-08-06 |
| D3 | Generate for ~1 hero product per site, not the catalog | Cost + wall-clock. It's a demo, not a migration | 2026-08-06 |
| D4 | Persistent but visually QUIET "concept demo / not affiliated" disclosure | Legal + anti-phishing cover without undercutting the illusion | 2026-08-06 |
| D5 | ONE fixed, known shopper photo reused across all sites | Consistency + reviewability. Per-prospect face deferred | 2026-08-06 |
| D6 | UI plays the REAL generating-state animation over a canned result | "It should feel real" — perceived latency is part of the demo | 2026-08-06 |
| D7 | Mandatory QA gate before publish | See #41 — the failure mode that kills the machine at scale | 2026-08-06 |
| D8 | Upload modal ships with the shopper photo PRE-LOADED | Preserves the full narrative, zero live dependency, no deception. Answers "how does it know which page has the pre-generated thing" | 2026-08-06 |
| D9 | Every run appends one row to a tracking CSV — INCLUDING aborts | A silent failure is the thing the QA gate exists to prevent. Failures get louder treatment, not quieter | 2026-08-06 |
| D10 | `qa_verdict` is a column AND it gates publishing | pass → publish · near-miss → publish + flags · abort → row written, nothing published | 2026-08-06 |
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
- **OQ3 — OPEN.** Where demos get hosted (#13, #32, #38 all depend on this).
- **OQ4 — RESOLVED 2026-08-06.** Shopper photo is Marko's Twitter avatar, cropped to a
  3:4 portrait to exclude the dog, at `sites/<brand>/assets/shopper.jpg`.
  ⚠ Known limitation: it is a head-and-shoulders selfie with no torso, so the model must
  invent the entire body below the chest. It produced a good result for Barcelino, but a
  clean full-length photo would be more reliable across many sites. Revisit if try-on
  quality varies. See [[D5]].
