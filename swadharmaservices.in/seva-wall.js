/* ===========================================================================
   seva-wall.js — today's Seva Kartas, for a wall or a portal header
   ---------------------------------------------------------------------------
   Modelled on the donor wall running at disa.sgsdatta.in
   (src/disa/routers/donor_wall.py + templates/donor_wall/display.html), which
   is the proven implementation. Two things are carried over deliberately:

     1. Both kinds of seva karta appear together — a one-time booking for today,
        and a permanent Mūla Nidhi corpus donor whose seva recurs on this day
        every year. DISA models the second with `sevaDay` as MMDD; the recurrence
        is the point, and a wall that showed only today's fresh bookings would
        leave the shashwata donors off the wall they endowed.

     2. Privacy is per seva, not per person, and it is honoured by OMITTING —
        `hide_name` and `hide_photo` in DISA. The payload contract below has the
        server send null, so a donor who has not opted in cannot be exposed by a
        rendering bug on this side. Nothing here ever reads a contact field,
        because the contract never carries one.

   What is NOT carried over: DISA falls back to a coloured circle with the
   donor's initial. The requirement here is a deity image relevant to the seva
   (VKG, 2026-08-24), so that is implemented fresh — and where a tenant has not
   supplied one, a drawn emblem stands in rather than a letter.

   USE — on a tenant portal or a TV in the temple hall:

       <div data-swadharma-seva-wall
            data-endpoint="/api/v1/public/seva-wall"
            data-title="Today's Seva Kartas"></div>
       <script src="https://swadharmaservices.in/seva-wall.js" async></script>

   Attributes:
       data-endpoint    where today's sevas come from (see the contract below)
       data-org         organisation id, when the endpoint serves several
       data-title       heading; omit for none
       data-rotate      seconds per card in wall mode (default 9, 0 = no rotation)
       data-layout      "wall" (one large rotating card) or "grid" (all at once)
       data-deities     JSON, seva code -> image URL, for the fallback image
       data-theme       "dark" for a dark background

   ── THE PAYLOAD CONTRACT ────────────────────────────────────────────────
   GET <endpoint>?date=YYYY-MM-DD&org=<id>

   {
     "date": "2026-08-24",
     "tithi": "Śrāvaṇa Śukla Dvādaśī",     // optional, shown in the header
     "locality": "Mysore",                  // whose reckoning the tithi is
     "sevas": [{
       "id":           "opaque",
       "kind":         "corpus" | "booking",
       "sevaName":     "Abhiṣeka",
       "sevaCode":     "ABHISHEKA",         // keys the deity image
       "name":         "…" | null,          // null = not opted in. Not "".
       "photo":        "https://…" | null,  // null = not opted in, or none held
       "deityImage":   "https://…" | null,  // per seva, from the tenant
       "gotram":       "…" | null,
       "nakshatram":   "…" | null,
       "occasion":     "…" | null,
       "inTheNameOf":  "…" | null,
       "servicesList": "…" | null,
       "organisation": "…" | null,
       "since":        2014 | null          // corpus donors: endowed since
     }]
   }

   The server MUST apply the privacy projection and MUST NOT send a field the
   donor has not consented to publish — null, not empty string, so that
   "withheld" and "not recorded" stay distinguishable. No endpoint feeding this
   should ever carry phone, email, address or amount.
   ========================================================================= */

(function () {
    "use strict";

    // No early return on an empty page. A host that creates its container after
    // this script has run — a tab, a modal, this site's own demo — still needs
    // SW_SEVA_WALL.mount() to exist, and bailing out here left it undefined.
    var self = document.currentScript;
    if (!self) {
        var all = document.getElementsByTagName("script");
        for (var i = all.length - 1; i >= 0; i -= 1) {
            if ((all[i].src || "").indexOf("seva-wall.js") > -1) { self = all[i]; break; }
        }
    }
    var ORIGIN = self ? new URL(self.src, window.location.href).origin
                      : "https://swadharmaservices.in";

    function esc(v) {
        return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    /* ── The stand-in image ──────────────────────────────────────────────
       When a donor has not opted to show a photograph, the seva's own deity
       image takes its place. A tenant supplies those; where none is configured
       this draws a lamp within a lotus — an emblem, not a portrait, and not a
       letter in a circle. It must never look like a placeholder for a missing
       person, because nobody is missing: the donor chose not to appear. */
    function emblem(seed) {
        var hues = ["#C89939", "#0F766E", "#1F3569", "#9E7724", "#0B5A54"];
        var hue = hues[Math.abs(hashCode(seed || "seva")) % hues.length];
        return '<svg class="swv-emblem" viewBox="0 0 120 120" role="img" ' +
            'aria-label="Deity emblem for this seva" focusable="false">' +
            '<circle cx="60" cy="60" r="58" fill="' + hue + '" opacity="0.10"/>' +
            '<circle cx="60" cy="60" r="44" fill="none" stroke="' + hue + '" ' +
            'stroke-width="1.5" opacity="0.45"/>' +
            // eight lotus petals
            petals(hue) +
            // the lamp
            '<path d="M60 44c-3.5 0-6 2.6-6 5.9 0 3.4 2.6 5.4 6 9.6 3.4-4.2 6-6.2 6-9.6 ' +
            '0-3.3-2.5-5.9-6-5.9z" fill="' + hue + '"/>' +
            '<path d="M42 68h36c0 6.6-8 11-18 11s-18-4.4-18-11z" fill="' + hue + '" opacity="0.85"/>' +
            '<rect x="55" y="79" width="10" height="4" rx="1.4" fill="' + hue + '" opacity="0.7"/>' +
            '<ellipse cx="60" cy="86" rx="15" ry="3" fill="' + hue + '" opacity="0.35"/>' +
            "</svg>";
    }

    function petals(hue) {
        var out = "";
        for (var a = 0; a < 360; a += 45) {
            out += '<ellipse cx="60" cy="22" rx="5.5" ry="12" fill="' + hue +
                '" opacity="0.22" transform="rotate(' + a + ' 60 60)"/>';
        }
        return out;
    }

    function hashCode(s) {
        var h = 0;
        for (var i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return h;
    }

    /* ── Styles, scoped under .swv- and inheriting the host's font ─────── */
    function styles() {
        if (document.getElementById("swv-style")) return;
        var css = document.createElement("style");
        css.id = "swv-style";
        css.textContent = [
            ".swv{font:inherit;color:#1F2A37}",
            ".swv-head{display:flex;align-items:baseline;justify-content:space-between;",
            "gap:12px;flex-wrap:wrap;margin:0 0 14px}",
            ".swv-head h2{margin:0;font-size:20px;color:#1F3569;letter-spacing:-.3px}",
            ".swv-when{font-size:13px;color:#51606E}",
            ".swv-when b{color:#0B5A54;font-weight:650}",
            ".swv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:14px}",
            ".swv-card{display:flex;gap:14px;align-items:flex-start;background:#fff;",
            "border:1px solid #D6DEDA;border-radius:14px;padding:15px 16px;",
            "box-shadow:0 1px 2px rgba(31,53,105,.06)}",
            ".swv-card.is-corpus{border-left:3px solid #C89939}",
            ".swv-card.is-booking{border-left:3px solid #0F766E}",
            ".swv-pic{flex:none;width:74px;height:74px;border-radius:50%;overflow:hidden;",
            "background:#F4F8F6;display:grid;place-items:center}",
            ".swv-pic img{width:100%;height:100%;object-fit:cover;display:block}",
            ".swv-emblem{width:100%;height:100%;display:block}",
            ".swv-body{min-width:0;display:flex;flex-direction:column;gap:2px}",
            ".swv-name{font-size:16.5px;color:#1F3569;font-weight:650;line-height:1.3}",
            ".swv-name.is-withheld{color:#51606E;font-weight:550;font-style:italic}",
            ".swv-seva{font-size:13.5px;color:#0B5A54;font-weight:600}",
            ".swv-meta{font-size:12.5px;color:#51606E;line-height:1.5}",
            ".swv-meta span{margin-right:10px}",
            ".swv-meta b{color:#1F2A37;font-weight:600}",
            ".swv-tag{display:inline-block;margin-top:5px;padding:1px 9px;border-radius:999px;",
            "font-size:10.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase}",
            ".swv-tag.corpus{background:#FBF3E2;color:#9E7724;border:1px solid #C89939}",
            ".swv-tag.booking{background:#E6F4F1;color:#0B5A54;border:1px solid #0F766E}",
            ".swv-note{margin:8px 0 0;font-size:12.5px;color:#51606E;font-style:italic;line-height:1.5}",
            ".swv-empty{padding:22px;text-align:center;font-size:14px;color:#51606E;",
            "background:#fff;border:1px dashed #B6C2BC;border-radius:14px}",
            ".swv-empty b{display:block;color:#1F3569;font-size:15px;margin-bottom:4px}",
            ".swv-foot{margin:10px 0 0;font-size:11.5px;color:#51606E}",
            // wall mode: one large card at a time
            ".swv[data-layout=wall] .swv-grid{grid-template-columns:1fr;max-width:760px;margin:0 auto}",
            ".swv[data-layout=wall] .swv-card{padding:28px 30px;gap:26px;align-items:center;",
            "animation:swvIn .7s ease-out}",
            ".swv[data-layout=wall] .swv-pic{width:150px;height:150px}",
            ".swv[data-layout=wall] .swv-name{font-size:27px}",
            ".swv[data-layout=wall] .swv-seva{font-size:16px}",
            ".swv[data-layout=wall] .swv-meta{font-size:14px}",
            "@keyframes swvIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}",
            ".swv-dots{display:flex;justify-content:center;gap:6px;margin-top:14px}",
            ".swv-dot{width:8px;height:8px;border-radius:50%;background:#B6C2BC;border:0;padding:0;cursor:pointer}",
            ".swv-dot[aria-current=true]{background:#1F3569;transform:scale(1.25)}",
            ".swv[data-theme=dark]{color:rgba(255,255,255,.8)}",
            ".swv[data-theme=dark] .swv-head h2{color:#fff}",
            ".swv[data-theme=dark] .swv-when{color:rgba(255,255,255,.7)}",
            ".swv[data-theme=dark] .swv-card{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.18)}",
            ".swv[data-theme=dark] .swv-name{color:#fff}",
            ".swv[data-theme=dark] .swv-seva{color:#C89939}",
            ".swv[data-theme=dark] .swv-meta,.swv[data-theme=dark] .swv-meta b{color:rgba(255,255,255,.75)}",
            ".swv[data-theme=dark] .swv-empty{background:rgba(255,255,255,.06);color:rgba(255,255,255,.75)}",
            "@media(prefers-reduced-motion:reduce){.swv-card{animation:none!important}}"
        ].join("");
        document.head.appendChild(css);
    }

    /* ── One card ────────────────────────────────────────────────────── */
    function card(seva, deities) {
        var corpus = seva.kind === "corpus";

        // The image, in the order the requirement states: the donor's own
        // photograph if they opted in, otherwise the deity image for this seva,
        // otherwise a drawn emblem.
        var deity = seva.deityImage ||
            (deities && seva.sevaCode ? deities[seva.sevaCode] : null) || null;
        var pic = seva.photo
            ? '<img src="' + esc(seva.photo) + '" alt="" loading="lazy">'
            : (deity
                ? '<img src="' + esc(deity) + '" alt="" loading="lazy">'
                : emblem(seva.sevaCode || seva.sevaName || seva.id));

        // A withheld name is a choice, not a gap. Say so in words that read as
        // dignified on a temple wall rather than as missing data.
        var name = seva.name
            ? '<div class="swv-name">' + esc(seva.name) + "</div>"
            : '<div class="swv-name is-withheld">Nāma gupta — offered without name</div>';

        var meta = [];
        if (seva.gotram) meta.push("<span><b>Gotra</b> " + esc(seva.gotram) + "</span>");
        if (seva.nakshatram) meta.push("<span><b>Nakṣatra</b> " + esc(seva.nakshatram) + "</span>");
        if (seva.occasion) meta.push("<span><b>Occasion</b> " + esc(seva.occasion) + "</span>");
        if (corpus && seva.since) meta.push("<span><b>Endowed</b> " + esc(seva.since) + "</span>");

        var inName = seva.inTheNameOf
            ? '<p class="swv-note">In the name of ' + esc(seva.inTheNameOf) + ".</p>"
            : "";
        var services = seva.servicesList
            ? '<p class="swv-note">' + esc(seva.servicesList) + "</p>"
            : "";

        return '<article class="swv-card ' + (corpus ? "is-corpus" : "is-booking") + '">' +
            '<div class="swv-pic">' + pic + "</div>" +
            '<div class="swv-body">' +
            name +
            (seva.sevaName ? '<div class="swv-seva">' + esc(seva.sevaName) + "</div>" : "") +
            (meta.length ? '<div class="swv-meta">' + meta.join("") + "</div>" : "") +
            inName + services +
            '<span class="swv-tag ' + (corpus ? "corpus" : "booking") + '">' +
            (corpus ? "Mūla Nidhi · permanent seva" : "Seva today") + "</span>" +
            "</div></article>";
    }

    /* ── One wall ────────────────────────────────────────────────────── */
    function Wall(node) {
        var self_ = this;
        var endpoint = node.getAttribute("data-endpoint");
        var org = node.getAttribute("data-org");
        var title = node.getAttribute("data-title");
        var layout = node.getAttribute("data-layout") || "grid";
        var theme = node.getAttribute("data-theme");
        var rotate = node.hasAttribute("data-rotate")
            ? parseInt(node.getAttribute("data-rotate"), 10) : 9;

        var deities = null;
        try { deities = JSON.parse(node.getAttribute("data-deities") || "null"); }
        catch (e) { deities = null; }

        var sevas = [];
        var slide = 0;
        var timer = null;

        node.className = "swv";
        node.setAttribute("data-layout", layout);
        if (theme) node.setAttribute("data-theme", theme);

        function head(payload) {
            if (!title && !payload) return "";
            var when = "";
            if (payload) {
                var bits = [];
                if (payload.date) {
                    var d = payload.date.split("-");
                    bits.push(new Date(+d[0], +d[1] - 1, +d[2]).toLocaleDateString("en-GB", {
                        weekday: "long", day: "numeric", month: "long", year: "numeric"
                    }));
                }
                // The tithi, where the endpoint gives one — and whose reckoning
                // it is, for the same reason the calendar says so.
                if (payload.tithi) {
                    bits.push("<b>" + esc(payload.tithi) + "</b>" +
                        (payload.locality ? " · " + esc(payload.locality) : ""));
                }
                when = '<span class="swv-when">' + bits.join(" · ") + "</span>";
            }
            return '<div class="swv-head">' +
                (title ? "<h2>" + esc(title) + "</h2>" : "<span></span>") + when + "</div>";
        }

        function render(payload) {
            var html = head(payload);

            if (!sevas.length) {
                node.innerHTML = html +
                    '<div class="swv-empty"><b>No seva karta listed for today</b>' +
                    "Sevas appear here on the day they are performed, and permanent " +
                    "Mūla Nidhi sevas on their day each year.</div>";
                return;
            }

            var shown = layout === "wall" ? [sevas[slide % sevas.length]] : sevas;
            html += '<div class="swv-grid">' + shown.map(function (s) {
                return card(s, deities);
            }).join("") + "</div>";

            if (layout === "wall" && sevas.length > 1) {
                html += '<div class="swv-dots">' + sevas.map(function (_, i) {
                    return '<button type="button" class="swv-dot" data-slide="' + i + '" ' +
                        'aria-current="' + (i === slide % sevas.length) + '" ' +
                        'aria-label="Seva karta ' + (i + 1) + '"></button>';
                }).join("") + "</div>";
            }

            var anon = sevas.filter(function (s) { return !s.name; }).length;
            if (anon) {
                html += '<p class="swv-foot">' + anon +
                    (anon === 1 ? " seva is" : " sevas are") +
                    " offered without a name at the seva karta's own wish.</p>";
            }

            node.innerHTML = html;
        }

        node.addEventListener("click", function (e) {
            var dot = e.target.closest("[data-slide]");
            if (!dot) return;
            slide = parseInt(dot.dataset.slide, 10);
            render(last);
            restart();
        });

        function restart() {
            window.clearInterval(timer);
            if (layout === "wall" && rotate > 0 && sevas.length > 1) {
                timer = window.setInterval(function () {
                    slide = (slide + 1) % sevas.length;
                    render(last);
                }, rotate * 1000);
            }
        }

        var last = null;

        function fail(message) {
            node.innerHTML = head(null) +
                '<div class="swv-empty"><b>The seva wall is not available</b>' +
                esc(message) + "</div>";
        }

        /** Take a payload straight, without a round trip. */
        this.show = function (payload) {
            last = payload;
            // Corpus donors first: they endowed the day.
            sevas = (payload.sevas || []).slice().sort(function (a, b) {
                if ((a.kind === "corpus") !== (b.kind === "corpus")) {
                    return a.kind === "corpus" ? -1 : 1;
                }
                return String(a.sevaName || "").localeCompare(String(b.sevaName || ""));
            });
            slide = 0;
            render(payload);
            restart();
        };

        this.load = function () {
            // data-payload lets a host that already has the data server-side
            // render without a second request. It is also how this site's own
            // demonstration works, so the demo exercises the real renderer
            // rather than a copy of it.
            var inline = node.getAttribute("data-payload");
            if (inline) {
                try {
                    self_.show(JSON.parse(inline));
                    return Promise.resolve();
                } catch (e) {
                    fail("The payload on this element is not valid JSON.");
                    return Promise.resolve();
                }
            }

            if (!endpoint) {
                // Not an error: the wall has simply not been pointed at a
                // source yet. Say which attribute is missing rather than
                // showing an empty frame that looks broken.
                fail("Set data-endpoint to the installation's seva-wall endpoint. " +
                     "The contract is documented at the top of seva-wall.js.");
                return Promise.resolve();
            }

            var url = endpoint + (endpoint.indexOf("?") > -1 ? "&" : "?") +
                "date=" + encodeURIComponent(todayIso()) + (org ? "&org=" + encodeURIComponent(org) : "");

            return fetch(url, { headers: { Accept: "application/json" } })
                .then(function (r) {
                    if (!r.ok) throw new Error("HTTP " + r.status);
                    return r.json();
                })
                .then(function (payload) { self_.show(payload); })
                .catch(function () {
                    fail("Please try again shortly.");
                });
        };
    }

    function todayIso() {
        // If the pañcāṅga library is on the page, use its locality's today —
        // the wall in a temple hall must turn over at the temple's midnight,
        // not the viewer's.
        if (window.SW && window.SW.panchanga && window.SW.panchanga.ready &&
            window.SW.panchanga.ready()) {
            return window.SW.panchanga.todayIso();
        }
        var d = new Date();
        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0");
    }

    styles();

    var walls = [];

    function mount(node) {
        var wall = new Wall(node);
        walls.push(wall);
        wall.load();
        return wall;
    }

    Array.prototype.forEach.call(
        document.querySelectorAll("[data-swadharma-seva-wall]"), mount
    );

    // Refresh every five minutes: a booking taken this morning should reach the
    // hall display without anybody touching the screen.
    window.setInterval(function () {
        walls.forEach(function (w) { w.load(); });
    }, 300000);

    /** mount() is for containers created after this script ran. */
    window.SW_SEVA_WALL = { mount: mount, walls: walls, origin: ORIGIN };
})();
