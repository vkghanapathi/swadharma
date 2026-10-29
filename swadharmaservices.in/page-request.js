/* page-request.js — the Request Wizard, the primary conversion path.

   HOW IT SUBMITS, AND WHY
   -----------------------
   swadharma-api has no POST /api/v1/service-requests yet. Rather than post at a
   route that does not exist and lose people's requests silently, the wizard
   composes the structured request and hands it off by email, which works today
   and leaves a record on both sides. The intake screen is the part that had to
   be built first; the transport is one function.

   When the endpoint lands, replace submit() with the fetch and delete nothing
   else — the payload below is already the shape a service request should take.
   Keep the email path as the fallback for a failed POST: a request that reaches
   nobody is the one outcome this page must never produce. */
(function () {
    "use strict";

    var form = SW.el("wizForm");
    if (!form) return;

    var params = new URLSearchParams(window.location.search);
    SW.territory.adoptFromUrl();

    var state = { service: params.get("service") || "" };
    var current = 1;
    var LAST = 5;

    /* ── Step 1: services, from the catalogue ───────────────────────── */
    var pick = SW.el("wizServices");
    pick.innerHTML = SW.CATALOGUE.filter(function (s) {
        return s.requestable !== false;
    }).map(function (s) {
        return '<button type="button" data-slug="' + s.slug + '" aria-pressed="false">' +
            "<b>" + s.icon + " " + SW.esc(s.name) + "</b>" +
            "<span>" + SW.esc(s.tagline) + "</span></button>";
    }).join("") +
        '<button type="button" data-slug="other" aria-pressed="false">' +
        "<b>❓ Something else</b><span>Describe it and we will route it.</span></button>";

    pick.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-slug]");
        if (!btn) return;
        Array.prototype.forEach.call(pick.querySelectorAll("button"), function (b) {
            b.setAttribute("aria-pressed", String(b === btn));
        });
        state.service = btn.dataset.slug;
    });

    function preselect() {
        if (!state.service) return;
        var btn = pick.querySelector('button[data-slug="' + state.service + '"]');
        if (btn) btn.setAttribute("aria-pressed", "true");
    }
    preselect();

    /* ── Step 2: prefill from the persisted territory ───────────────── */
    var t = SW.territory.get();
    if (t.country) SW.el("wCountry").value = t.country;
    if (t.state) SW.el("wState").value = t.state;
    if (t.city) SW.el("wCity").value = t.city;
    if (t.postalCode) SW.el("wPin").value = t.postalCode;

    /* ── Step 3: two calendars over one pañcāṅga ────────────────────────
       Whichever reckoning the visitor holds the date in, the other is shown
       back to them before they continue, together with the day's rāhukāla and
       durmuhūrta. Both reckonings travel with the request, because "Śrāvaṇa
       Kṛṣṇa Saptamī" is the thing the family actually owes and the Gregorian
       date is only its shadow this year. */

    var P = SW.panchanga;
    var dateMode = "gregorian";
    var resolved = null;               // {date, day, late} once known
    var panchangaReady = false;

    function fill(select, items) {
        select.innerHTML = items.map(function (i) {
            return '<option value="' + SW.esc(i.value) + '">' + SW.esc(i.label) + "</option>";
        }).join("");
    }

    function setDateMode(mode) {
        dateMode = mode;
        SW.el("wCalG").setAttribute("aria-selected", String(mode === "gregorian"));
        SW.el("wCalC").setAttribute("aria-selected", String(mode === "chandra"));
        SW.el("wGregorian").hidden = mode !== "gregorian";
        SW.el("wChandra").hidden = mode !== "chandra";
        resolve();
    }

    SW.el("wCalG").addEventListener("click", function () { setDateMode("gregorian"); });
    SW.el("wCalC").addEventListener("click", function () { setDateMode("chandra"); });

    function showResolved(html, warn) {
        SW.el("wResolved").innerHTML = html
            ? '<div class="wiz-resolved' + (warn ? " is-warn" : "") + '">' + html + "</div>"
            : "";
    }

    function cautionLine(day) {
        var c = P.cautions(day);
        if (!c.length) return "";
        return '<span class="cal-avoid">Avoid: ' + c.map(function (x) {
            return SW.esc(x.label) + " " + SW.esc(x.value);
        }).join(" · ") + "</span>";
    }

    function resolve() {
        resolved = null;

        if (!panchangaReady) {
            // The wizard must work with or without the calendar loaded.
            showResolved("");
            return;
        }

        if (dateMode === "gregorian") {
            var value = SW.el("wDate").value;
            if (!value) { showResolved(""); return; }
            if (!P.covers(value)) {
                showResolved(
                    "<b>" + SW.esc(P.gregorianLabel(value)) + "</b>" +
                    "That date falls outside the published pañcāṅga (" +
                    SW.esc(P.gregorianLabel(P.meta().from)) + " to " +
                    SW.esc(P.gregorianLabel(P.meta().to)) +
                    "), so we cannot show you its tithi here. The request is still fine — " +
                    "we will confirm the tithi with you.", true);
                resolved = { date: value, day: null };
                return;
            }
            var day = P.day(value);
            resolved = { date: value, day: day, late: false };
            showResolved(
                "<b>" + SW.esc(P.lunarLabel(day)) + "</b>" +
                "Nakṣatra " + SW.esc(day.nk || "—") +
                (day.vs ? " · " + SW.esc(day.vs) : "") +
                cautionLine(day));
            return;
        }

        // Chandramāna -> Gregorian.
        var id = SW.el("wMasa").value;
        var chosen = null;
        P.lunarMonths().forEach(function (m) { if (m.id === id) chosen = m; });
        if (!chosen) { showResolved(""); return; }

        var paksha = SW.el("wPaksha").value;
        var tithi = Number(SW.el("wTithi").value);

        if (tithi === 30 && paksha !== "Kṛṣṇa") {
            return showResolved("Amāvāsyā is the last day of the Kṛṣṇa pakṣa. Switch the pakṣa.", true);
        }
        if (tithi === 15 && paksha !== "Śukla") {
            return showResolved("Pūrṇimā is the last day of the Śukla pakṣa. Switch the pakṣa.", true);
        }

        var hits = P.find({ masa: chosen.masa, adhika: chosen.adhika, paksha: paksha, tithi: tithi });

        if (!hits.length) {
            showResolved(
                "That tithi does not occur in " + (chosen.adhika ? "Adhika " : "") +
                SW.esc(chosen.masa) + " " + SW.esc(paksha) + " this year — a tithi can be " +
                "skipped when two of them fall inside one day. Send the request anyway and we " +
                "will place it on the day the śāstra prescribes.", true);
            return;
        }

        var hit = hits[0];
        resolved = { date: hit.date, day: hit, late: !!hit.late };
        showResolved(
            "<b>" + SW.esc(P.gregorianLabel(hit.date)) + "</b>" +
            SW.esc(P.lunarLabel(hit)) +
            (hit.late
                ? " — begins " + SW.esc(hit.lateFrom || "late in the day") +
                  ", so this tithi does not hold at sunrise"
                : "") +
            (hit.adhika
                ? " · this is the intercalary month; most rites are owed in the nija māsa"
                : "") +
            cautionLine(hit.day || hit),
            hit.late || hit.adhika);
    }

    SW.el("wDate").addEventListener("change", resolve);
    ["wMasa", "wPaksha", "wTithi"].forEach(function (id) {
        SW.el(id).addEventListener("change", resolve);
    });

    P.load().then(function () {
        panchangaReady = true;

        // Whose tithi. Said once here rather than repeated on every control.
        var loc = P.locality();
        SW.el("wLocality").textContent =
            "Tithi and muhūrta windows are reckoned for " + (loc.label || loc.name) +
            ". If your family keeps its rites by another locality's pañcāṅga, say so in " +
            "the notes on the next step — the reckoning is fixed per account when it is " +
            "created, and we will confirm yours on the verification call.";

        fill(SW.el("wMasa"), P.lunarMonths().map(function (m) {
            return { value: m.id, label: (m.adhika ? "Adhika " : "") + m.masa };
        }));
        fill(SW.el("wTithi"), P.TITHI_ORDER.map(function (x) {
            return { value: String(x.n), label: x.name };
        }).concat([
            { value: "15", label: "Pūrṇimā" },
            { value: "30", label: "Amāvāsyā" }
        ]));

        // A date arriving from the calendar page positions both calendars.
        var wanted = params.get("date");
        if (wanted && P.covers(wanted)) {
            SW.el("wDate").value = wanted;
            var d = P.day(wanted);
            P.lunarMonths().forEach(function (m) {
                if (m.masa === d.ms && m.adhika === !!d.adhika) SW.el("wMasa").value = m.id;
            });
            SW.el("wPaksha").value = d.pk;
            SW.el("wTithi").value = String(d.tn);
        } else if (wanted) {
            SW.el("wDate").value = wanted;
        }
        resolve();
    }).catch(function () {
        // No calendar: the Gregorian field alone still works, and step 4 lets
        // people describe the tithi in their own words.
        SW.el("wCalC").disabled = true;
        SW.el("wCalC").title = "The pañcāṅga could not be loaded";
        showResolved(
            "The pañcāṅga could not be loaded, so we cannot show the tithi for a date here. " +
            "Give the Gregorian date if you have one, or describe the tithi in the notes on the " +
            "next step — we will work it out with you.", true);
    });

    /* ── Navigation ─────────────────────────────────────────────────── */
    function panel(n) { return form.querySelector('[data-panel="' + n + '"]'); }

    function go(n) {
        if (n > current && !validate(current)) return;

        // Keep the territory in step with what was typed on step 2.
        if (current === 2) {
            SW.territory.set({
                country: SW.el("wCountry").value,
                state: SW.el("wState").value.trim(),
                city: SW.el("wCity").value.trim(),
                postalCode: SW.el("wPin").value.trim()
            });
        }

        panel(current).hidden = true;
        current = n;
        panel(current).hidden = false;

        Array.prototype.forEach.call(SW.el("wizSteps").children, function (li) {
            var step = parseInt(li.dataset.step, 10);
            li.dataset.state = step < current ? "done" : (step === current ? "current" : "");
        });

        if (current === LAST) review();
        window.scrollTo({ top: 0, behavior: "smooth" });
        var head = panel(current).querySelector("h2");
        if (head) { head.setAttribute("tabindex", "-1"); head.focus(); }
    }

    function fail(el, message) {
        el.focus();
        var hint = el.parentNode.querySelector(".hint");
        if (hint) { hint.textContent = message; hint.style.color = "var(--sw-gold-dark)"; }
        else {
            var span = document.createElement("span");
            span.className = "hint";
            span.style.color = "var(--sw-gold-dark)";
            span.textContent = message;
            el.parentNode.appendChild(span);
        }
        return false;
    }

    function validate(step) {
        if (step === 1) {
            if (!state.service && !SW.el("wNeed").value.trim()) {
                return fail(SW.el("wNeed"), "Pick a category above, or name the ceremony here.");
            }
        }
        if (step === 2) {
            var country = SW.el("wCountry");
            if (!country.value) return fail(country, "We need at least the country to match anyone.");
        }
        return true;
    }

    form.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-go]");
        if (btn) go(parseInt(btn.dataset.go, 10));
    });

    /* ── Step 5: review ─────────────────────────────────────────────── */
    function serviceName() {
        if (state.service === "other" || !state.service) return "Not specified";
        var s = SW.serviceBySlug(state.service);
        return s ? s.name : state.service;
    }

    /**
     * Both calendars travel with the request. The lunar date is the obligation
     * — "Śrāvaṇa Kṛṣṇa Saptamī" is what the family owes every year — and the
     * Gregorian date is only where it lands this once. A request carrying only
     * the second one loses the thing that has to be repeated.
     */
    function dates() {
        var typed = (SW.el("wDate").value || "").trim();
        var out = { gregorian: "", lunar: "", enteredAs: dateMode, note: "" };

        if (resolved && resolved.date) {
            out.gregorian = resolved.date;
            if (resolved.day) out.lunar = P.lunarLabel(resolved.day);
            if (resolved.late) out.note = "tithi begins late in the day, does not hold at sunrise";
            if (resolved.day && resolved.day.adhika) {
                out.note = (out.note ? out.note + "; " : "") + "adhika māsa";
            }
            return out;
        }

        // No pañcāṅga, or a date outside it. Carry whatever was actually given.
        out.gregorian = typed;
        if (dateMode === "chandra" && panchangaReady) {
            var id = SW.el("wMasa").value;
            var label = "";
            P.lunarMonths().forEach(function (m) {
                if (m.id === id) label = (m.adhika ? "Adhika " : "") + m.masa;
            });
            var tn = SW.el("wTithi").value;
            var name = "";
            P.TITHI_ORDER.concat([{ n: 15, name: "Pūrṇimā" }, { n: 30, name: "Amāvāsyā" }])
                .forEach(function (x) { if (String(x.n) === tn) name = x.name; });
            out.lunar = [label, SW.el("wPaksha").value, name].filter(Boolean).join(" ");
            out.note = "could not be resolved to a Gregorian date from the published pañcāṅga";
        }
        return out;
    }

    function payload() {
        var v = function (id) { return (SW.el(id).value || "").trim(); };
        var when = dates();
        return {
            service: state.service || "other",
            serviceName: serviceName(),
            need: v("wNeed"),
            territory: {
                country: SW.el("wCountry").value,
                state: v("wState"),
                city: v("wCity"),
                postalCode: v("wPin")
            },
            venue: SW.el("wVenue").value,
            date: when.gregorian,
            lunarDate: when.lunar,
            enteredAs: when.enteredAs,
            dateNote: when.note,
            time: SW.el("wTime").value,
            flexibility: SW.el("wFlex").value,
            language: v("wLang"),
            sampradaya: v("wSampradaya"),
            people: v("wPeople"),
            materials: SW.el("wMaterials").value,
            notes: v("wNotes"),
            contact: { name: v("wName"), email: v("wEmail"), phone: v("wPhone") }
        };
    }

    function review() {
        var p = payload();
        var names = { IN: "India", US: "United States" };
        var where = [p.territory.city, p.territory.state, names[p.territory.country], p.territory.postalCode]
            .filter(Boolean).join(" · ");

        var gregorian = p.date
            ? (P.covers(p.date) ? P.gregorianLabel(p.date) : p.date) + (p.time ? " · " + p.time : "")
            : "Not fixed";

        // The tithi leads. The ecosystem schedules on the Gregorian date — that
        // is the operative datum for a Purohita's diary — but what the devotee
        // is arranging is the tithi, and a booking that shows only the date has
        // hidden the thing they came for. So it is stated first, in full, with
        // the locality it is reckoned by, and the date sits under it.
        var loc = P.locality();
        SW.el("wizTithiHead").innerHTML = p.lunarDate
            ? '<span class="wiz-tithi-k">Tithi</span>' +
              '<b>' + SW.esc(p.lunarDate) + "</b>" +
              '<span class="wiz-tithi-g">' + SW.esc(gregorian) + "</span>" +
              (p.dateNote ? '<span class="wiz-tithi-note">' + SW.esc(p.dateNote) + "</span>" : "") +
              '<span class="wiz-tithi-loc">Reckoned for ' + SW.esc(loc.label || loc.name) + "</span>"
            : '<span class="wiz-tithi-k">Date</span>' +
              "<b>" + SW.esc(gregorian) + "</b>" +
              '<span class="wiz-tithi-note">No tithi recorded — we will confirm it with you.</span>';

        var lines = [
            ["Service", p.serviceName],
            ["Ceremony", p.need || "—"],
            ["Where", where || "—"],
            ["Venue", p.venue],
            ["Date is", p.flexibility],
            ["Language", p.language || "—"],
            ["Tradition", p.sampradaya || "—"],
            ["Attending", p.people || "—"],
            ["Materials", { Need: "Please supply", Have: "We will arrange our own", Unsure: "Please advise" }[p.materials]],
            ["Notes", p.notes || "—"]
        ];

        SW.el("wizReview").innerHTML = lines.map(function (l) {
            return "<div><dt>" + l[0] + "</dt><dd>" + SW.esc(l[1]) + "</dd></div>";
        }).join("");

        SW.el("wizHandoff").innerHTML =
            "Sending opens your email client with this request filled in, addressed to <b>" +
            SW.CONTACT.email + "</b>. Nothing is charged, and no payment detail is collected here. " +
            "We reply by email; your phone number is confirmed on the verification call.";
    }

    /* ── Submit ─────────────────────────────────────────────────────── */
    function asText(p) {
        var names = { IN: "India", US: "United States" };
        var loc = P.locality();
        return [
            "SWADHARMA SERVICE REQUEST",
            "",
            // Tithi first, for the same reason it leads on screen.
            "TITHI          : " + (p.lunarDate || "not given"),
            "  reckoned for : " + (loc.label || loc.name),
            "  falls on     : " + (p.date || "not fixed"),
            "",
            "Service        : " + p.serviceName,
            "Ceremony       : " + (p.need || "-"),
            "",
            "Country        : " + (names[p.territory.country] || p.territory.country || "-"),
            "State          : " + (p.territory.state || "-"),
            "City           : " + (p.territory.city || "-"),
            "PIN / ZIP      : " + (p.territory.postalCode || "-"),
            "Venue          : " + p.venue,
            "",
            "Entered as     : " + (p.enteredAs === "chandra" ? "Chandramana tithi" : "Gregorian date"),
            "Date note      : " + (p.dateNote || "-"),
            "Time           : " + (p.time || "no preference"),
            "Date is        : " + p.flexibility,
            "",
            "Language       : " + (p.language || "-"),
            "Tradition      : " + (p.sampradaya || "-"),
            "Attending      : " + (p.people || "-"),
            "Materials      : " + p.materials,
            "",
            "Notes          : " + (p.notes || "-"),
            "",
            "Name           : " + p.contact.name,
            "Email          : " + p.contact.email,
            "Phone          : " + (p.contact.phone || "-"),
            "",
            "Sent from swadharmaservices.in/request"
        ].join("\n");
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        var p = payload();

        if (!p.contact.name) return fail(SW.el("wName"), "We need a name to address you by.");
        if (!p.contact.email) return fail(SW.el("wEmail"), "We reply by email, so this one is required.");

        var subject = "Service request — " + p.serviceName +
            (p.territory.city ? " — " + p.territory.city : "") +
            (p.date ? " — " + p.date : "") +
            (p.lunarDate ? " (" + p.lunarDate + ")" : "");
        var href = "mailto:" + SW.CONTACT.email +
            "?subject=" + encodeURIComponent(subject) +
            "&body=" + encodeURIComponent(asText(p));

        panel(current).hidden = true;
        current = 6;
        panel(6).hidden = false;

        Array.prototype.forEach.call(SW.el("wizSteps").children, function (li) {
            li.dataset.state = "done";
        });

        SW.el("wizDone").innerHTML =
            '<p class="sub">Your email client should have opened with the request below already ' +
            "filled in. If it did not, copy the text and send it to <b>" + SW.CONTACT.email +
            "</b> — or use the buttons underneath.</p>" +
            '<pre style="white-space:pre-wrap;font-size:13px;background:var(--sw-cream);' +
            'border:1px solid var(--sw-border);border-radius:10px;padding:14px;overflow-x:auto">' +
            SW.esc(asText(p)) + "</pre>" +
            '<div class="btn-row" style="margin-top:16px">' +
            '<a class="btn" href="' + href + '">Open email again</a>' +
            '<button type="button" class="btn ghost" id="wizCopy">Copy the request</button>' +
            '<a class="btn ghost" href="/services">Back to services</a></div>' +
            '<p class="rail-note">Urgent Apara Karma and Śrāddha requests are triaged ahead of the ' +
            "queue — WhatsApp India " + SW.CONTACT.waIndia.label + " or USA " +
            SW.CONTACT.waUsa.label + " if the rite is within days.</p>";

        window.location.href = href;
        window.scrollTo({ top: 0, behavior: "smooth" });

        var copy = SW.el("wizCopy");
        if (copy) {
            copy.addEventListener("click", function () {
                var text = asText(p);
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(function () {
                        copy.textContent = "Copied";
                    }).catch(function () { copy.textContent = "Select the text above to copy"; });
                } else {
                    copy.textContent = "Select the text above to copy";
                }
            });
        }
    });

    go(1);
})();
