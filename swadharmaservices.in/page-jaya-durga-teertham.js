/* page-jaya-durga-teertham.js — the kṣetram page at Undavalli.

   The rite cards and the vidyālaya pillars are data here rather than markup,
   for the same reason the service catalogue is: the kṣetram will add rites and
   VKG will add photographs, and neither should mean editing a page body.

   Every Telugu string is transcribed from the kṣetram's own banners. It is
   shown beside the English, never instead of it and never replaced by it —
   this is a kṣetram's own wording about its own rites. */
(function () {
    "use strict";

    /* Territory for every booking link on this page. One constant, so a
       correction to the village name cannot be applied to three links and
       missed on the fourth. */
    var WHERE = "country=IN&state=Andhra%20Pradesh&city=Undavalli";

    /* ── What is performed here ───────────────────────────────────────
       `service` is a slug in catalogue.js, so each card opens the request
       wizard on the right rite. Where a kṣetram rite spans more than one
       catalogue service the nearest is used — a śānti is booked as a homa
       because that is what is performed, whatever it is called. */
    var RITES = [
        {
            te: "నదీస్నానాలు", en: "Nadī snāna", icon: "🌊",
            note: "Ritual bathing in the Krishna, the reason a tīrtha is a tīrtha.",
            service: "pilgrim-support"
        },
        {
            te: "తర్పణాలు", en: "Tarpaṇa", icon: "💧",
            note: "Water offerings to the pitṛs, on the tithi or on the amāvāsyā.",
            service: "shraaddha"
        },
        {
            te: "తీర్థశ్రాద్ధాలు", en: "Tīrtha śrāddha", icon: "🪔",
            note: "Śrāddha performed at the tīrtha itself.",
            service: "shraaddha"
        },
        {
            te: "ఆబ్దిక శ్రాద్ధాలు", en: "Ābdika śrāddha", icon: "🕯️",
            note: "The annual rite, on the tithi of the death rather than the date.",
            service: "shraaddha"
        },
        {
            te: "స్మార్తకర్మలు", en: "Smārta karma", icon: "🕉️",
            note: "The saṃskāras and household rites of the smārta paddhati.",
            service: "samskaras"
        },
        {
            te: "వ్రతాలు", en: "Vrata", icon: "🙏",
            note: "Household vratas, with the saṅkalpa and the materials arranged.",
            service: "ceremonies"
        },
        {
            te: "శాంతులు", en: "Śānti", icon: "🔥",
            note: "Śānti rites and their homas, including the graha śāntis.",
            service: "homa"
        },
        {
            te: "శ్రౌత ఇష్టి కార్యక్రమాలు", en: "Śrauta iṣṭi", icon: "📿",
            note: "Śrauta observances, which need a ṛtvik team rather than one priest.",
            service: "vedic-events"
        }
    ];

    /* ── The vidyālaya's six pillars, from its banner ─────────────────── */
    var PILLARS = [
        { en: "Veda Adhyayana", icon: "📖", note: "Recitation and study of the Veda." },
        { en: "Sanskṛta Śāstra Abhyāsa", icon: "🏛️", note: "Sanskrit and the śāstras." },
        { en: "Smārta & Āgama Paddhati", icon: "🔥", note: "The procedure by which the rites are actually performed." },
        { en: "Sanskāra Prabodhana", icon: "🙏", note: "Teaching the saṃskāras to those who will carry them." },
        { en: "Guru-Śiṣya Paramparā", icon: "👥", note: "Taught in the lineage, not only from books." },
        { en: "Dharma Sevā", icon: "🕉️", note: "Service as part of the training." }
    ];

    /* ── Photographs ──────────────────────────────────────────────────
       The six VKG sent on 2026-09-27, named and captioned here in advance.
       Save the files into images/ under exactly these names and they appear;
       nothing else needs editing.

       A tile whose file is not there yet REMOVES ITSELF on the image's error
       event, and the section stays hidden until at least one has loaded. So a
       half-filled set never shows a broken-image icon on a live page, and the
       list can be written before the files arrive.

       Captions describe what is visible and stop there. Naming the specific
       rite in a photograph is a claim about someone else's practice that I
       cannot check from an image, and a wrong one would be published under the
       kṣetram's own name. */
    var GALLERY = [
        { src: "/images/jdt-tirtha.jpg",
          alt: "The tīrtha on the Krishna, with the shrine standing in the water",
          caption: "The tīrtha, with the shrine standing in the water and the ghāṭ steps above." },
        { src: "/images/jdt-abhisheka.jpg",
          alt: "Water poured over the riverside shrine",
          caption: "Abhiṣeka at the riverside shrine, the Krishna behind." },
        { src: "/images/jdt-arati-river.jpg",
          alt: "Ārati offered at the water's edge",
          caption: "Ārati offered at the water's edge." },
        { src: "/images/jdt-sankalpa.jpg",
          alt: "Materials handed to seated yajamānas before the rites",
          caption: "Materials handed to the yajamānas before the rites begin." },
        { src: "/images/jdt-hall.jpg",
          alt: "The covered hall at the kṣetram, filled with seated devotees",
          caption: "The covered hall, where the gathering sits." },
        { src: "/images/jdt-annadana.jpg",
          alt: "Volunteers serving food from large vessels after the rites",
          caption: "Annadāna — the kitchen serving after the rites." }
    ];

    function esc(v) { return SW.esc(v); }

    /* Rites */
    var rites = SW.el("jdtRites");
    if (rites) {
        rites.innerHTML = RITES.map(function (r) {
            return '<a class="card" href="/request?service=' + r.service + '&' + WHERE + '">' +
                '<div class="icn">' + r.icon + "</div>" +
                '<h3 lang="te">' + esc(r.te) + "</h3>" +
                '<span class="sa">' + esc(r.en) + "</span>" +
                "<p>" + esc(r.note) + "</p>" +
                '<span class="go">Request this →</span>' +
                "</a>";
        }).join("");
    }

    /* Vidyālaya pillars */
    var vidya = SW.el("jdtVidyalaya");
    if (vidya) {
        vidya.innerHTML = PILLARS.map(function (p) {
            return '<div class="card">' +
                '<div class="icn">' + p.icon + "</div>" +
                "<h3>" + esc(p.en) + "</h3>" +
                "<p>" + esc(p.note) + "</p>" +
                "</div>";
        }).join("");
    }

    /* Gallery. Each tile removes itself if its file is not there yet, and the
       section only appears once one has actually loaded — so the list above
       can name photographs that have not been uploaded without ever putting a
       broken image on a live page. */
    var gallery = SW.el("jdtGallery");
    var gallerySection = document.getElementById("gallery");
    if (gallery && gallerySection && GALLERY.length) {
        gallery.innerHTML = GALLERY.map(function (g) {
            return '<figure><img src="' + esc(g.src) + '" alt="' + esc(g.alt) + '" loading="lazy">' +
                (g.caption ? "<figcaption>" + esc(g.caption) + "</figcaption>" : "") +
                "</figure>";
        }).join("");

        Array.prototype.forEach.call(gallery.querySelectorAll("img"), function (img) {
            img.addEventListener("error", function () {
                var fig = img.closest("figure");
                if (fig) fig.remove();
                if (!gallery.querySelector("figure")) gallerySection.hidden = true;
            });
            img.addEventListener("load", function () {
                gallerySection.hidden = false;
            });
            // A cached image may already have failed or finished before the
            // listeners were attached.
            if (img.complete) {
                if (img.naturalWidth === 0) img.dispatchEvent(new Event("error"));
                else gallerySection.hidden = false;
            }
        });
    }

    /* Today's tithi, so a visitor deciding on a date sees where the month is.
       Reckoned for the published locality, which is named on the line — see
       the note in panchanga.js about why that label is never dropped. */
    var today = SW.el("jdtToday");
    if (today && window.SW.panchanga) {
        SW.panchanga.load().then(function () {
            SW.panchanga.renderToday(today, { href: "/calendar" });
        }).catch(function () {
            today.hidden = true;
        });
    }
})();
