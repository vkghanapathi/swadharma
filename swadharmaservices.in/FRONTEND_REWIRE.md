# swadharmaservices.in — front-end architecture

How the public site is built, tested and deployed after the 2026-08-22 rewire.
Implements *Swadharma Frontend Architecture & UX Rewire Specification*.

The short version: **the pages are generated, the chrome lives in one file, and
nothing ships without `test_site.py` and `test_browser.mjs` passing.**

---

## Build, test, deploy

```bash
cd swadharmaservices.in

python _layout/build_panchanga.py   # regenerate panchanga.data.js from Viyat
python build_pages.py               # regenerate the pages from _layout/
python test_site.py                 # links, routes, assets, calendar data
node   test_browser.mjs             # every page in a real DOM   (needs jsdom)

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

## The pañcāṅga calendar

`/calendar` shows the monthly programmes as dates rather than prose, and the
Request Wizard takes a date in **either** calendar. Both read one static asset, `panchanga.data.js`.

It is emitted as **JavaScript rather than JSON** for a measured reason:
swadharmaservices.in is fronted by Firebase Hosting, which re-serves an origin
`application/json` response **uncompressed** — 146 KB reached the browser where
nginx had already gzipped it to 21 KB — while it does compress
`application/javascript`. Same bytes, same parse, one seventh the transfer. It
is loaded by injecting a `<script>` on demand, so pages that never open the
calendar never pay for it.

**Source.** `viyat/panchangam_data/panchangam_en.json` — 385 days,
2026-03-19 to 2027-04-07, Parābhava saṃvatsara, with māsa, pakṣa, tithi,
nakṣatra, yoga, karaṇa, sunrise, sunset, rāhukāla, varjya, durmuhūrta and the
printed festival line per day.

**Why a build step, not the Viyat API.** Viyat exposes `/api/v1/festivals` and
`/api/v1/muhurta/search`, but every one of them answers **403 Not
authenticated**. A public page cannot hold a credential. So
`_layout/build_panchanga.py` compiles the tables into `panchanga.json` at build
time: same-origin, no auth, no CSP change, and the calendar does not go down
when another service does.

**The monthly programmes are derived, not listed.** Amāvāsyā, Pūrṇimā, Ekādaśī,
Pradoṣa, Māsa Śivarātri, Saṅkaṣṭī, Vināyaka Caturthī, Ṣaṣṭhī, Kālāṣṭamī and the
Mahālaya fortnight are rules over `(pakṣa, tithi)` in `MONTHLY`, so they stay
right for any year the tables cover. Each names a `service` slug from
`catalogue.js`, which is how a day in the calendar links to the rite that serves
it — `test_site.py` fails if a slug stops existing.

**Three data problems the build handles, and why it matters**

1. *Kṣaya tithi.* Māgha Pūrṇimā 2027 never holds at sunrise — Caturdaśī all day,
   Pūrṇimā from te 5.30, Kṛṣṇa Pratipat by the next dawn. A rule looking only at
   the day's first tithi drops that month's Satyanārāyaṇa Vratam **silently**.
   Observances are therefore derived from the second tithi too and flagged
   `late`. Disabling that handling costs three monthly programmes a month each
   (Pūrṇimā, Māsa Śivarātri, Ṣaṣṭhī); `test_site.py` asserts 13 of each.
2. *Truncated times.* 55 sunrise/sunset cells lost a trailing zero upstream
   (`6.10` → `6.1`, `18.50` → `18.5`, `6.00` → `6`). They are recovered, but each
   recovery is **checked**: both readings of an ambiguous value are measured
   against the nearest well-formed day, and the winner must be close to it and
   clearly closer than the alternative. Failures are dropped, not guessed.
3. *A shifted row.* 2027-02-20 has a rāśi name in `sunrise` and `7.41` in
   `sunset` — well formed, and wrong by ten hours. A plausibility window
   (05:00–07:30, 17:00–19:30, against a real year of 5:57–6:49 and 17:54–18:52)
   drops both, and also stops that row being used as the anchor for a
   neighbouring repair.

Every repair and refusal is printed by the build. They are upstream faults —
fixing them in `panchangam_en.json` would let the repair step go away.

**Times are printed verbatim.** Tithi and nakṣatra end times and varjya carry
markers (`M`, `N`, `E`, `te`) that neither this repository nor Viyat documents.
They are reproduced exactly as published rather than re-derived: guessing
whether `N` means night or noon would put a wrong muhūrta in front of someone
arranging a funeral rite. Rāhukāla and durmuhūrta are unambiguous clock ranges
and are the only ones the UI reasons about. The calendar page says all of this
on itself.

**Booking in both calendars.** The wizard's date step resolves whichever way it
is given — Gregorian date → tithi, or māsa/pakṣa/tithi → date — and shows the
other reckoning with the day's cautions before you continue. **Both travel with
the request.** The lunar date is the obligation ("Śrāvaṇa Kṛṣṇa Saptamī" is what
a family owes every year); the Gregorian date is only where it lands this once,
and a request carrying only that loses the thing that has to be repeated.

Adhika māsa is kept distinct rather than flattened: the year has both an Adhika
and a Nija Jyeṣṭha, and a rite owed in one is not owed in the other.

## Locality — a recorded distinction

**VKG, 2026-08-24.** A tithi is not a global fact. It begins and ends at a
moment in time, so which tithi stands *at sunrise* — the reckoning most rites
use — depends on where you are standing. Sunrise, sunset, rāhukāla, varjya and
durmuhūrta are local outright. Two families can owe the same Ābdika on different
Gregorian days because they live in different places.

So the reckoning is **an account property, decided when the account is created**.
Not a platform-wide setting, and not something that drifts afterwards: a family
that has kept its Śrāddha by one locality's pañcāṅga for forty years is not
moved onto another because a server changed.

**The demo account, and this public site, are set to Mysore, India.** That is
what the published tables are — confirmed twice: the publisher says so in its own
front matter (*"Though the time is set to IST, Sunrise and Sunset indicate
Mysore time"*), and the data agrees, with a longest day of 12h51m and a shortest
of 11h24m, which is latitude 12.3°N.

`SW.LOCALITY` in `catalogue.js` is the fallback the public site and the demo use;
`meta.locality` in the built tables is the authority. The frontend never chooses
a locality — it displays the one the account was given.

**Every surface that prints a tithi prints whose tithi it is.** The welcome
strip, `/calendar`, the wizard's date step and the booking review all carry the
locality. A family in Frisco reading "Rāhukāla 7.30 – 9.00" without that label is
reading Mysore's rāhukāla and does not know it. `SW.panchanga.todayIso()`
likewise computes "today" in the locality's timezone, not the viewer's — someone
opening the site at 22:00 in Texas is already on the next day in Mysore, and it
is Mysore's tithi their rite is scheduled against.

### Tithi leads the booking

Once a tithi is chosen the ecosystem schedules on the corresponding Gregorian
date — that is what a Purohita's diary runs on — but **the display names the
tithi first**. It is the headline of the wizard review (`.wiz-tithi`), the first
line of the request that goes out, and the subject line carries it in
parentheses. A booking showing only the date has hidden the thing the devotee
came to arrange.

### The welcome line, and embedding it

`/` opens with today's date, the clock in the locality, and the tithi.
`SW.panchanga.renderToday()` draws it, and it re-renders each minute so a tab
left open rolls over at the locality's midnight rather than going stale.

`panchanga-widget.js` is the same line for an account holder's own domain:

```html
<div data-swadharma-panchanga data-locality="Rajahmundry, Andhra Pradesh"></div>
<script src="https://swadharmaservices.in/panchanga-widget.js" async></script>
```

It finds its own origin from its script tag, pulls the tables from there, scopes
its styles under `.swp-`, and inherits the host's font. No CORS to configure —
the data is a script, which is a second reason it is shipped that way. Options:
`data-href` makes the tithi a link, `data-theme="dark"` for a dark header, and
`data-locality` labels the line with the account's own reckoning.

**`data-locality` labels, it does not convert.** The figures stay the published
tables', and the widget marks them *indicative* with a tooltip saying to confirm
with the Purohita. An account that needs its own reckoning needs its own tables —
pretending otherwise would put one place's tithi under another place's name,
which is precisely the error this whole section exists to prevent.

`test_browser.mjs` runs the widget on a genuinely different origin
(`swadharma.example-temple.org`) and asserts both cases, including that a
borrowed reckoning is marked indicative.

## The Seva Karta wall

`/seva-wall` and `seva-wall.js` — today's seva kartas, for a screen in the hall
or a panel in a tenant portal. Modelled on the donor wall running at
**disa.sgsdatta.in** (`src/disa/routers/donor_wall.py` and
`templates/donor_wall/display.html`), which is the proven implementation.

**Both kinds of seva karta, together.** A one-time booking for today, and a
permanent **Mūla Nidhi** corpus donor whose seva recurs on this day every year —
DISA models the second as `sevaDay` in MMDD. Corpus donors sort first: they
endowed the day. A wall showing only fresh bookings would leave the shashwata
donors off the wall they paid for.

**Privacy is per seva, not per person**, exactly as DISA has it (`hide_name`,
`hide_photo`). The contract requires the SERVER to send `null` — not `""`, so
"withheld" stays distinguishable from "not recorded" — and the endpoint carries
no phone, email, address or amount at all. A donor cannot be exposed by a
rendering bug on this side because the data never arrives.

**The image ladder** (VKG, 2026-08-24) is the one thing not copied from DISA,
which falls back to a coloured circle with the donor's initial:

1. the donor's photograph, where they opted in;
2. otherwise the **deity image for that seva** — the tenant's own, keyed by seva
   code via `data-deities` or per-seva `deityImage`;
3. otherwise a drawn emblem, a lamp within a lotus.

Never an initial. Nobody is missing from this wall — the donor chose not to
appear — and the image should not look like a gap where a person ought to be.
A withheld name reads *Nāma gupta — offered without name*, with a footer count
so the number is honest without the names being.

`data-layout="wall"` rotates one large card for a hall screen; `"grid"` shows
all at once for a page panel. It refreshes every five minutes and turns over at
the installation's midnight, via `SW.panchanga.todayIso()`, not the viewer's.

### The endpoint does not exist yet

swadharma-api has `/api/v1/bookings`, authenticated — correctly, because
bookings are personal data. There is no public, privacy-projected seva-wall
route, and adding one is a decision about publishing donors' names and
photographs rather than a technical detail, so it is VKG's to make. The module
is built against the contract documented at the top of `seva-wall.js` and says
plainly on `/seva-wall` that the feed is missing. `data-payload` renders an
inline payload for a host that already has the data server-side — which is also
how the demonstration on `/seva-wall` runs, so the demo exercises the shipping
renderer rather than a copy of it.

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
