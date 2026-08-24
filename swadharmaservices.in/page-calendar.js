/* page-calendar.js — the pañcāṅga calendar.

   Two views over the same table, because the amalgamated data makes neither
   reckoning secondary: a Gregorian month grid, and a Chandramāna māsa listed
   tithi by tithi. Both render from panchanga.json; neither is hand-maintained.

   Every day that carries an observance offers the rite that belongs to it, with
   the date already filled into the Request Wizard. */
(function () {
    "use strict";

    var P = SW.panchanga;
    var body = SW.el("calBody");
    if (!body) return;

    var view = "gregorian";
    var filter = "";
    var cursor = new Date();          // Gregorian view position
    var masaIndex = 0;                // Chandramāna view position
    var months = [];                  // lunar months present in the table

    /* ── Chrome ─────────────────────────────────────────────────────── */

    function fillSelect(select, items, selected) {
        select.innerHTML = items.map(function (i) {
            return '<option value="' + SW.esc(i.value) + '"' +
                (String(i.value) === String(selected) ? " selected" : "") + ">" +
                SW.esc(i.label) + "</option>";
        }).join("");
    }

    function setView(next) {
        view = next;
        SW.el("calTabG").setAttribute("aria-selected", String(view === "gregorian"));
        SW.el("calTabC").setAttribute("aria-selected", String(view === "chandra"));
        SW.el("calGregorian").hidden = view !== "gregorian";
        SW.el("calChandra").hidden = view !== "chandra";
        draw();
    }

    /* ── Day cell ───────────────────────────────────────────────────── */

    function matches(day) {
        if (!filter) return (day.ob || []).length > 0 || !!day.vs;
        return (day.ob || []).some(function (o) { return o.short === filter; });
    }

    function obChips(day) {
        return (day.ob || [])
            .filter(function (o) { return !filter || o.short === filter; })
            .map(function (o) {
                return '<span class="chip' + (o.late ? "" : " teal") + '">' +
                    SW.esc(o.short) + (o.late ? " (late)" : "") + "</span>";
            }).join("");
    }

    function cell(day) {
        var d = P.parseIso(day.date);
        var today = P.iso(new Date()) === day.date;
        var interesting = (day.ob || []).length > 0;
        var dim = filter && !matches(day);

        return '<button type="button" class="cal-cell' +
            (today ? " is-today" : "") +
            (interesting ? " has-ob" : "") +
            (dim ? " is-dim" : "") +
            '" data-date="' + day.date + '">' +
            '<span class="g">' + d.getDate() + "</span>" +
            '<span class="t">' + SW.esc(day.ti) + "</span>" +
            '<span class="c">' + obChips(day) + "</span>" +
            "</button>";
    }

    /* ── Views ──────────────────────────────────────────────────────── */

    function drawGregorian() {
        var year = cursor.getFullYear(), month = cursor.getMonth();
        var days = P.gregorianMonth(year, month);

        if (!days.length) {
            var meta = P.meta();
            body.innerHTML = '<div class="dir-state"><b>Outside the published year</b>' +
                "The pañcāṅga in use runs " + P.gregorianLabel(meta.from) + " to " +
                P.gregorianLabel(meta.to) + ". Use the arrows to come back inside it.</div>";
            SW.el("calCaption").textContent = "";
            return;
        }

        // Lead the grid with blanks so weekdays line up. Monday-first.
        var first = P.parseIso(days[0].date);
        var lead = (first.getDay() + 6) % 7;
        var blanks = new Array(lead).fill('<span class="cal-cell is-blank"></span>').join("");

        var head = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            .map(function (w) { return '<span class="cal-head">' + w + "</span>"; }).join("");

        body.innerHTML = '<div class="cal-grid">' + head + blanks +
            days.map(cell).join("") + "</div>";

        var spans = {};
        days.forEach(function (d) {
            var k = (d.adhika ? "Adhika " : "") + d.ms;
            spans[k] = true;
        });
        SW.el("calCaption").textContent =
            P.GREGORIAN_MONTHS[month] + " " + year + " spans " +
            Object.keys(spans).join(" and ") + " — " +
            days.filter(function (d) { return (d.ob || []).length; }).length +
            " days carry an observance.";
    }

    function drawChandra() {
        var m = months[masaIndex];
        if (!m) return;
        var days = P.lunarMonth(m.masa, m.adhika);

        var rows = days.filter(matches).map(function (day) {
            return '<button type="button" class="cal-row" data-date="' + day.date + '">' +
                '<span class="cr-t"><b>' + SW.esc(day.pk) + " " + SW.esc(day.ti) + "</b>" +
                (day.ti2 ? '<em> then ' + SW.esc(day.ti2) + "</em>" : "") + "</span>" +
                '<span class="cr-g">' + SW.esc(P.gregorianLabel(day.date)) + "</span>" +
                '<span class="cr-n">' + SW.esc(day.nk || "") + "</span>" +
                '<span class="cr-o">' + obChips(day) + "</span>" +
                "</button>";
        }).join("");

        body.innerHTML = rows
            ? '<div class="cal-list">' + rows + "</div>"
            : '<div class="dir-state"><b>Nothing matches that filter</b>' +
              "This māsa carries no " + SW.esc(filter) + ". Clear the filter to see the whole month.</div>";

        SW.el("calCaption").textContent =
            (m.adhika ? "Adhika " : "") + m.masa + " — " + days.length + " days, " +
            P.gregorianLabel(days[0].date) + " to " + P.gregorianLabel(days[days.length - 1].date) +
            (m.adhika
                ? ". This is the intercalary month; rites owed in Jyeṣṭha are performed in the nija month."
                : "");
    }

    function draw() {
        if (view === "gregorian") drawGregorian(); else drawChandra();
        SW.el("calDetail").hidden = true;
    }

    /* ── Day detail ─────────────────────────────────────────────────── */

    function openDay(dateIso) {
        var day = P.day(dateIso);
        var node = SW.el("calDetail");
        if (!day) { node.hidden = true; return; }

        var cautions = P.cautions(day).map(function (c) {
            return "<div><dt>" + c.label + "</dt><dd>" + SW.esc(c.value) +
                (c.exact ? "" : ' <span class="cal-verbatim">as printed</span>') + "</dd></div>";
        }).join("");

        var obs = (day.ob || []).map(function (o) {
            var q = new URLSearchParams({ service: o.service, date: day.date });
            return '<li><b>' + SW.esc(o.name) + "</b>" +
                (o.late
                    ? ' <span class="chip">begins ' + SW.esc(o.lateFrom || "late in the day") + "</span>"
                    : "") +
                '<span class="cal-kala">' + SW.esc(o.kala) + "</span>" +
                "<span>" + SW.esc(o.note) + "</span>" +
                '<a class="dir-link" href="/request?' + q.toString() + '">Request this →</a>' +
                "</li>";
        }).join("");

        node.hidden = false;
        node.innerHTML =
            '<button type="button" class="cal-close" aria-label="Close">&times;</button>' +
            "<h3>" + SW.esc(P.gregorianLabel(day.date)) + "</h3>" +
            '<p class="cal-lunar">' + SW.esc(P.lunarLabel(day)) +
            (day.adhika ? ' <span class="chip">Adhika māsa</span>' : "") + "</p>" +

            '<dl class="wiz-review">' +
            "<div><dt>Tithi</dt><dd>" + SW.esc(day.ti) +
            (day.tiEnd ? " until " + SW.esc(day.tiEnd) : "") +
            (day.ti2 ? ", then " + SW.esc(day.ti2) : "") + "</dd></div>" +
            "<div><dt>Nakṣatra</dt><dd>" + SW.esc(day.nk || "—") +
            (day.nkEnd ? " until " + SW.esc(day.nkEnd) : "") + "</dd></div>" +
            (day.yo ? "<div><dt>Yoga</dt><dd>" + SW.esc(day.yo) + "</dd></div>" : "") +
            (day.ka ? "<div><dt>Karaṇa</dt><dd>" + SW.esc(day.ka) + "</dd></div>" : "") +
            (day.sr || day.ss
                ? "<div><dt>Sun</dt><dd>" +
                  (day.sr ? "rises " + SW.esc(day.sr) : "") +
                  (day.sr && day.ss ? " · " : "") +
                  (day.ss ? "sets " + SW.esc(day.ss) : "") + "</dd></div>"
                : "") +
            cautions +
            "</dl>" +

            (day.vs
                ? '<p class="cal-printed"><b>From the pañcāṅga:</b> ' + SW.esc(day.vs) + "</p>"
                : "") +

            (obs ? '<ul class="cal-obs">' + obs + "</ul>" : "") +

            '<div class="btn-row" style="margin-top:14px">' +
            '<a class="btn" href="/request?date=' + day.date + '">Request a service on this day</a>' +
            "</div>";

        node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    body.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-date]");
        if (btn) openDay(btn.dataset.date);
    });
    SW.el("calDetail").addEventListener("click", function (e) {
        if (e.target.closest(".cal-close")) SW.el("calDetail").hidden = true;
    });

    /* ── Navigation ─────────────────────────────────────────────────── */

    SW.el("calTabG").addEventListener("click", function () { setView("gregorian"); });
    SW.el("calTabC").addEventListener("click", function () { setView("chandra"); });

    SW.el("calPrev").addEventListener("click", function () { step(-1); });
    SW.el("calNext").addEventListener("click", function () { step(1); });

    function step(by) {
        if (view === "gregorian") {
            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + by, 1);
            syncGregorianSelects();
        } else {
            masaIndex = Math.min(months.length - 1, Math.max(0, masaIndex + by));
            SW.el("calMasa").value = months[masaIndex].id;
        }
        draw();
    }

    SW.el("calToday").addEventListener("click", function () {
        var today = P.iso(new Date());
        if (P.covers(today)) {
            var d = P.day(today);
            cursor = P.parseIso(today);
            months.forEach(function (m, i) {
                if (m.masa === d.ms && m.adhika === !!d.adhika) masaIndex = i;
            });
        }
        syncGregorianSelects();
        SW.el("calMasa").value = months[masaIndex].id;
        draw();
        if (P.covers(today)) openDay(today);
    });

    function syncGregorianSelects() {
        SW.el("calMonth").value = String(cursor.getMonth());
        SW.el("calYear").value = String(cursor.getFullYear());
    }

    SW.el("calMonth").addEventListener("change", function () {
        cursor = new Date(Number(SW.el("calYear").value), Number(this.value), 1);
        draw();
    });
    SW.el("calYear").addEventListener("change", function () {
        cursor = new Date(Number(this.value), Number(SW.el("calMonth").value), 1);
        draw();
    });
    SW.el("calMasa").addEventListener("change", function () {
        var self = this;
        months.forEach(function (m, i) { if (m.id === self.value) masaIndex = i; });
        draw();
    });
    SW.el("calFilter").addEventListener("change", function () {
        filter = this.value;
        draw();
    });

    /* ── Chandramāna lookup ─────────────────────────────────────────── */

    function setupLookup() {
        fillSelect(SW.el("luMasa"), months.map(function (m) {
            return { value: m.id, label: (m.adhika ? "Adhika " : "") + m.masa };
        }));
        fillSelect(SW.el("luTithi"), P.TITHI_ORDER.map(function (t) {
            return { value: String(t.n), label: t.name };
        }).concat([
            { value: "15", label: "Pūrṇimā" },
            { value: "30", label: "Amāvāsyā" }
        ]));
        fillSelect(SW.el("luService"), [{ value: "", label: "Not sure yet" }].concat(
            SW.CATALOGUE.filter(function (s) { return s.requestable !== false; })
                .map(function (s) { return { value: s.slug, label: s.name }; })
        ));

        SW.el("lunarLookup").addEventListener("submit", function (e) {
            e.preventDefault();
            var id = SW.el("luMasa").value;
            var chosen = months.filter(function (m) { return m.id === id; })[0];
            var paksha = SW.el("luPaksha").value;
            var tithi = Number(SW.el("luTithi").value);
            var service = SW.el("luService").value;

            // Amāvāsyā only ever falls in Kṛṣṇa and Pūrṇimā only in Śukla.
            // Silently returning nothing would look like a broken form.
            if (tithi === 30 && paksha !== "Kṛṣṇa") {
                return note("Amāvāsyā is the last day of the Kṛṣṇa pakṣa. Switch the pakṣa and try again.");
            }
            if (tithi === 15 && paksha !== "Śukla") {
                return note("Pūrṇimā is the last day of the Śukla pakṣa. Switch the pakṣa and try again.");
            }

            var hits = P.find({
                masa: chosen.masa, adhika: chosen.adhika, paksha: paksha, tithi: tithi
            });

            if (!hits.length) {
                return note("That tithi does not occur in " +
                    (chosen.adhika ? "Adhika " : "") + chosen.masa + " " + paksha +
                    " this year — it can be skipped when two tithis fall in one day. " +
                    "Start a request and we will place it on the correct day.");
            }

            SW.el("lunarResult").innerHTML = '<div class="cal-hits">' + hits.map(function (h) {
                var q = new URLSearchParams({ date: h.date });
                if (service) q.set("service", service);
                return '<div class="cal-hit">' +
                    "<b>" + SW.esc(P.gregorianLabel(h.date)) + "</b>" +
                    "<span>" + SW.esc(P.lunarLabel(h)) +
                    (h.late
                        ? " — begins " + SW.esc(h.lateFrom || "late in the day") +
                          ", so it does not hold at sunrise"
                        : "") + "</span>" +
                    (h.rk ? '<span class="cal-avoid">Rāhukāla ' + SW.esc(h.rk) + "</span>" : "") +
                    '<a class="btn sm" href="/request?' + q.toString() + '">Request this date</a>' +
                    "</div>";
            }).join("") + "</div>";
        });
    }

    function note(text) {
        SW.el("lunarResult").innerHTML = '<div class="dir-state">' + SW.esc(text) + "</div>";
    }

    /* ── Go ─────────────────────────────────────────────────────────── */

    P.load().then(function () {
        var meta = P.meta();
        months = P.lunarMonths();

        // Years and months the table actually covers, so the selects cannot
        // navigate somewhere with no data behind it.
        var from = P.parseIso(meta.from), to = P.parseIso(meta.to);
        var years = [];
        for (var y = from.getFullYear(); y <= to.getFullYear(); y += 1) {
            years.push({ value: String(y), label: String(y) });
        }
        fillSelect(SW.el("calYear"), years);
        fillSelect(SW.el("calMonth"), P.GREGORIAN_MONTHS.map(function (m, i) {
            return { value: String(i), label: m };
        }));
        fillSelect(SW.el("calMasa"), months.map(function (m) {
            return { value: m.id, label: (m.adhika ? "Adhika " : "") + m.masa };
        }));

        fillSelect(SW.el("calFilter"), [{ value: "", label: "All observances" }].concat(
            P.observanceTypes().map(function (t) {
                return { value: t.short, label: t.short + " (" + t.count + ")" };
            })
        ));

        // Open on today if the table covers it, otherwise on its first month.
        var today = P.iso(new Date());
        if (!P.covers(today)) cursor = from;
        var start = P.covers(today) ? P.day(today) : P.day(meta.from);
        months.forEach(function (m, i) {
            if (m.masa === start.ms && m.adhika === !!start.adhika) masaIndex = i;
        });

        syncGregorianSelects();
        SW.el("calMasa").value = months[masaIndex].id;

        // Deep link: /calendar?date=2026-08-28 or ?show=Ekādaśī
        var q = new URLSearchParams(window.location.search);
        if (q.get("show")) {
            filter = q.get("show");
            SW.el("calFilter").value = filter;
        }

        setupLookup();
        draw();

        if (q.get("date") && P.covers(q.get("date"))) {
            cursor = P.parseIso(q.get("date"));
            syncGregorianSelects();
            draw();
            openDay(q.get("date"));
        }

        var loc = P.locality();
        SW.el("calSource").innerHTML =
            "<b>Reckoned for " + SW.esc(loc.name) + ", " + SW.esc(loc.region) + ".</b> " +
            "A tithi is not a global fact — it begins and ends at a moment, and which one " +
            "stands at sunrise depends on where you are. Sunrise, sunset, rāhukāla, varjya " +
            "and durmuhūrta below are all local to " + SW.esc(loc.name) + " (" +
            SW.esc(loc.tzLabel) + "). Each Swadharma account is set to its own locality when " +
            "the account is created; this public calendar and the demo installation use " +
            SW.esc(loc.name) + ".<br><br>" +
            "<b>Source.</b> " + SW.esc(meta.source) + " — " + meta.days + " days, " +
            SW.esc(P.gregorianLabel(meta.from)) + " to " + SW.esc(P.gregorianLabel(meta.to)) +
            ", " + SW.esc(meta.samvatsara) + " saṃvatsara. " +
            "Rāhukāla and durmuhūrta are exact clock ranges. Tithi and nakṣatra end times, and " +
            "varjya, are reproduced exactly as the pañcāṅga prints them, markers and all — " +
            "we do not re-derive them. Where a date matters, confirm it on the verification call.";
    }).catch(function () {
        body.innerHTML = '<div class="dir-state"><b>The pañcāṅga could not be loaded</b>' +
            "Please try again. You can still start a service request and name the tithi in " +
            "your own words — we will work out the date with you.</div>";
        SW.el("calCaption").textContent = "";
    });
})();
