/* ===========================================================================
   app.js — AppShell behaviour and the front-end data layer
   ---------------------------------------------------------------------------
   Everything here is shared by every public page. It provides:

     SW.esc / SW.el           small helpers
     SW.api                   the one place that talks to swadharma-api
     SW.territory             the persisted territory selection (spec s.10)
     SW.cards                 ProfessionalCard / OrganisationCard renderers
     SW.Directory             a filterable, paginated directory panel
     SW.featured              daily / weekly rotation over live directory rows
     SW.tree                  Country > State > City, derived from live data
     shell()                  TopNav active state, mobile drawer, SideNav

   Two rules this file exists to enforce:

     1. The same ProfessionalCard and OrganisationCard render in search results,
        featured rails, territory pages and service pages (spec s.9). One
        renderer, four callers.
     2. Nothing here invents content. The network is young — there are two
        organisations and no listed professionals as of writing. Empty states
        say so plainly instead of padding the page with placeholders.
   ========================================================================= */

window.SW = window.SW || {};

(function () {
    "use strict";

    var API_BASE = "https://swadharma-api-332912113546.asia-south1.run.app";
    var STORE_KEY = "sw.territory.v1";

    /* ── helpers ─────────────────────────────────────────────────────── */

    SW.esc = function (value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    };

    SW.el = function (id) { return document.getElementById(id); };

    function place(row) {
        return [row.city, row.state, row.postalCode].filter(Boolean).join(" · ");
    }
    SW.place = place;

    /** localStorage is unavailable in some privacy modes; never let that throw. */
    function readStore() {
        try {
            var raw = window.localStorage.getItem(STORE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    function writeStore(value) {
        try {
            if (value) window.localStorage.setItem(STORE_KEY, JSON.stringify(value));
            else window.localStorage.removeItem(STORE_KEY);
        } catch (e) { /* browsing without storage still works, just without memory */ }
    }

    /* ── SW.api ──────────────────────────────────────────────────────── */

    SW.api = {
        base: API_BASE,

        get: function (path, params) {
            var query = new URLSearchParams();
            Object.keys(params || {}).forEach(function (k) {
                var v = params[k];
                if (v !== "" && v != null) query.set(k, v);
            });
            var url = API_BASE + path + (query.toString() ? "?" + query.toString() : "");
            return fetch(url, { headers: { Accept: "application/json" } }).then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            }).then(function (body) {
                return (body && body.data) || {};
            });
        },

        professionals: function (params) {
            return SW.api.get("/api/v1/directory/professionals", params).then(function (d) {
                return { rows: d.professionals || [], total: d.total || 0 };
            });
        },

        organisations: function (params) {
            return SW.api.get("/api/v1/directory/organisations", params).then(function (d) {
                return { rows: d.organisations || [], total: d.total || 0 };
            });
        }
    };

    /* ── SW.territory — persists while browsing the network (spec s.10) ─ */

    var listeners = [];

    SW.territory = {
        /** {country, state, city, postalCode} — any subset, all optional. */
        get: function () {
            return readStore() || {};
        },

        set: function (patch, opts) {
            var next = Object.assign({}, SW.territory.get(), patch || {});
            Object.keys(next).forEach(function (k) {
                if (!next[k]) delete next[k];
            });
            writeStore(Object.keys(next).length ? next : null);
            if (!opts || opts.silent !== true) emit(next);
            return next;
        },

        clear: function () {
            writeStore(null);
            emit({});
        },

        /** Query params for the directory API. */
        params: function () {
            var t = SW.territory.get();
            return { country: t.country || "", state: t.state || "", postalCode: t.postalCode || "" };
        },

        label: function () {
            var t = SW.territory.get();
            var names = { IN: "India", US: "United States" };
            var parts = [t.city, t.state, names[t.country] || t.country, t.postalCode].filter(Boolean);
            return parts.join(" · ");
        },

        isSet: function () { return Object.keys(SW.territory.get()).length > 0; },

        onChange: function (fn) { listeners.push(fn); },

        /** Read territory out of the URL first, so a shared link wins over memory. */
        adoptFromUrl: function () {
            var q = new URLSearchParams(window.location.search);
            var patch = {};
            ["country", "state", "city", "postalCode"].forEach(function (k) {
                var v = q.get(k);
                if (v) patch[k] = v;
            });
            if (Object.keys(patch).length) SW.territory.set(patch, { silent: true });
            return SW.territory.get();
        },

        /** Keep the address bar in step so the page can be shared or bookmarked. */
        syncUrl: function () {
            var t = SW.territory.get();
            var q = new URLSearchParams(window.location.search);
            ["country", "state", "city", "postalCode"].forEach(function (k) {
                if (t[k]) q.set(k, t[k]); else q.delete(k);
            });
            var qs = q.toString();
            window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
        }
    };

    function emit(next) {
        listeners.forEach(function (fn) {
            try { fn(next); } catch (e) { /* one bad listener must not stop the rest */ }
        });
    }

    /** Renders the "Showing: Mysuru · Karnataka [x]" bar into a container. */
    SW.renderTerritoryBar = function (node, opts) {
        if (!node) return;
        var o = opts || {};
        function draw() {
            if (!SW.territory.isSet()) {
                node.innerHTML = o.emptyHtml ||
                    '<span>Showing the whole network. ' +
                    '<a class="dir-link" href="/territories">Browse by territory</a></span>';
                return;
            }
            node.innerHTML =
                "<span>Showing</span>" +
                '<span class="terr-pill">' + SW.esc(SW.territory.label()) +
                '<button type="button" title="Clear territory" aria-label="Clear territory">&times;</button></span>' +
                '<a class="dir-link" href="/territories">Change territory</a>';
            node.querySelector("button").addEventListener("click", function () {
                SW.territory.clear();
                SW.territory.syncUrl();
            });
        }
        draw();
        SW.territory.onChange(draw);
    };

    /* ── SW.cards — one renderer per object, reused everywhere (s.9) ──── */

    /**
     * The request link on a card carries the parameters the wizard actually
     * reads — service, country, state, city, postalCode — and nothing else.
     * An earlier version passed `territory=`, which the wizard ignores, and an
     * empty `service=`, which cleared the preselection the visitor had already
     * made. Build it from what is known, and omit what is not.
     */
    function requestHref(row, serviceSlug) {
        var q = new URLSearchParams();
        if (serviceSlug) q.set("service", serviceSlug);
        ["country", "state", "city", "postalCode"].forEach(function (k) {
            if (row[k]) q.set(k, row[k]);
        });
        var qs = q.toString();
        return "/request" + (qs ? "?" + qs : "");
    }
    SW.requestHref = requestHref;

    SW.cards = {
        /** opts.serviceSlug carries the service through from a service page. */
        professional: function (pro, opts) {
            var verified = pro.verifiedCategories || pro.specializations || [];
            var chips = verified.map(function (name) {
                return '<span class="chip">✔ ' + SW.esc(name) + "</span>";
            }).join("");
            if (!chips) chips = '<span class="chip plain">Verification in progress</span>';

            var lineage = [pro.veda, pro.shakha, pro.sampradaya].filter(Boolean).join(" · ");
            var languages = (pro.languages || pro.languagesKnown || []).join(", ");
            var request = requestHref(pro, opts && opts.serviceSlug);

            return '<article class="dir-card">' +
                "<h4>" + SW.esc(pro.name || pro.displayName) + "</h4>" +
                '<span class="dir-where">' + SW.esc(place(pro)) + "</span>" +
                '<div class="chips">' + chips + "</div>" +
                '<div class="dir-meta">' +
                (lineage ? "<span><b>Tradition</b> " + SW.esc(lineage) + "</span>" : "") +
                (languages ? "<span><b>Languages</b> " + SW.esc(languages) + "</span>" : "") +
                (pro.experienceBand ? "<span><b>Experience</b> " + SW.esc(pro.experienceBand) + " years</span>" : "") +
                "</div>" +
                '<div class="dir-act"><a class="dir-link" href="' + request + '">' +
                // On a service page the rite is known; in a directory or a
                // featured rail it is not, and promising "this service" there
                // would be promising something the card never named.
                ((opts && opts.serviceSlug) ? "Request this service" : "Request a service") +
                " →</a></div>" +
                "</article>";
        },

        organisation: function (org) {
            var visit = org.websiteUrl || org.bookingUrl;
            return '<article class="dir-card">' +
                "<h4>" + SW.esc(org.name) + "</h4>" +
                '<span class="dir-where">' + SW.esc(place(org)) + "</span>" +
                (org.description ? '<p class="dir-note">' + SW.esc(org.description) + "</p>" : "") +
                '<div class="dir-act">' +
                (visit ? '<a class="dir-link" href="' + SW.esc(visit) + '" target="_blank" rel="noreferrer">Visit and book →</a>' : "") +
                (org.mapsUrl ? '<a class="dir-link" href="' + SW.esc(org.mapsUrl) + '" target="_blank" rel="noreferrer">Map</a>' : "") +
                "</div>" +
                "</article>";
        }
    };

    /* ── SW.Directory — filters + grid + show more ───────────────────── */

    var PAGE_SIZE = 12;

    /**
     * opts: { kind: "professionals"|"organisations", grid, state, count, more,
     *         inputs: {name: el}, empty, blank, noun }
     */
    SW.Directory = function (opts) {
        var self = this;
        this.o = opts;
        this.page = 1;
        /* Every row fetched so far, kept so a client-side refine can re-render
           without another round trip. The API filters on name and territory
           only; specialty, language and Veda are refined here. */
        this.rows = [];
        this.refine = null;

        this.query = function () {
            var params = {};
            Object.keys(opts.inputs || {}).forEach(function (name) {
                var v = (opts.inputs[name].value || "").trim();
                if (v) params[name] = v;
            });
            // The persisted territory is a filter of equal standing to the form.
            var t = SW.territory.params();
            Object.keys(t).forEach(function (k) {
                if (t[k] && !params[k]) params[k] = t[k];
            });
            return params;
        };

        this.searching = function () { return Object.keys(self.query()).length > 0; };

        this.show = function (message, heading) {
            opts.state.innerHTML = (heading ? "<b>" + SW.esc(heading) + "</b>" : "") + SW.esc(message);
            opts.state.hidden = false;
        };

        this.load = function (page) {
            var params = self.query();
            params.page = page;
            params.limit = opts.limit || PAGE_SIZE;

            if (page === 1) {
                self.rows = [];
                opts.grid.innerHTML = "";
                if (opts.count) opts.count.textContent = "";
                if (opts.more) opts.more.hidden = true;
                self.show("Searching…");
            }

            SW.api[opts.kind](params).then(function (res) {
                self.rows = self.rows.concat(res.rows);
                self.total = res.total;
                if (opts.more) {
                    opts.more.hidden = self.rows.length >= res.total;
                    opts.more.dataset.page = String(page + 1);
                }
                if (opts.onRows) opts.onRows(self.rows);
                self.paint();
            }).catch(function () {
                // Never leave a blank panel: say what happened and how to get help.
                self.rows = [];
                opts.grid.innerHTML = "";
                if (opts.count) opts.count.textContent = "";
                if (opts.more) opts.more.hidden = true;
                self.show(
                    "The directory could not be reached just now. Please try again, or write to " +
                    SW.CONTACT.email + ".",
                    "Directory unavailable"
                );
            });
        };

        /** Re-render from the rows already fetched, applying any refine. */
        this.paint = function () {
            var render = opts.kind === "professionals" ? SW.cards.professional : SW.cards.organisation;
            var visible = self.refine ? self.rows.filter(self.refine) : self.rows;

            // Not `.map(render)`: Array.map passes the index as the second
            // argument, which would land in the card's options slot.
            opts.grid.innerHTML = visible.map(function (row) {
                return render(row, opts.cardOpts);
            }).join("");

            if (opts.count) {
                if (!self.total) {
                    opts.count.textContent = "";
                } else if (visible.length !== self.rows.length) {
                    opts.count.textContent = visible.length + " of " + self.rows.length + " loaded" +
                        " · " + self.total + " " + opts.noun + (self.total === 1 ? "" : "s") + " in all";
                } else {
                    opts.count.textContent = self.rows.length + " of " + self.total + " " +
                        opts.noun + (self.total === 1 ? "" : "s");
                }
            }

            if (visible.length === 0) {
                if (self.rows.length > 0) {
                    self.show("No one in the loaded results matches that refinement. Clear it, or " +
                        "widen the territory.", "Nothing matches");
                } else if (self.searching()) {
                    self.show(opts.empty, "Nothing here yet");
                } else {
                    self.show(opts.blank, "Nothing listed yet");
                }
            } else {
                opts.state.hidden = true;
            }
        };

        this.setRefine = function (fn) { self.refine = fn; self.paint(); };

        this.reload = function () { self.load(1); };

        var timer = null;
        this.schedule = function () {
            window.clearTimeout(timer);
            timer = window.setTimeout(self.reload, 280);
        };

        Object.keys(opts.inputs || {}).forEach(function (name) {
            opts.inputs[name].addEventListener("input", self.schedule);
            opts.inputs[name].addEventListener("change", self.schedule);
        });

        if (opts.more) {
            opts.more.addEventListener("click", function () {
                self.load(parseInt(opts.more.dataset.page || "2", 10));
            });
        }

        SW.territory.onChange(function () { self.reload(); });
    };

    /* ── SW.featured — controlled rotation, not a random list (s.7) ───── */

    function dayIndex() {
        var now = new Date();
        return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
    }
    function weekIndex() { return Math.floor(dayIndex() / 7); }

    /**
     * A deterministic rotation: the same visitors see the same faces all day,
     * and a different set tomorrow. Verified entries sort ahead of unverified,
     * then the window slides by the period seed. No randomness, so the page
     * does not reshuffle on every reload.
     */
    function rotate(rows, count, seed) {
        if (!rows.length) return [];
        var ranked = rows.slice().sort(function (a, b) {
            var av = (a.verifiedCategories || a.specializations || []).length > 0 ? 0 : 1;
            var bv = (b.verifiedCategories || b.specializations || []).length > 0 ? 0 : 1;
            if (av !== bv) return av - bv;
            return String(a.name || "").localeCompare(String(b.name || ""));
        });
        var out = [];
        var n = Math.min(count, ranked.length);
        for (var i = 0; i < n; i += 1) out.push(ranked[(seed + i) % ranked.length]);
        return out;
    }

    SW.featured = {
        /**
         * node   — container to render into
         * kind   — "professionals" | "organisations"
         * period — "day" | "week"
         * count  — 3 to 6 (spec s.7)
         */
        render: function (node, kind, period, count) {
            if (!node) return;
            var seed = period === "week" ? weekIndex() : dayIndex();
            var params = SW.territory.params();
            params.limit = 48;
            params.page = 1;

            node.innerHTML = '<div class="dir-state">Loading…</div>';

            SW.api[kind](params).then(function (res) {
                var rows = res.rows;
                // Territory-relevant first; if the chosen territory has none,
                // fall back to the whole network rather than showing nothing.
                if (!rows.length && SW.territory.isSet()) {
                    return SW.api[kind]({ limit: 48, page: 1 }).then(function (all) {
                        draw(all.rows, true);
                    });
                }
                draw(rows, false);
            }).catch(function () {
                node.innerHTML = '<div class="dir-state">Featured listings are unavailable just now.</div>';
            });

            function draw(rows, widened) {
                if (!rows.length) {
                    node.innerHTML = '<div class="dir-state"><b>Nothing listed yet</b>' +
                        (kind === "professionals"
                            ? "Professionals appear here as they complete empanelment."
                            : "Organisations appear here once they join Swadharma.") +
                        "</div>";
                    return;
                }
                var render = kind === "professionals" ? SW.cards.professional : SW.cards.organisation;
                var picked = rotate(rows, count || 4, seed);
                node.innerHTML = '<div class="rail">' + picked.map(function (row) {
                    return render(row);
                }).join("") + "</div>" +
                    '<p class="rail-note">' +
                    (period === "week" ? "Rotates weekly" : "Rotates daily") +
                    " · verified listings first" +
                    (widened ? " · no listings in your territory yet, showing the whole network" : "") +
                    "</p>";
            }
        }
    };

    /* ── SW.tree — Country > State > Region > City, from live data ────── */

    SW.tree = {
        /**
         * Merges the seed (SW.TERRITORY_SEED — where Swadharma operates) with
         * whatever the directory actually returns, so the browser is never
         * blank and never stale. Counts always come from live rows.
         */
        build: function () {
            return Promise.all([
                SW.api.professionals({ limit: 48, page: 1 }),
                SW.api.organisations({ limit: 48, page: 1 })
            ]).then(function (res) {
                var rows = []
                    .concat(res[0].rows.map(function (r) { return { row: r, kind: "professional" }; }))
                    .concat(res[1].rows.map(function (r) { return { row: r, kind: "organisation" }; }));

                var names = { IN: "India", US: "United States", India: "India", "United States": "United States" };
                var tree = {};

                function ensure(countryCode, countryName) {
                    if (!tree[countryCode]) {
                        tree[countryCode] = { code: countryCode, name: countryName, states: {}, pros: 0, orgs: 0 };
                    }
                    return tree[countryCode];
                }

                // Seed first, so operating territories show even at zero count.
                SW.TERRITORY_SEED.forEach(function (c) {
                    var country = ensure(c.code, c.name);
                    c.states.forEach(function (s) {
                        country.states[s.name] = country.states[s.name] ||
                            { name: s.name, cities: {}, pros: 0, orgs: 0 };
                        s.regions.forEach(function (r) {
                            r.cities.forEach(function (city) {
                                country.states[s.name].cities[city] =
                                    country.states[s.name].cities[city] ||
                                    { name: city, region: r.name, pros: 0, orgs: 0 };
                            });
                        });
                    });
                });

                rows.forEach(function (entry) {
                    var r = entry.row;
                    var raw = (r.country || "").trim();
                    var code = raw.length === 2 ? raw.toUpperCase()
                        : (/^india$/i.test(raw) ? "IN" : (/^(usa|united states)$/i.test(raw) ? "US" : raw));
                    if (!code) return;

                    var country = ensure(code, names[code] || raw || code);
                    var key = entry.kind === "professional" ? "pros" : "orgs";
                    country[key] += 1;

                    if (r.state) {
                        country.states[r.state] = country.states[r.state] ||
                            { name: r.state, cities: {}, pros: 0, orgs: 0 };
                        country.states[r.state][key] += 1;

                        if (r.city) {
                            country.states[r.state].cities[r.city] =
                                country.states[r.state].cities[r.city] ||
                                { name: r.city, region: "", pros: 0, orgs: 0 };
                            country.states[r.state].cities[r.city][key] += 1;
                        }
                    }
                });

                // Objects to sorted arrays.
                return Object.keys(tree).sort().map(function (code) {
                    var c = tree[code];
                    return {
                        code: c.code, name: c.name, pros: c.pros, orgs: c.orgs,
                        states: Object.keys(c.states).sort().map(function (sn) {
                            var s = c.states[sn];
                            return {
                                name: s.name, pros: s.pros, orgs: s.orgs,
                                cities: Object.keys(s.cities).sort().map(function (cn) {
                                    return s.cities[cn];
                                })
                            };
                        })
                    };
                });
            });
        }
    };

    /* ── AppShell — TopNav active state, drawer, SideNav ──────────────── */

    function currentPath() {
        var p = window.location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
        if (p !== "/" && p.slice(-1) === "/") p = p.slice(0, -1);
        return p || "/";
    }

    /**
     * A link is current when its path matches, or when the page sits beneath it
     * (so /services/homa lights up "Services"). Marked with aria-current so the
     * styling and the accessibility tree agree.
     */
    function markCurrent(scope) {
        var here = currentPath();
        var links = scope.querySelectorAll("a[href]");
        var best = null, bestLen = -1;

        Array.prototype.forEach.call(links, function (a) {
            var href = a.getAttribute("href");
            if (!href || href.charAt(0) !== "/" ) return;
            var path = href.split("?")[0].split("#")[0].replace(/\.html$/, "");
            if (path !== "/" && path.slice(-1) === "/") path = path.slice(0, -1);
            if (path === "/") {
                if (here === "/" && bestLen < 1) { best = a; bestLen = 1; }
                return;
            }
            if (here === path || here.indexOf(path + "/") === 0) {
                if (path.length > bestLen) { best = a; bestLen = path.length; }
            }
        });

        if (best) best.setAttribute("aria-current", "page");
    }

    function shell() {
        var top = document.querySelector(".sw-top");
        var drawer = SW.el("swDrawer");
        var burger = SW.el("swBurger");

        if (top) markCurrent(top);
        var side = document.querySelector(".sw-side");
        if (side) markCurrent(side);
        if (drawer) markCurrent(drawer);

        if (burger && drawer) {
            var open = function () {
                drawer.hidden = false;
                document.body.style.overflow = "hidden";
                var first = drawer.querySelector("a, button");
                if (first) first.focus();
            };
            var close = function () {
                drawer.hidden = true;
                document.body.style.overflow = "";
                burger.focus();
            };
            burger.addEventListener("click", open);
            drawer.addEventListener("click", function (e) {
                if (e.target === drawer || e.target.closest(".sw-drawer-close")) close();
            });
            document.addEventListener("keydown", function (e) {
                if (e.key === "Escape" && !drawer.hidden) close();
            });
        }

        // Scroll the active SideNav tab into view on mobile.
        var active = document.querySelector(".sw-side a[aria-current]");
        if (active && window.matchMedia("(max-width: 900px)").matches) {
            active.scrollIntoView({ block: "nearest", inline: "center" });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", shell);
    } else {
        shell();
    }
})();
