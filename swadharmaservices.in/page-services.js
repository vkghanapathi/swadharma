/* page-services.js — the service catalogue, rendered from catalogue.js.
   Adding a service means adding an entry there; this page needs no edit. */
(function () {
    "use strict";

    var grid = SW.el("serviceGrid");
    if (!grid) return;

    var STATUS = {
        live: "",
        enrolling: '<span class="pill live">Enrolling</span>',
        soon: '<span class="pill soon">Soon</span>'
    };

    grid.innerHTML = SW.CATALOGUE.map(function (s) {
        var top = (s.includes || []).slice(0, 4).map(function (i) {
            return "<li>" + SW.esc(i.name) + "</li>";
        }).join("");
        var rest = (s.includes || []).length - 4;

        return '<a class="card" href="/services/' + s.slug + '">' +
            '<div class="icn">' + s.icon + "</div>" +
            "<h3>" + SW.esc(s.name) + (STATUS[s.status] || "") + "</h3>" +
            (s.sanskrit ? '<span class="sa">' + s.sanskrit + "</span>" : "") +
            "<p>" + SW.esc(s.tagline) + "</p>" +
            (top ? "<ul>" + top + (rest > 0 ? "<li>and " + rest + " more</li>" : "") + "</ul>" : "") +
            '<span class="go">' + (s.requestable ? "Explore and request →" : "Explore →") + "</span>" +
            "</a>";
    }).join("");
})();
