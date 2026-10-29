/* page-about.js — renders the suite, territories, contact and offices out of
   catalogue.js, so dharmaposhanam.in/apps and this page cannot drift apart
   silently: there is one list, in one file. */
(function () {
    "use strict";

    var terr = SW.el("aboutTerr");
    if (terr) {
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
        terr.innerHTML = rows.join("");
    }

    var suite = SW.el("aboutSuite");
    if (suite) {
        var STATUS = {
            live: "",
            soon: '<span class="pill soon">In development</span>',
            consult: '<span class="pill soon">By consultation</span>'
        };
        suite.innerHTML = SW.SUITE.map(function (m) {
            var body =
                "<h3>" + SW.esc(m.no) + " · " + SW.esc(m.name) + (STATUS[m.status] || "") + "</h3>" +
                (m.sanskrit ? '<span class="sa">' + m.sanskrit + "</span>" : "") +
                "<p>" + SW.esc(m.what) + "</p>";

            if (m.self) {
                return '<div class="card">' + body + '<span class="go">You are here</span></div>';
            }
            if (!m.href) {
                return '<div class="card">' + body + "</div>";
            }
            return '<a class="card" href="' + SW.esc(m.href) + '" target="_blank" rel="noreferrer">' +
                body + '<span class="go">Open →</span></a>';
        }).join("");
    }

    var contact = SW.el("aboutContact");
    if (contact) {
        var c = SW.CONTACT;
        contact.innerHTML = [
            { k: "Email", v: c.email, href: "mailto:" + c.email },
            { k: "WhatsApp · India", v: c.waIndia.label, href: c.waIndia.href },
            { k: "WhatsApp · USA", v: c.waUsa.label, href: c.waUsa.href },
            { k: "Parent organisation", v: c.parent, href: "https://dharmaposhanam.in" }
        ].map(function (row) {
            return '<a class="card" href="' + SW.esc(row.href) + '">' +
                "<h3>" + SW.esc(row.k) + "</h3><p>" + SW.esc(row.v) + "</p></a>";
        }).join("");
    }

    var offices = SW.el("aboutOffices");
    if (offices) {
        offices.innerHTML = SW.OFFICES.map(function (o) {
            return '<div class="card"><h3>' + SW.esc(o.city) + "</h3><p>" + SW.esc(o.line) + "</p></div>";
        }).join("");
    }
})();
