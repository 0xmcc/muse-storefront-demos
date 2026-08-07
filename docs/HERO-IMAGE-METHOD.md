# How the landing hero was made

Recovered 2026-08-07 from the ChatGPT thread "Virtual Try-On for Barcellino"
(`6a757bd9-e994-83e8-8189-3b4394246eba`, 36 messages).
Asset: `sites/barcelino/assets/landing/hero.jpg` (1774×887, 2:1).

This is a repeatable method, not a one-off. It is the thing to templatise when the
storefront-demo skill gets written.

---

## The loop

Three passes, each a separate ChatGPT turn, each asking for *the artefact* rather than
the answer:

| # | Ask | Produces |
|---|-----|----------|
| 1 | "what's the perfect way to articulate this feedback" | a precise creative brief from a vague reaction |
| 2 | "based on this feedback and the brand, what's the perfect image prompt" | art direction |
| 3 | "what's the perfect prompt to **only extract** the hero image" | the clean asset |

Locally these are the `/perfect-feedback` and `/perfect-prompt` commands
(`~/.claude/commands/`), both wrappers over `~/.claude/scripts/enhance-prompt.sh`. The
third pass has no local equivalent yet — see "Worth adding" below.

**Why three passes and not one.** Rough feedback ("this hero image doesn't fit the brand")
contains a real judgement but no usable direction. Pass 1 converts the judgement into
constraints. Pass 2 converts constraints into art direction. Pass 3 solves a *different*
problem — getting the model to emit an asset instead of a picture of a webpage. Collapsing
them loses the middle reasoning, which is where the actual insight lived.

---

## Pass 1 — the insight that changed the design

The rough input was just "i dont think this hero image fits the barcelino brand."

What came back was the load-bearing idea:

> The hero should sell **the aspiration**, not **the technology**.
> […] Someone landing on this page should first think *"I want to wear that."*
> Only afterward should they realize *"Wait… that's actually me."*

And a direct contradiction of the earlier brief:

> I would **not** use a side-by-side comparison in the hero at all. That's a pattern
> borrowed from beauty apps because the product *changes your appearance*. Fashion is
> different.

That is why the before/after composite was replaced. Recorded as **D18** in
`PROBLEM-MAP.md`. The earlier landing brief had explicitly asked for "an elegant
side-by-side demonstration" — this supersedes it, and the reasoning is why.

---

## Pass 2 — art direction, not composition

The prompt deliberately **does not** say what to compose:

> I actually wouldn't tell the model *what* to compose (split-screen, before/after, etc.).
> I'd describe the emotional outcome and the art direction. A strong image model will
> usually make much better composition decisions.

What it specifies instead:

- **Peer brands as the style anchor** — "should look like it belongs on the homepage of
  Brunello Cucinelli, Loro Piana, Zegna, Ralph Lauren Purple Label, or Kiton." Naming
  comparable houses transfers a whole visual grammar in one line; adjectives don't.
- **Light and material** — warm natural window light, shallow depth of field, premium
  wood / stone / linen / leather / brass.
- **Subject register** — "a real customer rather than a runway model. Relaxed. Confident.
  Effortlessly stylish." Not a pose description.
- **Negative space reserved for UI** — "leave generous negative space on one side of the
  frame… avoid placing important visual details where website UI would typically appear."
  This is why the CTA sits cleanly in the finished page.
- **An emotional acceptance test** — first reaction "I want that jacket", then "I want to
  look like him", then "wait, this lets me see myself like that."

---

## Pass 3 — extraction, which is the actual trick

Two earlier attempts failed by asking the model to "replace only the hero photography while
preserving the website pixel-for-pixel." That returns *a picture of a webpage* — unusable
as an asset.

The prompt that worked attaches the page screenshot **as reference only** and then does two
things:

**1. An exhaustive negative list.** Not "no UI" — every element named:

> Do not include: navigation, logo, buttons, text, CTA, browser chrome, page background,
> website layout, cards, shadows, typography, interface elements, borders, labels, overlays.

**2. A framing device that gives the output an identity:**

> Output **only** the underlying hero image, **as though it were the original campaign
> photograph before it was placed into the website.**

That second sentence is doing most of the work. It gives the model a coherent thing to
produce — a campaign photograph that pre-exists the page — rather than asking it to subtract
elements from a screenshot. Subtraction framing fails; identity framing succeeds.

Closing line, worth keeping:

> …an original editorial photograph that could be handed directly to a web designer and
> placed behind the landing page.

---

## Reusable checklist

For any retailer's hero:

1. State the rough reaction. Do not try to fix it yourself yet.
2. Convert it to a brief. Look for the sentence that reframes *what the image is for* —
   that is the output of this step, not a list of tweaks.
3. Write art direction: peer brands, light, material, subject register, reserved negative
   space, emotional acceptance test. **Do not dictate composition.**
4. Extract with: page screenshot as reference + exhaustive negative list + "as though it
   were the original campaign photograph before it was placed into the website."
5. Check the crop against the real slot before accepting it (see below).

---

## Integration notes for this asset

- Delivered 1774×887 (2:1). The hero slot is wider than 2:1 at most viewport widths, so
  `object-fit:cover` crops vertically. The subject's head sits near the top of the frame, so
  a centred crop decapitated him — `object-position:center 12%` fixes it.
  **Always verify the crop in situ; "leave negative space for UI" does not survive a
  cover crop you didn't check.**
- ChatGPT strips all metadata from generated images: no PNG text chunks, no EXIF, no XMP.
  **The prompt is not recoverable from the file.** It only exists in the thread, which is
  why this document exists.
- The momentum archive (`~/.momentum/archive.db`) is built from ChatGPT *exports* and lags
  until a sync is run. It was six days stale when this was first attempted.
- The previous before/after composite is preserved at
  `assets/landing/hero-before-after.jpg`.

---

## Worth adding

There is no local `/perfect-image-prompt` or `/perfect-extract` command. Passes 2 and 3
are the two highest-leverage steps here and both are currently manual. Both are the same
shape as the existing `enhance-prompt.sh` wrappers.
