/* page-territories.js — the territory browser.
   Territory is a browsing dimension, not a filter field (spec section 6): three
   linked columns, a live result panel underneath, and the selection persisted
   for the rest of the visit. */
(function () {
    "use strict";

    SW.territory.adoptFromUrl();
    SW.renderTerritoryBar(SW.el("terrBar"));

    var cols = SW.el("terrCols");
    var results = SW.el("terrResults");
    var tree = [];

    /* ── The operating table, from the seed. Static by design: it says where
          Swadharma works, which is true whether or not anyone is listed. ── */
    var seedBody = SW.el("terrSeed");
    if (seedBody) {
        var rows = [];
        SW.TERRITORY_SEED.forEach(function (c) {
            c.states.forEach(function (s) {
                s.regions.forEach(function (r) {
                    rows.push("<tr><td>" + SW.esc(c.name) + "</td><td>" + SW.esc(s.name) +
                        "</td><td>" + SW.esc(r.name) + "</td><td>" + SW.esc(r.cities.join(", ")) +
                        "</td></tr>");
                });
            });
        });
        seedBody.innerHTML = rows.join("");
    }

    function find(list, key, value) {
        for (var i = 0; i < list.length; i += 1) {
            if (list[i][key] === value) return list[i];
        }
        return null;
    }

    function column(head, items, activeValue, attr) {
        if (!items.length) {
            return '<div class="terr-col"><h3>' + head + '</h3><p class="empty">Pick one on the left.</p></div>';
        }
        return '<div class="terr-col"><h3>' + head + "</h3>" + items.map(function (it) {
            var on = it.value === activeValue ? ' aria-pressed="true"' : ' aria-pressed="false"';
            return "<button type=\"button\" data-level=\"" + attr + "\" data-value=\"" +
                SW.esc(it.value) + '"' + on + "><span>" + SW.esc(it.label) + "</span>" +
                '<span class="n">' + it.count + "</span></button>";
        }).join("") + "</div>";
    }

    function draw() {
        var t = SW.territory.get();
        var country = t.country ? find(tree, "code", t.country) : null;
        var state = country && t.state ? find(country.states, "name", t.state) : null;

        var html = column("Country", tree.map(function (c) {
            return { value: c.code, label: c.name, count: c.pros + c.orgs };
        }), t.country || "", "country");

        html += column("State / Province", country ? country.states.map(function (s) {
            return { value: s.name, label: s.name, count: s.pros + s.orgs };
        }) : [], t.state || "", "state");

        html += column("Region / City", state ? state.cities.map(function (ct) {
            return {
                value: ct.name,
                label: ct.region ? ct.name + " — " + ct.region : ct.name,
                count: ct.pros + ct.orgs
            };
        }) : [], t.city || "", "city");

        cols.innerHTML = html;
        showResults();
    }

    cols.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-level]");
        if (!btn) return;
        var level = btn.dataset.level;
        var value = btn.dataset.value;
        var current = SW.territory.get();
        var patch = {};

        // Clicking the selected entry deselects it and everything below.
        if (level === "country") {
            patch = { country: current.country === value ? "" : value, state: "", city: "", postalCode: "" };
        } else if (level === "state") {
            patch = { state: current.state === value ? "" : value, city: "", postalCode: "" };
        } else {
            patch = { city: current.city === value ? "" : value, postalCode: "" };
        }

        SW.territory.set(patch);
        SW.territory.syncUrl();
    });

    /* ── Results for the selected territory ─────────────────────────── */

    var proDir = null, orgDir = null;

    function showResults() {
        if (!SW.territory.isSet()) {
            results.hidden = true;
            return;
        }
        results.hidden = false;
        SW.el("terrResultsTitle").textContent = "In " + SW.territory.label();

        var qs = new URLSearchParams();
        var t = SW.territory.get();
        ["country", "state", "city", "postalCode"].forEach(function (k) {
            if (t[k]) qs.set(k, t[k]);
        });
        SW.el("terrRequest").href = "/request?" + qs.toString();
        SW.el("terrAllPros").href = "/network/professionals?" + qs.toString();

        if (!proDir) {
            proDir = new SW.Directory({
                kind: "professionals",
                grid: SW.el("terrPros"), state: SW.el("terrProsState"),
                inputs: {}, limit: 6, noun: "professional",
                empty: "No professionals listed in this territory yet.",
                blank: "No professionals listed yet."
            });
            orgDir = new SW.Directory({
                kind: "organisations",
                grid: SW.el("terrOrgs"), state: SW.el("terrOrgsState"),
                inputs: {}, limit: 6, noun: "organisation",
                empty: "No organisations listed in this territory yet.",
                blank: "No organisations listed yet."
            });
            // Both already reload on territory change via SW.Directory.
            proDir.reload();
            orgDir.reload();
        }
    }

    SW.territory.onChange(draw);

    SW.tree.build().then(function (built) {
        tree = built;
        draw();
    }).catch(function () {
        cols.innerHTML = '<div class="terr-col"><h3>Country</h3>' +
            '<p class="empty">Territories are unavailable just now. ' +
            'The table below still shows where Swadharma operates.</p></div>';
    });
})();
