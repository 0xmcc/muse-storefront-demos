# Muse Try-On Integration Contract

Created: 2026-08-06
Source of truth: `0xmcc/muse-backend` @ `src/routes/outfits.ts`, `src/middleware/`
Everything below was verified by reading the backend source, not inferred.
Read this before touching `generate_tryon()`.

## The endpoint

```
POST {MUSE_API_BASE}/api/outfits/tryon
```

### Request body
```jsonc
{
  "selfieDataUrl": "data:image/jpeg;base64,...",  // REQUIRED. Must be a data URL.
                                                   // Regex-validated: ^data:(.*?);base64,(.*)$
                                                   // A plain https:// URL is rejected with 400.
  "items": [                                       // REQUIRED. min 1, MAX 5.
    {
      "name": "Beige Blue Silk Jacket",            // required
      "category": "Jacket",                        // optional, defaults ""
      "imageUrl": "data:image/jpeg;base64,..."     // optional, defaults ""
    }
  ],
  "notes": "..."                                   // optional, defaults ""
                                                   // Appended to the prompt as
                                                   // "Extra styling notes"
}
```

### Response
```jsonc
// 200
{ "data": { "imageUrl": "data:image/png;base64,..." } }

// 400 — invalid JSON / invalid body / bad selfieDataUrl format
// 500 — server missing GOOGLE_API_KEY
// 502 — Gemini call failed, or returned no image part
{ "error": { "message": "..." } }
```

### Required headers
| header | value | why |
|--------|-------|-----|
| `content-type` | `application/json` | |
| `x-app-key` | `$APP_API_KEY` | `requireAppKey()`. Fails closed in production |
| *(pro gate)* | see below | `requirePro()` guards `/api/outfits/tryon` specifically |

### Getting past the Pro gate (server-to-server)
Our generator is not a RevenueCat subscriber. One of these is required:
1. `x-dev-pro-override` header (constant `DEV_PRO_OVERRIDE_HEADER` in `src/types.ts`)
   matching `env.DEV_PRO_OVERRIDE_KEY`. **Preferred** — scoped and revocable.
2. `REVENUECAT_GATE_DISABLED=1` on the server. Emergency escape hatch, global. Avoid.

Note: a hardcoded owner override constant also exists in `src/middleware/requirePro.ts`.
Do not depend on it; prefer the env-configured key.

### Rate limit
`/api/outfits/*` → 25 requests per 5 minutes.
Under D3 (one hero product per site) that is ~25 sites per 5 min. Not a constraint.

### Engine
Gemini 3 Pro Image Preview (`gemini-3-pro-image-preview:generateContent`), called
server-side with `GOOGLE_API_KEY`. The backend composes a MASTER_DIRECTIVE plus strict
product-fidelity rules (preserve garment type, color, material, texture, silhouette, fit,
cut, length, hems, pockets, seams, buttons, pleats, cuffs, logos). **We do not write
try-on prompt engineering ourselves** — that lives in the backend and improving it there
improves both products at once.

---

## ⚠ The trap — why D11 exists

`imageUrlToInlinePart()` fetches each `items[].imageUrl` with a 15s timeout and
**returns `null` on any failure — silently.** The backend then swaps in:

> "Product photos are unavailable; infer garment color, material, cut and details from the
> item names and categories."

The backend's own source comment names the cause:

> *"some item photos fail to fetch — e.g. retailer CDN hotlink/bot protection — and are
> silently skipped"*

**Consequence for this project.** Pass a boutique's remote CDN URL, have it block us, and
we get back a *plausible, attractive, confidently wrong* garment — not an error. Under D2
(pre-generation) that wrong image is frozen into the demo permanently and shipped to the
brand whose product it misrepresents. This is problem #41 with a live detonator.

**Mitigation (D11).** The same function has a `data:` branch that decodes inline with no
network call:

```ts
if (imageUrl.startsWith("data:")) { /* decode inline — cannot fail on network */ }
```

So: **download product images locally, base64 them, pass `data:` URLs.** This makes the
fetch-failure path unreachable and kills problem #4 at the try-on layer entirely.

**Belt and braces.** Even with data URLs, the QA gate must verify the returned composite
depicts *the intended garment*. Silent substitution has other causes (model drift,
prompt-following failure). Never treat a 200 as proof of correctness.

---

## Implementation shape

One module, one function, one seam:

```
generate_tryon(person_image_path, garment_image_path, garment_name, category?) -> PNG bytes
```

Internally: read both files → base64 → POST → decode `data.imageUrl` → return bytes.
Everything Muse-specific stays behind this boundary so the provider can be swapped
without touching the site generator.

## Blocked on (OQ2)
Neither credential exists on this machine as of 2026-08-06:
- `MUSE_API_BASE` — the deployed Railway URL. Not committed to the repo; lives in Railway
  config and the mobile app's EAS env.
- `APP_API_KEY` + `DEV_PRO_OVERRIDE_KEY` — for the deployed instance.
- *or* `GOOGLE_API_KEY` — to run `muse-backend` locally with `bun`, which also allows
  setting `REVENUECAT_GATE_DISABLED=1` freely.

Until one path is supplied, `generate_tryon()` writes a placeholder and the run records
`tryon_status: stub`. **The site generator does not block on this.**
