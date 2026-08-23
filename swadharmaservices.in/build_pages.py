#!/usr/bin/env python3
"""
build_pages.py — assemble the public pages from one shell.

Why this exists
---------------
The rewire spec forbids duplicate navigation menus. On a static site that is a
maintenance problem, not a design one: eleven pages each carrying their own copy
of the TopNav is eleven places to forget. So the chrome lives once, in
``_layout/shell.html``, and each page contributes only its own body.

The generated ``*.html`` files ARE committed and ARE what Cloud Run serves. This
script is not a deploy step — run it after editing anything under ``_layout/``,
then commit the result. ``python build_pages.py --check`` fails if the committed
HTML is out of date, which is what CI should run.

    python build_pages.py           # rebuild every page
    python build_pages.py --check   # exit 1 if any page is stale

Page files live in ``_layout/pages/<name>.html`` and start with key: value front
matter, terminated by a line containing only ``---``:

    title:       Services · Swadharma Services
    description: ...
    h1:          ...
    route:       /services
    context:     services            # which SideNav, or "none"
    crumbs:      Services            # pipe-separated Label>/href pairs
    scripts:     page-services.js
    ---
    <body markup>
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
LAYOUT = ROOT / "_layout"
PAGES = LAYOUT / "pages"

# --------------------------------------------------------------------------
# Navigation. One definition, used for TopNav, the mobile drawer and the
# footer, so the three can never disagree about what the site contains.
# --------------------------------------------------------------------------

TOP_NAV = [
    ("Services", "/services"),
    ("Calendar", "/calendar"),
    ("Network", "/network"),
    ("Territories", "/territories"),
    ("Organisations", "/organisations"),
    ("How it Works", "/how-it-works"),
    ("About", "/about"),
]

FOOTER_LINKS = [
    ("Services", "/services"),
    ("Calendar", "/calendar"),
    ("Network", "/network"),
    ("Territories", "/territories"),
    ("Organisations", "/organisations"),
    ("How it works", "/how-it-works"),
    ("Service Manual", "/manual"),
    ("Sanskrit Classes", "/classes"),
    ("Enrol as a professional", "/enrol"),
    ("Sign in", "/signin"),
    ("About", "/about"),
    ("Privacy", "/privacy"),
    ("Policies", "/policies"),
]

# SideNav contexts. The services context is generated from catalogue.js so a new
# service appears in the rail without anyone editing this file.
SIDE_NAV = {
    "network": (
        "The Network",
        [
            ("Overview", "/network"),
            ("Professionals", "/network/professionals"),
            ("Temples & Organisations", "/network/temples"),
            ("Browse by territory", "/territories"),
        ],
        "Territory stays selected while you move between these pages.",
    ),
    "organisations": (
        "For Organisations",
        [
            ("Overview", "/organisations"),
            ("What you get", "/organisations#features"),
            ("Pricing", "/organisations#pricing"),
            ("Onboarding", "/organisations#onboarding"),
            ("Portal demo", "https://swadharma.dharmaposhanam.in"),
            ("Start subscription", "/signup"),
        ],
        "Each institution gets its own address — swadharma.yourdomain.",
    ),
}

SERVICES_NAV_HEAD = "Services"
SERVICES_NAV_NOTE = "Every service page carries a Start a Service Request action."


def catalogue_services() -> list[tuple[str, str]]:
    """Read slug/name pairs straight out of catalogue.js — single source."""
    text = (ROOT / "catalogue.js").read_text(encoding="utf-8")
    # Only the SW.CATALOGUE array, so SW.SUITE entries cannot leak in.
    start = text.index("SW.CATALOGUE")
    end = text.index("SW.ROLES")
    block = text[start:end]
    # The `includes` arrays carry their own `name:` keys, so pair each slug with
    # the FIRST name that follows it rather than zipping two flat lists.
    out = []
    for match in re.finditer(r'slug:\s*"([^"]+)"', block):
        tail = block[match.end():]
        name = re.search(r'name:\s*"([^"]+)"', tail)
        if not name:
            raise SystemExit(f"catalogue.js: service {match.group(1)} has no name")
        out.append((match.group(1), name.group(1)))
    if not out:
        raise SystemExit("catalogue.js: no services found in SW.CATALOGUE")
    return out


def build_side_nav(context: str) -> str:
    if context in ("none", "", None):
        return ""

    if context == "services":
        head = SERVICES_NAV_HEAD
        items = [("All services", "/services"), ("Calendar", "/calendar")] + [
            (name, "/services/" + slug) for slug, name in catalogue_services()
        ]
        note = SERVICES_NAV_NOTE
    else:
        head, items, note = SIDE_NAV[context]

    links = "\n".join(
        f'            <a href="{href}">{label}</a>' for label, href in items
    )
    note_html = f'\n        <p class="sw-side-note">{note}</p>' if note else ""
    return (
        '<aside class="sw-side">\n'
        '    <div class="sw-side-group">\n'
        f'        <h2>{head}</h2>\n'
        '        <div class="sw-side-inner">\n'
        f'{links}\n'
        '        </div>'
        f'{note_html}\n'
        '    </div>\n'
        '</aside>'
    )


def build_top_links() -> str:
    return "\n".join(
        f'        <a href="{href}">{label}</a>' for label, href in TOP_NAV
    )


def build_drawer_links() -> str:
    out = [f'        <a href="{href}">{label}</a>' for label, href in TOP_NAV]
    out.append('        <div class="sw-drawer-sep">Your account</div>')
    out.append('        <a href="/signin">Sign in</a>')
    out.append('        <a href="/enrol">Enrol as a professional</a>')
    out.append('        <a href="/signup">Subscribe an organisation</a>')
    out.append('        <div class="sw-drawer-sep">Reference</div>')
    out.append('        <a href="/manual">Service Manual</a>')
    out.append('        <a href="/classes">Sanskrit Classes</a>')
    out.append('        <a href="/privacy">Privacy</a>')
    out.append('        <a class="sw-cta" href="/request">Start a Service Request</a>')
    return "\n".join(out)


def build_footer_links() -> str:
    return "\n".join(
        f'        <a href="{href}">{label}</a>' for label, href in FOOTER_LINKS
    )


def build_crumbs(spec: str) -> str:
    """`Services>/services | Homa` -> a breadcrumb trail ending in plain text."""
    if not spec:
        return ""
    parts = [p.strip() for p in spec.split("|") if p.strip()]
    out = ['    <a href="/">Home</a>']
    for i, part in enumerate(parts):
        label, _, href = part.partition(">")
        label = label.strip()
        href = href.strip()
        out.append('    <span class="sep">/</span>')
        last = i == len(parts) - 1
        if href and not last:
            out.append(f'    <a href="{href}">{label}</a>')
        else:
            out.append(f'    <span aria-current="page">{label}</span>')
    return '<nav class="sw-crumbs" aria-label="Breadcrumb">\n' + "\n".join(out) + "\n</nav>"


FRONT_MATTER = re.compile(r"^(.*?)^---\s*$", re.S | re.M)

# `<!--! ... -->` is a note to whoever edits the page next. It is stripped at
# build time, so warnings that name customers, internal hosts or past incidents
# stay in the source and never reach anybody's View Source.
BUILD_ONLY_COMMENT = re.compile(r"[ \t]*<!--!.*?-->\n?", re.S)


def parse_page(path: Path) -> tuple[dict, str]:
    raw = path.read_text(encoding="utf-8")
    match = FRONT_MATTER.match(raw)
    if not match:
        raise SystemExit(f"{path.name}: missing front matter terminated by a --- line")
    meta = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    body = BUILD_ONLY_COMMENT.sub("", raw[match.end():]).lstrip("\n")
    return meta, body


def render(path: Path, shell: str) -> tuple[str, str]:
    meta, body = parse_page(path)
    context = meta.get("context", "none")
    side = build_side_nav(context)

    scripts = ""
    for name in [s.strip() for s in meta.get("scripts", "").split() if s.strip()]:
        scripts += f'<script src="/{name}"></script>\n'

    if side:
        main = (
            '<div class="sw-shell">\n'
            f"{side}\n"
            '<main class="sw-main" id="main">\n'
            f"{build_crumbs(meta.get('crumbs', ''))}\n"
            f"{body}"
            "</main>\n"
            "</div>"
        )
    else:
        main = f'<main id="main">\n{body}</main>'

    html = shell
    for key, value in {
        "TITLE": meta.get("title", "Swadharma Services"),
        "DESCRIPTION": meta.get("description", ""),
        "CANONICAL": "https://swadharmaservices.in" + meta.get("route", "/"),
        "BODYCLASS": meta.get("body_class", ""),
        "TOPLINKS": build_top_links(),
        "DRAWERLINKS": build_drawer_links(),
        "FOOTERLINKS": build_footer_links(),
        "MAIN": main,
        "SCRIPTS": scripts.rstrip("\n"),
    }.items():
        html = html.replace("{{" + key + "}}", value)

    leftover = re.search(r"\{\{([A-Z]+)\}\}", html)
    if leftover:
        raise SystemExit(f"{path.name}: unresolved placeholder {leftover.group(0)}")

    return meta.get("out", path.stem + ".html"), html


def main() -> int:
    check = "--check" in sys.argv
    shell = (LAYOUT / "shell.html").read_text(encoding="utf-8")

    stale, written = [], []
    for page in sorted(PAGES.glob("*.html")):
        name, html = render(page, shell)
        target = ROOT / name
        current = target.read_text(encoding="utf-8") if target.exists() else None
        if current == html:
            continue
        if check:
            stale.append(name)
        else:
            # newline="" keeps LF endings on Windows; Path.write_text only grew
            # a newline argument in 3.10 and this runs on 3.9.
            with open(target, "w", encoding="utf-8", newline="") as fh:
                fh.write(html)
            written.append(name)

    if check:
        if stale:
            print("Stale (run python build_pages.py): " + ", ".join(stale))
            return 1
        print("All pages up to date.")
        return 0

    print(f"Built {len(written)} page(s): " + (", ".join(written) if written else "nothing changed"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
