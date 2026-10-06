/* Pura Panic — Tetris on a Habbo floor, built from Pura modules (6 Oct 2026).

   The rules are js/pura-engine.js, which the server replays every game
   through; this file is everything else: the window, the drawing, the keys
   and the pad, and the leaderboard. Loaded on demand by js/home.js (the
   side menu's row once it is live, or the /pura address), which calls
   PuraPanic.open().

   ----------------------------------------------------------------------
   THE WINDOW

   The Profiles window's: a floating console frame, the same size, dragged
   by its yellow, the page usable behind it (the owner's: its own window
   styled like the console, not a page in the console itself). Built here
   rather than written into home.html, because a hidden game should cost
   the homepage nothing.

   ----------------------------------------------------------------------
   THE ART

   The Origins client's own half-size Pura module 5 (assets/furni/
   s_pura_mdl5*), the square one with no back and no arms — the owner's
   (6 Oct 2026): only those, so every tile of every piece is the same
   square seat, and a piece reads as its shape and nothing else. It was
   first dressed as sofas, arms and backs and footstools, and the backs
   stood up over the tiles behind them. Coloured the way the client colours
   it — a multiply on its cushion, from furnidata's partcolors — in red,
   blue, green and yellow only (the owner's). A piece that is still falling
   is drawn as its outline alone, in the console's #eeeeee, the way the
   profile draws a Habbo; it takes its colours when it lands. */
(function () {
    "use strict";

    const E = window.PuraEngine;
    const API = "/.netlify/functions/pura-scores";

    // The half-size tile.
    const HW = 16, HH = 8;
    // The well's canvas: 19 half-columns of tile and 39 half-rows, with just
    // enough above the top row (OY) for its seats to stand up past the hash
    // line, and a pixel or two at the sides.
    const OX = 2, OY = 8;
    const CW = OX * 2 + (E.COLS - 1) * HW + 2 * HW;
    const CH = OY + E.ROWS * HH + HH + 2;

    const INK = "#eeeeee";
    const COLOURS = { red: "#e14218", blue: "#5eaaf8", green: "#92d13d", yellow: "#ffd837" };

    /* Module 5's parts, from js/furni-library.js (its s_ half-size entry),
       so the 1.3MB library never has to load for this: the box and anchor,
       and each part's depth offset — the client's own numbers, as
       tools/furni-extract.js recovered them. It is drawn one way only, so
       turning a piece turns its shape, not its seats. */
    const LIB = {
        5: { s: { 0: { w: 35, h: 25, ax: 1, ay: 15, p: [{ k: "a", ox: 1, oy: 13 }, { k: "b", ox: 0, oy: 0 }] } }, z: { a: [-26, -26, -26, -26, -26, -26, -26, -26], b: [-25, -25, -25, -25, -25, -25, -25, -25] } }
    };
    // Which parts take the colour: the cushion, not the chrome base (furnidata's partcolors).
    const TINTED = { a: false, b: true };

    const partUrl = (m, d, p) => `assets/furni/s_pura_mdl${m}_${p.f || "0_" + d}_${p.k}.png`;

    // Every tile of every piece: the square module, facing its one way.
    const SEAT = { m: 5, d: 0 };
    const dress = (kind) => E.ROTATIONS[kind][0].map(() => SEAT);

    /* ---------------------------------------------------------------- PICTURES */
    const images = new Map();

    function loadAll() {
        const urls = [];
        Object.keys(LIB).forEach(m => Object.keys(LIB[m].s).forEach(d => LIB[m].s[d].p.forEach(p => {
            const u = partUrl(m, d, p);
            if (!urls.includes(u)) urls.push(u);
        })));
        return Promise.all(urls.map(u => images.get(u) ? Promise.resolve() : new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => { images.set(u, img); res(); };
            img.onerror = () => rej(new Error("could not load " + u));
            img.src = u;
        })));
    }

    function canvas(w, h) {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const x = c.getContext("2d");
        x.imageSmoothingEnabled = false;
        return c;
    }

    /* One module, composed: its parts in depth order, each cushion
       multiplied by its colour (then cut back to the part's own shape, or
       the multiply floods the transparent corners). Kept per
       module/direction/colour, with its anchor. */
    const sprites = new Map();

    function moduleSprite(m, d, colour) {
        const key = m + "/" + d + "/" + colour;
        let s = sprites.get(key);
        if (s) return s;
        const lib = LIB[m];
        const box = lib.s[d] || lib.s[0];
        const dir = lib.s[d] ? d : 0;
        const c = canvas(box.w, box.h);
        const x = c.getContext("2d");
        const parts = box.p.map((p, i) => ({ p, i, z: (lib.z[p.k] || [])[dir] || 0 }))
            .sort((a, b) => a.z - b.z || a.i - b.i);
        const tmp = canvas(box.w, box.h);
        const t = tmp.getContext("2d");
        for (const { p } of parts) {
            const img = images.get(partUrl(m, dir, p));
            if (!img) continue;
            if (colour && TINTED[p.k]) {
                t.globalCompositeOperation = "source-over";
                t.clearRect(0, 0, tmp.width, tmp.height);
                t.drawImage(img, 0, 0);
                t.globalCompositeOperation = "multiply";
                t.fillStyle = COLOURS[colour];
                t.fillRect(0, 0, img.width, img.height);
                t.globalCompositeOperation = "destination-in";
                t.drawImage(img, 0, 0);
                x.drawImage(tmp, 0, 0, img.width, img.height, p.ox, p.oy, img.width, img.height);
            } else {
                x.drawImage(img, p.ox, p.oy);
            }
        }
        s = { c, ax: box.ax, ay: box.ay };
        sprites.set(key, s);
        return s;
    }

    // The same shape in one flat colour: a row flashing before it goes.
    const flashes = new Map();
    function flashSprite(s) {
        let f = flashes.get(s);
        if (f) return f;
        f = canvas(s.c.width, s.c.height);
        const x = f.getContext("2d");
        x.drawImage(s.c, 0, 0);
        x.globalCompositeOperation = "source-in";
        x.fillStyle = INK;
        x.fillRect(0, 0, f.width, f.height);
        flashes.set(s, f);
        return f;
    }

    /* A whole falling piece as its outline: composed in full colour, so the
       modules hide each other's lines as they would in the room, and then
       every pixel the client drew in pure black — the outline, which is
       exactly #000000 in these sprites — kept as #eeeeee and everything else
       dropped. habbo-outline.js does the same to a Habbo. */
    const PAD_X = 72, PAD_Y = 56;
    const outlines = new Map();

    /* `ink` is the outline's colour as [r, g, b]: the console's #eeeeee for
       a falling piece, and yellow for where it will land (see GHOST). */
    function pieceOutline(kind, rot, ink) {
        ink = ink || [0xee, 0xee, 0xee];
        const key = kind + rot + ink.join(",");
        let o = outlines.get(key);
        if (o) return o;
        const c = canvas(PAD_X * 2, PAD_Y * 2);
        const x = c.getContext("2d");
        const cells = E.ROTATIONS[kind][rot];
        const dressed = dress(kind, rot);
        const colour = E.SHAPES[kind].colour;
        cells.map(([cx, cy], i) => ({ c: cx - cy, r: cx + cy, i }))
            .sort((a, b) => a.r - b.r || a.c - b.c)
            .forEach(({ c: lc, r: lr, i }) => {
                const s = moduleSprite(dressed[i].m, dressed[i].d, colour);
                x.drawImage(s.c, PAD_X + lc * HW - HW - s.ax, PAD_Y + lr * HH - s.ay);
            });
        const data = x.getImageData(0, 0, c.width, c.height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] && !px[i] && !px[i + 1] && !px[i + 2]) {
                px[i] = ink[0]; px[i + 1] = ink[1]; px[i + 2] = ink[2]; px[i + 3] = 255;
            } else {
                px[i + 3] = 0;
            }
        }
        x.putImageData(data, 0, 0);
        outlines.set(key, c);
        return c;
    }

    /* ---------------------------------------------------------------- THE WINDOW */
    let root = null, frame = null, board = null, bx = null, nextCv = null, nx = null;
    let panel = null, scoreEl = null, subEl = null, bannerEl = null;
    let built = false;

    function build() {
        if (built) return;
        built = true;
        root = document.createElement("div");
        root.className = "profile-console pura-console";
        root.id = "pura-overlay";
        root.innerHTML = `
            <div class="console-frame profile-console-frame" id="pura-window" role="dialog" aria-labelledby="pura-title" tabindex="-1">
                <div class="console-border" aria-hidden="true"></div>
                <div class="console-top-pattern"><h2 class="console-title" id="pura-title">Pura Panic</h2></div>
                <!-- BETA, on the grip at the left as the close box is on it at
                     the right (the owner's, 6 Oct 2026). -->
                <span class="pura-beta">BETA</span>
                <!-- The lights (6 Oct 2026, the owner's): dims the site behind
                     and turns the frame a deep grey. See LIGHTS OFF. -->
                <button type="button" class="pura-light" id="pura-light" aria-label="Lights off" aria-pressed="false">${pixelSvg(BULB, 1)}</button>
                <button type="button" class="console-close-btn" id="pura-close" aria-label="Close"></button>
                <div class="console-screen profile-console-screen pura-screen">
                    <div class="pura-hud">
                        <div class="pura-stats" aria-live="off">
                            <div class="pura-score" id="pura-score">0</div>
                            <div class="pura-sub" id="pura-sub">Level 1 · 0 rows</div>
                        </div>
                        <!-- Pause and the music, on every device (P and M do the same). -->
                        <div class="pura-hud-btns">
                            <button type="button" class="pura-hud-btn" data-hud="pause" aria-label="Pause">${pixelSvg(PAUSE_ICON, 2)}</button>
                            <button type="button" class="pura-hud-btn" data-hud="music" aria-label="Mute the music">${pixelSvg(SOUND_ICON, 2)}</button>
                        </div>
                        <div class="pura-box"><span>Next</span><canvas id="pura-next" width="44" height="24" aria-hidden="true"></canvas></div>
                    </div>
                    <div class="pura-stage">
                        <canvas class="pura-board" id="pura-board" width="${CW}" height="${CH}" role="img" aria-label="The well"></canvas>
                    </div>
                    <!-- LEVEL 2, LEVEL 3…: shown across the middle as a level goes up. -->
                    <div class="pura-banner" id="pura-banner" aria-live="polite" hidden></div>
                    <!-- Over the whole screen, score and all, not just the well. -->
                    <div class="pura-panel" id="pura-panel"></div>
                    <div class="console-screen-shadow" aria-hidden="true"></div>
                </div>
            </div>`;
        document.body.appendChild(root);
        frame = root.querySelector("#pura-window");
        board = root.querySelector("#pura-board");
        bx = board.getContext("2d");
        bx.imageSmoothingEnabled = false;
        nextCv = root.querySelector("#pura-next");
        nx = nextCv.getContext("2d");
        nx.imageSmoothingEnabled = false;

        panel = root.querySelector("#pura-panel");
        bannerEl = root.querySelector("#pura-banner");
        scoreEl = root.querySelector("#pura-score");
        subEl = root.querySelector("#pura-sub");

        root.querySelector("#pura-close").addEventListener("click", close);
        root.querySelector("#pura-light").addEventListener("click", () => setDark(!dark));
        frame.classList.toggle("is-touch", touchy());
        root.querySelector(".pura-hud-btns").addEventListener("click", e => {
            const b = e.target.closest("[data-hud]");
            if (!b) return;
            if (b.dataset.hud === "pause") pause();
            else toggleMusic();
        });
        dim = document.createElement("div");
        dim.className = "pura-dim";
        dim.hidden = true;
        document.body.insertBefore(dim, root);
        /* The pill in the title's own colours, read off the page rather than
           written here, so whichever palette the console is wearing (themes
           recolour it; see tools/themes.js) the pill wears it too: the
           title's brown as the fill, the frame's yellow as the letters. */
        try { dark = localStorage.getItem(DARK_KEY) === "1"; } catch (e) { /* private mode */ }
        setDark(dark, true);
        soundIcon();
        wireDrag();
        wireTouch();
        panel.addEventListener("click", onPanelClick);
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("resize", clamp);
        window.addEventListener("blur", () => { if (mode === "play") pause(); });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden && mode === "play") pause();
            // No sound from a tab nobody is looking at; back when it is.
            if (music()) { if (document.hidden) music().pause(); else if (isOpen()) music().resume(); }
        });
        // The screen clips but must never scroll (as the Profiles window's).
        const screen = frame.querySelector(".console-screen");
        screen.addEventListener("scroll", () => { screen.scrollTop = 0; screen.scrollLeft = 0; });
        if (window.EscapeLayers) {
            window.EscapeLayers.register({ elements: () => isOpen() ? [root] : [], close: () => close() });
        }
    }

    const isOpen = () => Boolean(root && root.classList.contains("open"));

    function place() {
        const w = root.offsetWidth, h = root.offsetHeight;
        root.style.left = Math.max(0, Math.round((window.innerWidth - w) / 2)) + "px";
        root.style.top = Math.max(0, Math.round((window.innerHeight - h) / 2)) + "px";
    }

    function clamp() {
        if (!isOpen()) return;
        const r = root.getBoundingClientRect();
        root.style.left = Math.min(Math.max(0, window.innerWidth - root.offsetWidth), Math.max(0, r.left)) + "px";
        root.style.top = Math.min(Math.max(0, window.innerHeight - root.offsetHeight), Math.max(0, r.top)) + "px";
    }

    // Dragged by its yellow, as the Profiles window is (wireProgressDrag in js/home.js).
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

    let loaded = null;
    let opener = null;

    function open() {
        if (!E) return;
        const first = !built;
        build();
        if (!isOpen()) opener = document.activeElement;
        root.classList.add("open");
        if (first) place(); else clamp();
        frame.focus({ preventScroll: true });
        /* The track, muffled, under the splash (js/pura-music.js, MUFFLED):
           from the top on a fresh open, carried on if a game is paused. */
        if (music()) {
            if (mode === "paused" && music().playing) { music().setMuffled(true); music().resume(); }
            else if (!music().playing) music().start(1, { muffled: true });
        }
        // The tab and the address name the game while it is open, as Guess
        // the Maze's do (PageMeta in js/site.js).
        if (window.PageMeta) window.PageMeta.set("purapanic", "Pura Panic — Maze Rats", "https://mazerats.net/purapanic");
        if (!loaded) {
            showPanel("loading");
            loaded = Promise.all([loadAll(), checkGate()]).then(() => { if (mode === "idle") showPanel("title"); draw(); })
                .catch(() => { loaded = null; showPanel("failed"); });
        } else if (mode === "idle" || mode === "over" || mode === "board") {
            // Reopened after a game, or from its leaderboard: the splash, as
            // on a first open (the owner's, 6 Oct 2026). A paused game is
            // left as it was.
            mode = "idle";
            showPanel("title");
        }
        if (dim) dim.hidden = !dark;
        loop();
    }

    /* LIGHTS OFF (6 Oct 2026, the owner's). The bulb left of the close box
       dims the site behind the window, as a maze or an event window does,
       and turns the frame — never the screen — from the console's yellow to
       a deep grey, almost black but plainly not: the frame's art is redrawn
       in that grey (assets/img/console/dark/), the rest is css/pura-panic.css
       under .is-dark. Remembered on this browser. The pill and the bulb take
       their colours from the frame and its title as they stand, so they
       follow both this and the site's themes. */
    const DARK_KEY = "mazerats_pura_dark";
    let dark = false, dim = null;

    function setDark(on, quiet) {
        dark = Boolean(on);
        root.classList.toggle("is-dark", dark);
        if (dim) dim.hidden = !(dark && isOpen());
        const bulb = root.querySelector("#pura-light");
        bulb.setAttribute("aria-pressed", String(dark));
        bulb.setAttribute("aria-label", dark ? "Lights on" : "Lights off");
        const ink = getComputedStyle(root.querySelector("#pura-title")).color;
        const fill = getComputedStyle(frame).backgroundColor;
        const pill = root.querySelector(".pura-beta");
        pill.style.background = ink;
        pill.style.color = fill;
        bulb.style.color = ink;
        bulb.style.backgroundColor = fill;
        if (!quiet) { try { localStorage.setItem(DARK_KEY, dark ? "1" : "0"); } catch (e) { /* private mode */ } }
    }

    /* MAINTENANCE (6 Oct 2026, the owner's): until the Warren puts the game
       live it says it is being worked on, as Fallin' Furni does when shut —
       to a player, a notice where Play would be; to an admin signed in to
       the Warren, the game as usual with a line saying it is shut, since
       playing it shut is what shutting it is for. The board takes no scores
       either way (pura-scores.js issues no run token). The admin check is
       the Warren's own (/.netlify/functions/auth, "verify"), with the
       same six-second leash Fallin' Furni's page gives it; no answer is
       not an admin, which costs an admin a reload and a player nothing. */
    let gate = { live: false, admin: false };

    function checkGate() {
        // Api is a top-level const in js/api.js, so never on window: a
        // window.Api test was always false and kept the game shut for every
        // player even once live (the go-live scan, 6 Oct 2026).
        const settings = (typeof Api !== "undefined" && typeof Api.getSiteSettings === "function")
            ? Api.getSiteSettings().catch(() => null) : Promise.resolve(null);
        return settings.then(st => {
            const live = Boolean(st && st.puraPanicState === "live");
            if (live) { gate = { live: true, admin: false }; return; }
            let token = null;
            try { token = localStorage.getItem("mazerats_admin_token"); } catch (e) { /* private mode */ }
            if (!token) { gate = { live: false, admin: false }; return; }
            const verify = fetch("/.netlify/functions/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-token": token },
                body: JSON.stringify({ action: "verify" })
            }).then(r => (r.ok ? r.json() : null)).catch(() => null);
            const leash = new Promise(res => setTimeout(() => res(null), 6000));
            return Promise.race([verify, leash]).then(who => {
                gate = { live: false, admin: Boolean(who && who.username) };
            });
        });
    }

    // Whether this visitor may press Play: the game is live, or they are an
    // admin, or it is a dev-server test game (see testLevel).
    const mayPlayNow = () => gate.live || gate.admin || testLevel() > 0;

    function close() {
        if (!isOpen()) return;
        if (mode === "play") pause();
        releaseAll();
        // Nothing plays behind a closed window. A paused game's track is
        // only held, and picks up muffled when the window opens again.
        if (music()) { if (mode === "paused") music().pause(); else music().stop(); }
        root.classList.remove("open");
        if (dim) dim.hidden = true;
        if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus({ preventScroll: true });
        opener = null;
        if (window.PageMeta) window.PageMeta.restore("purapanic");
        if (/^\/(pura|purapanic)\/?$/.test(location.pathname)) {
            try { history.replaceState(history.state, "", "/home" + location.search + location.hash); } catch (e) { /* stays */ }
        }
    }

    /* ---------------------------------------------------------------- THE GAME */
    let mode = "idle";     // idle | dealing | play | paused | over | board
    let boardFrom = "title";
    let g = null;          // the engine's game
    let run = null;        // { token, seed, reason } from the server, or null
    let gameMs = 0;
    let fallAt = 0;        // ms of game time until the next half-row step
    let lockAt = null;     // ms of game time left before a landed piece locks
    let lockResets = 0;
    let soft = false;
    let anim = null;       // a clear being shown: the flash, then the drop
    let banner = null;     // a level going up: { t, total } while LEVEL n is shown
    let shownLevel = 1;    // the last level the banner announced
    let result = null;     // what the board said about the last game

    const LOCK_RESETS = 15;
    const SOFT_MS = 28;
    const FLASH_MS = 360;
    const DROP_MS = 220;
    /* THE LEVEL BANNER (the owner's, 6 Oct 2026): when a level goes up,
       nothing comes down for a moment and LEVEL n is shown across the
       middle; then the next piece rises in at the new speed. */
    const BANNER_MS = 1500;

    // The soundtrack (js/pura-music.js), if it loaded; the game plays without it.
    const music = () => window.PuraMusic || null;

    async function startRun() {
        try {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), 5000);
            const res = await fetch(API + "?action=start", { method: "POST", credentials: "same-origin", signal: ctl.signal });
            clearTimeout(timer);
            const body = await res.json().catch(() => ({}));
            if (res.status === 403 && window.Account && Account.writeRefused(403, body, "play")) return { refused: true };
            if (res.ok && body.token && Number.isInteger(body.seed)) return { token: body.token, seed: body.seed };
            return { token: null, reason: body.reason || "unavailable" };
        } catch (e) {
            return { token: null, reason: "offline" };
        }
    }

    /* TESTING A LEVEL (6 Oct 2026, the owner's: to try 50, 75 and 100 without
       playing up to them). On the dev server only, /pura?level=75 starts every
       game at that level — its speed, its landing pause, its points — and the
       game is never sent to the leaderboard: the server replays from level 1
       and would score it differently anyway. Nowhere else does the address
       do anything. */
    // Rows credited to a test game to put it at its level, left out of what is shown.
    let rowsBase = 0;

    function testLevel() {
        if (location.hostname !== "localhost") return 0;
        let n = 0;
        try { n = parseInt(new URLSearchParams(location.search).get("level"), 10); } catch (e) { /* none */ }
        return Number.isInteger(n) && n >= 1 && n <= 150 ? n : 0;
    }

    function localSeed() {
        try { return crypto.getRandomValues(new Uint32Array(1))[0]; }
        catch (e) { return Math.floor(Math.random() * 4294967296); }
    }

    async function play() {
        if (mode === "dealing") return;
        if (!mayPlayNow()) return;
        if (window.Account && typeof Account.mayPlay === "function" && !Account.mayPlay()) return;
        if (needsName()) { showPanel("who"); return; }
        // Started from the press itself: browsers only let sound begin from one.
        if (music()) music().start(1);
        mode = "dealing";
        showPanel("dealing");
        const startAt = testLevel();
        rowsBase = 0;
        run = startAt ? { token: null, reason: "test" } : await startRun();
        // Closed while the server was dealing (close() has already stopped
        // the music): no game starts behind a shut window.
        if (!isOpen() || mode !== "dealing") { if (mode === "dealing") mode = "idle"; return; }
        if (run.refused) { mode = "idle"; showPanel("title"); return; }
        g = E.newGame(run.token ? run.seed : localSeed());
        if (startAt > 1) {
            g.level = startAt;
            g.bands = (startAt - 1) * E.BANDS_PER_LEVEL;
            rowsBase = g.bands;
            if (music()) music().setLevel(startAt);
        }
        gameMs = 0;
        fallAt = E.stepMs(g.level);
        lockAt = null; lockResets = 0; deepest = -1;
        anim = null; result = null;
        banner = null; shownLevel = g.level; hideBanner();
        mode = "play";
        hidePanel();
        hud();
        frame.focus({ preventScroll: true });
    }

    function pause() {
        if (mode !== "play") return;
        mode = "paused";
        releaseAll();
        if (music()) music().setMuffled(true);
        if (bannerEl) bannerEl.style.animationPlayState = "paused";
        showPanel("paused");
    }

    function resume() {
        if (mode !== "paused") return;
        mode = "play";
        hidePanel();
        if (bannerEl) bannerEl.style.animationPlayState = "";
        if (music()) { music().resume(); music().setMuffled(false); }
        frame.focus({ preventScroll: true });
    }

    function showBanner(level) {
        bannerEl.textContent = "LEVEL " + level;
        bannerEl.hidden = false;
        // Restart its animation, even for two levels in a row.
        bannerEl.classList.remove("is-on");
        void bannerEl.offsetWidth;
        bannerEl.classList.add("is-on");
    }

    function hideBanner() {
        if (!bannerEl) return;
        bannerEl.hidden = true;
        bannerEl.classList.remove("is-on");
    }

    function hud() {
        const s = g ? g.score : 0;
        scoreEl.textContent = s.toLocaleString("en-GB");
        const rows = g ? g.bands - rowsBase : 0;
        subEl.textContent = `Level ${g ? g.level : 1} · ${rows} ${rows === 1 ? "row" : "rows"}`;
        drawNext();
    }

    /* THE NEXT PIECE, as floor tiles in its shape at half the well's size
       (the owner's, 6 Oct 2026): the seats themselves took the top of the
       screen over, and there is no smaller Pura art to draw them with — the
       catalogue icon is a sliver of a seat's front edge. Each tile is drawn
       pixel by pixel, the floor's 2:1 diagonal, so it stays sharp; a
       neighbour's edge falls on exactly the same pixels, so tiles that touch
       share one line. */
    const MINI_W = 8, MINI_H = 4;   // half a mini tile

    function miniTile(x, cx, cy) {
        x.fillStyle = "rgba(238, 238, 238, 0.22)";
        for (let i = 0; i < MINI_H; i++) {
            x.fillRect(cx - 2 * i - 1, cy - MINI_H + i + 1, 4 * i + 2, 1);
            x.fillRect(cx - 2 * i - 1, cy + MINI_H - i - 2, 4 * i + 2, 1);
        }
        x.fillStyle = INK;
        for (let i = 0; i < MINI_H; i++) {
            const top = cy - MINI_H + i, bottom = cy + MINI_H - 1 - i;
            for (const y of [top, bottom]) {
                x.fillRect(cx - 2 * i - 2, y, 2, 1);
                x.fillRect(cx + 2 * i, y, 2, 1);
            }
        }
    }

    function drawNext() {
        nx.clearRect(0, 0, nextCv.width, nextCv.height);
        if (!g || !g.queue.length) return;
        const cells = E.ROTATIONS[g.queue[0]][0].map(([x, y]) => ({ c: x - y, r: x + y }));
        const cs = cells.map(p => p.c), rs = cells.map(p => p.r);
        const c0 = Math.min(...cs), r0 = Math.min(...rs);
        const w = (Math.max(...cs) - c0) * MINI_W + 2 * MINI_W;
        const h = (Math.max(...rs) - r0) * MINI_H + 2 * MINI_H;
        const ox = Math.round((nextCv.width - w) / 2) + MINI_W;
        const oy = Math.round((nextCv.height - h) / 2) + MINI_H;
        cells.forEach(p => miniTile(nx, ox + (p.c - c0) * MINI_W, oy + (p.r - r0) * MINI_H));
    }

    /* One tick of game time. */
    function step(dt) {
        if (mode !== "play") return;
        gameMs += dt;
        if (anim) {
            anim.t += dt;
            if (anim.t >= anim.total) finishAnim();
            return;
        }
        if (banner) {
            banner.t += dt;
            if (banner.t >= banner.total) { banner = null; hideBanner(); fallAt = E.stepMs(g.level); }
            return;
        }
        const piece = g.piece;
        if (!piece) return;
        if (E.landed(g.board, piece)) {
            if (lockAt === null) lockAt = lockResets >= LOCK_RESETS ? 0 : E.lockMs(g.level);
            lockAt -= dt;
            if (lockAt <= 0) settle();
            return;
        }
        lockAt = null;
        fallAt -= dt;
        let guard = 0;
        while (fallAt <= 0 && guard++ < 8) {
            const next = E.fall(g.board, g.piece);
            if (!next) { fallAt = 0; break; }
            g.piece = next;
            deeper();
            fallAt += soft ? SOFT_MS : E.stepMs(g.level);
        }
    }

    function settle() {
        const piece = g.piece;
        const dressed = dress(piece.kind, piece.rot);
        const res = E.settle(g, (i) => ({ m: dressed[i].m, d: dressed[i].d }));
        lockAt = null; lockResets = 0; deepest = -1;
        fallAt = E.stepMs(g.level);
        if (res.cleared.length) {
            /* The clear played out in steps: the rows flash, what was left
               hanging falls, and any row that fall fills flashes in its turn
               and goes, and so on down the chain. */
            const steps = [{ kind: "flash", board: res.before, rows: res.first, ms: FLASH_MS }];
            res.stages.forEach(s => {
                if (s.moves.length) steps.push({ kind: "fall", board: s.from, moves: s.moves, ms: DROP_MS });
                if (s.cleared.length) steps.push({ kind: "flash", board: s.settled, rows: s.cleared, ms: FLASH_MS });
            });
            anim = { t: 0, total: steps.reduce((n, s) => n + s.ms, 0), steps, over: g.over };
        } else if (g.over) {
            gameOver();
        }
        hud();
    }

    function finishAnim() {
        const over = anim.over;
        anim = null;
        if (over) { gameOver(); return; }
        // A level only goes up when rows clear, so it is announced here, once
        // the clear has played out.
        if (g.level > shownLevel) {
            shownLevel = g.level;
            banner = { t: 0, total: BANNER_MS };
            showBanner(g.level);
            if (music()) { music().setLevel(g.level); music().levelUp(); }
        }
    }

    /* Moves, from the keys and the pad. A move or turn on a landed piece
       buys it more time before it locks — fifteen times at most, so it
       cannot be spun on a ledge for ever. */
    function act(what) {
        if (mode !== "play" || anim || banner || !g.piece) return;
        let next = null;
        if (what === "left" || what === "right") {
            // Landed: slip half a row down that side into a gap if there is
            // one (the tuck), else slide along the row as ever.
            if (E.landed(g.board, g.piece)) next = E.tuck(g.board, g.piece, what);
            if (!next) next = E.move(g.board, g.piece, what);
        }
        else if (what === "turn") next = E.rotate(g.board, g.piece, 1);
        else if (what === "turnBack") next = E.rotate(g.board, g.piece, -1);
        else if (what === "hard") {
            g.piece = E.dropped(g.board, g.piece);
            settle();
            return;
        }
        if (!next) return;
        const wasLanded = E.landed(g.board, g.piece);
        g.piece = next;
        if (deeper()) return;
        if (wasLanded && lockResets < LOCK_RESETS) { lockResets++; lockAt = E.lockMs(g.level); }
    }

    /* The lowest the piece has reached. Getting lower than that starts its
       count of lock resets over (as Tetris does); turning it up and back
       down on the same ledge does not. */
    let deepest = -1;
    function deeper() {
        const low = Math.max(...E.cellsOf(g.piece).map(p => p.r));
        if (low <= deepest) return false;
        deepest = low;
        lockResets = 0;
        lockAt = null;
        return true;
    }

    function setSoft(on) {
        if (soft === on) return;
        soft = on;
        if (on) fallAt = Math.min(fallAt, SOFT_MS);
    }

    /* ---------------------------------------------------------------- KEYS

       Held left and right repeat after a short pause, as every Tetris does.
       Taken from the page while the game is being played — the arrows and
       the space bar would otherwise scroll the archive behind — and while
       the window has the focus; otherwise they are the page's. */
    const REPEAT_WAIT = 170, REPEAT_EVERY = 50;
    const held = {};
    const KEYMAP = {
        ArrowLeft: "left", a: "left", A: "left",
        ArrowRight: "right", d: "right", D: "right",
        ArrowUp: "turn", x: "turn", X: "turn", w: "turn", W: "turn",
        z: "turnBack", Z: "turnBack",
        ArrowDown: "soft", s: "soft", S: "soft",
        " ": "hard", Spacebar: "hard",
        p: "pause", P: "pause",
        m: "music", M: "music"
    };

    function ours(e) {
        if (!isOpen()) return false;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return false;
        return mode === "play" || root.contains(document.activeElement);
    }

    function onKey(e) {
        if (!ours(e) || e.ctrlKey || e.metaKey || e.altKey) return;
        const what = KEYMAP[e.key];
        if (e.key === "Enter" && mode !== "play") {
            const btn = panel.querySelector("[data-go]");
            if (btn && document.activeElement && document.activeElement.tagName === "BUTTON" && root.contains(document.activeElement)) return;
            if (btn) { e.preventDefault(); btn.click(); }
            return;
        }
        if (!what) return;
        if (mode !== "play" && what !== "pause" && what !== "music") return;
        e.preventDefault();
        e.stopPropagation();
        if (what === "music") { if (!e.repeat) toggleMusic(); return; }
        if (what === "pause") { if (!e.repeat) { if (mode === "play") pause(); else if (mode === "paused") resume(); } return; }
        if (mode !== "play") return;
        if (e.repeat) return;
        press(what);
    }

    function onKeyUp(e) {
        const what = KEYMAP[e.key];
        if (what && held[what]) { e.preventDefault(); release(what); }
    }

    function press(what) {
        if (what === "soft") { held.soft = true; setSoft(true); return; }
        if (what === "left" || what === "right") {
            release(what === "left" ? "right" : "left");
            act(what);
            const h = held[what] = { t: null };
            h.t = setTimeout(function again() {
                if (held[what] !== h) return;
                act(what);
                h.t = setTimeout(again, REPEAT_EVERY);
            }, REPEAT_WAIT);
            return;
        }
        act(what);
    }

    function release(what) {
        const h = held[what];
        if (!h) return;
        if (h.t) clearTimeout(h.t);
        delete held[what];
        if (what === "soft") setSoft(false);
    }

    function releaseAll() { Object.keys(held).forEach(release); setSoft(false); }

    /* ---------------------------------------------------------------- TOUCH

       No buttons (the owner's, 6 Oct 2026: a row of them along the foot
       looked janky, and on a computer the keys do it all). On a phone the
       well itself is the control, the way phone Tetris games play:

           drag sideways     the piece follows, a tile per tile's width
           drag down         faster, for as long as the finger is down
           flick down        drop
           tap               turn

       A touch that starts moving sideways stays a sideways drag, and one
       that starts down stays a down drag, so a drop never moves the piece
       across on its way and a move never drops it. A mouse plays by the
       keys; pressing on the well does nothing for one. */
    const TAP_MS = 220, TAP_SLOP = 8, FLICK_PX = 36, FLICK_MS = 220, SOFT_PX = 18;

    function wireTouch() {
        let t = null;
        // Canvas pixels per CSS pixel: the window may be drawn smaller on a narrow phone.
        const scale = () => board.width / (board.getBoundingClientRect().width || board.width);
        board.addEventListener("pointerdown", e => {
            if (e.pointerType === "mouse" || mode !== "play") return;
            e.preventDefault();
            try { board.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
            t = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, at: performance.now(), axis: null, moved: false };
        });
        board.addEventListener("pointermove", e => {
            if (!t || e.pointerId !== t.id || mode !== "play") return;
            const k = scale();
            const dx = (e.clientX - t.x0) * k, dy = (e.clientY - t.y0) * k;
            if (!t.axis && Math.max(Math.abs(dx), Math.abs(dy)) > TAP_SLOP) t.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            if (t.axis === "x") {
                // A tile across is two half-columns: 2 * HW canvas pixels.
                let step = (e.clientX - t.x) * k;
                while (Math.abs(step) >= 2 * HW) {
                    const dir = step < 0 ? "left" : "right";
                    act(dir);
                    t.moved = true;
                    t.x += (step < 0 ? -2 * HW : 2 * HW) / k;
                    step = (e.clientX - t.x) * k;
                }
            } else if (t.axis === "y") {
                setSoft(dy > SOFT_PX);
            }
        });
        const end = e => {
            if (!t || e.pointerId !== t.id) return;
            const k = scale();
            const dx = (e.clientX - t.x0) * k, dy = (e.clientY - t.y0) * k;
            const ms = performance.now() - t.at;
            setSoft(false);
            if (mode === "play" && e.type === "pointerup") {
                if (!t.axis && ms < TAP_MS && Math.abs(dx) <= TAP_SLOP && Math.abs(dy) <= TAP_SLOP) act("turn");
                else if (t.axis === "y" && dy > FLICK_PX && ms < FLICK_MS) act("hard");
            }
            t = null;
        };
        board.addEventListener("pointerup", end);
        board.addEventListener("pointercancel", end);
    }

    const touchy = () => window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    /* ---------------------------------------------------------------- DRAWING */
    const centre = (c, r) => [OX + c * HW + HW, OY + r * HH + HH];

    /* The floor, and a hash line across its top edge, in the console's own
       dashes (the owner's, 6 Oct 2026: the floor stopped dead and looked cut
       off). It is also the line a stack must not climb over. The floor
       fading out above the well was tried too, alone and with the line, and
       the line alone is what he chose. */
    function drawFloor() {
        bx.lineWidth = 1;
        bx.strokeStyle = "rgba(238, 238, 238, 0.16)";
        bx.beginPath();
        for (let r = 0; r < E.ROWS; r++) {
            for (let c = r & 1; c < E.COLS; c += 2) {
                const [sx, sy] = centre(c, r);
                bx.moveTo(sx - HW + 0.5, sy + 0.5);
                bx.lineTo(sx + 0.5, sy - HH + 0.5);
                bx.lineTo(sx + HW + 0.5, sy + 0.5);
                bx.lineTo(sx + 0.5, sy + HH + 0.5);
                bx.closePath();
            }
        }
        bx.stroke();
        bx.save();
        bx.strokeStyle = "rgba(238, 238, 238, 0.7)";
        bx.setLineDash([3, 2]);
        bx.beginPath();
        bx.moveTo(OX, OY + 0.5);
        bx.lineTo(CW - OX, OY + 0.5);
        bx.stroke();
        bx.restore();
    }

    /* A LINE ONE TILE SHORT glows where its last tile goes (the owner's, 6
       Oct 2026): the gap a piece is wanted in, lit softly on the floor and
       breathing, so it can be found at a glance. Drawn on the floor, under
       everything standing on it. */
    function nearlyFull() {
        const out = new Map();
        for (let r = 0; r < E.ROWS; r++) {
            let missing = -1, gaps = 0;
            for (let c = r & 1; c < E.COLS; c += 2) {
                if (!g.board[r][c]) { gaps++; missing = c; if (gaps > 1) break; }
            }
            // Only a gap a piece could still get to: a sealed one glowing
            // was a promise the board could not keep.
            if (gaps === 1 && E.open(g.board, r, missing)) out.set(r, missing);
        }
        return out;
    }

    // Drawn in its own row's turn, so the seats in front stand over it as they would.
    function drawGlow(c, r) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
        const [sx, sy] = centre(c, r);
        bx.beginPath();
        bx.moveTo(sx - HW + 1, sy);
        bx.lineTo(sx, sy - HH + 0.5);
        bx.lineTo(sx + HW - 1, sy);
        bx.lineTo(sx, sy + HH - 0.5);
        bx.closePath();
        bx.fillStyle = "rgba(238, 238, 238, " + (0.3 + 0.3 * pulse).toFixed(3) + ")";
        bx.fill();
        bx.strokeStyle = "rgba(255, 255, 255, " + (0.7 + 0.3 * pulse).toFixed(3) + ")";
        bx.stroke();
    }

    function drawModule(v, c, r, dy, flash) {
        const s = moduleSprite(v.m, v.d, v.colour);
        const [sx, sy] = centre(c, r);
        bx.drawImage(flash ? flashSprite(s) : s.c, Math.round(sx - HW - s.ax), Math.round(sy - s.ay + (dy || 0)));
    }

    /* A piece coming in rises out from under the hash line rather than
       hanging in the air above it (the owner's, 6 Oct 2026): nothing of a
       falling piece is drawn above the line. */
    /* THE GHOST, where the piece will land: its outline in yellow, #ffff00
       (the owner's, 6 Oct 2026). It was the falling piece's own light grey at
       30%, and against the grey floor and the furni it went missing. */
    const GHOST_INK = [0xff, 0xff, 0x00];
    const GHOST_ALPHA = 0.55;

    function drawOutline(piece, alpha, ink) {
        const o = pieceOutline(piece.kind, piece.rot, ink);
        const x = OX + HW + (piece.x - piece.y) * HW - PAD_X;
        const y = OY + HH + (piece.x + piece.y) * HH - PAD_Y;
        bx.save();
        bx.beginPath();
        bx.rect(0, OY + 1, CW, CH);
        bx.clip();
        if (alpha < 1) bx.globalAlpha = alpha;
        bx.drawImage(o, x, y);
        bx.restore();
    }

    function draw() {
        if (!bx) return;
        bx.clearRect(0, 0, CW, CH);
        if (frame.classList.contains("is-splash")) return;
        drawFloor();
        const glow = (g && loaded && !anim && mode !== "over") ? nearlyFull() : null;
        if (!g || !loaded) return;

        // What the board looks like right now, and how each tile is shown.
        let cells = g.board;
        let flashing = null, sliding = null, flashRows = null;
        if (anim) {
            // Which step of the clear this moment is in.
            let t = anim.t, s = anim.steps[0];
            for (const step of anim.steps) { s = step; if (t < step.ms) break; t -= step.ms; }
            cells = s.board;
            if (s.kind === "flash") {
                flashRows = s.rows;
                flashing = Math.floor(t / 90) % 2 === 0;
            } else {
                // Every tile that was left hanging sliding from where it was
                // to where it came to rest.
                const k = Math.min(1, t / s.ms);
                sliding = new Map(s.moves.map(m => [m.fromR + "," + m.fromC,
                    { dx: (m.c - m.fromC) * HW * k, dy: (m.r - m.fromR) * HH * k }]));
            }
        }
        const goes = (r) => Boolean(flashRows) && flashRows.includes(r);
        const piece = (!anim && !banner && mode !== "over") ? g.piece : null;
        const ghost = piece ? E.dropped(g.board, piece) : null;
        const pieceRows = piece ? E.cellsOf(piece).map(p => p.r) : [];
        const ghostRows = ghost ? E.cellsOf(ghost).map(p => p.r) : [];
        const pieceAt = pieceRows.length ? Math.max(...pieceRows) : null;
        const ghostAt = ghostRows.length ? Math.max(...ghostRows) : null;

        for (let r = Math.min(0, pieceRows.length ? Math.min(...pieceRows) : 0); r < E.ROWS; r++) {
            if (r >= 0) {
                if (glow && glow.has(r)) drawGlow(glow.get(r), r);
                for (let c = r & 1; c < E.COLS; c += 2) {
                    const v = cells[r][c];
                    if (!v) continue;
                    const cleared = goes(r);
                    const sl = sliding && sliding.get(r + "," + c);
                    if (sl) {
                        const s = moduleSprite(v.m, v.d, v.colour);
                        const [sx, sy] = centre(c, r);
                        bx.drawImage(s.c, Math.round(sx - HW - s.ax + sl.dx), Math.round(sy - s.ay + sl.dy));
                        continue;
                    }
                    drawModule(v, c, r, 0, cleared && flashing === false);
                }
            }
            if (ghost && r === ghostAt) drawOutline(ghost, GHOST_ALPHA, GHOST_INK);
            if (piece && r === pieceAt) drawOutline(piece, 1);
        }
    }

    let raf = 0, last = 0;
    function loop() {
        if (raf) return;
        last = performance.now();
        const frameFn = (now) => {
            raf = 0;
            if (!isOpen()) return;
            const dt = Math.min(100, now - last);
            last = now;
            step(dt);
            draw();
            raf = requestAnimationFrame(frameFn);
        };
        raf = requestAnimationFrame(frameFn);
    }

    /* ---------------------------------------------------------------- PANELS */
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const num = (n) => Number(n || 0).toLocaleString("en-GB");
    const ord = (n) => {
        const s = ["th", "st", "nd", "rd"], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    function hidePanel() { panel.hidden = true; panel.innerHTML = ""; frame.classList.remove("is-splash"); }

    /* THE SPLASH (the owner's, 6 Oct 2026): before a game, the screen holds
       the title, the instructions and the two buttons and nothing else — no
       score, no next piece, no floor, nothing dimmed. The floor appears with
       the first game.

       THE LEADERBOARD always looks like this, wherever it is opened from:
       over a finished game, the dimmed score and floor showed through behind
       its rows and read as a mess (the owner's, 6 Oct 2026). Back puts the
       game-over screen and the game behind it back as they were. */
    const SPLASH = ["loading", "failed", "dealing", "title"];

    function showPanel(which, extra) {
        panel.hidden = false;
        panel.className = "pura-panel" + (which === "board" ? " pura-panel--board" : "");
        frame.classList.toggle("is-splash", SPLASH.includes(which) || which === "board" || which === "who");
        let html = "";
        if (which === "loading") html = `<p>Loading…</p>`;
        else if (which === "failed") html = `<p>The furni could not be loaded.</p><div class="pura-buttons"><button type="button" class="console-btn" data-go="retry">Try again</button></div>`;
        else if (which === "dealing") html = `<p>Dealing…</p>`;
        else if (which === "title") {
            html = `<p class="pura-big">PURA PANIC</p>
                <div class="console-hashline" aria-hidden="true"></div>
                ${mayPlayNow() ? `<p>Turn the Pura modules and slot them in.<br>Fill a line of tiles across the floor to clear it.</p>
                ${touchy() ? TOUCH_HELP : KEY_HELP}
                <div class="pura-buttons">
                    <button type="button" class="console-btn" data-go="play">Play</button>
                    <button type="button" class="console-btn" data-go="board">Leaderboard</button>
                </div>
                ${guestLine()}` : `<p class="pura-maint">We're working hard on making Pura Panic better! Bear with us, we'll have it up and running again shortly.</p>`}
                ${!gate.live && gate.admin && !testLevel() ? `<p class="pura-beta-note">Maintenance: only admins can play right now, and scores aren't kept.</p>` : ""}
                ${testLevel() ? `<p class="pura-beta-note">Test mode: every game starts at level ${testLevel()}. Not saved.</p>` : ""}
                <p class="pura-beta-note">This game is in beta, if you spot anything you think might be a bug, please let us know via the <a href="#" data-go="contact">contact form</a> in the Console, thank you!</p>`;
        } else if (which === "who") {
            html = `<p class="pura-big">WHO'S PLAYING?</p>
                <div class="console-hashline" aria-hidden="true"></div>
                <p>Enter your Habbo Origins username.</p>
                <div class="pura-who-row">
                    <input type="text" id="pura-who-name" class="console-input pura-who-name" maxlength="32"
                           autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your Habbo Origins username"
                           value="${guest ? esc(guest.name) : ""}">
                </div>
                <p class="pura-who-status" id="pura-who-status" aria-live="polite"></p>
                <div class="pura-buttons">
                    <button type="button" class="console-btn" data-go="whoplay">Play</button>
                    <button type="button" class="console-btn" data-go="cancel">Back</button>
                </div>
                <p class="pura-beta-note">Your scores go on the leaderboard under this name. Or <a href="#" data-go="signin">sign in with Discord</a> to keep them with your account.</p>`;
        } else if (which === "paused") {
            html = `<p class="pura-big">PAUSED</p>
                <div class="pura-buttons">
                    <button type="button" class="console-btn" data-go="resume">Resume</button>
                    <button type="button" class="console-btn" data-go="quit">End game</button>
                </div>
                ${musicButton()}`;
        } else if (which === "over") {
            html = `<p class="pura-big">GAME OVER</p>
                <div class="console-hashline" aria-hidden="true"></div>
                <p>${num(g && g.score)} points · ${num(g && g.bands - rowsBase)} ${g && g.bands - rowsBase === 1 ? "row" : "rows"} · level ${g ? g.level : 1}</p>
                <div class="pura-note" id="pura-note">${overNote()}</div>
                <div class="pura-buttons">
                    <button type="button" class="console-btn" data-go="play">Play again</button>
                    <button type="button" class="console-btn" data-go="board">Leaderboard</button>
                </div>
                ${musicButton()}`;
        } else if (which === "board") {
            html = `<p class="pura-big">LEADERBOARD</p>
                <div class="console-hashline" aria-hidden="true"></div>
                ${extra || "<p>Loading…</p>"}
                <div class="pura-buttons"><button type="button" class="console-btn" data-go="back">Back</button></div>`;
        }
        panel.innerHTML = html;
        const first = panel.querySelector("[data-go]");
        if (first && isOpen() && root.contains(document.activeElement)) first.focus({ preventScroll: true });
        if (which === "who") wireWho();
    }

    function me() { return window.Account ? Account.current : null; }

    const musicLabel = () => "Music: " + (music() && music().muted ? "Off" : "On");
    const musicButton = () => music()
        ? `<div class="pura-buttons"><button type="button" class="console-btn" data-go="music">${musicLabel()}</button></div>`
        : "";

    function toggleMusic() {
        if (!music()) return;
        music().setMuted(!music().muted);
        panel.querySelectorAll('[data-go="music"]').forEach(b => { b.textContent = musicLabel(); });
        soundIcon();
    }

    function soundIcon() {
        const b = root && root.querySelector('[data-hud="music"]');
        if (!b || !music()) return;
        const off = music().muted;
        b.innerHTML = pixelSvg(off ? MUTED_ICON : SOUND_ICON, 2);
        b.setAttribute("aria-label", off ? "Turn the music on" : "Mute the music");
    }

    /* Pixel icons, drawn from rows of text ("#" a pixel in the button's own
       colour), at a whole-pixel scale so they stay sharp. */
    function pixelSvg(rows, scale) {
        const w = rows[0].length, h = rows.length;
        let rects = "";
        rows.forEach((row, y) => [...row].forEach((ch, x) => {
            if (ch === "#") rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
        }));
        return `<svg width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`;
    }

    // The close box's own frame (cnsl-top-x-close.png) with a bulb for its X:
    // solid, glass tapering into a screw base (an outline read as a keyhole).
    const BULB = [
        ".............",
        ".###########.",
        ".#.........#.",
        ".#...###...#.",
        ".#..#####..#.",
        ".#..#####..#.",
        ".#..#####..#.",
        ".#...###...#.",
        ".#...###...#.",
        ".#....#....#.",
        ".#.........#.",
        ".###########.",
        "............."
    ];
    const PAUSE_ICON = [
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "##..##"
    ];
    const SOUND_ICON = [
        "....#.....",
        "...##..#..",
        "####....#.",
        "####..#.#.",
        "####..#.#.",
        "####....#.",
        "...##..#..",
        "....#....."
    ];
    const MUTED_ICON = [
        "....#.....",
        "...##.....",
        "####.#..#.",
        "####..##..",
        "####..##..",
        "####.#..#.",
        "...##.....",
        "....#....."
    ];

    /* The keys, drawn as keys — an old beige keyboard's (the owner's: "the
       classic 90s style"), in the screen's one colour: a sculpted top face
       sitting on a skirt that slopes away on every side, deepest at the
       front, the way those keys stood up off the board. Pixel-drawn SVG, so
       it stays sharp at any size the window is shown at.

       The legend sits on the face. The arrow is drawn once pointing up and
       turned about the face's middle — a whole pixel, so the turned arrow
       lands on whole pixels too — and so all four are the same arrow. */
    const KEY_H = 26;
    function keycap(w, legend) {
        const ink = "#eeeeee", tint = (a) => `rgba(238,238,238,${a})`;
        // The face: in 4px at the sides, 3px at the top, 7px up from the foot.
        const fx = 4, fy = 3, fw = w - 8, fh = KEY_H - 10;
        const R = w - 0.5, B = KEY_H - 0.5;
        const poly = (pts, fill) => `<polygon points="${pts}" fill="${fill}"/>`;
        const dark = (a) => `rgba(0,0,0,${a})`;
        const edge = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="1"/>`;
        // Lit from above and to the left, as every drawing of a keyboard is.
        return `<svg class="pura-key" viewBox="0 0 ${w} ${KEY_H}" width="${w}" height="${KEY_H}" aria-hidden="true">`
            + poly(`0.5,0.5 ${R},0.5 ${fx + fw},${fy} ${fx},${fy}`, tint(0.6))                  // top skirt, lit
            + poly(`0.5,0.5 ${fx},${fy} ${fx},${fy + fh} 0.5,${B}`, tint(0.38))                  // left, half lit
            + poly(`${R},0.5 ${R},${B} ${fx + fw},${fy + fh} ${fx + fw},${fy}`, dark(0.45))     // right, in shade
            + poly(`${fx},${fy + fh} ${fx + fw},${fy + fh} ${R},${B} 0.5,${B}`, dark(0.25))     // front lip
            + edge(0.5, 0.5, fx + 0.5, fy + 0.5) + edge(R, 0.5, fx + fw - 0.5, fy + 0.5)
            + edge(0.5, B, fx + 0.5, fy + fh - 0.5) + edge(R, B, fx + fw - 0.5, fy + fh - 0.5)
            + `<rect x="0.5" y="0.5" width="${w - 1}" height="${KEY_H - 1}" rx="2" fill="none" stroke="${ink}"/>`
            + `<rect x="${fx + 0.5}" y="${fy + 0.5}" width="${fw - 1}" height="${fh - 1}" rx="1.5" fill="${tint(0.2)}" stroke="${ink}"/>`
            + legend(fx + fw / 2, fy + fh / 2)
            + `</svg>`;
    }
    // Seven pixels square, pointing up, its middle at (0.5, 0.5) so a quarter
    // turn about that point lands every pixel on a whole pixel again.
    const ARROW = "M0 -3h1v1h1v1h1v1h1v1H-3V0h1V-1h1V-2h1zM0 1h1v3H0z";
    const arrowKey = (turn) => keycap(28, (cx, cy) =>
        `<path transform="translate(${Math.round(cx - 0.5)} ${Math.round(cy - 0.5)}) rotate(${turn} 0.5 0.5)" d="${ARROW}" fill="#eeeeee" shape-rendering="crispEdges"/>`);
    const textKey = (t) => keycap(Math.max(28, t.length * 6 + 16), (cx, cy) =>
        `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="'Volter Goldfish', 'Pixelify Sans', monospace" font-size="9" fill="#eeeeee">${t}</text>`);
    const keyRow = (cap, what, said) => `<li>${cap}<span>${what}</span><span class="visually-hidden">: ${said}</span></li>`;

    const KEY_HELP = `<div class="pura-help">
            <ul class="pura-help-col" aria-label="Arrow keys">
                ${keyRow(arrowKey(-90), "Move left", "left arrow")}
                ${keyRow(arrowKey(90), "Move right", "right arrow")}
                ${keyRow(arrowKey(0), "Turn", "up arrow")}
                ${keyRow(arrowKey(180), "Speed Up", "down arrow")}
            </ul>
            <ul class="pura-help-col" aria-label="Other keys">
                ${keyRow(textKey("Space"), "Drop", "space bar")}
                ${keyRow(textKey("P"), "Pause", "P")}
                ${keyRow(textKey("M"), "Music", "M")}
            </ul>
        </div>`;

    // On a phone the same list, the gestures standing where the keys would.
    const TOUCH_HELP = `<div class="pura-help">
            <ul class="pura-help-col" aria-label="Gestures">
                ${keyRow(textKey("Drag"), "Move", "drag sideways")}
                ${keyRow(textKey("Tap"), "Turn", "tap")}
            </ul>
            <ul class="pura-help-col" aria-label="More gestures">
                ${keyRow(textKey("Drag down"), "Faster", "drag down")}
                ${keyRow(textKey("Flick down"), "Drop", "flick down")}
            </ul>
        </div>`;

    function overNote() {
        if (!result) return "Saving…";
        const r = result;
        if (r.state === "hidden" || r.state === "maintenance") return "Pura Panic is under maintenance, so scores aren't being kept.";
        if (r.state === "test") return "A test game from level " + testLevel() + ", so it wasn't saved.";
        if (r.state === "offline") return "The leaderboard couldn't be reached, so this game wasn't saved.";
        if (r.state === "signed-out") return `Sign in with Discord and choose a nickname to save your scores.<br><button type="button" class="console-btn" data-go="signin">Sign in</button>`;
        if (r.state === "no-nick") return `Choose a nickname to save your scores.<br><button type="button" class="console-btn" data-go="nick">Choose a nickname</button>`;
        if (r.state === "no-score") return "Clear a row to get on the board.";
        if (r.state === "recorded") return `New best! You're ${ord(r.place || 1)} on the board.`;
        if (r.state === "kept") return `Your best is still ${num(r.best && r.best.score)}${r.place ? ` (${ord(r.place)})` : ""}.`;
        if (r.state === "refused") return "That game couldn't be checked, so it wasn't saved.";
        if (r.state === "name-taken") return "That username belongs to a signed-up player now, so this game wasn't saved. Pick another next time.";
        if (r.state === "stale-run") return "That game was started too long ago, or on another account, so it wasn't saved.";
        if (r.state === "already-submitted") return "That game was already sent.";
        if (r.state === "no-run-token") return "That game wasn't started with the leaderboard, so it wasn't saved.";
        if (r.state === "blocked") return "";
        return "This game wasn't saved.";
    }

    function onPanelClick(e) {
        const btn = e.target.closest("[data-go]");
        if (!btn) return;
        if (btn.tagName === "A") e.preventDefault();
        const go = btn.dataset.go;
        if (go === "play") play();
        else if (go === "who") showPanel("who");
        else if (go === "whoplay") chooseName();
        else if (go === "cancel") showPanel("title");
        else if (go === "resume") resume();
        else if (go === "quit") { mode = "play"; endEarly(); }
        else if (go === "board") showBoard();
        else if (go === "back") { mode = boardFrom === "over" ? "over" : "idle"; showPanel(boardFrom); }
        else if (go === "retry") { open(); }
        else if (go === "signin" && window.Account) Account.signIn();
        else if (go === "nick" && window.Account) Account.editNickname();
        else if (go === "music") toggleMusic();
        // The Console's Contact Us form, which opens over this window.
        else if (go === "contact" && window.MazeConsole) MazeConsole.open("message");
    }

    /* THE GAME LOG (pura-scores.js): a finished game that is not for the
       board — signed out, no nickname, no rows — is still sent, for the
       Warren's figures, and the server replays it like any other. Nobody
       waits on it. With it, the three things only the page knows, and a
       signed-out player's Habbo name. */
    function gameFacts() {
        const out = { touch: touchy(), dark, muted: Boolean(music() && music().muted) };
        if (!me() && guest) out.habbo = guest.name;
        return out;
    }

    function logPlayed() {
        if (!run || !run.token || !g || !g.log.length) return;
        const body = JSON.stringify({ run: run.token, log: g.log, ms: Math.round(gameMs), ...gameFacts() });
        fetch(API + "?action=played", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body,
            // Survives the window or the tab closing, when small enough to.
            keepalive: body.length < 60000
        }).catch(() => { /* a figure lost, never a game */ });
    }

    /* ---------------------------------------------------------------- WHO'S PLAYING

       Signed out, Play first asks for the player's Habbo Origins username
       (6 Oct 2026, the owner's), and their scores go on the leaderboard
       under it ("that's the whole point of them adding their username").
       Anything may be typed — it is not looked up on Origins (the owner's:
       "they can just type anything") — except a signed-up player's name
       (pura-scores.js, nameTaken: "Username taken, try again!"), which the
       server refuses again when the score arrives. A check that cannot be
       reached lets the name through: our trouble never stops a game.
       Remembered on this browser, so the next Play goes straight in; the
       splash says who and offers Change. Signed in, none of this: the
       account says who. */
    const NAME_KEY = "mazerats_pura_habbo";
    const HABBO_NAME = /^[A-Za-z0-9_\-=?!@:.,]{1,32}$/;
    let guest = null;
    try {
        const v = JSON.parse(localStorage.getItem(NAME_KEY) || "null");
        if (v && HABBO_NAME.test(v.name)) guest = { name: v.name };
    } catch (e) { /* private mode */ }

    const needsName = () => gate.live && !testLevel() && !me() && !guest;

    function guestLine() {
        if (!gate.live || testLevel() || me() || !guest) return "";
        return `<p class="pura-beta-note">Playing as <strong>${esc(guest.name)}</strong> · <a href="#" data-go="who">Change</a></p>`;
    }

    function wireWho() {
        const input = panel.querySelector("#pura-who-name");
        if (!input) return;
        input.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); chooseName(); }
        });
        input.addEventListener("input", () => whoSay(""));
        if (!touchy()) input.focus({ preventScroll: true });
    }

    function whoSay(text) {
        const st = panel.querySelector("#pura-who-status");
        if (st) st.textContent = text;
    }

    // A fetch on a twelve-second leash, as Fallin' Furni's lookup is.
    async function leashed(url) {
        const ctl = typeof AbortController === "function" ? new AbortController() : null;
        const t = ctl ? setTimeout(() => ctl.abort(), 12000) : 0;
        try {
            const res = await fetch(url, ctl ? { signal: ctl.signal, credentials: "same-origin" } : { credentials: "same-origin" });
            const data = await res.json().catch(() => ({}));
            return { res, data };
        } finally { clearTimeout(t); }
    }

    let choosing = false;
    async function chooseName() {
        const input = panel.querySelector("#pura-who-name");
        if (!input || choosing) return;
        const name = input.value.trim();
        if (!name) { whoSay("Enter your Habbo Origins username."); input.focus(); return; }
        if (!HABBO_NAME.test(name)) { whoSay("Letters, numbers and - _ . , : ! ? @ = only, no spaces."); input.focus(); return; }
        choosing = true;
        const btn = panel.querySelector('[data-go="whoplay"]');
        if (btn) btn.disabled = true;
        whoSay("Checking…");
        let verdict = "ok";
        try {
            const taken = await leashed(API + "?name=" + encodeURIComponent(name)).catch(() => null);
            if (taken && taken.res.ok && taken.data.taken) verdict = "taken";
        } finally {
            choosing = false;
        }
        // Moved on while it was being checked (Back, or the window shut).
        if (panel.querySelector("#pura-who-name") !== input) return;
        if (btn) btn.disabled = false;
        if (verdict === "taken") { whoSay("Username taken, try again!"); input.focus(); input.select(); return; }
        guest = { name };
        try { localStorage.setItem(NAME_KEY, JSON.stringify(guest)); } catch (e) { /* this game only */ }
        play();
    }

    function endEarly() {
        // Ending a game is ending it: what was cleared still counts.
        anim = null;
        gameOver();
    }

    async function gameOver() {
        mode = "over";
        releaseAll();
        banner = null; hideBanner();
        if (music()) music().gameOver();
        result = null;
        hud();
        nx.clearRect(0, 0, nextCv.width, nextCv.height);
        showPanel("over");
        result = await submit();
        if (mode === "over") {
            const note = panel.querySelector("#pura-note");
            if (note) note.innerHTML = overNote();
        }
    }

    async function submit() {
        if (run && run.reason === "test") return { state: "test" };
        if (!run || !run.token) return { state: run && (run.reason === "hidden" || run.reason === "maintenance") ? "maintenance" : "offline" };
        const p = me();
        if (!p && !guest) { logPlayed(); return { state: "signed-out" }; }
        if (p && !p.nick) { logPlayed(); return { state: "no-nick" }; }
        if (!g.score) { logPlayed(); return { state: "no-score" }; }
        try {
            const res = await fetch(API, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ run: run.token, log: g.log, ms: Math.round(gameMs), score: g.score, ...gameFacts() })
            });
            const body = await res.json().catch(() => ({}));
            if (res.status === 403) {
                if (window.Account && Account.writeRefused(403, body, "play")) return { state: "blocked" };
                return { state: "no-nick" };
            }
            if (res.status === 400) return { state: "refused" };
            if (!res.ok) return { state: "offline" };
            if (body.recorded) return { state: "recorded", place: body.place, best: body.best };
            if (body.reason === "not-your-best") return { state: "kept", place: body.place, best: body.best };
            if (body.reason === "no-score") return { state: "no-score" };
            if (body.reason === "signed-out") return { state: "signed-out" };
            if (body.reason === "no-pieces") return { state: "no-score" };
            if (["maintenance", "stale-run", "already-submitted", "no-run-token"].includes(body.reason)) return { state: body.reason };
            if (body.reason === "name-taken") {
                // Somebody signed up with it since: the next Play asks again.
                guest = null;
                try { localStorage.removeItem(NAME_KEY); } catch (e) { /* this game only */ }
                return { state: "name-taken" };
            }
            return { state: "offline" };
        } catch (e) {
            return { state: "offline" };
        }
    }

    async function showBoard() {
        boardFrom = mode === "over" ? "over" : "title";
        mode = "board";
        // The muffled track under the board too, back from silence after a game.
        if (music()) { if (music().playing && !music().sad) music().setMuffled(true); else music().start(1, { muffled: true }); }
        showPanel("board");
        let html;
        try {
            const mine = !me() && guest ? "?guest=" + encodeURIComponent(guest.name) : "";
            const res = await fetch(API + mine, { credentials: "same-origin", headers: { Accept: "application/json" } });
            if (!res.ok) throw new Error(String(res.status));
            const body = await res.json();
            const rows = (body.top || []).map((r, i) => rowHtml(i + 1, r, false));
            if (body.you && !(body.top || []).some(r => r.name === body.you.name && r.score === body.you.score)) {
                rows.push(rowHtml(body.you.place || "–", body.you, true));
            }
            html = rows.length ? `<ol class="pura-rows" data-scrollbar="console">${rows.join("")}</ol>`
                : `<p>${body.open === false ? "The board opens when Pura Panic does." : "Nobody's on the board yet."}</p>`;
        } catch (e) {
            html = `<p>The leaderboard couldn't be read just now.</p>`;
        }
        if (mode === "board") {
            showPanel("board", html);
            // The Console's own pixel scrollbar, not the browser's (the owner's).
            if (window.CustomScrollbar) CustomScrollbar.attach(panel.querySelector(".pura-rows"));
        }
    }

    function rowHtml(rank, r, you) {
        const head = r.avatar
            ? `<img class="pura-head" src="${esc(r.avatar)}" alt="" aria-hidden="true">`
            : `<span class="pura-head pura-head--none" aria-hidden="true"></span>`;
        return `<li class="pura-row${you ? " is-you" : ""}"><span class="pura-rank">${esc(rank)}</span>${head}<span class="pura-name">${esc(r.name)}</span><span class="pura-pts">${num(r.score)}</span></li>`;
    }

    // The stylesheet comes with the game, not with the homepage.
    (function css() {
        if (document.querySelector('link[data-pura]')) return;
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = "css/pura-panic.css?v=22";
        l.dataset.pura = "1";
        document.head.appendChild(l);
    })();

    window.PuraPanic = { open, close, isOpen };
    // For testing on the dev server only: a look at the game, never a way to change it.
    if (location.hostname === "localhost") window.PuraPanic._game = () => g;
})();
