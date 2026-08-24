/* ===========================================================================
   panchanga-widget.js — the welcome tithi line, for an account holder's portal
   ---------------------------------------------------------------------------
   Drop this on any swadharma.* domain and it renders today's date, the time in
   the pañcāṅga's locality, and the tithi:

       <div data-swadharma-panchanga></div>
       <script src="https://swadharmaservices.in/panchanga-widget.js" async></script>

   It is self-contained: it finds its own origin from its script tag, pulls the
   table and the stylesheet from there, and needs no build step or dependency on
   the host page. Nothing is fetched with XHR, so there is no CORS to configure
   — the data is a script, which is one of the reasons it is shipped that way.

   Options, as data- attributes on the container:

       data-href="/panchanga"     make the tithi a link (default: not a link,
                                  because a tenant portal usually does not want
                                  to send its devotees to another domain)
       data-locality="Rajahmundry, Andhra Pradesh"
                                  the locality THIS account is reckoned by, if
                                  it differs from the published tables
       data-theme="dark"          light text, for a dark header

   ── The locality caveat, which is the whole reason this file is careful ──
   The tables published here are computed for Mysore. A tithi is not a global
   fact: it begins and ends at a moment, and which one stands at sunrise depends
   on where you are. An account whose reckoning was set to somewhere else at
   onboarding must say so, and `data-locality` is how it says so — the widget
   then labels the line with that name and marks the tithi as indicative.

   Setting data-locality does NOT recompute anything. It is a truthful label on
   borrowed figures, not a conversion. An account that needs its own reckoning
   needs its own tables.
   ========================================================================= */

(function () {
    "use strict";

    var self = document.currentScript;
    if (!self) {
        var all = document.getElementsByTagName("script");
        for (var i = all.length - 1; i >= 0; i -= 1) {
            if ((all[i].src || "").indexOf("panchanga-widget.js") > -1) { self = all[i]; break; }
        }
    }
    var ORIGIN = self ? new URL(self.src, window.location.href).origin
                      : "https://swadharmaservices.in";

    var TARGETS = document.querySelectorAll("[data-swadharma-panchanga]");
    if (!TARGETS.length) return;

    function esc(v) {
        return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function load(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement("script");
            s.src = src;
            s.async = true;
            s.onload = resolve;
            s.onerror = function () { reject(new Error("could not load " + src)); };
            document.head.appendChild(s);
        });
    }

    /* Styles are inlined rather than pulled from app.css: a tenant portal has
       its own design system and should not inherit ours wholesale. Everything
       is scoped under .swp- and inherits the host's font. */
    function styles() {
        if (document.getElementById("swp-style")) return;
        var css = document.createElement("style");
        css.id = "swp-style";
        css.textContent = [
            ".swp{display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px;",
            "font:inherit;font-size:13.5px;line-height:1.5;color:#51606E}",
            ".swp b{color:#1F3569;font-weight:650}",
            ".swp a{color:inherit;text-decoration:none}",
            ".swp a:hover b{text-decoration:underline}",
            ".swp-t{font-variant-numeric:tabular-nums}",
            ".swp-sep{color:#B6C2BC}",
            ".swp-n{margin-left:6px;color:#0B5A54}",
            ".swp-ob{padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:600;",
            "background:#E6F4F1;color:#0B5A54;border:1px solid #0F766E}",
            ".swp-loc{padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;",
            "background:#F4F8F6;color:#51606E;border:1px solid #D6DEDA;cursor:help}",
            ".swp-approx{font-style:italic}",
            ".swp[data-theme=dark]{color:rgba(255,255,255,.75)}",
            ".swp[data-theme=dark] b{color:#fff}",
            ".swp[data-theme=dark] .swp-loc{background:rgba(255,255,255,.1);",
            "color:rgba(255,255,255,.75);border-color:rgba(255,255,255,.25)}",
            ".swp[data-theme=dark] .swp-n{color:#C89939}"
        ].join("");
        document.head.appendChild(css);
    }

    function parts(data, when) {
        var loc = (data.meta && data.meta.locality) || {};
        var tz = loc.timezone || "Asia/Kolkata";
        try {
            var out = {};
            new Intl.DateTimeFormat("en-CA", {
                timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
                hour: "2-digit", minute: "2-digit", hour12: false
            }).formatToParts(when).forEach(function (p) { out[p.type] = p.value; });
            return out;
        } catch (e) {
            var d = when;
            return {
                year: String(d.getFullYear()),
                month: String(d.getMonth() + 1).padStart(2, "0"),
                day: String(d.getDate()).padStart(2, "0"),
                hour: String(d.getHours()).padStart(2, "0"),
                minute: String(d.getMinutes()).padStart(2, "0")
            };
        }
    }

    function draw(node, data) {
        var loc = (data.meta && data.meta.locality) || {};
        var p = parts(data, new Date());
        var key = p.year + "-" + p.month + "-" + p.day;
        var day = data.days[key];

        var shown = node.getAttribute("data-locality") || loc.name || "";
        var borrowed = !!node.getAttribute("data-locality");
        var href = node.getAttribute("data-href");
        var theme = node.getAttribute("data-theme");

        var when = new Date(Number(p.year), Number(p.month) - 1, Number(p.day));
        var gregorian = when.toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
        });
        var clock = p.hour + ":" + p.minute + (loc.tzLabel ? " " + loc.tzLabel : "");

        var html = '<span class="swp-g">' + esc(gregorian) + "</span>" +
                   '<span class="swp-t">' + esc(clock) + "</span>";

        if (day) {
            var lunar = "<b>" + esc((day.adhika ? "Adhika " : "") + day.ms + " " + day.pk + " " + day.ti) + "</b>" +
                (day.nk ? '<span class="swp-n">' + esc(day.nk) + "</span>" : "");
            html += '<span class="swp-sep" aria-hidden="true">·</span>' +
                (href ? '<a href="' + esc(href) + '">' + lunar + "</a>" : lunar);
            (day.ob || []).forEach(function (ob) {
                html += '<span class="swp-ob">' + esc(ob.short) + "</span>";
            });
        }

        // Whose tithi. Always present, and explicit when the account's own
        // locality differs from the tables these figures come from.
        var title = borrowed
            ? "This account is reckoned by " + shown + ". The figures shown are from the " +
              (loc.name || "published") + " pañcāṅga and are indicative; confirm the tithi with " +
              "your Purohita."
            : (loc.note || "Reckoned for " + (loc.name || "the published locality") + ".");

        html += '<span class="swp-loc' + (borrowed ? " swp-approx" : "") + '" title="' +
            esc(title) + '">' + esc(shown) + (borrowed ? " · indicative" : "") + "</span>";

        node.className = "swp";
        if (theme) node.setAttribute("data-theme", theme);
        node.innerHTML = html;
    }

    styles();

    var ready = window.SW_PANCHANGA_DATA
        ? Promise.resolve()
        : load(ORIGIN + "/panchanga.data.js");

    ready.then(function () {
        var data = window.SW_PANCHANGA_DATA;
        if (!data || !data.days) throw new Error("no pañcāṅga data");

        function paint() {
            Array.prototype.forEach.call(TARGETS, function (node) {
                try { draw(node, data); } catch (e) { node.textContent = ""; }
            });
        }
        paint();
        // Roll over at the locality's midnight without a reload.
        window.setInterval(paint, 60000);
    }).catch(function () {
        // A portal's header must not carry a broken element. Leave the
        // container as the host wrote it and say nothing.
        Array.prototype.forEach.call(TARGETS, function (node) {
            if (!node.textContent.trim()) node.style.display = "none";
        });
    });
})();
