#!/usr/bin/env python3
"""
Pre-generate a virtual try-on frame via the Muse backend.

This is the ONE seam between this project and Muse. Everything Muse-specific lives
here so the provider can be swapped without touching the site generator.

Contract and the silent-failure trap are documented in docs/TRYON-INTEGRATION.md.
Read it before changing anything below, especially the data-URL handling (D11).

Usage:
    python3 scripts/generate_tryon.py \
        --person sites/barcelino/assets/shopper.jpg \
        --garment sites/barcelino/assets/products/hero-1.jpg \
        --name "Beige Blue Silk Jacket | Men's" \
        --category Jacket \
        --out sites/barcelino/assets/tryon.png

Credentials are read from .env at the repo root (gitignored, chmod 600):
    MUSE_API_BASE, APP_API_KEY, DEV_PRO_OVERRIDE_KEY
"""
import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The Pro gate on /api/outfits/tryon reads this header name (DEV_PRO_OVERRIDE_HEADER
# in muse-backend/src/types.ts).
PRO_OVERRIDE_HEADER = "x-dev-pro-override-key"

# The consent gate on /api/outfits/* reads this header name
# (DEMO_CONSENT_HEADER in muse-backend/src/types.ts). The demo shows its own
# consent screen before any upload; this carries that attestation, because a
# storefront visitor has no Muse account to bind consent to.
DEMO_CONSENT_HEADER = "x-demo-consent-key"

# Opt-in echo of the assembled prompt (see the tryon route in muse-backend).
INCLUDE_PROMPT_HEADER = "x-include-prompt"

# Authority to replace the prompt outright, and to read it back. Deliberately
# separate from APP_API_KEY: that key ships inside the mobile app and can be
# extracted, so it must not be enough to strip the identity rules out of a
# generation. The backend ignores both the template and the echo without this.
PROMPT_OVERRIDE_HEADER = "x-prompt-override-key"


def load_env(path=None):
    """Minimal .env reader. Env vars already set take precedence."""
    path = path or os.path.join(REPO, ".env")
    env = {}
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("MUSE_API_BASE", "APP_API_KEY", "DEV_PRO_OVERRIDE_KEY",
              "DEMO_CONSENT_KEY", "PROMPT_OVERRIDE_KEY"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def to_data_url(path):
    """Read an image as a base64 data URL.

    D11 — this is load-bearing, not a convenience. The backend fetches remote
    imageUrls over the network and returns null SILENTLY on failure, after which
    it instructs the model to infer the garment from its NAME. A boutique CDN
    that blocks us therefore yields a confident, wrong garment rather than an
    error. Data URLs take a separate code path with no network call, so that
    failure mode becomes unreachable.
    """
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    with open(path, "rb") as f:
        return f"data:{mime};base64,{base64.b64encode(f.read()).decode()}"


def generate_tryon(person_path, garment_path, garment_name, category="", notes="",
                   template=None, env=None):
    """Return PNG/JPEG bytes of the try-on composite. Raises RuntimeError on failure."""
    env = env or load_env()
    missing = [k for k in ("MUSE_API_BASE", "APP_API_KEY") if not env.get(k)]
    if missing:
        raise RuntimeError(f"Missing credentials: {', '.join(missing)} (see .env)")

    body = json.dumps({
        "selfieDataUrl": to_data_url(person_path),
        "items": [{
            "name": garment_name,
            "category": category,
            "imageUrl": to_data_url(garment_path),   # D11: data URL, never a remote URL
        }],
        "notes": notes,
        # A full prompt authored in the studio, replacing the backend's own
        # assembly. Omitted entirely when absent, so the default path is
        # byte-identical to before.
        **({"promptTemplate": template} if template else {}),
    }).encode()

    headers = {
        "content-type": "application/json",
        "x-app-key": env["APP_API_KEY"],
        # Ask the backend to echo the prompt it assembled. The studio shows the
        # real thing rather than the `notes` fragment sent from here, and
        # reconstructing the rest locally would drift the moment the backend
        # changed. Opt-in header, so app traffic is unaffected.
        INCLUDE_PROMPT_HEADER: "1",
    }
    if env.get("PROMPT_OVERRIDE_KEY"):
        headers[PROMPT_OVERRIDE_HEADER] = env["PROMPT_OVERRIDE_KEY"]
    if env.get("DEV_PRO_OVERRIDE_KEY"):
        headers[PRO_OVERRIDE_HEADER] = env["DEV_PRO_OVERRIDE_KEY"]
    if env.get("DEMO_CONSENT_KEY"):
        headers[DEMO_CONSENT_HEADER] = env["DEMO_CONSENT_KEY"]

    url = env["MUSE_API_BASE"].rstrip("/") + "/api/outfits/tryon"
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            payload = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read()[:300].decode('utf-8', 'ignore')}")

    data = payload.get("data") or {}
    data_url = data.get("imageUrl")
    if not data_url or "base64," not in data_url:
        raise RuntimeError(f"No image in response: {str(payload)[:300]}")
    img = base64.b64decode(data_url.split("base64,", 1)[1])
    # Also returns the prompt the backend actually sent, and the same prompt
    # with its per-request slots left open — the starting point for an edit.
    # Both are None on a deployment that predates the echo.
    return img, data.get("prompt"), data.get("promptTemplate")


def main():
    ap = argparse.ArgumentParser(description="Pre-generate a Muse try-on frame.")
    ap.add_argument("--person", required=True, help="shopper photo (D5: one fixed image)")
    ap.add_argument("--garment", required=True, help="product photo, used locally then inlined")
    ap.add_argument("--name", required=True, help="garment name as shown on the PDP")
    ap.add_argument("--category", default="")
    ap.add_argument("--notes", default="")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    try:
        img, _prompt, _tpl = generate_tryon(a.person, a.garment, a.name, a.category, a.notes)
    except Exception as e:
        # Fail loudly and write nothing. A missing frame renders an honest
        # "TRY-ON FRAME PENDING" placeholder; a wrong frame ships forever (#41).
        print(f"tryon_status: failed\n{e}", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "wb") as f:
        f.write(img)
    print(f"tryon_status: ok\nwrote {a.out} ({len(img)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
