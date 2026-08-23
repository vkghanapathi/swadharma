/* ===========================================================================
   panchanga.js — the Chandramāna half of the site
   ---------------------------------------------------------------------------
   Loads panchanga.json (built from Viyat's tables by _layout/build_panchanga.py)
   and gives the rest of the site two things it could not do before:

     1. Monthly programmes as DATES. Amāvāsyā, Ekādaśī, Pradoṣa, Saṅkaṣṭī and
        the rest are derived from the lunar day, so the calendar is generated
        rather than retyped each year.

     2. Booking in either calendar. A devotee who knows only "my father's tithi
        is Śrāvaṇa Kṛṣṇa Saptamī" can reach the Gregorian date, and a devotee
        who knows only the Gregorian date can see what tithi it falls on.

   Everything is one fetch of a static same-origin file, cached for the visit.
   No auth, and nothing here depends on another service being reachable — the
   Viyat API is authenticated and a public page cannot call it.
   ========================================================================= */

window.SW = window.SW || {};

(function () {
    "use strict";

    var URL_PATH = "/panchanga.json";
    var cache = null;
    var pending = null;

    var MASA_ORDER = [
        "Caitra", "Vaiśākha", "Jyeṣṭha", "Āṣāḍha", "Śrāvaṇa", "Bhādrapada",
        "Āśvayuja", "Kārtika", "Mārgaśira", "Puṣya", "Māgha", "Phālguṇa"
    ];

    var TITHI_ORDER = [
        { n: 1, name: "Pratipat" }, { n: 2, name: "Dvitīyā" }, { n: 3, name: "Tṛtīyā" },
        { n: 4, name: "Caturthī" }, { n: 5, name: "Pañcamī" }, { n: 6, name: "Ṣaṣṭhī" },
        { n: 7, name: "Saptamī" }, { n: 8, name: "Aṣṭamī" }, { n: 9, name: "Navamī" },
        { n: 10, name: "Daśamī" }, { n: 11, name: "Ekādaśī" }, { n: 12, name: "Dvādaśī" },
        { n: 13, name: "Trayodaśī" }, { n: 14, name: "Caturdaśī" }
    ];

    var GREGORIAN_MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    function iso(date) {
        return date.getFullYear() + "-" +
            String(date.getMonth() + 1).padStart(2, "0") + "-" +
            String(date.getDate()).padStart(2, "0");
    }

    function parseIso(s) {
        var p = String(s).split("-");
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }

    SW.panchanga = {
        MASA_ORDER: MASA_ORDER,
        TITHI_ORDER: TITHI_ORDER,
        GREGORIAN_MONTHS: GREGORIAN_MONTHS,
        iso: iso,
        parseIso: parseIso,

        /** Resolves to the whole table. Fetched once per visit. */
        load: function () {
            if (cache) return Promise.resolve(cache);
            if (pending) return pending;
            pending = fetch(URL_PATH, { headers: { Accept: "application/json" } })
                .then(function (r) {
                    if (!r.ok) throw new Error("HTTP " + r.status);
                    return r.json();
                })
                .then(function (data) {
                    cache = data;
                    pending = null;
                    return data;
                })
                .catch(function (e) {
                    pending = null;
                    throw e;
                });
            return pending;
        },

        /** True once loaded, so callers can render synchronously afterwards. */
        ready: function () { return cache !== null; },

        meta: function () { return cache ? cache.meta : null; },

        /** The record for one Gregorian date, or null if outside the table. */
        day: function (dateIso) {
            if (!cache) return null;
            var d = cache.days[dateIso];
            if (!d) return null;
            return Object.assign({ date: dateIso }, d);
        },

        /** Is this date inside the published year at all? */
        covers: function (dateIso) {
            return !!(cache && cache.days[dateIso]);
        },

        /** Every day in a Gregorian month, in order. year is full, month 0-11. */
        gregorianMonth: function (year, month) {
            if (!cache) return [];
            var out = [];
            var cursor = new Date(year, month, 1);
            while (cursor.getMonth() === month) {
                var key = iso(cursor);
                if (cache.days[key]) out.push(SW.panchanga.day(key));
                cursor.setDate(cursor.getDate() + 1);
            }
            return out;
        },

        /**
         * Every day of one lunar month, in order. A year with an intercalary
         * month has two Jyeṣṭhas; `adhika` picks which. Returns [] if that
         * combination is not in the table.
         */
        lunarMonth: function (masa, adhika) {
            if (!cache) return [];
            var want = adhika === true;
            return Object.keys(cache.days).sort().filter(function (k) {
                var d = cache.days[k];
                return d.ms === masa && (d.adhika === true) === want;
            }).map(SW.panchanga.day);
        },

        /** Which lunar months the table actually contains, adhika marked. */
        lunarMonths: function () {
            if (!cache) return [];
            var seen = {}, out = [];
            Object.keys(cache.days).sort().forEach(function (k) {
                var d = cache.days[k];
                var id = d.ms + (d.adhika ? "|adhika" : "");
                if (seen[id]) return;
                seen[id] = true;
                out.push({ masa: d.ms, adhika: !!d.adhika, id: id, from: k });
            });
            return out;
        },

        /**
         * Chandramāna -> Gregorian. Give it {masa, paksha, tithi} and it returns
         * every matching day in the table, most often one.
         *
         * A tithi can be missed by a sunrise (kṣaya) or span two (vṛddhi), so
         * the second tithi of a day counts as a match too, flagged `late` —
         * Māgha Pūrṇimā 2027 exists only that way, and a booking form that
         * ignored it would offer twelve Satyanārāyaṇa dates in a year of
         * thirteen.
         */
        find: function (query) {
            if (!cache) return [];
            var out = [];
            Object.keys(cache.days).sort().forEach(function (k) {
                var d = cache.days[k];
                if (query.masa && d.ms !== query.masa) return;
                if (query.adhika !== undefined && (!!d.adhika) !== !!query.adhika) return;
                if (query.paksha && d.pk !== query.paksha) return;

                if (query.tithi) {
                    if (d.tn === query.tithi) {
                        out.push(Object.assign(SW.panchanga.day(k), { late: false }));
                    } else if (d.tn2 === query.tithi) {
                        out.push(Object.assign(SW.panchanga.day(k), {
                            late: true, lateFrom: d.ti2End || ""
                        }));
                    }
                    return;
                }
                out.push(SW.panchanga.day(k));
            });
            return out;
        },

        /**
         * The next `count` days carrying an observance, optionally only those
         * belonging to one catalogue service. This is what turns a service page
         * from prose into dates.
         */
        upcoming: function (opts) {
            if (!cache) return [];
            var o = opts || {};
            var from = o.from || iso(new Date());
            var out = [];
            var keys = Object.keys(cache.days).sort();

            for (var i = 0; i < keys.length && out.length < (o.count || 6); i += 1) {
                var k = keys[i];
                if (k < from) continue;
                var d = cache.days[k];
                var obs = (d.ob || []).filter(function (ob) {
                    if (o.service && ob.service !== o.service) return false;
                    if (o.short && ob.short !== o.short) return false;
                    return true;
                });
                if (obs.length) {
                    out.push(Object.assign(SW.panchanga.day(k), { ob: obs }));
                }
            }
            return out;
        },

        /** Distinct observances in the table, for a filter control. */
        observanceTypes: function () {
            if (!cache) return [];
            var seen = {};
            Object.keys(cache.days).forEach(function (k) {
                (cache.days[k].ob || []).forEach(function (ob) {
                    if (!seen[ob.short]) seen[ob.short] = { short: ob.short, service: ob.service, count: 0 };
                    seen[ob.short].count += 1;
                });
            });
            return Object.keys(seen).sort().map(function (s) { return seen[s]; });
        },

        /* ── Formatting ─────────────────────────────────────────────── */

        /** "Śrāvaṇa Śukla Dvādaśī" — how the day is named in the lunar calendar. */
        lunarLabel: function (d) {
            if (!d) return "";
            return (d.adhika ? "Adhika " : "") + d.ms + " " + d.pk + " " + d.ti;
        },

        /** "Monday, 24 August 2026" */
        gregorianLabel: function (dateIso) {
            var dt = parseIso(dateIso);
            return dt.toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "long", year: "numeric"
            });
        },

        shortLabel: function (dateIso) {
            var dt = parseIso(dateIso);
            return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        },

        /**
         * The windows to avoid, as the pañcāṅga gives them. Rāhukāla and
         * durmuhūrta are plain clock ranges. Varjya and the tithi end times
         * carry the printed markers (M, N, E, te) and are passed through
         * unchanged — that convention is not documented in the source tables,
         * and inventing a reading of it would put wrong times in front of
         * someone arranging a funeral rite.
         */
        cautions: function (d) {
            if (!d) return [];
            var out = [];
            if (d.rk) out.push({ label: "Rāhukāla", value: d.rk, exact: true });
            (d.dm || []).forEach(function (v) {
                out.push({ label: "Durmuhūrta", value: v, exact: true });
            });
            (d.vj || []).forEach(function (v) {
                out.push({ label: "Varjya", value: v, exact: false });
            });
            return out;
        }
    };
})();
