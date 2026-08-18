#!/usr/bin/env python3
"""
Server + try-on proxy for the demo sites. Same process locally and in production.

Why a proxy exists at all (D12): the demo generates try-on LIVE. The Muse route
needs `x-app-key` and a Pro-override header. Those must never reach the browser —
a demo page mailed to 40 boutiques with those keys in source hands anyone a
permanent Muse Pro bypass. So the page calls `api/tryon` here, and this process
holds the credentials.

One process serves EVERY brand (D23). A boutique is a folder under `sites/`, not
a deployment — otherwise forty prospects means forty servers to run and forget.

    python3 scripts/serve.py [--port 8765] [--host 127.0.0.1]
    → http://localhost:8765/barcelino/

Endpoints:
    GET  /<brand>/             the brand's landing page — index.html unless its
                               brand.json declares {"demo": {"landing": "..."}}
    GET  /<brand>/*            static files from sites/<brand>/
    POST /<brand>/api/tryon    {personDataUrl?, garment: "assets/catalog/x.jpg", name, category?}
                            -> {"imageUrl": "data:image/png;base64,..."}

`/` is deliberately 404 and directory listings are off: a prospect must never be
able to browse the other boutiques we are pitching.

The request body and response shape are unchanged from the single-brand version,
so this still maps 1:1 onto a serverless function if hosting ever moves.
"""
import argparse
import json
import os
import sys
import threading
import time
from collections import defaultdict, deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate_tryon import generate_tryon, load_env  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITES = os.path.abspath(os.path.join(REPO, "sites"))

# Luxury campaign quality is a prompt problem, not a model problem. This is the
# house style every generated look is asked for, so results read as editorial
# photography rather than AI artwork.
EDITORIAL_NOTES = (
    "WIDE HORIZONTAL LANDSCAPE composition, 16:9 aspect. Luxury fashion campaign "
    "photography shot inside an upscale menswear boutique: warm wood and plaster, rails of "
    "garments softly out of focus behind, arched doorway, soft daylight from the side. "
    "Subject framed from mid-thigh up, standing three-quarter to camera, relaxed and "
    "confident, positioned centre of frame with the boutique interior visible either side. "
    "Shallow depth of field, natural skin tones, soft directional light. Fabric drapes with "
    "believable weight and tailoring; shoulder seams sit correctly; lapels roll rather than "
    "crease. Preserve the person's exact facial features, hair and complexion. Editorial and "
    "understated. No visible logos or text."
)

# Public demo, live generation, real money per call. Cap it per IP (#44).
# D15a: this cap is Marko's to change, not a build's.
RATE_MAX = 12
RATE_WINDOW_S = 600
_hits = defaultdict(deque)
_lock = threading.Lock()

# Behind a reverse proxy every request arrives from loopback, which would make the
# per-visitor cap a single global one. Trust x-forwarded-for ONLY from loopback,
# so a direct caller can never spoof its way around the cap.
LOOPBACK = {"127.0.0.1", "::1"}

# Returned by translate_path for anything off-limits. It cannot exist, so the
# stdlib handler answers 404 without us having to special-case send_head.
NO_SUCH_PATH = os.path.join(SITES, "__no_such_site__")


# ---------------------------------------------------------------- prompts --
#
# The wording sent with every generation, editable from the studio and kept as
# versions. Versions exist because "does this look more like me?" is a question
# you can only answer by comparing two, so saving never overwrites: it appends,
# and `active` is a pointer.
#
# Stored per brand, next to the site it belongs to, so a boutique stays a
# folder (D23). Guarded by STUDIO_KEY: this is a public demo with live
# generation behind it, and an open prompt box is an open cheque.

PROMPTS_FILE = "prompts.json"
STUDIO_HEADER = "x-studio-key"
_prompt_lock = threading.Lock()


def prompts_path(brand):
    root = site_root(brand)
    return os.path.join(root, PROMPTS_FILE) if root else None


def load_prompts(brand):
    """The brand's prompt store, seeded from the house style on first run.

    Seeding rather than starting empty matters: version one is then the exact
    wording the demo has been generating with all along, which is the baseline
    every later edit gets compared against.
    """
    path = prompts_path(brand)
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            store = json.load(fh)
        if store.get("versions"):
            return store
    except (OSError, ValueError):
        pass

    seed = {
        "id": new_version_id(),
        "label": "House editorial (built in)",
        "notes": EDITORIAL_NOTES,
        "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    store = {"active": seed["id"], "versions": [seed]}
    write_prompts(brand, store)
    return store


def new_version_id():
    import uuid
    return uuid.uuid4().hex[:12]


def write_prompts(brand, store):
    """Write through a temp file in the same directory, then rename.

    A half-written prompts.json would take the demo down on the next request,
    and rename is the only step that is atomic on POSIX.
    """
    path = prompts_path(brand)
    if not path:
        return
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(store, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, path)


def active_notes(brand):
    """The wording a generation should actually use."""
    store = load_prompts(brand)
    if not store:
        return EDITORIAL_NOTES
    for v in store["versions"]:
        if v["id"] == store.get("active"):
            return v["notes"]
    return EDITORIAL_NOTES


def rate_ok(ip):
    now = time.time()
    with _lock:
        q = _hits[ip]
        while q and now - q[0] > RATE_WINDOW_S:
            q.popleft()
        if len(q) >= RATE_MAX:
            return False
        q.append(now)
        return True


def split_path(path):
    """"/barcelino/assets/x.jpg" -> ("barcelino", "assets/x.jpg")."""
    clean = path.split("?", 1)[0].split("#", 1)[0]
    parts = [p for p in clean.split("/") if p]
    if not parts:
        return None, ""
    return parts[0], "/".join(parts[1:])


def site_root(brand):
    """Absolute path of sites/<brand>, or None if it isn't a real brand folder."""
    if not brand:
        return None
    root = os.path.abspath(os.path.join(SITES, brand))
    if os.path.dirname(root) != SITES or not os.path.isdir(root):
        return None
    return root


_landings = {}

def landing_page(brand):
    """Which file `/<brand>/` serves.

    Defaults to index.html — the clone of the retailer's own page, which is the
    right answer when the demo is "your site, plus one nav item". A brand whose
    demo link should open straight into the try-on instead declares it:

        "demo": { "landing": "virtual-try-on.html" }

    in its brand.json. Kept per-brand rather than hardcoded because one process
    serves every boutique (D23), and served directly rather than redirected so
    the link stays muse.fashion/<brand> — the short URL is the one that gets
    pasted into an email.
    """
    if brand in _landings:
        return _landings[brand]
    page = "index.html"
    root = site_root(brand)
    if root:
        try:
            with open(os.path.join(root, "brand.json"), encoding="utf-8") as fh:
                want = (json.load(fh).get("demo") or {}).get("landing")
            # Must be a plain filename that exists: never a path out of the site.
            if want and "/" not in want and ".." not in want \
                    and os.path.isfile(os.path.join(root, want)):
                page = want
        except (OSError, ValueError):
            pass
    _landings[brand] = page
    return page


class Handler(SimpleHTTPRequestHandler):
    env = {}

    def studio_authorized(self):
        """Does this request hold the studio key?

        False whenever STUDIO_KEY is unset, so a deployment that has not opted
        in cannot have an owner surface at all. Compared with compare_digest so
        a wrong key leaks nothing through timing.
        """
        import hmac
        want = self.env.get("STUDIO_KEY") or os.environ.get("STUDIO_KEY") or ""
        got = self.headers.get(STUDIO_HEADER) or ""
        return bool(want) and hmac.compare_digest(want, got)

    def client_ip(self):
        peer = self.client_address[0]
        if peer in LOOPBACK:
            first = self.headers.get("x-forwarded-for", "").split(",")[0].strip()
            if first:
                return first
        return peer

    def translate_path(self, path):
        brand, rest = split_path(path)
        root = site_root(brand)
        if root is None:
            return NO_SUCH_PATH
        full = os.path.normpath(os.path.join(root, rest or landing_page(brand)))
        if full != root and not full.startswith(root + os.sep):
            return NO_SUCH_PATH
        return full

    def list_directory(self, path):
        # Never expose an index of assets, and never of sites/.
        self.send_error(404)
        return None

    def do_GET(self):
        brand, rest = split_path(self.path)

        # The owner surface. 404 rather than 401 when unauthorised: a demo sent
        # to forty boutiques should not advertise that there is a door here.
        if rest == "api/prompt" and site_root(brand):
            if not self.studio_authorized():
                return self.send_error(404)
            with _prompt_lock:
                return self._json(200, load_prompts(brand))

        # "/barcelino" must become "/barcelino/", or every relative asset URL on
        # the page resolves one level too high and the site loads bare.
        if brand and not rest and site_root(brand):
            if not self.path.split("?", 1)[0].endswith("/"):
                self.send_response(301)
                self.send_header("location", "/%s/" % brand)
                self.end_headers()
                return
        super().do_GET()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        try:
            n = int(self.headers.get("content-length", 0))
            return json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return None

    def do_POST(self):
        brand, rest = split_path(self.path)
        root = site_root(brand)
        if root is None:
            return self._json(404, {"error": "not found"})

        if rest in ("api/prompt", "api/prompt/activate"):
            if not self.studio_authorized():
                return self.send_error(404)
            req = self._body()
            if req is None:
                return self._json(400, {"error": "bad json"})
            return (self._prompt_save(brand, req) if rest == "api/prompt"
                    else self._prompt_activate(brand, req))

        if rest != "api/tryon":
            return self._json(404, {"error": "not found"})

        ip = self.client_ip()
        if not rate_ok(ip):
            return self._json(429, {"error": "Too many try-ons from this address. Try again shortly."})

        try:
            n = int(self.headers.get("content-length", 0))
            req = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._json(400, {"error": "bad json"})

        garment = (req.get("garment") or "").lstrip("/")
        name = req.get("name") or ""
        if not garment or not name:
            return self._json(400, {"error": "garment and name are required"})

        # A caller-supplied prompt is an owner action, not a shopper one. This
        # used to be `notes=req.get("notes", EDITORIAL_NOTES)`, which let anyone
        # who found the endpoint spend real generation money on any wording they
        # liked. Refused before anything is generated, so an attempt costs
        # nothing. With the key, it is how you preview an edit before saving it.
        override = req.get("notes")
        if override is not None and not self.studio_authorized():
            return self._json(400, {"error": "notes is not accepted on this endpoint"})
        notes = override if override else active_notes(brand)

        gpath = os.path.normpath(os.path.join(root, garment))
        if not gpath.startswith(root + os.sep) or not os.path.exists(gpath):
            return self._json(400, {"error": "unknown garment"})

        # The shopper photo: either an uploaded data URL, or the site default (D5/D8).
        person = req.get("personDataUrl")
        tmp = None
        if person and person.startswith("data:"):
            import base64
            import tempfile
            head, _, b64 = person.partition("base64,")
            ext = ".png" if "png" in head else ".jpg"
            fd, tmp = tempfile.mkstemp(suffix=ext)
            with os.fdopen(fd, "wb") as f:
                f.write(base64.b64decode(b64))
            ppath = tmp
        else:
            ppath = os.path.join(root, "assets", "shopper.jpg")
            if not os.path.exists(ppath):
                return self._json(500, {"error": "no shopper photo configured"})

        try:
            img = generate_tryon(
                ppath, gpath, name,
                category=req.get("category", ""),
                notes=notes,
                env=self.env,
            )
        except Exception as e:
            sys.stderr.write(f"[tryon] {brand}: {e}\n")
            # Surface failure honestly. Never substitute a stand-in image (#41).
            return self._json(502, {"error": "Try-on generation failed. Please try again."})
        finally:
            if tmp:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass

        import base64 as b64mod
        return self._json(200, {"imageUrl": "data:image/png;base64," + b64mod.b64encode(img).decode()})

    def _prompt_save(self, brand, req):
        """Append a version. Never mutates an existing one — that is the point.

        The whole reason for versions is being able to go back to the wording
        that produced a better likeness, which an in-place edit destroys.
        """
        notes = (req.get("notes") or "").strip()
        if not notes:
            return self._json(400, {"error": "notes cannot be empty"})

        label = (req.get("label") or "").strip() or "Untitled"
        version = {
            "id": new_version_id(),
            "label": label[:120],
            "notes": notes,
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        # Read-modify-write under the lock, or two concurrent saves each write
        # a store built from the same snapshot and one of them vanishes.
        with _prompt_lock:
            store = load_prompts(brand)
            store["versions"].append(version)
            if req.get("activate"):
                store["active"] = version["id"]
            write_prompts(brand, store)
        return self._json(200, version)

    def _prompt_activate(self, brand, req):
        want = req.get("id")
        with _prompt_lock:
            store = load_prompts(brand)
            if not any(v["id"] == want for v in store["versions"]):
                return self._json(400, {"error": "no such version"})
            store["active"] = want
            write_prompts(brand, store)
        return self._json(200, {"active": want})

    def log_message(self, fmt, *a):
        """Static hits are noise; try-on calls and errors are not (#42).

        Must never assume the first arg is a string — the stdlib's error path
        logs an HTTPStatus, and an exception here kills the connection, turning
        every 404 into a dropped request.
        """
        line = fmt % a
        if "/api/" in line or line.startswith("code "):
            sys.stderr.write("%s - %s\n" % (self.client_ip(), line))


def main():
    global SITES, NO_SUCH_PATH
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1",
                    help="loopback by default; the reverse proxy is the only public face")
    ap.add_argument("--sites", default=SITES,
                    help="site tree to serve; the tests point this at a throwaway "
                         "copy so a run cannot rewrite the live prompt store")
    a = ap.parse_args()

    SITES = os.path.abspath(a.sites)
    NO_SUCH_PATH = os.path.join(SITES, "__no_such_site__")

    brands = sorted(d for d in os.listdir(SITES) if site_root(d))
    if not brands:
        sys.exit(f"no sites built yet under {SITES}")

    env = load_env()
    missing = [k for k in ("MUSE_API_BASE", "APP_API_KEY") if not env.get(k)]
    if missing:
        sys.stderr.write(f"WARNING: missing {', '.join(missing)} — try-on will 502\n")

    Handler.env = env
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"serving {len(brands)} site(s) on http://{a.host}:{a.port}/")
    for b in brands:
        print(f"  /{b}/")
    srv.serve_forever()


if __name__ == "__main__":
    main()
