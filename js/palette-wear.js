/* Wears the custom palette, if there is one. The visitor's half of the
   recolour engine — the admin panel builds a palette, this puts it on.

   ONE SCRIPT TAG AND NO COST WHEN THERE IS NO PALETTE. js/recolour.js is the
   engine and it is not small; loading it on every page for the majority of
   visits where nothing is overridden would be paying for a feature nobody
   switched on. So this file is the only thing a page includes, it asks the
   settings endpoint what to wear, and it fetches the engine ONLY if the
   answer is something other than "nothing".

   ----------------------------------------------------------------------
   WHY THIS DOES NOT FLASH

   A palette applied after the page has painted is a visible flicker from
   brown to whatever the palette is, on every page load, which is worse than
   not having the feature. Two things keep that down:

     the palette is remembered in localStorage and applied SYNCHRONOUSLY on
     the next load, before the network is asked anything, so a returning
     visitor never sees the brown;

     the fresh copy from the server is applied when it arrives, which
     corrects the remembered one if it has changed since.

   The remembered copy is only ever a cache of something the server already
   served, so a stale one is a palette that was live an hour ago rather than
   anything a visitor could have put there themselves.

   ----------------------------------------------------------------------
   THE PREVIEW

   The admin panel's "Preview on the site" opens a tab wearing an unsaved
   palette. That beats everything else here, is not remembered, and dies
   with the tab — so an editor can look at an unsaved palette on the real
   pages without it ever being served to anybody.

   How it gets there is a HANDOFF, in two keys:

     HANDOFF_KEY (localStorage) — written by the admin tab just before it
     opens the preview: the palette, a one-off token, and an expiry a few
     seconds out. localStorage because it is the only store a new tab can
     see: the tab is opened "noopener", and a noopener tab starts with an
     empty sessionStorage — which is why the old way (sessionStorage in the
     admin tab) never reached the preview at all, and instead sat in the
     ADMIN tab for the rest of the session, dressing every page opened from
     there in a palette nobody had saved.

     PREVIEW_TAB_KEY (sessionStorage) — where the preview tab moves it on
     arrival, so it survives that tab's own navigation from page to page and
     nothing else's.

   The handoff is only taken by the page whose address carries its token
   (#palette-preview=<token>), and is deleted the moment it is read. So a
   second tab opened in the same few seconds cannot pick it up by accident,
   and nothing is left behind for a later page to find. */
(function () {
    "use strict";

    const CACHE_KEY = "mazerats_palette_cache";
    const HANDOFF_KEY = "mazerats_palette_preview_handoff";
    const PREVIEW_TAB_KEY = "mazerats_palette_preview_tab";
    // The key the old sessionStorage preview used. Only ever removed now: a
    // tab still holding it from before this change would otherwise keep
    // wearing that palette until it was closed.
    const LEGACY_PREVIEW_KEY = "mazerats_palette_preview";
    const HASH_RE = /(?:^#|&)palette-preview=([A-Za-z0-9_-]{8,64})(?:&|$)/;

    let engine = null;
    function loadEngine() {
        if (engine) return engine;
        engine = new Promise((ok, fail) => {
            if (window.Recolour) return ok(window.Recolour);
            const s = document.createElement("script");
            /* Absolute. A relative "js/recolour.js" resolved against the
               page's own folder, so on a nested address — the 404 page
               answering /maze/a/b — it asked for /maze/a/js/recolour.js, got
               the 404 page back as a script, and never recoloured. */
            s.src = "/js/recolour.js?v=2";
            s.onload = () => ok(window.Recolour);
            s.onerror = fail;
            document.head.appendChild(s);
        });
        return engine;
    }

    async function wear(palette) {
        if (!palette) return;
        const R = await loadEngine();
        if (!R) return;
        R.apply(palette);
    }

    /* The preview wins, and stops here — a tab opened to look at an unsaved
       palette must not have it replaced a moment later by whatever is live. */
    function takeHandoff() {
        let raw = null;
        try { raw = localStorage.getItem(HANDOFF_KEY); } catch (e) { return null; }
        if (!raw) return null;
        let h = null;
        try { h = JSON.parse(raw); } catch (e) { /* not ours, or torn */ }
        const m = HASH_RE.exec(location.hash || "");
        const expired = !h || !(h.expires > Date.now());
        const mine = !!(m && h && h.token === m[1]);
        // Taken if it is ours, and swept if it has gone stale — a preview
        // tab the browser blocked would otherwise leave one lying there.
        // Somebody else's, still fresh, is left for its own tab.
        if (mine || expired) {
            try { localStorage.removeItem(HANDOFF_KEY); } catch (e) {}
        }
        if (!mine || expired || !h.palette) return null;
        // The token has done its job; take it out of the address so a copy
        // of the link, or a reload, does not look for it again.
        try {
            history.replaceState(history.state, "",
                location.pathname + location.search);
        } catch (e) {}
        return h.palette;
    }

    let previewing = false;
    try { sessionStorage.removeItem(LEGACY_PREVIEW_KEY); } catch (e) {}
    const handed = takeHandoff();
    if (handed) {
        previewing = true;
        wear(handed);
        // Kept for this tab's next pages. If sessionStorage is blocked the
        // preview is this one page only, which is still a preview.
        try { sessionStorage.setItem(PREVIEW_TAB_KEY, JSON.stringify(handed)); } catch (e) {}
    } else {
        try {
            const raw = sessionStorage.getItem(PREVIEW_TAB_KEY);
            if (raw) { previewing = true; wear(JSON.parse(raw)); }
        } catch (e) { /* private mode, or something that is not a palette */ }
    }

    if (!previewing) {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const c = JSON.parse(raw);
                if (c && c.palette) wear(c.palette);
            }
        } catch (e) { /* nothing remembered, which is the normal first visit */ }

        /* Late enough not to compete with the page's own first paint, early
           enough that a change lands within a second of arriving. */
        const ask = async () => {
            try {
                /* Through Api rather than a raw fetch, so this shares the
                   page's one settings request instead of making a third.
                   See _settingsPromise in js/api.js.

                   The raw fetch is still the fallback: this script is also
                   loaded by pages that do not ship api.js, and a palette is
                   not worth a hard dependency. */
                let s;
                if (typeof Api !== "undefined") {
                    s = await Api.getSiteSettings();
                } else {
                    const res = await fetch("/.netlify/functions/settings");
                    // An error body parses as JSON too, and has no palette in
                    // it — the same trap as fromCache below.
                    if (!res.ok) return;
                    s = await res.json();
                }
                /* fromCache is getSiteSettings saying "the settings read
                   failed, here is a stand-in" (see js/api.js). The stand-in
                   has no palette in it, and treating that as "the palette was
                   turned off" stripped the colours off the page mid-view and
                   deleted the remembered copy — so a blip at the settings
                   endpoint cost every returning visitor their palette until
                   it recovered. An outage is not an answer: the cache stands,
                   exactly as the theme already does it in api.js. */
                if (!s || s.fromCache) return;
                if (!s.palette) {
                    /* Turned off since the last visit: forget it and put the
                       site back, or the cache would keep a withdrawn palette
                       alive on returning visitors indefinitely. */
                    let had = false;
                    try { had = !!localStorage.getItem(CACHE_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) {}
                    if (had && window.Recolour) window.Recolour.clear();
                    return;
                }
                const res = await fetch("/.netlify/functions/palettes?id=" +
                    encodeURIComponent(s.palette));
                /* The palette the settings name has been DELETED. That is an
                   answer, unlike an outage: forget the remembered copy and
                   take the colours off, as for a palette switched off above.
                   Before this, a 404 body simply had no palette in it, the
                   function returned, and the remembered copy went on being
                   applied on every visit for good. Any other failure is a
                   blip, and the cache stands. */
                if (res.status === 404) {
                    let had = false;
                    try { had = !!localStorage.getItem(CACHE_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) {}
                    if (had && window.Recolour) window.Recolour.clear();
                    return;
                }
                if (!res.ok) return;
                const p = await res.json();
                if (!p || !p.palette) return;
                try { localStorage.setItem(CACHE_KEY, JSON.stringify({ id: p.id, palette: p.palette })); } catch (e) {}
                wear(p.palette);
            } catch (e) { /* offline, or the endpoint is down: the cache stands */ }
        };
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => setTimeout(ask, 0));
        } else {
            setTimeout(ask, 0);
        }
    }
})();
