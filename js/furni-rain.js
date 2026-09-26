/* A shower of seats, for the Fallin' Furni row in the side menu while the
   game is still "Coming Soon".

   The row used to take you to the game's page, which could only say it was
   not open yet. Now it gives a taste of it instead: a few dozen chairs,
   stools, benches and sofas drop from the top of the window and fall past
   the bottom, each at its own speed, the way furni falls in the game. Every
   press drops another load. Once the game is open the row goes to its page
   as before (see sideMenuEntries in js/home.js).

   The pictures are FurniIndex's own in-game renders, the same host the
   archive's furni icons come from, at their native size and scaled up by
   whole pixels so they stay crisp. Nothing is asked of this site's server.

   Purely decoration: the layer takes no clicks, is hidden from screen
   readers, and removes each piece when it has fallen. With reduced motion
   asked for, the pieces fade in and out where they are instead of falling. */
(function () {
    "use strict";

    const HOST = "https://furniindex.com/image/furni/furni-";
    // [FurniIndex name, the views of it], seats only: things you can sit on.
    const SEATS = [
        ["amberwood-bench", ["s1-r1","s1-r2"]],
        ["amberwood-stool", ["s1-r1"]],
        ["aqua-deck-chair", ["s1-r1","s1-r2"]],
        ["armchair-2", ["s1-r1","s1-r2"]],
        ["armchair-3", ["s1-r1","s1-r2"]],
        ["barrel-stool", ["s1-r1"]],
        ["bench", ["s1-r1","s1-r2"]],
        ["club-sofa", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["deepgrove-wooden-chair", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["dining-chair", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["dining-chair-1", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["director-s-chair", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["executive-3-seater-sofa", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["executive-sofa-chair", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["gothic-chair-pink", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["gothic-sofa-pink", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["grunge-chair", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["hc-chair", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["majestic-chair", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["marrs-green-two-seater-sofa", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["night-lotus-gothic-chair", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["pink-fluffy-pillow", ["s1-r1","s1-r2"]],
        ["pirate-s-bench", ["s1-r1","s1-r2"]],
        ["polar-sofa", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["rose-quartz-chair", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["sheji-sofa", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["stool", ["s1-r1"]],
        ["throne-1", ["s1-r1"]],
        ["throne-sofa", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["two-seater-sofa-3", ["s1-r1","s1-r2"]],
        ["two-seater-sofa-1", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["urban-bench", ["s1-r1","s1-r2","s1-r3","s1-r4"]],
        ["wood-stool", ["s1-r1","s1-r2","s1-r3","s1-r4"]]
    ];
    const urlOf = (slug, view) => `${HOST}${slug}-${view}-lrg.png`;

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
        // Whole-pixel scale only: 2x on a desktop, 1x on a phone, where 2x
        // sofas would be most of the screen.
        const scale = phone ? 1 : 2;
        for (let i = 0; i < count; i++) {
            const [slug, views] = pick(SEATS);
            const delay = still ? i * 60 : between(0, 1800);
            image(urlOf(slug, pick(views))).then(img => { if (img) drop(host, img, delay, scale, still); });
        }
    }

    window.FurniRain = { start };
})();
