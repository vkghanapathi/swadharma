/* page-professionals.js — the professional directory.
   Territory and name go to the API. Specialty, language and Veda refine the
   loaded rows, and the controls stay hidden until there is something to
   refine — a filter that cannot change the result is worse than no filter. */
(function () {
    "use strict";

    SW.territory.adoptFromUrl();
    SW.renderTerritoryBar(SW.el("proTerr"));

    var inputs = {
        q: SW.el("fName"),
        postalCode: SW.el("fPin"),
        state: SW.el("fState"),
        country: SW.el("fCountry")
    };

    // A territory chosen elsewhere pre-fills the form, so the two never disagree.
    var t = SW.territory.get();
    if (t.state) inputs.state.value = t.state;
    if (t.country) inputs.country.value = t.country;
    if (t.postalCode) inputs.postalCode.value = t.postalCode;

    var refineBox = SW.el("proRefine");
    var selSpecialty = SW.el("rSpecialty");
    var selLanguage = SW.el("rLanguage");
    var selVeda = SW.el("rVeda");

    function options(select, values) {
        var keep = select.value;
        var first = select.options[0].textContent;
        select.innerHTML = '<option value="">' + first + "</option>" +
            values.map(function (v) {
                return '<option value="' + SW.esc(v) + '">' + SW.esc(v) + "</option>";
            }).join("");
        if (values.indexOf(keep) !== -1) select.value = keep;
    }

    function unique(rows, pick) {
        var seen = {};
        rows.forEach(function (r) {
            [].concat(pick(r) || []).forEach(function (v) {
                if (v) seen[v] = true;
            });
        });
        return Object.keys(seen).sort();
    }

    var dir = new SW.Directory({
        kind: "professionals",
        grid: SW.el("proGrid"),
        state: SW.el("proState"),
        count: SW.el("proCount"),
        more: SW.el("proMore"),
        inputs: inputs,
        noun: "professional",
        empty: "No professionals match this search. Try a wider territory, or start a service " +
               "request — it reaches the whole network, including professionals without a " +
               "published profile.",
        blank: "Professionals appear here as they complete empanelment. Until then, a service " +
               "request goes straight to the Swadharma coordination desk.",
        onRows: function (rows) {
            var specialties = unique(rows, function (r) { return r.verifiedCategories || r.specializations; });
            var languages = unique(rows, function (r) { return r.languages || r.languagesKnown; });
            var vedas = unique(rows, function (r) { return r.veda; });

            var useful = specialties.length > 1 || languages.length > 1 || vedas.length > 1;
            refineBox.hidden = !useful;
            if (!useful) return;

            options(selSpecialty, specialties);
            options(selLanguage, languages);
            options(selVeda, vedas);
        }
    });

    function applyRefine() {
        var s = selSpecialty.value, l = selLanguage.value, v = selVeda.value;
        if (!s && !l && !v) { dir.setRefine(null); return; }
        dir.setRefine(function (r) {
            var cats = r.verifiedCategories || r.specializations || [];
            var langs = r.languages || r.languagesKnown || [];
            if (s && cats.indexOf(s) === -1) return false;
            if (l && langs.indexOf(l) === -1) return false;
            if (v && r.veda !== v) return false;
            return true;
        });
    }

    [selSpecialty, selLanguage, selVeda].forEach(function (sel) {
        sel.addEventListener("change", applyRefine);
    });

    SW.el("fClear").addEventListener("click", function () {
        Object.keys(inputs).forEach(function (k) { inputs[k].value = ""; });
        selSpecialty.value = selLanguage.value = selVeda.value = "";
        dir.setRefine(null);
        SW.territory.clear();
        SW.territory.syncUrl();
        dir.reload();
    });

    SW.el("proFilters").addEventListener("submit", function (e) { e.preventDefault(); });

    dir.reload();
})();
