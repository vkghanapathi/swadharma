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

    function payload() {
        var v = function (id) { return (SW.el(id).value || "").trim(); };
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
            date: v("wDate"),
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

        var lines = [
            ["Service", p.serviceName],
            ["Ceremony", p.need || "—"],
            ["Where", where || "—"],
            ["Venue", p.venue],
            ["Date", p.date ? p.date + (p.time ? " · " + p.time : "") : "Not fixed"],
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
        return [
            "SWADHARMA SERVICE REQUEST",
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
            "Date           : " + (p.date || "not fixed"),
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
            (p.date ? " — " + p.date : "");
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
