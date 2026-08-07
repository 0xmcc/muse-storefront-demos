#!/usr/bin/env python3
"""
Dev server + try-on proxy for a demo site.

Why a proxy exists at all (D12): the demo generates try-on LIVE. The Muse route
needs `x-app-key` and a Pro-override header. Those must never reach the browser —
a demo page mailed to 40 boutiques with those keys in source hands anyone a
permanent Muse Pro bypass. So the page calls /api/tryon here, and this process
holds the credentials.

    python3 scripts/serve.py --brand barcelino [--port 8765]

Endpoints:
    GET  /*            static files from sites/<brand>/
    POST /api/tryon    {personDataUrl?, garment: "assets/catalog/x.jpg", name, category?}
                    -> {"imageUrl": "data:image/png;base64,..."}

Deploying: this maps 1:1 onto a Vercel/Cloudflare function. Keep the same request
shape so the front end does not change when it moves.
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
from generate_tryon import generate_tryon, load_env, to_data_url  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Public demo, live generation, real money per call. Cap it per IP.
RATE_MAX = 12
RATE_WINDOW_S = 600
_hits = defaultdict(deque)
_lock = threading.Lock()


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


class Handler(SimpleHTTPRequestHandler):
    env = {}
    root = "."

    def translate_path(self, path):
        rel = path.split("?", 1)[0].split("#", 1)[0].lstrip("/")
        full = os.path.normpath(os.path.join(self.root, rel or "index.html"))
        # Never serve outside the site dir, and never serve the brand's raw config
        if not full.startswith(os.path.abspath(self.root)):
            return os.path.join(self.root, "index.html")
        return full

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/tryon":
            return self._json(404, {"error": "not found"})

        ip = self.client_address[0]
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

        gpath = os.path.normpath(os.path.join(self.root, garment))
        if not gpath.startswith(os.path.abspath(self.root)) or not os.path.exists(gpath):
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
            ppath = os.path.join(self.root, "assets", "shopper.jpg")
            if not os.path.exists(ppath):
                return self._json(500, {"error": "no shopper photo configured"})

        try:
            img = generate_tryon(
                ppath, gpath, name,
                category=req.get("category", ""),
                notes=req.get("notes", "Full-length editorial pose, clean neutral studio background."),
                env=self.env,
            )
        except Exception as e:
            sys.stderr.write(f"[tryon] {e}\n")
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

    def log_message(self, fmt, *a):
        if "/api/" in (a[0] if a else ""):
            sys.stderr.write("%s - %s\n" % (self.client_address[0], fmt % a))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brand", default="barcelino")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()

    root = os.path.abspath(os.path.join(REPO, "sites", a.brand))
    if not os.path.isdir(root):
        sys.exit(f"no such site: {root}")

    env = load_env()
    missing = [k for k in ("MUSE_API_BASE", "APP_API_KEY") if not env.get(k)]
    if missing:
        sys.stderr.write(f"WARNING: missing {', '.join(missing)} — /api/tryon will 502\n")

    Handler.env = env
    Handler.root = root
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"serving {a.brand} on http://localhost:{a.port}  (live try-on via /api/tryon)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
