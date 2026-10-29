/* page-network.js — the network hub.
   Two featured rails on different periods, plus a live territory summary.
   There is deliberately no "Recently verified" rail: the directory API exposes
   no verification date, so it would render the same rows as Featured under a
   different heading. It goes in when the API can actually order by it. */
(function () {
    "use strict";

    SW.territory.adoptFromUrl();
    SW.renderTerritoryBar(SW.el("netTerr"));

    function rails() {
        SW.featured.render(SW.el("netFeatPros"), "professionals", "day", 6);
        SW.featured.render(SW.el("netFeatOrgs"), "organisations", "week", 6);
    }

    function where() {
        var node = SW.el("netWhere");
        if (!node) return;
        node.innerHTML = '<div class="dir-state">Loading territories…</div>';

        SW.tree.build().then(function (tree) {
            var live = tree.filter(function (c) { return c.pros + c.orgs > 0; });
            if (!live.length) {
                node.innerHTML = '<div class="dir-state"><b>No listings yet</b>' +
                    "Swadharma operates in India and the United States. Territories fill in here as " +
                    "professionals and institutions complete empanelment.</div>";
                return;
            }
            node.innerHTML = '<div class="terr-cols">' + live.map(function (c) {
                var states = c.states.filter(function (s) { return s.pros + s.orgs > 0; });
                var body = states.length
                    ? states.map(function (s) {
                        return '<button type="button" data-country="' + SW.esc(c.code) +
                            '" data-state="' + SW.esc(s.name) + '">' +
                            "<span>" + SW.esc(s.name) + "</span>" +
                            '<span class="n">' + (s.pros + s.orgs) + "</span></button>";
                    }).join("")
                    : '<p class="empty">Listed nationally.</p>';
                return '<div class="terr-col"><h3>' + SW.esc(c.name) +
                    " · " + (c.pros + c.orgs) + "</h3>" + body + "</div>";
            }).join("") + "</div>";

            node.addEventListener("click", function (e) {
                var btn = e.target.closest("button[data-state]");
                if (!btn) return;
                SW.territory.set({
                    country: btn.dataset.country,
                    state: btn.dataset.state,
                    city: "",
                    postalCode: ""
                });
                SW.territory.syncUrl();
            });
        }).catch(function () {
            node.innerHTML = '<div class="dir-state">Territories are unavailable just now.</div>';
        });
    }

    rails();
    where();
    SW.territory.onChange(rails);
})();
