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

    /* An illustrative payload. The names and places are invented; the deity
       images are the platform's own, the same files a tenant portal serves for
       these services.

       No card carries a donor photograph, and that is deliberate rather than an
       omission. Putting a stranger's face on a public page to demonstrate a
       feature is not something to do casually, and the case the demo needs to
       show is the one that governs most cards on a real wall anyway: no
       photograph, so the deity image for the seva stands in its place. The
       opted-in path is exercised in test_browser.mjs, where no real face is
       needed to prove an <img> renders. */
    function sample(tithi, locality, dateIso) {
        return {
            date: dateIso,
            tithi: tithi,
            locality: locality,
            sevas: [
                {
                    id: "eg-1", kind: "corpus",
                    sevaName: "Nitya Abhiṣeka", sevaCode: "ABHISHEKA",
                    name: "Śrīnivāsa Rao and family",
                    place: "Rajahmundry, Andhra Pradesh",
                    photo: null, deityImage: "/images/deity-abhisheka.jpg",
                    gotram: "Bhāradvāja", nakshatram: "Rohiṇī",
                    occasion: null, inTheNameOf: "Late Sri Venkata Ramana Rao",
                    servicesList: "Abhiṣeka, Alaṅkāra and Naivedya, offered every year on this day.",
                    organisation: "Demonstration Kṣetram", since: 2014
                },
                {
                    id: "eg-2", kind: "corpus",
                    sevaName: "Sahasranāma Arcana", sevaCode: "ARCANA",
                    name: null,                       // withheld by the donor
                    place: null,
                    photo: null, deityImage: "/images/deity-archana.jpg",
                    gotram: null, nakshatram: null,
                    occasion: null, inTheNameOf: null,
                    servicesList: null,
                    organisation: "Demonstration Kṣetram", since: 2019
                },
                {
                    id: "eg-3", kind: "booking",
                    sevaName: "Pārvaṇa Śrāddha", sevaCode: "SHRAADDHA",
                    name: "Lakṣmī Devi and family",
                    place: "Mysuru, Karnataka",
                    photo: null, deityImage: "/images/deity-shraaddha.jpg",
                    gotram: "Kāśyapa", nakshatram: "Maghā",
                    occasion: "Ābdika", inTheNameOf: null,
                    servicesList: null,
                    organisation: "Demonstration Kṣetram", since: null
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
