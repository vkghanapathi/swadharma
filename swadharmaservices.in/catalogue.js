/* ===========================================================================
   catalogue.js — the canonical front-end service model
   ---------------------------------------------------------------------------
   Spec section 8 asks that featured content and directory listings never be
   hard-coded into HTML. Those come from the API (see app.js). This file is the
   other half of the same rule for the SERVICE CATALOGUE: every services page,
   every service detail page, the Request Wizard's first step and the home grid
   all read from SW.CATALOGUE. Adding a service means adding an entry here, not
   editing markup on five pages.

   Why a data file and not GET /api/services: the backend's /api/v1/services is
   a TENANT catalogue — Datta Mukti Kshetram's own list, with its own INR prices
   and Telugu localisation. That belongs on that institution's portal, not on
   the platform's public marketing site, where it would read as our price list.
   The public catalogue is editorial and platform-wide. When a platform-level
   services endpoint exists, swap SW.CATALOGUE for a fetch behind the same
   shape and nothing else changes.

   Source of record for the content below (VKG, 2026-08-22):
     dharmaposhanam.in/swadharma — the eight programme pillars and the four
                                   immediate activities
     dharmaposhanam.in/apps      — the twelve Swadharma suite modules
   ========================================================================= */

window.SW = window.SW || {};

/* ── Service catalogue ───────────────────────────────────────────────────
   status: "live"      — bookable today
           "enrolling" — running and taking enrolments
           "soon"      — specified, dated, not yet open
   Anything marked "live" must have somewhere real to go. A card that 404s is
   worse than a card that says Soon.
   -------------------------------------------------------------------- */
SW.CATALOGUE = [
    {
        slug: "ceremonies",
        name: "Ceremonies & Daivikam",
        sanskrit: "दैविकम्",
        icon: "🛕",
        status: "live",
        tagline: "Temple and household ceremonies, conducted by qualified Purohitas.",
        summary:
            "Abhiṣeka, Pūjā, Vratam and festival ceremonies for households, temples and trusts. " +
            "Every engagement is matched to a Purohita verified for that specific ceremony, and the " +
            "materials list is agreed before the day.",
        includes: [
            { name: "Abhiṣeka", note: "Pañcāmṛta and sacred waters for the deity" },
            { name: "Satyanārāyaṇa Vratam", note: "Household vratam with full sankalpa" },
            { name: "Gṛha Praveśam", note: "House-warming, with Vāstu observances" },
            { name: "Nitya Karma Anuṣṭhānam", note: "Daily pūjā and abhiṣeka for temples" },
            { name: "Festival ceremonies", note: "Temple anniversary and utsava support" }
        ],
        deliveredBy: ["Purohita", "Archaka"],
        territories: ["IN", "US"],
        requestable: true
    },
    {
        slug: "shraaddha",
        name: "Śrāddha & Apara Karma",
        sanskrit: "श्राद्धम्",
        icon: "🪔",
        status: "live",
        tagline: "Ancestral rites — Hiraṇya, Pārvaṇa, Mahālaya and the full Apara Karma sequence.",
        summary:
            "The rites owed to the pitṛs, performed correctly and on the right tithi. Swadharma " +
            "handles the sequence end to end, including the days families most often find themselves " +
            "arranging at short notice and far from home.",
        includes: [
            { name: "Hiraṇya Śrāddha", note: "Where a full Pārvaṇa cannot be performed" },
            { name: "Pārvaṇa Śrāddha", note: "The full ancestral rite" },
            { name: "Mahālaya Śrāddha", note: "Pitṛ Pakṣa observances" },
            { name: "Tarpaṇam", note: "Daily and tithi water offerings" },
            { name: "Sankalpa Śrāddham", note: "Simplified rite with full sacred intention" },
            { name: "Apara Karma", note: "Funeral rites, Day 3 to Day 9 Nitya Karma, Pinda Pradāna" },
            { name: "Post-funeral coordination", note: "Masika and Ābdika Śrāddha scheduling" }
        ],
        deliveredBy: ["Purohita"],
        territories: ["IN", "US"],
        requestable: true,
        urgent: true
    },
    {
        slug: "homa",
        name: "Homa & Yajña",
        sanskrit: "होमः",
        icon: "🔥",
        status: "live",
        tagline: "Homa and Yāga with trained Ṛtviks and event-ready samagri.",
        summary:
            "From a single Gaṇapati Homa at home to a multi-day Yāga with a full Ṛtvik team. " +
            "Swadharma deputes the scholars, sizes the samagri to the saṅkalpa and delivers it " +
            "to the venue.",
        includes: [
            { name: "Gaṇapati Homa", note: "Preceding any major undertaking" },
            { name: "Navagraha Homa", note: "Planetary propitiation" },
            { name: "Āyuṣya Homa", note: "Longevity and health" },
            { name: "Caṇḍī Homa", note: "With Ṛtvik team and pārāyaṇa" },
            { name: "Sudarśana Homa", note: "Institutional and household scale" },
            { name: "Bulk Homa & Yāga samagri", note: "Sourced through Dravya" }
        ],
        deliveredBy: ["Purohita", "Ṛtvik", "Veda Pundit"],
        territories: ["IN", "US"],
        requestable: true
    },
    {
        slug: "samskaras",
        name: "The Sixteen Saṃskāras",
        sanskrit: "षोडश संस्काराः",
        icon: "🕉️",
        status: "live",
        tagline: "Birth to antya — every Saṃskāra of a Dharmic life.",
        summary:
            "The sixteen life rites, arranged with the Purohita, the muhūrta, the materials and " +
            "the venue treated as one booking rather than four separate errands.",
        includes: [
            { name: "Nāmakaraṇa", note: "Naming ceremony" },
            { name: "Anna Prāśana", note: "First solid food" },
            { name: "Chowla", note: "First tonsure" },
            { name: "Akṣarābhyāsa", note: "Beginning of learning" },
            { name: "Upanayana", note: "Sacred thread, with Brahmopadeśa" },
            { name: "Vivāha", note: "Marriage, full traditional sequence" },
            { name: "Ṣaṣṭhi Pūrti & Sahasra Candra Darśana", note: "Later-life saṃskāras" }
        ],
        deliveredBy: ["Purohita"],
        territories: ["IN", "US"],
        requestable: true
    },
    {
        slug: "vedic-events",
        name: "Vedic Events & Ṛtvik Support",
        sanskrit: "ऋत्विक्",
        icon: "📿",
        status: "live",
        tagline: "Pratiṣṭhā, Kumbhābhiṣeka and major temple events, with scholars deputed.",
        summary:
            "Temples and trusts planning a Pratiṣṭhā or Kumbhābhiṣeka need a Ṛtvik team, not a " +
            "single priest. Swadharma coordinates the team from the Mysore parampara network and " +
            "deputes them for the full duration of the event.",
        includes: [
            { name: "Temple Pratiṣṭhā", note: "Installation, full Vedic sequence" },
            { name: "Kumbhābhiṣeka", note: "Consecration with Ṛtvik team" },
            { name: "Ṛtvik deputation", note: "Trained scholars for multi-day events" },
            { name: "Veda Pārāyaṇa", note: "Recitation for temple occasions" },
            { name: "Event logistics", note: "Priest travel, accommodation and scheduling" }
        ],
        deliveredBy: ["Ṛtvik", "Veda Pundit", "Event Coordinator"],
        territories: ["IN", "US"],
        requestable: true
    },
    {
        slug: "classes",
        name: "Classes, Sanskrit & Training",
        sanskrit: "अध्ययनम्",
        icon: "📖",
        status: "enrolling",
        tagline: "Pūjā, Mantras and Sanskrit for every age — plus formal priest training.",
        summary:
            "Structured teaching, in person at McKinney and online through the Shabda portal. " +
            "It runs from conversational Sanskrit and children's classes up to certification of " +
            "priests through the Guru-Śiṣya paramparā, and — from 2026 — university degree pathways.",
        includes: [
            { name: "Swadharma Classes", note: "Pūjā, Mantras and Sanskrit, all age groups" },
            { name: "Conversational Sanskrit", note: "Beginner to fluent, online" },
            { name: "Seven-year curriculum", note: "Classes 6 to 12, online" },
            { name: "Gamified Sanskrit Grammar", note: "Vyākaraṇa for younger learners" },
            { name: "MAP — Mūla Artha Pratipatti", note: "Nine-segment textual analysis" },
            { name: "Priest training & certification", note: "Nitya Karma, Tarpaṇam, Saṃskāra Karma; Guru-Śiṣya paramparā" },
            { name: "University courses", note: "Certificate to PhD with Central Sanskrit University, New Delhi — launching 2026" },
            { name: "Webinars", note: "Sāhitya, Vedānta, Vyākaraṇa" }
        ],
        deliveredBy: ["Veda Pundit", "Ācārya"],
        territories: ["IN", "US"],
        requestable: false,
        links: [
            { label: "Sanskrit Classes & fees", href: "/classes" },
            { label: "Shabda Classroom", href: "https://edu.swadharmaservices.in" }
        ]
    },
    {
        slug: "dravya",
        name: "Dravya — Materials & Door Delivery",
        sanskrit: "द्रव्यम्",
        icon: "📦",
        status: "live",
        tagline: "Pūjā samagri, Homa materials and Sāttvik supplies, delivered event-ready.",
        summary:
            "Authentic Sāttvik materials sourced and supplied for the occasion you are actually " +
            "performing, not a generic kit. Household orders and institutional supply to temples " +
            "both run through Dravya.",
        includes: [
            { name: "Pūjā materials", note: "For every occasion and deity" },
            { name: "Homa & Yāga samagri", note: "Bulk, sized to the saṅkalpa" },
            { name: "Temple supplies", note: "Flowers, lamps, abhiṣeka materials" },
            { name: "Sāttvik food items", note: "Including catering" },
            { name: "Mūrtis & altar accessories", note: "With prasāda items" },
            { name: "Institutional supply", note: "Standing orders for temples and organisations" }
        ],
        deliveredBy: ["Dravya stockist"],
        territories: ["IN", "US"],
        requestable: true,
        /* Devotees pay for materials, but Dravya sells them — SDVS Global LLC in
           the US, SDV Supplies in India. Never bill materials through Swadharma. */
        fulfilledBy: "Dravya — SDVS Global LLC (US) · SDV Supplies (India)",
        links: [{ label: "Dravya store", href: "https://dravya-web-328586595579.asia-southeast1.run.app/" }]
    },
    {
        slug: "pilgrim-support",
        name: "Pilgrim Support & Remote Seva",
        sanskrit: "सत्रम्",
        icon: "🧭",
        status: "live",
        tagline: "Food, accommodation and coordination for families far from a Kṣetram.",
        summary:
            "Dharma Satram in its oldest sense: feeding and housing the pilgrim. Today that also " +
            "means arranging rites in India for a family living in Texas, and standing in for the " +
            "relatives who would once have handled it.",
        includes: [
            { name: "Pilgrim accommodation", note: "At empanelled Kṣetrams" },
            { name: "Food services", note: "Sāttvik, for pilgrims and events" },
            { name: "Pilgrimage coordination", note: "Major Kṣetras in India and abroad" },
            { name: "Out-of-state family ceremonies", note: "Arranged where the family cannot travel" },
            { name: "Medical event Dharmic support", note: "Rites at hospital and hospice" },
            { name: "Funeral & Apara Karma coordination", note: "Including repatriation cases" },
            { name: "Community Hall coordination", note: "200+ capacity — Phase 2" }
        ],
        deliveredBy: ["Event Coordinator", "Cook", "Helper"],
        territories: ["IN", "US"],
        requestable: true
    },
    {
        slug: "knowledge-hub",
        name: "Swadharma Knowledge Hub",
        sanskrit: "संविद्",
        icon: "💬",
        status: "live",
        tagline: "Ask a scholar. A considered answer within seven days.",
        summary:
            "A time-bound guidance service for questions of Dharma, Ācāra and Vicāra — the ones " +
            "that have no obvious person to ask any more. Answers come as video, audio or text, " +
            "from scholars, within seven days.",
        includes: [
            { name: "Seven-day response guarantee", note: "Video, audio or written" },
            { name: "Dharma, Ācāra, Vicāra", note: "Traditions and philosophy" },
            { name: "Festival & ceremony library", note: "What is observed, and why" },
            { name: "Saṃskāra & ritual guidance", note: "Before you commit to a date" },
            { name: "Live Q&A webinars", note: "With scholars" }
        ],
        deliveredBy: ["Veda Pundit", "Ācārya"],
        territories: ["IN", "US"],
        requestable: true
    }
];

/* ── Roles a professional can be empanelled in ──────────────────────────── */
SW.ROLES = [
    "Purohita", "Archaka", "Ṛtvik", "Veda Pundit", "Ācārya",
    "Cook (Pācaka)", "Decorator", "Helper", "Event Coordinator"
];

/* ── Territory seed ──────────────────────────────────────────────────────
   Territory is a browsing dimension, not a filter field (spec section 6). The
   live tree is built from whatever the directory API returns; this seed names
   the territories Swadharma actually operates in, so /territories is never a
   blank page while the network is still filling up. Anything the API returns
   is merged on top, and the counts always come from the API — never from here.
   -------------------------------------------------------------------- */
SW.TERRITORY_SEED = [
    {
        code: "IN", name: "India",
        states: [
            { name: "Karnataka",      regions: [{ name: "Mysuru",        cities: ["Mysuru"] }] },
            { name: "Andhra Pradesh", regions: [
                { name: "East Godavari", cities: ["Rajahmundry", "Pithapuram"] },
                { name: "Krishna",       cities: ["Vijayawada"] }
            ] }
        ]
    },
    {
        code: "US", name: "United States",
        states: [
            { name: "Texas",    regions: [{ name: "Dallas–Fort Worth", cities: ["Frisco", "McKinney"] }] },
            { name: "Nebraska", regions: [{ name: "Omaha",             cities: ["Omaha"] }] }
        ]
    }
];

/* Operational nodes — empanelled Kṣetrams, named on the old landing page. */
SW.NODES = [
    { name: "Datta Mukti Kshetram", city: "Rajahmundry", state: "Andhra Pradesh", country: "IN" },
    { name: "Vaivasvatam", city: "Rajahmundry", state: "Andhra Pradesh", country: "IN" },
    { name: "Jaya Durga Teertham", city: "Vijayawada", state: "Andhra Pradesh", country: "IN" },
    { name: "Sripadavallabha Anagha Datta Kshetram", city: "Pithapuram", state: "Andhra Pradesh", country: "IN" }
];

/* ── The Swadharma suite — dharmaposhanam.in/apps ───────────────────────── */
SW.SUITE = [
    { no: "01", name: "Shabda",        sanskrit: "शब्द",         what: "Sanskrit teaching, beginner to advanced", status: "live", href: "https://edu.swadharmaservices.in" },
    { no: "02", name: "Vitta Fin",     sanskrit: "वित्त",        what: "Accounting for temples and Dharmik organisations", status: "live", href: "https://vitta-7f675.web.app/" },
    { no: "03", name: "MANI",          sanskrit: "मणि",          what: "Recipe, inventory and nutrition planning", status: "live", href: "https://mani.vkg.works/" },
    { no: "04", name: "Viyat",         sanskrit: "वियत्",        what: "Astrology assistant for traditional practitioners", status: "live", href: "https://viyat-3fcf1.web.app/#/home" },
    { no: "05", name: "Samudwaaha",    sanskrit: "समुद्वाह",     what: "Marriage portal and counselling", status: "live", href: "https://samudwaaha-portal.web.app/" },
    { no: "06", name: "Samudyoga",     sanskrit: "समुद्योग",     what: "Professional services and job portal", status: "live", href: "https://samudyoga.web.app/" },
    { no: "07", name: "Dharma Satram", sanskrit: "धर्म सत्रम्",  what: "Rituals, food and accommodation for pilgrims", status: "live", href: "/", self: true },
    { no: "08", name: "Namadheya",     sanskrit: "नामधेय",       what: "Traditional Sanskrit naming guidance", status: "soon" },
    { no: "09", name: "Sumvid Ghanam", sanskrit: "संविद् घनम्",  what: "Knowledge hub and consultancy", status: "soon" },
    { no: "10", name: "CBS",           sanskrit: "",             what: "Clinical Buddy Services — bedside medical reference", status: "live", href: "https://vkg.works/apps/cbs/" },
    { no: "11", name: "Dravya",        sanskrit: "द्रव्य",       what: "Home, pūjā and event supplies", status: "live", href: "https://dravya-web-328586595579.asia-southeast1.run.app/" },
    { no: "12", name: "Swadharma",     sanskrit: "स्वधर्म",      what: "Temple setup, ritual planning, Dharmik event management", status: "consult" }
];

/* ── Contact, offices ────────────────────────────────────────────────── */
SW.CONTACT = {
    email: "swadharma@dharmaposhanam.in",
    waIndia: { label: "+91 99000 82065", href: "https://wa.me/919900082065" },
    waUsa:   { label: "+1 (515) 770-4705", href: "https://wa.me/15157704705" },
    parent: "Dharma Poshanam Inc · 501(c)(3)"
};

SW.OFFICES = [
    { city: "McKinney · Texas", line: "800 Stacy Rd, McKinney, TX 75070, USA" },
    { city: "Frisco · Texas", line: "14600 Marigold Dr, Frisco, TX 75035, USA" },
    { city: "Omaha · Nebraska", line: "5703 S 159th Street, Omaha, NE 68135, USA" },
    { city: "Mysore · India", line: "dharmaposhanam.in" }
];

/* Convenience lookups. */
SW.serviceBySlug = function (slug) {
    for (var i = 0; i < SW.CATALOGUE.length; i += 1) {
        if (SW.CATALOGUE[i].slug === slug) return SW.CATALOGUE[i];
    }
    return null;
};
