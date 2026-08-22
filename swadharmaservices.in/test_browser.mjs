/**
 * test_browser.mjs — runs each page in jsdom with its scripts executing.
 *
 * test_site.py checks that the markup and the routes hang together. This checks
 * the thing a visitor actually experiences: does the page RENDER, with the
 * directory answering, and does it still say something sensible when the
 * directory is empty or down.
 *
 * The network is young — two organisations, no listed professionals — so every
 * page is run against three worlds:
 *
 *   live    the API as it actually responds today
 *   full    a populated network, to prove the cards and filters work
 *   down    the API failing, to prove nothing renders blank
 *
 *   node test_browser.mjs        (needs jsdom; see DEPLOY_RUNBOOK.md)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// jsdom is a test-only dependency and deliberately not installed in this
// directory — the deploy source stays free of node_modules. Point SW_JSDOM at
// an installed copy, or install it here temporarily. See DEPLOY_RUNBOOK.md.
const jsdomSpecifier = process.env.SW_JSDOM
    ? pathToFileURL(process.env.SW_JSDOM).href
    : "jsdom";
const { JSDOM, VirtualConsole, requestInterceptor } = await import(jsdomSpecifier);

const ROOT = dirname(fileURLToPath(import.meta.url));

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };

/**
 * Serves /app.js and friends off disk. Anything off-site gets an explicit 502,
 * so a stray external dependency shows up as a failed load rather than a real
 * network call — the CSP forbids them, and this is where that gets noticed.
 */
function localFiles() {
    return requestInterceptor((request) => {
        const u = new URL(request.url);
        if (u.origin !== "https://swadharmaservices.in") {
            return new Response("blocked: off-site resource", { status: 502 });
        }
        const path = decodeURIComponent(u.pathname).slice(1);
        const local = join(ROOT, path);
        if (!existsSync(local)) return new Response("not found", { status: 404 });
        const ext = path.slice(path.lastIndexOf("."));
        return new Response(readFileSync(local), {
            headers: { "Content-Type": TYPES[ext] || "application/octet-stream" }
        });
    });
}

/* ── The nginx location rules, again. Three copies of this mapping now
      exist (nginx.conf, test_site.py, here) and each is checked against
      the others by test_site.py. ─────────────────────────────────────── */
function fileFor(route) {
    const path = route.split("?")[0];
    if (path === "/") return "index.html";
    if (path === "/network/professionals") return "network-professionals.html";
    if (path === "/network/temples") return "network-temples.html";
    if (path.startsWith("/services/")) return "service.html";
    if (path.startsWith("/territories/")) return "territories.html";
    return path.slice(1) + ".html";
}

/* ── Fixtures ─────────────────────────────────────────────────────────── */

const LIVE_ORGS = [
    {
        id: "dharmaposhanam", name: "Dharma Poshanam", trustName: "Dharma Poshanam",
        description: null, city: "Mysore", state: "Karnataka", postalCode: null,
        country: "India", websiteUrl: "https://swadharma.dharmaposhanam.in",
        bookingUrl: "https://swadharma.dharmaposhanam.in", heroImage: null, mapsUrl: null
    },
    {
        id: "dattamukti", name: "Sri Datta Mukti Kshetram", trustName: "Sri Datta Mukti Kshetram",
        description: "Sacred center for Pitru Karyam and Daivikam services on the banks of the Godavari.",
        city: "Rajahmundry", state: "Andhra Pradesh", postalCode: "533107", country: "India",
        websiteUrl: "https://swadharma.dattamukti.in", bookingUrl: "https://swadharma.dattamukti.in",
        heroImage: "/images/locations/datta-mukti-kshetram/slide_1.jpg",
        mapsUrl: "https://maps.google.com/?q=Sri+Datta+Mukti+Kshetram+Rajahmundry"
    }
];

const FULL_PROS = [
    {
        id: "p1", name: "Śrīnivāsa Ghanapāṭhī", city: "Mysuru", state: "Karnataka",
        postalCode: "570023", country: "IN", verifiedCategories: ["Pārvaṇa Śrāddha", "Upanayana"],
        languages: ["Kannada", "Sanskrit", "Telugu"], veda: "Kṛṣṇa Yajurveda",
        shakha: "Taittirīya", sampradaya: "Smārta", experienceBand: "20-30"
    },
    {
        id: "p2", name: "Rama Sharma", city: "Frisco", state: "Texas",
        postalCode: "75035", country: "US", verifiedCategories: ["Gṛha Praveśam"],
        languages: ["Telugu", "English"], veda: "Ṛgveda", shakha: "Śākala",
        sampradaya: "Vaiṣṇava", experienceBand: "10-20"
    },
    {
        id: "p3", name: "Anantha Bhatta", city: "Omaha", state: "Nebraska",
        postalCode: "68135", country: "US", verifiedCategories: [],
        languages: ["Kannada"], veda: "Sāmaveda", shakha: "", sampradaya: "",
        experienceBand: "5-10"
    }
];

const WORLDS = {
    live: { pros: [], orgs: LIVE_ORGS, fail: false },
    full: { pros: FULL_PROS, orgs: LIVE_ORGS, fail: false },
    down: { pros: [], orgs: [], fail: true }
};

/* ── Harness ──────────────────────────────────────────────────────────── */

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
}

async function run(route, world, assertions) {
    const file = fileFor(route);
    const path = join(ROOT, file);
    if (!existsSync(path)) throw new Error(`${route} -> ${file} does not exist`);

    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (e) => errors.push(e.message));
    virtualConsole.on("error", (m) => errors.push(String(m)));

    const w = WORLDS[world];

    const dom = new JSDOM(readFileSync(path, "utf8"), {
        url: "https://swadharmaservices.in" + route,
        runScripts: "dangerously",
        pretendToBeVisual: true,
        virtualConsole,
        resources: { interceptors: [localFiles()] },
        beforeParse(window) {
            window.scrollTo = () => {};
            window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
            window.IntersectionObserver = class {
                observe() {} unobserve() {} disconnect() {}
            };
            window.fetch = (url) => {
                if (w.fail) return Promise.reject(new Error("network down"));
                const u = new URL(url);
                const limit = parseInt(u.searchParams.get("limit") || "12", 10);
                const state = u.searchParams.get("state");
                const country = u.searchParams.get("country");

                const isPro = u.pathname.endsWith("/professionals");
                let rows = isPro ? w.pros : w.orgs;
                if (state) rows = rows.filter((r) => r.state === state);
                if (country) {
                    rows = rows.filter((r) => {
                        const c = (r.country || "").toUpperCase();
                        return c === country || (country === "IN" && c === "INDIA");
                    });
                }
                const total = rows.length;
                const key = isPro ? "professionals" : "organisations";
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        success: true,
                        data: { [key]: rows.slice(0, limit), total, page: 1, limit }
                    })
                });
            };
        }
    });

    // Let the promise chains in the page scripts settle.
    await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 60));

    const doc = dom.window.document;
    const label = `${route} [${world}]`;

    check(`${label} no script errors`, errors.length === 0, errors.join(" | "));

    // Every page must keep its chrome and never render an empty content area.
    check(`${label} has TopNav`, !!doc.querySelector(".sw-top"));
    check(`${label} has footer`, !!doc.querySelector(".sw-foot"));
    const main = doc.querySelector("main");
    check(`${label} main has content`, main && main.textContent.trim().length > 120,
        main ? `${main.textContent.trim().length} chars` : "no main");

    // Nothing VISIBLE should ever be left saying "Loading". A panel inside a
    // hidden section does not count, so walk the ancestors rather than trusting
    // the node's own hidden flag.
    const visible = (n) => {
        for (let el = n; el && el !== doc.body; el = el.parentElement) {
            if (el.hidden) return false;
        }
        return true;
    };
    const stuck = Array.from(doc.querySelectorAll(".dir-state, .terr-col .empty"))
        .filter((n) => visible(n) && /Loading|Searching/i.test(n.textContent));
    check(`${label} nothing stuck on Loading`, stuck.length === 0,
        stuck.map((n) => n.textContent.trim()).join(" | "));

    if (assertions) assertions({ doc, dom, label, world, check });

    dom.window.close();
}

/* ── Per-page assertions ──────────────────────────────────────────────── */

const PAGES = [
    ["/", ({ doc, label, world, check }) => {
        const grid = doc.getElementById("homeServices");
        check(`${label} service grid rendered`, grid && grid.children.length >= 9,
            grid ? `${grid.children.length} cards` : "missing");
        check(`${label} hero CTA is the request wizard`,
            !!doc.querySelector('.home-hero a[href="/request"]'));
        const pros = doc.getElementById("featPros");
        if (world === "full") {
            check(`${label} featured professionals rendered`,
                pros.querySelectorAll(".dir-card").length >= 3,
                `${pros.querySelectorAll(".dir-card").length} cards`);
        } else {
            check(`${label} featured professionals degrade honestly`,
                /Nothing listed yet|unavailable/i.test(pros.textContent), pros.textContent.trim());
        }
        const orgs = doc.getElementById("featOrgs");
        if (world === "live" || world === "full") {
            check(`${label} featured organisations rendered`,
                orgs.querySelectorAll(".dir-card").length === 2,
                `${orgs.querySelectorAll(".dir-card").length} cards`);
        }
        const country = doc.getElementById("tCountry");
        check(`${label} territory selector populated`,
            world === "down" ? true : country.options.length >= 3,
            `${country.options.length} options`);
    }],

    ["/services", ({ doc, label, check }) => {
        const grid = doc.getElementById("serviceGrid");
        check(`${label} catalogue rendered`, grid.children.length >= 9,
            `${grid.children.length} cards`);
        check(`${label} every card links to a detail page`,
            Array.from(grid.children).every((a) => a.getAttribute("href").startsWith("/services/")));
        check(`${label} side nav lists services`,
            doc.querySelectorAll('.sw-side a[href^="/services/"]').length >= 9);
    }],

    ["/services/shraaddha", ({ doc, label, world, check }) => {
        check(`${label} title set from catalogue`, /Śrāddha/.test(doc.title), doc.title);
        check(`${label} includes table rendered`,
            doc.querySelectorAll("table.tbl tbody tr").length >= 5);
        check(`${label} request CTA carries the slug`,
            !!doc.querySelector('a[href="/request?service=shraaddha"]'));
        check(`${label} urgent notice shown`, /short notice/i.test(doc.body.textContent));
        check(`${label} breadcrumb names the service`,
            /Śrāddha/.test(doc.querySelector(".sw-crumbs [aria-current]").textContent));
        check(`${label} side nav marks this service`,
            !!doc.querySelector('.sw-side a[href="/services/shraaddha"][aria-current]'));

        if (world === "full") {
            // A card's action must carry the service AND the professional's
            // territory, and must not emit parameters the wizard ignores.
            const action = doc.querySelector('#svcPros .dir-act a');
            const href = action ? action.getAttribute("href") : "";
            check(`${label} card action carries the service`,
                /service=shraaddha/.test(href), href);
            check(`${label} card action carries the territory`,
                /state=Karnataka/.test(href) && /postalCode=570023/.test(href), href);
            check(`${label} card action has no empty or unknown params`,
                !/=&/.test(href) && !/=$/.test(href) && !/territory=/.test(href), href);
        }
    }],

    ["/services/dravya", ({ doc, label, check }) => {
        check(`${label} names Dravya as the seller, not Swadharma`,
            /SDVS Global LLC|SDV Supplies/.test(doc.body.textContent));
        check(`${label} no urgent notice`, !/short notice/i.test(doc.body.textContent));
    }],

    ["/services/not-a-real-service", ({ doc, label, check }) => {
        check(`${label} unknown slug fails gracefully`,
            /not in the catalogue/i.test(doc.body.textContent));
        check(`${label} offers a way out`, !!doc.querySelector('a[href="/services"]'));
    }],

    ["/network", ({ doc, label, world, check }) => {
        check(`${label} both directory entrances present`,
            !!doc.querySelector('a[href="/network/professionals"]') &&
            !!doc.querySelector('a[href="/network/temples"]'));
        const where = doc.getElementById("netWhere");
        check(`${label} territory summary rendered`,
            world === "down"
                ? /unavailable/i.test(where.textContent)
                : where.querySelectorAll(".terr-col").length >= 1,
            where.textContent.slice(0, 80));
    }],

    ["/network/professionals", ({ doc, label, world, check }) => {
        const grid = doc.getElementById("proGrid");
        const state = doc.getElementById("proState");
        if (world === "full") {
            check(`${label} professionals listed`, grid.children.length === 3,
                `${grid.children.length} cards`);
            check(`${label} refine controls appear`, !doc.getElementById("proRefine").hidden);
            check(`${label} refine offers real values`,
                doc.getElementById("rVeda").options.length >= 4,
                `${doc.getElementById("rVeda").options.length} options`);
            check(`${label} count is honest`, /3 of 3 professionals/.test(doc.getElementById("proCount").textContent),
                doc.getElementById("proCount").textContent);
        } else if (world === "live") {
            check(`${label} empty state explains itself`,
                /complete empanelment/i.test(state.textContent), state.textContent.trim());
            check(`${label} refine controls stay hidden`, doc.getElementById("proRefine").hidden);
        } else {
            check(`${label} failure state names a way to get help`,
                /swadharma@dharmaposhanam\.in/.test(state.textContent), state.textContent.trim());
        }
    }],

    ["/network/temples", ({ doc, label, world, check }) => {
        const grid = doc.getElementById("orgGrid");
        if (world !== "down") {
            check(`${label} organisations listed`, grid.children.length === 2,
                `${grid.children.length} cards`);
            check(`${label} card links out to the portal`,
                /swadharma\.dattamukti\.in/.test(grid.innerHTML));
        }
        check(`${label} operational nodes rendered`,
            doc.getElementById("orgNodes").children.length === 4,
            `${doc.getElementById("orgNodes").children.length} nodes`);
    }],

    ["/territories", ({ doc, label, world, check }) => {
        const cols = doc.getElementById("terrCols");
        check(`${label} country column rendered`,
            world === "down"
                ? /unavailable/i.test(cols.textContent)
                : cols.querySelectorAll("button[data-level=country]").length === 2,
            cols.textContent.slice(0, 90));
        check(`${label} operating table filled`,
            doc.getElementById("terrSeed").children.length >= 5,
            `${doc.getElementById("terrSeed").children.length} rows`);
        check(`${label} results hidden until a territory is picked`,
            doc.getElementById("terrResults").hidden);
    }],

    ["/request", ({ doc, dom, label, check }) => {
        const pick = doc.getElementById("wizServices");
        check(`${label} step 1 offers the catalogue`, pick.children.length >= 9,
            `${pick.children.length} options`);
        check(`${label} starts on step 1`,
            !doc.querySelector('[data-panel="1"]').hidden &&
            doc.querySelector('[data-panel="2"]').hidden);

        // Walk the wizard the way a visitor does.
        pick.querySelector('button[data-slug="homa"]').click();
        doc.querySelector('[data-panel="1"] button[data-go="2"]').click();
        check(`${label} step 1 -> 2`, !doc.querySelector('[data-panel="2"]').hidden);

        // Country is required; continuing without it must not advance.
        doc.querySelector('[data-panel="2"] button[data-go="3"]').click();
        check(`${label} blocks step 2 without a country`,
            doc.querySelector('[data-panel="3"]').hidden);

        doc.getElementById("wCountry").value = "IN";
        doc.getElementById("wState").value = "Karnataka";
        doc.getElementById("wCity").value = "Mysuru";
        doc.querySelector('[data-panel="2"] button[data-go="3"]').click();
        check(`${label} step 2 -> 3 once country is set`,
            !doc.querySelector('[data-panel="3"]').hidden);

        doc.querySelector('[data-panel="3"] button[data-go="4"]').click();
        doc.querySelector('[data-panel="4"] button[data-go="5"]').click();
        check(`${label} reaches review`, !doc.querySelector('[data-panel="5"]').hidden);

        const review = doc.getElementById("wizReview").textContent;
        check(`${label} review carries the chosen service`, /Homa/.test(review), review.slice(0, 120));
        check(`${label} review carries the territory`, /Mysuru/.test(review) && /Karnataka/.test(review));
        check(`${label} handoff says where it goes`,
            /swadharma@dharmaposhanam\.in/.test(doc.getElementById("wizHandoff").textContent));
    }],

    ["/organisations", ({ doc, label, check }) => {
        check(`${label} pricing present`, /\$49/.test(doc.body.textContent) && /\$499/.test(doc.body.textContent));
        check(`${label} names the real gateways`,
            /Stripe/.test(doc.body.textContent) && /Razorpay/.test(doc.body.textContent));
        check(`${label} does not name the retired gateway`, !/vitta/i.test(doc.body.textContent));
        check(`${label} subscription CTA present`, !!doc.querySelector('a[href="/signup"]'));
    }],

    ["/how-it-works", ({ doc, label, check }) => {
        check(`${label} payment routes table present`,
            doc.querySelectorAll("table.tbl tbody tr").length === 3);
        check(`${label} states the no-WhatsApp-notification rule`,
            /do not send\s+WhatsApp or SMS/i.test(doc.body.textContent));
    }],

    ["/about", ({ doc, label, check }) => {
        check(`${label} suite rendered`, doc.getElementById("aboutSuite").children.length === 12,
            `${doc.getElementById("aboutSuite").children.length} modules`);
        check(`${label} contact rendered`, doc.getElementById("aboutContact").children.length === 4);
        check(`${label} offices rendered`, doc.getElementById("aboutOffices").children.length === 4);
    }],

    ["/signin", ({ doc, label, check }) => {
        check(`${label} points at the demo, never a customer`,
            /swadharma\.dharmaposhanam\.in/.test(doc.body.textContent) &&
            !doc.querySelector('a[href*="dattamukti"]'));
        // The incident note about a customer's back office is a build-only
        // comment; it must not survive into the served page.
        check(`${label} no customer named in page source`,
            !/dattamukti/i.test(doc.documentElement.outerHTML));
        check(`${label} three sign-in roles`,
            doc.querySelectorAll('a.hub[href^="https://swadharma.dharmaposhanam.in/"]').length === 3);
    }]
];

/* ── Go ───────────────────────────────────────────────────────────────── */

for (const world of ["live", "full", "down"]) {
    for (const [route, assertions] of PAGES) {
        try {
            await run(route, world, world === "down" ? undefined : assertions);
        } catch (e) {
            check(`${route} [${world}] threw`, false, e.message);
        }
    }
}

const failed = results.filter((r) => !r.ok);
for (const r of failed) {
    console.log(`  X ${r.name}${r.detail ? "  --  " + r.detail : ""}`);
}
console.log(
    failed.length
        ? `\nFAILED - ${failed.length} of ${results.length} checks`
        : `\nPASS - ${results.length} browser checks across ${PAGES.length} routes x 3 API worlds`
);
process.exit(failed.length ? 1 : 0);
