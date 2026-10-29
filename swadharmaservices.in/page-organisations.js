/* page-organisations.js — the in-page SideNav anchors.
   markCurrent() in app.js resolves whole paths; the Organisations rail points
   at anchors on this page, so the active entry is tracked by scroll position
   instead. */
(function () {
    "use strict";

    /* A live render of the embed snippet directly beneath it, so an account
       holder can see the thing before pasting the tag. */
    var demo = SW.el("widgetDemo");
    if (demo && window.SW.panchanga) {
        SW.panchanga.load().then(function () {
            demo.innerHTML = '<div class="sw-today-wrap" style="justify-content:flex-start">' +
                '<div id="widgetDemoInner"></div></div>' +
                '<p class="rail-note">Live, rendering right now from the same tables.</p>';
            SW.panchanga.renderToday(SW.el("widgetDemoInner"), { href: "/calendar" });
        }).catch(function () {
            demo.hidden = true;
        });
    }

    var links = document.querySelectorAll('.sw-side a[href^="/organisations#"]');
    if (!links.length || !("IntersectionObserver" in window)) return;

    var byId = {};
    Array.prototype.forEach.call(links, function (a) {
        byId[a.getAttribute("href").split("#")[1]] = a;
    });

    var overview = document.querySelector('.sw-side a[href="/organisations"]');

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            Array.prototype.forEach.call(links, function (a) { a.removeAttribute("aria-current"); });
            if (overview) overview.removeAttribute("aria-current");
            byId[entry.target.id].setAttribute("aria-current", "page");
        });
    }, { rootMargin: "-20% 0px -70% 0px" });

    Object.keys(byId).forEach(function (id) {
        var section = document.getElementById(id);
        if (section) observer.observe(section);
    });
})();
