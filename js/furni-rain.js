/* A shower of seats, for the Fallin' Furni row in the side menu while the
   game is still "Coming Soon".

   The row used to take you to the game's page, which could only say it was
   not open yet. Now it gives a taste of it instead: a few dozen chairs,
   stools, benches and sofas drop from the top of the window and fall past
   the bottom, each at its own speed, the way furni falls in the game. Every
   press drops another load. Once the game is open the row goes to its page
   as before (see sideMenuEntries in js/home.js).

   The pictures are FurniIndex's own in-game renders, from the same API the
   archive's furni icons come from — the large ones, at their own
   size on every screen. They used to be doubled again on a desktop, which
   made the seats far too big; the small renders (-sml) were tried next
   and read as too small. Nothing is asked of this site's server.

   Purely decoration: the layer takes no clicks, is hidden from screen
   readers, and removes each piece when it has fallen. With reduced motion
   asked for, the pieces fade in and out where they are instead of falling. */
(function () {
    "use strict";

    /* FurniIndex's new public API (1 Oct 2026): renders by the furni's own
       classname and the game's own direction and state. The views below
       are the ones the old host's r1..r4 turned out to be, matched by their
       pixels (tools/furni-api-map.js) — not that it matters much for a seat
       falling past. Large renders, no shadow, as before. */
    const HOST = "https://api.furniindex.com/furni/";
    // [classname, its views as rotation/state], seats only: things you can sit on.
    const SEATS = [
        ["bench_autumn", ["r2/s0","r0/s0"]],   // amberwood-bench
        ["stool_autumn", ["r0/s0"]],   // amberwood-stool
        ["summer_chair*1", ["r2/s0","r4/s0"]],   // aqua-deck-chair
        ["sofachair_silo", ["r0/s0","r2/s0"]],   // armchair-2
        ["sofachair_polyfon", ["r0/s0","r2/s0"]],   // armchair-3
        ["bar_chair_armas", ["r0/s0"]],   // barrel-stool
        ["bench_armas", ["r2/s0","r0/s0"]],   // bench
        ["club_sofa", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // club-sofa
        ["deepgrove_chair", ["r0/s0","r4/s0","r6/s0"]],   // deepgrove-wooden-chair
        ["chair_silo", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // dining-chair
        ["chair_polyfon", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // dining-chair-1
        ["habbowood_chair", ["r2/s0","r4/s0","r6/s0","r0/s0"]],   // director-s-chair
        ["exe_sofa", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // executive-3-seater-sofa
        ["exe_chair", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // executive-sofa-chair
        ["gothic_chair*1", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // gothic-chair-pink
        ["gothic_sofa*1", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // gothic-sofa-pink
        ["grunge_chair", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // grunge-chair
        ["chair_plasto*14", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // hc-chair
        ["hc_chr", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // majestic-chair
        ["funky_sofa_polyfon*1", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // marrs-green-two-seater-sofa
        ["asian_gothic_chair*1", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // night-lotus-gothic-chair
        ["pillow*1", ["r0/s0","r2/s0"]],   // pink-fluffy-pillow
        ["cabin_bench_armas", ["r0/s0","r2/s0"]],   // pirate-s-bench
        ["rclr_sofa", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // polar-sofa
        ["romantique_chair*1", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // rose-quartz-chair
        ["sheji_sofa", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // sheji-sofa
        ["small_chair_armas", ["r0/s0"]],   // stool
        ["throne", ["r0/s0"]],   // throne-1
        ["hcsohva", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // throne-sofa
        ["sofa_polyfon", ["r0/s0","r2/s0"]],   // two-seater-sofa-3
        ["sofa_silo", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // two-seater-sofa-1
        ["urban_bench", ["r0/s0","r2/s0","r4/s0","r6/s0"]],   // urban-bench
        ["lc_stool", ["r0/s0","r2/s0","r4/s0","r6/s0"]]    // wood-stool
    ];
    const urlOf = (cls, view) => `${HOST}${encodeURIComponent(cls)}/large/${view}/noshadow`;

    const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const between = (a, b) => a + Math.random() * (b - a);

    let layer = null;
    function ensureLayer() {
        if (layer && layer.isConnected) return layer;
        layer = document.createElement("div");
        layer.className = "furni-rain";
        layer.setAttribute("aria-hidden", "true");
        document.body.appendChild(layer);
        return layer;
    }

    // Each picture asked for once and kept, so a piece never falls as an
    // empty box while its image is still on the way.
    const loaded = new Map();
    function image(url) {
        if (!loaded.has(url)) {
            loaded.set(url, new Promise(resolve => {
                const img = new Image();
                img.decoding = "async";
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = url;
            }));
        }
        return loaded.get(url);
    }

    function drop(host, img, delayMs, scale, still) {
        const piece = document.createElement("img");
        piece.className = "furni-rain-piece" + (still ? " is-still" : "");
        piece.src = img.src;
        piece.alt = "";
        piece.width = img.naturalWidth * scale;
        piece.height = img.naturalHeight * scale;
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        piece.style.left = Math.round(between(0, Math.max(0, vw - piece.width))) + "px";
        piece.style.animationDelay = Math.round(delayMs) + "ms";
        if (still) {
            piece.style.top = Math.round(between(0, Math.max(0, vh - piece.height))) + "px";
        } else {
            // From just above the window to just below it, each piece at
            // its own speed so they do not fall as one sheet.
            piece.style.setProperty("--fall", (vh + piece.height + 40) + "px");
            piece.style.animationDuration = Math.round(between(1500, 2600)) + "ms";
        }
        piece.addEventListener("animationend", () => piece.remove(), { once: true });
        host.appendChild(piece);
    }

    function start() {
        const host = ensureLayer();
        const still = reduceMotion();
        const phone = window.innerWidth < 700;
        const count = still ? 10 : phone ? 22 : 40;
        // The large render at its own size, on every screen.
        const scale = 1;
        for (let i = 0; i < count; i++) {
            const [slug, views] = pick(SEATS);
            const delay = still ? i * 60 : between(0, 1800);
            image(urlOf(slug, pick(views))).then(img => { if (img) drop(host, img, delay, scale, still); });
        }
    }

    window.FurniRain = { start };
})();
