#!/usr/bin/env python3
"""
serve_local.py — preview the site the way Cloud Run serves it.

`python -m http.server` is not good enough here: it has no idea that
/services/homa is service.html or that /manual means manual.html, so every new
route 404s and the site looks broken when it is not.

    python serve_local.py          # http://localhost:8080
    python serve_local.py 9000

Routing mirrors nginx.conf. test_site.py checks the two against each other.
"""

from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent

EXACT = {
    "/network/professionals": "/network-professionals.html",
    "/network/temples": "/network-temples.html",
}
PREFIX = {
    "/services/": "/service.html",
    "/territories/": "/territories.html",
}


class Handler(SimpleHTTPRequestHandler):
    # Serving the source directory would expose _layout/ and the *.md notes the
    # Dockerfile deliberately leaves out. Refuse them, so a preview cannot give
    # a false sense that they are private.
    HIDDEN = ("_layout", ".md", ".py", ".mjs", "Dockerfile", "nginx.conf")

    def translate_path(self, path: str) -> str:
        clean = urlparse(path).path

        if clean == "/":
            return str(ROOT / "index.html")
        if clean in EXACT:
            return str(ROOT / EXACT[clean].lstrip("/"))
        for prefix, target in PREFIX.items():
            if clean.startswith(prefix):
                return str(ROOT / target.lstrip("/"))

        candidate = ROOT / clean.lstrip("/")
        if candidate.is_file():
            return str(candidate)
        with_html = ROOT / (clean.lstrip("/") + ".html")
        if with_html.is_file():
            return str(with_html)
        return str(candidate)

    def send_head(self):
        clean = urlparse(self.path).path
        if any(part in clean for part in self.HIDDEN):
            self.send_error(404, "Not served in production either")
            return None
        return super().send_head()

    def end_headers(self):
        # No caching locally, or an edit to app.js will not show up.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    print(f"swadharmaservices.in -> http://localhost:{port}  (Ctrl-C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
