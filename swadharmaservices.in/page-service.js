/* page-service.js — one template, every service detail page.
   nginx serves this file for any /services/<slug>; the slug comes off the path.
   The title and breadcrumb are corrected here rather than in markup, which is
   the one cost of serving twelve routes from a single static file. */
(function () {
    "use strict";

    var node = SW.el("serviceDetail");
    if (!node) return;

    var slug = window.location.pathname.replace(/\/+$/, "").split("/").pop();
    var svc = SW.serviceBySlug(slug);

    if (!svc) {
        document.title = "Service not found · Swadharma Services";
        node.innerHTML =
            '<div class="sw-page-head">' +
            '<h1 class="sw-h1">That service is not in the catalogue</h1>' +
            '<p class="sub">It may have been renamed. The full catalogue is one click away, ' +
            'and a request can name any rite in free text.</p>' +
            '<div class="btn-row"><a class="btn" href="/services">All services</a>' +
            '<a class="btn ghost" href="/request">Start a Service Request</a></div></div>';
        return;
    }

    document.title = svc.name + " · Swadharma Services";
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", svc.tagline + " " + svc.summary);
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", "https://swadharmaservices.in/services/" + svc.slug);

    // Breadcrumb: the generator could only write a generic last crumb.
    var crumb = document.querySelector('.sw-crumbs span[aria-current]');
    if (crumb) crumb.textContent = svc.name;

    // SideNav: mark the entry for this service, which markCurrent() cannot
    // resolve because it ran before the slug was known.
    var sideLink = document.querySelector('.sw-side a[href="/services/' + svc.slug + '"]');
    if (sideLink) sideLink.setAttribute("aria-current", "page");

    var STATUS = {
        live: '<span class="chip teal">Available now</span>',
        enrolling: '<span class="chip teal">Enrolling</span>',
        soon: '<span class="chip">Coming soon</span>'
    };

    var terr = { IN: "India", US: "United States" };
    var where = (svc.territories || []).map(function (c) {
        return '<span class="chip plain">' + SW.esc(terr[c] || c) + "</span>";
    }).join("");

    var roles = (svc.deliveredBy || []).map(function (r) {
        return '<span class="chip plain">' + SW.esc(r) + "</span>";
    }).join("");

    var rows = (svc.includes || []).map(function (i) {
        return "<tr><td><b>" + SW.esc(i.name) + "</b></td><td>" + SW.esc(i.note || "") + "</td></tr>";
    }).join("");

    var extra = (svc.links || []).map(function (l) {
        var external = l.href.indexOf("http") === 0;
        return '<a class="btn ghost" href="' + SW.esc(l.href) + '"' +
            (external ? ' target="_blank" rel="noreferrer"' : "") + ">" + SW.esc(l.label) + "</a>";
    }).join("");

    node.innerHTML =
        '<div class="sw-page-head">' +
        '<span class="mark">' + svc.icon + " Service</span>" +
        '<h1 class="sw-h1">' + SW.esc(svc.name) +
        (svc.sanskrit ? ' <em style="font-size:0.62em">' + svc.sanskrit + "</em>" : "") + "</h1>" +
        '<p class="sub">' + SW.esc(svc.summary) + "</p>" +
        '<div class="chips" style="margin-bottom:18px">' + (STATUS[svc.status] || "") + where + "</div>" +
        '<div class="btn-row">' +
        (svc.requestable
            ? '<a class="btn" href="/request?service=' + svc.slug + '">Start a Service Request</a>'
            : '<a class="btn" href="/classes">See classes and fees</a>') +
        '<a class="btn ghost" href="/network/professionals?service=' + svc.slug + '">Find a professional</a>' +
        extra +
        "</div></div>" +

        (svc.urgent
            ? '<div class="notice" style="margin-bottom:26px"><b>Arranging at short notice?</b> ' +
              "Apara Karma and Śrāddha requests are triaged ahead of the queue. Mark the date on the " +
              "request and we will call you rather than wait for email.</div>"
            : "") +

        '<section class="sw-sec">' +
        '<div class="sw-sec-head"><h2>What this includes</h2></div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Rite or item</th><th>Notes</th></tr></thead>' +
        "<tbody>" + rows + "</tbody></table></div>" +
        "</section>" +

        '<section class="sw-sec">' +
        '<div class="sw-sec-head"><h2>Who performs it</h2></div>' +
        '<div class="chips">' + roles + "</div>" +
        (svc.fulfilledBy
            ? '<p class="sub" style="margin-top:12px">Supplied by <b>' + SW.esc(svc.fulfilledBy) +
              "</b>. Materials are sold and invoiced by Dravya, not by Swadharma Services.</p>"
            : '<p class="sub" style="margin-top:12px">Every professional listed for this service has ' +
              "passed a Swadharma verification call and an empanelment interview, and is verified " +
              "<em>for this specific category</em>.</p>") +
        "</section>" +

        // Dates, not prose. Only rendered for services the pañcāṅga actually
        // carries observances for; a service with no recurring lunar date says
        // nothing here rather than showing an empty heading.
        '<section class="sw-sec" id="svcDates" hidden>' +
        '<div class="sw-sec-head"><h2>Next dates</h2>' +
        '<a class="more" href="/calendar">Full calendar →</a></div>' +
        '<div class="next-dates" id="svcDatesBody"></div>' +
        '<p class="rail-note" id="svcDatesNote"></p>' +
        "</section>" +

        '<section class="sw-sec">' +
        '<div class="sw-sec-head"><h2>Available in your territory</h2>' +
        '<a class="more" href="/territories">Browse territories →</a></div>' +
        '<div class="terr-bar" id="svcTerr"></div>' +
        '<div class="dir-grid" id="svcPros"></div>' +
        '<div class="dir-state" id="svcProsState" aria-live="polite">Loading…</div>' +
        "</section>" +

        '<section class="sw-sec"><div class="cta-band">' +
        "<div><h2>Ready to arrange it?</h2>" +
        "<p>Tell us the date and the place. You will see who is assigned and what it costs before " +
        "anything is paid.</p></div>" +
        '<a class="btn" href="/request' + (svc.requestable ? "?service=" + svc.slug : "") + '">Start a Service Request</a>' +
        "</div></section>";

    SW.territory.adoptFromUrl();
    SW.renderTerritoryBar(SW.el("svcTerr"));

    /* ── Next dates, from the pañcāṅga ──────────────────────────────── */
    if (window.SW.panchanga) {
        SW.panchanga.load().then(function () {
            var P = SW.panchanga;
            var next = P.upcoming({ service: svc.slug, count: 6 });
            if (!next.length) return;

            SW.el("svcDatesBody").innerHTML = next.map(function (d) {
                var ob = d.ob[0];
                var q = new URLSearchParams({ service: svc.slug, date: d.date });
                return '<div class="next-date">' +
                    "<b>" + SW.esc(P.gregorianLabel(d.date)) + "</b>" +
                    "<span>" + SW.esc(P.lunarLabel(d)) + "</span>" +
                    "<span>" + SW.esc(ob.name) +
                    (ob.late ? " — begins " + SW.esc(ob.lateFrom || "late in the day") : "") +
                    " · " + SW.esc(ob.kala) + "</span>" +
                    (d.rk ? '<span class="cal-avoid">Rāhukāla ' + SW.esc(d.rk) + "</span>" : "") +
                    '<a class="dir-link" href="/request?' + q.toString() + '">Request this date →</a>' +
                    "</div>";
            }).join("");

            SW.el("svcDatesNote").textContent =
                "Derived from the " + P.meta().samvatsara + " pañcāṅga, not a fixed list. " +
                "A rite owed on a family tithi is not here — look it up on the calendar, " +
                "or name the tithi in a request.";
            SW.el("svcDates").hidden = false;
        }).catch(function () {
            // The page is complete without dates; leave the section hidden.
        });
    }

    new SW.Directory({
        kind: "professionals",
        grid: SW.el("svcPros"),
        state: SW.el("svcProsState"),
        inputs: {},
        limit: 6,
        noun: "professional",
        // Carry the service through, so "Request this service" on a card
        // arrives at the wizard with this rite already chosen.
        cardOpts: { serviceSlug: svc.slug },
        empty: "No professionals are listed in this territory yet. A request still reaches the " +
               "network — we place it with a verified professional from the nearest territory.",
        blank: "Professionals appear here as they complete empanelment. In the meantime, a request " +
               "goes straight to the Swadharma coordination desk."
    }).reload();
})();
