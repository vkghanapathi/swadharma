#!/usr/bin/env python3
"""
test_site.py — static checks over the generated site.

Run before every deploy. It answers the questions a browser would:

  1. Does every generated page still match its source? (build_pages.py --check)
  2. Does every internal link resolve, THROUGH THE NGINX RULES, to a real file?
     A link that 404s is the failure mode this rewire is most exposed to, since
     the routes (/services/homa, /network/temples) are not filenames.
  3. Does every <script src> and stylesheet exist and get shipped by the
     Dockerfile?
  4. Is the markup balanced, and is every id a script reaches for present?

    python test_site.py
"""

from __future__ import annotations

import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).parent

# Routes nginx rewrites to a single file, mirroring nginx.conf. Kept here on
# purpose: if the two drift, this test is what notices.
PREFIX_ROUTES = {
    "/services/": "service.html",
    "/territories/": "territories.html",
}
EXACT_ROUTES = {
    "/network/professionals": "network-professionals.html",
    "/network/temples": "network-temples.html",
}

GENERATED = sorted(p.stem for p in (ROOT / "_layout" / "pages").glob("*.html"))

# Hand-written pages that predate the rewire. They keep their own layout, but
# their links must still resolve — that is exactly what broke when the old
# index anchors (#services, #pricing, #how) became routes.
LEGACY = ["manual", "enrol", "signup", "privacy", "classes", "policies", "credits", "edu", "demo"]

failures: list[str] = []
notes: list[str] = []


def fail(page: str, message: str) -> None:
    failures.append(f"{page}: {message}")


def resolve(href: str) -> Path | None:
    """Apply the nginx location rules to a site-absolute path."""
    path = href.split("?")[0].split("#")[0]
    if not path or path == "/":
        return ROOT / "index.html"

    if path in EXACT_ROUTES:
        return ROOT / EXACT_ROUTES[path]
    for prefix, target in PREFIX_ROUTES.items():
        if path.startswith(prefix):
            return ROOT / target

    # location / { try_files $uri $uri.html $uri/ }
    stripped = path.lstrip("/")
    for candidate in (ROOT / stripped, ROOT / (stripped + ".html")):
        if candidate.is_file():
            return candidate
    return None


class Scan(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.stack: list[str] = []
        self.imbalance: list[str] = []
        self.title_seen = False

    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"}

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get("id"):
            self.ids.add(d["id"])
        if tag == "a" and d.get("href"):
            self.links.append(d["href"])
        if tag == "script" and d.get("src"):
            self.assets.append(d["src"])
        if tag == "link" and d.get("rel") == "stylesheet" and d.get("href"):
            self.assets.append(d["href"])
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if not self.stack:
            self.imbalance.append(f"closing </{tag}> with nothing open")
            return
        if self.stack[-1] != tag:
            self.imbalance.append(f"</{tag}> closed while <{self.stack[-1]}> was open")
            return
        self.stack.pop()


def check_legacy_links() -> None:
    """Links and fragments on the hand-written pages must resolve too."""
    for stem in LEGACY:
        page = ROOT / f"{stem}.html"
        if not page.is_file():
            fail(stem, "legacy page listed but missing")
            continue

        scan = Scan()
        scan.feed(page.read_text(encoding="utf-8"))

        navs = page.read_text(encoding="utf-8").count("<nav")
        if navs > 1:
            fail(page.name, f"{navs} navigation menus — the spec allows one per page")

        for href in scan.links:
            if href.startswith(("http://", "https://", "mailto:", "tel:", "#")):
                continue
            if not href.startswith("/"):
                fail(page.name, f"relative link {href!r} — links must be site-absolute")
                continue
            if resolve(href) is None:
                fail(page.name, f"dead link {href!r}")


def check_fragments() -> None:
    """A link to /manual#professionals must land on an element that exists."""
    ids: dict[str, set[str]] = {}

    def ids_of(path: Path) -> set[str]:
        key = str(path)
        if key not in ids:
            scan = Scan()
            scan.feed(path.read_text(encoding="utf-8"))
            # Older pages anchor with <a name="..."> as well as id.
            extra = set(re.findall(r'<a[^>]+name="([^"]+)"', path.read_text(encoding="utf-8")))
            ids[key] = scan.ids | extra
        return ids[key]

    for stem in GENERATED + LEGACY:
        page = ROOT / f"{stem}.html"
        if not page.is_file():
            continue
        scan = Scan()
        scan.feed(page.read_text(encoding="utf-8"))

        for href in scan.links:
            if "#" not in href or href.startswith(("http://", "https://", "mailto:", "tel:")):
                continue
            path_part, _, fragment = href.partition("#")
            if not fragment:
                continue
            target = page if path_part in ("", ".") else resolve(path_part)
            if target is None or not target.is_file():
                continue  # the dead-link check already reported this
            # service.html renders its content from script, so its in-page
            # anchors cannot be seen statically.
            if target.name == "service.html":
                continue
            if fragment not in ids_of(target):
                fail(page.name, f"link {href!r} points at #{fragment}, which is not in {target.name}")


def check_pages() -> None:
    for stem in GENERATED:
        page = ROOT / f"{stem}.html"
        if not page.is_file():
            fail(stem, "generated file is missing — run python build_pages.py")
            continue

        html = page.read_text(encoding="utf-8")
        scan = Scan()
        scan.feed(html)

        if scan.stack:
            fail(page.name, f"unclosed tags: {', '.join(scan.stack)}")
        for problem in scan.imbalance:
            fail(page.name, problem)

        if "{{" in html:
            fail(page.name, "unresolved template placeholder")

        for href in scan.links:
            if href.startswith(("http://", "https://", "mailto:", "tel:", "#")):
                continue
            if not href.startswith("/"):
                fail(page.name, f"relative link {href!r} — links must be site-absolute")
                continue
            if resolve(href) is None:
                fail(page.name, f"dead link {href!r}")

        for src in scan.assets:
            if src.startswith(("http://", "https://")):
                continue
            asset = ROOT / src.lstrip("/")
            if not asset.is_file():
                fail(page.name, f"missing asset {src!r}")
            elif asset.suffix not in (".css", ".js"):
                fail(page.name, f"asset {src!r} is not shipped by the Dockerfile")

        # The TopNav, drawer and footer must appear exactly once each.
        for needle, label in (
            ('class="sw-top"', "TopNav"),
            ('id="swDrawer"', "mobile drawer"),
            ('class="sw-foot"', "footer"),
        ):
            if html.count(needle) != 1:
                fail(page.name, f"expected exactly one {label}, found {html.count(needle)}")

        if "<main" not in html:
            fail(page.name, "no <main> element")


def check_script_ids() -> None:
    """Every SW.el("x") a page script uses must exist in the page that loads it."""
    for stem in GENERATED:
        page = ROOT / f"{stem}.html"
        if not page.is_file():
            continue
        html = page.read_text(encoding="utf-8")
        scan = Scan()
        scan.feed(html)

        for src in re.findall(r'<script src="/(page-[a-z-]+\.js)">', html):
            script = ROOT / src
            if not script.is_file():
                continue
            body = script.read_text(encoding="utf-8")
            # Some ids are written by the script itself, into innerHTML, and are
            # legitimately absent from the static markup. Count those as present.
            made = set(re.findall(r'id=\\?"([A-Za-z0-9_]+)\\?"', body))
            for wanted in set(re.findall(r'SW\.el\("([A-Za-z0-9_]+)"\)', body)):
                if wanted not in scan.ids and wanted not in made:
                    fail(page.name, f"{src} reaches for #{wanted}, which nothing creates")


def check_build_fresh() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "build_pages.py"), "--check"],
        capture_output=True, text=True, cwd=ROOT,
    )
    if result.returncode != 0:
        failures.append("build: " + result.stdout.strip())


def check_panchanga() -> None:
    """The calendar data must exist, be shipped, and be internally consistent."""
    path = ROOT / "panchanga.data.js"
    if not path.is_file():
        failures.append("panchanga.data.js missing — run python _layout/build_panchanga.py")
        return

    import json

    # The file is `window.SW_PANCHANGA_DATA={...};` — strip the wrapper and
    # parse the payload, so this test reads exactly what the browser will.
    raw = path.read_text(encoding="utf-8")
    start = raw.index("{", raw.index("SW_PANCHANGA_DATA"))
    data = json.loads(raw[start:raw.rindex("}") + 1])
    days = data.get("days", {})
    if len(days) < 300:
        failures.append(f"panchanga.data.js holds only {len(days)} days; expected a full year")

    # 13 lunar months in this year, so each monthly observance should occur 13
    # times. Twelve means a kṣaya tithi silently dropped a month's programme —
    # the exact bug the second-tithi handling exists to prevent.
    counts: dict[str, int] = {}
    for day in days.values():
        for ob in day.get("ob", []):
            counts[ob["short"]] = counts.get(ob["short"], 0) + 1

    monthly = ["Amāvāsyā", "Pūrṇimā", "Saṅkaṣṭī", "Māsa Śivarātri",
               "Vināyaka Caturthī", "Ṣaṣṭhī", "Aṣṭamī"]
    for name in monthly:
        n = counts.get(name, 0)
        if n < 13:
            failures.append(
                f"panchanga.data.js: {name} occurs {n} times, expected 13 — a lunar month "
                "has lost its observance (check the kṣaya-tithi handling)"
            )

    # Every observance must point at a service that exists, or the calendar
    # links to a 404.
    catalogue = (ROOT / "catalogue.js").read_text(encoding="utf-8")
    block = catalogue[catalogue.index("SW.CATALOGUE"):catalogue.index("SW.ROLES")]
    slugs = set(re.findall(r'slug:\s*"([^"]+)"', block))
    for day in days.values():
        for ob in day.get("ob", []):
            if ob["service"] not in slugs:
                failures.append(
                    f"panchanga.data.js: observance {ob['short']!r} points at service "
                    f"{ob['service']!r}, which is not in the catalogue"
                )
                break

    # No published sunrise or sunset may be malformed or absurd. The source has
    # truncated cells and one row whose columns are shifted, so the build both
    # repairs and refuses; this is the check that it never publishes the result
    # of a bad repair. Windows are wide: the year's real values are 5:57-6:49
    # and 17:54-18:52.
    time_re = re.compile(r"^\d{1,2}\.\d{2}$")
    windows = {"sr": (5 * 60, 7 * 60 + 30), "ss": (17 * 60, 19 * 60 + 30)}
    for date, day in days.items():
        for field, (low, high) in windows.items():
            value = day.get(field)
            if value is None:
                continue
            if not time_re.match(value):
                failures.append(f"panchanga.data.js {date}: {field} {value!r} is malformed")
                continue
            hour, minute = value.split(".")
            got = int(hour) * 60 + int(minute)
            if not low <= got <= high:
                failures.append(
                    f"panchanga.data.js {date}: {field} {value!r} is not a plausible "
                    "time of day — a damaged source cell has been published"
                )

    notes.append(
        f"{len(days)} pañcāṅga days, {sum(counts.values())} observances, "
        f"{path.stat().st_size // 1024} KB"
    )


def check_dockerfile() -> None:
    docker = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    for pattern in ("*.html", "*.css", "*.js"):
        if f"COPY {pattern}" not in docker:
            failures.append(f"Dockerfile: does not COPY {pattern}")
    # Only actual COPY instructions count — the file warns about `COPY . .` in a
    # comment, and flagging that would be flagging the warning.
    for line in docker.splitlines():
        if line.strip().startswith("COPY") and re.match(r"COPY\s+\.\s+\.", line.strip()):
            failures.append("Dockerfile: a broad COPY would publish _layout/ and build_pages.py")


def check_upload_covers_image() -> None:
    """Every file the Dockerfile copies must survive .gcloudignore.

    These two are read by different tools at different moments and nothing
    connects them. Adding `COPY *.json` without adding the file to the
    allowlist means the upload omits it and `docker build` fails on a glob that
    matches nothing — after the source has already gone up. That happened once;
    this is why it will not happen twice.
    """
    import fnmatch

    docker = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    ignore = ROOT / ".gcloudignore"
    if not ignore.is_file():
        failures.append(".gcloudignore missing — the build context would include Edu/ and _layout/")
        return

    allowed = [
        line.strip()[1:]
        for line in ignore.read_text(encoding="utf-8").splitlines()
        if line.strip().startswith("!")
    ]

    copied = re.findall(r"^COPY\s+(\S+)\s+\S+", docker, re.M)
    for glob in copied:
        matches = sorted(p.name for p in ROOT.glob(glob) if p.is_file())
        if not matches:
            failures.append(
                f"Dockerfile: COPY {glob} matches no file — docker build fails on this"
            )
            continue
        for name in matches:
            if not any(fnmatch.fnmatch(name, rule) for rule in allowed):
                failures.append(
                    f".gcloudignore: {name} is copied by `COPY {glob}` but is not in the "
                    "allowlist, so it never reaches the build context"
                )

    notes.append(f"{len(copied)} Dockerfile COPY patterns, all reachable in the upload")


def check_nginx_matches_tests() -> None:
    conf = (ROOT / "nginx.conf").read_text(encoding="utf-8")

    # gzip without gzip_proxied is inert behind Cloud Run: it forwards with a
    # Via header, and nginx's default skips compression for proxied requests.
    # panchanga.json is 146 KB, so this is not a rounding error.
    if "gzip  " in conf or "gzip " in conf:
        if "gzip_proxied" not in conf:
            failures.append(
                "nginx.conf: gzip is on but gzip_proxied is not set — Cloud Run "
                "forwards with a Via header, so nothing would actually be compressed"
            )
        for kind in ("application/json", "application/javascript", "text/css"):
            if kind not in conf:
                failures.append(f"nginx.conf: gzip_types does not cover {kind}")

    for route, target in EXACT_ROUTES.items():
        if f"location = {route}" not in conf or target not in conf:
            failures.append(f"nginx.conf: no rule serving {route} from {target}")
    for prefix, target in PREFIX_ROUTES.items():
        if f"location ^~ {prefix}" not in conf or target not in conf:
            failures.append(f"nginx.conf: no rule serving {prefix}* from {target}")


def check_catalogue_reachable() -> None:
    """Every service in the catalogue must have a page that resolves."""
    catalogue = (ROOT / "catalogue.js").read_text(encoding="utf-8")
    block = catalogue[catalogue.index("SW.CATALOGUE"):catalogue.index("SW.ROLES")]
    slugs = re.findall(r'slug:\s*"([^"]+)"', block)
    if len(slugs) < 5:
        failures.append(f"catalogue.js: only {len(slugs)} services found, expected the full set")
    for slug in slugs:
        if resolve("/services/" + slug) is None:
            failures.append(f"catalogue.js: /services/{slug} does not resolve")
    notes.append(f"{len(slugs)} services in the catalogue, all routable")


def check_no_retired_vendor() -> None:
    """Vitta Fin was dropped for Swadharma Services on 2026-08-09. Saying the
       subscription runs through it would be telling institutions something
       untrue about where their money goes."""
    for stem in GENERATED:
        page = ROOT / f"{stem}.html"
        if page.is_file() and re.search(r"vitta", page.read_text(encoding="utf-8"), re.I):
            fail(page.name, "mentions Vitta Fin — retired for Swadharma Services (VKG 2026-08-09)")


def main() -> int:
    check_build_fresh()
    check_pages()
    check_legacy_links()
    check_fragments()
    check_script_ids()
    check_dockerfile()
    check_upload_covers_image()
    check_nginx_matches_tests()
    check_catalogue_reachable()
    check_panchanga()
    check_no_retired_vendor()

    for note in notes:
        print("  - " + note)

    if failures:
        print(f"\nFAILED - {len(failures)} problem(s):\n")
        for f in failures:
            print("  X " + f)
        return 1

    print(f"\nPASS - {len(GENERATED)} pages, links, assets, routes and catalogue all check out.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
