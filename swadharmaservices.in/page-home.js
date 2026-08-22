/* page-home.js — the compact home page.
   Three jobs: the TerritorySelector, the two FeaturedRails, and the compact
   ServiceGrid. Nothing here is hard-coded content; services come from
   catalogue.js and the rails come from the live directory. */
(function () {
    "use strict";

    /* ── ServiceGrid (compact) ──────────────────────────────────────── */
    var grid = SW.el("homeServices");
    if (grid) {
        grid.innerHTML = SW.CATALOGUE.map(function (s) {
            return '<a class="card" href="/services/' + s.slug + '">' +
                '<div class="icn">' + s.icon + "</div>" +
                "<h3>" + SW.esc(s.name) + "</h3>" +
                (s.sanskrit ? '<span class="sa">' + s.sanskrit + "</span>" : "") +
                "<p>" + SW.esc(s.tagline) + "</p>" +
                '<span class="go">Explore →</span>' +
                "</a>";
        }).join("");
    }

    /* ── FeaturedRails ──────────────────────────────────────────────── */
    SW.territory.adoptFromUrl();
    SW.featured.render(SW.el("featPros"), "professionals", "day", 4);
    SW.featured.render(SW.el("featOrgs"), "organisations", "week", 4);

    /* ── TerritorySelector ──────────────────────────────────────────── */
    var form = SW.el("homeTerritory");
    if (!form) return;

    var selCountry = SW.el("tCountry");
    var selState = SW.el("tState");
    var selCity = SW.el("tCity");
    var tree = [];

    function fill(select, rows, anyLabel) {
        select.innerHTML = '<option value="">' + anyLabel + "</option>" +
            rows.map(function (r) {
                return '<option value="' + SW.esc(r.value) + '">' + SW.esc(r.label) + "</option>";
            }).join("");
        select.disabled = rows.length === 0;
    }

    function countryNode() {
        for (var i = 0; i < tree.length; i += 1) {
            if (tree[i].code === selCountry.value) return tree[i];
        }
        return null;
    }
    function stateNode() {
        var c = countryNode();
        if (!c) return null;
        for (var i = 0; i < c.states.length; i += 1) {
            if (c.states[i].name === selState.value) return c.states[i];
        }
        return null;
    }

    function refreshStates() {
        var c = countryNode();
        fill(selState, c ? c.states.map(function (s) {
            return { value: s.name, label: s.name };
        }) : [], "Any state");
    }

    function refreshCities() {
        var s = stateNode();
        fill(selCity, s ? s.cities.map(function (ct) {
            return { value: ct.name, label: ct.region ? ct.name + " — " + ct.region : ct.name };
        }) : [], "Any city");
    }

    selCountry.addEventListener("change", function () {
        refreshStates();
        refreshCities();
    });
    selState.addEventListener("change", refreshCities);

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        SW.territory.set({
            country: selCountry.value,
            state: selState.value,
            city: selCity.value,
            postalCode: ""
        });
        // The point of picking a territory is to browse it.
        window.location.href = "/network";
    });

    SW.tree.build().then(function (built) {
        tree = built;
        fill(selCountry, tree.map(function (c) {
            return { value: c.code, label: c.name };
        }), "Any country");

        // Restore whatever the visitor last chose.
        var t = SW.territory.get();
        if (t.country) { selCountry.value = t.country; refreshStates(); }
        if (t.state) { selState.value = t.state; refreshCities(); }
        if (t.city) { selCity.value = t.city; }
    }).catch(function () {
        // The picker is an accelerator, not the only route in. If the directory
        // is down, leave the selects disabled and the buttons still work.
        fill(selCountry, [], "Territories unavailable");
    });
})();
