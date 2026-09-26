/* page-temples.js — the organisation directory, plus the operational nodes.
   Nodes are Kṣetrams Swadharma works with directly; they are named in
   catalogue.js and are not the same set as the empanelled organisations the
   API returns, so they render separately rather than being mixed in. */
(function () {
    "use strict";

    SW.territory.adoptFromUrl();
    SW.renderTerritoryBar(SW.el("orgTerr"));

    var inputs = {
        q: SW.el("gName"),
        postalCode: SW.el("gPin"),
        state: SW.el("gState"),
        country: SW.el("gCountry")
    };

    var t = SW.territory.get();
    if (t.state) inputs.state.value = t.state;
    if (t.country) inputs.country.value = t.country;
    if (t.postalCode) inputs.postalCode.value = t.postalCode;

    var dir = new SW.Directory({
        kind: "organisations",
        grid: SW.el("orgGrid"),
        state: SW.el("orgState"),
        count: SW.el("orgCount"),
        more: SW.el("orgMore"),
        inputs: inputs,
        noun: "organisation",
        empty: "No organisations match this search. Try a wider territory, or browse the " +
               "operational nodes below.",
        blank: "Organisations appear here once they join Swadharma."
    });

    SW.el("gClear").addEventListener("click", function () {
        Object.keys(inputs).forEach(function (k) { inputs[k].value = ""; });
        SW.territory.clear();
        SW.territory.syncUrl();
        dir.reload();
    });

    SW.el("orgFilters").addEventListener("submit", function (e) { e.preventDefault(); });
    dir.reload();

    var nodes = SW.el("orgNodes");
    if (nodes) {
        nodes.innerHTML = SW.NODES.map(function (n) {
            var card = SW.cards.organisation({
                name: n.name, city: n.city, state: n.state,
                description: n.description ||
                    "Operational node — ceremonies arranged through the Swadharma desk."
            });
            // A node with its own page on this site links to it rather than
            // off-site, so the card's action stays on Swadharma.
            if (n.page) {
                card = card.replace("</article>",
                    '<div class="dir-act"><a class="dir-link" href="' + SW.esc(n.page) +
                    '">See the kṣetram →</a></div></article>');
            }
            return card;
        }).join("");
    }
})();
