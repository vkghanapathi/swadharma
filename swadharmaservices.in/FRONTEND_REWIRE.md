# swadharmaservices.in — front-end architecture

How the public site is built, tested and deployed after the 2026-08-22 rewire.
Implements *Swadharma Frontend Architecture & UX Rewire Specification*.

The short version: **the pages are generated, the chrome lives in one file, and
nothing ships without `test_site.py` and `test_browser.mjs` passing.**

---

## Build, test, deploy

```bash
cd swadharmaservices.in

python build_pages.py            # regenerate the pages from _layout/
python test_site.py              # links, routes, assets, markup   (no deps)
node   test_browser.mjs          # every page in a real DOM        (needs jsdom)

gcloud run deploy swadharmaservices --source swadharmaservices.in \
  --project swadharma-service-management --region asia-south1 \
  --allow-unauthenticated --port 8080
```

`build_pages.py --check` exits 1 if a committed page is stale. That is the CI
gate: **the generated `*.html` are committed and are what Cloud Run serves**, so
a change to `_layout/` that was never rebuilt would deploy the old page.

`test_browser.mjs` needs jsdom, which is deliberately *not* installed here —
`node_modules` in the deploy source would be copied into no image, but it would
still clutter the tree and confuse `COPY *.js`. Install it anywhere and point at
it:

```bash
mkdir -p /tmp/swtest && cd /tmp/swtest && npm init -y && npm install jsdom
cd - && SW_JSDOM=/tmp/swtest/node_modules/jsdom/lib/api.js node test_browser.mjs
```

---

## Where things live

| File | What it is |
|---|---|
| `_layout/shell.html` | The one copy of TopNav, mobile drawer and footer |
| `_layout/pages/*.html` | Per-page front matter + body. **Edit these, not the root `*.html`** |
| `_layout/relink_legacy.py` | Points the hand-written pages at the new routes |
| `build_pages.py` | Assembles `_layout/` into the root `*.html` |
| `app.css` | The whole design system. Tokens lifted verbatim from the old page |
| `app.js` | AppShell, `SW.api`, `SW.territory`, `SW.cards`, `SW.Directory`, `SW.featured`, `SW.tree` |
| `catalogue.js` | The service catalogue, suite, territory seed, contact details |
| `page-*.js` | One per page, loaded only by that page |
| `test_site.py`, `test_browser.mjs` | The two suites |

Root `*.html` files fall into two sets:

* **Generated** — `index services service network network-professionals
  network-temples territories request organisations how-it-works about signin`.
  Never hand-edit; the next build overwrites you.
* **Hand-written, pre-rewire** — `manual enrol signup classes privacy policies
  credits edu demo`. These keep their own layout because they carry forms and
  payment flows. `relink_legacy.py` keeps their navigation and links honest.

---

## Routes

The site is flat files behind nginx. `nginx.conf` reconciles the two:

| Route | Served by |
|---|---|
| `/` | `index.html` |
| `/services` | `services.html` |
| `/services/<slug>` | `service.html` — **one file for all of them** |
| `/network` | `network.html` |
| `/network/professionals` | `network-professionals.html` |
| `/network/temples` | `network-temples.html` |
| `/territories`, `/territories/…` | `territories.html` |
| `/request` | `request.html` |
| `/organisations` | `organisations.html` |
| `/how-it-works` · `/about` · `/signin` | their own files |
| `/manual` `/enrol` `/signup` `/classes` `/privacy` `/policies` | `try_files $uri.html` |

`service.html` reads the slug off `location.pathname` and renders from
`catalogue.js`. **Adding a service needs no new file and no nginx change** — add
an entry to `SW.CATALOGUE`, run `build_pages.py` (the SideNav is generated from
it), and the route works. The cost is that its `<title>` and description are set
by script rather than in markup.

That route mapping exists in three places — `nginx.conf`, `test_site.py` and
`test_browser.mjs`. `test_site.py` checks the first two against each other, so a
change to one that misses the other fails the build rather than 404ing in
production.

---

## What is API-driven and what is not

Per spec §8, featured content and directory listings are never hard-coded.

**From the API** (`swadharma-api`, `/api/v1/directory/{professionals,organisations}`):
professionals, organisations, the featured rails, the territory tree and every
count on `/territories`. There is one fetch layer, `SW.api`.

**From `catalogue.js`**: the service catalogue, the Swadharma suite, the
territory seed and contact details. This is editorial, platform-wide content —
it is a data file rather than markup, which is what Definition of Done item 8
actually asks for.

**Deliberately not from `/api/v1/services`.** That endpoint is public and
returns real data, but it is a **tenant** catalogue — Datta Mukti Kshetram's own
list, with its INR prices and Telugu localisation. Rendering it on the platform's
marketing site would present one institution's price list as ours. When a
platform-level services endpoint exists, swap `SW.CATALOGUE` for a fetch behind
the same shape and nothing else changes.

### Two gaps, stated plainly

1. **`POST /api/v1/service-requests` does not exist.** The Request Wizard
   collects a fully structured request and hands it off by email
   (`swadharma@dharmaposhanam.in`) with the payload rendered as text. The intake
   is the part that had to exist first; the transport is one function in
   `page-request.js`. When the endpoint lands, replace `submit()` — and keep the
   email path as the fallback for a failed POST. A request that reaches nobody is
   the one outcome that page must never produce.

2. **There is no "Recently verified" rail.** The spec asks for one, but the
   directory API exposes no verification date, so it would render the same rows
   as Featured under a different heading — exactly the duplicate-proposition
   the spec forbids in §10. `/network` shows a live territory summary instead.
   Add the rail when the API can order by verification date.

The network is also genuinely young: **two organisations, no listed
professionals** as of 2026-08-22. Every surface degrades to an empty state that
says so and offers the next step, and `test_browser.mjs` runs all fourteen
routes against three worlds — `live`, `full` and `down` — so a populated network
and a failing API are both covered before either happens.

---

## Rules the tests enforce

* Every internal link resolves through the real nginx rules; every `#fragment`
  lands on an element that exists.
* One TopNav, one drawer, one footer, one `<nav>` per page (spec §10).
* No page renders blank, and nothing is ever left showing "Loading".
* Every `SW.el("x")` has an `x` that something creates.
* The Dockerfile ships `*.html`, `*.css` and `*.js` — and no broad `COPY . .`,
  which would publish `_layout/`, `build_pages.py` and the internal `*.md`.
* **No page mentions Vitta Fin.** It was dropped for Swadharma Services on
  2026-08-09; billing is Stripe (USD) and Razorpay (INR) direct. Saying otherwise
  tells institutions something untrue about where their money goes.
* `/signin` names no customer installation. The warning about the incident where
  those links pointed at a live customer's back office is a `<!--! … -->`
  build-only comment: kept in `_layout/pages/signin.html`, stripped from the
  served page.

---

## Two CI interactions to know about

**`.github/workflows/add-og-tags.yml`** rewrites any `*.html` in the repo that
lacks an `og:title`, injecting a boilerplate block and committing it. Today it
skips every generated page, because `_layout/shell.html` already emits `og:title`.
**If that tag is ever removed from the shell, the Action will inject its
boilerplate into all twelve generated pages and `build_pages.py --check` will
then fail on every run** — the committed HTML no longer matches its source, and
the next build silently reverts the Action, which re-commits, and so on. Keep
`og:title` in the shell.

(Its boilerplate also advertises `swadharma.dharmaposhanam.in` and a generic
description, which is wrong for this site. It currently only reaches
`credits.html` and `policies.html`. Worth fixing at the Action, separately.)

**`.github/workflows/deploy.yml`** publishes the whole repository to GitHub
Pages on push to `main`, with `path: '.'`. That is a different site from this
one, but when this branch merges to `main` it will publish `_layout/`,
`build_pages.py`, the test suites, `DEPLOY_RUNBOOK.md`, `ONBOARDING_API.md` and
`PROFESSIONAL_ENROLMENT_API.md` to a public URL. The Cloud Run image and the
`.gcloudignore` both exclude those; GitHub Pages does not. Narrow that `path:`
before merging to `main`.

## Content sources

The catalogue is the nine service groups drawn from **dharmaposhanam.in/swadharma**
(its eight programme pillars plus the four immediate activities, with the
Knowledge Hub added as its own group), and `SW.SUITE` is the twelve modules from
**dharmaposhanam.in/apps**. Both were reconciled against those pages on
2026-08-22. When either changes, update `catalogue.js` — not the pages.
