/* Fallin' Furni's window on the homepage (25 Oct 2026, the owner's: "move
   the game into the mazerats website, so it opens as a window on the
   homepage … housed in a window the same style as pura panic's (like the
   console), with a dark mode as well").

   ----------------------------------------------------------------------
   THE GAME IS ITS OWN PAGE, IN A FRAME

   The console window here is Pura Panic's — .console-frame and
   .profile-console-frame, so the border art, the grip, the close box and
   every theme's recolouring come from the site's own rules — and on its
   screen is the game's page, /fallinfurni/play?embed=1, in a frame.

   Why a frame and not the game's script in this page: the game assumes it
   owns its document — keys on `document`, classes on <body>, its own
   fullscreen, its own pause on a hidden tab — and five thousand lines of it
   were measured (22 Sep) to need each of those scoped by hand. In a frame
   every one of them is already scoped. And nothing of the game is fetched
   until the window is opened: the homepage carries this file and nothing
   else.

   Embedded, the page shows its stage and nothing else (html.ff-embed in
   css/fallinfurni.css), and sends its links to the whole tab.

   ----------------------------------------------------------------------
   LOADING

   The window opens at once with "Loading..." and an empty bar on its
   screen, drawn exactly as the game draws its own; the frame stays out of
   sight until the game's page says its loading screen is up (booting),
   and the game's bar carries on from there — the files, then the levels,
   the art and the figure (Boot in js/fallinfurni.js).

   ----------------------------------------------------------------------
   ENLARGE, and the lights

   ENLARGE (25 Oct 2026, the owner's: it "replaces full screen … we'll now
   enlarge the game 2x within the browser page"): the button on the grip,
   the game's own Enlarge buttons on its title and pause menu, or F inside
   the game, doubles the whole window — two times, so the Origins art stays
   sharp, or the most that fits on a screen too small for two. Remembered on
   this browser. The bulb dims the site behind the window and turns
   the frame a deep grey, as Pura Panic's does, remembered on this
   browser. */
(function () {
    "use strict";

    const GAME_W = 720, GAME_H = 498;
    const FRAME_W = GAME_W + 22 + 2, FRAME_H = GAME_H + 28 + 14 + 2;
    const SRC = "/fallinfurni/play?embed=1";
    const DARK_KEY = "mazerats_ff_dark";
    const BIG_KEY = "mazerats_ff_big";

    let root = null, frame = null, screen = null, iframe = null, dim = null;
    let dark = false, opener = null, scale = 1, big = false;

    const isOpen = () => Boolean(root && root.classList.contains("open"));

    // The bulb and the enlarge box, one pixel to a pixel, as Pura's bulb is drawn.
    const BULB = ["..###..", ".#...#.", "#.....#", "#.....#", ".#...#.", "..###..", "..###..", "..###.."];
    const FULL = ["###.###", "#.....#", "#.....#", ".......", "#.....#", "#.....#", "###.###"];
    function pixelSvg(rows) {
        const w = rows[0].length, h = rows.length;
        let rects = "";
        rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === "#") rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
        return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
    }

    function build() {
        if (root) return;
        if (!document.querySelector('link[data-ff-window]')) {
            const l = document.createElement("link");
            l.rel = "stylesheet";
            l.href = "css/ff-window.css?v=1";
            l.setAttribute("data-ff-window", "");
            l.onload = paintChrome;
            document.head.appendChild(l);
        }
        root = document.createElement("div");
        root.className = "profile-console ff-console";
        root.id = "ff-overlay";
        root.innerHTML = `
            <div class="console-frame profile-console-frame ff-frame" id="ff-console" role="dialog" aria-labelledby="ff-console-title" tabindex="-1">
                <div class="console-border" aria-hidden="true"></div>
                <div class="console-top-pattern"><h2 class="console-title" id="ff-console-title">Fallin' Furni</h2></div>
                <button type="button" class="ff-console-btn ff-console-full" id="ff-console-full" aria-label="Enlarge" aria-pressed="false" title="Enlarge (F)">${pixelSvg(FULL)}</button>
                <button type="button" class="ff-console-btn ff-console-light" id="ff-console-light" aria-label="Lights off" aria-pressed="false">${pixelSvg(BULB)}</button>
                <button type="button" class="console-close-btn" id="ff-console-close" aria-label="Close"></button>
                <div class="console-screen ff-console-screen">
                    <div class="ff-console-wait" aria-hidden="true">
                        <p>Loading...</p>
                        <div class="ff-console-bar"><i></i></div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(root);
        frame = root.querySelector("#ff-console");
        screen = root.querySelector(".ff-console-screen");
        dim = document.createElement("div");
        dim.className = "ff-console-dim";
        dim.hidden = true;
        document.body.insertBefore(dim, root);

        root.querySelector("#ff-console-close").addEventListener("click", close);
        root.querySelector("#ff-console-light").addEventListener("click", () => setDark(!dark));
        root.querySelector("#ff-console-full").addEventListener("click", toggleEnlarge);
        try { dark = localStorage.getItem(DARK_KEY) === "1"; } catch (e) { /* private mode */ }
        try { big = localStorage.getItem(BIG_KEY) === "1"; } catch (e) { /* private mode */ }
        syncBig();
        setDark(dark, true);
        wireDrag();
        window.addEventListener("resize", () => { fit(); clamp(); });
        if (window.EscapeLayers) {
            window.EscapeLayers.register({ elements: () => (isOpen() ? [root] : []), close: () => close() });
        }
    }

    /* SMALLER ON A SMALL SCREEN, TWICE THE SIZE ENLARGED. The game is 720 x
       498 of pixel art and the frame round it 744 x 542; a browser window
       narrower or shorter than that gets the whole window scaled down to
       fit, rather than a frame hanging off the edge. Enlarged, it is two
       times — or the most the screen has room for, if that is less. */
    function fit() {
        if (!root) return;
        scale = Math.min(big ? 2 : 1, (window.innerWidth - 16) / FRAME_W, (window.innerHeight - 16) / FRAME_H);
        // Any scale but one, up as well as down: this read `scale < 1`,
        // so Enlarge made the room for a bigger window and left the game
        // its old size in the middle of it (the owner's, 25 Oct).
        frame.style.transform = scale !== 1 ? `scale(${scale})` : "";
        root.style.width = Math.round(FRAME_W * scale) + "px";
        root.style.height = Math.round(FRAME_H * scale) + "px";
    }

    function place() {
        root.style.left = Math.max(0, Math.round((window.innerWidth - root.offsetWidth) / 2)) + "px";
        root.style.top = Math.max(0, Math.round((window.innerHeight - root.offsetHeight) / 2)) + "px";
    }
    // Back into view if any of it is off the screen; where it was dragged otherwise.
    function clamp() {
        if (!isOpen()) return;
        const r = root.getBoundingClientRect();
        if (r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight) place();
    }

    // Dragged by its frame, as Pura Panic's and the Profiles window are.
    function wireDrag() {
        let pointer = null, dx = 0, dy = 0;
        frame.addEventListener("pointerdown", e => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (e.target.closest("button, a, .console-screen")) return;
            pointer = e.pointerId;
            frame.classList.add("is-dragging");
            const r = root.getBoundingClientRect();
            dx = e.clientX - r.left; dy = e.clientY - r.top;
            try { frame.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
            e.preventDefault();
        });
        window.addEventListener("pointermove", e => {
            if (pointer === null || e.pointerId !== pointer) return;
            root.style.left = Math.min(Math.max(0, window.innerWidth - root.offsetWidth), Math.max(0, e.clientX - dx)) + "px";
            root.style.top = Math.min(Math.max(0, window.innerHeight - root.offsetHeight), Math.max(0, e.clientY - dy)) + "px";
        });
        const end = e => {
            if (pointer === null || (e && e.pointerId !== pointer)) return;
            pointer = null;
            frame.classList.remove("is-dragging");
        };
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
    }

    function open() {
        const first = !root;
        build();
        if (!isOpen()) opener = document.activeElement;
        root.classList.add("open");
        fit();
        if (first) place(); else clamp();
        if (dim) dim.hidden = !dark;
        paintChrome();
        if (!iframe) {
            /* The frame comes in hidden and is shown when the game's page
               says its own loading screen is up (booting, below) — or when it
               has loaded, whichever is first — so the swap from this
               window's "Loading..." to the game's is never a blank. */
            screen.classList.remove("is-booted");
            iframe = document.createElement("iframe");
            iframe.className = "ff-console-game";
            iframe.title = "Fallin' Furni";
            iframe.allow = "fullscreen; autoplay";
            iframe.src = SRC;
            iframe.addEventListener("load", () => { booting(); iframe.focus(); });
            screen.appendChild(iframe);
        }
        frame.focus({ preventScroll: true });
        // The tab and the address name the game while it is open.
        if (window.PageMeta) window.PageMeta.set("fallinfurni", "Fallin' Furni — Maze Rats", "https://mazerats.net/fallinfurni");
    }

    // Called by the game's page (fallinfurni.html) the moment its loading screen is drawn.
    function booting() {
        if (screen) screen.classList.add("is-booted");
    }

    /* Closing ends the game: the frame goes, and with it the run (the game's
       page reports a run left mid-way as it does when its tab is closed) and
       every sound. Opened again, it starts at its title. */
    function close() {
        if (!isOpen()) return;
        if (iframe) {
            try { iframe.src = "about:blank"; } catch (e) { /* going anyway */ }
            iframe.remove();
            iframe = null;
        }
        screen.classList.remove("is-booted");
        root.classList.remove("open");
        if (dim) dim.hidden = true;
        if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus({ preventScroll: true });
        opener = null;
        if (window.PageMeta) window.PageMeta.restore("fallinfurni");
        if (/^\/fallinfurni\/?$/.test(location.pathname)) {
            try { history.replaceState(history.state, "", "/home" + location.search + location.hash); } catch (e) { /* stays */ }
        }
    }

    function toggleEnlarge() {
        big = !big;
        try { localStorage.setItem(BIG_KEY, big ? "1" : "0"); } catch (e) { /* private mode */ }
        syncBig();
        if (isOpen()) { fit(); place(); }
        // The game's own buttons say so too.
        try { if (iframe && iframe.contentWindow && iframe.contentWindow.FFOptionsSync) iframe.contentWindow.FFOptionsSync(); } catch (e) { /* not loaded */ }
        if (iframe) iframe.focus();
    }

    function syncBig() {
        const btn = root && root.querySelector("#ff-console-full");
        if (!btn) return;
        btn.setAttribute("aria-pressed", String(big));
        btn.setAttribute("aria-label", big ? "Normal size" : "Enlarge");
        btn.title = big ? "Normal size (F)" : "Enlarge (F)";
    }

    /* The bulb and the enlarge box in the frame's colours as they stand —
       read off the page, so they follow the lights and the site's themes. */
    function paintChrome() {
        if (!root) return;
        const ink = getComputedStyle(root.querySelector("#ff-console-title")).color;
        const fill = getComputedStyle(frame).backgroundColor;
        root.querySelectorAll(".ff-console-btn").forEach(b => { b.style.color = ink; b.style.backgroundColor = fill; });
    }

    function setDark(on, quiet) {
        dark = Boolean(on);
        root.classList.toggle("is-dark", dark);
        if (dim) dim.hidden = !(dark && isOpen());
        const bulb = root.querySelector("#ff-console-light");
        bulb.setAttribute("aria-pressed", String(dark));
        bulb.setAttribute("aria-label", dark ? "Lights on" : "Lights off");
        paintChrome();
        if (!quiet) { try { localStorage.setItem(DARK_KEY, dark ? "1" : "0"); } catch (e) { /* private mode */ } }
    }

    /* toggleFullscreen is the first version's name for the same button,
       kept for a game page loaded before this one. */
    window.FFWindow = {
        open, close, booting, toggleEnlarge, toggleFullscreen: toggleEnlarge,
        get isOpen() { return isOpen(); },
        get isEnlarged() { return big; }
    };
})();
