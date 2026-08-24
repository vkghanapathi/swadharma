/* page-seva-wall.js — the demonstration wall on swadharmaservices.in.

   seva-wall.js reads an installation's own endpoint. swadharmaservices.in is
   not an installation and has no sevas of its own, so this page serves the
   module a small illustrative payload from a data: URL — the same code path a
   tenant uses, exercising the same rendering, but visibly an example rather
   than anybody's real donors.

   The entries are invented, and deliberately look it. Putting plausible Indian
   names and a "since 2014" on a public page would be manufacturing donors for a
   temple that has none, which is the kind of thing that gets quoted back as
   fact. They are labelled as illustrative on the page above. */
(function () {
    "use strict";

    var node = SW.el("sevaWallDemo");
    if (!node) return;

    var params = new URLSearchParams(window.location.search);
    var layout = params.get("layout") === "wall" ? "wall" : "grid";

    /* An illustrative payload covering every case the wall must handle:
       a corpus donor who opted in, a corpus donor who did not, a booking with a
       deity image configured, and a booking with neither photo nor deity image
       so the drawn emblem shows. */
    function sample(tithi, locality, dateIso) {
        return {
            date: dateIso,
            tithi: tithi,
            locality: locality,
            sevas: [
                {
                    id: "eg-1", kind: "corpus",
                    sevaName: "Nitya Abhiṣeka", sevaCode: "ABHISHEKA",
                    name: "(example) A named corpus donor",
                    photo: null, deityImage: null,
                    gotram: "Bhāradvāja", nakshatram: "Rohiṇī",
                    occasion: null, inTheNameOf: "their late father",
                    servicesList: "Abhiṣeka, Alaṅkāra and Naivedya, offered every year on this day.",
                    organisation: "Example Kṣetram", since: 2014
                },
                {
                    id: "eg-2", kind: "corpus",
                    sevaName: "Sahasranāma Arcana", sevaCode: "ARCANA",
                    name: null,                       // withheld by the donor
                    photo: null, deityImage: null,
                    gotram: null, nakshatram: null,
                    occasion: null, inTheNameOf: null,
                    servicesList: null,
                    organisation: "Example Kṣetram", since: 2019
                },
                {
                    id: "eg-3", kind: "booking",
                    sevaName: "Pārvaṇa Śrāddha", sevaCode: "SHRAADDHA",
                    name: "(example) A family booking today",
                    photo: null, deityImage: null,
                    gotram: "Kāśyapa", nakshatram: "Maghā",
                    occasion: "Ābdika", inTheNameOf: null,
                    servicesList: null,
                    organisation: "Example Kṣetram", since: null
                }
            ]
        };
    }

    function mount(payload) {
        // data-payload is a real feature of the module — a host that already
        // has the data server-side renders without a second request — so the
        // demo goes through exactly the renderer a tenant gets, with no
        // demo-only code path to rot.
        var el = document.createElement("div");
        el.setAttribute("data-swadharma-seva-wall", "");
        el.setAttribute("data-title", "Today's Seva Kartas");
        el.setAttribute("data-layout", layout);
        el.setAttribute("data-rotate", "9");
        el.setAttribute("data-payload", JSON.stringify(payload));
        node.innerHTML = "";
        node.appendChild(el);

        if (window.SW_SEVA_WALL) SW_SEVA_WALL.mount(el);
    }

    function build() {
        var tithi = "", locality = "", dateIso = "";
        if (window.SW.panchanga && SW.panchanga.ready()) {
            var t = SW.panchanga.todayLine();
            tithi = t.lunar;
            locality = t.locality.name;
            dateIso = t.date;
        } else {
            var d = new Date();
            dateIso = d.getFullYear() + "-" +
                String(d.getMonth() + 1).padStart(2, "0") + "-" +
                String(d.getDate()).padStart(2, "0");
        }
        mount(sample(tithi, locality, dateIso));
    }

    if (window.SW.panchanga) {
        SW.panchanga.load().then(build).catch(build);
    } else {
        build();
    }
})();
