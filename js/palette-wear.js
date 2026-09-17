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

   The admin panel's "Preview on the site" writes a palette into
   sessionStorage and opens a tab. That beats everything else here, is not
   remembered, and dies with the tab — so an editor can look at an unsaved
   palette on the real pages without it ever being served to anybody. */
(function () {
    "use strict";

    const CACHE_KEY = "mazerats_palette_cache";
    const PREVIEW_KEY = "mazerats_palette_preview";

    let engine = null;
    function loadEngine() {
        if (engine) return engine;
        engine = new Promise((ok, fail) => {
            if (window.Recolour) return ok(window.Recolour);
            const s = document.createElement("script");
            s.src = "js/recolour.js?v=2";
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
    let previewing = false;
    try {
        const raw = sessionStorage.getItem(PREVIEW_KEY);
        if (raw) { previewing = true; wear(JSON.parse(raw)); }
    } catch (e) { /* private mode, or something that is not a palette */ }

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
                const s = await (await fetch("/.netlify/functions/settings")).json();
                if (!s || !s.palette) {
                    /* Turned off since the last visit: forget it and put the
                       site back, or the cache would keep a withdrawn palette
                       alive on returning visitors indefinitely. */
                    let had = false;
                    try { had = !!localStorage.getItem(CACHE_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) {}
                    if (had && window.Recolour) window.Recolour.clear();
                    return;
                }
                const p = await (await fetch("/.netlify/functions/palettes?id=" +
                    encodeURIComponent(s.palette))).json();
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
