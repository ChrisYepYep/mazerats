/* Rat Race (12 Oct 2026, the owner's) — a platform game in the Maze Rats
   window: Scout the explorer, through the zones of a labyrinth, act by act.

   What he settled before it was built (12 Oct 2026; see js/rat-race-art.js
   and js/rat-race-levels.js for the drawings and the maps):
   - Room by room: each act a map built of 20 x 14 rooms, the camera sliding
     smoothly over it. A life lost puts Scout back where he came into the room.
   - Sonic's way of going on: ZONES, each of three ACTS, no bosses. Zone 1 is
     the Mine Labyrinth (once the Wood); Stone Catacombs, Ice Caverns and Dark Depths follow.
   - An act's goal: find the key, open the locked door. Coins and secret
     rooms are extra.
   - Scout runs, jumps, climbs ladders and ropes, wall-jumps, crouches and
     crawls, and pushes crates.
   - A wider window, the Mega Drive's 320 x 224 at twice the size, and a
     fullscreen button; on a phone, buttons under the window.
   - Best times kept per act, and for the whole zone. (On this browser for
     now; the leaderboard comes later.)
   - Nothing of Habbo's in it: Scout, the coins and the rest are its own, and
     its words are in its own pixel lettering (js/rat-race-font.js).

   In the Warren's Maintenance it is shut but to admins (MAINTENANCE). */
(function () {
    "use strict";

    const ART = window.RatArt, FONT = window.RatFont, LEVELS = window.RatLevels;
    const music = () => window.RatMusic || null;
    const sfx = (name, ...a) => { const m = music(); if (m && typeof m[name] === "function") { try { m[name](...a); } catch (e) { /* plays on in silence */ } } };

    /* ================================================================ TUNING
       Per frame at 60 frames a second, in pixels. */
    const VW = 320, VH = 224, TS = 16, ROOM_W = 20, ROOM_H = 14;
    const RUN_MAX = 1.9, RUN_ACCEL = 0.22, RUN_DECEL = 0.32, AIR_ACCEL = 0.16;
    /* THE RUN-UP (16 Oct 2026, the owner's: "jumping further if you hold a
       left or right arrow"). Held at full speed on the ground for RUN_UP
       frames, his top speed climbs from RUN_MAX to RUN_FAST, and a jump keeps
       it: a full-speed jump clears a tile more (four, not three). Nothing
       that could be reached before is any harder. */
    const RUN_FAST = 2.4, RUN_UP = 60;
    /* LOOKING UP AND DOWN (16 Oct 2026, the owner's, after Sonic): standing
       still, up held (or down, crouched) for LOOK_WAIT frames pans the view
       LOOK_SPAN pixels that way; let go and it comes back. */
    const LOOK_WAIT = 45, LOOK_SPAN = 72, LOOK_RATE = 2;
    const GRAVITY = 0.28, FALL_MAX = 5, JUMP_V = 4.65, JUMP_CUT = 1.6;
    const COYOTE = 6, BUFFER = 7;
    /* THE WALL (13 Oct 2026: "wall climbing up a shaft feels impossible"). In
       the air, touching a wall is enough (no need to be falling, or to hold
       towards it), and for WALL_GRACE frames after leaving it a jump still
       counts. A wall jump carries him across to the far wall of a shaft by
       itself, so climbing one is a tap of jump at each touch, nothing held.
       (A single wall still cannot be climbed: that is what crates are for.) */
    const WALL_SLIDE = 1.0, WALL_JUMP_VX = 2.3, WALL_JUMP_VY = 4.3, WALL_LOCK = 9;
    const WALL_GRACE = 8;
    const CLIMB_V = 1.15, CRAWL_V = 0.75, PUSH_V = 0.55;
    const STAND_H = 22, CROUCH_H = 13, BODY_W = 10;
    const STOMP_BOUNCE = 3.6;
    const LIVES = 3;
    const BEST_KEY = "mazerats_ratrace_best2";
    const DARK_KEY = "mazerats_ratrace_dark";
    /* PROGRESS (13 Oct 2026): the furthest zone reached, and every ruby ever
       found (by zone, passage and place), kept in this browser. */
    const PROGRESS_KEY = "mazerats_ratrace_progress";
    let progress = { reached: 0, rubies: [] };
    // (26 Oct 2026, the bug scan: kept within the zones there are, as a whole number; a saved "reached" past the
    // last of them, from an edited or older save, had the title's zone picker reach for a zone that is not there and throw every frame)
    try { const v = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null"); if (v && typeof v === "object") progress = { reached: Math.max(0, Math.min(LEVELS.zones.length - 1, Math.floor(Number(v.reached)) || 0)), rubies: Array.isArray(v.rubies) ? v.rubies : [] }; } catch (e) { /* none yet */ }
    const saveProgress = () => { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) { /* private mode */ } };

    /* ================================================================ ART
       Each picture becomes a canvas, and a mirrored one for facing left. */
    const sprites = {};
    function toCanvas(rows, pal) {
        const c = document.createElement("canvas");
        c.width = rows[0].length; c.height = rows.length;
        const x = c.getContext("2d");
        rows.forEach((row, y) => [...row].forEach((ch, i) => {
            const col = (pal && pal[ch]) || ART.pal[ch];
            if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
        }));
        return c;
    }
    function mirror(c) {
        const d = document.createElement("canvas");
        d.width = c.width; d.height = c.height;
        const x = d.getContext("2d");
        x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0);
        return d;
    }
    function buildArt() {
        if (sprites.ready) return;
        for (const [name, s] of Object.entries(ART.sprites)) {
            const frames = (s.frames || [s.rows]).map(r => toCanvas(r, s.pal));   // (22 Oct 2026: a sprite may carry its own colours over the shared ones)
            sprites[name] = { r: frames, l: frames.map(mirror) };
        }
        /* THE OTHER ZONES' ART (js/rat-race-zones.js): each sprite there is
           "name@zone", with its own palette over the shared one; while that
           zone is on, spr("name") draws it in place of the Wood's. */
        const ZS = (window.RatZones && window.RatZones.sprites) || {};
        for (const [name, s] of Object.entries(ZS)) {
            const frames = (s.frames || [s.rows]).map(r => toCanvas(r, s.pal));
            sprites[name] = { r: frames, l: frames.map(mirror) };
        }
        sprites.ready = true;
        for (const [name, src] of Object.entries(SPRITE_FILES)) loadSpriteFile(name, src);
    }
    /* SPRITES FROM IMAGE FILES (13 Oct 2026, the owner's: so he can draw a sprite
       in an image editor and save it, rather than ask). Each one listed here is
       drawn from its PNG once it has loaded, in place of the one drawn from text
       in js/rat-race-art.js, which stays as the stand-in until then (and if the
       file is missing). Asked for afresh on every page load on the dev server
       (26 Oct 2026: there only), so a resaved picture shows at the next
       reload: images on this site may otherwise be cached for a day. */
    const SPRITE_FILES = {
        key: "/assets/img/ariadne/key.png",          // the key you pick up
        keyIcon: "/assets/img/ariadne/key-icon.png", // the small one in the top-right corner
        torchBase: "/assets/img/ariadne/lantern.png",  // the wall lantern, without its flame (drawn over it, 10px higher)
        doorOpen: "/assets/img/ariadne/door-open.png"  // the end doorway, once the door is open
    };
    function loadSpriteFile(name, src) {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext("2d").drawImage(img, 0, 0);
            sprites[name] = { r: [c], l: [mirror(c)] };
        };
        // (26 Oct 2026, the bug scan: asked afresh on the dev server and in the editor only; on the site a picture
        // changes only with a deploy, and a fresh address on every visit fetched all four again each time)
        img.src = src + (location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "?t=" + Date.now() : "");
    }
    let ZK = "wood";   // the zone whose art is on (see THEMES)
    // (a sprite this zone has not drawn and the Wood has none of: any zone's, so the Heart can borrow every creature)
    const anyZone = {};
    const spr = (name, n, left) => { const s = (ZK !== "wood" && sprites[name + "@" + ZK]) || sprites[name] || sprites[anyZone[name] || (anyZone[name] = Object.keys(sprites).find(k => k.startsWith(name + "@")))]; const list = left ? s.l : s.r; return list[((n % list.length) + list.length) % list.length]; };

    /* ================================================================ THE WINDOW */
    let root = null, frame = null, screenEl = null, cv = null, g = null, padEl = null, dim = null;
    let built = false, dark = false, opener = null;
    const isOpen = () => Boolean(root && root.classList.contains("open"));
    const touchy = () => { try { return matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } };

    function ensureStyles() {
        for (const href of ["css/pura-panic.css?v=6", "css/rat-race.css?v=5"]) {
            const name = href.split("?")[0];
            if ([...document.querySelectorAll("link[rel=stylesheet]")].some(l => (l.getAttribute("href") || "").split("?")[0].replace(/^\//, "") === name)) continue;
            const l = document.createElement("link");
            l.rel = "stylesheet"; l.href = href;
            // measured before its stylesheet arrived, the window was centred at the wrong size: centre it again now, unless it has been dragged
            l.addEventListener("load", () => { paintChrome(); fit(); if (moved) clamp(); else place(); });
            document.head.appendChild(l);
        }
    }

    function build() {
        if (built) return;
        built = true;
        ensureStyles();
        buildArt();
        root = document.createElement("div");
        root.className = "profile-console pura-console rr-console";
        root.id = "rr-overlay";
        root.innerHTML = `
            <div class="console-frame profile-console-frame" id="rr-window" role="dialog" aria-labelledby="rr-title" tabindex="-1">
                <div class="console-border" aria-hidden="true"></div>
                <div class="console-top-pattern"><h2 class="console-title" id="rr-title">Scout's Trail</h2></div>
                <span class="pura-beta">BETA</span>
                <div class="rr-bar-btns rr-hud-btns">
                    <button type="button" class="rr-bar-btn" data-hud="pause" aria-label="Pause">${pixelSvg(PAUSE_ICON, 1)}</button>
                    <button type="button" class="rr-bar-btn" data-hud="music" aria-label="Mute the music">${pixelSvg(SOUND_ICON, 1)}</button>
                    <button type="button" class="rr-bar-btn" data-hud="full" aria-label="Fullscreen">${pixelSvg(FULL_ICON, 1)}</button>
                </div>
                <button type="button" class="pura-light" id="rr-light" aria-label="Lights off" aria-pressed="false">${pixelSvg(BULB, 1)}</button>
                <button type="button" class="console-close-btn" id="rr-close" aria-label="Close"></button>
                <div class="console-screen profile-console-screen rr-screen" id="rr-screen">
                    <canvas class="rr-board" id="rr-board" width="${VW}" height="${VH}" role="img" aria-label="Scout's Trail"></canvas>
                    <div class="rr-corner rr-hud-btns">
                        <button type="button" class="rr-corner-btn" data-hud="pause" aria-label="Pause">${pixelSvg(PAUSE_ICON, 1)}</button>
                        <button type="button" class="rr-corner-btn" data-hud="music" aria-label="Mute the music">${pixelSvg(SOUND_ICON, 1)}</button>
                        <button type="button" class="rr-corner-btn" data-hud="full" aria-label="Fullscreen">${pixelSvg(FULL_ICON, 1)}</button>
                    </div>
                    <div class="console-screen-shadow" aria-hidden="true"></div>
                </div>
            </div>
            <div class="rr-pad" id="rr-pad" hidden>
                <div class="rr-dpad">
                    <button type="button" class="rr-pad-btn" data-k="up" aria-label="Up">${pixelSvg(ARROW_UP, 3)}</button>
                    <button type="button" class="rr-pad-btn" data-k="left" aria-label="Left">${pixelSvg(rot90(rot90(rot90(ARROW_UP))), 3)}</button>
                    <button type="button" class="rr-pad-btn" data-k="right" aria-label="Right">${pixelSvg(rot90(ARROW_UP), 3)}</button>
                    <button type="button" class="rr-pad-btn" data-k="down" aria-label="Down">${pixelSvg(rot90(rot90(ARROW_UP)), 3)}</button>
                </div>
                <div class="rr-turn" hidden>
                    <button type="button" class="rr-pad-btn" data-k="turnA" aria-label="Turn the wheel">Z</button>
                    <button type="button" class="rr-pad-btn" data-k="turnB" aria-label="Turn the wheel">X</button>
                </div>
                <button type="button" class="rr-pad-btn rr-jump" data-k="jump" aria-label="Jump">JUMP</button>
            </div>`;
        document.body.appendChild(root);
        frame = root.querySelector("#rr-window");
        screenEl = root.querySelector("#rr-screen");
        cv = root.querySelector("#rr-board");
        g = cv.getContext("2d");
        g.imageSmoothingEnabled = false;
        padEl = root.querySelector("#rr-pad");

        root.querySelector("#rr-close").addEventListener("click", close);
        // the level select's list scrolls with the mouse wheel too
        const onPauseBtn = e => {
            if (state.mode !== "paused") return -1;
            const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * VW / r.width, y = (e.clientY - r.top) * VH / r.height;
            return PAUSE_ITEMS.findIndex((_, i) => { const b = pauseBtnAt(i); return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; });
        };
        cv.addEventListener("pointermove", e => { const i = onPauseBtn(e); if (i >= 0 && i !== state.pauseSel) { state.pauseSel = i; state.pauseSure = false; } cv.style.cursor = i >= 0 ? "pointer" : ""; });
        cv.addEventListener("pointerdown", e => { const i = onPauseBtn(e); if (i < 0) return; e.preventDefault(); if (i !== state.pauseSel) { state.pauseSel = i; state.pauseSure = false; } pausePick(); });
        screenEl.addEventListener("wheel", e => { if (state.mode !== "select") return; e.preventDefault(); selectKey(e.deltaY > 0 ? "down" : "up"); }, { passive: false });
        // (26 Oct 2026: let go after a click, as the bar's buttons are, so Space jumps rather than pressing it again; kept from the keyboard)
        root.querySelector("#rr-light").addEventListener("click", e => { setDark(!dark); if (e.detail) e.currentTarget.blur(); });
        /* Pause, music and fullscreen sit in the window's title bar (13 Oct
           2026, the owner's: over the picture they covered the key and the
           flag in the corner); in fullscreen, where there is no title bar,
           the same three show in the screen's corner, over the black. */
        root.querySelectorAll(".rr-hud-btns").forEach(el => el.addEventListener("click", e => {
            const b = e.target.closest("[data-hud]");
            if (!b) return;
            if (b.dataset.hud === "music") toggleMusic();
            else if (b.dataset.hud === "pause") { if (state.mode === "paused") resume(); else pause(); }
            else toggleFull();
            if (e.detail) b.blur();   // (26 Oct 2026: a click lets go of it; pressed from the keyboard, it keeps the focus)
        }));
        root.querySelectorAll('[data-hud="full"]').forEach(b => { b.hidden = !canFull(); });   // (26 Oct 2026: see canFull)
        frame.classList.toggle("is-touch", touchy());
        padEl.hidden = !touchy();
        layoutPad();
        wirePad();
        dim = document.createElement("div");
        dim.className = "pura-dim";
        dim.hidden = true;
        document.body.insertBefore(dim, root);
        try { dark = localStorage.getItem(DARK_KEY) === "1"; } catch (e) { /* private mode */ }
        setDark(dark, true);
        soundIcon();
        wireDrag();
        // (26 Oct 2026) a press or the focus anywhere in the window or its pad brings it forward (see ONE GAME IN FRONT)
        root.addEventListener("pointerdown", toFront, true);
        root.addEventListener("focusin", toFront, true);
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("resize", () => { layoutPad(); clamp(); fit(); });
        window.addEventListener("orientationchange", () => { layoutPad(); clamp(); fit(); setTimeout(() => { layoutPad(); clamp(); fit(); }, 300); });
        document.addEventListener("fullscreenchange", fit);
        // (26 Oct 2026: during the passage's title card too, which ran on to play behind another tab or window)
        window.addEventListener("blur", () => { held.clear(); if (state.mode === "play" || state.mode === "card") pause(); });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) { held.clear(); if (state.mode === "play" || state.mode === "card") pause(); sfx("pause"); }
            else if (isOpen()) sfx("resume");
        });
        if (window.EscapeLayers) window.EscapeLayers.register({ elements: () => (isOpen() ? [root] : []), close: () => close() });
    }

    // The picture at a whole-number size where it can be, to the screen's box.
    function fit() {
        if (!cv || !screenEl) return;
        const full = document.fullscreenElement === screenEl;
        const box = full ? { w: window.innerWidth, h: window.innerHeight } : { w: screenEl.clientWidth, h: screenEl.clientHeight };
        const side = padEl && !padEl.hidden && padEl.classList.contains("is-side");
        let s = Math.min((box.w - (side ? 2 * SIDE_PAD : 0)) / VW, box.h / VH);
        if (s >= 2) s = Math.floor(s);
        if (!(s > 0)) s = 2;
        cv.style.width = Math.floor(VW * s) + "px";
        cv.style.height = Math.floor(VH * s) + "px";
    }
    /* THE PAD on a phone held sideways sits either side of the picture,
       inside the screen (so it comes into fullscreen with it), like a
       handheld's buttons; otherwise it sits under the window. */
    const SIDE_PAD = 122;
    function layoutPad() {
        if (!padEl || padEl.hidden) return;
        const side = window.innerWidth > window.innerHeight;
        padEl.classList.toggle("is-side", side);
        const home = side ? screenEl : root;
        if (padEl.parentNode !== home) home.appendChild(padEl);
    }
    // (26 Oct 2026) a phone's browser that cannot fill the screen with an element (an iPhone's) shows no button for it, and F does nothing
    const canFull = () => Boolean(screenEl && typeof screenEl.requestFullscreen === "function" && document.fullscreenEnabled !== false);
    function toggleFull() {
        if (!screenEl) return;   // (in the level editor there is no window to fill the screen with)
        try {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (screenEl.requestFullscreen) screenEl.requestFullscreen().then(fit).catch(() => {});
        } catch (e) { /* not offered */ }
    }

    const fullHeight = () => frame.offsetHeight + (padEl && !padEl.hidden && !padEl.classList.contains("is-side") ? padEl.offsetHeight + 12 : 0);
    function place() {
        const w = frame.offsetWidth, h = fullHeight();
        root.style.left = Math.max(0, Math.round((window.innerWidth - w) / 2)) + "px";
        root.style.top = Math.max(0, Math.round((window.innerHeight - h) / 2)) + "px";
    }
    function clamp() {
        if (!isOpen()) return;
        const r = root.getBoundingClientRect();
        if (r.left < 0 || r.top < 0 || r.left + frame.offsetWidth > window.innerWidth || r.top + fullHeight() > window.innerHeight) place();
    }
    let moved = false;
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
            moved = true;
            root.style.left = Math.min(Math.max(0, window.innerWidth - frame.offsetWidth), Math.max(0, e.clientX - dx)) + "px";
            root.style.top = Math.min(Math.max(0, window.innerHeight - fullHeight()), Math.max(0, e.clientY - dy)) + "px";
        });
        const end = e => { if (pointer === null || (e && e.pointerId !== pointer)) return; pointer = null; frame.classList.remove("is-dragging"); };
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
    }
    function paintChrome() {
        if (!root) return;
        const ink = getComputedStyle(root.querySelector("#rr-title")).color;
        const fill = getComputedStyle(frame).backgroundColor;
        const pill = root.querySelector(".pura-beta"), bulb = root.querySelector("#rr-light");
        pill.style.background = ink; pill.style.color = fill;
        bulb.style.color = ink; bulb.style.backgroundColor = fill;
        // (the plate under the window wears the frame's colour; beside the picture there is no plate)
        if (padEl) padEl.style.setProperty("--rr-plate", fill);
    }
    function setDark(on, quiet) {
        dark = Boolean(on);
        root.classList.toggle("is-dark", dark);
        if (dim) dim.hidden = !(dark && isOpen());
        const bulb = root.querySelector("#rr-light");
        bulb.setAttribute("aria-pressed", String(dark));
        bulb.setAttribute("aria-label", dark ? "Lights on" : "Lights off");
        paintChrome();
        if (!quiet) { try { localStorage.setItem(DARK_KEY, dark ? "1" : "0"); } catch (e) { /* private mode */ } }
    }
    function toggleMusic() {
        const m = music();
        if (!m) return;
        sfx("setMuted", !(m.isMuted && m.isMuted()));
        soundIcon();
    }
    function soundIcon() {
        if (!root) return;
        const m = music();
        const off = Boolean(m && m.isMuted && m.isMuted());
        root.querySelectorAll('[data-hud="music"]').forEach(b => {
            b.hidden = !m;
            b.innerHTML = pixelSvg(off ? MUTED_ICON : SOUND_ICON, 1);
            b.setAttribute("aria-label", off ? "Turn the music on" : "Mute the music");
        });
    }

    /* MAINTENANCE (11 Oct 2026), as Pura Panic's: until the Warren puts it
       Live (settings ratRaceState), a player is told it is being worked on,
       and an admin signed in to the Warren plays it as usual. */
    let gate = { live: false, admin: false };
    function checkGate() {
        const settings = (typeof Api !== "undefined" && typeof Api.getSiteSettings === "function")
            ? Api.getSiteSettings().catch(() => null) : Promise.resolve(null);
        return settings.then(st => {
            const live = Boolean(st && st.ratRaceState === "live");
            let token = null;
            try { token = localStorage.getItem("mazerats_admin_token"); } catch (e) { /* private mode */ }
            if (!token) { gate = { live, admin: false }; return; }
            // live: play at once, and find out about the admin (the level select's) behind it
            if (live) gate = { live: true, admin: false };
            const verify = fetch("/.netlify/functions/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-token": token },
                body: JSON.stringify({ action: "verify" })
            }).then(r => (r.ok ? r.json() : null)).catch(() => null);
            const leash = new Promise(res => setTimeout(() => res(null), 6000));
            const asked = Promise.race([verify, leash]).then(who => { gate = { live, admin: Boolean(who && who.username) }; });
            return live ? undefined : asked;
        });
    }
    const mayPlayNow = () => gate.live || gate.admin;

    /* ONE GAME IN FRONT (26 Oct 2026; Pura Panic and the Fallin' Furni window keep the same contract): of the
       game windows open over the page, only the front one plays. Opened, or brought forward (a press or the
       focus inside it), Scout's Trail says so on <html data-game-front> and in a "mazerats:game-front" event;
       another game's coming forward pauses it as P does, hushes its music altogether (not the muffled tune of
       the pause menu) and leaves its keys alone. It does not play on by itself when brought forward again: the
       player plays on. */
    const GAME = "scout";
    let hushed = false;   // (hushed by another game's coming forward, till Scout's is in front again)
    const behind = () => { const f = document.documentElement.dataset.gameFront; return Boolean(f && f !== GAME); };
    function toFront() {
        if (!isOpen()) return;
        if (document.documentElement.dataset.gameFront !== GAME) {
            document.documentElement.dataset.gameFront = GAME;
            document.dispatchEvent(new CustomEvent("mazerats:game-front", { detail: { game: GAME } }));
        }
        if (!hushed) return;
        hushed = false;
        sfx("hush", false);
        // as reopening the window: the pause menu's tune muffled, the screens between passages as they were
        if (state.mode === "paused") sfx("setMuffled", true);
        sfx("resume");
    }
    function onGameFront(e) {
        const who = e && e.detail && e.detail.game;
        if (!isOpen() || !who || who === GAME) return;
        held.clear();
        pause(true);
        hushed = true;
        sfx("hush", true);
    }
    function leaveFront() {
        if (document.documentElement.dataset.gameFront !== GAME) return;
        delete document.documentElement.dataset.gameFront;
        document.dispatchEvent(new CustomEvent("mazerats:game-front", { detail: { game: null } }));
    }

    let gateChecked = null, gateDone = false;
    function open() {
        const first = !built;
        build();
        if (!isOpen()) opener = document.activeElement;
        const wasOpen = isOpen();
        root.classList.add("open");
        if (!wasOpen) {
            document.addEventListener("mazerats:game-front", onGameFront);
            // (26 Oct 2026) the Warren's Activity counts the window's openings
            if (window.Track && typeof Track.event === "function") Track.event("scout-open");
        }
        toFront();
        fit();
        // (13 Oct 2026) in the middle of the page each time it opens
        moved = false;
        place();
        frame.focus({ preventScroll: true });
        if (dim) dim.hidden = !dark;
        paintChrome();
        // (15 Oct 2026: Scout's Trail, at /scout; it was Ariadne's Thread at /ariadne, and Rat Race before that)
        if (window.PageMeta) window.PageMeta.set("scout", "Scout's Trail — Maze Rats", "https://mazerats.net/scout");
        if (!gateChecked) gateChecked = checkGate().catch(() => {}).then(() => { gateDone = true; });
        if (state.mode === "paused") { sfx("setMuffled", true); sfx("resume"); }
        else if (state.mode === "dying") sfx("resume");   // (26 Oct 2026: see close)
        else if (state.mode === "title" || state.mode === "over" || state.mode === "zoneclear" || state.mode === "ending") toTitle();
        startLoop();
    }
    function close() {
        if (!isOpen()) return;
        if (state.mode === "play" || state.mode === "card") pause();
        held.clear();
        /* (26 Oct 2026, the bug scan) stopped, the audio clock is let go as well (rest, js/rat-race-music.js):
           stop() only ends the booking, so a window closed on the title, a game over or the end left the context
           running, and the page's audio device with it, for the rest of the visit. The next start() wakes it.
           Closed while a life is being lost, the tune is only paused, as the pause menu's is: stopped there, the
           passage played on in silence after reopening, since a respawn starts nothing (open resumes it). */
        if (state.mode === "paused" || state.mode === "dying") sfx("pause"); else sfx("rest");
        if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* fine */ } }
        root.classList.remove("open");
        document.removeEventListener("mazerats:game-front", onGameFront);
        leaveFront();   // (26 Oct 2026: see ONE GAME IN FRONT)
        if (dim) dim.hidden = true;
        stopLoop();
        if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus({ preventScroll: true });
        opener = null;
        if (window.PageMeta) window.PageMeta.restore("scout");
        if (/^\/(scout|ariadne|ratrace)\/?$/.test(location.pathname)) {
            try { history.replaceState(history.state, "", "/home" + location.search + location.hash); } catch (e) { /* stays */ }
        }
    }

    /* ================================================================ INPUT
       Held keys, and presses kept a few frames so a jump pressed just before
       landing still happens (BUFFER). */
    const held = new Set();
    const pressedAt = {};
    let frameNo = 0;
    const KEYS = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
        a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down",
        " ": "jump", Enter: "start",
        // Z and X turn a blast door's wheel, one after the other (13 Oct 2026, the owner's)
        z: "turnA", Z: "turnA", x: "turnB", X: "turnB"
    };
    function ours(e) {
        if (!isOpen() && !(window.RatRace && window.RatRace.dev && window.RatRace.dev.isEmbedded())) return false;
        // the collision overlay, while testing
        if (e.type === "keydown" && e.key === "`" && window.RatRace.dev && window.RatRace.dev.isEmbedded()) { debug.boxes = !debug.boxes; e.preventDefault(); return false; }
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return false;
        if (document.querySelector(".modal-overlay.open:not(.closing), .lightbox-overlay.open")) return false;
        if (behind()) return false;   // (26 Oct 2026: another game's window in front has the keys, see ONE GAME IN FRONT)
        return true;
    }
    function press(k) {
        pressedAt[k] = frameNo;
        if (state.mode === "select") { selectKey(k); return; }
        if (state.mode === "paused" && (k === "up" || k === "down")) { pauseMove(k === "up" ? -1 : 1); return; }
        if (state.mode === "title" && (k === "left" || k === "right") && pickTop() > 0 && mayPlayNow()) { state.pickZone = Math.max(0, Math.min(pickTop(), (state.pickZone || 0) + (k === "right" ? 1 : -1))); sfx("pauseBlip"); return; }
        if (k === "jump" || k === "start") {
            if (state.mode === "title" && mayPlayNow()) newRun();
            else if (state.mode === "over") toTitle();
            else if (state.mode === "zoneclear" && state.t > 90) afterZone();
            else if (state.mode === "ending" && state.t > 120) toTitle();
            else if (state.mode === "clear" && state.t > 150) nextAct();
            else if (state.mode === "paused") pausePick();
        }
    }
    /* THE LEVEL SELECT (13 Oct 2026, for testing): typing THREAD on the title
       screen opens a list of every act, where to start in it (the beginning
       or the checkpoint) and how many lives (three, or no end of them). An
       admin's, or the dev server's, only; a run begun from it is practice,
       and keeps no best times. */
    const CHEAT = "THREAD";
    let typed = "";
    const mayCheat = () => gate.admin;
    function onKey(e) {
        // (26 Oct 2026, the bug scan: as Pura Panic's) a browser's own shortcuts are left to it: Ctrl+F found
        // nothing but fullscreen, Ctrl+P paused rather than printed, Ctrl+S, Ctrl+D and Alt+D walked Scout about
        if (!ours(e) || e.ctrlKey || e.metaKey || e.altKey) return;
        /* (26 Oct 2026) Enter and Space on one of the window's own buttons (reached with Tab: close, pause, music,
           fullscreen, the light) press that button, as anywhere else; they were taken for start and jump. Not the
           pad's, which are pressed by touch and only ever focused by it. */
        if ((e.key === "Enter" || e.key === " ") && e.target && e.target.closest && e.target.closest("button, a") && !e.target.closest("[data-k]")) return;
        if (state.mode === "title" && /^[a-z]$/i.test(e.key)) {
            typed = (typed + e.key.toUpperCase()).slice(-CHEAT.length);
            if (typed === CHEAT && mayCheat()) { typed = ""; e.preventDefault(); openSelect(); return; }
        }
        if (state.mode === "select" && (e.key === "p" || e.key === "P" || e.key === "Backspace")) { e.preventDefault(); state.mode = "title"; sfx("pauseBlip"); return; }
        // THE SECRET MIXER, for players to find: 0 shows it, 1 to 8 silence a layer of the music
        if (/^[0-8]$/.test(e.key) && music() && music().mix) {
            e.preventDefault();
            if (e.key === "0") mixerOn = !mixerOn;
            else if (mixerOn) music().mix(MIX_LAYERS[Number(e.key) - 1][0]);
            return;
        }
        const k = KEYS[e.key];
        if (e.key === "p" || e.key === "P") { e.preventDefault(); if (state.mode === "play" || state.mode === "card") pause(); else if (state.mode === "paused") resume(); return; }
        if (e.key === "m" || e.key === "M") { e.preventDefault(); toggleMusic(); return; }
        if ((e.key === "f" || e.key === "F") && canFull()) { e.preventDefault(); toggleFull(); return; }
        if (!k) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (!held.has(k) && !e.repeat) press(k);
        held.add(k);
    }
    function onKeyUp(e) { const k = KEYS[e.key]; if (k) held.delete(k); }
    function wirePad() {
        padEl.addEventListener("pointerdown", e => {
            const b = e.target.closest("[data-k]");
            if (!b) return;
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
            const k = b.dataset.k;
            if (!held.has(k)) press(k);
            held.add(k);
            b.classList.add("is-down");
        });
        const lift = e => { const b = e.target.closest("[data-k]"); if (!b) return; held.delete(b.dataset.k); b.classList.remove("is-down"); };
        padEl.addEventListener("pointerup", lift);
        padEl.addEventListener("pointercancel", lift);
        padEl.addEventListener("contextmenu", e => e.preventDefault());
    }
    const recently = (k, n) => pressedAt[k] !== undefined && frameNo - pressedAt[k] <= n;

    /* ================================================================ THE ACT
       The map's letters become tiles (solid, beam, ladder, rope, spikes,
       false wall) and things (coins, the key, the door, crates, creatures). */
    let act = null;
    const tileAt = (tx, ty) => {
        if (!act) return "#";
        if (tx < 0 || tx >= act.w || ty >= act.h) return "#";
        if (ty < 0) return "#";
        return act.tiles[ty][tx];
    };
    const solidAt = (tx, ty) => { const c = tileAt(tx, ty); return c === "#" || c === "X" || c === "8" || c === "9" || c === "V" || c === "■"; };
    /* SLOPES (23 Oct 2026, the owner's: "slope versions of the existing walls, a slight gradient that is walkable,
       and a steeper one that scout will slide down if he walks onto it"). Wall tiles cut along a line, the rock under
       it, the air over it: / and \ steep, a tile up for a tile across, slid down as scree is; { } and [ ] gentle, a
       tile up over two across, walked up and down; each gentle pair its foot and its top. yL and yR: how far down
       the tile the line is at its left and right edges. */
    const SLOPES = { "/": { yL: 16, yR: 0, steep: true }, "\\": { yL: 0, yR: 16, steep: true }, "{": { yL: 16, yR: 8 }, "}": { yL: 8, yR: 0 }, "[": { yL: 0, yR: 8 }, "]": { yL: 8, yR: 16 } };
    const slopeY = (S, lx) => S.yL + (S.yR - S.yL) * lx / TS;   // (lx: across the tile, 0 to 16)
    /* CEILING SLOPES (23 Oct 2026, the owner's: "we need slopes for the bottom of walls too / roofs/ceilings"): the same lines,
       the rock over them and the air under (a sloping roof, the underside of an overhang). u and n steep; k l and y z
       gentle, each pair left then right. A head stops at them; nothing walks them. */
    const CEILS = { "u": { yL: 0, yR: 16, steep: true }, "n": { yL: 16, yR: 0, steep: true }, "k": { yL: 0, yR: 8 }, "l": { yL: 8, yR: 16 }, "y": { yL: 16, yR: 8 }, "z": { yL: 8, yR: 0 } };
    // Water: standing water, or below the flood's line.
    // (21 Oct 2026) a tile's water can stand part of the way down it (act.waterTop, as it drains or rises: FLOWING WATER)
    const wetAt = (x, y) => { if (!act) return false; if (act.flood && y > act.flood.y) return true; if (!act.water.size) return false; const k = Math.floor(x / TS) + "," + Math.floor(y / TS); if (!act.water.has(k)) return false; const t = act.waterTop.size ? act.waterTop.get(k) : undefined; return t === undefined || y >= t; };

    /* THEMES (13 Oct 2026, the other zones). What each zone draws in its own
       way: its walls, its back wall, the frame in front of that, platforms,
       props, its lights and the air. The Wood's are the functions below;
       the rest come from js/rat-race-zones.js (RatZones.themes), each given
       the helpers it needs. Anything a theme leaves out is the Wood's. */
    const WOOD = {
        key: "wood",
        timber: { d: "0", s: "U", m: "a", l: "Z", q: "Q" },        // palette letters: outline, shade, body, light, mid
        edge: { out: "#1a0f08", lit: "#96633a", dark: "#24140a" },
        moss: true, glow: [255, 170, 70], embers: true, air: [255, 220, 170], soot: true,
        stones: null, lampAt: { bx: 1, by: 2, fx: 1, fy: -9, gx: 8, gy: -2 }, pushV: null, fore: null,
        // (16 Oct 2026) its moving platforms on a rig: the Mine's, or any zone's own materials (TH.rig) where it draws none of its own
        mover: Object.assign((g2, m, a) => rigMover(g2, m, a, TH.rig || RIG_MINE), { back: (g2, m, a) => rigBack(g2, m, a, TH.rig || RIG_MINE) })
    };
    let TH = WOOD;
    function themeOf(zone) {
        const T = window.RatZones && window.RatZones.themes && window.RatZones.themes[zone.theme];
        return T ? Object.assign({}, WOOD, T) : WOOD;
    }
    // the helpers a theme's drawing is given
    /* A sprite a shade darker, for the props behind everything (13 Oct 2026,
       the owner's: "strange shadows were appearing behind decorative images":
       a dark box was painted over each prop's tile; now only its own pixels
       are darkened). Made once per sprite. */
    const dimmed = new Map();
    function dimSprite(img) {
        let d = dimmed.get(img);
        if (!d) {
            d = document.createElement("canvas"); d.width = img.width; d.height = img.height;
            const x = d.getContext("2d"); x.drawImage(img, 0, 0);
            x.globalCompositeOperation = "source-atop"; x.fillStyle = "rgba(14,8,4,0.3)"; x.fillRect(0, 0, d.width, d.height);
            dimmed.set(img, d);
        }
        return d;
    }
    const helpers = () => ({ frameNo, VW, VH, gear: (R, teeth, cols, ang) => gearImage(R, teeth, cols, ang), dim: dimSprite, wood: name => sprites[name].r[0], TS, ROOM_W, ROOM_H, hashTile, tileAtIn, wallish, isHidden, solidOrFake, P: ART.pal, spr, platform: woodPlatform, PLAT_H });

    /* ================================================================ THE LEVELS AS DATA
       (14 Oct 2026, for the level editor, ariadne-editor.html, the owner's:
       "the main purpose being amend current levels".) A passage is
       { w, h, tiles, back, water, settings, objects }:
         tiles     rows of letters, for what Scout stands on, climbs and is
                   stopped by (TERRAIN below); nothing else lives in them now.
         back      rows the same size, "#" where a wall stands behind it all,
                   only to be looked at (the editor's background walls).
         water     rows the same size, "~" where water stands ("m": murky, 17 Oct 2026).
         dark      rows the same size (17 Oct 2026): "d" painted dark, "t" the turn from dark to light (see PAINTED DARK).
         settings  the passage's own: tones, darkness, its sea's lines.
         objects   everything else, each { type, x, y, ... } in pixels: what
                   Scout picks up, the creatures, lamps and lights, the props,
                   the timber and its supports, drawn in the order listed.
       Every object's x and y are where the game holds it (TYPES says how far
       that is from the corner of the tile it was first put on, the editor's
       grid). What used to be placed by the code (the props, the supports,
       the frame, the shaft beams) was worked out once and kept as objects,
       so every one of them can be moved, toned or taken away; the same rules
       are still here (AUTO, further down) for the editor to dress a new
       platform or room with. The master copies are assets/ariadne-levels/;
       js/rat-race-levels.js is them all in one file, written on each save. */
    const TERRAIN = new Set(["#", "%", "=", "H", "|", "^", "X", "Q", "V", "i", "2", "c", "_", ",", "h", "j", "e", ".", "W", "B", "/", "\\", "{", "}", "[", "]", "u", "n", "k", "l", "y", "z"]);   // (and the slopes, floors' and ceilings', 23 Oct 2026)
    /* Each kind of object: how far its x, y lie from its tile's corner (ax,
       ay) and its size, as the game has always held it. */
    const TYPES = {
        start: { ax: 3, ay: TS - STAND_H, w: BODY_W, h: STAND_H },
        coin: { ax: 1, ay: 2, w: 13, h: 13 }, knife: { ax: 4, ay: 0, w: 8, h: 16 }, gem: { ax: 2, ay: 3, w: 11, h: 10 }, life: { ax: 0, ay: 6, w: 16, h: 7 },
        key: { ax: 2, ay: -5, w: 12, h: 20 }, dynamite: { ax: 3, ay: 0, w: 10, h: 16 },
        exit: { ax: 0, ay: TS - 48, w: 32, h: 48 }, doorway: { ax: 0, ay: TS - 48, w: 32, h: 48 },
        flag: { ax: 2, ay: TS - 24, w: 14, h: 24 }, crate: { ax: 0, ay: 0, w: 16, h: 16 }, sign: { ax: 0, ay: 0, w: 16, h: 16 },
        rat: { ax: 0, ay: TS - 11, w: 20, h: 11 }, bat: { ax: 0, ay: 15, w: 18, h: 10 }, spider: { ax: 1, ay: 0, w: 14, h: 11 },
        beetle: { ax: -2, ay: TS - 12, w: 20, h: 12 }, hammer: { ax: -8, ay: 0, w: 32, h: 22 }, lizard: { ax: 0, ay: 0, w: 8, h: 16 },
        hare: { ax: 0, ay: TS - 12, w: 16, h: 12 }, crawler: { ax: -1, ay: TS - 11, w: 18, h: 11 }, grub: { ax: -2, ay: TS - 10, w: 20, h: 10 },
        wisp: { ax: 2, ay: 2, w: 12, h: 12 }, bot: { ax: -1, ay: TS - 12, w: 18, h: 12 }, jelly: { ax: 1, ay: 0, w: 14, h: 16 },
        steam: { ax: 0, ay: 4, w: 16, h: 8 },
        mover: { ax: 0, ay: 0, w: 48, h: 11 }, float: { ax: 0, ay: 0, w: 48, h: 13 },
        icicle: { ax: 4, ay: 0, w: 8, h: 16 }, falls: { ax: 0, ay: 0, w: 16, h: 3 }, brazier: { ax: 0, ay: 0, w: 16, h: 16 },
        alarm: { ax: 0, ay: 0, w: 16, h: 16 }, tank: { ax: 2, ay: TS - 24, w: 12, h: 24 }, vent: { ax: 0, ay: TS, w: 16, h: 5 },
        pump: { ax: 0, ay: 0, w: 16, h: 16 }, blast: { ax: 0, ay: 0, w: 16, h: 48 }, hatch: { ax: 0, ay: 0, w: 48, h: 16 },
        torch: { ax: 0, ay: 0, w: 16, h: 16 }, light: { ax: 0, ay: 0, w: 1, h: 1 }, current: { ax: 0, ay: 0, w: 16, h: 16 }, darkzone: { ax: 0, ay: 0, w: 16, h: 16 }, supportarea: { ax: 0, ay: 0, w: 16, h: 16 },
        // (14 Oct 2026) the new zones': a block that comes and goes (kind beatA, beatB, rain, sun), a piston,
        // lava (a box of it), a spout of slag rafts, a conveyor belt (a box along a floor, dx its way), an hourglass, a pour
        switch: { ax: 0, ay: 0, w: 16, h: 16 }, piston: { ax: 0, ay: 3, w: 40, h: 10 }, lava: { ax: 0, ay: 0, w: 16, h: 16 },
        spout: { ax: 0, ay: 0, w: 16, h: 16 }, conveyor: { ax: 0, ay: 0, w: 16, h: 16 }, hourglass: { ax: 0, ay: 0, w: 16, h: 16 }, pour: { ax: 0, ay: 0, w: 16, h: 16 },
        // (14 Oct 2026) the factory's: a gear wheel with ledges round it to ride (x, y its middle), a fire jet, a splash of molten
        // metal thrown up out of lava now and then; and water dripping from a roof
        gear: { ax: 0, ay: 0, w: 16, h: 16 }, burner: { ax: 0, ay: 0, w: 16, h: 16 }, splash: { ax: 0, ay: 0, w: 16, h: 16 }, drip: { ax: 0, ay: 0, w: 16, h: 16 }, ooze: { ax: 0, ay: 0, w: 16, h: 16 }, bumper: { ax: 0, ay: 0, w: 16, h: 16 }, spring: { ax: 0, ay: 0, w: 16, h: 16 }, machine: { ax: 0, ay: 0, w: 24, h: 44 }, vine: { ax: 0, ay: 0, w: 14, h: 48 }, neon: { ax: 0, ay: 0, w: 48, h: 48 }, wreck: { ax: 0, ay: 0, w: 112, h: 50 }, waterfall: { ax: 0, ay: 0, w: 12, h: 96 }
    };
    // (22 Oct 2026) THE NEW MECHANICS' objects and creatures
    Object.assign(TYPES, { swing: { ax: 0, ay: 0, w: 16, h: 16 }, zipline: { ax: 0, ay: 0, w: 16, h: 16 }, scree: { ax: 0, ay: 0, w: 16, h: 16 }, quicksand: { ax: 0, ay: 0, w: 16, h: 16 },
        minecart: { ax: -4, ay: TS - 13, w: 24, h: 13 }, rails: { ax: 0, ay: 0, w: 16, h: 16 }, pool: { ax: 0, ay: 0, w: 16, h: 16 }, sluice: { ax: 0, ay: 0, w: 16, h: 16 },
        torchbracket: { ax: 0, ay: 0, w: 16, h: 16 }, firegate: { ax: 0, ay: 0, w: 16, h: 48 },
        mummy: { ax: 1, ay: TS - 24, w: 14, h: 24 }, snake: { ax: 0, ay: 0, w: 16, h: 16 } });
    const FOES = new Set(["rat", "bat", "spider", "beetle", "hammer", "lizard", "hare", "crawler", "grub", "wisp", "bot", "jelly", "steam", "piston", "mummy", "snake"]);   // (the ghost miner scrapped, 23 Oct 2026, the owner's: "scrap the miner ghost")
    // which creatures a stomp finishes, unless a level says otherwise (the editor's "stompable")
    const STOMP = { rat: true, bat: true, grub: true, beetle: true, lizard: true, hare: true, mummy: true, snake: true };
    const STOMP_SCORE = { beetle: 200 };
    const PICKUPS = new Set(["coin", "gem", "life", "key", "dynamite", "knife"]);
    // the timber and iron that only stand behind, drawn once into the still picture
    const BACK_KINDS = new Set(["sign", "post", "brace", "cleat", "chain", "hangrope", "ycap", "shaftbeam", "torch"]);
    const FRAME_KINDS = new Set(["upright", "crossbeam", "root"]);
    const tileOf = (o, d) => { const t = TYPES[o.type] || { ax: 0, ay: 0 }; return d === "y" ? Math.floor((o.y - t.ay) / TS) : Math.floor((o.x - t.ax) / TS); };

    function loadAct(zi, ai) {
        const zone = LEVELS.zones[zi];
        return buildAct(zone.acts[ai], zone, zi, ai);
    }
    function buildAct(spec, zone, zi, ai, opts) {
        TH = themeOf(zone); ZK = TH.key;
        gearCache.clear();   // (26 Oct 2026: see A GEAR'S PICTURE)
        const S = spec.settings || {};
        const h = spec.tiles.length, w = Math.max(...spec.tiles.map(r => r.length));
        const tiles = spec.tiles.map(r => r.padEnd(w, "#").split("").map(c => (TERRAIN.has(c) ? c : ".")));
        const a = {
            zi, ai, zone, spec, settings: S, w, h, tiles, things: [], crates: [], foes: [], deco: [],
            start: { x: 32, y: 32 }, flag: null, signs: [], hint: null, hintA: 0, door: null, keyTaken: false, unlocked: false, coins: 0, coinsTotal: 0,
            gems: 0, secrets: new Set(), static: null, loose: [], falls: [], rocks: [], props: [],
            piles: [], pileAt: new Map(), dynamite: 0, bomb: null, seams: new Set(), trapSeams: new Set(), climbSeams: new Set(), secretPile: new Set(), fore: [],
            movers: [], crumbles: new Map(), slick: new Set(), icicles: [], braziers: [], glows: [],
            water: new Set(), murk: new Set(), waterTop: new Map(), flows: [], alarms: [], doors: [], flood: null, air: 1, roots: [], torch: false, tanks: [],
            currents: [], vents: [], bigBubbles: [], darkZones: [],
            switchers: [], lava: new Set(), spouts: [], conveyors: new Map(), glasses: [], pours: [], clock: 0,
            gears: [], burners: [], splashes: [], blobs: [], drips: [], oozes: [], puddles: [], bumpers: [], springs: [], deco2: [],
            // (14 Oct 2026, the editor's) props that stop Scout or bear him, lights, doorways, keys to them, what stands in front
            solids: [], tops: [], lights: [], doorways: [], keys: new Set(), front: [], backObjs: [], frameParts: [], back: null, supportAreas: [], autoSupport: []
        };
        a.nx = newBag();
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const ch = tiles[y][x];
            /* a slope's line, as scree's is (its surface stood on and kept to, up or down it); gentle ones walked
               (walk), steep ones slid down. dir: the way down. */
            if (CEILS[ch]) { a.slopes = true; continue; }
            if (SLOPES[ch]) { const S = SLOPES[ch]; a.slopes = true; a.nx.screes.push({ x: x * TS, y: y * TS + Math.min(S.yL, S.yR), w: TS, h: Math.abs(S.yR - S.yL), dir: S.yR > S.yL ? 1 : -1, walk: !S.steep, tile: true }); continue; }
            if (ch === "X" || ch === "Q") { tiles[y][x] = "X"; if (ch === "Q") a.secretPile.add(x + "," + y); }
            /* THE WAYS OUT OF A SECRET (13 Oct 2026): openings that join a hidden
               place to the rest without giving it away. _ a trapdoor (hidden from
               below, as roof); , the open end of a crawl; h a ladder and j a rope
               up through a floor, left in plain sight. */
            else if (ch === "_") { a.seams.add(x + "," + y); a.trapSeams.add(x + "," + y); tiles[y][x] = "."; }
            else if (ch === ",") { a.seams.add(x + "," + y); tiles[y][x] = "."; }
            else if (ch === "h") { a.seams.add(x + "," + y); a.climbSeams.add(x + "," + y); tiles[y][x] = "H"; }
            else if (ch === "j") { a.seams.add(x + "," + y); a.climbSeams.add(x + "," + y); tiles[y][x] = "|"; }
            /* W a weathered ladder, B a ladder broken at its foot (21 Oct 2026): ladders (H) to climb, only drawn
               otherwise (a.ladderLook, drawTerrain) */
            else if (ch === "W" || ch === "B") { (a.ladderLook || (a.ladderLook = new Map())).set(x + "," + y, ch); tiles[y][x] = "H"; }
            // c: a ledge that crumbles a moment after it is stood on, and comes back
            else if (ch === "c") a.crumbles.set(x + "," + y, { tx: x, ty: y, t: 0, state: "ok" });
            // 2: a block of stone in the way, solid, to jump on or climb
            else if (ch === "2") { tiles[y][x] = "#"; (a.blocks || (a.blocks = new Set())).add(x + "," + y); }
            // i: rock with ice on top, slippery underfoot
            else if (ch === "i") { tiles[y][x] = "#"; a.slick.add(x + "," + y); }
            // V: roots grown across the way, solid until Scout's torch burns them (and the torch with them)
            else if (ch === "V") a.roots.push({ x, y, burn: 0 });
        }
        if (spec.dark && spec.dark.some(r => /[dt]/.test(r))) {
            a.darkRows = spec.dark;
            let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
            spec.dark.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "d" || row[x] === "t") { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
            a.darkBox = { x: x0 * TS, y: y0 * TS, w: (x1 - x0 + 1) * TS, h: (y1 - y0 + 1) * TS };
        }
        if (spec.water) spec.water.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "~" || row[x] === "m") { a.water.add(x + "," + y); if (row[x] === "m") a.murk.add(x + "," + y); } });
        if (spec.back && spec.back.some(r => r.includes("#"))) a.back = spec.back.map(r => r.padEnd(w, ".").split(""));
        // (23 Oct 2026) the rails, a tile at a time (RAILS, A TILE AT A TIME)
        a.railRows = spec.rails && spec.rails.some(r => /[-bxv]/.test(r)) ? Array.from({ length: h }, (_, y) => (spec.rails[y] || "").padEnd(w, ".").split("")) : null;
        /* THE SEA (13-14 Oct 2026, after Sonic's Labyrinth Zone), from the
           settings: its line at low tide, at high tide, where a pump drains
           it to, and as high as a surge (or the alarm's flood) comes. */
        const sea = S.sea || {};
        if (sea.low !== undefined && sea.low !== null) a.seaY = sea.low;
        if (sea.high !== undefined && sea.high !== null) a.seaHigh = sea.high;
        if (sea.drain !== undefined && sea.drain !== null) a.seaDrain = sea.drain;
        if (sea.cap !== undefined && sea.cap !== null) a.floodCap = sea.cap;

        for (const o of spec.objects || []) {
            const t = o.type, x = o.x, y = o.y, tx = tileOf(o, "x"), ty = tileOf(o, "y");
            if (buildNew(a, o, tx, ty)) continue;
            if (PICKUPS.has(t)) {
                const T = TYPES[t];
                a.things.push({ kind: t === "gem" ? "gem" : t, x, y, w: T.w, h: T.h, rid: o.rid, opens: o.opens || "", obj: o });
                if (t === "coin") a.coinsTotal++;
            }
            else if (t === "start") a.start = { x, y };
            else if (t === "exit") a.door = { x, y, w: 32, h: 48 };
            else if (t === "flag") a.flag = { x, y, w: 14, h: 24, taken: false };
            // (16 Oct 2026) a crate may hang from a rope (hang), till Scout cuts it with the knife
            else if (t === "crate") a.crates.push({ x, y, w: 16, h: 16, vy: 0, hx: x, hy: y, hang: Boolean(o.hang), hang0: Boolean(o.hang), cutY: null, tail: 0 });
            else if (t === "sign") { a.signs.push({ x, y, text: o.text || "" }); a.backObjs.push(o); }
            else if (FOES.has(t)) a.foes.push(makeFoe(o, tx, ty));
            else if (t === "mover") a.movers.push(makeMover(o, tx, ty));
            else if (t === "float") a.movers.push({ kind: "f", tx, ty, x, y, w: 48, dir: 1, pause: 0, dx: 0, dy: 0, obj: o });
            else if (t === "icicle") a.icicles.push({ x, y, hy: y, t: 0, state: "hang", vy: 0 });
            else if (t === "falls") a.falls.push({ x, y, period: o.period > 0 ? o.period : 170 + (tx * 37) % 60, t: (tx * 53 + ty * 17) % 170 });
            else if (t === "brazier") a.braziers.push({ x, y, lit: Boolean(o.lit), t: (tx * 5) % 4, group: String(o.group || "") });
            else if (t === "alarm") a.alarms.push({ x, y });
            else if (t === "tank") a.tanks.push({ x, y, w: 12, h: 24 });
            else if (t === "vent") a.vents.push({ x, y, every: o.every > 0 ? o.every : 200, t: (tx * 29) % (o.every > 0 ? o.every : 200) });
            else if (t === "pump") a.doors.push({ kind: "pump", tx, ty, w: 1, h: 1, prog: 0, idle: 0, open: false, anim: 0, turns: o.turns > 0 ? o.turns : 12 });
            else if (t === "blast") a.doors.push({ kind: "door", tx, ty, w: 1, h: 3, prog: 0, idle: 0, open: false, anim: 0, turns: o.turns > 0 ? o.turns : 12 });
            else if (t === "hatch") a.doors.push({ kind: "hatch", tx, ty, w: 3, h: 1, prog: 0, idle: 0, open: false, anim: 0, turns: o.turns > 0 ? o.turns : 12 });
            // (17 Oct 2026) a part of the passage as dark as the Depths (see A DARK AREA)
            else if (t === "supportarea") a.supportAreas.push({ x, y, w: Math.max(16, o.w || 160), h: Math.max(16, o.h || 112) });
            else if (t === "darkzone") a.darkZones.push({ x, y, w: Math.max(16, o.w || 160), h: Math.max(16, o.h || 112), fade: o.fade >= 0 ? o.fade : 32, depth: o.depth >= 0 ? o.depth : 3, rgb: hexRgb(o.color || "#030207"), a: o.alpha >= 0 && o.alpha <= 1 ? o.alpha : 0.965, fill: `rgba(${hexRgb(o.color || "#030207").join(",")},${o.alpha >= 0 && o.alpha <= 1 ? o.alpha : 0.965})`, clear: `rgba(${hexRgb(o.color || "#030207").join(",")},0)` });
            else if (t === "current") a.currents.push({ x, y, w: o.w || TS, h: o.h || TS, dx: o.dx === undefined ? 1 : o.dx, dy: o.dy || 0, k: o.strength > 0 ? o.strength : 1 });
            else if (t === "doorway") a.doorways.push({ x, y, w: 32, h: 48, id: String(o.id || ""), to: String(o.to || ""), lock: String(o.lock || ""), obj: o });
            else if (t === "torch") { a.deco.push(torchOf(o, tx, ty)); a.backObjs.push(o); }
            else if (t === "light") a.lights.push(lightOf(o));
            /* THE NEW ZONES (14 Oct 2026, the owner's pick of the overnight ideas).
               THE CLOCKWORK VAULT: blocks shut and open on the beat by turns (switch
               beatA, beatB), a piston in the wall beside it out on the off-beat.
               THE SANDFALL TOMB: its sea is sand, an hourglass turns it between its
               lines; a pour from the roof. THE LAVA FOUNDRY: lava (a touch is the
               end), a spout of slag rafts that drift off along it, cool and sink,
               conveyor belts. THE OVERGROWN RUINS: a root that grows across while
               it rains (switch rain), a bramble that is up while the sun is out (sun). */
            else if (t === "switch") a.switchers.push({ tx, ty, kind: ["beatA", "beatB", "rain", "sun"].includes(o.kind) ? o.kind : "beatA", on: false, grow: 0 });
            else if (t === "lava") { for (let j = 0; j < Math.max(1, Math.round((o.h || TS) / TS)); j++) for (let i = 0; i < Math.max(1, Math.round((o.w || TS) / TS)); i++) a.lava.add((tx + i) + "," + (ty + j)); }
            else if (t === "spout") a.spouts.push({ x, y, t: (tx * 41) % 170 });
            else if (t === "conveyor") { for (let i = 0; i < Math.max(1, Math.round((o.w || TS) / TS)); i++) { a.conveyors.set((tx + i) + "," + ty, o.dx < 0 ? -1 : 1); if (tiles[ty] && tiles[ty][tx + i] !== undefined) tiles[ty][tx + i] = "#"; } }
            else if (t === "hourglass") a.glasses.push({ x, y, flip: 0, cd: 0 });
            else if (t === "pour") a.pours.push({ tx, ty });
            /* A GEAR WHEEL (14 Oct 2026, the owner's: "moving gears that can be jumped onto ... similar to
               in Mario. Need a toggle to have them static too"): a cog turning about (x, y), its arms
               holding ledges out round it that stay level as it turns, to stand on and be carried. */
            else if (t === "gear") {
                // (14 Oct 2026, the owner's: "we lose the pads, and it's a cog with smaller teeth that scout can jump onto"): a cog, solid round its rim (see stepCogs)
                const G = { cx: x, cy: y, R: o.r > 0 ? o.r : 40, speed: (o.speed > 0 ? o.speed : 0.6) * 0.012 * (o.dir === -1 ? -1 : 1), still: Boolean(o.static), ang: (o.phase || 0) * Math.PI / 180 };
                a.gears.push(G);
            }
            // a fire jet: a nozzle (in the floor, roof or a wall: dir up, down, left, right) that bursts into flame and dies away by turns
            else if (t === "burner") a.burners.push({ x, y, tx, ty, dir: ["up", "down", "left", "right"].includes(o.dir) ? o.dir : "up", every: o.every > 0 ? o.every : 170, on: o.on > 0 ? o.on : 60, len: o.len > 0 ? o.len : 44, t: o.phase >= 0 ? o.phase : (tx * 37) % (o.every > 0 ? o.every : 170) });
            // molten metal thrown up out of the lava now and then, in blobs that fall back
            else if (t === "splash") a.splashes.push({ x, y, every: o.every > 0 ? o.every : 180, high: o.high > 0 ? o.high : 1, t: o.phase >= 0 ? o.phase : (tx * 53) % (o.every > 0 ? o.every : 180) });
            // (14 Oct 2026) a pipe down from the roof (x, y the tile under the roof; len how far it hangs, px), dripping molten metal: slow, a drop at a time
            else if (t === "ooze") { const ev = o.every > 0 ? o.every : 170; a.oozes.push({ x, y, len: o.len > 0 ? o.len : 12, every: ev, t: o.phase >= 0 ? o.phase % ev : (tx * 41 + ty * 13) % ev, drop: null }); }
            // (14 Oct 2026) the arcade's: a pinball bumper (x, y its tile; r how big, power how hard, color 0-4), a spring pad on a floor
            else if (t === "bumper") a.bumpers.push({ x: x + 8, y: y + 8, r: o.r > 0 ? o.r : 9, power: o.power > 0 ? o.power : 5.4, ci: o.color >= 0 ? o.color : (tx * 3 + ty) % 5, k: 0, cd: 0, rings: [] });
            else if (t === "spring") a.springs.push({ x, y, power: o.power > 0 ? o.power : 7.4, sq: 0 });
            // (14 Oct 2026) the arcade's furnishings: machines, hanging vines, neon signs (see THE ARCADE'S FURNISHINGS)
            else if (t === "machine" || t === "vine" || t === "neon" || t === "wreck" || t === "waterfall") a.deco2.push(Object.assign({}, o, { x: o.x, y: o.y }));
            // water dripping from a roof, now and then: only to look at
            else if (t === "drip") a.drips.push({ x, y, every: o.every > 0 ? o.every : 110, t: (tx * 29 + ty * 7) % (o.every > 0 ? o.every : 110), drop: null });
            else if (t === "prop") {
                const L = o.layer === "front" ? a.front : a.backObjs;
                L.push(o);
                const hb = propBox(o);
                if (hb && o.solid === "solid") a.solids.push(hb);
                else if (hb && o.solid === "top") a.tops.push(hb);
            }
            else if (FRAME_KINDS.has(t)) a.frameParts.push(o);
            else if (BACK_KINDS.has(t)) a.backObjs.push(o);
        }
        const freeAt = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && tiles[ty][tx] !== "#" && tiles[ty][tx] !== "e" && tiles[ty][tx] !== "%";
        for (const m of a.movers) {
            if (m.kind !== "f" || (m.obj && m.obj.y0 !== undefined)) continue;
            // a float: down its shaft as far as the floor, up as far as leaves him room under the roof
            const cols = [m.tx, m.tx + 1, m.tx + 2], free = ty => cols.every(c => freeAt(c, ty));
            let t = m.ty, b = m.ty;
            while (free(t - 1)) t--;
            while (free(b + 1)) b++;
            m.y0 = (t + 2) * TS; m.y1 = b * TS + 4; m.y = m.y1;
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (tiles[y][x] === "e") tiles[y][x] = ".";
        for (const c of a.crates) if (c.hang0) { c.ropeTop = ropeTopOf(a, c.x, c.y); c.ropeX = Math.round(c.x) + 7; }
        for (const d of a.doors) if (d.kind !== "pump") for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) if (tiles[d.ty + j] && tiles[d.ty + j][d.tx + i] !== undefined) tiles[d.ty + j][d.tx + i] = d.kind === "door" ? "8" : "9";
        /* THE TIDE: calm a while, a horn, then the sea comes up (to its high
           line, or two and a half tiles), slowly, holds, and goes back down. An
           alarm in a passage with a sea sets it SURGING: no tide then, the sea
           only rising, to its cap, as in the Labyrinth's last climb. */
        if (a.seaY !== undefined) a.flood = { y: a.seaY, base: a.seaY, base0: a.seaY, sea: true, active: true, amp: a.seaHigh !== undefined ? Math.max(16, a.seaY - a.seaHigh) : 40, t: 0, rate: 0.38, cap: a.floodCap === undefined ? 0 : a.floodCap, wait: 0, drain: a.seaDrain };
        else if (a.alarms.length) a.flood = { y: h * TS + 8, active: false, rate: 0.22, cap: a.floodCap === undefined ? 0 : a.floodCap, wait: 0 };
        for (const f of a.foes) if (f.kind === "piston") f.side = tiles[f.ty] && tiles[f.ty][f.tx - 1] === "#" ? 1 : -1;
        for (const f of a.foes) if (f.kind === "steam") {
            // its valve is in the wall beside it: it blows out the other way
            f.side = tiles[f.ty][f.tx - 1] === "#" ? 1 : -1;
            f.x = f.side > 0 ? f.tx * TS : f.tx * TS + TS - 32;
        }
        // each hammer: the roof it hangs from, and the floor it falls to
        for (const f of a.foes) if (f.kind === "hammer") {
            let cy = f.ty; while (cy > 0 && tiles[cy - 1][f.tx] !== "#") cy--;
            let fy = f.ty; while (fy < h - 1 && tiles[fy + 1] && tiles[fy + 1][f.tx] !== "#" && tiles[fy + 1][f.tx] !== "=") fy++;
            f.pivot = cy * TS; f.rest = cy * TS + 2; f.y = f.rest; f.floor = (fy + 1) * TS;
        }
        for (const f of a.foes) if (f.kind === "lizard") {
            const tx = Math.floor(f.x / TS), ty = Math.floor(f.y / TS);
            f.side = tiles[ty][tx - 1] === "#" ? -1 : 1;
            f.x = f.side < 0 ? tx * TS : tx * TS + 8;
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (tiles[y][x] !== "X" || a.pileAt.has(x + "," + y)) continue;
            const pile = { cells: [], alive: true, told: false }, st = [[x, y]];
            a.pileAt.set(x + "," + y, pile);
            while (st.length) {
                const [cx, cy] = st.pop(); pile.cells.push([cx, cy]);
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, k = nx + "," + ny; if (tiles[ny] && tiles[ny][nx] === "X" && !a.pileAt.has(k)) { a.pileAt.set(k, pile); st.push([nx, ny]); } }
            }
            a.piles.push(pile);
        }
        // in the Depths Scout comes in with a torch (or wherever the passage says so)
        a.torch = S.torch === undefined || S.torch === null ? Boolean(TH.dark && TH.torch) : Boolean(S.torch);
        /* OUT UNDER THE SKY (14 Oct 2026, the owner's: "a quarry isn't like a
           mine, it has large outdoor parts"). Where a theme has a sky, every
           open cell with nothing solid above it, all the way up, is out of
           doors: the sky shows there, behind it, instead of the back wall. */
        if (TH.sky && TH.allBack) { a.skyMask = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (tiles[y][x] !== "#") a.skyMask[y * w + x] = 1; }
        else if (TH.sky) skyMaskOf(a);
        findHidden(a);
        // a lantern or light inside a hidden room belongs to its cover: no glow through the wall
        const coverAt = (px, py) => a.covers.find(c => c.set.has(Math.floor(px / TS) + "," + Math.floor(py / TS))) || null;
        for (const d of a.deco) d.cover = coverAt(d.x, d.y);
        for (const L of a.lights) L.cover = coverAt(L.x, L.y);
        for (const b of a.braziers || []) b.cover = coverAt(b.x + 8, b.y + 8);
        // (21 Oct 2026) the timber the support areas call for, worked out afresh each time (SUPPORT AREAS)
        if (a.supportAreas.length) { a.autoSupport = supportAreaPieces(a); a.backObjs.push(...a.autoSupport); }
        // a platform hung from chains or ropes wears iron (see A PLATFORM)
        for (const run of beamRuns(a)) {
            const x0 = run.tx * TS, x1 = (run.end + 1) * TS, top = run.ty * TS;
            const by = k => a.backObjs.some(o => o.type === k && o.x >= x0 - 2 && o.x < x1 + 2 && Math.abs(o.y + o.h - (top + 2)) <= 3);
            run.held = by("chain") ? "chains" : by("hangrope") ? "ropes" : null;
        }
        // (the editor builds an act to look at, and draws it itself, room by room: bare)
        groupCranes(a);   // (23 Oct 2026: lifts side by side under one headframe, and linked pairs)
        if (!(opts && opts.bare)) { a.static = renderStatic(a); warmAct(a); }
        return a;
    }
    /* A HANGING CRATE (16 Oct 2026, the owner's: "give me the option to have
       them hanging from a rope; and add a knife inventory item that scout can
       use to cut the rope"). Its rope runs straight up from the middle of its
       lid to whatever is above: rock, a false wall, a platform's underside,
       or the top of the map. It hangs from an eye bolt in an iron plate, down
       to a ring a little above the crate, and from the ring two short lines
       to its top corners. */
    function ropeTopOf(a, x, y) {
        const tx = Math.floor((x + 8) / TS);
        for (let ty = Math.floor((y - 9) / TS); ty >= 0; ty--) {
            const c = tileAtIn(a, tx, ty);
            if (c === "=") return ty * TS + PLAT_H;
            if (c === "#" || c === "%" || c === "X" || c === "V" || c === "8" || c === "9") return (ty + 1) * TS;
        }
        return 0;
    }
    // The crate Scout pushes: the zone's own if it has one made to be pushed, else its crate, else the Mine's.
    const crateImg = () => ((ZK !== "wood" && (sprites["pushCrate@" + ZK] || sprites["crate@" + ZK])) || sprites.pushCrate || sprites.crate).r[0];
    // Hemp, two strands twisted, down from y0 to y1 at x (as the platforms' hanging ropes)
    function hemp(x, cx, y0, y1) { for (let yy = Math.round(y0); yy < y1; yy++) { const tw = (yy >> 1) % 2; x.fillStyle = tw ? "#c9a160" : "#946d34"; x.fillRect(cx, yy, 1, 1); x.fillStyle = tw ? "#946d34" : "#ecd29a"; x.fillRect(cx + 1, yy, 1, 1); } }
    function hempLine(x, x0, y0, x1, y1) { const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let i = 0; i <= n; i++) { const px = Math.round(x0 + (x1 - x0) * i / n), py = Math.round(y0 + (y1 - y0) * i / n); x.fillStyle = i % 3 ? "#946d34" : "#c9a160"; x.fillRect(px, py, 1, 1); } }
    function fray(x, cx, y, down) { x.fillStyle = "#ecd29a"; x.fillRect(cx - 1, y + (down ? 0 : -1), 1, 2); x.fillRect(cx + 2, y + (down ? 1 : -2), 1, 2); x.fillStyle = "#c9a160"; x.fillRect(cx, y, 2, 1); x.fillRect(cx + 1, y + (down ? 1 : -1), 1, 1); }
    function paintCrate(x, c) {
        const X = Math.round(c.x), Y = Math.round(c.y), rx = X + 7, P = ART.pal;
        if (c.hang0) {
            // the plate and what is left of the rope stay where it hung, wherever the crate is pushed after (ax)
            const top = c.ropeTop, ax = c.ropeX !== undefined ? c.ropeX : rx;
            // the plate and its eye bolt
            x.fillStyle = P.i; x.fillRect(ax - 4, top, 10, 3); x.fillStyle = P.m; x.fillRect(ax - 3, top, 8, 1); x.fillStyle = P.n; x.fillRect(ax - 3, top + 1, 1, 1); x.fillRect(ax + 4, top + 1, 1, 1);
            x.fillStyle = P.i; x.fillRect(ax - 1, top + 3, 4, 3); x.fillStyle = P.j; x.fillRect(ax, top + 4, 2, 1);
            if (c.hang) hemp(x, ax, top + 6, Y - 9);
            else if (c.cutY !== null) { hemp(x, ax, top + 6, c.cutY); fray(x, ax, c.cutY, true); }
            // the ring and the two lines to the lid's corners (taut while it hangs or falls; once down, slack on the lid)
            const ry = Y - 10, slack = !c.hang && !(c.vy > 0.5);
            if (!slack) {
                hempLine(x, rx, ry + 2, X + 2, Y); hempLine(x, rx + 1, ry + 2, X + 13, Y);
                x.fillStyle = P.i; x.fillRect(rx - 1, ry, 4, 4); x.fillStyle = P.m; x.fillRect(rx, ry, 2, 1); x.fillStyle = P.j; x.fillRect(rx - 1, ry + 1, 1, 2); x.fillRect(rx + 2, ry + 1, 1, 2); x.fillStyle = "#000"; x.fillRect(rx, ry + 1, 2, 2);
            }
            // cut, the rest of the rope goes with it: up from the ring while it falls, laid over the lid once down
            if (!c.hang && c.tail > 0) {
                if (c.vy > 0.5) { hemp(x, rx, Math.max(ry - c.tail, ry - 40), ry); fray(x, rx, Math.max(ry - c.tail, ry - 40), false); }
            }
        }
        x.drawImage(crateImg(), X, Y);
        if (c.hang0 && !c.hang && !(c.vy > 0.5)) {
            // down: the lines lie loose over the lid's corners, the ring between them
            for (const [x0, x1] of [[X + 2, rx - 1], [rx + 2, X + 13]]) for (let px = x0; px <= x1; px++) { x.fillStyle = (px >> 1) % 2 ? "#946d34" : "#c9a160"; x.fillRect(px, Y - 1 + ((px - x0) % 5 === 2 ? 0 : 0), 1, 1); }
            x.fillStyle = P.i; x.fillRect(rx - 1, Y - 3, 4, 3); x.fillStyle = P.m; x.fillRect(rx, Y - 3, 2, 1); x.fillStyle = "#000"; x.fillRect(rx, Y - 2, 2, 1);
        }
        if (c.hang0 && !c.hang && c.tail > 0 && !(c.vy > 0.5)) {
            // the cut end: along the lid to its edge, then down the side, as far as it reaches (a few tiles at most)
            const along = Math.min(c.tail, X + 15 - (rx + 2)), down = Math.min(c.tail - along, 13), ly = Y - 2;
            for (let i = 0; i < along; i++) { x.fillStyle = (i >> 1) % 2 ? "#946d34" : "#c9a160"; x.fillRect(rx + 2 + i, ly, 1, 1); x.fillStyle = "#5c3f19"; x.fillRect(rx + 2 + i, ly + 1, 1, 1); }
            const sx = X + 16;
            for (let j = 0; j < down; j++) { const tw = (j >> 1) % 2; x.fillStyle = tw ? "#c9a160" : "#946d34"; x.fillRect(sx, ly + j, 1, 1); x.fillStyle = tw ? "#946d34" : "#5c3f19"; x.fillRect(sx + 1, ly + j, 1, 1); }
            if (down > 0) fray(x, sx, ly + down, true); else { x.fillStyle = "#ecd29a"; x.fillRect(rx + 2 + along, ly - 1, 1, 1); x.fillRect(rx + 2 + along, ly + 1, 1, 1); }
        }
    }
    function skyMaskOf(a) {
        const { w, h, tiles } = a;
        a.skyMask = new Uint8Array(w * h);
        const roof = c => c === "#" || c === "X" || c === "V" || c === "%";
        // under a shelf or slab two tiles thick or less the sky still shows; under real rock (three or more) it is a gallery
        for (let x = 0; x < w; x++) { let open = true; for (let y = 0; y < h && open; y++) { if (!roof(tiles[y][x])) { a.skyMask[y * w + x] = 1; continue; } let t = 0; while (y + t < h && roof(tiles[y + t][x])) t++; if (t > 2) open = false; y += t - 1; } }
    }
    /* A CREATURE from its object: where it is, which way it sets off and how
       fast (speed, 1 as it always was), whether a stomp finishes it (stomp),
       and a path to keep to instead of its own wandering (path: the points
       after where it starts). */
    function makeFoe(o, tx, ty) {
        const k = o.type, T = TYPES[k], x = o.x, y = o.y;
        const sp = o.speed > 0 ? o.speed : 1, dir = o.dir === 1 ? 1 : -1;
        const f = { kind: k, x, y, w: T.w, h: T.h, alive: true, stomp: o.stomp === undefined || o.stomp === null ? Boolean(STOMP[k]) : Boolean(o.stomp), obj: o };
        if (k === "rat") f.vx = 0.6 * sp * dir;
        else if (k === "bot") f.vx = 0.5 * sp * dir;
        else if (k === "grub") f.vx = 0.25 * sp * dir;
        else if (k === "crawler") f.vx = 0.3 * sp * dir;
        else if (k === "beetle") { f.vx = 0.4 * sp * dir; f.flipT = 0; }
        else if (k === "hare") Object.assign(f, { vx: 1.2 * sp * dir, vy: 0, onGround: true, hopT: 20 + (tx * 7) % 30 });
        else if (k === "bat") Object.assign(f, { ox: x, oy: y, t: tx * 7, range: o.range > 0 ? o.range : 44, sp });
        else if (k === "spider") Object.assign(f, { ax: x + 7, top: y, t: tx * 11, len: 0, drop: o.drop > 0 ? o.drop : 68, sp });
        else if (k === "hammer") Object.assign(f, { tx, ty, state: "rest", t: 0, vy: 0, cd: 0 });
        else if (k === "lizard") Object.assign(f, { vy: -0.5 * sp, side: 0 });
        else if (k === "wisp") Object.assign(f, { ox: x, oy: y, t: tx * 9, sp });
        else if (k === "jelly") Object.assign(f, { ox: x, oy: y, t: tx * 17, range: o.range > 0 ? o.range : 22, sp });
        else if (k === "steam") Object.assign(f, { w: 32, h: 8, tx, ty, out: 0, t: (tx * 37) % 160, side: 0, every: o.every > 0 ? o.every : 200 });
        else if (k === "piston") Object.assign(f, { tx, ty, out: 0, side: 0 });
        else if (k === "mummy") Object.assign(f, { vx: 0.32 * sp * dir, half: false, sp });
        else if (k === "snake") Object.assign(f, { st: "rest", out: 0, cd: 0, t: 0, lean: dir });
        if (Array.isArray(o.path) && o.path.length) {
            f.path = [{ x, y }, ...o.path.map(p => ({ x: p.x, y: p.y }))];
            f.pathSpeed = o.pathSpeed > 0 ? o.pathSpeed : 0.6;
            f.pathPause = o.pause > 0 ? o.pause : 0;
            f.loop = Boolean(o.loop);
            f.pd = 0; f.pdir = 1; f.pwait = 0;
        }
        return f;
    }
    /* A MOVING PLATFORM: across (axis "h", between x = min and max), up and
       down ("v", between y = min and max), or along a path of points; it
       starts where it stands, going dir (1: right or down), at speed, and
       waits pause frames at each end. */
    function makeMover(o, tx, ty) {
        const axis = o.axis === "v" ? "v" : o.axis === "path" ? "p" : "h";
        // (tx, ty: the tile it was first put on, kept by a pair that set off from their ends; its timber's grain and rigging go by it)
        const m = { kind: axis, tx: o.tx === undefined ? tx : o.tx, ty: o.ty === undefined ? ty : o.ty, x: o.x, y: o.y, w: o.w > 0 ? o.w : 48, dir: o.dir === -1 ? -1 : 1, pause: 0, dx: 0, dy: 0, obj: o };
        if (o.speed > 0) m.speed = o.speed;
        m.rest = o.pause > 0 ? o.pause : axis === "v" ? 60 : 50;
        if (axis === "h") { m.x0 = Math.min(o.min, o.max); m.x1 = Math.max(o.min, o.max); }
        else if (axis === "v") {
            m.y0 = Math.min(o.min, o.max); m.y1 = Math.max(o.min, o.max);
            // (23 Oct 2026) its crane (auto, winch left or right, compact, none) and whether it is one of a linked pair
            m.crane = ["left", "right", "compact", "none"].includes(o.crane) ? o.crane : "auto"; m.pair = o.pair === true;
        }
        else { m.path = [{ x: o.x, y: o.y }, ...(o.path || []).map(p => ({ x: p.x, y: p.y }))]; m.pd = 0; m.pdir = 1; m.loop = Boolean(o.loop); m.x0 = Math.min(...m.path.map(p => p.x)); m.x1 = Math.max(...m.path.map(p => p.x)); }
        return m;
    }
    // A wall lantern from its object: where, and its light (the theme's, unless the level says).
    function torchOf(o, tx, ty) {
        return {
            kind: "t", x: o.x, y: o.y, t: (tx * 13 + ty * 7) % 4, obj: o,
            radius: o.radius > 0 ? o.radius : 70, intensity: o.intensity >= 0 && o.intensity !== null && o.intensity !== undefined ? o.intensity : 0.3,
            reveal: o.reveal >= 0 && o.reveal !== null && o.reveal !== undefined ? o.reveal : 86, flicker: o.flicker >= 0 && o.flicker !== null && o.flicker !== undefined ? o.flicker : 0.06,
            color: o.color ? hexRgb(o.color) : null, embers: o.embers === undefined || o.embers === null ? null : Boolean(o.embers), lamp: o.lamp !== false,
            style: lampStyle(o)
        };
    }
    /* A LAMP (17 Oct 2026): a lantern's object may say its style. wall: the
       zone's own (the Mine's torch on its bracket); hang: a cage lantern on a
       chain down from the roof; oil: a small oil lamp on a wall bracket;
       floor: a hurricane lantern standing on the floor. Each has its glow
       where its flame is (LAMP_AT, from the object's top left; the zone's
       lampAt for wall). */
    /* (22 Oct 2026) and the candles (js/rat-race-art.js CANDLES), each placed by how it stands: on the floor, its foot
       on the floor of its tile; on the wall, its top at the tile's; hanging, the ring its chains meet at on the
       object's y (its chain from there to the roof). The glow sits among its flames. */
    const CANDLES = (window.RatArt && window.RatArt.candles) || {};
    const LAMP_STYLES = new Set(["hang", "oil", "floor"].concat(Object.keys(CANDLES)));
    const lampStyle = o => (LAMP_STYLES.has(o.style) ? o.style : "wall");
    const LAMP_AT = { hang: { gx: 8, gy: 10 }, oil: { gx: 8, gy: 4 }, floor: { gx: 8, gy: 9 } };
    for (const [k, c] of Object.entries(CANDLES)) {
        // (its middle column on the object's x + 8; the glow on the middle of its flames, which stand on their wicks: wick - 5 to wick)
        const sx = 8 - (c.place === "hang" ? c.apex[0] : (c.w - 1) / 2), sy = c.place === "floor" ? 16 - c.h : c.place === "hang" ? -c.apex[1] : 0;
        const ws = c.wicks.length ? c.wicks : [[(c.w - 1) / 2, c.h / 2 + 2]], avg = i => ws.reduce((s, w) => s + w[i], 0) / ws.length;
        LAMP_AT[k] = { sx, sy, gx: sx + avg(0) + 0.5, gy: sy + avg(1) - 2 };
    }
    const lampAt = style => LAMP_AT[style] || TH.lampAt || { gx: 8, gy: -2 };
    /* ITS FLAME (17 Oct 2026, the owner's: "the flicker appears as if it's a
       distorted image, as it's just one pixel turning on and off"): a flame
       two wide and five tall in the glass, a white core, gold at its tip and
       orange at its root; the tip leaning one way, the other, or ducking
       down, in no set order (FLAME_SEQ); and the glass round it brightening
       and dimming smoothly as a flame's light does (lampGlow). */
    const SMALL_FLAME = [
        [".a", "ab", "bb", "bb", "cc"],
        ["a.", "ba", "bb", "bb", "cc"],
        ["..", "aa", "bb", "bb", "cc"],
        [".a", "ba", "bb", "bb", "cc"],
        ["a.", "ab", "bb", "bb", "cc"]
    ];
    const FLAME_SEQ = [0, 3, 1, 3, 0, 2, 4, 1, 0, 3, 2, 4, 1, 0];
    const FIRE_HEX = ["#fff4c4", "#ffc840", "#f5841a"];
    function lampFlame(g2, left, top, seed, cols) {
        const f = SMALL_FLAME[FLAME_SEQ[Math.floor((frameNo + seed * 7) / 5) % FLAME_SEQ.length]], C = { a: cols[1], b: cols[0], c: cols[2] };
        for (let r = 0; r < f.length; r++) for (let c = 0; c < 2; c++) { const ch = f[r][c]; if (ch !== ".") { g2.fillStyle = C[ch]; g2.fillRect(left + c, top + r, 1, 1); } }
    }
    // how bright a flame's light is just now, 0 to 1, wandering smoothly
    const lampPulse = seed => 0.5 + 0.3 * Math.sin(frameNo * 0.21 + seed) + 0.2 * Math.sin(frameNo * 0.53 + seed * 2.3);
    // the lit glass of a lamp's picture laid over it again, lighter, as much as the flame is bright
    const glowArt = new Map();
    function lampGlow(g2, img, x, y, seed, only) {
        let m = glowArt.get(img); if (!m) { m = litPart(img, only || FIRE_LIT); glowArt.set(img, m); }
        g2.save(); g2.globalCompositeOperation = "lighter"; g2.globalAlpha = 0.12 + 0.3 * lampPulse(seed); g2.drawImage(m, x, y); g2.restore();
    }
    /* A LAMP IN ITS OWN COLOUR (17 Oct 2026, the owner's: "when changing the
       colour of the hanging lanterns, the light inside the lantern doesn't
       change colour ... apply the fix ... to other lanterns that have this
       bug too"): a lantern given a colour has its flame, and the lit glass
       of its lamp, turned to that colour, keeping their light and dark;
       white stays near white. Only the lit colours are turned (FIRE_LIT, and
       each zone's own lamp's in LAMP_LIT), so brass and wood stay as they
       are. (The arcade keeps its own way: TH.tintLamp, A LANTERN IN ITS OWN
       COLOUR.) */
    const FIRE_LIT = ["#7a1e06", "#d2420c", "#f5841a", "#ffc840", "#fff4c4"];
    const LAMP_LIT = { ice: ["#d8f0ff", "#9fd2f2", "#6eb2e0", "#4a8ec4", "#2e6a9e"], quarry: ["#fff1b4", "#fffbe6", "#ffe7a0", "#f6c860", "#d89a38", "#a86a20"], station: ["#fff6d8", "#ffd88a", "#e0a040"] };
    const hexKey = (r, g2, b) => "#" + [r, g2, b].map(v => v.toString(16).padStart(2, "0")).join("");
    const rgbHsl = (r, g2, b) => { r /= 255; g2 /= 255; b /= 255; const mx = Math.max(r, g2, b), mn = Math.min(r, g2, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const dd = mx - mn, s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); const h = mx === r ? (g2 - b) / dd + (g2 < b ? 6 : 0) : mx === g2 ? (b - r) / dd + 2 : (r - g2) / dd + 4; return [h * 60, s, l]; };
    const hslRgb = (h, s, l) => { const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0), f(8), f(4)].map(v => Math.round(v * 255)); };
    // one colour turned to the lamp's: its hue, a saturation between the two, its own lightness
    function toLampColour(r, g2, b, rgb) { const [th, ts] = rgbHsl(...rgb), [, s, l] = rgbHsl(r, g2, b); return hslRgb(th, Math.min(1, ts * 0.6 + s * 0.4), l); }
    const tintHex = (hex, rgb) => { const v = parseInt(hex.slice(1), 16), [r, g2, b] = toLampColour(v >> 16, (v >> 8) & 255, v & 255, rgb); return hexKey(r, g2, b); };
    const flameCols = rgb => (rgb ? FIRE_HEX.map(h => tintHex(h, rgb)) : FIRE_HEX);
    // a picture with its lit colours (only: a list of them; null: every colour that is not grey or white) turned to the lamp's
    const litArt = new Map();
    function tintLit(img, rgb, only) {
        if (!img || !rgb) return img;
        const key = (img._tid || (img._tid = Math.random().toString(36).slice(2))) + "|" + rgb.join(",") + "|" + (only ? only.join("") : "*");
        let c = litArt.get(key); if (c) return c;
        c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const D = x.getImageData(0, 0, c.width, c.height), d = D.data, set = only ? new Set(only) : null;
        for (let i = 0; i < d.length; i += 4) {
            if (!d[i + 3]) continue;
            if (set ? !set.has(hexKey(d[i], d[i + 1], d[i + 2])) : rgbHsl(d[i], d[i + 1], d[i + 2])[1] < 0.3) continue;
            const [r, g2, b] = toLampColour(d[i], d[i + 1], d[i + 2], rgb); d[i] = r; d[i + 1] = g2; d[i + 2] = b;
        }
        x.putImageData(D, 0, 0); if (litArt.size > 300) litArt.delete(litArt.keys().next().value); litArt.set(key, c); return c;
    }
    // only the lit part of a picture (its colours in only), the rest left clear
    function litPart(img, only) {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const D = x.getImageData(0, 0, c.width, c.height), d = D.data, set = new Set(only);
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] && !set.has(hexKey(d[i], d[i + 1], d[i + 2]))) d[i + 3] = 0;
        x.putImageData(D, 0, 0); return c;
    }
    // the zone's own wall lamp and its flame, in the lamp's colour if it has one
    function wallLampArt(rgb, t) {
        const base = spr("torchBase", 0), fl = spr("flame", t);
        if (!rgb) return [base, fl];
        if (TH.tintLamp) return [tinted(base, rgb), tinted(fl, rgb)];
        return [LAMP_LIT[ZK] ? tintLit(base, rgb, LAMP_LIT[ZK]) : base, tintLit(fl, rgb, null)];
    }
    /* A CANDLE'S FLAME (22 Oct 2026, the owner's: "make sure their animations and glows are perfect"): three pixels
       wide on its wick, the wick dark at its foot between two of orange, a white core, gold round it; as tall as
       it burns just now (lampPulse, the same as its glow and the wax's: short when it gutters, tall and thin at its
       brightest), its tip (its top pixel) leaning with the air one way or the other now and then (candleLean). */
    const CANDLE_FLAMES = {
        4: ["c.c", "cbc", "aba", ".a."],
        5: ["c.c", "cbc", "aba", "aba", ".a."],
        6: ["c.c", "cbc", "aba", "aba", ".a.", ".a."],
        7: ["c.c", "cbc", "aba", "aba", ".b.", ".a.", ".a."]
    };
    // which way its tip leans: mostly straight up, now and then (a draught) one way or the other for a moment
    function candleLean(seed) { const s = Math.sin(frameNo * 0.061 + seed) + 0.55 * Math.sin(frameNo * 0.173 + seed * 1.7); return s > 1.05 ? 1 : s < -1.05 ? -1 : 0; }
    function candleFlame(g2, wx, wy, p, lean, cols) {
        const rows = CANDLE_FLAMES[p < 0.2 ? 4 : p < 0.42 ? 5 : p < 0.86 ? 6 : 7], C = { a: cols[1], b: cols[0], c: cols[2] };
        rows.forEach((r, i) => {
            const dx = i === rows.length - 1 ? lean : 0;   // (its tip leans)
            for (let c = 0; c < 3; c++) { const ch = r[c]; if (ch !== ".") { g2.fillStyle = C[ch]; g2.fillRect(wx - 1 + c + dx, wy - i, 1, 1); } }
        });
    }
    /* A HANGING CANDLE'S CHAINS: one down from the roof to a ring on the object's own column (mid, y), links three
       pixels wide (a ring face on, then a bar edge on, the ring's hole showing the wall), all on that one column;
       from the ring, a finer chain to each of the holder's lugs (CANDLES: lugs), a pixel at a time along the line,
       the two sides mirror images of each other. */
    function candleChains(g2, a, C, mid, y, px, py) {
        const I = RIG_MINE.iron;
        let roof = null; const tx = Math.floor(mid / TS);
        for (let ty = Math.floor((y - 1) / TS), n = 0; ty >= 0 && n < 14; ty--, n++) { const c = tileAtIn(a, tx, ty); if (c === "#" || c === "%" || c === "X" || c === "V" || c === "8" || c === "9" || c === "=") { roof = (ty + 1) * TS - (c === "=" ? TS - PLAT_H : 0); break; } }
        const top = roof === null ? y - 72 : roof, P = (qx, qy, col) => { if (qy >= top + 2 && qy < y) { g2.fillStyle = col; g2.fillRect(qx, qy, 1, 1); } };
        // up from the ring: a bar, a ring, a bar, ... (not for a swinging chandelier: its chain is the swing's)
        if (!lampChainFree) for (let yy = y - 1, k = 0; yy >= top + 2; k++) {
            if (k % 2 === 0) { P(mid, yy, I[2]); P(mid, yy - 1, I[3]); yy -= 2; }
            else { P(mid, yy, I[1]); P(mid - 1, yy - 1, I[3]); P(mid + 1, yy - 1, I[1]); P(mid - 1, yy - 2, I[3]); P(mid + 1, yy - 2, I[2]); P(mid, yy - 3, I[4]); yy -= 4; }
        }
        if (roof !== null && !lampChainFree) { g2.fillStyle = I[0]; g2.fillRect(mid - 2, top, 5, 2); g2.fillStyle = I[3]; g2.fillRect(mid - 1, top, 3, 1); }
        // the ring the chains meet at, five across, lit at its top left
        const F = (qx, qy, w, h, col) => { g2.fillStyle = col; g2.fillRect(qx, qy, w, h); };
        F(mid - 1, y, 3, 1, I[3]); F(mid - 1, y, 1, 1, I[4]); F(mid - 2, y + 1, 1, 3, I[3]); F(mid + 2, y + 1, 1, 3, I[1]); F(mid - 1, y + 4, 3, 1, I[1]);
        // down to the lugs: from the ring's lower corners, a pixel a step; the link's lit side, its shade, then the dark joint
        for (const [lx, ly] of C.lugs) {
            const side = px + lx < mid ? -1 : 1, x0 = mid + 2 * side, y0 = y + 4, x1 = px + lx, y1 = py + ly - 1;
            const dx = Math.abs(x1 - x0), dy = y1 - y0, n = Math.max(dx, dy);
            for (let i = 0; i <= n; i++) F(x0 + side * Math.round(dx * i / n), y0 + Math.round(dy * i / n), 1, 1, i % 3 === 0 ? I[1] : i % 3 === 1 ? I[3] : I[2]);
        }
    }
    // a lamp of the styles above, drawn at its object's (x, y); a: the act, for the roof a hanging one hangs from
    function drawLamp(g2, style, x, y, t, a, rgb) {
        const cols = flameCols(rgb), seed = (x * 7 + y * 3) % 97;
        const pic = name => { const raw = spr(name, 0); return rgb ? tintLit(raw, rgb, FIRE_LIT) : raw; };
        const lit = (name, px, py, more) => { const img = pic(name); g2.drawImage(img, px, py); lampGlow(g2, img, px, py, seed, (rgb ? FIRE_LIT.map(h => tintHex(h, rgb)) : FIRE_LIT).concat(more || [])); };
        const I = RIG_MINE.iron, F = (px, py, w, h, col) => { g2.fillStyle = col; g2.fillRect(px, py, w, h); };
        // the chain, up to the roof (or as far as the dark goes) from y, from a hook plate there
        const chainUp = () => {
            let roof = null; const tx = Math.floor((x + 8) / TS);
            for (let ty = Math.floor((y - 1) / TS), n = 0; ty >= 0 && n < 14; ty--, n++) { const c = tileAtIn(a, tx, ty); if (c === "#" || c === "%" || c === "X" || c === "V" || c === "8" || c === "9" || c === "=") { roof = (ty + 1) * TS - (c === "=" ? TS - PLAT_H : 0); break; } }
            const top = roof === null ? y - 72 : roof, cx = x + 8;
            /* links, one face on (a ring, lit at its top left) and the next edge on, three pixels apart; two
               pixels wide about the line between x + 7 and x + 8, as the lantern's ring is (17 Oct 2026, the
               owner's: "the hanging lantern is off centre from the chain") */
            for (let yy = top + 2, i = 0; yy < y; yy += 3, i++) {
                if (i % 2 === 0) { F(cx - 1, yy, 2, 1, I[3]); F(cx - 2, yy + 1, 1, 2, I[3]); F(cx + 1, yy + 1, 1, 2, I[2]); F(cx - 1, yy + 3, 2, 1, I[2]); F(cx - 1, yy, 1, 1, I[4]); }
                else { F(cx - 1, yy, 2, 3, I[0]); F(cx - 1, yy, 1, 2, I[3]); }
            }
            if (roof !== null) { g2.fillStyle = I[0]; g2.fillRect(cx - 4, top, 8, 2); g2.fillStyle = I[3]; g2.fillRect(cx - 3, top, 6, 1); }
        };
        const C = CANDLES[style];
        if (C) {
            const L = LAMP_AT[style], px = x + L.sx, py = y + L.sy, mid = x + 8;   // mid: the pixel column it stands and hangs on
            if (C.place === "hang") candleChains(g2, a, C, mid, y, px, py);
            // the wax lit by the flame (its lit stripe, and the wax under the flame glowing through), brightening and dimming with it
            lit(C.spr, px, py, ["#fff3d2", "#ffd890"]);
            C.wicks.forEach(([wx, wy], i) => {
                const sd = seed + i * 13, p = lampPulse(sd), lean = candleLean(sd), fx = px + wx, fy = py + wy;   // (fx, fy): the wick, the flame's foot
                // its halo: as bright and as big as it burns just now, leaning with it
                const [hr, hg, hb] = rgb ? toLampColour(255, 196, 110, rgb) : [255, 196, 110], hx = fx + 0.5 + lean * 0.6, hy = fy - 2, R = 6 + 2.5 * p;
                g2.save(); g2.globalCompositeOperation = "lighter";
                const gr = g2.createRadialGradient(hx, hy, 0, hx, hy, R);
                gr.addColorStop(0, `rgba(${hr},${hg},${hb},${(0.13 + 0.17 * p).toFixed(3)})`); gr.addColorStop(0.45, `rgba(${hr},${hg},${hb},${(0.05 + 0.07 * p).toFixed(3)})`); gr.addColorStop(1, `rgba(${hr},${hg},${hb},0)`);
                g2.fillStyle = gr; g2.fillRect(Math.floor(hx - R), Math.floor(hy - R), Math.ceil(R * 2) + 2, Math.ceil(R * 2) + 2); g2.restore();
                candleFlame(g2, fx, fy, p, lean, cols);
            });
            /* the fireflies in the jar: drifting about it, each lighting up and going dark in its own time, a soft
               glow round the lit ones (their colour the lantern's, a summer green-gold when it has none) */
            if (C.flies) {
                const fb = C.flies, [fr, fg, fbl] = rgb || [214, 255, 110];
                g2.save();
                // the glass: faintly green, catching the flies' light, a glint down its left
                for (const [gx0, gy0, gw] of C.glass || []) F(px + gx0, py + gy0, gw, 1, "rgba(196,232,176,0.11)");
                F(px + 3, py + 8, 1, 3, "rgba(255,255,255,0.32)"); F(px + 3, py + 11, 1, 1, "rgba(255,255,255,0.16)");
                for (let i = 0; i < 7; i++) {
                    const h1 = hashTile(i * 31 + x, i * 17 + y), h2 = hashTile(i * 7 + y, i * 41 + x), t = frameNo / (70 + h1 * 60);
                    const fx2 = px + fb.x + Math.round((0.5 + 0.45 * Math.sin(t * 2.1 + h1 * 9)) * (fb.w - 1)), fy2 = py + fb.y + Math.round((0.5 + 0.45 * Math.sin(t * 1.3 + h2 * 9)) * (fb.h - 1));
                    // (each glows and fades slowly, lit more often than not, never all dark at once)
                    const on = (0.5 + 0.5 * Math.sin(frameNo / (30 + h2 * 34) + h1 * 20)) ** 2;
                    if (on < 0.08) { F(fx2, fy2, 1, 1, "rgba(40,48,20,0.8)"); continue; }
                    g2.globalCompositeOperation = "lighter";
                    const gr = g2.createRadialGradient(fx2 + 0.5, fy2 + 0.5, 0, fx2 + 0.5, fy2 + 0.5, 3); gr.addColorStop(0, `rgba(${fr},${fg},${fbl},${(0.42 * on).toFixed(3)})`); gr.addColorStop(1, `rgba(${fr},${fg},${fbl},0)`);
                    g2.fillStyle = gr; g2.fillRect(fx2 - 3, fy2 - 3, 7, 7);
                    g2.globalCompositeOperation = "source-over";
                    F(fx2, fy2, 1, 1, `rgba(${Math.min(255, fr + 40)},${Math.min(255, fg + 20)},${Math.min(255, fbl + 120)},${Math.min(1, 0.4 + on).toFixed(3)})`);
                }
                g2.restore();
            }
            return;
        }
        if (style === "hang") {
            chainUp();
            lit("lampHang", x + 2, y);
            lampFlame(g2, x + 7, y + 7, seed, cols);
        } else if (style === "oil") {
            lit("lampOil", x + 2, y - 1);
            lampFlame(g2, x + 7, y + 1, seed, cols);
        } else if (style === "floor") {
            lit("lampFloor", x + 2, y - 1);
            lampFlame(g2, x + 7, y + 7, seed, cols);
        }
    }
    /* A LIGHT (14 Oct 2026, the editor's "plenty of lighting options"): a
       point of light (a soft round glow), a spot (a cone, pointing at angle
       degrees, spread wide), a shaft (a beam w wide falling h at angle, like
       day through a crack) or a beacon (turning red, the Station's). Its
       colour, how bright (intensity), how big (radius), how much it flickers
       and pulses (pulse: frames a breath), and how far it opens the dark
       where a passage is dark (reveal; scare: whether a wisp counts it). */
    function lightOf(o) {
        const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
        return {
            kind: o.kind || "point", x: o.x, y: o.y, obj: o, rgb: hexRgb(o.color || "#ffb050"),
            radius: num(o.radius, 80), intensity: num(o.intensity, 0.3), reveal: num(o.reveal, 0), flicker: num(o.flicker, 0), pulse: num(o.pulse, 0),
            angle: num(o.angle, 90), spread: num(o.spread, 40), w: num(o.w, 24), h: num(o.h, 120), scare: o.scare !== false, layer: o.layer === "front" ? "front" : "back"
        };
    }
    const hexRgb = hx => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hx || "")); if (!m) return [255, 176, 80]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    // A prop's box for standing on or being stopped by: its own hitbox (hit, from its corner), or its picture's size.
    function propBox(o) {
        if (o.hit && o.hit.w > 0 && o.hit.h > 0) return { x: o.x + (o.hit.x || 0), y: o.y + (o.hit.y || 0), w: o.hit.w, h: o.hit.h, obj: o };
        const s = sprites[o.s];
        if (!s) return null;
        const img = s.r[0];
        return { x: o.x, y: o.y, w: img.width, h: img.height, obj: o };
    }

    /* ---------------------------------------------------------------- THE STILL PICTURE
       The back wall, the frame in front of it, the walls behind (the
       editor's background walls), the props and timber that stand behind
       Scout, and every wall, beam, ladder and rope, drawn once per act into
       a picture the size of the map. (14 Oct 2026: from the level's own
       objects, in their order; what the code once placed by itself is in
       AUTO below, for the editor.) */

    /* TONE (14 Oct 2026, the editor's "adjust tone, darkest etc"): l lighter
       (up to 100, toward a warm white) or darker (down to -100, toward the
       mine's near-black); s more or less colour; c more or less contrast;
       tint a colour washed over at ta per cent. Done to a picture in place;
       l -30 is the old dimSprite exactly, the shade the props stood in. */
    const toneOn = t => Boolean(t && (t.l || t.s || t.c || (t.tint && t.ta)));
    const toneKey = t => (toneOn(t) ? [t.l || 0, t.s || 0, t.c || 0, t.tint || "", t.ta || 0].join("|") : "");
    function applyTone(c, t) {
        if (!toneOn(t)) return c;
        const x = c.getContext("2d");
        if (t.s || t.c) {
            const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
            const sat = 1 + (t.s || 0) / 100, con = 1 + (t.c || 0) / 100;
            for (let i = 0; i < d.length; i += 4) {
                if (!d[i + 3]) continue;
                let r = d[i], gg = d[i + 1], b = d[i + 2];
                const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
                r = lum + (r - lum) * sat; gg = lum + (gg - lum) * sat; b = lum + (b - lum) * sat;
                r = 128 + (r - 128) * con; gg = 128 + (gg - 128) * con; b = 128 + (b - 128) * con;
                d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
            }
            x.putImageData(img, 0, 0);
        }
        x.save();
        x.globalCompositeOperation = "source-atop";
        if (t.tint && t.ta) { const [r, gg, b] = hexRgb(t.tint); x.fillStyle = `rgba(${r},${gg},${b},${Math.min(1, t.ta / 100)})`; x.fillRect(0, 0, c.width, c.height); }
        if (t.l < 0) { x.fillStyle = `rgba(14,8,4,${Math.min(1, -t.l / 100)})`; x.fillRect(0, 0, c.width, c.height); }
        else if (t.l > 0) { x.fillStyle = `rgba(255,244,224,${Math.min(1, t.l / 100)})`; x.fillRect(0, 0, c.width, c.height); }
        x.restore();
        return c;
    }
    // A sprite by its full name ("barrel", "qblock@quarry"), a frame of it, mirrored or not, in a tone: made once.
    const toned = new Map();
    function spriteImg(key, n, left, tone) {
        const s = sprites[key];
        if (!s) return null;
        const list = left ? s.l : s.r, img = list[(((n || 0) % list.length) + list.length) % list.length];
        if (!toneOn(tone)) return img;
        const k = key + "|" + (n || 0) + "|" + (left ? 1 : 0) + "|" + toneKey(tone);
        let c = toned.get(k);
        if (!c) { c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d").drawImage(img, 0, 0); applyTone(c, tone); toned.set(k, c); }
        return c;
    }
    /* (22 Oct 2026, the owner's: "things like crates, barrels etc, auto dim slightly when not set to being an
       obstacle, but they're richer in colour and brighter when they're an obstacle") a prop's own tone, and on top
       of it: scenery (no collision) a little darker and duller, so it sits back; one Scout meets (solid, or to stand
       on) a little brighter, richer and crisper, so it reads as something in the way */
    const PROP_SCENERY = { l: -14, s: -14, c: 0 }, PROP_OBSTACLE = { l: 7, s: 22, c: 8 };
    const clampT = v => Math.max(-100, Math.min(100, v));
    function propTone(o) {
        const A = o.solid === "solid" || o.solid === "top" ? PROP_OBSTACLE : PROP_SCENERY, t = o.tone || {};
        return Object.assign({}, t, { l: clampT((t.l || 0) + A.l), s: clampT((t.s || 0) + A.s), c: clampT((t.c || 0) + A.c) });
    }
    const propImg = o => spriteImg(o.s, o.frame || 0, Boolean(o.flip), propTone(o));

    /* THE TIMBER FRAME in front of the back wall, as in an old mine: posts
       floor to ceiling, rails across bolted to them, a knee brace either
       side of each post under each rail it meets. Pixel by pixel, in the
       palette's timber colours (lit from above, like everything else).
       (14 Oct 2026) From the level's parts: { type: "post", x, y, h, braces },
       { type: "rail", x, y, w }; the old layout is woodFrameParts. */
    const FRAME_W = { post: 22, rail: 9 };
    function woodFrameParts(a) {
        const out = [];
        for (let tx = 6; tx < a.w; tx += 10) out.push({ type: "post", x: tx * TS - 3, y: 0, h: a.h * TS, braces: true });
        for (let ty = 4; ty < a.h; ty += ROOM_H) out.push({ type: "rail", x: 0, y: ty * TS + 4, w: a.w * TS });
        return out;
    }
    function drawTimbers(x, a, parts) {
        const P = ART.pal;
        const px = (c, X, Y, w, h) => { x.fillStyle = P[c]; x.fillRect(X, Y, w, h); };
        const posts = parts.filter(p => p.type === "post"), rails = parts.filter(p => p.type === "rail");
        const RAIL_H = 9, POST_W = 22, BRACE = 36;
        const meet = (p, r) => r.x <= p.x && r.x + r.w >= p.x + POST_W && p.y <= r.y && p.y + p.h >= r.y + RAIL_H;
        // Braces first, so the post and rail cover their ends.
        for (const pp of posts) if (pp.braces !== false) for (const rr of rails) {
            if (!meet(pp, rr)) continue;
            const p = pp.x, under = rr.y + RAIL_H;
            for (let i = 0; i < BRACE; i++) for (const side of [1, -1]) {
                const X = side > 0 ? p + POST_W + i : p - 1 - i, top = under + BRACE - i - 6;
                px("0", X, top, 1, 1); px("Z", X, top + 1, 1, 1); px("a", X, top + 2, 1, 3); px("U", X, top + 5, 1, 1); px("0", X, top + 6, 1, 1);
            }
        }
        for (const pp of posts) {
            const p = pp.x, y0 = pp.y, H = pp.h;
            px("0", p, y0, 1, H); px("Z", p + 1, y0, 1, H); px("Q", p + 2, y0, 2, H); px("a", p + 4, y0, 14, H);
            px("U", p + 18, y0, 3, H); px("0", p + 21, y0, 1, H);
            // grain: broken streaks down the post
            for (let y = y0; y < y0 + H; y += 8) for (const gx of [7, 12, 15]) {
                const hs = hashTile(p + gx, y);
                if (hs < 0.45) px(hs < 0.2 ? "U" : "Q", p + gx, y, 1, Math.min(4 + Math.floor(hs * 20), y0 + H - y));
            }
        }
        for (const rr of rails) {
            const r = rr.y, x0 = rr.x, W = rr.w;
            px("0", x0, r, W, 1); px("Z", x0, r + 1, W, 1); px("Q", x0, r + 2, W, 1); px("a", x0, r + 3, W, 4); px("U", x0, r + 7, W, 1); px("0", x0, r + 8, W, 1);
            for (let X = x0; X < x0 + W; X += 8) { const hs = hashTile(X, r); if (hs < 0.4) px(hs < 0.18 ? "U" : "Q", X + Math.floor(hs * 10), r + 4 + (hs < 0.25 ? 0 : 2), Math.max(0, Math.min(5 + Math.floor(hs * 16), x0 + W - X - Math.floor(hs * 10))), 1); }
            x.fillStyle = "rgba(0,0,0,0.35)"; x.fillRect(x0, r + RAIL_H, W, 2);
            // two bolts where the rail crosses each post
            for (const pp of posts) { if (!meet(pp, rr)) continue; const p = pp.x; for (const bx of [p + 5, p + 14]) { px("i", bx, r + 3, 3, 3); px("m", bx + 1, r + 4, 1, 1); px("n", bx, r + 3, 1, 1); } }
        }
    }
    // The level's frame objects as the theme's parts (upright: post, crossbeam: rail, root).
    const frameAsParts = list => list.map(o => (o.type === "upright" ? { type: "post", x: o.x, y: o.y, h: o.h, braces: o.braces !== false } : o.type === "crossbeam" ? { type: "rail", x: o.x, y: o.y, w: o.w } : { type: "root", x: o.x, y: o.y, h: o.h, seed: o.seed }));
    function drawFrame(x, a, list) {
        if (!list.length) return;
        const parts = frameAsParts(list);
        if (TH.frame) TH.frame(x, a, helpers(), parts); else drawTimbers(x, a, parts);
    }
    // the theme's frame, laid out the old way (posts every ten tiles, a rail across each room), as objects
    function autoFrame(a) {
        const parts = TH.frameParts ? TH.frameParts(a) : woodFrameParts(a);
        return parts.map(p => (p.type === "post" ? { type: "upright", x: p.x, y: p.y, h: p.h, braces: p.braces !== false } : p.type === "rail" ? { type: "crossbeam", x: p.x, y: p.y, w: p.w } : { type: "root", x: p.x, y: p.y, h: p.h, seed: p.seed }));
    }
    const frameWidth = kind => { const W = TH.frameW || FRAME_W; return kind === "rail" ? W.rail || 9 : kind === "root" ? W.root || 4 : W.post || 22; };

    /* PROPS (13 Oct 2026): barrels, crates and heaps of fallen stone, set about
       the floors by the map's own hash, so the same act always looks the
       same: on open floor only, never by a door, a ladder, a sign, the
       flag, the start, a crate, the edge of a pit or a hidden room, and
       never two side by side. Behind everything, a shade darker than the
       crate Scout pushes, so they read as the mine's, not his.
       (14 Oct 2026: only for AUTO now; the props are the level's objects.) */
    function propMarks(a, extra) {
        const m = [[Math.floor(a.start.x / TS), Math.floor(a.start.y / TS) + 1]];
        if (a.flag) m.push([Math.floor(a.flag.x / TS), Math.floor((a.flag.y + 20) / TS)]);
        if (a.door) m.push([Math.floor(a.door.x / TS), Math.floor((a.door.y + 40) / TS)], [Math.floor(a.door.x / TS) + 1, Math.floor((a.door.y + 40) / TS)]);
        for (const sg of a.signs) m.push([Math.floor(sg.x / TS), Math.floor(sg.y / TS)]);
        for (const t of a.things) m.push([Math.floor((t.x + 4) / TS), Math.floor((t.y + 8) / TS)]);
        for (const c of a.crates) m.push([Math.floor(c.x / TS), Math.floor(c.y / TS)]);
        for (const p of a.piles) for (const [cx, cy] of p.cells) m.push([cx, cy]);
        for (const e of extra || []) m.push(e);
        for (const b of a.braziers) m.push([Math.floor(b.x / TS), Math.floor(b.y / TS)]);
        return m;
    }
    function propSpots(a, marks) {
        const near = (tx, ty, r, test) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (test(tileAtIn(a, tx + dx, ty + dy))) return true; return false; };
        const out = [];
        let lastX = -9, lastY = -1;
        for (let ty = 1; ty < a.h - 1; ty++) for (let tx = 1; tx < a.w - 1; tx++) {
            const ch = a.tiles[ty][tx];
            if (ch !== "." || a.tiles[ty + 1][tx] !== "#" || a.tiles[ty - 1][tx] !== ".") continue;
            if (isHidden(a, tx, ty) || near(tx, ty, 1, c => c === "^") || marks.some(m => Math.abs(m[0] - tx) <= 2 && Math.abs(m[1] - ty) <= 1)) continue;
            // nothing on a pool's floor (it reads as a block in the way)
            if (a.water && (a.water.has(tx + "," + ty) || a.water.has(tx + "," + (ty - 1)))) continue;
            if (ty === lastY && tx - lastX < 3) continue;
            const hv = hashTile(tx * 5 + 11, ty * 3 + 7);
            if (hv > 0.13) continue;
            lastX = tx; lastY = ty;
            out.push({ tx, ty, px: tx * TS, py: ty * TS, hv, kind: Math.floor(hv * 1000) % 3 });
        }
        return out;
    }
    function drawProps(x, a, spots) {
        for (const sp of spots) {
            const { tx, ty, px, py, kind } = sp;
            if (kind === 0) x.drawImage(dimSprite(spr("barrel", 0)), px + 2, py + 2);
            else if (kind === 1) { x.drawImage(dimSprite(spr("rubble", 0)), px, py + 8); }
            else {
                x.drawImage(dimSprite(spr("crate", 0)), px, py);
                if (hashTile(tx, ty * 9) < 0.35 && a.tiles[ty - 1][tx] === "." && a.tiles[ty - 2] && a.tiles[ty - 2][tx] === ".") x.drawImage(dimSprite(spr("crate", 0)), px + 2, py - 14);
            }
        }
    }
    /* The props the theme would set about the floors, as objects: its own
       drawing, watched, each picture it puts down kept as a prop (by name,
       mirrored or not, dimmed or not). A glow a prop gives off (the Depths'
       toadstools) comes back as a light. */
    function autoProps(a, extraMarks) {
        const names = new Map();
        for (const [key, s] of Object.entries(sprites)) {
            if (!s || !s.r) continue;
            s.r.forEach((c, i) => { names.set(c, { s: key, frame: i, flip: false }); const d = dimmed.get(c); if (d) names.set(d, { s: key, frame: i, flip: false, dim: true }); });
            s.l.forEach((c, i) => { if (!names.has(c)) names.set(c, { s: key, frame: i, flip: true }); const d = dimmed.get(c); if (d && !names.has(d)) names.set(d, { s: key, frame: i, flip: true, dim: true }); });
        }
        const out = [], spots = propSpots(a, propMarks(a, extraMarks));
        a.glows = [];
        const rec = {
            drawImage(img, X, Y) {
                let n = names.get(img);
                // a picture dimmed for the first time here was made just now
                if (!n) { for (const [src, d] of dimmed) if (d === img) { const b = names.get(src); if (b) n = Object.assign({}, b, { dim: true }); break; } }
                if (!n) return;
                const o = { type: "prop", s: n.s, x: X, y: Y, layer: "back" };
                if (n.frame) o.frame = n.frame;
                if (n.flip) o.flip = true;
                if (n.dim) o.tone = { l: -30 };
                out.push(o);
            }
        };
        if (TH.props) TH.props(rec, a, helpers(), spots); else drawProps(rec, a, spots);
        for (const [gx, gy, r] of a.glows) out.push({ type: "light", kind: "point", x: gx, y: gy, radius: 0, intensity: 0, reveal: r, scare: false });
        a.glows = [];
        return out;
    }
    const tileAtIn = (a, tx, ty) => (tx < 0 || ty < 0 || tx >= a.w || ty >= a.h ? "#" : a.tiles[ty][tx]);

    /* SUPPORTS (13 Oct 2026: "some of the floating secret rooms appear
       unsupported, they need the truss and beam supports like the roof
       has"). A block of wall that touches neither the map's edge nor the
       floor beneath stands on timber posts, one under each end, down to
       whatever is below; a beam not resting on a wall hangs from the roof
       on two chains. (14 Oct 2026: each piece is an object now, drawn by
       drawBackObject; autoSupports works out the pieces the old way.) */
    // The theme's timber, as colours: d outline, s shade, m body, l light, q mid.
    function timberPal() { const P = ART.pal, t = TH.timber, c = k => (k && k[0] === "#" ? k : P[k]); return { d: c(t.d), s: c(t.s), m: c(t.m), l: c(t.l), q: c(t.q) }; }
    // The pieces, drawn: a post (knees: braced out under what it holds; foot: standing on a footing), a brace at 45 degrees, ...
    function drawPost(x, o) {
        const T = timberPal(), X = o.x + 1, top = o.y, bot = o.y + o.h;
        x.fillStyle = T.d; x.fillRect(X - 1, top, 8, bot - top);
        x.fillStyle = T.l; x.fillRect(X, top, 1, bot - top);
        x.fillStyle = T.m; x.fillRect(X + 1, top, 4, bot - top);
        x.fillStyle = T.s; x.fillRect(X + 5, top, 1, bot - top);
        if (o.knees) for (let i = 0; i < 8; i++) for (const sd of [1, -1]) {
            const bx = sd > 0 ? X + 7 + i : X - 2 - i, by = top + 7 - i;
            x.fillStyle = T.d; x.fillRect(bx, by, 1, 1); x.fillStyle = T.m; x.fillRect(bx, by + 1, 1, 2); x.fillStyle = T.d; x.fillRect(bx, by + 3, 1, 1);
        }
        if (o.foot) { x.fillStyle = T.d; x.fillRect(X - 2, bot - 3, 10, 3); x.fillStyle = T.m; x.fillRect(X - 1, bot - 2, 8, 1); }
        if (TH.wearPiece) TH.wearPiece(x, "post", o);
    }
    function drawBrace(x, o) {   // a timber 3 thick, at 45 degrees, len long, dir 1 down to the right, -1 down to the left
        const T = timberPal();
        /* (21 Oct 2026, the owner's: "Doesn't meet the top beam properly") its top end cut square to what it holds up:
           back behind its start, the timber's underside carried on up to the beam (the row at o.y), so it butts flat
           against it four pixels wide instead of touching it with a point */
        for (let i = -3; i < 0; i++) {
            const bx = o.x + o.dir * i, bot = o.y + i + 3;
            if (bot > o.y) { x.fillStyle = T.m; x.fillRect(bx, o.y, 1, bot - o.y); }
            x.fillStyle = T.d; x.fillRect(bx, bot, 1, 1);
        }
        for (let i = 0; i < o.len; i++) {
            const bx = o.x + o.dir * i, by = o.y + i;
            x.fillStyle = T.d; x.fillRect(bx, by - 1, 1, 1); x.fillStyle = T.l; x.fillRect(bx, by, 1, 1); x.fillStyle = T.m; x.fillRect(bx, by + 1, 1, 2); x.fillStyle = T.d; x.fillRect(bx, by + 3, 1, 1);
        }
        if (TH.wearPiece) TH.wearPiece(x, "brace", o);
    }
    function drawCleat(x, o) {   // a timber cleat where a brace meets a wall
        const P = ART.pal;
        x.fillStyle = P[0]; x.fillRect(o.x, o.y, 3, 9); x.fillStyle = P.a; x.fillRect(o.x + (o.side === "R" ? 1 : 0), o.y + 1, 2, 7);
    }
    const iron = (x, cx, cy) => { const P = ART.pal; x.fillStyle = P.i; x.fillRect(cx - 1, cy - 1, 3, 3); x.fillStyle = P.n; x.fillRect(cx - 1, cy - 1, 1, 1); };
    function drawChain(x, o) {
        const P = ART.pal, y0 = o.y, y1 = o.y + o.h, cx = o.x;
        for (let yy = y0, i = 0; yy < y1; yy += 3, i++) {
            x.fillStyle = P.i; x.fillRect(cx - 1, yy, 3, 3);
            x.fillStyle = i % 2 ? P.m : P.n; x.fillRect(cx, yy, 1, 2);
        }
        iron(x, cx, y1 - 1); iron(x, cx, y0 + 1);
    }
    function drawHangRope(x, o) {
        const y0 = o.y, y1 = o.y + o.h, cx = o.x;
        for (let yy = y0; yy < y1; yy++) { const tw = (yy >> 1) % 2; x.fillStyle = tw ? "#c9a160" : "#946d34"; x.fillRect(cx, yy, 1, 1); x.fillStyle = tw ? "#946d34" : "#ecd29a"; x.fillRect(cx + 1, yy, 1, 1); }
        x.fillStyle = "#5c3f19"; x.fillRect(cx - 1, y1 - 2, 4, 3);   // its knot round the timber
        iron(x, cx, y0 + 1);
    }
    function drawYCap(x, o) { const T = timberPal(); x.fillStyle = T.d; x.fillRect(o.x, o.y, 8, 9); x.fillStyle = T.m; x.fillRect(o.x + 1, o.y, 6, 8); }
    function drawShaftBeam(x, o) {
        const T = timberPal(), X0 = o.x, Y = o.y, W = o.w;
        x.fillStyle = T.d; x.fillRect(X0, Y, W, 6);
        x.fillStyle = T.l; x.fillRect(X0, Y + 1, W, 1);
        x.fillStyle = T.m; x.fillRect(X0, Y + 2, W, 2);
        x.fillStyle = T.s; x.fillRect(X0, Y + 4, W, 1);
        for (const cx of [X0, X0 + W - 3]) { x.fillStyle = T.d; x.fillRect(cx, Y + 6, 3, 3); x.fillStyle = T.m; x.fillRect(cx + 1, Y + 6, 1, 2); }
        x.fillStyle = "rgba(0,0,0,0.3)"; x.fillRect(X0, Y + 6, W, 2);
    }
    // Soot above where a lantern burns (the theme says whether its lamps leave soot, or the lantern does).
    function drawSoot(x, o) {
        if (!(o.soot === undefined || o.soot === null ? TH.soot : o.soot) || o.lamp === false) return;
        const st = lampStyle(o); if (st === "hang" || st === "floor") return;
        // (a candle: a faint smudge over the sconce's, on the wall; nothing over the rest, standing or hanging clear of it)
        if (CANDLES[st]) { if (st !== "sconce") return; const L = lampAt(st), gr = x.createRadialGradient(o.x + 8, o.y + L.gy - 10, 1, o.x + 8, o.y + L.gy - 10, 10); gr.addColorStop(0, "rgba(0,0,0,0.3)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(o.x - 4, o.y + L.gy - 22, 24, 24); return; }
        if (st === "oil") { const gr = x.createRadialGradient(o.x + 8, o.y - 6, 1, o.x + 8, o.y - 6, 13); gr.addColorStop(0, "rgba(0,0,0,0.4)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(o.x - 6, o.y - 20, 28, 28); return; }
        const gr = x.createRadialGradient(o.x + 8, o.y - 18, 2, o.x + 8, o.y - 18, 22); gr.addColorStop(0, "rgba(0,0,0,0.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(o.x - 16, o.y - 44, 48, 48);
    }
    // Any of the things behind Scout, drawn where it stands.
    function drawBackObject(x, a, o) {
        switch (o.type) {
            case "sign": x.drawImage(spr("sign", 0), o.x, o.y); break;
            case "prop": { const img = propImg(o); if (img) x.drawImage(img, o.x, o.y); break; }
            case "post": drawPost(x, o); break;
            case "brace": drawBrace(x, o); break;
            case "cleat": drawCleat(x, o); break;
            case "chain": drawChain(x, o); break;
            case "hangrope": drawHangRope(x, o); break;
            case "ycap": drawYCap(x, o); break;
            case "shaftbeam": drawShaftBeam(x, o); break;
            case "setcap": drawSetCap(x, o); break;
            case "torch": drawSoot(x, o); break;
        }
    }
    // Every piece of support the old rules would give a map, as objects; and where each stands (no lantern goes there).
    function autoSupports(a, only) {
        const out = [], blockers = [];
        if (TH.supports === false) return { out, blockers };
        const solidT = (tx, ty) => tileAtIn(a, tx, ty) === "#" || tileAtIn(a, tx, ty) === "%";
        if (!only) {
            const seen = new Uint8Array(a.w * a.h);
            const post = (tx, fromY) => {
                let y = fromY; while (y < a.h && !solidT(tx, y) && tileAtIn(a, tx, y) !== "=") y++;
                if (y - fromY < 1 || y - fromY > 12) return;
                // (23 Oct 2026) down to the floor as drawn under it: a slope's line, not the wall under the slope
                const X = tx * TS + 5, top = fromY * TS, bot = floorUnder(a, X - 1, X + 7, top, 12);
                if (bot === null || bot - top < 8) return;
                blockers.push({ x: X - 10, y: top, w: 22, h: bot - top });
                out.push({ type: "post", x: X - 1, y: top, h: bot - top, knees: true });
            };
            for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) {
                if (!solidT(tx, ty) || seen[ty * a.w + tx]) continue;
                // one block of wall: does it reach the map's edge?
                const cells = [], st = [[tx, ty]]; seen[ty * a.w + tx] = 1; let edge = false;
                while (st.length) {
                    const [cx, cy] = st.pop(); cells.push([cx, cy]);
                    if (cx === 0 || cy === 0 || cx === a.w - 1 || cy === a.h - 1) edge = true;
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && solidT(nx, ny) && !seen[ny * a.w + nx]) { seen[ny * a.w + nx] = 1; st.push([nx, ny]); } }
                }
                if (edge) continue;
                // posts under its two ends
                const bottom = {};
                for (const [cx, cy] of cells) if (!solidT(cx, cy + 1)) bottom[cx] = Math.max(bottom[cx] || 0, cy);
                const cols = Object.keys(bottom).map(Number).sort((p1, p2) => p1 - p2);
                if (!cols.length) continue;
                for (const c of [cols[0], cols[cols.length - 1]]) post(c, bottom[c] + 1);
            }
        }
        // and every platform on what suits it: see PLATFORM SUPPORTS
        for (const run of beamRuns(a)) if (!only || only(run)) platformSupports(a, run, solidT, out, blockers);
        return { out, blockers };
    }

    /* SUPPORT AREAS (21 Oct 2026, the owner's: "Make it possible for me to draw areas that need supports drawn in
       them automatically, like under floating walls"; of the questions: live, for floating walls and platforms, in
       full timber sets). A box in the editor; in it, every stretch of wall whose underside is over open air is
       propped up by timber sets (a cap beam along the underside, a post at each end down to whatever is under it,
       knee braces from the posts up into the cap where there is room), a set to every five tiles or less of a long
       stretch, and every platform with nothing holding it gets what the old rules gave one (posts, braces, chains:
       PLATFORM SUPPORTS). Worked out each time the passage is built, so it follows the walls as they are drawn;
       where the level's own pieces already hold a wall or a platform, nothing more is added. A stretch with no
       floor within twelve tiles under either end, or over spikes, is left. */
    /* WHERE TIMBER MEETS THE ROCK (23 Oct 2026, the owner's: "Bring the Support Area Box up to date ... to properly
       incorporate slopes and sloped ceilings"): at a column of pixels x, the first floor at or below y (the top of a wall,
       a platform, or a slope's line where it is drawn: round(y - 0.5), as the slope is), and the first rock's underside
       at or above y (a wall's foot, or a ceiling slope's line). null past reach tiles, or onto spikes. */
    const SOLID_SUP = c => c === "#" || c === "%" || c === "2";
    function floorAt(a, x, y, reach) {
        const tx = Math.floor(x / TS), i = x - tx * TS;
        for (let ty = Math.floor(y / TS); ty < a.h && ty * TS - y <= reach * TS; ty++) {
            const c = tileAtIn(a, tx, ty), S = SLOPES[c], C = CEILS[c];
            let s = null;
            if (c === "^") return null;
            if (SOLID_SUP(c) || c === "=") s = ty * TS;
            else if (S) s = ty * TS + Math.round(slopeY(S, i + 0.5) - 0.5);
            else if (C && slopeY(C, i + 0.5) > 0.5) s = ty * TS;
            if (s !== null && s >= y) return s;
        }
        return null;
    }
    function roofAt(a, x, y, reach) {
        const tx = Math.floor(x / TS), i = x - tx * TS;
        for (let ty = Math.floor((y - 1) / TS); ty >= 0 && y - (ty + 1) * TS <= reach * TS; ty--) {
            const c = tileAtIn(a, tx, ty), S = SLOPES[c], C = CEILS[c];
            let s = null;
            if (SOLID_SUP(c)) s = (ty + 1) * TS;
            else if (C) s = ty * TS + Math.round(slopeY(C, i + 0.5) - 0.5);
            else if (S && slopeY(S, i + 0.5) < TS - 0.5) s = (ty + 1) * TS;
            if (s !== null && s <= y) return s;
        }
        return null;
    }
    // under a span of columns: the lowest floor (where a post stands on a slope its foot goes into the rock, never short of it)
    const floorUnder = (a, x0, x1, y, reach) => { let m = -1; for (let x = x0; x <= x1; x++) { const f = floorAt(a, x, y, reach); if (f === null) return null; m = Math.max(m, f); } return m; };
    function supportAreaPieces(a) {
        const out = [], solidT = (tx, ty) => { const c = tileAtIn(a, tx, ty); return c === "#" || c === "%"; };
        const inArea = (tx, ty) => a.supportAreas.some(z => tx * TS + 8 >= z.x && tx * TS + 8 < z.x + z.w && ty * TS + 8 >= z.y && ty * TS + 8 < z.y + z.h);
        const own = a.backObjs.filter(o => o.type === "post" || o.type === "ycap" || o.type === "brace" || o.type === "chain" || o.type === "hangrope" || o.type === "cleat" || o.type === "setcap");
        const wHeld = (x0, x1, y) => own.some(o => (o.type === "post" || o.type === "ycap" || o.type === "setcap") && o.x < x1 && o.x + (o.w || 8) > x0 && o.y >= y - 2 && o.y <= y + 12);
        /* a set under the underside u (its row of pixels from X0): the cap along it, a post at each end down to the floor
           under it, the knee braces between. Where the underside slopes, the cap follows it column by column (prof), and
           every piece meets it at its highest over its own width (the rock covers the rest of it): posts first, then the
           braces, then the cap over their tops (for a level one, the same picture as before) */
        const set = (X0, u, s0, s1) => {
            const x0 = s0 * TS + 1, x1 = (s1 + 1) * TS - 1, at = x => u[x - X0], hi = (p, q) => { let m = 1e9; for (let x = p; x <= q; x++) m = Math.min(m, at(x)); return m; };
            const y = hi(x0, x1);
            if (wHeld(x0, x1, y)) return;
            if (s0 === s1) {
                const cy = hi(s0 * TS + 4, s0 * TS + 11), f = floorUnder(a, s0 * TS + 4, s0 * TS + 12, cy + 8, 12);
                if (f === null) return;
                out.push({ type: "ycap", x: s0 * TS + 4, y: cy }, { type: "post", x: s0 * TS + 4, y: cy + 8, h: f - cy - 8, foot: true });
                return;
            }
            const tl = hi(x0 + 1, x0 + 9) + 7, tr = hi(x1 - 9, x1 - 1) + 7;
            const fl = floorUnder(a, x0 + 1, x0 + 9, tl, 12), fr = floorUnder(a, x1 - 9, x1 - 1, tr, 12);
            if (fl === null || fr === null) return;
            const prof = []; let flat = true;
            for (let x = x0; x < x1; x++) { prof.push(at(x)); if (at(x) !== y) flat = false; }
            const cap = flat ? { type: "setcap", x: x0, y, w: x1 - x0 } : { type: "setcap", x: x0, y, w: x1 - x0, prof };
            if (flat) out.push(cap);   // (level: drawn first, as it always was; sloped: last, over the tops it meets)
            out.push({ type: "post", x: x0 + 1, y: tl, h: fl - tl, foot: true }, { type: "post", x: x1 - 9, y: tr, h: fr - tr, foot: true });
            /* knee braces (21 Oct 2026, the owner's: "The diagonal supports ... don't line up properly"): each from right
               under the cap down at 45 degrees to land on its post's inner face (L the left post's, R the right's), as
               long as the span lets them be, up to twelve */
            const L = x0 + 8, R = x1 - 9, len = Math.min(12, Math.floor((R - L - 1) / 2) - 1);
            if (len >= 6) out.push({ type: "brace", x: L + len, y: hi(L + len, L + len + 3) + 7, len, dir: -1 }, { type: "brace", x: R - len, y: hi(R - len - 3, R - len) + 7, len, dir: 1 });
            if (!flat) out.push(cap);
        };
        /* the undersides: a wall's foot over open air, or a ceiling slope (its own tile's underside), linked end to end
           where they meet (a flat one runs on into a ceiling slope and out of it into the next, a row lower or higher), so
           one stretch of rock overhead is one run however it slopes; each tile's underside at its ends (uL, uR) and in
           each column */
        const edge = (tx, ty) => {
            if (tx < 0 || tx >= a.w || ty < 0 || ty >= a.h - 1) return null;
            const c = tileAtIn(a, tx, ty), C = CEILS[c], below = tileAtIn(a, tx, ty + 1);
            if (C) return !solidT(tx, ty + 1) && (inArea(tx, ty) || inArea(tx, ty + 1)) ? { tx, ty, uL: ty * TS + C.yL, uR: ty * TS + C.yR, u: i => ty * TS + Math.round(slopeY(C, i + 0.5) - 0.5) } : null;
            if (solidT(tx, ty) && !solidT(tx, ty + 1) && below !== "=" && !CEILS[below] && inArea(tx, ty + 1)) return { tx, ty, uL: (ty + 1) * TS, uR: (ty + 1) * TS, u: () => (ty + 1) * TS };
            return null;
        };
        const next = (e, dx) => { for (const dy of [0, -1, 1]) { const n = edge(e.tx + dx, e.ty + dy); if (n && (dx > 0 ? n.uL === e.uR : n.uR === e.uL)) return n; } return null; };
        const taken = new Set();
        for (let ty = 0; ty < a.h - 1; ty++) for (let tx = 0; tx < a.w; tx++) {
            const e0 = edge(tx, ty);
            if (!e0 || taken.has(tx + "," + ty) || next(e0, -1)) continue;   // (a run is taken from its left end)
            const run = [e0]; taken.add(tx + "," + ty);
            for (let n = next(e0, 1); n && !taken.has(n.tx + "," + n.ty); n = next(n, 1)) { run.push(n); taken.add(n.tx + "," + n.ty); }
            const X0 = run[0].tx * TS, u = [];
            for (const e of run) for (let i = 0; i < TS; i++) u.push(e.u(i));
            const n = run.length, k = Math.ceil(n / 5);
            for (let i = 0; i < k; i++) set(X0, u, run[Math.floor(i * n / k)].tx, run[Math.floor((i + 1) * n / k) - 1].tx);
        }
        // the platforms with nothing holding them
        for (const run of beamRuns(a)) {
            if (!inArea(Math.floor((run.tx + run.end) / 2), run.ty)) continue;
            const x0 = run.tx * TS, x1 = (run.end + 1) * TS, top = run.ty * TS, under2 = top + PLAT_H;
            const held = own.some(o => {
                const ox = o.x, ow = o.w || (o.type === "brace" ? 1 : 8), across = ox < x1 + 2 && ox + ow > x0 - 2;
                if (o.type === "post" || o.type === "ycap") return across && o.y >= under2 - 1 && o.y <= under2 + 10;
                if (o.type === "brace") return across && Math.abs(o.y - under2) <= 2;
                if (o.type === "chain" || o.type === "hangrope") return across && Math.abs(o.y + o.h - (top + 2)) <= 3;
                if (o.type === "cleat") return (Math.abs(o.x - x0) <= 4 || Math.abs(o.x + 3 - x1) <= 4) && o.y > under2 && o.y < under2 + 30;
                return false;
            });
            if (!held) platformSupports(a, run, solidT, out, []);
        }
        return out;
    }
    // A timber set's cap: a beam along the underside of the rock it holds up, its ends' grain showing
    function drawSetCap(x, o) {
        const T = timberPal(), X0 = o.x, Y = o.y, W = o.w;
        /* (23 Oct 2026) under a sloped underside: the same beam, a column at a time at the rock's own height there (prof),
           reaching 2 px up into the rock behind it (a joint's curve lifts the underside a pixel or two) */
        if (o.prof) {
            for (let i = 0; i < W; i++) {
                const X = X0 + i, Yi = o.prof[i] === undefined ? Y : o.prof[i], inner = i > 0 && i < W - 1;
                x.fillStyle = T.d; x.fillRect(X, Yi - 2, 1, 9);
                if (inner) { x.fillStyle = T.l; x.fillRect(X, Yi + 1, 1, 1); x.fillStyle = T.m; x.fillRect(X, Yi + 2, 1, 3); x.fillStyle = T.s; x.fillRect(X, Yi + 5, 1, 1); }
                if (i === 1 || i === 2 || i === W - 3 || i === W - 2) { x.fillStyle = T.q; x.fillRect(X, Yi + 2, 1, 3); if (i === 1 || i === W - 3) { x.fillStyle = T.s; x.fillRect(X, Yi + 3, 1, 1); } }
                x.fillStyle = "rgba(0,0,0,0.3)"; x.fillRect(X, Yi + 7, 1, 2);
            }
            if (TH.wearPiece) TH.wearPiece(x, "shaftbeam", o);
            return;
        }
        x.fillStyle = T.d; x.fillRect(X0, Y, W, 7);
        x.fillStyle = T.l; x.fillRect(X0 + 1, Y + 1, W - 2, 1);
        x.fillStyle = T.m; x.fillRect(X0 + 1, Y + 2, W - 2, 3);
        x.fillStyle = T.s; x.fillRect(X0 + 1, Y + 5, W - 2, 1);
        for (const ex of [X0 + 1, X0 + W - 3]) { x.fillStyle = T.q; x.fillRect(ex, Y + 2, 2, 3); x.fillStyle = T.s; x.fillRect(ex, Y + 3, 1, 1); }
        x.fillStyle = "rgba(0,0,0,0.3)"; x.fillRect(X0, Y + 7, W, 2);
        if (TH.wearPiece) TH.wearPiece(x, "shaftbeam", o);
    }
    // Each run of beam tiles, end to end, with whether a wall meets either end.
    function beamRuns(a) {
        if (a._runs) return a._runs;
        const runs = a._runs = [], solidT = (tx, ty) => tileAtIn(a, tx, ty) === "#" || tileAtIn(a, tx, ty) === "%";
        for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) {
            if (tileAtIn(a, tx, ty) !== "=" || tileAtIn(a, tx - 1, ty) === "=") continue;
            let end = tx; while (tileAtIn(a, end + 1, ty) === "=") end++;
            runs.push({ tx, end, ty, wallL: solidT(tx - 1, ty), wallR: solidT(end + 1, ty) });
        }
        return runs;
    }

    /* A PLATFORM (13 Oct 2026, its third drawing: "darker and more detailed
       ... top notch"; the deck redone the same day, clean). Built, not a
       plank: a deck of thick dark boards shading smoothly down from a pale
       worn edge, only a faint tone-on-tone grain, the boards butted at soft
       bevelled seams with a dull nail either side; under it a heavier,
       darker bearer, set back from the ends; iron straps riveted round both
       every so often; end grain, its rings, where a board is cut. Eleven
       pixels deep; Scout stands on its top edge, the tile's top. Used on the
       title too. */
    const PLAT_H = 11;
    function platform(x, X, Y, W, opt) {
        if (TH.platform) return TH.platform(x, X, Y, W, opt || {}, helpers());
        return woodPlatform(x, X, Y, W, opt);
    }
    function woodPlatform(x, X, Y, W, opt) {
        const P = ART.pal, o = opt || {}, seed = o.seed || 0;
        const hs = (i, k) => hashTile(seed * 31 + i, k);
        const bx0 = X + (o.left ? 0 : 3), bx1 = X + W - (o.right ? 0 : 3);   // the bearer, set back where an end is free
        // THE BEARER, under the deck
        x.fillStyle = P.k; x.fillRect(bx0, Y + 5, bx1 - bx0, 6);
        x.fillStyle = P[7]; x.fillRect(bx0 + 1, Y + 6, bx1 - bx0 - 2, 1);
        x.fillStyle = P[6]; x.fillRect(bx0 + 1, Y + 7, bx1 - bx0 - 2, 3);
        for (let i = 0; i < bx1 - bx0 - 4; i += 4) if (hs(i, 7) < 0.35) { x.fillStyle = P[7]; x.fillRect(bx0 + 2 + i, Y + 8 + (hs(i, 8) < 0.5 ? 0 : 1), Math.min(4 + Math.floor(hs(i, 9) * 6), bx1 - bx0 - 4 - i), 1); }
        // THE DECK
        x.fillStyle = P.k; x.fillRect(X, Y, W, 6);
        x.fillStyle = P.A; x.fillRect(X + 1, Y + 1, W - 2, 1);                // the worn top edge
        x.fillStyle = P[9]; x.fillRect(X + 1, Y + 2, W - 2, 1);
        x.fillStyle = P[8]; x.fillRect(X + 1, Y + 3, W - 2, 1);
        x.fillStyle = "#4a2c16"; x.fillRect(X + 1, Y + 4, W - 2, 1);   // shading down, not a line
        // grain: faint streaks a shade off the board's own colour, nothing brighter than the edge
        // (13 Oct 2026: the scuffs and knots read as mess, the black joints as cuts)
        for (let i = 3; i < W - 6; i += 4) {
            const gq = hs(i, 2);
            if (gq < 0.22) { x.fillStyle = gq < 0.11 ? "#65401f" : "#4a2c16"; x.fillRect(X + i, Y + (gq < 0.11 ? 2 : 3), Math.min(4 + Math.floor(gq * 20), W - 6 - i), 1); }
        }
        // the boards' joints: a soft seam, bevelled at the top, a dull nail either side
        const step = 34 + Math.floor(hs(0, 4) * 14);
        for (let j = 14 + Math.floor(hs(0, 5) * 16); j < W - 8; j += step) {
            x.fillStyle = "#4a2c16"; x.fillRect(X + j, Y + 2, 1, 3);
            x.fillStyle = P[9]; x.fillRect(X + j, Y + 1, 1, 1);
            // a hung platform is nailed; one that stands is pegged with wooden dowels
            x.fillStyle = o.hung ? P.j : P[6]; x.fillRect(X + j - 2, Y + 3, 1, 1); x.fillRect(X + j + 2, Y + 3, 1, 1);
        }
        // IRON STRAPS round deck and bearer, riveted: only on a platform that hangs (13 Oct 2026)
        // (23 Oct 2026, the owner's: "it should be symmetrical") spaced evenly about its middle, each in the middle of its share, not every 32 from the left
        const nS = Math.max(1, Math.round(W / 32)), L = [];
        // (a strap is five pixels wide, from sx - 1: where each starts, the left half placed and the right half its mirror)
        for (let i = 0; i < nS; i++) L[i] = i < nS / 2 ? Math.round(W * (i + 0.5) / nS - 2.5) : W - 5 - L[nS - 1 - i];
        if (nS % 2) L[(nS - 1) / 2] = Math.floor((W - 5) / 2);
        const straps = o.hung ? L.map(s => s + 1) : [];
        for (const sx of straps) {
            const SX = X + sx;
            if (SX < bx0 + 1 || SX + 3 > bx1 - 1) continue;
            x.fillStyle = P.i; x.fillRect(SX - 1, Y, 5, PLAT_H);
            x.fillStyle = P.j; x.fillRect(SX, Y + 1, 3, PLAT_H - 2);
            x.fillStyle = P.m; x.fillRect(SX, Y + 1, 1, PLAT_H - 2);
            x.fillStyle = P.n; x.fillRect(SX + 1, Y + 2, 1, 1); x.fillRect(SX + 1, Y + 8, 1, 1);
        }
        // END GRAIN where a board is cut
        for (const [ex, free] of [[X, !o.left], [X + W - 5, !o.right]]) {
            if (!free) continue;
            x.fillStyle = P.k; x.fillRect(ex, Y, 5, 6);
            x.fillStyle = P[8]; x.fillRect(ex + 1, Y + 1, 3, 4);
            x.fillStyle = P[7]; x.fillRect(ex + 1, Y + 1, 3, 1); x.fillRect(ex + 1, Y + 4, 3, 1); x.fillRect(ex + 1, Y + 2, 1, 2); x.fillRect(ex + 3, Y + 2, 1, 2);
            x.fillStyle = P[9]; x.fillRect(ex + 2, Y + 2, 1, 2);
        }
    }

    /* THE RIGS THE MOVING PLATFORMS HANG FROM (16 Oct 2026, the owner's: "have
       the up and down ones being lifted by a crane ... make the left and right
       moving platforms be on a similar device to ... the steamworks factory
       ... themed to the mine ... the best quality you possibly can so
       immersion isn't broken"). Worked out from where the platform goes and
       what is round it, never from the level's own objects, so no level
       changes for it:
         ACROSS: an overhead runway beam the length of the run (a squared
           timber capped with an iron rail, or an iron girder), hung from the
           roof on straps or, out under the sky, carried on two posts; an end
           stop at each end of the travel; a trolley riding it, two flanged
           wheels turning as it goes behind a riveted cheek plate, a hook
           block under it, and a sling of rope or chain down to each end of
           the deck.
         UP AND DOWN: a crane: a headframe beam under the roof (or on two
           braced posts in the open), a sheave in an iron yoke under it,
           turning as the rope runs; the lift line down to a spreader bar
           over head height, and from the bar's ends straight down to the
           deck; the hauling line along the beam to a winch drum at its end,
           turning with it.
       Each zone has a rig of its own materials (TH.rig): the Mine's timber
       and hemp below; the zones file gives the rest. Everything that does not
       move is drawn once and kept (rigCache). */
    const RIG_MINE = {
        beam: "timber", line: "rope",
        wood: ["#1a0f08", "#3a2210", "#55331a", "#74482a", "#96633a", "#b88350"],   // outline, dark, shade, body, light, edge
        iron: ["#0e0e12", "#23232b", "#44444f", "#74748a", "#b2b2c4"],                 // outline, dark, body, light, glint
        rope: ["#5c3f19", "#946d34", "#c9a160", "#ecd29a"]                              // groove, shade, body, light
    };
    const rigCache = new Map();
    const rigSolid = (a, tx, ty) => { const c = tileAtIn(a, tx, ty); return c === "#" || c === "%" || c === "X" || c === "V" || c === "8" || c === "9"; };
    // the underside of whatever is above (px, py), within so many tiles, or null
    function rigRoof(a, px, py, tiles) { const tx = Math.floor(px / TS); for (let ty = Math.floor(py / TS), n = 0; ty >= 0 && n < tiles; ty--, n++) if (rigSolid(a, tx, ty)) return (ty + 1) * TS; return null; }
    // the top of whatever is below, within so many tiles, or null
    function rigFloor(a, px, py, tiles) { const tx = Math.floor(px / TS); for (let ty = Math.floor(py / TS), n = 0; ty < a.h && n < tiles; ty++, n++) if (rigSolid(a, tx, ty) || tileAtIn(a, tx, ty) === "=") return ty * TS; return null; }
    function rigOf(m, a, R) {
        if (m.kind === "v" && m.crane === "none") return null;   // (23 Oct 2026: crane "none", the level dresses it itself)
        const W = m.w || 48, X = Math.round(m.x), Y = Math.round(m.y);
        // (a group's headframe once for them all, keyed by every lift in it; 23 Oct 2026)
        const key = m.cg ? "cg|" + m.cg.members.map(q => [q.x0, q.x1, q.y0, q.y1, Math.round(q.x), q.w || 48, q.pair ? 1 : 0].join(",")).join(";") + "|" + ZK
            : [m.kind, m.x0, m.x1, m.y0, m.y1, m.kind === "h" ? Y : X, W, m.crane || "", ZK].join("|")
              + (m.crane === "compact" ? "|" + (a.movers || []).filter(q => q !== m && Math.abs(q.x - m.x) < 120).map(q => Math.round(q.x)).join(",") : "");   // (its gallows' side goes by its neighbours)
        let rig = rigCache.get(key);
        if (!rig) {
            rig = m.kind === "h" ? rigAcross(a, m, R, W, Y) : m.cg ? rigGroup(a, m.cg.spots, m.cg.top, R, m.cg.links) : m.crane === "compact" ? rigCompact(a, m, R, W, X) : rigUpDown(a, m, R, W, X);
            rigCache.set(key, rig); if (rigCache.size > 400) rigCache.delete(rigCache.keys().next().value);
        }
        return rig;
    }
    const craneIdx = m => (m.cg ? m.cg.members.indexOf(m) : 0);   // (which of its headframe's lifts, left to right)
    // the parts that never move, drawn behind the doors, the ledges and the other platforms (a shared headframe by its first lift only)
    function rigBack(g2, m, a, R) { const rig = rigOf(m, a, R); if (!rig || craneIdx(m) > 0) return; g2.drawImage(rig.c, rig.ox, rig.oy); }
    function rigMover(g2, m, a, R) {
        const W = m.w || 48, X = Math.round(m.x), Y = Math.round(m.y), rig = rigOf(m, a, R);
        if (m.kind === "h") trolley(g2, rig, R, X, Y, W, m.x); else if (rig) crane(g2, rig, R, X, Y, W, m.y, m, a);
        platform(g2, X, Y, W, { seed: m.tx * 7 + (m.ty || 0), left: false, right: false, hung: Boolean(rig), run: { held: R.line === "chain" ? "chains" : "ropes" } });
    }
    // a picture to draw the still parts into, in map pixels
    function rigCanvas(x0, y0, x1, y1) {
        const c = document.createElement("canvas"); c.width = Math.max(1, x1 - x0); c.height = Math.max(1, y1 - y0);
        const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
        return { c, x, ox: x0, oy: y0, F: (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px - x0, py - y0, w, h); } };
    }
    /* A BEAM along y = top, from x0 to x1: a squared timber with an iron rail
       along its top (the trolley's wheels ride the rail), or an I-girder.
       Lit from the top left like everything else; its ends cut square. */
    function rigBeam(F, R, x0, x1, top) {
        if (R.beam === "girder") {
            const I = R.iron, frost = R.frost;
            for (const [dy, col] of [[0, I[0]], [1, I[4]], [2, I[3]], [3, I[0]], [4, I[1]], [5, I[2]], [6, I[2]], [7, I[1]], [8, I[0]], [9, I[3]], [10, I[2]], [11, I[0]]]) F(x0, top + dy, x1 - x0, 1, col);
            // the web's stiffeners and the flanges' rivets
            for (let x = x0 + 6; x < x1 - 4; x += 12) { F(x, top + 4, 1, 4, I[3]); F(x + 1, top + 4, 1, 4, I[0]); F(x - 3, top + 1, 1, 1, I[0]); F(x + 3, top + 10, 1, 1, I[0]); }
            F(x0, top, 1, 12, I[0]); F(x1 - 1, top, 1, 12, I[0]);
            if (frost) for (let x = x0 + 1; x < x1 - 1; x++) { const hs = hashTile(x, top); F(x, top - (hs < 0.3 ? 1 : 0), 1, 1, frost[0]); if (hs > 0.8) { const n = 2 + Math.floor(hashTile(top, x) * 5); for (let j = 0; j < n; j++) F(x, top + 12 + j, 1, 1, j === n - 1 ? frost[0] : frost[1]); } }
            if (R.gild) for (let x = x0 + 3; x < x1 - 3; x += 8) F(x, top + 5, 2, 2, R.gild);
            return { bottom: top + 12, rail: top };
        }
        const T = R.wood, I = R.iron;
        // the rail: an iron strap the wheels run on, spiked down every so often
        F(x0, top - 2, x1 - x0, 1, I[0]); F(x0, top - 1, x1 - x0, 1, I[3]);
        F(x0, top, x1 - x0, 1, T[0]);
        F(x0, top + 1, x1 - x0, 1, T[5]); F(x0, top + 2, x1 - x0, 1, T[4]);
        F(x0, top + 3, x1 - x0, 4, T[3]); F(x0, top + 7, x1 - x0, 1, T[2]); F(x0, top + 8, x1 - x0, 1, T[1]); F(x0, top + 9, x1 - x0, 1, T[0]);
        // grain along it, and checks (splits) here and there
        for (let x = x0 + 2; x < x1 - 4; x += 3) { const hs = hashTile(x, top * 3 + 1); if (hs < 0.32) F(x, top + 3 + Math.floor(hs * 12) % 4, Math.min(3 + Math.floor(hs * 14), x1 - 2 - x), 1, hs < 0.12 ? T[2] : T[4]); }
        for (let x = x0 + 9; x < x1 - 6; x += 18) { F(x, top - 2, 2, 1, I[1]); F(x, top - 1, 1, 1, I[4]); }
        // its square-cut ends, end grain showing
        for (const ex of [x0, x1 - 3]) { F(ex, top, 3, 10, T[0]); F(ex + 1, top + 1, 1, 8, T[2]); F(ex + 1, top + 3, 1, 1, T[4]); F(ex + 1, top + 6, 1, 1, T[4]); }
        return { bottom: top + 10, rail: top - 2 };
    }
    /* a strap hanging the beam from the roof: bolted to the roof by a plate,
       down to the BACK of the beam (drawn first, so the beam hides its foot),
       so the trolley's wheels run clear past it on the rail */
    function rigHanger(F, R, x, roof, top) {
        const I = R.iron;
        F(x - 4, roof, 9, 3, I[0]); F(x - 3, roof, 7, 1, I[3]); F(x - 3, roof + 1, 7, 1, I[2]); F(x - 2, roof + 1, 1, 1, I[4]); F(x + 2, roof + 1, 1, 1, I[4]);
        F(x - 1, roof + 3, 3, top + 6 - roof - 3, I[0]); F(x, roof + 3, 1, top + 6 - roof - 3, I[2]);
        for (let y = roof + 6; y < top - 4; y += 6) F(x, y, 1, 1, I[3]);
    }
    // a post standing on the floor up to the beam, with a knee brace under the beam
    function rigPost(F, R, x, top, floor, side) {
        const T = R.beam === "girder" ? [R.iron[0], R.iron[1], R.iron[2], R.iron[2], R.iron[3], R.iron[4]] : R.wood;
        F(x - 3, top, 7, floor - top, T[0]); F(x - 2, top, 1, floor - top, T[5]); F(x - 1, top, 3, floor - top, T[3]); F(x + 2, top, 1, floor - top, T[2]);
        for (let y = top + 4; y < floor - 2; y += 9) { const hs = hashTile(x, y); if (hs < 0.4) F(x - 1 + Math.floor(hs * 6) % 3, y, 1, 3, T[2]); }
        F(x - 4, floor - 3, 9, 3, T[0]); F(x - 3, floor - 2, 7, 1, T[4]);
        for (let i = 0; i < 12; i++) { const bx = x + side * (4 + i), by = top + 14 - i; F(bx, by - 1, 1, 1, T[0]); F(bx, by, 1, 1, T[4]); F(bx, by + 1, 1, 2, T[3]); F(bx, by + 3, 1, 1, T[0]); }
    }
    // rope or chain, straight from (x0, y0) to (x1, y1), two pixels thick
    function rigLine(g2, R, x0, y0, x1, y1) {
        const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        if (R.line === "chain") {
            const I = R.iron;
            for (let i = 0; i <= n; i += 3) { const px = Math.round(x0 + (x1 - x0) * i / n), py = Math.round(y0 + (y1 - y0) * i / n); g2.fillStyle = I[0]; g2.fillRect(px - 1, py - 1, 3, 3); g2.fillStyle = (i / 3) % 2 ? I[2] : I[3]; g2.fillRect(px, py, 1, 1); }
            return;
        }
        const C = R.rope;
        for (let i = 0; i <= n; i++) {
            const px = Math.round(x0 + (x1 - x0) * i / n), py = Math.round(y0 + (y1 - y0) * i / n), tw = (i >> 1) % 2;
            g2.fillStyle = tw ? C[2] : C[1]; g2.fillRect(px, py, 1, 1); g2.fillStyle = tw ? C[1] : C[3]; g2.fillRect(px + 1, py, 1, 1);
        }
    }
    // an iron wheel, its spokes turned by spin
    function rigWheel(g2, I, cx, cy, r, spin) {
        for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy + 0.5)); g2.fillStyle = I[0]; g2.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
        for (let dy = -r + 1; dy <= r - 1; dy++) { const w = Math.round(Math.sqrt((r - 1) * (r - 1) - dy * dy + 0.5)); g2.fillStyle = dy < 0 ? I[3] : I[2]; g2.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
        if (r >= 4) for (let dy = -r + 2; dy <= r - 2; dy++) { const w = Math.round(Math.sqrt((r - 2) * (r - 2) - dy * dy + 0.5)); g2.fillStyle = I[1]; g2.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
        for (let k = 0; k < (r >= 4 ? 3 : 2); k++) { const an = spin + k * Math.PI * 2 / (r >= 4 ? 3 : 2); for (let s = 1; s < r - (r >= 4 ? 1 : 0); s++) { g2.fillStyle = I[3]; g2.fillRect(Math.round(cx + Math.cos(an) * s), Math.round(cy + Math.sin(an) * s), 1, 1); } }
        g2.fillStyle = I[0]; g2.fillRect(cx - 1, cy - 1, 3, 3); g2.fillStyle = I[4]; g2.fillRect(cx, cy, 1, 1);
    }

    function rigAcross(a, m, R, W, Y) {
        const cxA = Math.min(m.x0, m.x1) + W / 2, cxB = Math.max(m.x0, m.x1) + W / 2;
        // the roof over the run: the lowest point of it, so the beam clears it everywhere
        let roofLow = null, any = false;
        for (let x = cxA - 16; x <= cxB + 16; x += 8) { const r = rigRoof(a, x, Y - 1, 9); if (r !== null) { any = true; roofLow = roofLow === null ? r : Math.max(roofLow, r); } }
        const deep = R.beam === "girder" ? 12 : 10;
        /* (16 Oct 2026) up out of Scout's jumps: tight under the roof when there is
           one, else higher than he can reach, so nothing looks like a ledge he passes through */
        let top = any ? roofLow + (R.beam === "girder" ? 0 : 2) : Y - 84;
        top = Math.min(top, Y - 34);
        // the beam's ends: past the stops, or into the wall that meets it
        let x0 = Math.floor(cxA - 26), x1 = Math.ceil(cxB + 26), wallL = false, wallR = false;
        for (let x = Math.floor(cxA); x >= x0; x--) if (rigSolid(a, Math.floor(x / TS), Math.floor((top + 4) / TS))) { x0 = x + 1; wallL = true; break; }
        for (let x = Math.ceil(cxB); x <= x1; x++) if (rigSolid(a, Math.floor(x / TS), Math.floor((top + 4) / TS))) { x1 = x; wallR = true; break; }
        const open = !any;
        const posts = [];
        if (open) for (const [px, side] of [[x0 + 5, 1], [x1 - 6, -1]]) { const fl = rigFloor(a, px, top + deep + 2, 16); if (fl !== null) posts.push([px, fl, side]); }
        const hangers = [];
        if (!open) {
            const n = Math.max(1, Math.round((x1 - x0) / 56));
            for (let i = 0; i <= n; i++) {
                const hx = Math.round(x0 + 8 + (x1 - x0 - 16) * i / n);
                if ((i === 0 && wallL) || (i === n && wallR)) continue;
                const r = rigRoof(a, hx, top - 3, 14);
                if (r !== null && r <= top - 3) hangers.push([hx, r]);
            }
        }
        const yTop = Math.min(top - 8, ...hangers.map(h2 => h2[1])), yBot = Math.max(top + deep + 16, ...posts.map(p => p[1]));
        const K = rigCanvas(x0 - 20, yTop, x1 + 20, yBot + 1);
        for (const [px, fl, side] of posts) rigPost(K.F, R, px, top, fl, side);
        for (const [hx, r] of hangers) rigHanger(K.F, R, hx, r, top);
        const b = rigBeam(K.F, R, x0, x1, top);
        return { c: K.c, ox: K.ox, oy: K.oy, top, bottom: b.bottom, rail: b.rail };
    }
    function trolley(g2, rig, R, X, Y, W, mx) {
        const I = R.iron, cx = Math.round(X + W / 2), spin = mx / 3, wy = rig.rail - 4;
        const F = (px, py, w, h, col) => { g2.fillStyle = col; g2.fillRect(px, py, w, h); };
        // two flanged wheels riding the rail, turning as it goes; from each axle an iron hanger down the front of the beam
        // to the crossbar under it, the hook block hung from its middle (trolleyBody)
        const hb = rig.bottom + 2;
        trolleyBody(g2, R, cx, wy, wy, hb, spin);
        const ay = Math.min(hb + 11, Y - 4);
        rigLine(g2, R, cx - 1, ay, X + 3, Y); rigLine(g2, R, cx, ay, X + W - 5, Y);
        // the shackles at the deck's ends
        for (const sx of [X + 3, X + W - 5]) { F(sx - 1, Y - 3, 4, 3, I[0]); F(sx, Y - 3, 2, 1, I[3]); }
    }
    // the trolley's iron: its two wheels (each at its own height: one may have jumped the rail), their hangers down to the crossbar at hb, the hook block under it
    function trolleyBody(g2, R, cx, wyL, wyR, hb, spin) {
        const I = R.iron, F = (px, py, w, h, col) => { g2.fillStyle = col; g2.fillRect(px, py, w, h); };
        rigWheel(g2, I, cx - 6, wyL, 4, spin); rigWheel(g2, I, cx + 6, wyR, 4, spin);
        for (const [ax, wy] of [[cx - 6, wyL], [cx + 6, wyR]]) {
            F(ax - 2, wy - 1, 5, hb - wy + 2, I[0]); F(ax - 1, wy, 3, hb - wy, I[2]); F(ax - 1, wy, 1, hb - wy, I[3]);
            F(ax - 1, wy - 1, 3, 3, I[0]); F(ax, wy, 1, 1, I[4]);
            F(ax, hb - 3, 1, 1, I[4]);
        }
        F(cx - 9, hb, 19, 5, I[0]); F(cx - 8, hb + 1, 17, 1, I[3]); F(cx - 8, hb + 2, 17, 2, I[2]);
        F(cx - 7, hb + 2, 1, 1, I[4]); F(cx + 7, hb + 2, 1, 1, I[4]);
        F(cx - 3, hb + 5, 7, 5, I[0]); F(cx - 2, hb + 5, 5, 1, I[3]); F(cx - 2, hb + 6, 5, 3, I[1]); F(cx - 1, hb + 7, 3, 1, I[3]);
        F(cx - 1, hb + 10, 3, 2, I[0]);
    }

    /* A BROKEN CRANE (17 Oct 2026, the owner's: "a scenery item that is the
       crane of the moving left and right platform, but broken, make 3
       variants, one only slightly damaged, one falling apart, and one with a
       platform partly broken off hanging/swinging"). Only to look at: Scout
       passes behind it. o.x, o.y are the left end of its runway and the top
       of its beam, o.w the runway's length; built of the zone's rig (TH.rig)
       and held up as the working ones are, by straps from the roof above or,
       out in the open, on two posts.
         worn   neglected, but whole: one strap snapped, the rail rusted and
                lifting off its spikes, a split along the beam; the trolley
                parked near the end and cobwebbed, its slings cut and frayed,
                no deck.
         ruin   falling apart: the beam broken through, each half dropped at
                the break, splintered, the rail torn off one half and curling;
                the straps between snapped; the trolley half off its rail, a
                sling trailing; grit still falling from the break.
         swing  the trolley over the middle and its deck half gone: one sling
                snapped, the deck hanging by the other from its last corner,
                broken off below, swinging. */
    const wreckCache = new Map();
    const WRECK_H = { worn: 50, ruin: 56, swing: 88 }, WRECK_LIFT_H = { worn: 64, ruin: 72, swing: 122 };
    function wreckBox(o) { const k = o.kind === "ruin" || o.kind === "swing" ? o.kind : "worn"; return { x: Math.round(o.x), y: Math.round(o.y) - 6, w: Math.max(48, Math.round(o.w || 112)), h: (o.rig === "updown" ? WRECK_LIFT_H : WRECK_H)[k] }; }
    const RUST = ["#5a2c14", "#7a3e1c", "#9a5228"];
    // the end of a rope (frayed) or a chain (an open link) cut or snapped at (px, py)
    function lineEnd(g2, R, px, py) {
        if (R.line !== "chain") return fray(g2, px, py, true);
        const I = R.iron; g2.fillStyle = I[0]; g2.fillRect(px - 1, py, 3, 4); g2.fillStyle = I[3]; g2.fillRect(px - 1, py + 1, 1, 2); g2.fillStyle = I[2]; g2.fillRect(px + 1, py + 1, 1, 1);
    }
    // a strap from the roof snapped part way: the top half still bolted up, its torn end bent; a stub left on the beam
    function snapStrap(F, R, x, roof, top, q) {
        const I = R.iron, end = Math.round(roof + 3 + (top - roof - 3) * (0.3 + q * 0.3)), s = q < 0.5 ? 1 : -1;
        F(x - 4, roof, 9, 3, I[0]); F(x - 3, roof, 7, 1, I[3]); F(x - 3, roof + 1, 7, 1, I[2]); F(x - 2, roof + 1, 1, 1, I[4]); F(x + 2, roof + 1, 1, 1, I[4]);
        if (end > roof + 3) { F(x - 1, roof + 3, 3, end - roof - 3, I[0]); F(x, roof + 3, 1, end - roof - 3, I[2]); }
        for (let y = roof + 6; y < end - 3; y += 6) F(x, y, 1, 1, I[3]);
        F(x - 1 + s, end, 3, 3, I[0]); F(x + s, end, 1, 2, I[2]); F(x + 2 * s, end + 2, 1, 2, I[0]); F(x + s, end + 3, 1, 1, I[0]); F(x + s, end + 1, 1, 1, RUST[2]);
        F(x - 1, top - 6, 3, 12, I[0]); F(x, top - 5, 1, 11, I[2]); F(x + (s > 0 ? -1 : 1), top - 7, 1, 1, I[0]); F(x, top - 3, 1, 1, I[4]); F(x, top - 5, 1, 1, RUST[2]);
    }
    // age on a stretch of beam: rust on the iron, and for the worn one a split and a length of rail come up off its spikes
    function beamWear(TF, tx, R, xa, xb, top, kind, hs) {
        const girder = R.beam === "girder", T = R.wood, I = R.iron, deep = girder ? 12 : 10, much = kind === "swing" ? 0.08 : kind === "worn" ? 0.16 : 0.24;
        const rail = girder ? top + 1 : top - 1;
        for (let x = xa + 2; x < xb - 2; x++) {
            const q = hs(x, 11);
            if (q < much) { TF(x, rail, q < much / 2 ? 2 : 1, 1, RUST[q < much / 3 ? 2 : 1]); if (girder && q < much / 2) { TF(x, top + 4 + Math.floor(q * 40) % 4, 2, 2, RUST[1]); const n = 1 + Math.floor(q * 30) % 4; for (let j = 0; j < n; j++) TF(x, top + deep + j, 1, 1, j === n - 1 ? RUST[0] : RUST[1]); } }
        }
        if (kind !== "worn") return;
        const L = xb - xa;
        if (!girder) {
            // the split, along the grain
            const sx = xa + Math.round(L * 0.28), sl = Math.min(20, Math.round(L * 0.2));
            TF(sx, top + 5, sl, 1, T[0]); TF(sx + 2, top + 4, sl - 4, 1, T[2]); TF(sx + sl, top + 6, 3, 1, T[0]); TF(sx - 2, top + 4, 2, 1, T[0]);
            // a length of rail lifted off its spikes, bowed up
            const rx = xa + Math.round(L * 0.66), rl = 13;
            tx.clearRect(rx, top - 2, rl, 2);
            for (let i = 0; i < rl; i++) { const up = Math.round(Math.sin(Math.PI * i / (rl - 1)) * 2); TF(rx + i, top - 2 - up, 1, 1, I[0]); TF(rx + i, top - 1 - up, 1, 1, i % 4 === 1 ? RUST[1] : I[3]); if (up > 0) TF(rx + i, top - 1, 1, 1, "rgba(0,0,0,0)"); }
            TF(rx + 3, top - 1, 1, 1, I[1]); TF(rx + 9, top - 1, 1, 1, I[1]);
        } else {
            // the bottom flange bent down where something heavy came off it
            const bx = xa + Math.round(L * 0.62);
            for (let i = 0; i < 9; i++) { const dn = Math.round(Math.sin(Math.PI * i / 8) * 2); TF(bx + i, top + 9 + dn, 1, 3, I[2]); TF(bx + i, top + 11 + dn, 1, 1, I[0]); TF(bx + i, top + 9 + dn, 1, 1, I[3]); }
        }
    }
    // a beam broken off at ex (dir 1: at its right end, -1: its left): bitten back unevenly, pale where the wood tore (bright where the iron did), splinters standing out; peel: the rail torn up off it and curling back
    function breakEnd(TF, tx, R, ex, top, dir, hs, peel) {
        const girder = R.beam === "girder", T = R.wood, I = R.iron, y1 = girder ? top + 12 : top + 10;
        const pale = girder ? I[4] : T[5], fresh = girder ? I[3] : T[4], dark = girder ? I[0] : T[0];
        for (let y = top; y < y1; y += 2) {
            const d = 3 + Math.floor(hs(y, 3) * 6);
            if (dir > 0) tx.clearRect(ex - d, y, d + 14, 2); else tx.clearRect(ex - 14, y, d + 14, 2);
            const fx = dir > 0 ? ex - d - 1 : ex + d;
            TF(fx, y, 1, 2, fresh);
            const q = hs(y, 9);
            if (y > top && y < y1 - 2 && q < 0.5) { const L = 2 + Math.floor(q * 9), dy = q < 0.2 ? 1 : 0; for (let i = 1; i <= L; i++) { TF(fx + dir * i, y + dy, 1, 1, i === L ? fresh : pale); TF(fx + dir * i, y + dy + 1, 1, 1, dark); } }
        }
        if (girder) return;
        // the rail: torn where the beam broke
        const rd = 4 + Math.floor(hs(1, 4) * 4);
        if (dir > 0) tx.clearRect(ex - rd, top - 2, rd + 14, 2); else tx.clearRect(ex - 14, top - 2, rd + 14 + (peel ? 10 : 0), 2);
        if (peel && dir < 0) {
            // pulled up off the beam and curling back over it
            const x0 = ex + rd + 10;
            for (let i = 0; i <= 14; i++) { const px = x0 - i, py = top - 2 - Math.round(i * i / 18); TF(px, py, 1, 1, I[0]); TF(px, py + 1, 1, 1, i % 5 === 2 ? RUST[1] : I[3]); TF(px, py + 2, 1, 1, I[0]); }
            for (const sx of [ex + rd + 3, ex + rd + 8]) TF(sx, top - 1, 1, 1, I[1]);
        }
    }
    /* a crane's iron yoke (for its sheave or its winch) down from a beam's underside, at (bottomAt(x)) all
       along it, so it sits tight under a beam that has dropped; broken: its right cheek snapped short */
    function craneYoke(F, I, x, bottomAt, broken) {
        for (let px = x - 9; px <= x + 9; px++) { const b = bottomAt(px); F(px, b, 1, 2, I[0]); if (px > x - 9 && px < x + 9) F(px, b, 1, 1, I[3]); }
        const bl = bottomAt(x - 8), br = bottomAt(x + 8);
        F(x - 9, bl, 3, 12, I[0]); F(x - 8, bl, 1, 11, I[3]);
        if (!broken) { F(x + 7, br, 3, 12, I[0]); F(x + 8, br, 1, 11, I[2]); return; }
        F(x + 7, br, 3, 5, I[0]); F(x + 8, br, 1, 4, I[2]); F(x + 9, br + 5, 1, 1, I[0]); F(x + 8, br + 4, 1, 1, I[4]);
    }
    // rope or chain gone slack from (x0, y0) to (x1, y1), hanging sag pixels in the middle
    function sagLine(g2, R, x0, y0, x1, y1, sag) {
        const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 4));
        let px = x0, py = y0;
        for (let i = 1; i <= n; i++) { const t = i / n, qx = Math.round(x0 + (x1 - x0) * t), qy = Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)); rigLine(g2, R, px, py, qx, qy); px = qx; py = qy; }
    }
    // the still parts of a broken crane, drawn once (in the drawing's own sense: mirrored on the map when o.flip)
    function wreckArt(o, a) {
        const R = TH.rig || RIG_MINE;
        const w = Math.max(48, Math.round(o.w || 112)), X0 = Math.round(o.x), top = Math.round(o.y), X1 = X0 + w;
        const kind = o.kind === "ruin" || o.kind === "swing" ? o.kind : "worn", flip = !!o.flip, sd = (o.seed || 0) * 97 + X0 * 7 + top * 3, lift = o.rig === "updown";
        const key = [X0, top, w, kind, flip, sd, lift, ZK, a.w, a.h].join("|");
        let art = wreckCache.get(key); if (art) return art;
        const hs = (i, k) => hashTile(sd + i * 13, k * 7 + 5);
        const mx = x => (flip ? X0 + X1 - x : x);
        const girder = R.beam === "girder", deep = girder ? 12 : 10, I = R.iron;
        const rail0 = girder ? top : top - 2, bottom0 = top + deep;
        // what holds it up: straps from the roof, or out in the open two posts
        const n = Math.max(1, Math.round(w / 56)), hx = [];
        for (let i = 0; i <= n; i++) hx.push(Math.round(X0 + 8 + (w - 16) * i / n));
        const roofs = hx.map(x => { const r = rigRoof(a, mx(x), top - 3, 14); return r !== null && r <= top - 3 ? r : null; });
        const open = roofs.every(r => r === null);
        const posts = open ? [[X0 + 5, 1], [X1 - 6, -1]].map(([px, side]) => [px, rigFloor(a, mx(px), bottom0 + 2, 16), side]).filter(p => p[1] !== null) : [];
        // the beam in pieces: [from, to, the point it hangs from, its slope, broken at its left, broken at its right]
        const bx = lift ? X0 + 45 : X0 + Math.round(w * 0.56), pivL = open ? X0 + 5 : hx[0], pivR = open ? X1 - 6 : hx[n];
        const pieces = kind === "ruin" ? [[X0, bx - 2, pivL, 0.14, false, true], [bx + 3, X1, pivR, lift ? -0.4 : -0.5, true, false]] : [[X0, X1, X0, 0, false, false]];
        const pieceOf = x => pieces.find(p => x >= p[0] && x < p[1]) || pieces[x < bx ? 0 : pieces.length - 1];
        const off = x => { const p = pieceOf(x); return Math.round((x - p[2]) * p[3]); };
        const yTop = Math.min(top - 18, ...roofs.filter(r => r !== null)), yBot = Math.max(top + (lift ? 140 : 100), ...posts.map(p => p[1] + 1));
        const ox = X0 - 24, oy = yTop, c = document.createElement("canvas"); c.width = w + 48; c.height = yBot - yTop;
        const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.translate(-ox, -oy);
        const F = (px, py, ww, hh, col) => { x.fillStyle = col; x.fillRect(px, py, ww, hh); };
        for (const [px, fl, side] of posts) rigPost(F, R, px, top + off(px), fl, side);
        hx.forEach((h, i) => {
            const r = roofs[i]; if (r === null) return;
            const snapped = (kind === "worn" && n >= 2 && i === 1) || (kind === "ruin" && h > pivL + 8 && h < pivR - 8);
            if (snapped) snapStrap(F, R, h, r, top + off(h), hs(i, 1)); else rigHanger(F, R, h, r, top + off(h));
        });
        for (const [xa, xb, piv, slope, brL, brR] of pieces) {
            const pad = 14, tc = document.createElement("canvas"); tc.width = xb - xa + pad * 2; tc.height = deep + 34;
            const tx = tc.getContext("2d"); tx.translate(-(xa - pad), -(top - 18));
            const TF = (px, py, ww, hh, col) => { tx.fillStyle = col; if (col === "rgba(0,0,0,0)") tx.clearRect(px, py, ww, hh); else tx.fillRect(px, py, ww, hh); };
            rigBeam(TF, R, xa, xb, top);
            beamWear(TF, tx, R, xa, xb, top, kind, hs);
            if (brL) breakEnd(TF, tx, R, xa, top, -1, hs, true);
            if (brR) breakEnd(TF, tx, R, xb, top, 1, hs, false);
            // laid in, a column at a time, each dropped as far as the piece has sagged there
            for (let px = xa - pad; px < xb + pad; px++) x.drawImage(tc, px - (xa - pad), 0, 1, tc.height, px, top - 18 + Math.round((px - piv) * slope), 1, tc.height);
        }
        const art2 = { c, ox, oy, kind, X0, X1, sd, R, hook: null, dust: [] };
        if (lift) {
            /* the up-and-down crane: the lift under its sheave, the winch at the far end (the right, before any mirroring)
                 worn   the crank snapped off, the haul line slack between them, the lift line cut short; a cobweb by the winch
                 ruin   the winch's end of the headframe fallen, the sheave dropped half out of its broken yoke, the line run off it and trailing
                 swing  the spreader bar still on its line but tipped, one drop line snapped, the deck broken and swinging from the other */
            const cx = X0 + 26, sx = cx + 6, dxm = Math.min(X1 - 10, cx + 36);
            const sb = bottom0 + off(sx), db = bottom0 + off(dxm), sv = { x: sx, y: sb + 9 }, dr = { x: dxm, y: db + 9 };
            const under = px => bottom0 + off(px);
            craneYoke(F, I, sx, under, kind === "ruin");
            craneYoke(F, I, dxm, under, false);
            if (kind === "worn") {
                sagLine(x, R, sv.x, sv.y - 6, dr.x - 6, dr.y - 6, 7);
                rigWheel(x, I, sv.x, sv.y, 6, 0.7); craneDrum(x, R, dr.x, dr.y, 2.1, 3);
                rigLine(x, R, sv.x - 6, sv.y, sv.x - 7, sv.y + 24); lineEnd(x, R, sv.x - 7, sv.y + 24);
                x.drawImage(spr("web", 0), dxm + 10, db);
            } else if (kind === "ruin") {
                const wy = sv.y + 4;
                rigLine(x, R, sv.x - 6, wy - 1, sv.x - 9, wy + 34); lineEnd(x, R, sv.x - 9, wy + 34);
                sagLine(x, R, sv.x + 5, wy - 5, dr.x - 6, dr.y - 6, 10);
                rigWheel(x, I, sv.x - 1, wy, 6, 1.9); craneDrum(x, R, dr.x, dr.y, 0.4, 0);
                art2.dust = [[bx - 4, bottom0 + off(bx - 4)], [bx + 6, bottom0 + off(bx + 6)]];
            } else {
                rigLine(x, R, sv.x, sv.y - 6, dr.x - 6, sv.y - 6);
                rigWheel(x, I, sv.x, sv.y, 6, 0.3); craneDrum(x, R, dr.x, dr.y, 1.2, 9);
                art2.hook = { x: sv.x - 6, y: sv.y, lift: true };
            }
        } else if (kind === "worn") {
            // parked at the end, its slings cut
            const cx = X0 + 24, wy = rail0 - 4, hb = bottom0 + 2, ay = hb + 11;
            trolleyBody(x, R, cx, wy, wy, hb, 0.5);
            // not moved in years: a cobweb in the corner between its hanger and the beam
            x.drawImage(spr("web", 0), cx + 9, bottom0);
            rigLine(x, R, cx - 1, ay, cx - 3, ay + 17); lineEnd(x, R, cx - 3, ay + 17);
            rigLine(x, R, cx, ay, cx + 2, ay + 9); lineEnd(x, R, cx + 2, ay + 9);
        } else if (kind === "ruin") {
            // run down to the left half's end, the far wheel off the rail
            const cx = X0 + 24, wyL = rail0 - 4 + off(cx - 6), wyR = rail0 - 4 + off(cx + 6) + 5, hb = bottom0 + off(cx) + 4, ay = hb + 11;
            trolleyBody(x, R, cx, wyL, wyR, hb, 1.1);
            rigLine(x, R, cx - 1, ay, cx - 4, ay + 21); lineEnd(x, R, cx - 4, ay + 21);
            art2.dust = [[bx - 4, bottom0 + off(bx - 4)], [bx + 6, bottom0 + off(bx + 6)]];
        } else {
            const cx = X0 + Math.round(w / 2), wy = rail0 - 4, hb = bottom0 + 2;
            trolleyBody(x, R, cx, wy, wy, hb, 0.3);
            art2.hook = { x: cx, y: hb + 11 };
        }
        wreckCache.set(key, art2); if (wreckCache.size > 60) wreckCache.delete(wreckCache.keys().next().value);
        return art2;
    }
    // the swinging one's deck: a whole deck broken off two-thirds along, an iron shackle on its one good end
    function wreckDeck(A) {
        if (A.deck) return A.deck;
        const W = 48, keep = 36, M = 7, c = document.createElement("canvas"); c.width = W + M * 2; c.height = PLAT_H + M * 2;
        const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
        platform(x, M, M, W, { seed: A.sd % 53, left: false, right: false });
        const top = x.getImageData(M + 10, M + 1, 1, 1).data, pale = `rgb(${Math.min(255, top[0] + 40)},${Math.min(255, top[1] + 34)},${Math.min(255, top[2] + 26)})`, dark = "#1a0f08";
        const hs = (i, k) => hashTile(A.sd + i * 5, k * 11 + 2);
        for (let y = M - 1; y < M + PLAT_H; y += 2) {
            const end = M + keep + Math.floor(hs(y, 1) * 8) - 3;
            const px = x.getImageData(end - 1, y, 1, 1).data;
            x.clearRect(end, y, c.width, 2);
            if (px[3] > 0) { x.fillStyle = pale; x.fillRect(end - 1, y, 1, 2); }
            const q = hs(y, 2);
            if (y > M && y < M + PLAT_H - 2 && q < 0.5 && px[3] > 0) { const L = 2 + Math.floor(q * 8); for (let i = 0; i < L; i++) { x.fillStyle = pale; x.fillRect(end + i, y, 1, 1); x.fillStyle = dark; x.fillRect(end + i, y + 1, 1, 1); } }
        }
        const I = A.R.iron;
        x.fillStyle = I[0]; x.fillRect(M + 1, M - 4, 5, 5); x.fillStyle = I[3]; x.fillRect(M + 2, M - 4, 3, 1); x.fillStyle = I[2]; x.fillRect(M + 2, M - 3, 1, 2); x.fillRect(M + 4, M - 3, 1, 2); x.fillStyle = "#000"; x.fillRect(M + 3, M - 3, 1, 2);
        return (A.deck = { c, ax: M + 3, ay: M - 3, data: x.getImageData(0, 0, c.width, c.height).data, turned: new Map() });
    }
    // the deck turned about its shackle by beta (radians from lying flat), pixel for pixel from the drawn one, kept for each angle
    function deckTurned(A, beta) {
        const D = wreckDeck(A), k = Math.round(beta * 100);
        let r = D.turned.get(k); if (r) return r;
        const b = k / 100, cs = Math.cos(b), sn = Math.sin(b), sw = D.c.width, sh = D.c.height;
        const pts = [[0, 0], [sw, 0], [0, sh], [sw, sh]].map(([u, v]) => { const du = u - D.ax, dv = v - D.ay; return [du * cs - dv * sn, du * sn + dv * cs]; });
        const minX = Math.floor(Math.min(...pts.map(p => p[0]))) - 1, maxX = Math.ceil(Math.max(...pts.map(p => p[0]))) + 1;
        const minY = Math.floor(Math.min(...pts.map(p => p[1]))) - 1, maxY = Math.ceil(Math.max(...pts.map(p => p[1]))) + 1;
        const c = document.createElement("canvas"); c.width = maxX - minX; c.height = maxY - minY;
        const x = c.getContext("2d"), out = x.createImageData(c.width, c.height);
        for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
            const vx = px + minX + 0.5, vy = py + minY + 0.5;
            const u = Math.floor(D.ax + vx * cs + vy * sn), v = Math.floor(D.ay - vx * sn + vy * cs);
            if (u < 0 || v < 0 || u >= sw || v >= sh) continue;
            const i = (v * sw + u) * 4; if (D.data[i + 3] < 128) continue;
            const j = (py * c.width + px) * 4; out.data[j] = D.data[i]; out.data[j + 1] = D.data[i + 1]; out.data[j + 2] = D.data[i + 2]; out.data[j + 3] = 255;
        }
        x.putImageData(out, 0, 0);
        r = { c, dx: minX, dy: minY }; D.turned.set(k, r); if (D.turned.size > 80) D.turned.delete(D.turned.keys().next().value);
        return r;
    }
    function drawWreck(o) {
        const A = wreckArt(o, act), t = frameNo;
        g.save();
        if (o.flip) { g.translate(A.X0 + A.X1, 0); g.scale(-1, 1); }
        g.drawImage(A.c, A.ox, A.oy);
        if (A.kind === "swing" && A.hook.lift) {
            // the spreader bar on the lift line, tipped toward the end still carrying; the deck from that end, swinging
            const R = A.R, I = R.iron, T = R.beam === "girder" ? null : R.wood;
            const ph = (A.sd % 100) * 0.07, a1 = 0.07 * Math.sin(t * 0.03 + ph), a2 = 0.16 * Math.sin(t * 0.03 + ph - 0.7);
            const hx = A.hook.x, hy = A.hook.y, Cx = Math.round(hx + Math.sin(a1) * 20), Cy = Math.round(hy + Math.cos(a1) * 20);
            rigLine(g, R, hx, hy, Cx, Cy - 4);
            const th = 0.85 + a1 * 1.5, half = 19, cs = Math.cos(th), sn = Math.sin(th);
            const E1x = Math.round(Cx - cs * half), E1y = Math.round(Cy + sn * half), E2x = Math.round(Cx + cs * half), E2y = Math.round(Cy - sn * half);
            const ex = E2x - 1 + Math.round(Math.sin(a1 * 2) * 3);
            rigLine(g, R, E2x - 1, E2y + 2, ex, E2y + 11); lineEnd(g, R, ex, E2y + 11);
            for (let i = -half; i <= half; i++) { const px = Math.round(Cx + i * cs), py = Math.round(Cy - i * sn); g.fillStyle = T ? T[0] : I[0]; g.fillRect(px, py - 1, 1, 5); g.fillStyle = T ? T[4] : I[3]; g.fillRect(px, py, 1, 1); g.fillStyle = T ? T[2] : I[2]; g.fillRect(px, py + 1, 1, 2); }
            g.fillStyle = I[0]; g.fillRect(Cx - 2, Cy - 5, 5, 5); g.fillStyle = I[3]; g.fillRect(Cx - 1, Cy - 5, 3, 1);
            const Px = Math.round(E1x + Math.sin(a2 * 0.6) * 12), Py = E1y + 13;
            rigLine(g, R, E1x, E1y + 2, Px, Py - 1);
            const D = deckTurned(A, 1.26 + a2);
            g.drawImage(D.c, Px + D.dx, Py + D.dy);
        } else if (A.kind === "swing") {
            // hung from the hook by its one sling, swinging; the snapped one swinging with it
            const ph = (A.sd % 100) * 0.07, a1 = 0.09 * Math.sin(t * 0.034 + ph), a2 = 0.16 * Math.sin(t * 0.034 + ph - 0.7);
            const hx = A.hook.x, hy = A.hook.y, Lr = 17, Px = Math.round(hx + Math.sin(a1) * Lr), Py = Math.round(hy + Math.cos(a1) * Lr);
            const sa = a1 * 1.4 + 0.3, ex = Math.round(hx + 1 + Math.sin(sa) * 10), ey = Math.round(hy + Math.cos(sa) * 10);
            rigLine(g, A.R, hx + 1, hy, ex, ey); lineEnd(g, A.R, ex, ey);
            rigLine(g, A.R, hx, hy, Px, Py - 1);
            // held by one top corner, it hangs with its middle under the shackle: its length about 18 degrees off straight down
            const D = deckTurned(A, 1.26 + a2);
            g.drawImage(D.c, Px + D.dx, Py + D.dy);
        } else if (A.kind === "ruin" && state.mode !== "paused") {
            // grit still coming down from the break now and then
            A.dust.forEach(([dx, dy], i) => {
                for (let k = 0; k < 2; k++) {
                    const per = 170 + 50 * k + 30 * i, f = (t + i * 61 + k * 97 + A.sd) % per;
                    if (f > 54) continue;
                    g.fillStyle = A.R.beam === "girder" ? RUST[1] : "rgba(196,150,96,0.85)";
                    g.fillRect(dx + k * 3 - 1 + (f > 30 ? 1 : 0), dy + 1 + Math.round(f * f * 0.014), 1, 1);
                }
            });
        }
        g.restore();
    }

    /* AN UP-AND-DOWN CRANE'S PLACE (23 Oct 2026, pulled out of rigUpDown so lifts side by side can be put under one
       headframe): over a lift, where its beam goes (top: under the roof, or high on posts in the open) and which side its
       winch is on (the side with room, unless the level says: crane "left" or "right"). */
    function craneSpot(a, m) {
        const W = m.w || 48, X = Math.round(m.x), cx = Math.round(X + W / 2), yTopTravel = Math.min(m.y0, m.y1);
        let roofLow = null;
        for (let x = cx - 12; x <= cx + 12; x += 6) { const r = rigRoof(a, x, yTopTravel - 1, 12); if (r !== null) roofLow = roofLow === null ? r : Math.max(roofLow, r); }
        const open = roofLow === null;
        let top = open ? yTopTravel - 54 : Math.min(roofLow + 6, yTopTravel - 30);
        if (!open && top < roofLow) top = roofLow;
        const roomR = !rigSolid(a, Math.floor((cx + 44) / TS), Math.floor((top + 4) / TS));
        const side = m.crane === "left" ? -1 : m.crane === "right" ? 1 : roomR ? 1 : -1;
        return { m, X, W, cx, top, roofLow, open, side, yTopTravel };
    }
    /* LIFTS SIDE BY SIDE (23 Oct 2026, the owner's: "2 up and down platforms directly next to each other, but the chunky top
       part overlaps awfully"; of the ideas, 1, 3 and 4). Lifts whose cranes would overlap (their beams within a few pixels
       of each other, at heights within a tile and a half, nothing solid between) share one headframe: one beam over them
       all, a sheave over each, the winches at its two ends. Two side by side that are both marked "pair" are one linked
       pair (CRANE PAIRS, stepMovers): one rope over both sheaves, no winch, one going up as the other comes down; they may
       stand a little further apart. Worked out when the act is built (the editor's too); m.cg: its group. */
    function groupCranes(a) {
        const spots = a.movers.filter(m => m.kind === "v" && m.crane !== "compact" && m.crane !== "none").map(m => craneSpot(a, m)).sort((p, q) => p.cx - q.cx);
        const span = s => [s.cx - (s.side > 0 ? 26 : 44), s.cx + (s.side > 0 ? 44 : 26)];
        const fit = g => {
            let top = Math.min(...g.map(s => s.top));
            const roofs = g.filter(s => s.roofLow !== null).map(s => s.roofLow);
            if (roofs.length && top < Math.max(...roofs)) top = Math.max(...roofs);
            return top <= Math.min(...g.map(s => s.yTopTravel)) - 24 ? top : null;
        };
        const groups = [];
        let cur = null;
        for (const s of spots) {
            const l = cur && cur[cur.length - 1];
            let join = false;
            if (l && Math.abs(s.top - l.top) <= 24) {
                const near = span(l)[1] + 6 > span(s)[0] || (l.m.pair && s.m.pair && s.X - (l.X + l.W) <= 96);
                const t = near ? fit(cur.concat([s])) : null;
                let clear = t !== null;
                for (let x = l.cx; clear && x <= s.cx; x += 4) if (rigSolid(a, Math.floor(x / TS), Math.floor((t + 4) / TS))) clear = false;
                join = clear;
            }
            if (join) cur.push(s); else { cur = [s]; groups.push(cur); }
        }
        for (const m of a.movers) { m.cg = null; m.follow = null; }
        for (const g of groups) {
            if (g.length < 2) continue;
            // linked pairs within it: two neighbours both marked pair (each lift in one pair at most), left to right
            const links = [];
            for (let i = 0; i + 1 < g.length; i++) if (g[i].m.pair && g[i + 1].m.pair && !links.some(l => l[1] === i)) links.push([i, i + 1]);
            const cg = { members: g.map(s => s.m), spots: g, top: fit(g), links };
            for (const s of g) s.m.cg = cg;
            for (const [i, j] of links) {
                // the second follows the first, from the start: as far down its own travel as the first is up its
                const A = cg.members[i], B = cg.members[j], p = A.y1 > A.y0 ? (A.y - A.y0) / (A.y1 - A.y0) : 0;
                B.follow = A; B.y = B.y0 + (1 - p) * (B.y1 - B.y0);
            }
        }
    }
    // a lone crane: as it always was (a group of one)
    function rigUpDown(a, m, R, W, X) { return rigGroup(a, [craneSpot(a, m)], null, R, []); }
    /* The headframe over a group of lifts (spots, by cx; top: the group's, or the lone one's own): one beam from the first's
       left (its winch's side) to the last's right, cut short at a wall; posts under it in the open, at its ends and between
       lifts far apart; straps from the roof at its ends and between; a sheave in its yoke over each lift; a winch at each
       end (a lone crane's on its side), none for a linked pair. */
    function rigGroup(a, spots, groupTop, R, links) {
        const n = spots.length, L = spots[0], Rt = spots[n - 1], solo = n === 1, top = solo ? L.top : groupTop, deep = R.beam === "girder" ? 12 : 10;
        // which lifts are on a linked pair's rope (no winch), and so which ends need a winch at all: the nearer end of each other lift
        const linkedI = new Set(links.flat()), free = spots.map((s, i) => i).filter(i => !linkedI.has(i));
        const wantL = solo ? !linkedI.size : free.some(i => i < n / 2), wantR = !solo && free.some(i => i >= n / 2);
        const roofs = spots.filter(s => s.roofLow !== null).map(s => s.roofLow), roofLow = roofs.length ? Math.max(...roofs) : null, open = roofLow === null;
        const sideL = solo ? L.side : -1, sideR = solo ? L.side : 1;
        let x0 = L.cx - (solo ? (sideL > 0 ? 26 : 44) : wantL ? 44 : 26), x1 = Rt.cx + (solo ? (sideR > 0 ? 44 : 26) : wantR ? 44 : 26), wallL = false, wallR = false;
        for (let x = L.cx; x >= x0; x--) if (rigSolid(a, Math.floor(x / TS), Math.floor((top + 4) / TS))) { x0 = x + 1; wallL = true; break; }
        for (let x = Rt.cx; x <= x1; x++) if (rigSolid(a, Math.floor(x / TS), Math.floor((top + 4) / TS))) { x1 = x; wallR = true; break; }
        // between two lifts far apart: a post (in the open) or a strap (under a roof) in the gap, where it is clear of both
        const mids = [];
        for (let i = 0; i + 1 < n; i++) { const p = spots[i], q = spots[i + 1], gap0 = p.X + p.W, gap1 = q.X; if (q.cx - p.cx > 70 && gap1 - gap0 >= 12) mids.push(Math.round((gap0 + gap1) / 2)); }
        const posts = [], hangers = [];
        if (open) {
            for (const [px, sd] of [[L.cx - 30, -1], [Rt.cx + 30, 1]]) { const fl = rigFloor(a, px, top + deep + 2, 20); if (fl !== null) posts.push([px, fl, -sd]); }
            for (const px of mids) { const fl = rigFloor(a, px, top + deep + 2, 20); if (fl !== null) posts.push([px, fl, 0]); }
        } else {
            for (const hx of [x0 + 7, x1 - 8]) { if ((hx < L.cx && wallL) || (hx > Rt.cx && wallR)) continue; if (top - roofLow > 3) hangers.push([hx, roofLow]); }
            for (const hx of mids) { const r = rigRoof(a, hx, top - 1, 12); if (r !== null && top - r > 3) hangers.push([hx, r]); }
        }
        const yTop = Math.min(top - 6, roofLow === null ? top - 6 : Math.min(...hangers.map(h => h[1]), roofLow)), yBot = Math.max(top + deep + 24, ...posts.map(p => p[1]));
        const K = rigCanvas(Math.min(x0, L.cx - 34) - 8, yTop, Math.max(x1, Rt.cx + 34) + 8, yBot + 1);
        for (const [px, fl, sd] of posts) rigPost(K.F, R, px, top, fl, sd);
        for (const [hx, r] of hangers) rigHanger(K.F, R, hx, r, top);
        const b = rigBeam(K.F, R, x0, x1, top);
        const I = R.iron, yoke = x => { K.F(x - 9, b.bottom, 19, 2, I[0]); K.F(x - 8, b.bottom, 17, 1, I[3]); K.F(x - 9, b.bottom, 3, 12, I[0]); K.F(x - 8, b.bottom, 1, 11, I[3]); K.F(x + 7, b.bottom, 3, 12, I[0]); K.F(x + 8, b.bottom, 1, 11, I[2]); };
        // the yokes the sheaves turn in: two iron cheeks down from the beam
        const parts = [];
        for (const s of spots) { const sheave = { x: s.cx + 6, y: b.bottom + 9 }; K.F(sheave.x - 9, b.bottom, 3, 12, I[0]); K.F(sheave.x - 8, b.bottom, 1, 11, I[3]); K.F(sheave.x + 7, b.bottom, 3, 12, I[0]); K.F(sheave.x + 8, b.bottom, 1, 11, I[2]); K.F(sheave.x - 9, b.bottom, 19, 2, I[0]); K.F(sheave.x - 8, b.bottom, 17, 1, I[3]); parts.push({ sheave }); }
        // the winches at the beam's ends: the first lift's at the left, the last's at the right (a lone one's on its side); between them,
        // each line runs along the beam to the nearer one
        if (solo) { const d = { x: sideL > 0 ? Math.min(x1 - 10, L.cx + 36) : Math.max(x0 + 10, L.cx - 36), y: b.bottom + 9 }; yoke(d.x); parts[0].drum = d; }
        else {
            const dL = wantL ? { x: Math.max(x0 + 10, L.cx - 36), y: b.bottom + 9 } : null, dR = wantR ? { x: Math.min(x1 - 10, Rt.cx + 36), y: b.bottom + 9 } : null;
            for (const d of [dL, dR]) if (d) yoke(d.x);
            for (const i of free) parts[i].drum = (i < n / 2 ? dL : dR) || dL || dR;
        }
        // (the parts by the lifts' order in the group, left to right: the picture is kept for the act's next build, whose lifts are new)
        return { c: K.c, ox: K.ox, oy: K.oy, top, bottom: b.bottom, sheave: parts[0].sheave, drum: parts[0].drum || null, side: sideL, parts, links };
    }
    /* A COMPACT CRANE (23 Oct 2026, crane "compact": for a tight spot): a sheave block in its yoke hung on an iron strap
       from the roof over the lift, or in the open on a gallows (a post to one side, an arm over the lift); no winch, the
       line over the sheave ending in a knotted tail. */
    function rigCompact(a, m, R, W, X) {
        const cx = Math.round(X + W / 2), yTopTravel = Math.min(m.y0, m.y1), I = R.iron;
        let roof = null;
        for (let x = cx; x <= cx + 12; x += 6) { const r = rigRoof(a, x, yTopTravel - 1, 12); if (r !== null) roof = roof === null ? r : Math.max(roof, r); }
        const sy = roof !== null ? Math.max(roof + 11, Math.min(yTopTravel - 40, roof + 26)) : yTopTravel - 40, sheave = { x: cx + 6, y: sy };
        // its gallows post on the side with room: not into a wall, nor beside another lift (its own crane's posts are there)
        const crowd = d => rigSolid(a, Math.floor((cx + d * 34) / TS), Math.floor(sy / TS)) || (a.movers || []).some(q => q !== m && q.obj !== m.obj && Math.abs(q.y0 - m.y0) < 160 && (d > 0 ? q.x < cx + 50 && q.x + (q.w || 48) > cx + 24 : q.x < cx - 24 && q.x + (q.w || 48) > cx - 50));
        const side = crowd(1) && !crowd(-1) ? -1 : 1, px = cx + side * 30;
        const fl = roof === null ? rigFloor(a, px, sy, 20) : null, armY = sy - 16;
        const K = rigCanvas(Math.min(cx - 20, px - 16), (roof !== null ? roof : armY) - 4, Math.max(cx + 26, px + 16), Math.max(sy + 14, fl || 0) + 1);
        if (roof !== null) { K.F(sheave.x - 4, roof, 9, 3, I[0]); K.F(sheave.x - 3, roof, 7, 1, I[3]); K.F(sheave.x - 1, roof + 3, 3, sy - 9 - roof - 3, I[0]); K.F(sheave.x, roof + 3, 1, sy - 9 - roof - 3, I[2]); }
        else if (fl !== null) { rigPost(K.F, R, px, armY, fl, -side); rigBeam(K.F, R, Math.min(px, sheave.x - 10), Math.max(px, sheave.x + 10), armY); }
        K.F(sheave.x - 9, sy - 9, 19, 2, I[0]); K.F(sheave.x - 8, sy - 9, 17, 1, I[3]); K.F(sheave.x - 9, sy - 9, 3, 12, I[0]); K.F(sheave.x - 8, sy - 9, 1, 11, I[3]); K.F(sheave.x + 7, sy - 9, 3, 12, I[0]); K.F(sheave.x + 8, sy - 9, 1, 11, I[2]);
        return { c: K.c, ox: K.ox, oy: K.oy, top: sy - 9, bottom: sy - 9, sheave, drum: null, side, compact: true };
    }
    // the winch drum end on at (dx0, dy0), turned by spin; its crank so long (under 9: snapped short, 0: gone at the axle)
    function craneDrum(g2, R, dx0, dy0, spin, crank) {
        const I = R.iron, F = (px, py, w, h, col) => { g2.fillStyle = col; g2.fillRect(px, py, w, h); };
        const C = R.line === "chain" ? [I[0], I[1], I[2], I[3]] : R.rope;
        for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
            const r2 = dx * dx + dy * dy;
            if (r2 > 52) continue;
            if (r2 > 42) { F(dx0 + dx, dy0 + dy, 1, 1, I[0]); continue; }
            // the coil: rings of line, lit from the top left, one ring in three a groove
            const r = Math.sqrt(r2), ring = Math.floor(r + spin * 0.6) % 3, lit = -(dx + dy) / (r || 1);
            if (r2 > 16) F(dx0 + dx, dy0 + dy, 1, 1, ring === 0 ? C[0] : lit > 0.3 ? C[3] : lit > -0.4 ? C[2] : C[1]);
        }
        rigWheel(g2, I, dx0, dy0, 4, -spin * 1.3);
        const ca = -spin * 1.3, kx = Math.round(dx0 + Math.cos(ca) * crank), ky = Math.round(dy0 + Math.sin(ca) * crank);
        for (let i = 0; i <= crank; i++) { const px = Math.round(dx0 + Math.cos(ca) * i), py = Math.round(dy0 + Math.sin(ca) * i); F(px, py, 1, 1, I[0]); F(px, py - 1, 1, 1, I[3]); }
        if (crank >= 9) { F(kx - 1, ky - 1, 3, 3, I[0]); F(kx, ky - 1, 1, 1, R.wood ? R.wood[5] : I[4]); F(kx, ky, 1, 1, R.wood ? R.wood[3] : I[3]); }
        else if (crank > 0) F(kx, ky, 1, 1, I[4]);
    }
    function crane(g2, rig, R, X, Y, W, my, m) {
        const I = R.iron, F = (px, py, w, h, col) => { g2.fillStyle = col; g2.fillRect(px, py, w, h); };
        // (23 Oct 2026) under a shared headframe, this lift's own sheave and winch; a linked pair's sheaves turn together, one rope
        const k = craneIdx(m), part = (rig.parts && rig.parts[k]) || rig, s = part.sheave, d = part.drum;
        const link = rig.links && rig.links.find(l => l[0] === k || l[1] === k), spin = (link && m.cg ? m.cg.members[link[0]].y : my) / 4;
        if (link) {
            // the one rope over both sheaves, along under the beam from the one to the other (the left one draws it)
            if (link[0] === k) { const o = rig.parts[link[1]].sheave; rigLine(g2, R, Math.min(s.x, o.x), s.y - 6, Math.max(s.x, o.x), s.y - 6); }
        } else if (d) {
            // the hauling line from over the sheave along under the beam to the drum
            rigLine(g2, R, Math.min(s.x, d.x) + (d.x > s.x ? 0 : 6), s.y - 6, Math.max(s.x, d.x) - (d.x > s.x ? 6 : 0), s.y - 6);
        } else if (rig.compact) {
            // no winch: the line over the sheave and down its far side a little, knotted off
            rigLine(g2, R, s.x + 6, s.y, s.x + 6, s.y + 13); F(s.x + 5, s.y + 13, 3, 3, (R.line === "chain" ? I : R.rope)[0]); F(s.x + 6, s.y + 13, 1, 1, (R.line === "chain" ? I : R.rope)[2]);
        }
        rigWheel(g2, I, s.x, s.y, 6, spin);
        /* the winch, seen end on as the sheave is: the coil of line wound round
           it (rope, or chain), the iron flange of its spool turning inside, and
           a crank on the axle going round with it (a shared one drawn by the first of its lifts) */
        if (d && !(rig.parts && rig.parts.findIndex(p => p.drum === d) !== k)) craneDrum(g2, R, d.x, d.y, spin, 9);
        // the lift line down to the spreader, over Scout's head; from its ends down to the deck
        const cx = Math.round(X + W / 2), spY = Math.max(s.y + 9, Y - 30);
        rigLine(g2, R, s.x - 6, s.y, s.x - 6, spY - 2);
        const bx0 = X + 2, bx1 = X + W - 3;
        if (Y - spY > 5) { rigLine(g2, R, bx0 + 1, spY + 3, X + 3, Y); rigLine(g2, R, bx1 - 2, spY + 3, X + W - 5, Y); }
        const T = R.beam === "girder" ? null : R.wood;
        F(bx0, spY, bx1 - bx0, 4, T ? T[0] : I[0]); F(bx0 + 1, spY + 1, bx1 - bx0 - 2, 1, T ? T[4] : I[3]); F(bx0 + 1, spY + 2, bx1 - bx0 - 2, 1, T ? T[2] : I[2]);
        F(s.x - 8, spY - 3, 5, 4, I[0]); F(s.x - 7, spY - 3, 3, 1, I[3]);
        for (const sx of [X + 3, X + W - 5]) { F(sx - 1, Y - 3, 4, 3, I[0]); F(sx, Y - 3, 2, 1, I[3]); }
        void cx;
    }

    /* PLATFORM SUPPORTS (13 Oct 2026: "it should be a mixture, some platforms
       could be supported by trusses and beams"). Each platform on what suits
       where it is, the same every time:
         - against a wall: a timber knee brace up from the wall to its
           underside, and a cleat where it meets the wall;
         - with a floor close beneath (and no spikes): posts down to it at
           either end, a knee brace each side; a short one on a single post
           with a Y of braces;
         - otherwise, from the roof: on chains, or now and then on ropes.
       (14 Oct 2026: as pieces, for the editor's "Add supports".) */
    function platformSupports(a, run, solidT, out, blockers) {
        const top = run.ty * TS, under = top + PLAT_H, len = run.end - run.tx + 1;
        const h = hashTile(run.tx * 3 + 1, run.ty * 7 + 2);
        /* (23 Oct 2026) the floor under a post, and the rock over a chain, where they are drawn (floorAt, roofAt): a slope's
           floor or a ceiling slope's underside as well as a wall's; a post's foot into the rock where it stands on a slope */
        const floorBelow = cx => floorUnder(a, cx - 4, cx + 4, under, 7);
        const roofAbove = cx => roofAt(a, cx, top, 14);
        const brace = (x0, y0, len2, dir) => out.push({ type: "brace", x: x0, y: y0, len: len2, dir });
        const post = (cx, yTop, yBot) => {
            const X = cx - 3;
            blockers.push({ x: X - 2, y: yTop, w: 10, h: yBot - yTop });
            out.push({ type: "post", x: X - 1, y: yTop, h: yBot - yTop, foot: true });
        };
        // AGAINST A WALL: knee braces from the wall
        if (run.wallL || run.wallR) {
            run.held = "wall";
            const reach = Math.min(22, len * TS - 6);
            if (run.wallL) { const wx = run.tx * TS; brace(wx + reach, under, reach, -1); out.push({ type: "cleat", x: wx, y: under + reach - 5, side: "L" }); }
            if (run.wallR) { const wx = (run.end + 1) * TS; brace(wx - reach - 1, under, reach, 1); out.push({ type: "cleat", x: wx - 3, y: under + reach - 5, side: "R" }); }
            return;
        }
        const lx0 = run.tx * TS + 8, rx0 = run.end * TS + 8, mx0 = Math.floor((run.tx * TS + (run.end + 1) * TS) / 2);
        const fL = floorBelow(lx0), fR = floorBelow(rx0), fM = floorBelow(mx0);
        const roofL = roofAbove(run.tx * TS + 4), roofR = roofAbove(run.end * TS + 11);
        const canPosts = len >= 3 ? (fL !== null && fR !== null) : fM !== null;
        const canHang = roofL !== null && roofR !== null;
        if (canPosts && (h < 0.55 || !canHang)) {
            run.held = "posts";
            if (len >= 3) {
                // POSTS at either end, a knee brace inward from each
                const lx = lx0, rx = rx0;
                post(lx, under, fL); post(rx, under, fR);
                brace(lx + 12, under, 9, -1); brace(rx - 13, under, 9, 1);   // (21 Oct 2026: the left one a pixel in, to meet its post)
            } else {
                // ONE POST in the middle, a Y of braces out to the ends
                const mx = mx0;
                post(mx, under + 8, fM);
                const arm = Math.min(10, Math.floor(len * TS / 2) - 2);
                brace(mx - arm, under, arm, 1); brace(mx + arm, under, arm, -1);
                out.push({ type: "ycap", x: mx - 4, y: under });
            }
            return;
        }
        if (!canHang) return;
        // FROM THE ROOF: chains, or now and then ropes
        const ropes = !TH.noRopes && h > 0.82;   // (14 Oct 2026) not in a zone of iron (noRopes)
        run.held = ropes ? "ropes" : "chains";
        for (const [cx, ry] of [[run.tx * TS + 4, roofL], [run.end * TS + 11, roofR]]) {
            const y0 = ry, y1 = top + 2;
            blockers.push({ x: cx - 2, y: y0, w: 5, h: y1 - y0 });
            out.push({ type: ropes ? "hangrope" : "chain", x: cx, y: y0, h: y1 - y0 });
        }
    }
    // Timber cross-beams up the shafts (two or three tiles wide, five or more deep), as objects.
    function autoShaftBeams(a) {
        const out = [], solidT = (tx, ty) => tileAtIn(a, tx, ty) === "#" || tileAtIn(a, tx, ty) === "%";
        const spans = new Map();   // "x0,w" -> rows
        for (let ty = 0; ty < a.h; ty++) for (let tx = 1; tx < a.w; tx++) {
            if (!solidT(tx - 1, ty) || solidT(tx, ty)) continue;
            let w = 0; while (w < 4 && !solidT(tx + w, ty)) w++;
            if (w < 2 || w > 3 || !solidT(tx + w, ty)) continue;
            const k = tx + "," + w; if (!spans.has(k)) spans.set(k, []); spans.get(k).push(ty);
        }
        for (const [k, rows] of spans) {
            const [x0, w] = k.split(",").map(Number);
            let run = [rows[0]];
            const flush = () => { if (run.length >= 5) for (let i = 2; i < run.length; i += 4) out.push({ type: "shaftbeam", x: x0 * TS, y: run[i] * TS + 5, w: w * TS }); };
            for (let i = 1; i < rows.length; i++) { if (rows[i] === rows[i - 1] + 1) run.push(rows[i]); else { flush(); run = [rows[i]]; } }
            flush();
        }
        return out;
    }
    /* NO LANTERN OVER A ROPE, A CHAIN OR A POST (13 Oct 2026, the owner's:
       "lanterns overlap ropes/chains etc, this looks messy so cannot
       happen"): whether a lantern at o would cross one of the blockers, or a
       ladder or climbing rope. */
    function lanternBlocked(a, o, blockers) {
        const b = { x: o.x - 1, y: o.y - 10, w: 18, h: 33 };
        const meets = (p, q) => p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y;
        if (blockers.some(r => meets(b, r))) return true;
        for (let ty = Math.floor(b.y / TS); ty <= Math.floor((b.y + b.h - 1) / TS); ty++) for (let tx = Math.floor(b.x / TS); tx <= Math.floor((b.x + b.w - 1) / TS); tx++) { const c = tileAtIn(a, tx, ty); if (c === "|" || c === "H") return true; }
        return false;
    }
    /* HIDDEN ROOMS: open space that can only be reached through a false wall.
       From outside they look like solid wall (a cover over them, drawn over
       everything in them); stepping through the false wall fades the cover
       away, and it comes back when Scout leaves. */
    function findHidden(a) {
        const W = a.w, H = a.h, seen = new Uint8Array(W * H), q = [];
        const opening = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && a.tiles[ty][tx] !== "#" && a.tiles[ty][tx] !== "%";
        // the flood from the start stops at a false wall, a secret's pile, and a secret's way out
        const passOpen = (tx, ty) => opening(tx, ty) && !a.seams.has(tx + "," + ty) && !a.secretPile.has(tx + "," + ty);
        const sx = Math.floor((a.start.x + 5) / TS), sy = Math.floor((a.start.y + STAND_H - 1) / TS);
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) { seen[sy * W + sx] = 1; q.push([sx, sy]); }
        while (q.length) {
            const [tx, ty] = q.pop();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = tx + dx, ny = ty + dy; if (passOpen(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; q.push([nx, ny]); } }
        }
        a.hidden = new Uint8Array(W * H);
        for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) if (passOpen(tx, ty) && a.tiles[ty][tx] !== "X" && !seen[ty * W + tx]) a.hidden[ty * W + tx] = 1;
        /* (23 Oct 2026, the owner's: "Placing Rubble inside a hidden area, including the secret rubble, doesn't hide it")
           rubble (secret rubble too) is part of the room it is in: unreached, and nothing beside it reached. (Rubble with
           the open passage beside it stays out of the cover: the secret rubble sealing a room, seen from outside.) */
        for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
            if (a.tiles[ty][tx] !== "X" || seen[ty * W + tx]) continue;
            if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = tx + dx, ny = ty + dy; return nx >= 0 && ny >= 0 && nx < W && ny < H && seen[ny * W + nx]; })) continue;
            if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = tx + dx, ny = ty + dy; return nx >= 0 && ny >= 0 && nx < W && ny < H && (a.hidden[ny * W + nx] === 1 || a.tiles[ny][nx] === "X"); })) a.hidden[ty * W + tx] = 1;
        }
        // a trapdoor belongs to the room it is in, and is roof from below
        for (const k of a.trapSeams) { const [tx, ty] = k.split(",").map(Number); if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => a.hidden[(ty + dy) * W + tx + dx] === 1 || a.trapSeams.has((tx + dx) + "," + (ty + dy)))) a.hidden[ty * W + tx] = 1; }
        /* and so, now, does a secret's ladder or rope where it comes out
           (14 Oct 2026, the owner's: "hide until the room is found! only
           visible when inside the room"): under the cover with the room, a
           run of them taken in together, so from outside it is wall. */
        for (let grew = true; grew;) {
            grew = false;
            for (const k of a.climbSeams || []) { const [tx, ty] = k.split(",").map(Number); if (a.hidden[ty * W + tx] !== 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tx + dx >= 0 && ty + dy >= 0 && tx + dx < W && ty + dy < H && a.hidden[(ty + dy) * W + tx + dx] === 1)) { a.hidden[ty * W + tx] = 1; grew = true; } }
        }
        // each hidden room, with the false walls that lead into it, is one cover
        a.covers = [];
        const taken = new Uint8Array(W * H);
        const inCover = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && (a.hidden[ty * W + tx] === 1 || a.tiles[ty][tx] === "%");
        for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
            if (a.hidden[ty * W + tx] !== 1 || taken[ty * W + tx]) continue;
            const tiles = [], st = [[tx, ty]]; taken[ty * W + tx] = 1;
            while (st.length) {
                const [cx, cy] = st.pop(); tiles.push([cx, cy]);
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (inCover(nx, ny) && !taken[ny * W + nx]) { taken[ny * W + nx] = 1; st.push([nx, ny]); } }
            }
            a.covers.push({ tiles, set: new Set(tiles.map(t => t[0] + "," + t[1])), alpha: 1, canvas: null, x: 0, y: 0 });
        }
    }
    const isHidden = (a, tx, ty) => tx >= 0 && ty >= 0 && tx < a.w && ty < a.h && a.hidden && a.hidden[ty * a.w + tx] === 1;
    // Walls, as the picture draws them: real ones, false ones, and hidden rooms (which pass for wall).
    const wallish = (a, tx, ty) => solidOrFake(a, tx, ty) || isHidden(a, tx, ty) || Boolean(SLOPES[tileAtIn(a, tx, ty)] || CEILS[tileAtIn(a, tx, ty)]);   // (a slope is wall to the tiles round it: no floor's top under it)
    /* THE BOARDS a wall is built of (13 Oct 2026: the joints "inconsistent
       and sometimes loads of them grouped together", from three tile
       pictures picked at random). Worked out across the whole map instead,
       pixel by pixel: boards 8 pixels deep, each row of them BOARD long with
       its joints staggered from the row above, a nail either side of every
       joint, and grain that never repeats tile to tile. */
    const BOARD = 56;
    function boards(x, tx, ty, px, py) {
        const P = ART.pal;
        for (let k = 0; k < 2; k++) {
            const by = ty * 2 + k, y0 = py + k * 8;
            x.fillStyle = P[9]; x.fillRect(px, y0, TS, 1);
            x.fillStyle = P[8]; x.fillRect(px, y0 + 1, TS, 5);
            x.fillStyle = P[7]; x.fillRect(px, y0 + 6, TS, 1);
            x.fillStyle = P[6]; x.fillRect(px, y0 + 7, TS, 1);
            const shift = Math.floor(hashTile(by, 7) * BOARD);
            for (let i = 0; i < TS; i++) {
                const wx = tx * TS + i;
                // grain: short darker streaks along the board
                const seg = Math.floor(wx / 7), hh = hashTile(seg, by * 3 + 1);
                if (hh < 0.4) {
                    const row = 1 + Math.floor(hh * 10) % 4, start = seg * 7 + Math.floor(hh * 70) % 3, len = 3 + Math.floor(hh * 100) % 4;
                    if (wx >= start && wx < start + len) { x.fillStyle = P[7]; x.fillRect(px + i, y0 + row, 1, 1); }
                }
                // the joint between two boards, and its nails
                const along = (wx + shift) % BOARD;
                if (along === 0) { x.fillStyle = P[6]; x.fillRect(px + i, y0, 1, 7); }
                if (along === 2 || along === BOARD - 2) { x.fillStyle = P.m; x.fillRect(px + i, y0 + 2, 1, 1); x.fillStyle = P.i; x.fillRect(px + i, y0 + 3, 1, 1); }
            }
        }
    }
    function drawWall(x, a, tx, ty, ox, oy, opened) {
        const px = tx * TS - ox, py = ty * TS - oy;
        if (a.blocks && a.blocks.has(tx + "," + ty) && TH.block) { TH.block(x, a, tx, ty, px, py, helpers()); return; }
        /* (23 Oct 2026, the owner's: "corner edges where there is no outline and it abruptly ends") beside a slope whose end is
           lower than this wall's top (or a ceiling slope's, higher than its foot), the part of its side above the line (below,
           for a ceiling) is open air: drawn there as a side open to the air is, its rounded corner and edge with it */
        if (!opened) {
            const sides = [];
            for (const dx of [-1, 1]) {
                const n = tileAtIn(a, tx + dx, ty), Sl = SLOPES[n], Ce = CEILS[n];
                const h = Sl ? (dx < 0 ? Sl.yR : Sl.yL) : Ce ? (dx < 0 ? Ce.yR : Ce.yL) : null;
                if (h !== null && (Sl ? h > 0 : h < TS) && !isHidden(a, tx + dx, ty)) sides.push({ dx, h, ceil: !Sl });
            }
            if (sides.length) {
                drawWall(x, a, tx, ty, ox, oy, new Set());   // (once whole, as it is; then each such side's open part over it)
                for (const s of sides) {
                    x.save(); x.beginPath(); if (s.ceil) x.rect(px, py + s.h, TS, TS - s.h + 4); else x.rect(px, py - 4, TS, s.h + 4); x.clip();
                    drawWall(x, a, tx, ty, ox, oy, new Set([s.dx + ",0"]));
                    x.restore();
                }
                return;
            }
        }
        const H = opened && opened.size ? Object.assign({}, helpers(), { wallish: (a2, x2, y2) => opened.has((x2 - tx) + "," + (y2 - ty)) ? false : wallish(a2, x2, y2) }) : helpers();
        if (TH.wall) TH.wall(x, a, tx, ty, px, py, H); else boards(x, tx, ty, px, py);
        const open = n => !H.wallish(a, tx + n[0], ty + n[1]);
        const lipped = open([0, -1]);
        if (lipped) {
            if (TH.lip) TH.lip(x, a, tx, ty, px, py, H); else x.drawImage(spr("lip", 0), px, py);
            const hs = hashTile(tx, ty);
            if (TH.moss && hs < 0.35) { const mx = px + Math.floor(hs * 30) % 12; x.fillStyle = "#2f5a26"; x.fillRect(mx, py - 1, 3, 2); x.fillStyle = "#4f8a3a"; x.fillRect(mx + 1, py - 2, 1, 1); }
        }
        const top = lipped ? 4 : 0, E = TH.edgeFor ? TH.edgeFor(a) : TH.edge;
        if (open([-1, 0])) { x.fillStyle = E.out; x.fillRect(px, py, 1, TS); x.fillStyle = E.lit; x.fillRect(px + 1, py + top, 1, TS - top); }
        if (open([1, 0])) { x.fillStyle = E.out; x.fillRect(px + TS - 1, py, 1, TS); x.fillStyle = E.dark; x.fillRect(px + TS - 2, py + top, 1, TS - top); }
        if (open([0, 1])) { x.fillStyle = E.out; x.fillRect(px, py + TS - 1, TS, 1); x.fillStyle = E.dark; x.fillRect(px, py + TS - 2, TS, 1); if (TH.under && !ox && !oy) TH.under(x, a, tx, ty, px, py, helpers()); }
        // ice on a slippery floor: a sheet of it, glassy, over the top
        if (lipped && a.slick.has(tx + "," + ty)) { x.fillStyle = "#14202e"; x.fillRect(px, py - 1, TS, 1); x.fillStyle = "#e8f8ff"; x.fillRect(px, py, TS, 1); x.fillStyle = "#9fd8f6"; x.fillRect(px, py + 1, TS, 2); x.fillStyle = "#5aa8dc"; x.fillRect(px, py + 3, TS, 1); if (hashTile(tx, ty * 3) < 0.5) { x.fillStyle = "#ffffff"; x.fillRect(px + 3 + Math.floor(hashTile(tx, ty) * 9), py + 1, 3, 1); } }
        /* (19 Oct 2026, the owner's: "All the walls get darker after 1 tile in, make it so this doesn't happen -
           likely applies to all zones") a wall's tiles past its outer row were put in shadow, a square at a time,
           every zone (and the quarry's and the ruins' rock darker still the deeper it lay): gone. A wall is its
           own art all the way through. */
    }
    /* A SLOPE (23 Oct 2026): the zone's own wall, as a wall tile there would be, cut along its line; its outline
       where it meets the air; and along the line the zone's floor top (its lip), sheared down the slope a column of
       pixels at a time, so the slope is the wall's own edge turned. */
    const slopeScratch = [];
    const scratchCv = (i, w, h) => { let c = slopeScratch[i]; if (!c) { c = slopeScratch[i] = document.createElement("canvas"); c.width = w; c.height = h; } const x = c.getContext("2d", { willReadFrequently: true }); x.imageSmoothingEnabled = false; x.globalCompositeOperation = "source-over"; x.clearRect(0, 0, w, h); return [c, x]; };
    function drawSlope(x, a, tx, ty) {
        const S = SLOPES[a.tiles[ty][tx]], px = tx * TS, py = ty * TS;
        const sy = i => Math.round(slopeY(S, i + 0.5) - 0.5);   // (the line's height over pixel column i)
        // the wall's own art, told what is round it: the tile above rock or air (and, for its top, rock either side)
        const base = helpers(), told = (above, sides) => Object.assign({}, base, { wallish: (a2, x2, y2) => x2 === tx && y2 === ty - 1 ? above : sides && y2 === ty && (x2 === tx - 1 || x2 === tx + 1) ? true : base.wallish(a2, x2, y2) });
        const wallArt = (cx, h) => { if (TH.wall) TH.wall(cx, a, tx, ty, 0, 0, h); else boards(cx, tx, ty, 0, 0); };
        const [c, cx] = scratchCv(0, TS, TS);
        wallArt(cx, told(true, false));
        for (let i = 0; i < TS; i++) cx.clearRect(i, 0, 1, Math.max(0, sy(i)));
        /* its top surface, where the zone's walls draw their own (the Mine's slate): the tile drawn with air over it
           and with rock, and what differs in its top rows kept, to lay along the line */
        const [o, ox] = scratchCv(2, TS, TS), [k, kx] = scratchCv(3, TS, TS);
        wallArt(ox, told(false, true)); wallArt(kx, told(true, true));
        const od = ox.getImageData(0, 0, TS, 8), kd = kx.getImageData(0, 0, TS, 8).data, capD = od.data, capAll = capD.slice();
        let anyCap = false;
        for (let p = 0; p < capD.length; p += 4) { if (capD[p] === kd[p] && capD[p + 1] === kd[p + 1] && capD[p + 2] === kd[p + 2] && capD[p + 3] === kd[p + 3]) capD[p + 3] = 0; else anyCap = true; }
        /* (23 Oct 2026) a column's top kept whole, down to its last row that differs: where a crack in the face happens to be
           the outline's colour the two pictures agree there, and the top had a hole in it, a nick in the outline */
        for (let i = 0; i < TS; i++) { let last = -1; for (let r = 0; r < 8; r++) if (capD[(r * TS + i) * 4 + 3]) last = r; for (let r = 0; r < last; r++) { const q = (r * TS + i) * 4; if (!capD[q + 3]) { capD[q] = capAll[q]; capD[q + 1] = capAll[q + 1]; capD[q + 2] = capAll[q + 2]; capD[q + 3] = capAll[q + 3]; } } }
        const E = TH.edgeFor ? TH.edgeFor(a) : TH.edge, open = (dx, dy) => !wallish(a, tx + dx, ty + dy);
        if (open(-1, 0) && S.yL < TS) { cx.fillStyle = E.out; cx.fillRect(0, S.yL, 1, TS - S.yL); cx.fillStyle = E.lit; cx.fillRect(1, S.yL + 3, 1, Math.max(0, TS - S.yL - 3)); }
        if (open(1, 0) && S.yR < TS) { cx.fillStyle = E.out; cx.fillRect(TS - 1, S.yR, 1, TS - S.yR); cx.fillStyle = E.dark; cx.fillRect(TS - 2, S.yR + 3, 1, Math.max(0, TS - S.yR - 3)); }
        if (open(0, 1)) { cx.fillStyle = E.out; cx.fillRect(0, TS - 1, TS, 1); cx.fillStyle = E.dark; cx.fillRect(0, TS - 2, TS, 1); }
        /* (23 Oct 2026) the tile put together in a scratch picture first (its top runs a little above and below the tile:
           Z's own top is O above the tile's), so its ends can be rounded off before it goes on the map */
        const O = 12, [z, zx] = scratchCv(5, TS, TS + 2 * O);
        zx.drawImage(c, 0, O);
        if (anyCap) { const [t, tx2] = scratchCv(4, TS, 8); tx2.putImageData(od, 0, 0); for (let i = 0; i < TS; i++) zx.drawImage(t, i, 0, 1, 8, i, O + sy(i), 1, 8); }
        // the floor's top along the line (drawn 6 down in its scratch, for what it puts over the top: pebbles, grass)
        const [l, lx] = scratchCv(1, TS, 24);
        if (TH.lip) TH.lip(lx, a, tx, ty, 0, 6, helpers()); else lx.drawImage(spr("lip", 0), 0, 6);
        for (let i = 0; i < TS; i++) zx.drawImage(l, i, 0, 1, 24, i, O + sy(i) - 6, 1, 24);
        // the top's outline and its pale under it, at a column: the zone's own (its top surface's first two pixels there)
        const lid = anyCap ? null : lx.getImageData(0, 0, TS, 24).data;
        const topCols = i => { const got = []; if (anyCap) { for (let r = 0; r < 8 && got.length < 2; r++) { const p = (r * TS + i) * 4; if (capD[p + 3]) got.push([capD[p], capD[p + 1], capD[p + 2]]); } } else for (let r = 0; r < 24 && got.length < 2; r++) { const p = (r * TS + i) * 4; if (lid[p + 3] > 200) got.push([lid[p], lid[p + 1], lid[p + 2]]); } return got; };
        /* (its outline is the top's own, one pixel to a column, corner to corner where the line steps: filling the steps in
           side by side, 23 Oct, made it two pixels thick on a steep slope, "a really thick outline") */
        /* ITS ENDS ROUNDED OFF (23 Oct 2026, the owner's: "Normal walls have nice rounded corners to bring them to an end, we need
           something similar for the end of slopes"): where the slope's top meets open air at its side (its high end, over a
           drop), the corner cut round as a wall's is, the curve touching both the slope's line and the side; the outline
           carried round it, the top's pale just inside */
        const RC = 4, m = (S.yR - S.yL) / TS, root = Math.sqrt(1 + m * m);
        const corners = [];
        if (open(-1, 0) && S.yL < TS - 2) corners.push({ cx: RC, cy: O + S.yL + m * RC + RC * root, left: true, i: 0 });
        if (open(1, 0) && S.yR < TS - 2) corners.push({ cx: TS - RC, cy: O + S.yR - m * RC + RC * root, left: false, i: TS - 1 });
        if (corners.length) {
            const H2 = TS + 2 * O, im = zx.getImageData(0, 0, TS, H2), d = im.data, op = (px, py) => px >= 0 && py >= 0 && px < TS && py < H2 && d[(py * TS + px) * 4 + 3] > 0;
            for (const k of corners) {
                const inZone = (px, py) => (k.left ? px + 0.5 < k.cx : px + 0.5 > k.cx) && py + 0.5 < k.cy;
                // cut away what is outside the curve
                for (let py = 0; py < H2; py++) for (let px = 0; px < TS; px++) if (inZone(px, py) && Math.hypot(px + 0.5 - k.cx, py + 0.5 - k.cy) > RC + 0.15) d[(py * TS + px) * 4 + 3] = 0;
                // and along the curve: the outline, then the pale
                const tc = topCols(k.i), outC = tc[0] || [10, 8, 12], paleC = tc[1] || outC, edge = [];
                for (let py = 0; py < H2; py++) for (let px = 0; px < TS; px++) if (inZone(px, py) && op(px, py) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !op(px + dx, py + dy))) edge.push([px, py]);
                for (const [px, py] of edge) { const p = (py * TS + px) * 4; d[p] = outC[0]; d[p + 1] = outC[1]; d[p + 2] = outC[2]; d[p + 3] = 255; }
                const isEdge = new Set(edge.map(q => q[0] + "," + q[1]));
                for (let py = 0; py < H2; py++) for (let px = 0; px < TS; px++) { if (!inZone(px, py) || !op(px, py) || isEdge.has(px + "," + py)) continue; if (Math.hypot(px + 0.5 - k.cx, py + 0.5 - k.cy) > RC - 1.4) { const p = (py * TS + px) * 4; d[p] = paleC[0]; d[p + 1] = paleC[1]; d[p + 2] = paleC[2]; } }
            }
            zx.putImageData(im, 0, 0);
        }
        /* (23 Oct 2026, the owner's: "Rails and slopes don't fully hide properly in hidden rooms") one in a hidden room drawn
           only within its own tile: its top runs on past it (onto the floor at its foot), and there that showed past the
           room's cover, which hides whole tiles */
        const hid = a.hidden && a.hidden[ty * a.w + tx] === 1;
        if (hid) { x.save(); x.beginPath(); x.rect(px, py, TS, TS); x.clip(); }
        x.drawImage(z, px, py - O);
        if (hid) x.restore();
    }
    /* WHERE A SLOPE MEETS A FLOOR (23 Oct 2026, the owner's: "Normal walls have nice rounded corners to bring them to an end",
       and "Did you do all slope ends? All slope types, and both top and bottom? and both directions?"): every slope, steep or
       gentle, either way up, its top where it leaves a floor's edge (a corner over, shaved round) and its foot where it comes
       down onto a floor (a corner under, filled round). The two lines joined by the curve that touches both (a fillet: a
       parabola from J px along the floor to J px along the slope), each column of the surface there moved up or down onto
       it, pale top and outline with it: drawn as a picture (Scout still walks the lines as they were). On a picture of the
       walls alone (the backdrop is under it), so what is shaved off shows what is behind. */
    /* A CEILING SLOPE (23 Oct 2026): the zone's wall, as a wall tile there would be, cut along the line from below; along
       the line the wall's own underside (its outline and shade where open air is under it, found as a slope's top is: the
       tile drawn with air under it and with rock, what differs in its bottom rows), laid up the line a column at a time */
    function drawCeil(x, a, tx, ty) {
        const S = CEILS[a.tiles[ty][tx]], px = tx * TS, py = ty * TS;
        const sy = i => Math.round(slopeY(S, i + 0.5) - 0.5);   // (the rock's last row over column i is sy - 1)
        const base = helpers(), told = (below, sides) => Object.assign({}, base, { wallish: (a2, x2, y2) => x2 === tx && y2 === ty + 1 ? below : sides && y2 === ty && (x2 === tx - 1 || x2 === tx + 1) ? true : base.wallish(a2, x2, y2) });
        const wallArt = (cx, h) => { if (TH.wall) TH.wall(cx, a, tx, ty, 0, 0, h); else boards(cx, tx, ty, 0, 0); };
        const O = 12, [z, zx] = scratchCv(5, TS, TS + 2 * O), [c, cx] = scratchCv(0, TS, TS);
        wallArt(cx, told(true, false));
        for (let i = 0; i < TS; i++) cx.clearRect(i, Math.max(0, sy(i)), 1, TS);
        zx.drawImage(c, 0, O);
        const [o, ox] = scratchCv(2, TS, TS), [k, kx] = scratchCv(3, TS, TS);
        wallArt(ox, told(false, true)); wallArt(kx, told(true, true));
        const od = ox.getImageData(0, TS - 8, TS, 8), kd = kx.getImageData(0, TS - 8, TS, 8).data, uD = od.data, uAll = uD.slice();
        let any = false;
        for (let p = 0; p < uD.length; p += 4) { if (uD[p] === kd[p] && uD[p + 1] === kd[p + 1] && uD[p + 2] === kd[p + 2] && uD[p + 3] === kd[p + 3]) uD[p + 3] = 0; else any = true; }
        // (its underside kept whole, from its first row that differs down: no holes where a crack matches the outline)
        for (let i = 0; i < TS; i++) { let first = 8; for (let r = 7; r >= 0; r--) if (uD[(r * TS + i) * 4 + 3]) first = r; for (let r = first + 1; r < 8; r++) { const q = (r * TS + i) * 4; if (!uD[q + 3]) { uD[q] = uAll[q]; uD[q + 1] = uAll[q + 1]; uD[q + 2] = uAll[q + 2]; uD[q + 3] = uAll[q + 3]; } } }
        const E = TH.edgeFor ? TH.edgeFor(a) : TH.edge;
        if (any) { const [t, tx2] = scratchCv(4, TS, 8); tx2.putImageData(od, 0, 0); for (let i = 0; i < TS; i++) zx.drawImage(t, i, 0, 1, 8, i, O + sy(i) - 8, 1, 8); }
        else for (let i = 0; i < TS; i++) { zx.fillStyle = E.out; zx.fillRect(i, O + sy(i) - 1, 1, 1); zx.fillStyle = E.dark; zx.fillRect(i, O + sy(i) - 2, 1, 1); }
        // a side open to the air, where the rock comes down to it: the wall's own side edge, down to the line
        const open = (dx, dy) => !wallish(a, tx + dx, ty + dy);
        if (open(-1, 0) && S.yL > 0) { zx.fillStyle = E.out; zx.fillRect(0, O, 1, S.yL); zx.fillStyle = E.lit; zx.fillRect(1, O, 1, Math.max(0, S.yL - 2)); }
        if (open(1, 0) && S.yR > 0) { zx.fillStyle = E.out; zx.fillRect(TS - 1, O, 1, S.yR); zx.fillStyle = E.dark; zx.fillRect(TS - 2, O, 1, Math.max(0, S.yR - 2)); }
        const hid = a.hidden && a.hidden[ty * a.w + tx] === 1;
        if (hid) { x.save(); x.beginPath(); x.rect(px, py, TS, TS); x.clip(); }
        x.drawImage(z, px, py - O);
        if (hid) x.restore();
    }
    /* WHERE A CEILING SLOPE MEETS A FLAT CEILING (23 Oct 2026, the owner's "Yes to that ... too"): the same fillet, upside
       down. At the end where the slope comes down from a flat ceiling the rock's corner is a hollow one (filled round: the
       underside moved down onto the curve); at the end where it rises into one the corner sticks out (shaved round: moved up,
       what is left under it cleared). Each column of the underside, its edge with it. */
    function ceilJoints(x, a, tx, ty) {
        const S = CEILS[a.tiles[ty][tx]], hidden = (X, Y) => a.hidden && a.hidden[Y * a.w + X] === 1;
        if (hidden(tx, ty)) return;
        const solidT = (X, Y) => { const c = tileAtIn(a, X, Y); return c === "#" || c === "2" || c === "i"; };
        const openT = (X, Y) => !wallish(a, X, Y) && !SLOPES[tileAtIn(a, X, Y)] && !CEILS[tileAtIn(a, X, Y)];
        const g = Math.abs(S.yR - S.yL) / TS, T = x.getTransform(), cv = x.canvas, t = JOINT;
        for (const d of [-1, 1]) {
            const h = d < 0 ? S.yL : S.yR, bx = d < 0 ? tx * TS : tx * TS + TS;
            let yJ, down;   // down: the slope comes down away from the flat ceiling (a hollow, filled); else it rises from it (shaved)
            if (h === 0 && openT(tx + d, ty) && solidT(tx + d, ty - 1) && !hidden(tx + d, ty)) { yJ = ty * TS; down = true; }
            else if (h === TS && solidT(tx + d, ty) && openT(tx + d, ty + 1) && !hidden(tx + d, ty + 1)) { yJ = ty * TS + TS; down = false; }
            else continue;
            // (as a floor's: the fillet in even steps, never short of the slope's own pixels; s its last rock row)
            const mags = [], line = [], cols = [];
            for (let u = -t; u < t; u++) { const uc = u + 0.5, sAt = (uc + t) / (2 * t); mags.push(g * t * sAt * sAt); line.push(uc < 0 ? 0 : Math.abs(Math.round(yJ + (down ? 1 : -1) * g * uc - 0.5) - yJ)); }
            const lv = stairs(mags);
            for (let i = 0; i < 2 * t; i++) { const u = i - t, m = Math.max(lv[i], line[i]); cols.push({ X: d < 0 ? bx + u : bx - 1 - u, s: yJ - 1 + (down ? m : -m), R: (d < 0 ? bx - t - 1 : bx + t) + d * ((u + t) % 6) }); }
            reshapeJoint(x, cols, true, yJ - 1);
        }
    }
    /* WHERE A SLOPE RUNS OFF A DROP: see cliffEnd */
    function slopeCorners(x, a, tx, ty) {
        const hidden = (X, Y) => a.hidden && a.hidden[Y * a.w + X] === 1;
        if (hidden(tx, ty)) return;
        const ch = a.tiles[ty][tx], S = SLOPES[ch] || CEILS[ch], ceil = !SLOPES[ch];
        const solidT = (X, Y) => { const c = tileAtIn(a, X, Y); return c === "#" || c === "2" || c === "i"; };
        const openT = (X, Y) => !wallish(a, X, Y) && !SLOPES[tileAtIn(a, X, Y)] && !CEILS[tileAtIn(a, X, Y)];
        const g = Math.abs(S.yR - S.yL) / TS;
        for (const dd of [-1, 1]) {
            const h = dd < 0 ? S.yL : S.yR;
            if (!openT(tx + dd, ty)) continue;
            if (!ceil && h === TS && solidT(tx, ty + 1) && openT(tx + dd, ty + 1) && !hidden(tx, ty + 1)) cliffEnd(x, a, tx, ty, dd, g, false);
            else if (ceil && h === 0 && solidT(tx, ty - 1) && openT(tx + dd, ty - 1) && !hidden(tx, ty - 1)) cliffEnd(x, a, tx, ty, dd, g, true);
        }
    }
    /* (23 Oct 2026, the owner's: "Bottom of slopes where it doesn't meet a flat wall (so it's just a cliff edge) looks
       awful") a curve of my own there, its band smeared down the face and cut off. Now the zone's own corner: the slope's
       last L px eased level (the curve that touches its line L px in), and on it, column by column, the wall under it as
       it is drawn with its top and that side open (its rounded corner, its top, its side's edge), so the cliff's edge is
       a wall's edge. (Upside down for a ceiling slope: the wall over it, its underside and side open.) The wall's art is
       the one under (over) it, so its texture runs on into it. The level bit at the edge is drawn up to gL/2 px above
       the line (3 px at the steepest): the picture only. */
    function cliffEnd(x, a, tx, ty, d, g, ceil) {
        const L = 6, T = x.getTransform(), edge = d < 0 ? tx * TS : tx * TS + TS;
        const yJ = ceil ? ty * TS : ty * TS + TS, wy = ceil ? ty - 1 : ty + 1;
        const [, sx] = scratchCv(6, TS, TS + 8);
        drawWall(sx, a, tx, wy, tx * TS, wy * TS - 4, new Set([ceil ? "0,1" : "0,-1", d + ",0"]));
        const art = sx.getImageData(0, 4, TS, TS).data;
        const x0 = d < 0 ? edge : edge - L, y0 = ty * TS - TS - 8, H = 3 * TS + 16, X0 = x0 + T.e, Y0 = y0 + T.f;
        if (X0 < 0 || Y0 < 0 || X0 + L > x.canvas.width || Y0 + H > x.canvas.height) return;
        const im = x.getImageData(X0, Y0, L, H), dd = im.data;
        // the ease, from the edge in: its rise over the ledge in even pixel steps (stairs), never short of the slope's own pixels
        const rise = [], lineR = [];
        for (let q = 0; q < L; q++) { const w = q + 0.5; rise.push(g * w * w / (2 * L)); lineR.push(ceil ? Math.round(yJ + g * w - 0.5) - 1 : Math.round(yJ - g * w - 0.5)); }
        const lv = stairs(rise), ledge = ceil ? Math.round(yJ + g * L / 2 - 0.5) - 1 : Math.round(yJ - g * L / 2 - 0.5);
        for (let k = 0; k < L; k++) {
            const wx = x0 + k, q = d < 0 ? k : L - 1 - k, i = wx - tx * TS;
            const s = ceil ? Math.max(ledge + lv[q], lineR[q]) : Math.min(ledge - lv[q], lineR[q]);   // s: its outermost rock row
            for (let r = 0; r < H; r++) {
                const Y = y0 + r, q = (r * L + k) * 4, j = ceil ? Y - (s - TS + 1) : Y - s;   // j: the art's row here
                // (only as far as the slope's own top spills past its tile, 8 px: further, the wall's far side came too,
                // a few px out of place over its real one: its bottom corner doubled where the wall is open under)
                const near = ceil ? Y >= yJ - 8 : Y <= yJ + 8;
                if (j >= 0 && j < TS && near) { const p = (j * TS + i) * 4; dd[q] = art[p]; dd[q + 1] = art[p + 1]; dd[q + 2] = art[p + 2]; dd[q + 3] = art[p + 3]; }
                // (no clearing above it: the ledge only ever adds rock, and a wall hanging over the cliff's edge stays whole)
            }
        }
        x.putImageData(im, X0, Y0);
    }
    /* (23 Oct 2026, the owner's: "it's not smooth into flat walls, it's distorted - appears broken (at the bottom)") the
       joint's columns were slid up or down whole, old top and all: at a foot the floor's top and the slope's overlapped a
       row apart, and the outline stepped 2, 1, 2, 1, 3. Now each is built afresh: air down to its place on the curve, then
       the flat floor's own top there (copied from a column of it past the joint), then rock where the old top was. cols:
       {X, s: its outermost rock row on the curve, R: the flat column to copy}; ceil: the rock above, the air below; flat:
       the flat surface's outermost rock row, to check R against. */
    function reshapeJoint(x, cols, ceil, flat) {
        if (!cols.length) return;
        const T = x.getTransform(), xs = cols.flatMap(c => [c.X, c.R]), ss = cols.map(c => c.s);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const y0 = Math.max(Math.min(...ss, flat) - 30, -T.f), y1 = Math.min(Math.max(...ss, flat) + 30, x.canvas.height - T.f);   // (kept on the picture: near the map's top it gave up)
        const W = maxX - minX + 1, H = y1 - y0, cx0 = minX + T.e, cy0 = y0 + T.f;
        if (H <= 0 || cx0 < 0 || cy0 < 0 || cx0 + W > x.canvas.width || cy0 + H > x.canvas.height) return;   // (off this picture altogether: a part of the map drawn alone)
        const im = x.getImageData(cx0, cy0, W, H), d = im.data, src = new Uint8ClampedArray(d), v = ceil ? -1 : 1, CAP = 6;
        const at = (X, Y) => ((Y - y0) * W + (X - minX)) * 4;
        /* (23 Oct 2026, the owner's: "bottom corner of a wall appears broken when a slope is underneath it") a column's surface:
           the rock's top (a ceiling's: its underside) nearest where it should be (near), not the first rock from the top of
           the picture: that found the foot of a wall hanging over the joint, and the wall's corner was cleared away with the air */
        const solidPx = (X, Y) => Y >= y0 && Y < y1 && src[at(X, Y) + 3] > 200;
        const edgeOf = (X, near) => {
            for (let k = 0; k <= 12; k++) for (const Y of k ? [near - k, near + k] : [near]) {
                if (!ceil ? solidPx(X, Y) && !solidPx(X, Y - 1) : solidPx(X, Y) && !solidPx(X, Y + 1)) return Y;
            }
            return null;
        };
        // the flat column to copy: the one asked for if its top is where the flat's is, else the nearest of the joint's own that is
        const fallback = cols.map(c => c.R).concat(cols.map(c => c.X)).find(R => edgeOf(R, flat) === flat);
        if (fallback === undefined) return;
        const put = (X, Y, sx, sy) => { if (Y < y0 || Y >= y1 || sy < y0 || sy >= y1) return; const q = at(X, Y), p = at(sx, sy); d[q] = src[p]; d[q + 1] = src[p + 1]; d[q + 2] = src[p + 2]; d[q + 3] = src[p + 3]; };
        for (const c of cols) {
            const R = edgeOf(c.R, flat) === flat ? c.R : fallback, oe = edgeOf(c.X, c.s);
            if (oe === null || oe === c.s) continue;   // (already on the curve: left as drawn)
            if (ceil ? oe > c.s : oe < c.s) for (let Y = Math.min(oe, c.s + 1); Y <= Math.max(oe, c.s - 1); Y++) if (ceil ? Y > c.s : Y < c.s) d[at(c.X, Y) + 3] = 0;   // the air side: only what the curve takes off the old top
            for (let k = 0; k < CAP; k++) put(c.X, c.s + v * k, R, flat + v * k);                      // the flat's own top
            const shift = (oe - c.s) * v;                                                               // (out past the old top: filled)
            for (let k = CAP; k < CAP + Math.max(0, shift); k++) put(c.X, c.s + v * k, c.X, c.s + v * (k + CAP));   // rock where the old top was
        }
        x.putImageData(im, cx0, cy0);
    }
    /* A CURVE IN PIXEL STEPS (23 Oct 2026): v, its depth along a row of columns (the flat end first, deepening ever faster);
       back, the whole pixels it is down at each. Each pixel down starts where the curve gets there; the steps' widths then
       put widest first, so they only ever narrow (2, 2, 1, 1, never 2, 1, 2), over the same span: a clean pixel curve. */
    function stairs(v) {
        const n = v.length, b = [];
        for (let k = 1; ; k++) { let i = 0; while (i < n && v[i] < k) i++; if (i >= n) break; b.push(i); }
        if (b.length > 2) { const gaps = b.slice(1).map((q, k) => q - b[k]).sort((p, q) => q - p); for (let k = 1; k < b.length; k++) b[k] = b[k - 1] + gaps[k - 1]; }
        return v.map((_, i) => { let c = 0; for (const q of b) if (q <= i) c++; return c; });
    }
    const JOINT = 8;
    function slopeJoints(x, a, tx, ty) {
        const S = SLOPES[a.tiles[ty][tx]], hidden = (X, Y) => a.hidden && a.hidden[Y * a.w + X] === 1;
        if (hidden(tx, ty)) return;
        const solidT = (X, Y) => { const c = tileAtIn(a, X, Y); return c === "#" || c === "2" || c === "i"; };
        const openT = (X, Y) => !wallish(a, X, Y) && !SLOPES[tileAtIn(a, X, Y)];
        const g = Math.abs(S.yR - S.yL) / TS, T = x.getTransform(), cv = x.canvas, t = JOINT;
        for (const d of [-1, 1]) {
            // d: the floor's side of the slope; bx: the boundary between them; the slope runs away from it
            const h = d < 0 ? S.yL : S.yR, bx = d < 0 ? tx * TS : tx * TS + TS;
            let yJ, over;
            if (h === 0 && solidT(tx + d, ty) && openT(tx + d, ty - 1) && !hidden(tx + d, ty)) { yJ = ty * TS; over = true; }          // its top, leaving a floor's edge
            else if (h === TS && openT(tx + d, ty) && solidT(tx + d, ty + 1) && !hidden(tx + d, ty + 1)) { yJ = ty * TS + TS; over = false; }   // its foot, onto a floor
            else continue;
            /* u: columns from the joint, the slope's side positive. The fillet's depth from the floor at each (mags), built
               into pixel steps that only ever narrow toward the slope (stairs), and never short of the slope's own pixels
               there (line): where it meets the slope it is the slope. R: a column of the flat floor past the joint, its
               top to copy (a different one each column, as its texture runs). (23 Oct 2026, the owner's: "there is a lump
               where it starts to curve down": each column rounded on its own, the steps came out 2, 1, 2, and at a foot
               a run of 6 a pixel up along the floor) */
            const mags = [], line = [], cols = [];
            for (let u = -t; u < t; u++) { const uc = u + 0.5, sAt = (uc + t) / (2 * t); mags.push(g * t * sAt * sAt); line.push(uc < 0 ? 0 : Math.abs(Math.round(yJ + (over ? 1 : -1) * g * uc - 0.5) - yJ)); }
            const lv = stairs(mags);
            for (let i = 0; i < 2 * t; i++) { const u = i - t, m = Math.max(lv[i], line[i]); cols.push({ X: d < 0 ? bx + u : bx - 1 - u, s: over ? yJ + m : yJ - m, R: (d < 0 ? bx - t - 1 : bx + t) + d * ((u + t) % 6) }); }
            reshapeJoint(x, cols, false, yJ);
        }
    }
    function renderCovers(a) {
        const tone = (a.settings && a.settings.tone && a.settings.tone.walls) || null;
        for (const cv of a.covers) {
            const xs = cv.tiles.map(t => t[0]), ys = cv.tiles.map(t => t[1]);
            const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
            const c = document.createElement("canvas");
            c.width = (x1 - x0 + 1) * TS; c.height = (y1 - y0 + 1) * TS;
            const x = c.getContext("2d");
            x.imageSmoothingEnabled = false;
            for (const [tx, ty] of cv.tiles) if (a.tiles[ty][tx] !== "%") drawWall(x, a, tx, ty, x0 * TS, y0 * TS);
            applyTone(c, tone);
            cv.canvas = c; cv.x = x0 * TS; cv.y = y0 * TS;
        }
        /* THE WALK-BEHIND WALLS (17 Oct 2026, the owner's: "Scout appears in front of walk-behind walls, he
           should appear behind them"): each run of them drawn again over him, and never faded (a secret
           room's cover, which fades as he finds it, no longer takes them with it). */
        a.fronts = [];
        const seen = new Set();
        for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) {
            if (a.tiles[ty][tx] !== "%" || seen.has(tx + "," + ty)) continue;
            const run = [], st = [[tx, ty]]; seen.add(tx + "," + ty);
            while (st.length) { const [cx, cy] = st.pop(); run.push([cx, cy]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, k = nx + "," + ny; if (nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && a.tiles[ny][nx] === "%" && !seen.has(k)) { seen.add(k); st.push([nx, ny]); } } }
            const xs = run.map(t => t[0]), ys = run.map(t => t[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
            const c = document.createElement("canvas"); c.width = (x1 - x0 + 1) * TS; c.height = (y1 - y0 + 1) * TS;
            const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
            for (const [rx, ry] of run) drawWall(x, a, rx, ry, x0 * TS, y0 * TS);
            applyTone(c, tone);
            a.fronts.push({ canvas: c, x: x0 * TS, y: y0 * TS });
        }
    }
    function hashTile(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
    const solidAt2 = (a, tx, ty) => tx < 0 || ty < 0 || tx >= a.w || ty >= a.h || a.tiles[ty][tx] === "#";
    const solidOrFake = (a, tx, ty) => tx < 0 || ty < 0 || tx >= a.w || ty >= a.h || a.tiles[ty][tx] === "#" || a.tiles[ty][tx] === "%";

    /* THE PIECES OF THE STILL PICTURE, each into a picture of its own size
       or onto one already begun, so the editor can draw a part of the map
       over again (a room, as a wall is painted) without the whole. */
    function drawBackdrop(x, a) {
        if (TH.back) TH.back(x, a, helpers());
        else for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) x.drawImage(spr("backwall", Math.floor(hashTile(tx * 3 + 1, ty * 5 + 2) * 3)), tx * TS, ty * TS);
    }
    function clearSky(x, a) { if (a.skyMask) for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) if (a.skyMask[ty * a.w + tx]) x.clearRect(tx * TS, ty * TS, TS, TS); }
    // The walls behind (back): drawn as walls of their own, nothing hidden in them, then put in shadow.
    function drawBackWalls(x, a) {
        if (!a.back) return;
        const b = Object.create(a);
        b.tiles = a.back; b.hidden = null; b.blocks = null; b.slick = new Set();
        for (let ty = 0; ty < a.h; ty++) for (let tx = 0; tx < a.w; tx++) if (a.back[ty][tx] === "#") drawWall(x, b, tx, ty, 0, 0);
    }
    /* The walls, ladders, ropes, spikes and platforms, and the shade under
       every overhang, over the tiles x0..x1, y0..y1 (the whole map if not
       said); the tiles just round them are drawn too, clipped, so a lip or
       an icicle that reaches over the edge is all there. */
    /* A ZONE'S LADDERS (21 Oct 2026, THE ZONES' NEW LOOK in js/rat-race-zones.js): the ladder's own colours swapped
       for the zone's (TH.ladderMap: from, to), the picture made once for each zone */
    const zoneLadders = new Map();
    function zoneLadder(img) {
        const M = TH.ladderMap; if (!M || !img) return img;
        let per = zoneLadders.get(M); if (!per) { per = new Map(); zoneLadders.set(M, per); }
        if (per.has(img)) return per.get(img);
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const im = x.getImageData(0, 0, c.width, c.height), d = im.data, to = {};
        for (const [f, t] of Object.entries(M)) to[f.toLowerCase()] = [parseInt(t.slice(1, 3), 16), parseInt(t.slice(3, 5), 16), parseInt(t.slice(5, 7), 16)];
        for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const k = "#" + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, "0")).join(""), n = to[k]; if (n) { d[i] = n[0]; d[i + 1] = n[1]; d[i + 2] = n[2]; } }
        x.putImageData(im, 0, 0); per.set(img, c); return c;
    }
    function drawTerrain(x, a, r) {
        /* (23 Oct 2026, the owner's: "gameplay doesn't match what I see in the editor") a part of the map (the editor's
           rooms, a hidden room's reveal) drawn clipped to itself: a slope's joint or cliff edge by its edge could not see
           the tiles past it, and was left sharp. So drawn with 3 tiles more all round, on a picture of its own, and only
           the part asked for kept: every joint as the whole map draws it */
        /* (23 Oct 2026, the owner's: "Editor feels slightly laggy") only where a slope is near enough to matter, and on
           one picture kept for it, made for reading back (the joints read it): a new one each time, read on the graphics
           card, a room took 88 ms where it had taken 6 */
        if (r && !r.whole && a.slopes) {
            const M = 3, e = { x0: Math.max(0, r.x0 - M), y0: Math.max(0, r.y0 - M), x1: Math.min(a.w, r.x1 + M), y1: Math.min(a.h, r.y1 + M), whole: true };
            let near = false;
            for (let ty = e.y0; ty < e.y1 && !near; ty++) for (let tx = e.x0; tx < e.x1; tx++) { const ch = a.tiles[ty][tx]; if (SLOPES[ch] || CEILS[ch]) { near = true; break; } }
            if (near) {
                const t = regionCanvas((e.x1 - e.x0) * TS, (e.y1 - e.y0) * TS), tx2 = t.getContext("2d");
                tx2.translate(-e.x0 * TS, -e.y0 * TS);
                drawTerrain(tx2, a, e);
                tx2.setTransform(1, 0, 0, 1, 0, 0);
                x.save(); x.beginPath(); x.rect(r.x0 * TS, r.y0 * TS, (r.x1 - r.x0) * TS, (r.y1 - r.y0) * TS); x.clip();
                x.drawImage(t, 0, 0, (e.x1 - e.x0) * TS, (e.y1 - e.y0) * TS, e.x0 * TS, e.y0 * TS, (e.x1 - e.x0) * TS, (e.y1 - e.y0) * TS);
                x.restore();
                return;
            }
        }
        const R = r || { x0: 0, y0: 0, x1: a.w, y1: a.h };
        const X0 = Math.max(0, R.x0 - 1), Y0 = Math.max(0, R.y0 - 2), X1 = Math.min(a.w, R.x1 + 1), Y1 = Math.min(a.h, R.y1 + 2);
        x.save();
        if (r) { x.beginPath(); x.rect(R.x0 * TS, R.y0 * TS, (R.x1 - R.x0) * TS, (R.y1 - R.y0) * TS); x.clip(); }
        const ladder = zoneLadder(spr("ladder", 0)), rope = spr("rope", 0), ropeTop = spr("ropeTop", 0), spikes = spr("spikes", 0);
        for (let ty = Y0; ty < Y1; ty++) for (let tx = X0; tx < X1; tx++) {
            const ch = a.tiles[ty][tx], px = tx * TS, py = ty * TS;
            if (ch === "#" || ch === "%") drawWall(x, a, tx, ty, 0, 0);
            else if (ch === "H") {
                const look = a.ladderLook && a.ladderLook.get(tx + "," + ty);
                // weathered: one picture or the other, as the tile falls; broken: its lowest tile snapped, the rest as any ladder
                if (look === "W") x.drawImage(spr("ladderOld", hashTile(tx * 5 + 3, ty * 11 + 7) < 0.3 ? 1 : 0), px, py);
                else if (look === "B" && tileAtIn(a, tx, ty + 1) !== "H") x.drawImage(zoneLadder(spr("ladderBroken", 0)), px, py);
                else x.drawImage(ladder, px, py);
            }
            else if (ch === "|") x.drawImage(solidAt2(a, tx, ty - 1) ? ropeTop : a.tiles[ty + 1] && a.tiles[ty + 1][tx] !== "|" ? spr("ropeEnd", 0) : rope, px, py);
            else if (ch === "^") x.drawImage(spikes, px, py + 8);
        }
        // the slopes, after the walls round them (the floor top along a slope's foot runs on over the rock under it)
        for (let ty = Y0; ty < Y1; ty++) for (let tx = X0; tx < X1; tx++) if (SLOPES[a.tiles[ty][tx]]) drawSlope(x, a, tx, ty); else if (CEILS[a.tiles[ty][tx]]) drawCeil(x, a, tx, ty);
        for (let ty = Y0; ty < Y1; ty++) for (let tx = X0; tx < X1; tx++) if (SLOPES[a.tiles[ty][tx]]) slopeJoints(x, a, tx, ty); else if (CEILS[a.tiles[ty][tx]]) ceilJoints(x, a, tx, ty);
        for (let ty = Y0; ty < Y1; ty++) for (let tx = X0; tx < X1; tx++) if (SLOPES[a.tiles[ty][tx]] || CEILS[a.tiles[ty][tx]]) slopeCorners(x, a, tx, ty);
        for (const run of beamRuns(a)) {
            if (run.ty < Y0 || run.ty >= Y1 || run.end < X0 || run.tx >= X1) continue;
            platform(x, run.tx * TS, run.ty * TS, (run.end - run.tx + 1) * TS, { left: run.wallL, right: run.wallR, seed: run.tx * 7 + run.ty * 13, hung: run.held === "chains" || run.held === "ropes", run, a });
        }
        /* Shade cast on the back wall under every overhang and beam. (23 Oct 2026, the owner's: "ceiling slopes have some
           shadow/shading that shouldn't be there") a ceiling slope under a wall had the wall's shade laid over its own
           rock, a dark band across the top of it. The shade now goes behind what is drawn (on the back wall, as it says,
           never over rock, a ladder or a joint's curve), not under a wall that has a ceiling slope beneath it, and a
           ceiling slope casts its own along its underside, a column at a time, as a flat ceiling's. */
        x.save(); x.globalCompositeOperation = "destination-over";
        const shadeCol = (X, top, w) => { const gr = x.createLinearGradient(0, top, 0, top + 10); gr.addColorStop(0, "rgba(0,0,0,0.5)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(X, top, w, 10); };
        for (let ty = Y0; ty < Math.min(Y1, a.h - 1); ty++) for (let tx = X0; tx < X1; tx++) {
            const ch = a.tiles[ty][tx], below = a.tiles[ty + 1][tx];
            if ((ch === "#" || ch === "=") && below !== "#" && below !== "%" && !CEILS[below] && !isHidden(a, tx, ty + 1) && !(a.skyMask && a.skyMask[(ty + 1) * a.w + tx]))
                shadeCol(tx * TS, (ty + 1) * TS - (ch === "=" ? TS - PLAT_H : 0), TS);
            const C = CEILS[ch];
            if (C && !isHidden(a, tx, ty) && !(a.skyMask && a.skyMask[ty * a.w + tx])) {
                // from the rock's own edge in each column as drawn (a joint's curve moves it off the line a pixel or two)
                const T = x.getTransform(), cx0 = tx * TS + T.e, cy0 = ty * TS - 4 + T.f, ok = cx0 >= 0 && cy0 >= 0 && cx0 + TS <= x.canvas.width && cy0 + TS + 8 <= x.canvas.height;
                const px = ok ? x.getImageData(cx0, cy0, TS, TS + 8).data : null;
                for (let i = 0; i < TS; i++) {
                    let top = ty * TS + Math.round(slopeY(C, i + 0.5) - 0.5);
                    if (px) { let j = 0; while (j < TS + 8 && px[(j * TS + i) * 4 + 3] > 200) j++; if (j > 0 && j < TS + 8) top = ty * TS - 4 + j; }
                    shadeCol(tx * TS + i, top, 1);
                }
            }
        }
        x.restore();
        x.restore();
    }
    // a picture to read back from (willReadFrequently: kept off the graphics card, so reading it does not stall)
    const readCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true }); x.imageSmoothingEnabled = false; return c; };
    let regionCv = null;
    const regionCanvas = (w, h) => {
        if (!regionCv || regionCv.width < w || regionCv.height < h) regionCv = readCanvas(Math.max(w, regionCv ? regionCv.width : 0), Math.max(h, regionCv ? regionCv.height : 0));
        const x = regionCv.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; x.clearRect(0, 0, regionCv.width, regionCv.height); x.imageSmoothingEnabled = false;
        return regionCv;
    };
    const blankCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.imageSmoothingEnabled = false; return c; };
    const toneOf = (a, k) => (a.settings && a.settings.tone && a.settings.tone[k]) || (k === "back" ? { l: -40, s: -15 } : null);
    function renderStatic(a) {
        const c = blankCanvas(a.w * TS, a.h * TS), x = c.getContext("2d");
        drawBackdrop(x, a);
        drawFrame(x, a, a.frameParts);
        clearSky(x, a);
        applyTone(c, toneOf(a, "env"));
        if (a.back) { const b = blankCanvas(c.width, c.height); drawBackWalls(b.getContext("2d"), a); x.drawImage(applyTone(b, toneOf(a, "back")), 0, 0); }
        for (const o of a.backObjs) drawBackObject(x, a, o);
        /* THE HIDDEN ROOMS, OPEN (21 Oct 2026, the owner's: "once entered they should have the walls appear as they
           would when you're not in a hidden room - rather than a cut-out within the wall ... But make sure the wall
           looks normal/full when you're not in the room"). In the still picture a hidden room's walls are drawn as
           if it were rock (no floor's top, no outline, no corner along it), so as its cover faded it showed as a
           hole cut in the wall. So for each, a picture of its walls as they would be were it open (over what is
           behind them, taken now, before the walls go on), shown as its cover goes (draw: reveal). */
        const unders = (a.covers || []).map(cv => {
            const xs = cv.tiles.map(t => t[0]), ys = cv.tiles.map(t => t[1]);
            const box = { x0: Math.max(0, Math.min(...xs) - 2), y0: Math.max(0, Math.min(...ys) - 2), x1: Math.min(a.w, Math.max(...xs) + 3), y1: Math.min(a.h, Math.max(...ys) + 3) };
            const u = blankCanvas((box.x1 - box.x0) * TS, (box.y1 - box.y0) * TS);
            u.getContext("2d").drawImage(c, -box.x0 * TS, -box.y0 * TS);
            return { cv, box, u };
        });
        const wt = toneOf(a, "walls");
        // (23 Oct 2026) the walls on a picture of their own, always (where a slope meets a floor its corner is shaved: what is behind shows)
        // (a picture made for reading back where there are slopes: their joints and the water's shapes read it)
        const terr = a.slopes ? readCanvas(c.width, c.height) : blankCanvas(c.width, c.height);
        drawTerrain(terr.getContext("2d"), a);
        x.drawImage(toneOn(wt) ? applyTone(terr, wt) : terr, 0, 0);
        for (const { cv, box, u } of unders) {
            const b = Object.create(a), hid = a.hidden.slice();
            for (const [tx, ty] of cv.tiles) hid[ty * a.w + tx] = 0;
            b.hidden = hid;
            const t = blankCanvas(u.width, u.height), tx2 = t.getContext("2d");
            tx2.translate(-box.x0 * TS, -box.y0 * TS);
            drawTerrain(tx2, b, box);
            u.getContext("2d").drawImage(toneOn(wt) ? applyTone(t, wt) : t, 0, 0);
            cv.reveal = { c: u, x: box.x0 * TS, y: box.y0 * TS };
        }
        /* WATER BEHIND THE WALLS (21 Oct 2026, the owner's: "why don't we have the water appear behind walls, and i'll
           just add a water tile behind the corners? so we can keep the rounded corners"). Water painted on a wall's
           tile shows only where the wall is see-through (a rounded corner's cut), never over the rock: for each such
           tile, the shape of its see-through pixels, kept for drawWater to draw within. */
        a.underWall = new Map();
        if (a.water.size) {
            const t = blankCanvas(TS, TS), tx2 = t.getContext("2d");
            for (const k of a.water) {
                const [wx, wy] = k.split(",").map(Number), ch = a.tiles[wy] && a.tiles[wy][wx];
                if (ch !== "#" && ch !== "%") continue;
                tx2.clearRect(0, 0, TS, TS); drawWall(tx2, a, wx, wy, wx * TS, wy * TS);
                const d = tx2.getImageData(0, 0, TS, TS).data, p = new Path2D(); let any = false;
                for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) if (d[(j * TS + i) * 4 + 3] < 250) { p.rect(wx * TS + i, wy * TS + j, 1, 1); any = true; }
                if (any) a.underWall.set(k, p);
            }
        }
        /* (23 Oct 2026, the owner's: "Water doesn't appear behind slopes") water painted on a slope's tile filled the
           whole tile, over its rock too. Now as on a wall's: only where the tile is see-through, taken from the walls'
           own picture as drawn (its line, its rounded joints and ends), a row of pixels at a time; for every slope's
           tile, not only those painted wet (a pool rising in play floods them later) */
        if (a.slopes) {
            const tc = terr.getContext("2d");
            for (let wy = 0; wy < a.h; wy++) for (let wx = 0; wx < a.w; wx++) {
                const ch = a.tiles[wy][wx], k = wx + "," + wy;
                if (!SLOPES[ch] && !CEILS[ch]) continue;
                const d = tc.getImageData(wx * TS, wy * TS, TS, TS).data, p = new Path2D(); let any = false;
                for (let j = 0; j < TS; j++) for (let i = 0; i < TS;) {
                    if (d[(j * TS + i) * 4 + 3] >= 250) { i++; continue; }
                    let e = i; while (e < TS && d[(j * TS + e) * 4 + 3] < 250) e++;
                    p.rect(wx * TS + i, wy * TS + j, e - i, 1); any = true; i = e;
                }
                a.underWall.set(k, any ? p : null);
            }
        }
        renderCovers(a);
        return c;
    }

    /* ================================================================ THE GAME */
    const state = {
        mode: "title",        // title | card | play | dying | clear | paused | over | zoneclear
        t: 0, zi: 0, ai: 0, lives: LIVES, score: 0, coins: 0, time: 0, zoneTime: 0,
        pausedFrom: null, cam: { x: 0, y: 0 }, shake: 0, pops: [], parts: [], tally: null
    };
    let hero = null;
    let best = {};
    try { best = JSON.parse(localStorage.getItem(BEST_KEY) || "{}") || {}; } catch (e) { best = {}; }
    /* (26 Oct 2026) A zone's time is that zone's alone now (zoneTime, begun again at its first passage): it was the
       run's so far, so the Stone Quarry's took in the Mine Labyrinth's, and a run begun there from the title beat
       any whole run's. The zone bests kept before then are let go, once, all but the Mine Labyrinth's (a run always
       began its time there, so that one was right); they were admins' test runs. */
    if (!best.zoneOnly) {
        for (const k of Object.keys(best)) if (/^z[1-9]\d*$/.test(k)) delete best[k];
        best.zoneOnly = 1;
        try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* private mode */ }
    }

    function newHero(x, y) {
        return { x, y, w: BODY_W, h: STAND_H, vx: 0, vy: 0, face: 1, ground: false, coyote: 0, wall: 0, wallLock: 0, wallGrace: 0, wallSide: 0,
            climb: null, crouch: false, swim: false, push: 0, anim: 0, room: null, safe: { x, y }, safeSet: false, hurt: 0, landT: 0, onBeam: false, dropUntil: 0 };
    }

    function toTitle() {
        state.mode = "title"; state.t = 0;
        sfx("stop");
        sfx("start", 1, { title: true });
        titleAct();
    }
    // The zones a run goes through in order, and the secret one at the end (13 Oct 2026).
    const mainZones = () => LEVELS.zones.filter(z => !z.secret && !z.lab).length;   // (14 Oct 2026) the new zones are "lab" ones: in the level select, not in a run yet
    const secretZone = () => LEVELS.zones.findIndex(z => z.secret);
    /* The furthest zone the title's picker offers (26 Oct 2026, the owner's: the Heart of the Labyrinth is not
       to be picked there once reached): the last of the run's zones at most. A save that reached the Heart
       (reached 5) keeps it, and picks from every zone before it. */
    const pickTop = () => Math.max(0, Math.min(progress.reached, mainZones() - 1));
    // Every ruby in the main zones, as ids; how many of them have been found.
    let rubyIds = null;
    function allRubies() {
        if (rubyIds) return rubyIds;
        rubyIds = [];
        // (each ruby keeps the name it was first given, rid, wherever the editor moves it)
        LEVELS.zones.forEach((z, zi) => { if (z.secret || z.lab) return; z.acts.forEach((a, ai) => (a.objects || []).forEach(o => { if (o.type === "gem") rubyIds.push(rubyId(zi, ai, o)); })); });
        return rubyIds;
    }
    const rubiesFound = () => allRubies().filter(id => progress.rubies.includes(id)).length;
    function rubyId(zi, ai, o) { return o.rid || zi + "-" + ai + "-" + Math.floor((o.x - 2) / TS) + "-" + Math.floor((o.y - 3) / TS); }
    function titleAct() {
        const acts = LEVELS.zones.flatMap((z, zi) => z.secret || z.lab ? [] : z.acts.map((x, ai) => [zi, ai]));
        let pick = acts[Math.floor(Math.random() * acts.length)];
        if (act && acts.length > 1) while (pick[0] === act.zi && pick[1] === act.ai) pick = acts[Math.floor(Math.random() * acts.length)];
        act = loadAct(pick[0], pick[1]);
        hero = newHero(act.start.x, act.start.y);
        state.titleT = 0;
        // the rooms worth looking at (mostly open), in a random order, for the view to drift between
        const open = [];
        for (let ry = 0; ry * ROOM_H < act.h; ry++) for (let rx = 0; rx * ROOM_W < act.w; rx++) {
            let n = 0;
            for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) if (tileAt(rx * ROOM_W + x, ry * ROOM_H + y) !== "#") n++;
            if (n > ROOM_W * ROOM_H * 0.55) open.push({ x: rx * ROOM_W * TS, y: ry * ROOM_H * TS });
        }
        for (let i = open.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [open[i], open[j]] = [open[j], open[i]]; }
        state.titleRoute = open.length ? open : [{ x: 0, y: 0 }];
        state.titleLeg = 0;
        state.cam.x = state.titleRoute[0].x; state.cam.y = state.titleRoute[0].y;
    }
    function newRun() {
        state.zi = Math.min(state.pickZone || 0, pickTop()); state.ai = 0; state.lives = LIVES; state.score = 0; state.zoneTime = 0;
        state.practice = false; state.endless = false;
        startAct();
    }
    // Every act of every zone, in order, for the level select.
    const allActs = () => LEVELS.zones.flatMap((z, zi) => z.acts.map((a, ai) => ({ zi, ai, name: z.name, act: ai + 1 })));   // the secret one too: it is a test list
    function openSelect() {
        state.mode = "select"; state.t = 0;
        state.sel = state.sel || { row: 0, atFlag: false, endless: true };
        sfx("pauseBlip");
    }
    function selectKey(k) {
        const S = state.sel, acts = allActs(), rows = acts.length + 2;
        if (k === "up") S.row = (S.row + rows - 1) % rows;
        else if (k === "down") S.row = (S.row + 1) % rows;
        else if ((k === "left" || k === "right" || k === "jump" || k === "start") && S.row === acts.length) S.atFlag = !S.atFlag;
        else if ((k === "left" || k === "right" || k === "jump" || k === "start") && S.row === acts.length + 1) S.endless = !S.endless;
        else if ((k === "jump" || k === "start") && S.row < acts.length) {
            const pick = acts[S.row];
            state.zi = pick.zi; state.ai = pick.ai; state.lives = LIVES; state.score = 0; state.zoneTime = 0;
            state.practice = true; state.endless = S.endless;
            startAct();
            if (S.atFlag && act.flag) {
                act.flag.taken = true;
                hero = newHero(act.flag.x + 6 - BODY_W / 2 + 10, act.flag.y + act.flag.h - STAND_H);
                snapCamera();
            }
            return;
        }
        sfx("pauseBlip");
    }
    function drawSelect() {
        shade(0.82);
        FONT.draw(g, "LEVEL SELECT", VW / 2, 14, { align: "center", scale: 2, ramp: GOLD, outline: "#2a1804" });
        FONT.draw(g, "PRACTICE: NO BEST TIMES ARE KEPT", VW / 2, 34, { align: "center", color: "#a89a88" });
        const acts = allActs(), S = state.sel;
        // the list scrolls so the chosen row is always in view, between the heading and the help
        const TOP = 52, BOTTOM = VH - 34;
        let yList = 0, rowY = {};
        { let yy = 0, zone2 = -1; acts.forEach((a, i) => { if (a.zi !== zone2) { zone2 = a.zi; yy += 13; } rowY[i] = yy; yy += 13; }); yy += 6; rowY[acts.length] = yy; rowY[acts.length + 1] = yy + 13; yList = yy + 26; }
        const want = rowY[S.row] - (BOTTOM - TOP) / 2;
        S.scroll = S.scroll === undefined ? 0 : S.scroll;
        S.scroll += (Math.max(0, Math.min(Math.max(0, yList - (BOTTOM - TOP)), want)) - S.scroll) * 0.25;
        g.save(); g.beginPath(); g.rect(0, TOP - 7, VW, BOTTOM - TOP + 5); g.clip();
        let y = TOP + 6 - Math.round(S.scroll);
        const row = (i, text, value) => {
            const on = S.row === i;
            if (on) g.drawImage(spr("coin", Math.floor(frameNo / 8)), 54, y - 4);
            FONT.draw(g, text, 72, y, { color: on ? "#ffffff" : "#a89878" });
            if (value) FONT.draw(g, value, 268, y, { align: "right", color: on ? "#f2cc4e" : "#9a6410" });
            y += 13;
        };
        let zone = -1;
        acts.forEach((a, i) => {
            if (a.zi !== zone) { zone = a.zi; FONT.draw(g, a.name, 72, y, { ramp: GOLD }); y += 13; }
            row(i, "PASSAGE " + (ROMAN[a.ai] || a.act));
        });
        y += 6;
        row(acts.length, "START", S.atFlag ? "AT THE FLAG" : "AT THE BEGINNING");
        row(acts.length + 1, "LIVES", S.endless ? "NO END OF THEM" : "THREE");
        g.restore();
        FONT.draw(g, "UP AND DOWN TO CHOOSE, SPACE TO GO", VW / 2, VH - 26, { align: "center", color: "#a89a88" });
        FONT.draw(g, "P TO GO BACK", VW / 2, VH - 14, { align: "center", color: "#7a6e60" });
    }
    /* THE HAUNTING (17 Oct 2026, the owner's: "a haunting ghostly echo when in the dark areas (doesn't apply
       to dark depths zone)"): how far into a dark area Scout is (a box: full inside, fading over its soft edge;
       painted dark: full, a transition half), told to the music when it changes. Never in the Depths, nor in a
       passage dark all through. */
    function hauntHere() {
        if (!act || ZK === "dark" || darkOn()) return 0;
        const h = hero, x = h.x + h.w / 2, y = h.y + h.h / 2;
        let v = 0;
        for (const z of act.darkZones) {
            if (x < z.x || x > z.x + z.w || y < z.y || y > z.y + z.h) continue;
            const f = Math.max(1, z.fade || 0), edge = Math.min(x - z.x, z.x + z.w - x, y - z.y, z.y + z.h - y);
            v = Math.max(v, Math.min(1, edge / f));
        }
        if (act.darkRows) { const c = (act.darkRows[Math.floor(y / TS)] || "")[Math.floor(x / TS)]; if (c === "d") v = 1; else if (c === "t") v = Math.max(v, 0.5); }
        return v;
    }
    function stepHaunt() {
        const v = hauntHere();
        if (act.hauntSaid === undefined || Math.abs(v - act.hauntSaid) > 0.04 || (v === 0 && act.hauntSaid)) { act.hauntSaid = v; sfx("haunt", v); }
    }
    function startAct() {
        if (!state.practice && state.zi > progress.reached) { progress.reached = state.zi; saveProgress(); }
        act = loadAct(state.zi, state.ai);
        hero = newHero(act.start.x, act.start.y);
        state.actScore = state.score;
        state.coins = 0; state.time = 0; state.pops = []; state.parts = [];
        if (state.ai === 0) state.zoneTime = 0;   // (26 Oct 2026: a zone's time begins at its first passage, see best)
        state.mode = "card"; state.t = 0;
        // the touch pad's two wheel buttons, where there are wheels to turn
        const turnPad = padEl && padEl.querySelector(".rr-turn");
        if (turnPad) turnPad.hidden = !(act.doors.length || act.crates.some(c => c.hang0));
        snapCamera();
        sfx("stop");
        sfx("start", 1 + state.ai * 3, {});
        sfx("setZone", act.zone.music || 1);
        if (state.ai === 0 && state.zi > 0) sfx("zone", act.zone.music || 1); else sfx("titleCard");
    }
    function nextAct() {
        const zone = LEVELS.zones[state.zi];
        if (state.ai + 1 < zone.acts.length) { state.ai++; startAct(); return; }
        state.mode = "zoneclear"; state.t = 0;
        const key = "z" + state.zi;
        if (!state.practice && (!best[key] || state.zoneTime < best[key])) { best[key] = state.zoneTime; saveBest(); state.zoneBest = true; } else state.zoneBest = false;
    }
    /* AFTER A ZONE: on into the next, lives and score carried; after the
       last, the Heart of the Labyrinth if every ruby has been found, or else
       the end (and how many rubies are still out there). */
    function afterZone() {
        const sz = secretZone();
        if (state.practice) { toTitle(); return; }
        if (state.zi + 1 < mainZones()) { state.zi++; state.ai = 0; startAct(); return; }
        if (state.zi !== sz && sz >= 0 && rubiesFound() >= allRubies().length) { state.zi = sz; state.ai = 0; startAct(); return; }
        state.mode = "ending"; state.t = 0; sfx("best");
    }
    function saveBest() { try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* private mode */ } }
    /* THE PAUSE MENU (13 Oct 2026, the owner's: an END GAME option, and a
       RESTART PASSAGE button in place of the words about R). Three
       buttons; up and down (or the mouse) choose, jump or Enter (or a
       click) presses. RESTART PASSAGE: the passage from its start, its
       coins and score undone, the lives as they are. END GAME asks once
       more ("SURE?") before it goes back to the title. */
    const PAUSE_ITEMS = ["PLAY ON", "RESTART PASSAGE", "END GAME"];
    const PAUSE_BTN = { w: 132, h: 17, y0: 92, gap: 22 };
    const pauseBtnAt = i => ({ x: Math.round(VW / 2 - PAUSE_BTN.w / 2), y: PAUSE_BTN.y0 + i * PAUSE_BTN.gap, w: PAUSE_BTN.w, h: PAUSE_BTN.h });
    function pauseMove(d) { state.pauseSel = ((state.pauseSel || 0) + d + PAUSE_ITEMS.length) % PAUSE_ITEMS.length; state.pauseSure = false; sfx("pauseBlip"); }
    function pausePick() {
        const i = state.pauseSel || 0;
        if (i === 0) { resume(); return; }
        if (i === 1) {
            state.mode = state.pausedFrom || "play"; sfx("setMuffled", false); sfx("pauseBlip");
            state.score = state.actScore || 0;
            startAct();
            return;
        }
        if (!state.pauseSure) { state.pauseSure = true; sfx("pauseBlip"); return; }
        sfx("setMuffled", false);
        toTitle();
    }
    function pause(quiet) {
        if (state.mode !== "play" && state.mode !== "card") return;
        state.pausedFrom = state.mode; state.mode = "paused";
        state.pauseSel = 0; state.pauseSure = false;
        held.clear();
        if (!quiet) sfx("pauseBlip");   // (26 Oct 2026: quiet when another game comes forward, see ONE GAME IN FRONT)
        sfx("setMuffled", true);
    }
    function resume() {
        if (state.mode !== "paused") return;
        state.mode = state.pausedFrom || "play";
        sfx("setMuffled", false);
        sfx("pauseBlip");
    }

    /* ---------------------------------------------------------------- MOVEMENT
       Box against tiles, one axis at a time. Beams are solid only from above,
       and only when not dropping through them (down + jump). */
    // Up out of a flat swim, if there is room to: centred where he was, else with his feet or his head where they were. True if he is up.
    function unSwim(h) {
        const d = STAND_H - CROUCH_H;
        for (const y of [h.y - Math.floor(d / 2), h.y - d, h.y]) if (!overlapsSolid(h, h.x, y, h.w, STAND_H)) { h.swim = false; h.y = y; h.h = STAND_H; return true; }
        return false;
    }
    function overlapsSolid(b, x, y, w, h, noSlopes) {
        const x0 = Math.floor(x / TS), x1 = Math.floor((x + w - 0.01) / TS);
        const y0 = Math.floor(y / TS), y1 = Math.floor((y + h - 0.01) / TS);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
            if (solidAt(tx, ty)) return true;
            // a slope: the rock under its line (its line taken where it is highest under him, his edges a pixel in, as he stands on it)
            if (act.slopes && !noSlopes) {
                const S = SLOPES[tileAt(tx, ty)];
                if (S) { const l0 = Math.max(x + 1, tx * TS) - tx * TS, l1 = Math.min(x + w - 1, tx * TS + TS) - tx * TS; if (l1 > l0 && y + h > ty * TS + Math.min(slopeY(S, l0), slopeY(S, l1)) + 0.01) return true; }
            }
            // a ceiling slope: the rock over its line (its line taken where it is lowest over him), slope or no
            if (act.slopes) {
                const C = CEILS[tileAt(tx, ty)];
                if (C) { const l0 = Math.max(x, tx * TS) - tx * TS, l1 = Math.min(x + w, tx * TS + TS) - tx * TS; if (l1 > l0 && y < ty * TS + Math.max(slopeY(C, l0), slopeY(C, l1)) - 0.01) return true; }
            }
        }
        for (const c of act.crates) if (c !== b && x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y) return true;
        // a prop set solid (14 Oct 2026, the editor's: a barrel to climb over, not walk through)
        for (const s of act.solids) if (x < s.x + s.w && x + w > s.x && y < s.y + s.h && y + h > s.y) return true;
        return false;
    }
    const solidPropAt = (px, py) => act.solids.some(s => px >= s.x && px < s.x + s.w && py >= s.y && py < s.y + s.h);
    // A beam, or the top rung of a ladder (stood on, as in every old game), is a floor from above.
    const ledgeTile = (tx, ty) => { const ch = tileAt(tx, ty); return ch === "=" || ch === "c" || (ch === "H" && tileAt(tx, ty - 1) !== "H"); };
    // A moving platform under the given span of feet, between two heights: its top, and it.
    function moverUnder(x, w, yFrom, yTo) {
        if (!act.movers.length) return null;
        for (const m of act.movers) if (x + w > m.x + 1 && x < m.x + m.w - 1 && yFrom <= m.y + 0.01 && yTo >= m.y) return m;
        return null;
    }
    function beamUnder(x, w, yFrom, yTo) {
        const x0 = Math.floor(x / TS), x1 = Math.floor((x + w - 0.01) / TS);
        const t0 = Math.floor(yFrom / TS), t1 = Math.floor(yTo / TS);
        for (let ty = t0; ty <= t1; ty++) {
            const top = ty * TS;
            if (yFrom <= top + 0.01 && yTo >= top) for (let tx = x0; tx <= x1; tx++) if (ledgeTile(tx, ty)) return top;
        }
        return topUnder(x, w, yFrom, yTo);
    }
    // A prop that bears weight from above only (the editor's "top"), as a beam does.
    function topUnder(x, w, yFrom, yTo) {
        let best = null;
        for (const s of act.tops) if (x + w > s.x && x < s.x + s.w && yFrom <= s.y + 0.01 && yTo >= s.y && (best === null || s.y < best)) best = s.y;
        return best;
    }
    const currentAt = (px, py) => { for (const c of act.currents) if (px >= c.x && px < c.x + c.w && py >= c.y && py < c.y + c.h) return c; return null; };
    /* (23 Oct 2026, the owner's: "on broken ladders scout is able to climb up empty space underneath the bottom of it!")
       a ladder is climbable only as far down as it is drawn: a broken one's lowest tile is snapped off at its eleventh row
       (LADDER_BROKEN_END), the rest of the tile empty. He takes hold, and keeps it, only with some of him above where it
       ends. (Every other ladder's and rope's picture reaches its tile's foot, the rope's end within a pixel.) */
    const LADDER_BROKEN_END = 11;
    const ladderEnd = (tx, ty) => (act.ladderLook && act.ladderLook.get(tx + "," + ty) === "B" && tileAt(tx, ty + 1) !== "H" ? ty * TS + LADDER_BROKEN_END : ty * TS + TS);
    function climbableAt(b) {
        const cx = Math.floor((b.x + b.w / 2) / TS);
        for (let ty = Math.floor(b.y / TS); ty <= Math.floor((b.y + b.h - 1) / TS); ty++) {
            const ch = tileAt(cx, ty);
            if (ch === "|") return { tx: cx, ch };
            if (ch === "H" && b.y < ladderEnd(cx, ty) - 1) return { tx: cx, ch };
        }
        return null;
    }
    function climbableBelow(b) {
        const cx = Math.floor((b.x + b.w / 2) / TS), ty = Math.floor((b.y + b.h + 1) / TS);
        const ch = tileAt(cx, ty);
        return ch === "H" || ch === "|" ? { tx: cx, ch } : null;
    }

    function stepHero() {
        const h = hero;
        const L = held.has("left"), R = held.has("right"), U = held.has("up"), Dn = held.has("down");
        const dir = (R ? 1 : 0) - (L ? 1 : 0);
        /* (16 Oct 2026, the owner's) UP NO LONGER JUMPS, as it did from 13 Oct:
           space jumps; up climbs, goes through a doorway, and held standing
           still looks up. */
        /* A DOORWAY (14 Oct 2026, the editor's): up in front of one goes in,
           and out of the doorway it leads to (to); a locked one wants its key. */
        if (act.travel) { h.vx = 0; h.vy = 0; return; }
        const atDoor = act.doorways.length && h.ground ? act.doorways.find(d => h.x + h.w / 2 > d.x + 4 && h.x + h.w / 2 < d.x + d.w - 4 && Math.abs(h.y + h.h - (d.y + d.h)) < 3) : null;
        if (atDoor && recently("up", BUFFER) && !climbableAt(h)) { pressedAt.up = -99; enterDoorway(atDoor); return; }
        const wantJump = recently("jump", BUFFER) || (!h.ground && h.wallGrace > 0 && recently("jump", BUFFER + 4));
        if (h.hurt > 0) h.hurt--;
        if (act.entering) { h.vx = 0; h.x += ((act.door.x + act.door.w / 2 - h.w / 2) - h.x) * 0.25; h.anim += 0.15; return; }
        if (h.mantle) { stepMantle(h); return; }
        if (h.ground || h.climb || h.swim || h.ride || h.cart) h.airFrom = h.y + h.h;   // (where he last stood, climbed or swam: how high a mantle may take him)
        // (22 Oct 2026) in a mine cart; on a swing or a zipline; taking hold of one
        if (h.cart) { stepCartRider(h, U, wantJump); return; }
        if (h.ride) { stepRide(h, dir, U, Dn, wantJump); return; }
        if (act.nx && (act.nx.swings.length || act.nx.zips.length) && tryGrab(h, U)) { stepRide(h, dir, U, Dn, false); return; }
        if (act.nx && act.nx.sluices.length && recently("up", BUFFER) && useLever(h)) pressedAt.up = -99;

        /* A WHEEL (13 Oct 2026, the owner's: "pressing two keys alternately,
           like Z and X"): beside a shut blast door, or under or on a hatch,
           on the ground, on a ladder or under water, Z then X then Z... each
           change of key turns it a notch. The same key twice does nothing. */
        /* (16 Oct 2026) Z or X beside a hanging crate's rope cuts it, with the
           knife; without it, he is told he needs one. Otherwise they turn a wheel. */
        const nearRope = act.crates.find(c => c.hang && Math.abs(h.x + h.w / 2 - (c.x + 8)) < 16 && h.y < c.y - 6 && h.y + h.h > c.ropeTop);
        act.ropeNear = nearRope && act.hasKnife && !act.cutOnce ? nearRope : null;
        if (recently("turnA", 1) || recently("turnB", 1)) {
            const k = recently("turnA", 1) ? "A" : "B";
            pressedAt.turnA = pressedAt.turnB = -99;
            if (nearRope) cutRope(nearRope, h);
            else if (act.doors.length) {
                const wd = act.doors.find(d => !d.open && nearWheel(d, h));
                if (wd) { if (wd.lastKey !== k) { wd.lastKey = k; turnWheel(wd); } else sfx("pauseBlip"); }
            }
        }

        /* CLIMBING: up or down on a ladder or rope takes hold; jump lets go. */
        const here = climbableAt(h);
        if (h.letGo > 0) h.letGo--;
        // (22 Oct 2026: not the ladder or rope he has just leapt from, for a moment, though up is held: holding up to leap high
        // off one caught him straight back onto it)
        /* (23 Oct 2026, the owner's: "Scout grabs things like ladders ... when he jumps to them. So the up arrow doesn't have
           to be pressed") a ladder catches him in the air as a rope does, with nothing pressed: his middle near its middle
           (a graze of its edge does not), not the ladder he last jumped off (until he stands again: a hop off one in place
           would catch him straight back), and not in a jump he made from its foot, already at it (up was there for that;
           so he can still jump past a ladder he stands at). A ladder above him out of reach catches him when he jumps to it. */
        if (h.ground) { h.leftLadderTx = null; h.jumpLadderTx = null; }
        const ladderCatch = here && here.ch === "H" && !h.ground && !h.swim && Math.abs(h.x + h.w / 2 - (here.tx * TS + TS / 2)) <= 6 && here.tx !== h.leftLadderTx && here.tx !== h.jumpLadderTx;
        if (!h.climb && here && (U || (Dn && !h.ground) || ladderCatch) && !(h.letGo > 0 && here.tx === h.letGoTx)) { if (!U && !Dn) { h.vy = 0; sfx("climb"); } h.climb = here; }
        // A rope catches him in the air, as in the old games (not just after he let go of it).
        // (17 Oct 2026) any rope but the one he has just jumped from catches him at once
        if (!h.climb && here && here.ch === "|" && !h.ground && !(h.letGo > 0 && here.tx === h.letGoTx)) { h.climb = here; h.ropeLeap = 0; sfx("climb"); }
        if (!h.climb && Dn && h.ground) { const below = climbableBelow(h); if (below) { h.climb = below; h.y += 3; h.ground = false; } }
        if (h.climb) {
            if (h.crouch) { h.crouch = false; h.y -= STAND_H - CROUCH_H; h.h = STAND_H; }   // (14 Oct 2026) stood up out of a crouch: his feet stay where they were, not 9px into the floor
            if (h.swim && !unSwim(h)) h.climb = null;   // (17 Oct 2026) up out of a flat swim, or no room to take hold
        }
        if (h.climb) {
            const onIt = climbableAt(h) || climbableBelow(h);
            if (!onIt) h.climb = null;
            else {
                // (14 Oct 2026) drawn to the middle of the ladder only where nothing solid is in the way:
                // a crate pushed half under a ladder used to have him pulled into it, stuck for good
                const cx = h.x + ((h.climb.tx * TS + TS / 2 - h.w / 2) - h.x) * 0.35;
                if (!act.crates.some(c => cx < c.x + c.w && cx + h.w > c.x && h.y < c.y + c.h && h.y + h.h > c.y)) h.x = cx;
                h.vx = 0;
                if (dir) h.face = dir;   // (17 Oct 2026) left or right on a rope or ladder turns him to leap that way
                h.vy = (U ? -CLIMB_V : 0) + (Dn ? CLIMB_V : 0);
                if (h.vy) { h.anim += 0.12; sfx("climb"); }
                moveY(h, h.vy, true);
                // over the top of a ladder: standing on the floor above
                if (U && !climbableAt(h)) { h.climb = null; h.vy = 0; }
                if (h.ground && Dn && !climbableBelow(h)) h.climb = null;
                /* LEAPING FROM A ROPE (17 Oct 2026, the owner's: "you can't jump TO the next rope, you just jump
                   straight down pretty much"): a jump from a rope is a leap the way he is pressing, or else the
                   way he faces, as far as a running jump (RUN_FAST, and a fuller jump than off a ladder); down
                   and jump only lets go. Off a ladder, as before but as quick. A direction pressed in the first
                   moments of the leap still turns it (ropeLeap). */
                /* (21 Oct 2026, the owner's: "reaching the top of a ladder throws you straight off, this is really
                   annoying", up and sideways, jump and a direction pressed): a ladder's jump had become the rope's
                   leap, a running one (RUN_FAST), carrying him four tiles sideways past the floor he was climbing
                   to. Off a LADDER now: near its top (the top rung within a hop of his feet), a hop up onto it, just
                   high enough, drifting a little the way he presses; lower down, a jump off it at half the speed,
                   a step away rather than a launch. The rope's leap as it was. */
                if (wantJump && h.climb) {
                    const rope = h.climb.ch === "|", d = dir || (rope && !Dn ? h.face || 1 : 0);
                    const ltx = h.climb.tx;
                    pressedAt.jump = pressedAt.up = -99; h.letGoTx = ltx; h.climb = null; h.letGo = 16; if (!rope) h.leftLadderTx = ltx;
                    /* (22 Oct 2026, the owner's: "scout can't jump from ropes or ladders onto something that's 2 tiles
                       away 2 tiles lower ... holding the left or right arrow key should make the jump more horizontal
                       initially"): with a direction held (and not up), the leap goes out flatter and a little faster,
                       rising only a little, so it carries him into a ledge or a tunnel's mouth below without striking
                       the rock over it; up with it still gives the high leap, for what is above */
                    const flat = Boolean(dir) && !U, LEAP_V = flat ? JUMP_V * 0.48 : JUMP_V * 0.92, LEAP_X = flat ? RUN_FAST * 1.1 : RUN_FAST;
                    if (rope && Dn && !dir) { h.vy = 0; h.vx = 0; }
                    else if (rope) { h.vy = -LEAP_V; h.vx = d * LEAP_X; h.airTop = LEAP_X; h.ropeLeap = 10; if (d) h.face = d; sfx("jump"); }
                    else {
                        let tty = Math.floor((h.y + h.h - 1) / TS); while (tileAt(ltx, tty - 1) === "H") tty--;
                        const rise = (h.y + h.h) - tty * TS;
                        h.ropeLeap = 0;
                        if (rise > 0 && rise <= 28 && ledgeTile(ltx, tty)) { h.vy = -Math.sqrt(2 * GRAVITY * (rise + 3)); h.vx = d * RUN_MAX * 0.3; h.airTop = RUN_MAX * 0.3; h.leap = Math.ceil(-h.vy / GRAVITY); }
                        /* (21 Oct 2026, the owner's: "earlier i could jump from the ladder to the rope, now i can't"):
                           lower down, with a direction pressed, the leap as from a rope again (the fling was the second
                           jump, h.ladderJumped below, not this); with none, a small jump off where he is */
                        else if (d) { h.vy = -LEAP_V; h.vx = d * LEAP_X; h.airTop = LEAP_X; h.ropeLeap = 10; }
                        else { h.vy = -JUMP_V * 0.72; h.vx = 0; h.airTop = RUN_MAX * 0.5; }
                        if (d) h.face = d; sfx("jump");
                    }
                    /* and that the only jump: the ordinary one further on (the same press, his grace from the ground
                       not yet run out) went off too, and took him up a full jump at the ladder's speed: the fling */
                    h.coyote = 0; h.ground = false; h.ladderJumped = true;
                }
                if (h.climb) return;
            }
        }

        /* SWIMMING (the Station; reworked 13 Oct 2026, when the owner found he
           could not get out of the water). Under, he sinks slowly; jump is a
           stroke upward, up held swims him up, down dives. Near the top he
           comes up and treads water with his head out, and from there jump
           is a full jump, out onto the side. His air lasts ten seconds
           under; at the surface it comes back. */
        if (h.leap > 0) h.leap--;
        const wet = (act.water.size || act.flood) && !(h.leap > 0) && wetAt(h.x + h.w / 2, h.y + h.h / 2);
        // into the water from above: a splash
        if (wet && !h.wet && h.vy > 1.5) sfx(TH.sand ? "sandPuff" : "waterSplash", h.vy > 3.5);
        h.wet = wet;
        if (wet) {
            // (14 Oct 2026) out of a crouch as the water takes him, but only where there is room to: the tide
            // coming in on him crawling under a pipe stood him up inside it, wedged for good
            if (h.crouch && !overlapsSolid(h, h.x, h.y - (STAND_H - CROUCH_H), h.w, STAND_H)) { h.crouch = false; h.y -= STAND_H - CROUCH_H; h.h = STAND_H; }
            const VXM = TH.sand ? 0.85 : 1.3;
            if (dir) { h.face = dir; h.vx += dir * 0.12; if (Math.abs(h.vx) > VXM) h.vx = Math.sign(h.vx) * VXM; } else h.vx *= 0.9;
            // a current: swept along it, faster than he can swim against
            // (14 Oct 2026, the editor's) a current is a box of water flowing across (dx), up or down (dy), strength k times the old pull
            const cur = currentAt(h.x + h.w / 2, h.y + h.h / 2);
            if (cur && cur.dx) { const d = Math.sign(cur.dx), k = cur.k; h.vx = Math.max(-2.8 * k, Math.min(2.8 * k, h.vx + d * 0.32 * k)); if (Math.sign(h.vx) !== d) h.vx = d * 0.4 * k; if (frameNo % 5 === 0) state.parts.push({ kind: "bubble", x: h.x + (d > 0 ? 0 : h.w), y: h.y + 6 + Math.random() * 10, vx: d * 1.4, vy: -0.2, t: 0 }); }
            if (cur && cur.dy) { const d = Math.sign(cur.dy), k = cur.k; h.currentVy = d * 0.22 * k; if (frameNo % 5 === 0) state.parts.push({ kind: "bubble", x: h.x + Math.random() * h.w, y: d > 0 ? h.y : h.y + h.h, vx: 0, vy: d * 1.2, t: 0 }); } else h.currentVy = 0;
            // how far under his head is (0 with it out)
            const cx = h.x + h.w / 2;
            let depth = 0; while (depth < 40 && wetAt(cx, h.y + 4 - depth)) depth += 2;
            /* (21 Oct 2026, the owner's: "When scout is underwater in a tunnel, at the top he stops the swimming
               sprite"): the water over his head ending at rock is a tunnel's roof, not the surface; he stays under */
            const roofed = solidAt(Math.floor(cx / TS), Math.floor((h.y + 4 - depth) / TS));
            const surfacing = depth <= 20 && !Dn && !roofed;
            /* SWIMMING FLAT (17 Oct 2026, the owner's: "a swimming sprite for
               scout ... so he can access 1 tile high narrow corridors"): under
               and swimming along, he stretches out flat, as low as a crawl;
               still, or come up to the top, he rights himself where there is
               room (in a tunnel one tile high he stays flat till out of it). */
            const flat = !surfacing && (dir !== 0 || Math.abs(h.vx) > 0.45);
            if (flat && !h.swim) { h.swim = true; h.y += Math.floor((STAND_H - CROUCH_H) / 2); h.h = CROUCH_H; }
            else if (!flat && h.swim) unSwim(h);
            if (surfacing && depth === 0 && wantJump) {
                // out of the water
                pressedAt.jump = pressedAt.up = -99;
                h.vy = -JUMP_V * (TH.sand ? 0.88 : 1); h.leap = 10; sfx(TH.sand ? "sandPuff" : "waterSplash", false);
                for (let i = 0; i < 5; i++) state.parts.push({ kind: "bubble", x: cx + (Math.random() - 0.5) * 10, y: h.y + h.h / 2, vx: (Math.random() - 0.5) * 0.6, vy: -0.8 - Math.random() * 0.6, t: 0 });
            } else {
                if (recently("jump", BUFFER) || recently("up", 2)) { pressedAt.jump = pressedAt.up = -99; h.vy = TH.sand ? -2 : -2.4; sfx(TH.sand ? "sandPuff" : "bubble"); for (let i = 0; i < 2; i++) state.parts.push({ kind: "bubble", x: cx + (Math.random() - 0.5) * 6, y: h.y + 4, vx: 0, vy: -0.6 - Math.random() * 0.4, t: 0 }); }
                if (surfacing) {
                    // treading water: up till the head is out, then bobbing there
                    if (depth > 0) h.vy = Math.max(-1.4, h.vy - 0.16);
                    else { h.vy *= 0.75; if (h.vy > 0.2) h.vy = 0.2; }
                } else {
                    h.vy = Math.min(TH.sand ? 1 : 0.8, h.vy + (TH.sand ? 0.08 : 0.06));
                    if (U) h.vy = Math.max(-1.5, h.vy - 0.2);
                    if (Dn) h.vy = Math.min(1.8, h.vy + 0.12);
                }
                if (h.currentVy) h.vy = Math.max(-2.6, Math.min(2.6, h.vy + h.currentVy));
                moveX(h, h.vx);
                moveY(h, h.vy, false);
                h.anim += Math.abs(h.vx) * 0.08 + 0.02;
                return;
            }
        }
        if (h.swim && !unSwim(h)) { h.swim = false; h.crouch = true; }
        if (h.ropeLeap > 0) { h.ropeLeap--; if (h.ground) h.ropeLeap = 0; else if (dir && Math.sign(h.vx) !== dir) { h.vx = dir * RUN_FAST; h.face = dir; } }
        /* CROUCH AND CRAWL: down on the ground; up again only where there is room. */
        /* THE SLIDE (21 Oct 2026, the owner's: "When running at full speed and going into a crawl, have scout slide a
           little bit before he stops. Give him some real nice movement physics"): down at a run throws him into a
           slide on his front, carried on by his speed against the floor's friction (holding on the way he is going
           carries him a little further, back the other way stops him sooner), dust spraying from under him, till he
           is down to a crawl's pace and crawls on. Off an edge he keeps the speed into the fall. */
        const wantCrouch = Dn && h.ground;
        if (wantCrouch && !h.crouch) {
            h.crouch = true; h.y += STAND_H - CROUCH_H; h.h = CROUCH_H;
            if (Math.abs(h.vx) > CRAWL_V + 0.6) { h.slideT = 1; dust(h.x + h.w / 2, h.y + h.h, 5); sfx("land"); }
        }
        if (!wantCrouch && h.crouch) {
            if (!overlapsSolid(h, h.x, h.y - (STAND_H - CROUCH_H), h.w, STAND_H)) { h.crouch = false; h.y -= STAND_H - CROUCH_H; h.h = STAND_H; h.slideT = 0; }
        }
        if (h.slideT && (!h.crouch || !h.ground || Math.abs(h.vx) <= CRAWL_V + 0.02)) h.slideT = 0;

        /* RUNNING (on ice, slow to start and slower to stop), and the run-up:
           on the ground, at full speed the way he is held, it builds; anything
           else (stopping, turning, a crouch, a push) and it is gone. In the
           air he keeps whatever speed he left the ground with. */
        const slick = h.ground && !h.onMover && act.slick.size > 0 && (() => { const ty = Math.round((h.y + h.h) / TS); for (let tx = Math.floor((h.x + 1) / TS); tx <= Math.floor((h.x + h.w - 2) / TS); tx++) if (act.slick.has(tx + "," + ty)) return true; return false; })();
        if (h.ground) {
            if (dir && Math.sign(h.vx) === dir && Math.abs(h.vx) >= RUN_MAX - 0.05 && !h.crouch && !h.push) h.runT = Math.min(RUN_UP, (h.runT || 0) + 1);
            else if (!dir || Math.sign(h.vx) !== dir || Math.abs(h.vx) < RUN_MAX - 0.3 || h.crouch) h.runT = 0;
        }
        const top = h.crouch ? CRAWL_V : h.ground ? RUN_MAX + (RUN_FAST - RUN_MAX) * (h.runT || 0) / RUN_UP : Math.max(RUN_MAX, h.airTop || 0);
        // flat out: a puff of dust at his heels now and then
        if (h.ground && h.runT >= RUN_UP && frameNo % 7 === 0) dust(h.face > 0 ? h.x : h.x + h.w, h.y + h.h, 1);
        if (h.wallLock > 0) h.wallLock--;
        if (h.slideT) {
            // sliding: no running, only the floor slowing him (less on ice)
            h.slideT++;
            const along = dir === Math.sign(h.vx), f = (slick ? 0.025 : 0.09) * (along ? 0.8 : dir ? 1.7 : 1);
            h.vx -= Math.sign(h.vx) * Math.min(Math.abs(h.vx) - CRAWL_V, f);
            if (h.slideT % 3 === 0) state.parts.push({ kind: "dust", x: h.x + h.w / 2 - Math.sign(h.vx) * 4 + (Math.random() - 0.5) * 6, y: h.y + h.h - 1, vx: -h.vx * 0.3 + (Math.random() - 0.5) * 0.6, vy: -0.3 - Math.random() * 0.7, t: 0 });
        } else if (dir && h.wallLock === 0) {
            h.face = dir;
            // (21 Oct 2026) turning round at speed on the ground: a skid, his feet braking, dust off them
            const skid = h.ground && !slick && Math.sign(h.vx) === -dir && Math.abs(h.vx) > 1.2;
            const acc = h.ground ? (slick ? 0.07 : skid ? 0.17 : RUN_ACCEL) : AIR_ACCEL;
            if (skid && frameNo % 3 === 0) state.parts.push({ kind: "dust", x: h.x + h.w / 2 + Math.sign(h.vx) * 3, y: h.y + h.h - 1, vx: h.vx * 0.25, vy: -0.4 - Math.random() * 0.5, t: 0 });
            h.vx += dir * acc;
            if (Math.abs(h.vx) > top) h.vx = Math.sign(h.vx) * Math.max(top, Math.abs(h.vx) - RUN_DECEL);
        } else if (h.ground) {
            h.vx -= Math.sign(h.vx) * Math.min(Math.abs(h.vx), slick ? 0.034 : RUN_DECEL);
        }

        if (h.ground && h.onScree && !h.onScree.walk) screePush(h, dir); else if (h.ground) h.screeV = 0;   // (a gentle slope's walked on)
        /* PUSHING a crate: walking into one that has room beyond moves it. */
        h.push = 0;
        if (h.ground && dir && !h.crouch) {
            for (const c of act.crates) {
                const edge = dir > 0 ? h.x + h.w : h.x, face = dir > 0 ? c.x : c.x + c.w;
                const touching = Math.abs(edge - face) < 1.5 && h.y + h.h > c.y + 2 && h.y < c.y + c.h - 2;
                if (!touching) continue;
                if (c.hang) { h.vx = 0; continue; }   // hanging, it is as good as a wall
                h.push = dir;
                const pv = TH.pushV || PUSH_V;
                if (TH.slide && c.vy === 0 && !c.vx && !overlapsSolid(c, c.x + dir * 1, c.y, c.w, c.h)) { c.vx = dir * 2.4; h.vx = 0; sfx("push"); }
                else if (c.vy === 0 && !c.vx && !overlapsSolid(c, c.x + dir * pv, c.y, c.w, c.h)) { c.x += dir * pv; h.vx = dir * pv; sfx("push"); }
                else {
                    // Up against something: close the last part-pixel, so it sits flush.
                    const snap = dir > 0 ? Math.ceil(c.x) : Math.floor(c.x);
                    if (c.vy === 0 && snap !== c.x && !overlapsSolid(c, snap, c.y, c.w, c.h)) c.x = snap;
                    h.vx = 0;
                }
            }
        }

        /* JUMPING: from the ground (or just off it), down + jump on a beam
           drops through it, and off a wall when sliding down one. */
        if (h.ground) h.coyote = COYOTE; else if (h.coyote > 0) h.coyote--;
        const jumpedOffLadder = h.ladderJumped; h.ladderJumped = false;   // (the press spent leaving a ladder, above)
        if (wantJump && !(h.leap > 0) && !jumpedOffLadder) {
            if (h.ground && Dn && h.onBeam) {
                pressedAt.jump = pressedAt.up = -99; h.dropUntil = frameNo + 14; h.y += 2; h.ground = false; h.coyote = 0;
                if (h.crouch) { h.crouch = false; h.y -= STAND_H - CROUCH_H; h.h = STAND_H; }
            } else if (h.coyote > 0 && !h.crouch) {
                pressedAt.jump = pressedAt.up = -99; h.vy = -JUMP_V; h.ground = false; h.coyote = 0; sfx("jump");
                { const at = climbableAt(h); h.jumpLadderTx = at && at.ch === "H" ? at.tx : null; }   // (already at a ladder: this jump does not catch on it)
                h.airTop = Math.min(RUN_FAST, Math.abs(h.vx));
                dust(h.x + h.w / 2, h.y + h.h, 3);
            } else if (!h.ground && h.wallGrace > 0) {
                const side = h.wallSide;
                pressedAt.jump = pressedAt.up = -99;
                h.vy = -WALL_JUMP_VY; h.vx = -side * WALL_JUMP_VX; h.face = -side; h.wallLock = WALL_LOCK; h.airTop = RUN_MAX; h.runT = 0;
                h.wall = 0; h.wallGrace = 0; sfx("wallJump");
                dust(side > 0 ? h.x + h.w : h.x, h.y + h.h / 2, 3);
            }
        }
        if (!held.has("jump") && h.vy < -JUMP_CUT && !(h.leap > 0)) h.vy = -JUMP_CUT;

        /* GRAVITY, and a slow slide down a wall pressed against in the air. */
        h.vy = Math.min(FALL_MAX, h.vy + GRAVITY);
        if (act.nx && act.nx.sands.length) sandStep(h, wantJump); else h.sand = 0;
        h.wall = 0;
        if (h.wallGrace > 0) h.wallGrace--;
        if (!h.ground && !h.climb) {
            const touching = d => {
                const ex = d > 0 ? h.x + h.w + 1 : h.x - 1, tx = Math.floor(ex / TS);
                return solidAt(tx, Math.floor((h.y + 5) / TS)) || solidAt(tx, Math.floor((h.y + h.h - 5) / TS)) || (act.solids.length > 0 && (solidPropAt(ex, h.y + 5) || solidPropAt(ex, h.y + h.h - 5)));
            };
            const side = touching(1) ? 1 : touching(-1) ? -1 : 0;
            if (side && dir === side && tryMantle(h, side)) return;
            if (side) {
                h.wallSide = side; h.wallGrace = WALL_GRACE;
                // pressed into it and coming down: the slow slide
                if (dir === side && h.vy > 0) {
                    h.wall = side;
                    if (h.vy > WALL_SLIDE) h.vy = WALL_SLIDE;
                    if (frameNo % 6 === 0) dust(side > 0 ? h.x + h.w : h.x, h.y + h.h - 4, 1);
                }
            }
        }

        moveX(h, h.vx);
        const wasGround = h.ground, fallSpeed = h.vy;
        moveY(h, h.vy, false);
        if (h.ground && !wasGround) {
            sfx("land", fallSpeed < 3);
            h.landT = 6;
            if (fallSpeed > 3) dust(h.x + h.w / 2, h.y + h.h, 4);
        }
        // a conveyor belt underfoot carries him along
        if (h.ground && act.conveyors.size) { const ty = Math.round((h.y + h.h) / TS); for (let tx = Math.floor((h.x + 1) / TS); tx <= Math.floor((h.x + h.w - 2) / TS); tx++) { const d = act.conveyors.get(tx + "," + ty); if (d) { moveX(h, d * 0.75); break; } } }
        if (h.landT > 0) h.landT--;
        if (h.ground) h.airTop = Math.max(RUN_MAX, Math.min(RUN_FAST, Math.abs(h.vx)));
        const still = h.ground && !h.climb && Math.abs(h.vx) < 0.15 && !dir && state.mode === "play";
        h.lookT = still && (U || (Dn && h.crouch)) ? (h.lookT || 0) + 1 : 0;
        const lookTo = h.lookT >= LOOK_WAIT ? (U ? -LOOK_SPAN : LOOK_SPAN) : 0;
        h.lookY = (h.lookY || 0) + Math.max(-LOOK_RATE, Math.min(LOOK_RATE, lookTo - (h.lookY || 0)));
        if (h.ground && Math.abs(h.vx) > 0.2 && !h.push) {
            const before = Math.floor(h.anim);
            h.anim += Math.abs(h.vx) * (h.crouch ? 0.2 : 0.16);   // (23 Oct 2026: the run six frames a stride, so a step through them faster)   // (the crawl four frames a stride since 21 Oct 2026, the hands planted as he goes)
            if (Math.floor(h.anim) !== before) sfx(h.crouch ? "crawl" : "step");
        } else if (h.push) h.anim += 0.06;
        else if (h.ground) h.anim = 0;
    }

    /* MANTLING (22 Oct 2026, the owner's pick from the list: "Mantling, yes"): a jump that falls just short of a
       ledge, pushed into it, and he catches the edge and hauls himself up onto it, rather than sliding down the
       wall. (The owner's: near-misses only. No higher than two tiles over the ground he jumped from, as high as a
       jump could have taken him: a wall three tiles high stays as much a wall as it was. h.airFrom: his feet when
       he last stood, climbed or swam.) Its top from his shoulders down to his feet when he reaches it; only near
       the top of a jump or falling (not rising past it), only where there is room to stand up there, and not
       crouched, swimming or climbing. */
    const MANTLE_T = 13;
    function tryMantle(h, side) {
        if (h.climb || h.swim || h.crouch || h.vy < -1.2 || h.hurt > 90 || state.mode !== "play") return false;
        const tx = Math.floor((side > 0 ? h.x + h.w + 1 : h.x - 1) / TS);
        // the wall's top: the first open tile above solid, from his shoulders down to just over his feet, as far as he falls this frame
        const lo = Math.max(h.y + 2, (h.airFrom === undefined ? h.y + h.h : h.airFrom) - 2 * TS - 1), hi = h.y + h.h - 3 + Math.max(0, h.vy);
        for (let ty = Math.floor(lo / TS); ty <= Math.floor(hi / TS); ty++) {
            if (!solidAt(tx, ty) || solidAt(tx, ty - 1)) continue;
            const top = ty * TS;
            if (top < lo || top > hi) continue;
            const x1 = side > 0 ? tx * TS + 1 : (tx + 1) * TS - h.w - 1, y1 = top - STAND_H;
            // room to stand up there, and to come up past the edge on the way (his own column, up to the top)
            if (overlapsSolid(h, x1, y1, h.w, STAND_H) || overlapsSolid(h, h.x, y1, h.w, Math.max(1, h.y - y1))) return false;
            h.mantle = { t: 0, side, x0: h.x, y0: h.y, x1, y1, top };
            h.vx = 0; h.vy = 0; h.wall = 0; h.wallGrace = 0; h.face = side; h.anim = 0;
            sfx("climb");
            return true;
        }
        return false;
    }
    /* (scoutMantle: hauling, his hands planted on the edge at his sprite's row 14, so his y is its top - 12) his
       hands onto the edge, a moment's push, then up and over it onto his feet on top */
    function stepMantle(h) {
        const m = h.mantle; m.t++;
        const ease = q => q * q * (3 - 2 * q), seg = (a, b) => ease(Math.max(0, Math.min(1, (m.t - a) / (b - a))));
        const plantY = m.top - 12;
        if (m.t <= 4) h.y = m.y0 + (plantY - m.y0) * seg(0, 4);
        else { h.y = plantY + (m.y1 - plantY) * seg(5, MANTLE_T); h.x = m.x0 + (m.x1 - m.x0) * seg(7, MANTLE_T); }
        if (m.t === 3) dust(m.side > 0 ? m.x0 + h.w + 1 : m.x0 - 1, m.top, 2);
        if (m.t >= MANTLE_T) { h.x = m.x1; h.y = m.y1; h.mantle = null; h.ground = true; h.vy = 0; h.vx = 0; h.coyote = COYOTE; h.landT = 4; sfx("land", true); }
    }

    function cutRope(c, h) {
        if (!act.hasKnife) { if (!c.told) { c.told = true; pop(c.x + 8, h.y - 6, "FIND A KNIFE"); } sfx("pauseBlip"); return; }
        c.cutY = Math.round(Math.max(c.ropeTop + 8, Math.min(c.y - 14, h.y + 8)));
        c.tail = (c.y - 10) - c.cutY;
        c.hang = false; c.vy = 0; act.cutOnce = true;
        sfx("whoosh");
        for (let i = 0; i < 6; i++) state.parts.push({ kind: "dust", x: c.x + 8 + (Math.random() - 0.5) * 4, y: c.cutY, vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 0.8, t: 0 });
    }
    function enterDoorway(d) {
        if (d.lock && !act.keys.has(d.lock)) { if (!d.told || frameNo - d.told > 60) { d.told = frameNo; pop(d.x + d.w / 2, d.y + 6, "LOCKED"); sfx("pauseBlip"); } return; }
        const to = act.doorways.find(e => e !== d && e.id && e.id === d.to);
        if (!to) return;
        act.travel = { from: d, to, t: 0 };
        sfx("unlock");
    }
    function stepTravel() {
        const T = act.travel;
        if (!T) return;
        T.t++;
        if (T.t === 18) {
            hero.x = T.to.x + T.to.w / 2 - hero.w / 2; hero.y = T.to.y + T.to.h - STAND_H; hero.vx = hero.vy = 0; hero.climb = null;
            if (hero.crouch || hero.swim) { hero.crouch = hero.swim = false; hero.h = STAND_H; }
            snapCamera();
        }
        if (T.t >= 36) act.travel = null;
    }
    function moveX(b, dx) {
        if (!dx) return;
        const step = Math.sign(dx);
        let left = Math.abs(dx);
        while (left > 0) {
            const d = Math.min(1, left);
            if (overlapsSolid(b, b.x + step * d, b.y, b.w, b.h)) {
                // (23 Oct 2026) up a slope: stepped up the pixel or few it rises, when it is only a slope in the way (or he is on one, onto the floor at its top)
                let lift = 0;
                // (but never up onto a steep one: from its foot it is as a wall; he only gets on it from above, or by a jump, and slides)
                const fx = step > 0 ? b.x + b.w - 1 + step * d : b.x + 1 + step * d, ahead = SLOPES[tileAt(Math.floor(fx / TS), Math.floor((b.y + b.h - 1) / TS))];
                if (ahead && ahead.steep && !b.cartBody) { b.vx = 0; break; }   // (a cart goes up one on its speed)
                if (act.slopes && (b.onScree || (b.ground && !overlapsSolid(b, b.x + step * d, b.y, b.w, b.h, true)))) for (let k = 1; k <= 3; k++) if (!overlapsSolid(b, b.x + step * d, b.y - k, b.w, b.h)) { lift = k; break; }
                if (!lift) { b.vx = 0; break; }
                b.y -= lift;
            }
            b.x += step * d; left -= d;
        }
    }
    function moveY(b, dy, climbing) {
        const wasScree = b.onScree, wasGround = b.ground;
        b.ground = false;
        b.onBeam = false;
        b.onMover = null;
        b.onScree = null;
        // (22 Oct 2026) on scree, or stepping onto it: kept on its slope, up or down it as he goes
        if (dy >= 0 && act.nx && act.nx.screes.length && (wasScree || wasGround)) { const sc = screeUnder(b, b.y + b.h - 5, b.y + b.h + 5 + dy); if (sc) { b.y = sc.y - b.h; b.ground = true; b.onScree = sc.s; b.vy = 0; return; } }
        const step = Math.sign(dy);
        let left = Math.abs(dy);
        while (left > 0) {
            const d = Math.min(1, left);
            const ny = b.y + step * d;
            if (overlapsSolid(b, b.x, ny, b.w, b.h)) {
                if (step > 0) b.ground = true;
                b.vy = 0;
                break;
            }
            if (step > 0 && act.nx && act.nx.screes.length) { const sc = screeUnder(b, b.y + b.h, ny + b.h); if (sc) { b.y = sc.y - b.h; b.ground = true; b.onScree = sc.s; b.vy = 0; break; } }
            if (step > 0 && !(b.dropUntil > frameNo) && !(climbing && held.has("down"))) {
                const beam = beamUnder(b.x + 1, b.w - 2, b.y + b.h, ny + b.h);
                if (beam !== null) { b.y = beam - b.h; b.ground = true; b.onBeam = true; b.vy = 0; break; }
                const m = b === hero ? moverUnder(b.x + 1, b.w - 2, b.y + b.h, ny + b.h) : null;
                if (m) { b.y = m.y - b.h; b.ground = true; b.onBeam = true; b.onMover = m; b.vy = 0; break; }
            }
            b.y = ny; left -= d;
        }
        // standing still: is there ground right under?
        if (!b.ground && dy >= 0) {
            if (overlapsSolid(b, b.x, b.y + 0.5, b.w, b.h)) b.ground = true;
            else if (!(b.dropUntil > frameNo) && !(climbing && held.has("down"))) {
                const feet = b.y + b.h;
                if (Math.abs(feet - Math.round(feet / TS) * TS) < 0.6 && beamUnder(b.x + 1, b.w - 2, feet - 0.3, feet + 0.3) !== null) { b.ground = true; b.onBeam = true; }
                else if (act.tops.length && topUnder(b.x + 1, b.w - 2, feet - 0.6, feet + 0.6) !== null) { b.y = topUnder(b.x + 1, b.w - 2, feet - 0.6, feet + 0.6) - b.h; b.ground = true; b.onBeam = true; }
                else if (b === hero) { const m = moverUnder(b.x + 1, b.w - 2, feet - 0.6, feet + 0.6); if (m) { b.y = m.y - b.h; b.ground = true; b.onBeam = true; b.onMover = m; } }
            }
        }
    }

    /* ---------------------------------------------------------------- THINGS AND FOES */
    const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    function stepThings() {
        const h = hero;
        // THE CHECKPOINT: walking past the pole takes the flag, and a lost
        // life starts again from here.
        const f = act.flag;
        if (f && !f.taken && h.x + h.w > f.x + 1 && h.x < f.x + 4 && h.y + h.h > f.y && h.y < f.y + f.h) {
            f.taken = true;
            sfx("checkpoint");
            pop(f.x + 6, f.y - 4, "CHECKPOINT");
            sparkle(f.x + 8, f.y + 6, "#cf3a3a", 10);
        }
        for (const t of act.things) {
            if (t.got || !hit(h, t)) continue;
            t.got = true;
            const cx = t.x + t.w / 2, cy = t.y;
            if (t.kind === "coin") {
                act.coins++; state.coins++; state.score += 10;
                state.coinChain = (state.lastCoinF && frameNo - state.lastCoinF < 40) ? (state.coinChain || 1) + 1 : 1;
                state.lastCoinF = frameNo;
                sfx("coin", Math.min(8, state.coinChain));
                sparkle(cx, cy + 5, "#fff3b8", 6);
                if (state.coins % 100 === 0) { state.lives++; sfx("oneUp"); pop(cx, cy, "1UP"); }
            } else if (t.kind === "gem") {
                const id = t.obj ? rubyId(act.zi, act.ai, t.obj) : act.zi + "-" + act.ai + "-" + Math.floor((t.x - 2) / TS) + "-" + Math.floor((t.y - 3) / TS);
                if (!state.practice && !progress.rubies.includes(id)) { progress.rubies.push(id); saveProgress(); }
                act.gems++; state.score += 500; sfx("gem"); pop(cx, cy, "500"); sparkle(cx, cy + 5, "#ffb0bc", 10);
            } else if (t.kind === "life") {
                state.lives++; sfx("oneUp"); pop(cx, cy, "1UP"); sparkle(cx, cy + 3, "#ffffff", 8);
            } else if (t.kind === "knife") {
                act.hasKnife = true; state.score += 100; sfx("key"); pop(cx, cy, "KNIFE!"); sparkle(cx, cy + 6, "#b2b2c4", 12);
            } else if (t.kind === "dynamite") {
                act.dynamite++; state.score += 100; sfx("key"); pop(cx, cy, "DYNAMITE!"); sparkle(cx, cy + 6, "#e0384e", 12);
            } else if (t.kind === "key" && t.opens) {
                // a key to a locked doorway (the editor's), not the exit's
                act.keys.add(t.opens); state.score += 100; sfx("key"); pop(cx, cy, "KEY!"); sparkle(cx, cy + 3, "#f2cc4e", 14);
            } else if (t.kind === "key") {
                act.keyTaken = true; state.score += 100; sfx("key"); pop(cx, cy, "KEY!"); sparkle(cx, cy + 3, "#f2cc4e", 14);
                // an alarm by the key goes off as it is lifted (the Station's last passage: the sea surges)
                const F = act.flood;
                for (const al of act.alarms) if (F && !al.fired && Math.abs(al.x - t.x) < 64 && Math.abs(al.y - t.y) < 48) { al.fired = true; F.active = true; if (F.sea) { F.surge = true; F.base = F.y; F.wait = 90; } sfx("alarmTone"); state.shake = 16; }
            }
        }
        // The door: with the key, walking up to it opens it; walking in finishes the act.
        const d = act.door;
        if (d) {
            const near = h.x + h.w > d.x - 8 && h.x < d.x + d.w + 8 && h.y + h.h > d.y + 20 && h.y < d.y + d.h;
            if (near && act.keyTaken && !act.unlocked) {
                act.unlocked = true; act.unlockT = frameNo; sfx("unlock");
                state.parts.push({ kind: "padlock", x: d.x + 11, y: d.y + 22, vx: 0.6, vy: -2.2, t: 0 });
            }
            // Reaching the middle of an open door, he steps into it (and stops there), so a run never carries him past.
            const middle = h.x + h.w / 2 > d.x + 6 && h.x + h.w / 2 < d.x + d.w - 6 && h.y + h.h >= d.y + d.h - 2 && h.ground;
            if (act.unlocked && middle && !act.entering) act.entering = frameNo;
            if (act.entering && frameNo - Math.max(act.entering, act.unlockT + 20) > 12) finishAct();
        }
        // A brazier: touching a cold one lights it, for good.
        // (13 Oct 2026, the owner's: no "LIT" text; and only with the torch)
        for (const b of act.braziers) if (!b.lit && act.torch && hit(h, { x: b.x + 2, y: b.y + 4, w: 12, h: 12 })) { b.lit = true; state.score += 50; sfx("checkpoint"); sparkle(b.x + 8, b.y + 6, "#ffd060", 10); }
        /* THE ROOTS: walking into them with the torch sets them alight; they
           burn away in a second, and the torch is spent in them. */
        if (act.torch) for (const r of act.roots) if (!r.burn && hit({ x: h.x - 3, y: h.y, w: h.w + 6, h: h.h }, { x: r.x * TS, y: r.y * TS, w: TS, h: TS })) {
            for (const r2 of act.roots) if (!r2.burn) r2.burn = 1;
            act.torch = false; sfx("fuse"); state.shake = 4;
        }
        for (const r of act.roots) if (r.burn) {
            r.burn++;
            if (r.burn % 3 === 0) state.parts.push({ kind: "ember", cx: r.x * TS + 8, base: r.y * TS + 8, x: r.x * TS + 8, y: r.y * TS + 8, vx: 0, vy: 0, a: Math.random() * 6.3, spin: 0.05, r: 4 + Math.random() * 4, life: 40, t: 0 });
            if (r.burn === 60) act.tiles[r.y][r.x] = ".";
        }
        // Secrets: stepping into a false wall finds the room behind it.
        const ftx = Math.floor((h.x + h.w / 2) / TS), fty = Math.floor((h.y + h.h / 2) / TS);
        // (14 Oct 2026, the owner's: no "SECRET!" words over him; the chime and the points stay)
        if (tileAt(ftx, fty) === "%" && !act.secretFound) { act.secretFound = true; sfx("secret"); state.score += 1000; }
    }
    function stepFoes() {
        const h = hero;
        for (const f of act.foes) {
            if (!f.alive) { f.deadT = (f.deadT || 0) + 1; continue; }
            // a creature given a path keeps to it (14 Oct 2026, the editor's waypoints), however it would wander
            if (f.path && !(f.kind === "beetle" && f.flipT > 0) && f.kind !== "steam" && f.kind !== "hammer" && f.kind !== "piston") { followPath(f); f.anim = (f.anim || 0) + 0.12; if (f.kind === "spider") { f.ax = f.x + 7; f.top = Math.min(f.top, f.y); } }
            else if (f.kind === "snake") stepNewFoe(f);
            else if (f.kind === "rat" || f.kind === "bot" || f.kind === "grub" || f.kind === "mummy" || (f.kind === "beetle" && f.flipT === 0)) {
                const nx = f.x + f.vx;
                const ahead = f.vx > 0 ? nx + f.w : nx;
                const footTile = tileAt(Math.floor(ahead / TS), Math.floor((f.y + f.h + 1) / TS));
                const blocked = solidAt(Math.floor(ahead / TS), Math.floor((f.y + 2) / TS)) || tileAt(Math.floor(ahead / TS), Math.floor((f.y + 2) / TS)) === "%" || act.seams.has(Math.floor(ahead / TS) + "," + Math.floor((f.y + 2) / TS)) || act.crates.some(c => hit({ x: nx, y: f.y, w: f.w, h: f.h }, c)) || (act.solids.length > 0 && solidPropAt(ahead, f.y + 2));
                // (23 Oct 2026) on a slope, or coming to one: walked along, his feet on its line
                let onSl = null;
                if (act.slopes) { const cxN = nx + f.w / 2, ctx = Math.floor(cxN / TS), fr = Math.floor((f.y + f.h - 1) / TS); for (const ty of [fr, fr + 1]) { const S = SLOPES[tileAt(ctx, ty)]; if (S) { onSl = { y: ty * TS + slopeY(S, cxN - ctx * TS) }; break; } } }
                if (blocked || (footTile !== "#" && footTile !== "=" && !SLOPES[footTile] && !onSl)) f.vx = -f.vx; else { f.x = nx; if (onSl) f.y = onSl.y - f.h; }
                f.anim = (f.anim || 0) + 0.12;
            } else if (f.kind === "bat") {
                f.t += f.sp;
                f.x = f.ox + Math.sin(f.t / 70) * f.range;
                // (13 Oct 2026) gliding just over head height with a slight bob: safe to run under, its back in reach of a jump to land on
                f.y = f.oy + Math.sin(f.t / 17) * 1;
            } else if (f.kind === "spider") {
                f.t += f.sp;
                f.len = 18 + (Math.sin(f.t / 50) + 1) * f.drop / 2;
                f.y = f.top + f.len;
            } else if (f.kind === "beetle") {
                // on its back: still, legs going; after six seconds it rights itself
                f.flipT--; f.anim = (f.anim || 0) + 0.3;
                if (f.flipT === 0) { f.vx = (f.lastVx || -0.4); f.y -= 0; sfx("land", true); }
            } else if (f.kind === "swift") {
                f.t++;
                if (f.cd > 0) f.cd--;
                if (f.state === "hover") {
                    f.x = f.ox + Math.sin(f.t / 40) * 6; f.y = f.oy + Math.sin(f.t / 23) * 2;
                    const hx = h.x + h.w / 2, dx = hx - (f.ox + 9);
                    if (f.cd === 0 && state.mode === "play" && Math.abs(dx) < 120 && h.y > f.oy + 16 && h.y < f.oy + 150) {
                        const dir = Math.sign(dx) || 1, span = Math.max(80, Math.min(220, Math.abs(dx) * 2));
                        Object.assign(f, { state: "dive", dt: 0, sx: f.ox, sy: f.oy, dir, span, depth: Math.min(140, h.y + 6 - f.oy), T: Math.round(span / 2.1) });
                        f.vx = dir; sfx("whoosh");
                    }
                } else {
                    f.dt++;
                    const k = f.dt / f.T;
                    f.x = f.sx + f.dir * f.span * k;
                    f.y = f.sy + f.depth * Math.sin(Math.PI * k);
                    if (k >= 1) { f.state = "hover"; f.ox = Math.max(0, Math.min(act.w * TS - f.w, f.x)); f.oy = f.sy; f.cd = 140; f.t = 0; }
                }
            } else if (f.kind === "hare") {
                // hop, land, a moment's pause, hop again; it turns at a wall or before a drop
                if (f.onGround) {
                    f.hopT--;
                    if (f.hopT <= 0) {
                        const dir = Math.sign(f.vx) || -1, aheadX = dir > 0 ? f.x + f.w + 20 : f.x - 20;
                        const floorAhead = solidAt(Math.floor(aheadX / TS), Math.floor((f.y + f.h + 2) / TS)) || tileAt(Math.floor(aheadX / TS), Math.floor((f.y + f.h + 2) / TS)) === "=";
                        const wallAhead = solidAt(Math.floor(aheadX / TS), Math.floor((f.y + 4) / TS));
                        if (!floorAhead || wallAhead) f.vx = -f.vx;
                        f.vy = -3.1; f.onGround = false;
                    }
                } else {
                    f.vy = Math.min(5, f.vy + 0.22);
                    const nx = f.x + f.vx;
                    if (solidAt(Math.floor((f.vx > 0 ? nx + f.w : nx) / TS), Math.floor((f.y + f.h / 2) / TS))) f.vx = -f.vx; else f.x = nx;
                    const ny = f.y + f.vy, feet = Math.floor((ny + f.h) / TS);
                    const landOn = f.vy > 0 && [f.x + 3, f.x + f.w - 3].some(px => { const c = tileAt(Math.floor(px / TS), feet); return c === "#" || c === "="; });
                    if (landOn) { f.y = feet * TS - f.h; f.vy = 0; f.onGround = true; f.hopT = 34; } else f.y = ny;
                    if (f.y > act.h * TS) f.alive = false;
                }
            } else if (f.kind === "crawler") {
                const nx = f.x + f.vx, ahead = f.vx > 0 ? nx + f.w : nx;
                const footTile = tileAt(Math.floor(ahead / TS), Math.floor((f.y + f.h + 1) / TS));
                if (solidAt(Math.floor(ahead / TS), Math.floor((f.y + 2) / TS)) || (footTile !== "#" && footTile !== "=") || act.crates.some(c => hit({ x: nx, y: f.y, w: f.w, h: f.h }, c) && !c.vx)) f.vx = -f.vx; else f.x = nx;
                f.anim = (f.anim || 0) + 0.1;
            } else if (f.kind === "charger") {
                /* creeping; at the sound of running (or a landing) near it on
                   its own level, it turns to the sound and charges for most of
                   a second, then rests */
                if (f.rest > 0) f.rest--;
                const dx = (h.x + h.w / 2) - (f.x + f.w / 2), level = Math.abs((h.y + h.h) - (f.y + f.h)) < 26;
                const noisy = (h.ground && Math.abs(h.vx) > 1.4) || h.landT > 4;
                if (f.charge === 0 && f.rest === 0 && level && Math.abs(dx) < 110 && noisy && state.mode === "play") { f.charge = 55; f.vx = Math.sign(dx) * 2.3; sfx("whoosh"); }
                const speed = f.charge > 0 ? f.vx : Math.sign(f.vx || -1) * 0.3;
                const nx = f.x + speed, ahead = speed > 0 ? nx + f.w : nx;
                const footTile = tileAt(Math.floor(ahead / TS), Math.floor((f.y + f.h + 1) / TS));
                if (solidAt(Math.floor(ahead / TS), Math.floor((f.y + 2) / TS)) || (footTile !== "#" && footTile !== "=")) { f.vx = -speed; if (f.charge) { f.charge = 0; f.rest = 60; f.vx = Math.sign(f.vx) * 0.3; } }
                else f.x = nx;
                if (f.charge > 0 && --f.charge === 0) { f.rest = 70; f.vx = Math.sign(f.vx) * 0.3; }
                f.anim = (f.anim || 0) + (f.charge ? 0.4 : 0.1);
            } else if (f.kind === "wisp") {
                // out of the light, it comes for him, through rock and all; in it, it drifts home
                f.t++;
                const hx = h.x + h.w / 2 - f.w / 2, hy = h.y + 4;
                // (13 Oct 2026, the owner's: "if you crawl past them, they won't chase you")
                const hunting = !inLight(h.x + h.w / 2, h.y + h.h / 2) && !h.crouch && state.mode === "play";
                const tx2 = hunting ? hx : f.ox, ty2 = hunting ? hy : f.oy;
                const ddx = tx2 - f.x, ddy = ty2 - f.y, dd = Math.hypot(ddx, ddy);
                const sp = (tx2 === hx ? 0.5 : 0.25) * f.sp;
                if (dd > 1) { f.x += ddx / dd * Math.min(dd, sp); f.y += ddy / dd * Math.min(dd, sp); }
                f.y += Math.sin(f.t / 14) * 0.25;
                f.vx = ddx < 0 ? -1 : 1;
            } else if (f.kind === "jelly") {
                // drifting up and down where it was, pulsing
                f.t++;
                f.y = f.oy + Math.sin(f.t / 45) * f.range;
                f.x = f.ox + Math.sin(f.t / 70) * 6;
            } else if (f.kind === "steam") {
                /* A STEAM VALVE: quiet a while; wisps curling from it and a
                   rising hiss to warn; then a burst blasting out level with
                   his head (crawl under it, jump it, or time it), and gone. */
                // (a valve given a longer wait, every, idles longer before the same warning and burst)
                f.t = (f.t + 1) % f.every;
                const t = f.t - (f.every - 200); f.tt = t;
                f.out = t < 140 ? 0 : t < 146 ? (t - 140) / 6 : t < 172 ? 1 : Math.max(0, 1 - (t - 172) / 18);
                const near = Math.abs(f.tx * TS - (h.x + h.w / 2)) < 200 && Math.abs(f.y - h.y) < 140;
                if (near && t === 104) sfx("steamWarn");
                if (near && t === 140) sfx("steam");
                f.vx = f.side;
            } else if (f.kind === "piston") {
                // out on the off-beat, hard, a moment, and back
                const B2 = TH.beat || 36, t = (act.clock + (f.tx % 2) * B2) % (B2 * 2);
                f.out = t < B2 ? 0 : t < B2 + 5 ? (t - B2) / 5 : t < B2 + 16 ? 1 : Math.max(0, 1 - (t - B2 - 16) / 12);
                if (t === B2 && Math.abs(f.tx * TS - (h.x + h.w / 2)) < 220 && Math.abs(f.y - h.y) < 150) sfx("piston");
            } else if (f.kind === "hammer") {
                f.t++;
                if (f.cd > 0) f.cd--;
                const cx = f.x + f.w / 2, hx = h.x + h.w / 2;
                if (f.state === "rest") {
                    if (f.cd === 0 && state.mode === "play" && (TH.pressTimed ? (act.clock + f.tx * 23) % 210 === 0 : Math.abs(hx - cx) < 26 && h.y + h.h > f.y + f.h && h.y < f.floor)) { f.state = "shake"; f.t = 0; if (Math.abs(hx - cx) < 260) sfx("crumble"); }
                } else if (f.state === "shake") {
                    if (f.t > 38) { f.state = "fall"; f.vy = 0.5; }
                } else if (f.state === "fall") {
                    f.vy = Math.min(9, f.vy + 0.5); f.y += f.vy;
                    if (f.y + f.h >= f.floor) {
                        f.y = f.floor - f.h; f.state = "down"; f.t = 0; state.shake = 10; sfx("land", false); sfx("clang");
                        for (let i = 0; i < 14; i++) state.parts.push({ kind: "dust", x: f.x + 2 + Math.random() * 28, y: f.floor - 2, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.2, t: 0 });
                    }
                } else if (f.state === "down") {
                    if (f.t > 55) { f.state = "rise"; }
                } else if (f.state === "rise") {
                    f.y -= 0.9;
                    if (f.y <= f.rest) { f.y = f.rest; f.state = "rest"; f.cd = 70; }
                }
            } else if (f.kind === "lizard") {
                // up and down its wall; it turns where the wall or the way ends
                const ny = f.y + f.vy, edgeY = f.vy < 0 ? ny : ny + f.h, ty = Math.floor(edgeY / TS);
                const wallX = Math.floor((f.side < 0 ? f.x - 1 : f.x + f.w) / TS), selfX = Math.floor((f.x + f.w / 2) / TS);
                if (!solidAt(wallX, ty) || solidAt(selfX, ty)) f.vy = -f.vy; else f.y = ny;
                f.anim = (f.anim || 0) + 0.15;
            }
            /* (21 Oct 2026, the owner's: "when scout is flashing after losing his coins, he can still stomp on
               enemies whilst flashing") not passed over while he flashes: a stomp lands as ever, and anything
               else is no harm to him, hurt() itself refusing while he flashes */
            if (state.mode !== "play") continue;
            if (NEW_FOES.has(f.kind)) { newFoeHit(f, h); continue; }
            // a bat is its body, not its thin wingtips
            const box = f.kind === "bat" || f.kind === "swift" ? { x: f.x + 5, y: f.y + 2, w: f.w - 10, h: f.h - 3 } : { x: f.x + 2, y: f.y + 2, w: f.w - 4, h: f.h - 3 };
            if (f.kind !== "steam" && f.kind !== "hammer" && f.kind !== "piston" && !hit(h, box)) continue;
            if (f.kind === "piston") { if (f.out > 0.3) { const L = 40 * f.out, ex = f.side > 0 ? f.tx * TS : f.tx * TS + TS - L; if (hit(h, { x: ex, y: f.y, w: L, h: 10 })) hurt(); } continue; }
            if (f.kind === "hammer") { if ((f.state === "fall" || (f.state === "down" && f.t < 6)) && hit(h, { x: f.x + 2, y: f.y + 7, w: f.w - 4, h: f.h - 8 })) hurt(); continue; }
            // the steam scalds only while it blows
            if (f.kind === "steam") { if (f.out > 0.4) { const L = 34 * f.out, ex = f.side > 0 ? f.tx * TS : f.tx * TS + TS - L; if (hit(h, { x: ex, y: f.y, w: L, h: 9 })) hurt(); } continue; }
            /* A STOMP: falling onto it from above (a bat counts as landed on
               whenever his feet meet the top of its body, rising or falling: it
               flies at the height of a jump's top). Which creatures a stomp
               finishes is STOMP's, or the level's own say (14 Oct 2026, the
               editor's "stompable"): the crawler's back is spikes, a wisp is no
               body to land on, a jellyfish stings top and all, unless told
               otherwise. THE STONE BEETLE: the first stomp turns it on its
               back, where it can do no harm; the second finishes it. */
            const onTop = f.kind === "bat" ? h.y + h.h <= f.y + f.h * 0.8 : h.vy > 0.2 && h.y + h.h - h.vy <= f.y + (f.kind === "beetle" ? 7 : 6);
            if (f.kind === "beetle") {
                if (onTop && f.stomp) {
                    h.vy = held.has("jump") ? -JUMP_V : -STOMP_BOUNCE; sfx("stomp");
                    if (f.flipT > 0) { f.alive = false; f.deadT = 0; state.score += 200; pop(f.x + f.w / 2, f.y, "200"); sparkle(f.x + f.w / 2, f.y + f.h / 2, "#ffffff", 8); }
                    else { f.lastVx = f.vx || -0.4; f.vx = 0; f.flipT = 360; state.score += 50; pop(f.x + f.w / 2, f.y, "50"); }
                } else if (f.flipT === 0) hurt();
                continue;
            }
            if (onTop && f.stomp) {
                const pts = STOMP_SCORE[f.kind] || 100;
                f.alive = false; f.deadT = 0; h.vy = held.has("jump") ? -JUMP_V : -STOMP_BOUNCE; state.score += pts; sfx("stomp"); pop(f.x + f.w / 2, f.y, String(pts));
                sparkle(f.x + f.w / 2, f.y + f.h / 2, "#ffffff", 8);
            } else hurt();
        }
        // spikes under the feet
        const x0 = Math.floor((h.x + 2) / TS), x1 = Math.floor((h.x + h.w - 2) / TS), ty = Math.floor((h.y + h.h - 1) / TS);
        if (h.hurt === 0) for (let tx = x0; tx <= x1; tx++) if (tileAt(tx, ty) === "^" && (h.y + h.h - 1) - ty * TS > 9) { hurt(); break; }
        if (h.y > act.h * TS + 40) die();
    }
    const WARN = 50;
    /* A PILE OF RUBBLE, drawn once, whole (13 Oct 2026; redrawn 18 Oct 2026, the owner's: "it has some strange
       background to it, and could just generally be higher quality. when making the rubble over 2 tiles wide
       it starts to show pieces of wood in it too - i don't like that"). A heap of broken rock, nothing else:
       rocks packed close, the big ones low and the small ones higher, the nearer over the further; each an
       irregular faceted lump (its edge wobbling round it), outlined, lit from the top left with a bright rim,
       shading down into its own shadow, its face speckled. Between them no fill but shadow, deep and deeper
       lower down; and its top and open sides are the rocks' own outline, not the tiles'. The zone's stones
       (TH.stones) and its darkest earth (TH.dirt) for the shadow. The same heap every time, seeded by where
       it lies. */
    /* FALLEN SLABS (21 Oct 2026, the owner's, of the rubble: "it might work better if we have big rocks that block
       the corridor"; of the mock-ups, the fallen slabs). A theme with slabRubble (the Mine) has its piles drawn as
       a few big broken slabs of its own rock instead of a heap of stones: the pile cut into blocks (up to three
       tiles wide and two tall, from its top left), one slab filling each, a faceted shape (six or seven straight
       sides, leaning a little), sitting flat on the floor, the nearer drawn over the further; shaded flat, as the
       walls are: an outline, the walls' bright top colour along the faces turned up and to the left, a dark band
       on the faces turned away, a crack or two down each. Between them and round them, what is behind shows (21 Oct 2026, the owner's: "loads of black areas around it", when they were shadow). */
    function slabPileArt(pile, P) {
        const cellSet = new Set(pile.cells.map(([cx, cy]) => cx + "," + cy)), has = (x, y) => cellSet.has(x + "," + y);
        const xs = pile.cells.map(c => c[0]), ys = pile.cells.map(c => c[1]);
        const tx0 = Math.min(...xs), ty0 = Math.min(...ys), W = (Math.max(...xs) - tx0 + 1) * TS, H = (Math.max(...ys) - ty0 + 1) * TS;
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const x = c.getContext("2d");
        let sd = (tx0 * 92821 + ty0 * 68917) % 2147483646 + 1;
        const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
        const px = (X, Y, col) => { x.fillStyle = col; x.fillRect(X, Y, 1, 1); };
        // the blocks
        const used = new Set(), rects = [];
        for (const [cx, cy] of pile.cells.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
            if (used.has(cx + "," + cy)) continue;
            let w = 1; while (w < 3 && has(cx + w, cy) && !used.has((cx + w) + "," + cy)) w++;
            let h = 1; while (h < 2) { let ok = true; for (let i = 0; i < w; i++) if (!has(cx + i, cy + h) || used.has((cx + i) + "," + (cy + h))) ok = false; if (!ok) break; h++; }
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) used.add((cx + i) + "," + (cy + j));
            rects.push({ x: (cx - tx0) * TS, y: (cy - ty0) * TS, w: w * TS, h: h * TS, floor: !has(cx, cy + h) });
        }
        const own = new Uint8Array(W * H);
        rects.sort((a, b) => (a.y + a.h) - (b.y + b.h));
        for (const r of rects) {
            const cx = r.x + r.w / 2, cy = r.y + r.h / 2 + (r.floor ? 1 : 0), a = r.w / 2 + 1, b = r.h / 2 + 1.5;
            const tone = Math.floor(rnd() * 3), nv = 6 + Math.floor(rnd() * 2), lean = (rnd() - 0.5) * 0.25;
            const verts = []; for (let i = 0; i < nv; i++) { const t = (i + rnd() * 0.5) / nv * Math.PI * 2; verts.push([Math.cos(t) * (0.92 + rnd() * 0.12), Math.sin(t) * (0.92 + rnd() * 0.12)]); }
            // how far out the slab's edge is, the way t points
            const edgeAt = (t) => { let best = 2; for (let i = 0; i < nv; i++) { const p = verts[i], q = verts[(i + 1) % nv]; const nx = q[1] - p[1], ny = p[0] - q[0], L = Math.hypot(nx, ny), d = (p[0] * nx + p[1] * ny) / L, k = (Math.cos(t) * nx + Math.sin(t) * ny) / L; if (k > 0.001) best = Math.min(best, d / k); } return best; };
            const cracks = []; for (let i = 0; i < (r.w > 16 ? 3 : 2); i++) cracks.push({ x: Math.round(cx + (rnd() - 0.5) * a * 1.1), y0: cy - b * (0.1 + rnd() * 0.3), y1: cy + b * (0.2 + rnd() * 0.5), jog: rnd() < 0.5 ? 1 : -1, at: cy + (rnd() - 0.5) * b * 0.4 });
            for (let Y = Math.floor(r.y - 3); Y < r.y + r.h; Y++) for (let X = Math.floor(r.x - 3); X < r.x + r.w + 3; X++) {
                if (X < 0 || Y < 0 || X >= W || Y >= H || !has(tx0 + Math.floor(X / TS), ty0 + Math.floor(Y / TS))) continue;
                const dx = (X + 0.5 - cx) / a, dy = (Y + 0.5 - cy) / b, t = Math.atan2(dy, dx);
                const d = Math.pow(Math.pow(Math.abs(dx), 6) + Math.pow(Math.abs(dy), 6), 1 / 6) / edgeAt(t + lean);
                if (d > 1) continue;
                const e = (1 - d) * Math.min(a, b), lit = -(Math.cos(t) * 0.55 + Math.sin(t) * 0.83);
                let col;
                if (e < 1) col = P.out;
                else if (e < 2.2 && lit > 0.2) col = P.rim;
                else if (e < 3.4 && lit > 0.35) col = P.rim2;
                else if (e < 4.6 && lit > 0.55) col = P.rim3;
                else if (e < 2.4 && lit < -0.3) col = P.deep;
                else if (e < 4.2 && lit < -0.45) col = P.shade;
                else col = P.body[tone];
                if (e >= 2) for (const k of cracks) { const kx = k.x + (Y > k.at ? k.jog : 0); if (Y >= k.y0 && Y <= k.y1) { if (X === kx) col = P.crack; else if (X === kx + 1) col = P.crackLit; } }
                own[Y * W + X] = 1; px(X, Y, col);
            }
        }
        return (pile.art = { c, x: tx0 * TS, y: ty0 * TS });
    }
    /* PINBALLS (21 Oct 2026, the owner's: for the Neon Arcade, "giant balls from a pin-ball machine (the player's
       ball)"): a pile of rubble there is a chrome ball to every two tiles square (one tile where it is narrower),
       sitting on the floor; chrome as a pinball is, the room in it: a dark band round its middle, a bright sky
       above that, a sharp highlight up on its left. P: outline, the band, under it, mid, light, sky, highlight. */
    function pinballPileArt(pile, P) {
        const set = new Set(pile.cells.map(([x, y]) => x + "," + y)), has = (x, y) => set.has(x + "," + y);
        const xs = pile.cells.map(c => c[0]), ys = pile.cells.map(c => c[1]), tx0 = Math.min(...xs), ty0 = Math.min(...ys), W = (Math.max(...xs) - tx0 + 1) * TS, Hh = (Math.max(...ys) - ty0 + 1) * TS;
        const c = document.createElement("canvas"); c.width = W; c.height = Hh; const x = c.getContext("2d");
        const used = new Set(), balls = [];
        for (const [cx, cy] of pile.cells.slice().sort((p, q) => p[1] - q[1] || p[0] - q[0])) {
            if (used.has(cx + "," + cy)) continue;
            const big = has(cx + 1, cy) && has(cx, cy + 1) && has(cx + 1, cy + 1) && !used.has((cx + 1) + "," + cy);
            const n = big ? 2 : 1; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) used.add((cx + i) + "," + (cy + j));
            balls.push({ x: (cx - tx0) * TS + n * 8, y: (cy - ty0) * TS + n * 8, r: n * 8 - 0.5 });
        }
        balls.sort((a, b) => a.y - b.y);
        for (const b of balls) for (let Y = Math.floor(b.y - b.r - 1); Y <= b.y + b.r + 1; Y++) for (let X = Math.floor(b.x - b.r - 1); X <= b.x + b.r + 1; X++) {
            const dx = (X + 0.5 - b.x) / b.r, dy = (Y + 0.5 - b.y) / b.r, d = Math.hypot(dx, dy); if (d > 1) continue;
            const z = Math.sqrt(1 - d * d), lit = -dx * 0.5 - dy * 0.7 + z * 0.5;
            const ci = d > 0.93 ? 0 : Math.hypot(dx + 0.38, dy + 0.42) < 0.17 ? 6 : dy < -0.1 ? (lit > 0.6 ? 5 : lit > 0.3 ? 4 : 3) : dy < 0.15 ? 1 : (lit > 0.1 ? 3 : 2);
            x.fillStyle = P[ci]; x.fillRect(X, Y, 1, 1);
        }
        return (pile.art = { c, x: tx0 * TS, y: ty0 * TS });
    }
    function pileArt(pile) {
        if (pile.art) return pile.art;
        if (TH.pinballRubble) return pinballPileArt(pile, TH.pinballRubble);
        if (TH.slabRubble) return slabPileArt(pile, TH.slabRubble);
        const cellSet = new Set(pile.cells.map(([cx, cy]) => cx + "," + cy)), has = (x, y) => cellSet.has(x + "," + y);
        const xs = pile.cells.map(c => c[0]), ys = pile.cells.map(c => c[1]);
        const tx0 = Math.min(...xs), ty0 = Math.min(...ys), tw = Math.max(...xs) - tx0 + 1, th = Math.max(...ys) - ty0 + 1;
        const W = tw * TS, H = th * TS;
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const x = c.getContext("2d");
        let sd = (tx0 * 92821 + ty0 * 68917) % 2147483646 + 1;
        const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
        /* where the heap is: its cells, but a top corner open above and to the side rounded off (a heap slopes
           away at its shoulders; it is not a box), the curve wobbling a little */
        const inCell = (px, py) => {
            if (px < 0 || py < 0 || px >= W || py >= H) return false;
            const cx = tx0 + Math.floor(px / TS), cy = ty0 + Math.floor(py / TS);
            if (!has(cx, cy)) return false;
            if (has(cx, cy - 1)) return true;
            const lx = px % TS, ly = py % TS, R = 9 + ((cx * 7 + cy * 3) % 3);
            for (const [side, ex] of [[-1, lx], [1, TS - 1 - lx]]) {
                if (has(cx + side, cy)) continue;
                const dx = R - ex, dy = R - ly;
                if (dx > 0 && dy > 0 && dx * dx + dy * dy > (R - 0.5 - hashTile(px, py) * 1.2) * (R - 0.5 - hashTile(px, py) * 1.2)) return false;
            }
            return true;
        };
        const SETS = TH.stones || [["#3f3a36", "#5c5550", "#7e766c"], ["#4d4641", "#6f665e", "#958a7e"], ["#4a3b2f", "#6e5a48", "#8f7a62"]];
        const DIRT = TH.dirt || ["#241912", "#3b2a1e"];
        const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
        const mixc = (a, b, k) => { const A = hex(a), B = hex(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, "0")).join(""); };
        // the rocks: every cell gets its share, the biggest low in the heap; a row of them along any open top
        const rocks = [];
        const add = (cx, cy, r) => rocks.push({ cx, cy, r, sq: 0.62 + rnd() * 0.3, set: SETS[Math.floor(rnd() * SETS.length)], ph: [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3], am: [0.08 + rnd() * 0.08, 0.05 + rnd() * 0.06, 0.03 + rnd() * 0.04], tilt: (rnd() - 0.5) * 0.6 });
        for (const [cx, cy] of pile.cells) {
            const X0 = (cx - tx0) * TS, Y0 = (cy - ty0) * TS, low = (cy - ty0 + 1) / th;
            for (let n = 0; n < 7; n++) add(X0 + rnd() * TS, Y0 + rnd() * TS, 2.2 + rnd() * (2.6 + 3.2 * low));
            if (!has(cx, cy - 1)) for (let k = 0; k < 3; k++) add(X0 + 2 + k * 5.5 + rnd() * 2, Y0 + 3.5 + rnd() * 2, 2.6 + rnd() * 2);
        }
        // the shadow between, where the heap is: under the rocks' own top line, darker lower down
        const cover = new Int16Array(W).fill(H);   // each column's highest rock pixel
        const reach = (rk, px, py) => { const dx = (px + 0.5 - rk.cx), dy = (py + 0.5 - rk.cy) / rk.sq, a = Math.atan2(dy, dx), r = rk.r * (1 + rk.am[0] * Math.sin(3 * a + rk.ph[0]) + rk.am[1] * Math.sin(5 * a + rk.ph[1]) + rk.am[2] * Math.sin(7 * a + rk.ph[2])); return Math.hypot(dx, dy) / r; };
        for (const rk of rocks) for (let py = Math.floor(rk.cy - rk.r - 2); py <= rk.cy + rk.r + 2; py++) for (let px = Math.floor(rk.cx - rk.r * 1.3 - 2); px <= rk.cx + rk.r * 1.3 + 2; px++) if (inCell(px, py) && reach(rk, px, py) <= 1 && py < cover[px]) cover[px] = py;
        for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
            if (!inCell(px, py) || py < cover[px] + 2) continue;
            // the open sides: only between rocks reaching further out, so the side is ragged too
            const k = Math.min(1, py / H * 1.1);
            x.fillStyle = mixc(DIRT[1], "#080503", 0.12 + 0.5 * k); x.fillRect(px, py, 1, 1);
        }
        // the rocks, the further (higher up the heap) first, the nearer over them
        rocks.sort((p, q) => (p.cy + p.r * 0.5) - (q.cy + q.r * 0.5));
        for (const rk of rocks) {
            const [d0, d1, d2] = rk.set, rim = mixc(d2, "#ffffff", 0.28), deep = mixc(d0, "#000000", 0.35);
            for (let py = Math.floor(rk.cy - rk.r - 2); py <= rk.cy + rk.r + 2; py++) for (let px = Math.floor(rk.cx - rk.r * 1.3 - 2); px <= rk.cx + rk.r * 1.3 + 2; px++) {
                if (!inCell(px, py)) continue;
                const d = reach(rk, px, py); if (d > 1) continue;
                const dx = (px + 0.5 - rk.cx) / rk.r, dy = (py + 0.5 - rk.cy) / (rk.r * rk.sq);
                // a face: lit from the top left, tilted a little each way rock by rock
                const lit = -(dx * (0.62 + rk.tilt) + dy * (0.85 - rk.tilt * 0.4)) + (1 - d) * 0.35;
                const spk = hashTile(px * 3 + Math.floor(rk.cx), py * 5 + Math.floor(rk.cy));
                let col;
                if (d > 0.84) col = "#120c08";                                       // the outline
                else if (d > 0.66 && lit > 0.5) col = rim;                           // the bright rim, top left
                else if (lit > 0.42) col = d2;
                else if (lit > -0.05) col = d1;
                else if (lit > -0.5) col = d0;
                else col = deep;                                                     // its own shadow, bottom right
                if (d <= 0.84 && spk < 0.08) col = spk < 0.03 ? mixc(col, "#000000", 0.3) : mixc(col, "#ffffff", 0.12);   // the grain of the stone
                x.fillStyle = col; x.fillRect(px, py, 1, 1);
            }
        }
        return (pile.art = { c, x: tx0 * TS, y: ty0 * TS });
    }
    /* DYNAMITE (13 Oct 2026, the owner's: "a large pile of rubble is blocking the
       way, so you need dynamite to blast your way through"). With dynamite,
       walking into a pile plants a stick at its foot, and (18 Oct 2026, the
       owner's) so does standing on top of it, at his feet: the fuse burns for
       two and a half seconds (stand well back), then the pile is blown apart.
       Each stick found is one blast (18 Oct 2026, his choice, with a count in
       the satchel; before, one did for the whole passage). Caught in the
       blast, it is a hit. Without one, the pile only tells him what it wants. */
    const FUSE = 150, BLAST = 44;
    /* ================================================================ FLOWING WATER
       (21 Oct 2026, the owner's: "if water is placed above Rubble (which has to be blown using dynamite), when the
       rubble blows up the water flows down ... if there's water already below it, it should increase the water
       level; or if there's no water below it, it'll fill the section below it (where it next meets a floor that can
       hold water) ... high quality animations ... to look seamless and perfect"; and of the questions: real volume,
       a burst then easing, spilling on further when a space is full, the stream pushing Scout down but not hurting
       him, a pool keeping its own kind of water, and a rush of sound).

       The water is still tiles (act.water), but a tile's surface can now stand part of the way down it
       (act.waterTop: its surface's y), so a pool can drain and rise smoothly; wetAt and drawWater know it.

       When a pile goes (stepDynamite), every pool that touched it and now has a way out becomes a FLOW: the water
       above the way out (the outlet's level) drains from the top of the pool down, at a rate that eases as the
       pool empties (as water from a tank does, by the square root of how much is above the outlet). Where it goes
       is TRACED: down from the outlet until a floor or water; along a floor to the nearest drop, and down again;
       until it reaches water, or a floor walled in on both sides: a BASIN, which fills from its surface up, row by
       row (each row as wide as the space it reaches: runs along the row from the rows below), until it is full to
       its lowest rim: then the rest spills over that rim, and the trace goes on from there. A basin that rises to
       the pool's own level stops it (they are one water then). Water falling out of the map is lost.

       Drawn: the stream in each fall, as wide as the flow (a gush thinning to a thread, the last of it falling
       away), streaks running down it; a sheet running along a floor, curling over the edge; a splash and spray
       where it lands, and mist; over the outlet a swirl in the draining pool. Rising and falling surfaces keep
       their own waves, scum and weed. The front of the water feels its way down at the speed of falling. */
    const FLOW_C = 2.6;         // the flow, in tile-pixels a frame, from a tile-wide outlet with a tile's depth above it
    const FLOW_FALL = 0.32;     // how fast the front of the water gains speed falling (px per frame per frame)
    const wkey = (x, y) => x + "," + y;
    const openW = (x, y) => x >= 0 && x < act.w && y >= 0 && y < act.h && !solidAt(x, y);
    const isWater = (x, y) => act.water.has(wkey(x, y)) && !solidAt(x, y);
    const topOf = (x, y) => { const k = wkey(x, y); if (!act.water.has(k)) return (y + 1) * TS; const t = act.waterTop.get(k); return t === undefined ? y * TS : t; };
    // a tile's water: full (its top at the tile's top), or a surface part way down it, or (at or below the bottom) none
    function setWaterTop(x, y, top) {
        const k = wkey(x, y);
        if (top >= (y + 1) * TS - 0.01) { act.water.delete(k); act.waterTop.delete(k); act.murk.delete(k); return; }
        act.water.add(k);
        if (top <= y * TS + 0.01) act.waterTop.delete(k); else act.waterTop.set(k, top);
    }
    // the walls beside a tile of water, their rounded corners filled with it too (as a level's own corner water is)
    function wetWallsBeside(x, y, top, murk) {
        for (const dx of [-1, 1]) {
            const wx = x + dx; if (wx < 0 || wx >= act.w || !solidAt(wx, y)) continue;
            const k = wkey(wx, y), ch = act.tiles[y][wx];
            if (ch !== "#" && ch !== "%") continue;
            if (!act.underWall.has(k)) {
                const t = blankCanvas(TS, TS), tx2 = t.getContext("2d"); drawWall(tx2, act, wx, y, wx * TS, y * TS);
                const d = tx2.getImageData(0, 0, TS, TS).data, p = new Path2D(); let any = false;
                for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) if (d[(j * TS + i) * 4 + 3] < 250) { p.rect(wx * TS + i, y * TS + j, 1, 1); any = true; }
                // (a wall with no rounded corner here: remembered as none, not drawn again every frame: 21 Oct 2026, the lag)
                act.underWall.set(k, any ? p : null);
            }
            if (!act.underWall.get(k)) continue;
            act.water.add(k); if (top > y * TS + 0.01) act.waterTop.set(k, top); else act.waterTop.delete(k);
            if (murk) act.murk.add(k); else act.murk.delete(k);
        }
    }
    function dryWallsBeside(x, y) { for (const dx of [-1, 1]) { const k = wkey(x + dx, y); if (solidAt(x + dx, y) && act.water.has(k)) { act.water.delete(k); act.waterTop.delete(k); act.murk.delete(k); } } }
    // a body of water: its open tiles joined side by side and up and down
    function bodyAt(x, y) {
        const seen = new Set([wkey(x, y)]), st = [[x, y]], tiles = [];
        while (st.length) {
            const [cx, cy] = st.pop(); tiles.push([cx, cy]);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, k = wkey(nx, ny); if (!seen.has(k) && isWater(nx, ny)) { seen.add(k); st.push([nx, ny]); } }
        }
        return tiles;
    }

    /* THE TRACE: from a tile water enters at, falling: down to a floor or water; along the floor to the nearest
       drop and down again; until it reaches water (that body) or a walled-in floor (an empty basin), or leaves the
       map. Returns the segments (fall: x, y0..y1 in pixels; run: y, x0..x1) and where it ends. */
    /* (entry: water coming over the edge of a floor, its edge (a pixel x) and the way it was running: the fall
       then hugs that edge and curves away from it, as water poured over an edge does; FLOW_FALL is its gravity) */
    function traceWater(tx, ty, fromX, entry) {
        const segs = []; let x = tx, y = ty, guard = 0, ent = entry || null;
        const fall = (o) => { if (ent) { o.edge = ent.edge; o.dir = ent.dir; } ent = null; segs.push(o); };
        while (guard++ < 200) {
            // the fall
            let yy = y;
            while (yy < act.h && openW(x, yy) && !isWater(x, yy)) yy++;
            if (yy >= act.h) { fall({ kind: "fall", x: x * TS + 8, y0: y * TS, y1: act.h * TS + 40 }); return { segs, end: null }; }
            if (isWater(x, yy)) { fall({ kind: "fall", x: x * TS + 8, y0: y * TS, y1: topOf(x, yy), lands: "water" }); return { segs, end: { x, y: yy, water: true } }; }
            const land = yy - 1;   // the floor is under this tile
            if (land >= y) fall({ kind: "fall", x: x * TS + 8, y0: y * TS, y1: (land + 1) * TS, lands: "floor" });
            // along the floor: the nearest drop either way, before a wall
            let best = null;
            for (const dir of [-1, 1]) {
                for (let k = 1; k < 64; k++) {
                    const nx = x + dir * k;
                    if (!openW(nx, land)) break;
                    if (openW(nx, land + 1) && !isWater(nx, land + 1)) { if (!best || k < best.k) best = { k, nx, dir }; break; }
                    if (isWater(nx, land)) { if (!best || k < best.k) best = { k, nx, dir, water: true }; break; }
                }
            }
            if (!best) return { segs, end: { x, y: land, water: false } };
            // (to the very edge of the floor, where it goes over: not the middle of the gap)
            const edge = best.water ? best.nx * TS + 8 : best.dir < 0 ? (best.nx + 1) * TS : best.nx * TS;
            segs.push({ kind: "run", y: (land + 1) * TS, x0: segs.length ? fallX(segs[segs.length - 1], (land + 1) * TS, 4) : x * TS + 8, x1: edge, dir: best.dir });
            if (best.water) return { segs, end: { x: best.nx, y: land, water: true } };
            x = best.nx; y = land + 1; ent = { edge, dir: best.dir };
        }
        return { segs, end: null };
    }

    /* A BASIN: where the water gathers. Its surface (level, a y), its rows (each the tiles the water reaches in
       that row), and whether it is full to a rim (then the rim's drop). */
    function makeBasin(end, murkIn) {
        const b = { rows: new Map(), level: 0, murk: murkIn, spill: null, full: false };
        if (end.water) {
            const body = bodyAt(end.x, end.y);
            let top = Infinity; for (const [bx, by] of body) top = Math.min(top, topOf(bx, by));
            b.level = top;
            b.murk = body.some(([bx, by]) => act.murk.has(wkey(bx, by)));
            // the rows it already fills, so the row above can find what it stands on
            for (const [bx, by] of body) { if (!b.rows.has(by)) b.rows.set(by, new Set()); b.rows.get(by).add(bx); }
            b.row = top % TS < 0.01 ? Math.round(top / TS) - 1 : Math.floor(top / TS);
            b.seed = null;
        } else {
            b.level = (end.y + 1) * TS; b.row = end.y; b.seed = end.x;
        }
        return b;
    }
    // a basin's row r: the runs of open tiles the water reaches there (from the row below, or from where it landed),
    // and the first drop in it (a tile with open air under it that is not this water): its rim
    function basinRow(b, r) {
        if (b.rowInfo && b.rowInfo.r === r) return b.rowInfo;
        const below = b.rows.get(r + 1), seeds = [];
        if (b.seed !== null && r === b.row && !below) seeds.push(b.seed);
        if (below) for (const x of below) if (openW(x, r)) seeds.push(x);
        const tiles = new Set(); let drop = null;
        for (const s of seeds) {
            if (tiles.has(s)) continue;
            for (const dir of [1, -1]) for (let x = dir > 0 ? s : s - 1; openW(x, r); x += dir) {
                if (tiles.has(x) && x !== s) break;
                tiles.add(x);
                const under = r + 1;
                const held = !openW(x, under) || isWater(x, under) || (below && below.has(x));
                if (!held && !drop) drop = { x, r };
                if (Math.abs(x - s) > 80) break;
            }
        }
        b.rowInfo = { r, tiles, drop };
        return b.rowInfo;
    }
    // pour dV (tile-pixels) into a basin: up from its surface a row at a time; what will not fit comes back, with the rim it spills over
    function fillBasin(b, dV) {
        let guard = 0;
        while (dV > 1e-6 && guard++ < 40) {
            const r = b.row, info = basinRow(b, r);
            if (info.drop || !info.tiles.size) {
                b.full = true; b.spill = info.drop || null;
                // where it goes over: from the edge of the water standing below this row nearest the rim, to the rim
                if (b.spill) { const below = b.rows.get(r + 1); let bx = b.spill.x, bd = Infinity; for (const x of info.tiles) if ((below && below.has(x)) || x === b.seed) { const d = Math.abs(x - b.spill.x); if (d < bd) { bd = d; bx = x; } } b.spill.from = bx; }
                return dV;
            }
            const n = info.tiles.size;
            const room = b.level - r * TS, rise = Math.min(room, dV / n);
            b.level -= rise; dV -= rise * n;
            if (!b.rows.has(r)) b.rows.set(r, new Set());
            for (const x of info.tiles) { b.rows.get(r).add(x); setWaterTop(x, r, Math.min(topOf(x, r), b.level)); if (b.murk) act.murk.add(wkey(x, r)); else act.murk.delete(wkey(x, r)); wetWallsBeside(x, r, b.level, b.murk); }
            if (b.level <= r * TS + 0.01) { b.row = r - 1; b.rowInfo = null; }
        }
        return dV;
    }
    /* THE SOURCE: the pool draining from its top down to its outlet's level. Its rows (the tiles above the outlet's
       level), its surface. Takes up to dV; gives back what it gave. */
    function drainSource(s, dV) {
        let given = 0, guard = 0;
        while (dV > 1e-6 && guard++ < 40) {
            const r = Math.floor((s.level + 0.01) / TS); if (r * TS >= s.outlet) { s.empty = true; break; }
            const row = (s.rows.get(r) || []).filter(x => isWater(x, r)); if (!row.length) { s.level = (r + 1) * TS; continue; }
            const room = (r + 1) * TS - s.level, drop = Math.min(room, dV / row.length);
            s.level += drop; dV -= drop * row.length; given += drop * row.length;
            for (const x of row) { setWaterTop(x, r, s.level); if (act.water.has(wkey(x, r))) wetWallsBeside(x, r, s.level, act.murk.has(wkey(x, r))); else dryWallsBeside(x, r); }
        }
        return given;
    }
    // A pile gone: each pool it held back, now with a way out, begins to flow.
    function releaseWater(cells) {
        if (!act.water.size) return;
        const done = new Set();
        for (const [cx, cy] of cells) for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) {
            const wx = cx + dx, wy = cy + dy; if (!isWater(wx, wy) || done.has(wkey(wx, wy))) continue;
            const body = bodyAt(wx, wy); for (const [bx, by] of body) done.add(wkey(bx, by));
            // the outlet: the opened tile, and the level the pool drains to (the pool's floor there, for one under it; the opened tile's foot, for one beside it)
            const outlet = dy < 0 ? cy * TS : (cy + 1) * TS;
            const rows = new Map(); let level = Infinity, murk = false;
            for (const [bx, by] of body) { if ((by + 1) * TS <= outlet) { if (!rows.has(by)) rows.set(by, []); rows.get(by).push(bx); } level = Math.min(level, topOf(bx, by)); if (act.murk.has(wkey(bx, by))) murk = true; }
            if (level >= outlet) continue;
            const tr = traceWater(cx, cy);
            act.flows.push({ src: { rows, level, outlet, empty: false }, ox: cx * TS + 8, oy: outlet, murk, segs: tr.segs, end: tr.end, basin: tr.end ? makeBasin(tr.end, murk) : null, parcels: [], nid: 0, bits: [], dripT: 0, emitting: false, landed: false, q: 0, t: 0, done: false });
        }
    }
    // how far along its segments the water is, as a length; each segment's length
    const segLen = s => s.kind === "fall" ? Math.max(0, s.y1 - s.y0) : Math.abs(s.x1 - s.x0);
    const flowTotal = f => { let L = 0; for (const s of f.segs) L += segLen(s); return L; };
    const FLOW_RUN = 2.4;   // how fast water runs along a floor (px a frame)
    /* (21 Oct 2026, the owner's, of the first go: "the game is extremely laggy during the whole animations; the
       animation needs improving a lot too"). The water on its way is now PARCELS: one let out of the pool each
       frame, carrying that frame's flow, falling (faster and faster) and running along the floors its own way,
       and pouring its water into the basin when it gets there. So the stream is as wide, at each point, as the flow
       was when that water left: the burst's thick head going down first, the stream narrowing from the top as the
       pool empties, the last of it a thread breaking into drops, falling away. Its streaks go with the water, so
       they stretch as it speeds up. Where it lands: spray thrown up and falling back, a foam crown, a mist; into
       water, bubbles churned down into it and rising, rings going out across it. After, drips from the hole. All
       drawn into one picture of the view a pixel at a time (drawFlows), not a canvas call a pixel: that was the lag. */
    function stepFlows() {
        // (after the last of it: the rush told it is quiet, long enough for it to fade and stop)
        if (!act.flows.length) { if (act.rushT > 0) { act.rushT--; sfx("rush", 0); } return; }
        act.rushT = 120;
        let loud = 0;
        for (const f of act.flows) {
            f.t++;
            // the flow out of the pool: eases as the head of water over the outlet falls, a burst at first
            const head = Math.max(0, f.src.outlet - f.src.level);
            const stuck = f.blocked || (f.basin && f.basin.level <= f.src.level + 0.5);   // the water below up to the pool's own: one water now
            let want = f.src.empty || stuck ? 0 : FLOW_C * Math.sqrt(head / TS) * Math.min(1, f.t / 8);
            if (head > 0.2 && want < 0.1 && !stuck) want = 0.1;
            const got = want > 0 ? drainSource(f.src, want) : 0;
            if (got > 0.004) { f.parcels.push({ d: 0, v: 0.6 + 1.4 * Math.sqrt(Math.min(1, got / FLOW_C)), q: got, id: f.nid++ }); f.emitting = true; }
            else if (f.emitting) { f.emitting = false; f.dripT = 170; }
            f.q += (got - f.q) * 0.25;
            // the parcels on their way: gaining speed falling, at a run's pace along a floor
            const total = flowTotal(f); let arrived = 0;
            const ends = []; { let a = 0; for (const s of f.segs) { a += segLen(s); ends.push(a); } }
            for (const p of f.parcels) {
                let si = 0; while (si < ends.length - 1 && p.d >= ends[si]) si++;
                if (f.segs[si] && f.segs[si].kind === "fall") p.v = Math.min(9, p.v + FLOW_FALL); else p.v += (FLOW_RUN - p.v) * 0.12;
                p.d += p.v;
                if (p.d >= total) { arrived += p.q; p.gone = true; }
            }
            f.parcels.sort((p, q) => q.d - p.d);   // (the burst ramping up: a later parcel can overtake one let out slower)
            if (arrived > 0 && !f.landed) { f.landed = true; sfx("waterSplash"); }
            if (arrived > 0) f.parcels = f.parcels.filter(p => !p.gone);
            if (arrived > 0 && f.basin) {
                const left = fillBasin(f.basin, arrived);
                if (f.basin.full) {
                    // full to its rim: on over it, from the rim's drop
                    const sp = f.basin.spill;
                    if (sp) {
                        const lx = (sp.from === undefined ? sp.x : sp.from) * TS + 8;
                        const sdir = Math.sign(sp.x * TS + 8 - lx) || 1, sedge = sdir < 0 ? (sp.x + 1) * TS : sp.x * TS;
                        f.segs.push({ kind: "run", y: f.basin.level, x0: lx, x1: sedge, dir: sdir, over: true });
                        const tr = traceWater(sp.x, sp.r + 1, undefined, { edge: sedge, dir: sdir });
                        f.segs.push(...tr.segs); f.end = tr.end; f.basin = tr.end ? makeBasin(tr.end, f.basin.murk) : null;
                        if (left > 0.004) f.parcels.unshift({ d: total, v: 0.6, q: left, id: (f.parcels.length ? f.parcels[0].id : f.nid) - 1 });
                        f.landed = false;
                    } else f.blocked = true;   // walled in to the roof: it can take no more, and the pool stops
                }
            }
            stepFlowBits(f);
            if (!f.emitting && !f.parcels.length && f.t > 20 && f.dripT <= 0 && !f.bits.length) f.done = true;
            loud = Math.max(loud, Math.min(1, f.q / FLOW_C));
            // the stream pushes Scout down where he is under it (not hurt)
            const h = hero;
            if (h && state.mode === "play" && f.parcels.length) {
                let a = 0;
                for (const s of f.segs) {
                    const L = segLen(s), a0 = a; a += L;
                    if (s.kind !== "fall" || h.x > s.x + 8 || h.x + h.w < s.x - 8 || h.y > s.y1 || h.y + h.h < s.y0) continue;
                    const q = flowQAt(f, a0 + Math.max(0, Math.min(L, h.y + h.h / 2 - s.y0))), hw = flowW(q) / 2, cx = fallX(s, h.y + h.h / 2, hw * 2);
                    if (q > 0.02 && h.x < cx + hw && h.x + h.w > cx - hw) { h.vy = Math.max(h.vy, 1.6 + 1.4 * Math.min(1, q / FLOW_C)); if (h.climb) h.climb = null; h.ground = false; }
                }
            }
        }
        act.flows = act.flows.filter(f => !f.done);
        sfx("rush", loud);
    }
    // how much is flowing at a distance d along the way (from the parcels either side of it), and which water it is (id)
    function flowQAt(f, d) {
        const P = f.parcels; if (!P.length) return 0;
        if (d > P[0].d) return 0;
        for (let i = 0; i < P.length - 1; i++) if (d <= P[i].d && d >= P[i + 1].d) { const k = (d - P[i + 1].d) / Math.max(0.001, P[i].d - P[i + 1].d); return P[i + 1].q + (P[i].q - P[i + 1].q) * k; }
        return f.emitting ? P[P.length - 1].q : 0;
    }
    // the stream's width for a flow: from a thread to a full gush
    const flowW = q => q <= 0 ? 0 : 1 + 12 * Math.sqrt(Math.min(1, q / FLOW_C));
    // the spray, bubbles, rings and drips: each frame
    function stepFlowBits(f) {
        const B = f.bits, rnd = Math.random;
        // where the stream lands, as hard as the water arriving there
        let a = 0;
        for (const s of f.segs) {
            const L = segLen(s); a += L;
            if (s.kind !== "fall" || !s.lands) continue;
            const q = flowQAt(f, a - 0.5), k = Math.min(1, q / FLOW_C); if (q < 0.01) continue;
            const hw = flowW(q) / 2, lx = fallX(s, s.y1, hw * 2);
            for (let n = (k * 2.4 + rnd()) | 0; n > 0; n--) B.push({ k: "spray", x: lx + (rnd() - 0.5) * hw * 2, y: s.y1 - 1, vx: (rnd() - 0.5) * (0.8 + 2.6 * k), vy: -(0.6 + rnd() * (1 + 2.2 * k)), t: 0 });
            if (s.lands === "water") {
                if (rnd() < 0.2 + 0.7 * k) B.push({ k: "bub", x: lx + (rnd() - 0.5) * (hw * 2 + 4), y: s.y1 + 3 + rnd() * (6 + 12 * k), vx: 0, vy: -(0.25 + rnd() * 0.35), t: 0, ph: rnd() * 6 });
                if ((f.t + (s.x | 0)) % Math.max(6, Math.round(16 - 10 * k)) === 0) B.push({ k: "ring", x: lx, y: s.y1, r: hw + 1, t: 0 });
            }
        }
        // the drips from the hole after it has stopped
        if (f.dripT > 0) { f.dripT--; if (rnd() < (f.dripT > 90 ? 0.08 : 0.035)) B.push({ k: "drip", x: f.ox + Math.round((rnd() - 0.5) * 6), y: f.oy, vx: 0, vy: 0, t: 0 }); }
        for (const b of B) {
            b.t++;
            if (b.k === "spray" || b.k === "drip") {
                b.vy = Math.min(7, b.vy + (b.k === "drip" ? 0.22 : 0.17)); b.x += b.vx; b.y += b.vy;
                const tx = Math.floor(b.x / TS), ty = Math.floor(b.y / TS);
                if (b.t > 70 || solidAt(tx, ty) || (b.vy > 0 && wetAt(b.x, b.y))) {
                    b.gone = true;
                    if (b.k === "drip" && wetAt(b.x, b.y + 1)) B.push({ k: "ring", x: b.x, y: Math.floor(b.y), r: 1, t: 8, small: true });
                    else if (b.k === "drip") for (let i = 0; i < 2; i++) B.push({ k: "spray", x: b.x, y: b.y - 1, vx: (i ? 0.5 : -0.5) * (0.6 + rnd()), vy: -0.8 - rnd() * 0.6, t: 50 });
                }
            } else if (b.k === "bub") { b.y += b.vy; b.x += Math.sin(b.t / 5 + b.ph) * 0.25; if (b.t > 90 || !wetAt(b.x, b.y - 2)) b.gone = true; }
            else if (b.k === "ring") { b.r += b.small ? 0.35 : 0.45; if (b.t > 34) b.gone = true; }
        }
        if (B.some(b => b.gone)) f.bits = B.filter(b => !b.gone);
    }

    /* Drawn into one picture of the view (a pixel at a time, into its ImageData), put over the game in one go */
    let flowBuf = null;
    const FLOW_PK = {};
    function flowPal(kind) {
        if (FLOW_PK[kind]) return FLOW_PK[kind];
        const P = FALL_PAL[kind], pk = (h, a) => { const r = parseInt(h.slice(1, 3), 16), gg = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return ((Math.round(a * 255) << 24) | (b << 16) | (gg << 8) | r) >>> 0; };
        const m = kind === "murk";
        return (FLOW_PK[kind] = { dark: pk(P.dark, m ? 0.92 : 0.8), mid: pk(P.mid, m ? 0.9 : 0.72), light: pk(P.light, m ? 0.92 : 0.86), foam: pk(P.foam, 0.95), white: pk(P.white, 1), faint: pk(P.light, 0.45), mist: P.mist });
    }
    function drawFlows(cam) {
        const W = VW + 4, H = VH + 4, ox = Math.floor(cam.x) - 2, oy = Math.floor(cam.y) - 2;
        if (!flowBuf) { const c = blankCanvas(W, H), x = c.getContext("2d"), img = x.createImageData(W, H); flowBuf = { c, x, img, u: new Uint32Array(img.data.buffer) }; }
        const U = flowBuf.u; U.fill(0);
        const put = (X, Y, col) => { X = Math.floor(X) - ox; Y = Math.floor(Y) - oy; if (X >= 0 && Y >= 0 && X < W && Y < H) U[Y * W + X] = col; };
        const mists = [];
        for (const f of act.flows) drawFlow(f, put, ox, oy, W, H, mists);
        flowBuf.x.putImageData(flowBuf.img, 0, 0);
        g.drawImage(flowBuf.c, ox, oy);
        // the mist where it lands
        for (const m of mists) { const gr = g.createRadialGradient(m.x, m.y - 2, 1, m.x, m.y - 2, m.r); gr.addColorStop(0, `rgba(${m.c},${m.a.toFixed(3)})`); gr.addColorStop(1, `rgba(${m.c},0)`); g.fillStyle = gr; g.fillRect(m.x - m.r, m.y - m.r - 2, m.r * 2, m.r + 6); }
    }
    /* (21 Oct 2026, the owner's: "still doesn't look natural, especially around corners/bends"). Water turns as
       water does: going over the edge of a floor it rolls over the lip (a rounded nose) and falls hugging the edge,
       curving away from it with the way it was running (fallX); landing on a floor it flares out at its foot and
       piles up there into a thicker sheet that thins as it runs off, drawing down thinner still where it nears the
       next edge; and how wide it is goes as how much is flowing over how fast (water speeding up as it falls thins,
       a jet necking down; slowing on a floor it thickens). */
    function fallX(s, Y, w) {
        if (s.edge === undefined) return s.x;
        const dy = Math.max(0, Y - s.y0), drift = Math.min(40, FLOW_RUN * 0.3 * Math.sqrt(2 * dy / FLOW_FALL));
        const cx = s.edge + s.dir * (w / 2 + drift);
        // kept in the open: within the open tiles of its row about where it falls
        const ty = Math.floor(Y / TS), tx = Math.floor((s.edge + s.dir * 2) / TS);
        let lo = tx, hi = tx; while (lo > tx - 3 && openW(lo - 1, ty)) lo--; while (hi < tx + 3 && openW(hi + 1, ty)) hi++;
        return Math.max(lo * TS + w / 2, Math.min((hi + 1) * TS - w / 2, cx));
    }
    function drawFlow(f, put, ox, oy, W, H, mists) {
        const C = flowPal(f.murk ? "murk" : "clear"), t = frameNo, P = f.parcels;
        const hh = (x, y) => hashTile(x * 7 + 3, y * 13 + 5);
        const total = flowTotal(f), headD = P.length ? P[0].d : 0;
        // along the way, a pixel at a time: how much flows there (Q), how fast (V), and which water it is (M)
        const N = Math.ceil(total) + 2, Q = new Float32Array(N), V = new Float32Array(N), M = new Float32Array(N);
        if (P.length) {
            // (the parcels newest last, nearest the hole: walked from there down the way)
            let j = P.length - 1;
            for (let d = 0; d < N && d <= headD; d++) {
                while (j > 0 && P[j].d < d) j--;
                const p = P[j], n = P[j + 1];
                if (n) { const k = (d - n.d) / Math.max(0.001, p.d - n.d); Q[d] = n.q + (p.q - n.q) * k; V[d] = n.v + (p.v - n.v) * k; M[d] = n.id + (p.id - n.id) * k; }
                else if (d >= p.d - 0.5 || f.emitting) { Q[d] = p.q; V[d] = p.v; M[d] = p.id + Math.max(0, p.d - d) / 3; }
            }
        }
        // the width at d: the flow over its speed (a jet necking as it speeds up), the head rounded
        const Wr = new Float32Array(N), Ws = new Float32Array(N);
        for (let d = 0; d < N; d++) Wr[d] = Q[d] > 0.003 ? Math.max(1, flowW(Q[d]) * Math.sqrt(1.7 / Math.max(1.7, V[d]))) : 0;
        // (smoothed along the way, so a stream thinning as the pool empties tapers, not in steps)
        for (let d = 0; d < N; d++) { if (!Wr[d]) continue; let sum = 0, n = 0; for (let e = -5; e <= 5; e++) { const v = Wr[d + e]; if (v) { sum += v; n++; } } Ws[d] = sum / n; }
        const wAt = d => { d = Math.max(0, Math.min(N - 1, d | 0)); let w = Ws[d]; if (!w) return 0; const dh = headD - d; if (dh < 6) w *= 0.45 + 0.55 * Math.sqrt(Math.max(0, dh) / 6); return w; };
        // a sheet's depth at d: the same, on its side (slow on a floor, so deeper than the fall is wide is thin)
        const thAt = d => { d = Math.max(0, Math.min(N - 1, d | 0)); const q = Q[d]; if (q <= 0.003) return 0; return Math.max(1, Math.min(7, 3.4 * q / Math.max(1.2, V[d]))); };
        const vx0 = ox - 2, vx1 = ox + W + 2, vy0 = oy - 2, vy1 = oy + H + 2;
        const streak = (i, si, m) => { const v = hh(i * 5 + si, Math.floor(m * 0.55 + hh(i, si) * 9)); return v < 0.17 ? C.light : v < 0.23 ? C.foam : v < 0.25 ? C.white : C.mid; };
        // the swirl in the pool over the hole, as it drains: the surface pulled down into it, flecks drawn round and in
        if (f.emitting && f.src.level < f.src.outlet - 1) {
            const k = Math.min(1, f.q / FLOW_C), sx = f.ox, sy = Math.round(f.src.level), R = 4 + Math.round(8 * k), dip = Math.min(4, (f.src.outlet - sy) / 3) * (0.35 + 0.65 * k);
            for (let i = -R; i <= R; i++) { const e = 1 - Math.abs(i) / R, y = sy + Math.round(dip * e * e); put(sx + i, y, ((i + (t >> 2)) & 3) === 0 ? C.foam : C.light); if (e > 0.25) put(sx + i, y + 1, C.mid); }
            for (let q = 0; q < 6; q++) { const ph = ((t * (0.6 + 0.5 * k) + q * 23) % 60) / 60, side = q & 1 ? 1 : -1, r = (R + 10) * (1 - ph); put(sx + side * r, sy + Math.round(dip * Math.pow(1 - r / (R + 10), 2)), q % 3 ? C.light : C.foam); }
        }
        let a = 0;
        for (let si = 0; si < f.segs.length; si++) {
            const s = f.segs[si], L = segLen(s), a0 = a; a += L;
            if (a0 > headD + 1) break;
            const next = f.segs[si + 1], prev = f.segs[si - 1];
            if (s.kind === "fall") {
                if (s.x < vx0 - 30 || s.x > vx1 + 30 || s.y1 < vy0 - 8 || s.y0 > vy1 + 8) continue;
                const from = Math.max(s.y0, vy0), to = Math.min(s.y1, vy1);
                const flareDir = next && next.kind === "run" && s.lands === "floor" ? next.dir : 0;
                for (let Y = Math.floor(from); Y < to; Y++) {
                    const d = Math.round(a0 + Y - s.y0); if (d < 0 || d >= N) continue;
                    let w = wAt(d); if (!w) continue;
                    const m = M[d];
                    if (w < 1.7 && ((m * 1.6) % 1) > 0.3 + (w - 1) * 1.0) continue;   // a thread: beads
                    const wob = s.edge === undefined && w >= 5 ? Math.sin((Y - t * 2.4) * 0.16) * 0.45 : 0;   // a gentle ripple running down it
                    let left = fallX(s, Y, w) - w / 2 + wob, right = left + w;
                    // its foot on a floor: flaring out, most the way it goes on
                    const up = s.y1 - Y;
                    if (s.lands === "floor" && up < 6) { const fl = (6 - up) * (0.5 + 0.5 * Math.min(1, Q[d] / FLOW_C)); if (flareDir > 0) { right += fl; left -= fl * 0.35; } else if (flareDir < 0) { left -= fl; right += fl * 0.35; } else { left -= fl * 0.6; right += fl * 0.6; } }
                    const x0 = Math.round(left), x1 = Math.max(x0 + 1, Math.round(right)), n = x1 - x0;
                    for (let X = x0; X < x1; X++) {
                        const i = X - x0;
                        const c = n > 2 && i === n - 1 ? C.dark : n > 3 && i === 0 ? C.dark : n > 4 && i === 1 ? C.light : streak(i, si, m);
                        put(X, Y, c);
                    }
                }
                // over the edge of a floor: the sheet rolling over the lip, a rounded nose
                if (s.edge !== undefined && prev && prev.kind === "run" && s.y0 > vy0 - 10 && s.y0 < vy1 + 10) {
                    const d = Math.max(0, Math.round(a0) - 1), th = Math.round(thAt(d) * 0.7);
                    if (th > 0) for (let z = 1; z <= th; z++) {
                        const ext = Math.round(Math.sqrt(Math.max(0, th * th - (z - 0.5) * (z - 0.5))) * 0.9);
                        for (let e = 0; e <= ext; e++) put(s.edge + s.dir * e - (s.dir < 0 ? 1 : 0), s.y0 - z, z === th ? (e === ext ? C.foam : C.light) : e === ext ? C.light : C.mid);
                    }
                }
                // where it lands: a foam crown, churning, and a mist
                const qL = Q[Math.max(0, Math.min(N - 1, Math.round(a) - 1))];
                if (s.lands && qL > 0.01 && s.y1 > vy0 - 10 && s.y1 < vy1 + 10) {
                    const k = Math.min(1, qL / FLOW_C), w = Math.max(2, wAt(Math.round(a) - 1)), lx = fallX(s, s.y1, w), half = w / 2 + 2 + w * 0.35;
                    for (let i = -Math.ceil(half); i <= Math.ceil(half); i++) {
                        const e = 1 - Math.abs(i) / half; if (e <= 0) continue;
                        const cxp = lx + i; if (solidAt(Math.floor(cxp / TS), Math.floor((s.y1 - 1) / TS))) continue;   // (not over the rock beside a narrow shaft)
                        // on a floor the crown leans the way the water goes on, a little thrown back the other way
                        const lean = flareDir ? (Math.sign(i) === flareDir ? 0.8 : 1.15) : 1;
                        const hgt = Math.max(1, Math.round(e * (1 + w / 4) * lean + hh(i + (s.x | 0), t >> 2) * 1.8 * e));
                        for (let z = 0; z < hgt; z++) put(cxp, s.y1 - 1 - z, z === hgt - 1 ? (hh(i, (t >> 1) + z) < 0.5 ? C.white : C.foam) : C.foam);
                        if (s.lands === "water") put(cxp, s.y1, C.light);
                    }
                    mists.push({ x: lx, y: s.y1, r: w + 8, c: C.mist, a: (0.14 + 0.06 * Math.sin(t / 9)) * (0.4 + 0.6 * k) });
                }
            } else {
                // a sheet along the floor: from under the foot of the fall that fed it (it lands across its width), piled
                // up where it landed and thinning as it runs off, drawn down thinner where it nears the edge; streaks
                // going its way, a wavy top, a rounded tongue at its front
                const dir = s.dir, y = Math.round(s.y);
                if (y < vy0 - 8 || y > vy1 + 8) continue;
                const back = prev && prev.kind === "fall" ? Math.ceil(wAt(Math.round(a0) - 1) / 2) + 1 : 0, edgeNext = next && next.kind === "fall";
                for (let o = -back; o <= L; o++) {
                    const X = Math.round(s.x0 + dir * o); if (X < vx0 || X > vx1) continue;
                    const d = Math.round(a0 + Math.max(0, o)); if (d >= N) break;
                    let th = thAt(d); if (!th) continue;
                    const m = M[d], k = Math.min(1, Q[d] / FLOW_C);
                    if (prev && prev.kind === "fall") th += 2.6 * k * Math.exp(-Math.max(0, o) / 7) - (o < 0 ? (-o) * 0.5 : 0);
                    if (edgeNext && L - o < 7) th *= 0.55 + 0.45 * (L - o) / 7;
                    const dh = headD - d; if (dh < 5) th *= 0.4 + 0.6 * Math.sqrt(Math.max(0, dh) / 5);
                    let T = Math.max(1, Math.round(th)); if (T > 1 && Math.sin(m * 0.9 + X * 0.21) > 0.55) T++;
                    for (let z = 0; z < T; z++) {
                        const v = hh(z * 3 + 1, Math.floor(m * 0.8 + z * 7));
                        put(X, y - 1 - z, z === T - 1 ? (v < 0.12 ? C.white : v < 0.45 ? C.foam : C.light) : z === 0 ? C.dark : v < 0.25 ? C.light : C.mid);
                    }
                }
            }
        }
        // the spray, bubbles, rings and drips
        for (const b of f.bits) {
            if (b.x < vx0 || b.x > vx1 || b.y < vy0 - 20 || b.y > vy1) continue;
            if (b.k === "spray") { put(b.x, b.y, b.t < 10 ? C.white : C.foam); if (b.t < 6) put(b.x - b.vx, b.y - b.vy, C.faint); }
            else if (b.k === "drip") { put(b.x, b.y, C.light); put(b.x, b.y - 1, C.faint); if (b.vy > 2) put(b.x, b.y - 2, C.faint); }
            else if (b.k === "bub") { put(b.x, b.y, C.foam); if (b.t % 20 < 12) put(b.x + 1, b.y - 1, C.faint); }
            else if (b.k === "ring") { const r = Math.round(b.r), fade = b.t > 22; put(b.x - r, b.y, fade ? C.faint : C.foam); put(b.x + r, b.y, fade ? C.faint : C.foam); if (!b.small) { put(b.x - r - 1, b.y, C.faint); put(b.x + r + 1, b.y, C.faint); } }
        }
    }
    function stepDynamite() {
        const h = hero;
        if (!act.bomb && state.mode === "play" && h.ground) {
            // standing on a pile: the stick at his feet, on top of it
            const fx = h.x + h.w / 2, tyB = Math.floor((h.y + h.h + 1) / TS), under = act.pileAt.get(Math.floor(fx / TS) + "," + tyB);
            if (under && under.alive) {
                if (!act.dynamite) { if (!under.told) { under.told = true; pop(fx, h.y - 6, "FIND DYNAMITE"); } }
                else { act.dynamite--; act.bomb = { pile: under, x: Math.round(fx - 6), y: tyB * TS - 16, t: 0 }; pop(act.bomb.x + 5, act.bomb.y - 10, "STAND BACK!"); sfx("pauseBlip"); }
            }
        }
        if (!act.bomb && state.mode === "play" && h.ground) {
            for (const dir of [1, -1]) {
                const fx = dir > 0 ? h.x + h.w + 1 : h.x - 1;
                const tx = Math.floor(fx / TS), ty = Math.floor((h.y + h.h - 4) / TS);
                const pile = act.pileAt.get(tx + "," + ty);
                if (!pile || !pile.alive) continue;
                if (!act.dynamite) { if (!pile.told) { pile.told = true; pop(tx * TS + 8, ty * TS - 6, "FIND DYNAMITE"); } continue; }
                const face = dir > 0 ? tx * TS : (tx + 1) * TS;
                act.dynamite--;
                act.bomb = { pile, x: face - (dir > 0 ? 12 : -2), y: (ty + 1) * TS - 16, t: 0 };
                pop(act.bomb.x + 5, act.bomb.y - 4, "STAND BACK!");
                sfx("pauseBlip");
                break;
            }
        }
        /* (22 Oct 2026, the owner's: "If Rubble is above and flush to the edge, jumping up to it doesn't place
           dynamite") in the air (a jump, a ladder, a rope): his head against a pile's underside, the stick wedged
           under it; his side against a pile's face, the stick on that face, at his height */
        if (!act.bomb && state.mode === "play" && !h.ground) {
            const touch = (tx, ty) => { const p = act.pileAt.get(tx + "," + ty); return p && p.alive ? p : null; };
            const plant = (pile, x, y, popY) => {
                if (!act.dynamite) { if (!pile.told) { pile.told = true; pop(x + 5, popY, "FIND DYNAMITE"); } return; }
                act.dynamite--; act.bomb = { pile, x, y, t: 0 }; pop(x + 5, popY, "STAND BACK!"); sfx("pauseBlip");
            };
            // overhead: his top within a pixel of the pile's bottom
            const tyU = Math.floor((h.y - 1) / TS);
            if (h.y - (tyU + 1) * TS <= 1 && h.vy <= 0.5) {
                for (const fx of [h.x + h.w / 2, h.x + 1, h.x + h.w - 2]) {
                    const tx = Math.floor(fx / TS), pile = touch(tx, tyU);
                    if (!pile) continue;
                    plant(pile, Math.round(Math.max(tx * TS, Math.min(tx * TS + TS - 10, fx - 5))), (tyU + 1) * TS - 7, (tyU + 1) * TS + 4);
                    break;
                }
            }
            // beside: the first pile cell along his side, from his feet up
            if (!act.bomb) for (const dir of [1, -1]) {
                const tx = Math.floor((dir > 0 ? h.x + h.w + 1 : h.x - 1) / TS);
                let hit = null;
                for (let ty = Math.floor((h.y + h.h - 1) / TS); ty >= Math.floor(h.y / TS); ty--) { const p = touch(tx, ty); if (p) { hit = { p, ty }; break; } }
                if (!hit) continue;
                const face = dir > 0 ? tx * TS : (tx + 1) * TS;
                plant(hit.p, face - (dir > 0 ? 12 : -2), (hit.ty + 1) * TS - 16, (hit.ty + 1) * TS - 20);
                if (act.bomb || hit.p.told) break;
            }
        }
        const b = act.bomb;
        if (!b) return;
        b.t++;
        if (b.t % 5 === 0) state.parts.push({ kind: "fuse", x: b.x + 6 + (b.t % 10 ? 1 : 0), y: b.y + 1, vx: (Math.random() - 0.5) * 1.2, vy: -0.8 - Math.random() * 0.8, t: 0 });
        if (b.t % 14 === 0) sfx("fuse");
        if (b.t < FUSE) return;
        // the blast
        act.bomb = null;
        b.pile.alive = false;
        for (const [cx, cy] of b.pile.cells) {
            act.tiles[cy][cx] = ".";
            for (let i = 0; i < 5; i++) state.parts.push({ kind: "shard", x: cx * TS + Math.random() * TS, y: cy * TS + Math.random() * TS, vx: (Math.random() - 0.5) * 4, vy: -1.5 - Math.random() * 3, t: 0 });
        }
        for (let i = 0; i < 24; i++) state.parts.push({ kind: "dust", x: b.x + 6 + (Math.random() - 0.5) * 30, y: b.y + 8 + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 1.6, vy: -0.4 - Math.random() * 0.8, t: 0 });
        state.shake = 24;
        sfx("boom");
        releaseWater(b.pile.cells);
        const dx = (h.x + h.w / 2) - (b.x + 6), dy = (h.y + h.h / 2) - (b.y + 8);
        if (state.mode === "play" && Math.hypot(dx, dy) < BLAST) hurt();
        for (const f of act.foes) if (f.alive && Math.hypot(f.x + f.w / 2 - (b.x + 6), f.y + f.h / 2 - (b.y + 8)) < BLAST + 10) { f.alive = false; f.deadT = 0; state.score += 100; }
    }
    /* MOVING PLATFORMS: to one end, a pause, back. Standing on one, Scout goes
       with it; one coming up under his feet picks him up. */
    /* A PATH (14 Oct 2026, the editor's waypoints): along its points at
       pathSpeed, to the last and back again (or on round to the first, if
       it loops), waiting pathPause frames at each end. Sets dx, dy: how far
       it went, for whatever rides on it. */
    function followPath(f) {
        const P = f.path;
        if (!f.plen) { f.plen = []; let L = 0; for (let i = 1; i < P.length + (f.loop ? 1 : 0); i++) { const p = P[i - 1], q = P[i % P.length]; L += Math.hypot(q.x - p.x, q.y - p.y); f.plen.push(L); } f.ptotal = L; f.pd = f.pd || 0; f.pdir = f.pdir || 1; }
        f.dx = 0; f.dy = 0;
        if (!f.ptotal) return;
        if (f.pwait > 0) { f.pwait--; return; }
        f.pd += f.pdir * f.pathSpeed;
        if (f.loop) { if (f.pd >= f.ptotal) { f.pd -= f.ptotal; f.pwait = f.pathPause || 0; } }
        else if (f.pd >= f.ptotal) { f.pd = f.ptotal; f.pdir = -1; f.pwait = f.pathPause || 0; }
        else if (f.pd <= 0) { f.pd = 0; f.pdir = 1; f.pwait = f.pathPause || 0; }
        let i = 0; while (i < f.plen.length - 1 && f.pd > f.plen[i]) i++;
        const start = i ? f.plen[i - 1] : 0, seg = f.plen[i] - start, k = seg > 0 ? (f.pd - start) / seg : 0;
        const p = P[i], q = P[(i + 1) % P.length];
        const nx = p.x + (q.x - p.x) * k, ny = p.y + (q.y - p.y) * k;
        f.dx = nx - f.x; f.dy = ny - f.y; f.x = nx; f.y = ny;
        if (Math.abs(f.dx) > 0.01 && f.vx !== undefined) f.vx = Math.sign(f.dx) * (Math.abs(f.vx) || 0.5);
    }
    // in the vault the platforms move in ticks: the first half of every beat, at twice the pace
    const beatGo = () => (TH.beat ? ((act.clock % TH.beat) < TH.beat / 2 ? 2 : 0) : 1);
    const RAFT_LIFE = 720;   // how long a slag raft floats: long enough to carry him the width of any pool
    function stepMovers() {
        const h = hero;
        for (const m of act.movers) {
            m.dx = 0; m.dy = 0;
            if (m.kind === "f") {
                // riding the sea: its deck a few pixels proud of the water, bobbing; resting on the floor when the water is gone
                const F = act.flood, want = F ? F.y - 5 + Math.sin(frameNo / 22 + m.tx) * 0.8 : m.y1;
                const ny = Math.max(m.y0, Math.min(m.y1, want));
                m.dy = Math.max(-1.2, Math.min(1.2, ny - m.y)); m.y += m.dy;
            } else if (m.kind === "p") {
                // along a path of points (14 Oct 2026, the editor's), waiting at the ends
                if (m.pathSpeed === undefined) { m.pathSpeed = m.speed || 0.7; m.pathPause = m.rest; m.pwait = 0; }
                followPath(m);
            } else if (m.kind === "orbit") {
                const G = m.gear, an = G.ang + m.k * Math.PI * 2 / G.arms;
                const nx = G.cx + Math.cos(an) * G.R - m.w / 2, ny = G.cy + Math.sin(an) * G.R;
                m.dx = nx - m.x; m.dy = ny - m.y; m.x = nx; m.y = ny;
            } else if (m.kind === "raft") {
                // drifting off along the lava, cooling; after a while, or against a wall, it sinks
                m.age++;
                const ahead = solidAt(Math.floor((m.x + m.w + 1) / TS), Math.floor((m.y + 6) / TS));
                m.dx = ahead ? 0 : 0.6;   // (14 Oct 2026, the play-tester: at 0.45 and sinking at 300 a raft went down half way over a pool)
                m.dy = m.age > RAFT_LIFE || (ahead && m.age > 40) ? 0.14 : 0;
                m.x += m.dx; m.y += m.dy;
                if (m.y > m.y0 + 20) m.gone = true;
            } else if (m.follow) {
                /* CRANE PAIRS (23 Oct 2026, the owner's choice of the ideas: "two side-by-side lifts on one rope ... as one goes
                   up, the other comes down"): the second of a linked pair has no going of its own; it is as far down its
                   travel as the first is up its, and waits when the first waits */
                const A = m.follow, p = A.y1 > A.y0 ? (A.y - A.y0) / (A.y1 - A.y0) : 0, ny = m.y0 + (1 - p) * (m.y1 - m.y0);
                m.dy = ny - m.y; m.y = ny;
            } else if (m.pause > 0) { m.pause--; continue; }
            else if (m.kind === "h") {
                const nx = Math.max(m.x0, Math.min(m.x1, m.x + m.dir * (m.speed || 0.7) * beatGo()));
                m.dx = nx - m.x; m.x = nx;
                if (m.x <= m.x0 || m.x >= m.x1) { m.dir = -m.dir; m.pause = m.rest; }
            } else {
                const ny = Math.max(m.y0, Math.min(m.y1, m.y + m.dir * (m.speed || 0.6) * beatGo()));
                m.dy = ny - m.y; m.y = ny;
                if (m.y <= m.y0 || m.y >= m.y1) { m.dir = -m.dir; m.pause = m.rest; }
            }
            if (state.mode !== "play") continue;
            const over = h.x + h.w > m.x + 1 && h.x < m.x + m.w - 1, feet = h.y + h.h;
            if (h.onMover === m && !h.climb) {
                if (m.dx) moveX(h, m.dx);
                h.y = m.y - h.h;
            } else if (over && !h.climb && h.vy >= 0 && m.dy < 0 && feet >= m.y && feet <= m.y - m.dy + 1.5 && !(h.dropUntil > frameNo)) {
                h.y = m.y - h.h; h.vy = 0; h.ground = true; h.onBeam = true; h.onMover = m;
            }
            if (h.onMover === m && overlapsSolid(h, h.x, h.y, h.w, h.h)) { h.onMover = null; hurt(); }   // never squeezed into rock: knocked off
        }
        if (act.movers.some(m => m.gone)) { if (h.onMover && h.onMover.gone) h.onMover = null; act.movers = act.movers.filter(m => !m.gone); }
    }
    /* CRUMBLING LEDGES: stood on, one shakes for two thirds of a second and
       drops away in pieces; five seconds later it is back (once nothing is
       in its place). */
    function stepCrumbles() {
        const h = hero;
        if (h.ground && h.onBeam && !h.onMover) {
            const ty = Math.round((h.y + h.h) / TS);
            for (let tx = Math.floor((h.x + 1) / TS); tx <= Math.floor((h.x + h.w - 2) / TS); tx++) {
                const c = act.crumbles.get(tx + "," + ty);
                if (c && c.state === "ok") { c.state = "shake"; c.t = 0; sfx("push"); }
            }
        }
        for (const c of act.crumbles.values()) {
            c.t++;
            if (c.state === "shake" && c.t > 40) {
                c.state = "gone"; c.t = 0; act.tiles[c.ty][c.tx] = ".";
                for (let i = 0; i < 8; i++) state.parts.push({ kind: "shard", x: c.tx * TS + Math.random() * TS, y: c.ty * TS + Math.random() * 6, vx: (Math.random() - 0.5) * 1.6, vy: Math.random() * 1.5, t: 0 });
                sfx("land", false);
            } else if (c.state === "gone" && c.t > 300 && !hit(h, { x: c.tx * TS, y: c.ty * TS - 4, w: TS, h: TS })) { c.state = "ok"; c.t = 0; act.tiles[c.ty][c.tx] = "c"; }
        }
    }
    /* ICICLES: one shivers as Scout comes beneath it, then drops; it shatters
       where it lands, and a new one has grown five seconds later. */
    function stepIcicles() {
        const h = hero;
        for (const ic of act.icicles) {
            ic.t++;
            if (ic.state === "hang") {
                const dx = (h.x + h.w / 2) - (ic.x + 4);
                if (Math.abs(dx) < 22 && h.y > ic.y && h.y < ic.y + 170) { ic.state = "shake"; ic.t = 0; sfx("crumble"); }
            } else if (ic.state === "shake") {
                if (ic.t > 26) { ic.state = "fall"; ic.vy = 0.5; }
            } else if (ic.state === "fall") {
                ic.vy = Math.min(6, ic.vy + 0.32); ic.y += ic.vy;
                if (state.mode === "play" && h.hurt === 0 && hit(h, { x: ic.x + 2, y: ic.y + 6, w: 4, h: 11 })) hurt();
                const below = Math.floor((ic.y + 16) / TS), tx = Math.floor((ic.x + 4) / TS);
                const c = tileAt(tx, below);
                if (c === "#" || c === "=" || c === "^" || c === "X" || ic.y > act.h * TS) {
                    for (let i = 0; i < 9; i++) state.parts.push({ kind: "shard", ice: true, x: ic.x + 4, y: below * TS - 3, vx: (Math.random() - 0.5) * 2.6, vy: -1 - Math.random() * 1.8, t: 0 });
                    sfx("crumble"); ic.state = "gone"; ic.t = 0;
                }
            } else if (ic.state === "gone" && ic.t > 300) { ic.state = "hang"; ic.y = ic.hy; ic.vy = 0; ic.t = 0; }
        }
    }
    /* THE LIGHT IN THE DARK: where it is (world pixels, radius). Lit braziers
       and torches, the glow round the checkpoint, the open door, the key,
       glowing toadstools, wisps, a burning fuse; Scout's own small light is
       added when it is drawn, but does not count as "in the light". */
    function lights() {
        const L = [];
        // (19 Oct 2026: none from inside a hidden room not yet found: its light opened the dark through the wall, and gave it away)
        const hid = o => o.cover && o.cover.alpha > 0.5;
        for (const b of act.braziers) if (b.lit && !hid(b)) L.push([b.x + 8, b.y + 4, 92]);
        for (const d of act.deco) if (d.kind === "t" && d.reveal > 0 && !hid(d)) L.push([d.x + 8, d.y + lampAt(d.style).gy, d.reveal]);
        // the level's own lights (14 Oct 2026), those a wisp keeps out of
        for (const l of act.lights) if (l.reveal > 0 && l.scare && !hid(l)) L.push([l.x, l.y, l.reveal]);
        if (act.nx) {
            if (act.nx.carry && hero) { const hd = torchHand(hero); L.push([hd.x, hd.y - 10, 60 + 30 * Math.min(1, act.nx.carry.life / act.nx.carry.max * 3)]); }
            for (const s of act.nx.swings) if (s.kind === "chandelier") { const e = swingAt(s, s.len); L.push([e.x, e.y + 30, 96]); }
        }
        if (act.flag) L.push([act.flag.x + 6, act.flag.y + 8, act.flag.taken ? 104 : 84]);
        if (act.door) L.push([act.door.x + 16, act.door.y + 24, act.unlocked ? 110 : 54]);
        for (const t of act.things) if (!t.got && t.kind === "key") L.push([t.x + 6, t.y + 10, 40]);
        return L;
    }
    const inLight = (x, y) => lights().some(([lx, ly, r]) => Math.hypot(x - lx, y - ly) < r * 0.8);
    /* THE WHEELS: standing beside a blast door, or under a hatch, each change
       of key (Z, X, Z...) turns its wheel a notch; twelve notches and it opens. Leave
       it, and the wheel slips back. */
    function nearWheel(d, h) {
        const X = d.tx * TS, Y = d.ty * TS;
        if (d.kind === "door") return h.y + h.h > Y + 8 && h.y < Y + d.h * TS && (Math.abs((h.x + h.w) - X) < 18 || Math.abs(h.x - (X + TS)) < 18);
        // a pump: standing at it
        if (d.kind === "pump") return Math.abs(h.x + h.w / 2 - (X + 8)) < 18 && h.y + h.h > Y - 4 && h.y < Y + TS + 8;
        // a hatch: from under it, or standing on it
        return h.x + h.w > X - 4 && h.x < X + 3 * TS + 4 && ((h.y > Y + TS - 4 && h.y < Y + TS + 44) || Math.abs(h.y + h.h - Y) < 3);
    }
    function turnWheel(d) {
        d.prog = Math.min(1, d.prog + 1 / (d.turns || 12)); d.idle = 0; d.spin = (d.spin || 0) + 1;
        sfx("wheel", d.prog);
        if (d.prog >= 1 && !d.open) {
            d.open = true; d.anim = 0;
            // a pump: the sea drains to its @ line
            if (d.kind === "pump") { const F = act.flood; if (F && F.drain !== undefined) { F.drainTo = F.drain; F.draining = true; } sfx("clang"); sfx("drain"); state.shake = 14; state.score += 500; return; }
            // open: air, or ladder where a ladder runs up through it
            for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) { const tx = d.tx + i, ty = d.ty + j; act.tiles[ty][tx] = tileAt(tx, ty - 1) === "H" || tileAt(tx, ty + 1) === "H" ? "H" : "."; }
            sfx("clang"); state.shake = 10; state.score += 100;
        }
    }
    /* A STEAM VALVE and its burst: a stub of pipe out of the wall with a
       flanged nozzle; puffs of steam, white at the nozzle and greyer and
       wider further out, churning; wisps first to warn. Pixel blobs, so
       the steam stays crisp. */
    function blob(cx, cy, r, color) {
        g.fillStyle = color;
        for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1); }
    }
    /* A FLOAT (14 Oct 2026): a grated steel deck on two orange drums, banded
       white, bolted at the ends; a dark waterline across the drums. */
    /* A PUMP (14 Oct 2026): a riveted steel housing on the deck, a pipe from
       it down through the floor, its wheel on top; a gauge that shows red
       till it has been turned, and green after, the pipe throbbing while the
       sea drains away. */
    function drawPump(d, X, Y) {
        const x0 = X - 3, y0 = Y + 5;
        g.fillStyle = "#0a0e14"; g.fillRect(x0, y0, 22, 11); g.fillRect(X + 5, Y + 15, 6, 2);
        g.fillStyle = "#5a6676"; g.fillRect(x0 + 1, y0 + 1, 20, 9);
        g.fillStyle = "#8a96a6"; g.fillRect(x0 + 1, y0 + 1, 20, 2);
        g.fillStyle = "#3a4452"; g.fillRect(x0 + 1, y0 + 8, 20, 2);
        g.fillStyle = "#c8d2de"; for (const rx of [x0 + 2, x0 + 19]) { g.fillRect(rx, y0 + 4, 1, 1); g.fillRect(rx, y0 + 7, 1, 1); }
        // the gauge
        const draining = act.flood && act.flood.draining;
        g.fillStyle = "#0a0e14"; g.fillRect(x0 + 6, y0 + 3, 10, 5);
        g.fillStyle = d.open ? (draining && frameNo % 16 < 8 ? "#b8ffb8" : "#5ad05a") : (frameNo % 40 < 20 ? "#e04a3a" : "#9a2a20");
        g.fillRect(x0 + 7, y0 + 4, 8, 3);
        // the pipe down
        g.fillStyle = "#0a0e14"; g.fillRect(X + 5, Y + 15, 6, 2);
        g.drawImage(spr("wheel", (d.spin || 0) % 4), X + 1, Y - 8);
        if (!d.open && d.prog > 0) { g.fillStyle = "#0a0e14"; g.fillRect(X, Y - 13, 16, 3); g.fillStyle = d.prog > 0.75 ? "#7ae07a" : "#e8c040"; g.fillRect(X + 1, Y - 12, Math.round(14 * d.prog), 1); }
        if (draining && frameNo % 6 === 0) state.parts.push({ kind: "bubble", x: X + 6 + Math.random() * 4, y: Y + 18, vx: 0, vy: 0.6, t: 0 });
    }
    /* THE NEW ZONES' PICTURES (14 Oct 2026). */
    function drawLab(cam) {
        const B = TH.beat || 36, inView = (X, Y) => X > cam.x - 40 && X < cam.x + VW + 40 && Y > cam.y - 60 && Y < cam.y + VH + 40;
        // pours of sand (or water) from cracks in the roof, down to whatever stops them
        for (const p of act.pours) {
            const X = p.tx * TS + 5; if (!inView(X, p.ty * TS) && !inView(X, p.ty * TS + 200)) continue;
            let y = p.ty * TS; while (y < act.h * TS && !solidAt(Math.floor((X + 3) / TS), Math.floor(y / TS)) && !(act.flood && y > act.flood.y)) y += 2;
            const top = p.ty * TS, cols = TH.sand ? ["#e8c070", "#f8dc98", "#c89a50"] : ["#9fd8f6", "#e8f8ff", "#5aa8dc"];
            for (let yy = top; yy < y; yy++) { const k = ((yy - frameNo * 3) % 7 + 7) % 7; g.fillStyle = k < 2 ? cols[1] : k < 5 ? cols[0] : cols[2]; g.fillRect(X + ((yy >> 2) % 2), yy, 6, 1); }
            if (frameNo % 3 === 0) state.parts.push({ kind: "dust", x: X + 3, y: y - 1, vx: (Math.random() - 0.5) * 1.4, vy: -Math.random(), t: 0 });
        }
        // the drips: a drop swelling under the roof, falling
        for (const d of act.drips) {
            const X = d.x + 7; if (!inView(X, d.y) && !(d.drop && inView(X, d.drop.y))) continue;
            g.fillStyle = "#3a6a8a"; g.fillRect(X - 1, d.y, 3, 1);
            if (!d.drop) { const k = d.t / d.every; if (k > 0.5) { g.fillStyle = "#9fd0ee"; g.fillRect(X, d.y + 1, 1, k > 0.8 ? 2 : 1); } }
            else { g.fillStyle = "#cfeaff"; g.fillRect(X, Math.round(d.drop.y), 1, 3); g.fillStyle = "#7ab0d8"; g.fillRect(X, Math.round(d.drop.y) + 3, 1, 1); }
        }
        // the beat blocks, the roots, the brambles
        const ph = act.clock / (B * 2), warn = (act.clock % (B * 2)) > B * 1.5;
        for (const sw of act.switchers) {
            const X = sw.tx * TS, Y = sw.ty * TS; if (!inView(X, Y)) continue;
            if (sw.kind === "beatA" || sw.kind === "beatB") {
                if (sw.on) {
                    const flick = warn && frameNo % 6 < 3;
                    g.fillStyle = "#1a120a"; g.fillRect(X, Y, 16, 16);
                    g.fillStyle = flick ? "#f2cc4e" : sw.kind === "beatA" ? "#b07a28" : "#7a8a9a"; g.fillRect(X + 1, Y + 1, 14, 14);
                    g.fillStyle = sw.kind === "beatA" ? "#f2cc4e" : "#c8d2de"; g.fillRect(X + 1, Y + 1, 14, 2); g.fillRect(X + 1, Y + 1, 2, 14);
                    g.fillStyle = sw.kind === "beatA" ? "#6a4410" : "#3a4452"; g.fillRect(X + 1, Y + 13, 14, 2); g.fillRect(X + 13, Y + 1, 2, 14);
                    g.fillStyle = "#1a120a"; for (const [rx, ry] of [[4, 4], [11, 4], [4, 11], [11, 11]]) g.fillRect(X + rx, Y + ry, 1, 1);
                } else {
                    // shut away: its outline in dots, so the place it will be is plain
                    g.fillStyle = sw.kind === "beatA" ? "rgba(242,204,78,0.5)" : "rgba(200,210,222,0.5)";
                    for (let i = 0; i < 16; i += 3) { g.fillRect(X + i, Y, 1, 1); g.fillRect(X + i, Y + 15, 1, 1); g.fillRect(X, Y + i, 1, 1); g.fillRect(X + 15, Y + i, 1, 1); }
                    if (warn) { g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(X + 2, Y + 2, 12, 12); }
                }
            } else if (sw.kind === "rain") {
                // a root grown across: twisted, lit on top, leaves on it
                const k = sw.on ? sw.grow : 0;
                if (k > 0) {
                    const w = Math.round(16 * k);
                    g.fillStyle = "#2a1a0c"; g.fillRect(X + 8 - w / 2, Y + 2, w, 9);
                    g.fillStyle = "#7a5230"; g.fillRect(X + 8 - w / 2, Y + 3, w, 6);
                    g.fillStyle = "#a8784a"; g.fillRect(X + 8 - w / 2, Y + 3, w, 2);
                    g.fillStyle = "#5a3a1e"; for (let i = 0; i < w; i += 4) g.fillRect(X + 8 - w / 2 + i, Y + 5 + ((i + sw.tx) % 2), 2, 1);
                    if (k > 0.8 && (sw.tx + sw.ty) % 2) { g.fillStyle = "#5aa83a"; g.fillRect(X + 4, Y, 3, 2); g.fillStyle = "#8ad05a"; g.fillRect(X + 5, Y, 1, 1); }
                } else { g.fillStyle = "#4a3420"; g.fillRect(X + 6, Y + 6, 4, 2); g.fillRect(X + 8, Y + 5, 1, 1); }
            } else {
                // a bramble: a thorny tangle while the sun is out; flattened in the rain
                if (sw.on) {
                    g.fillStyle = "#1a2a10"; g.fillRect(X, Y + 1, 16, 15);
                    g.fillStyle = "#3a6a22"; g.fillRect(X + 1, Y + 2, 14, 13);
                    g.fillStyle = "#5a9a32"; for (let i = 0; i < 6; i++) g.fillRect(X + 1 + ((i * 5 + sw.ty) % 13), Y + 2 + ((i * 7 + sw.tx) % 11), 3, 2);
                    g.fillStyle = "#e05a4a"; for (let i = 0; i < 5; i++) g.fillRect(X + ((i * 7 + 2) % 15), Y + 1 + ((i * 3) % 14), 1, 1);
                    g.fillStyle = "#e8e0c0"; for (let i = 0; i < 4; i++) g.fillRect(X + ((i * 4 + 1) % 16), Y + (i % 2 ? 1 : 15), 1, 1);
                } else { g.fillStyle = "#2a4a1a"; g.fillRect(X + 1, Y + 12, 14, 4); g.fillStyle = "#3a6a22"; g.fillRect(X + 2, Y + 13, 12, 2); }
            }
        }
        // conveyor belts: the belt running over the top, rollers at the ends
        for (const [k, d] of act.conveyors) {
            const [tx, ty] = k.split(",").map(Number), X = tx * TS, Y = ty * TS; if (!inView(X, Y)) continue;
            g.fillStyle = "#0e0e14"; g.fillRect(X, Y, 16, 5);
            for (let i = 0; i < 16; i++) { const k2 = ((X + i - frameNo * d) % 6 + 6) % 6; g.fillStyle = k2 < 2 ? "#5a5a68" : "#2a2a32"; g.fillRect(X + i, Y + 1, 1, 3); }
            const L = act.conveyors.has((tx - 1) + "," + ty), R = act.conveyors.has((tx + 1) + "," + ty);
            for (const [rx, has] of [[X + 2, L], [X + 13, R]]) if (!has) { g.fillStyle = "#0e0e14"; g.fillRect(rx - 2, Y, 5, 5); g.fillStyle = "#9a9aae"; g.fillRect(rx - 1, Y + 1, 3, 3); g.fillStyle = "#3a3a44"; g.fillRect(rx, Y + 2, 1, 1); }
        }
        // hourglasses: a brass frame, the sand in the end it has run to
        for (const gl of act.glasses) {
            const X = gl.x + 2, Y = gl.y - 6; if (!inView(X, Y)) continue;
            const up = act.flood && act.flood.sandHigh, jig = gl.flip > 0.6 ? (frameNo % 4 < 2 ? 1 : -1) : 0;
            g.fillStyle = "#1a120a"; g.fillRect(X - 1 + jig, Y, 14, 3); g.fillRect(X - 1 + jig, Y + 19, 14, 3);
            g.fillStyle = "#c8962e"; g.fillRect(X + jig, Y + 1, 12, 1); g.fillRect(X + jig, Y + 20, 12, 1);
            g.fillStyle = "#7a5418"; g.fillRect(X + jig, Y + 3, 1, 16); g.fillRect(X + 11 + jig, Y + 3, 1, 16);
            for (let i = 0; i < 16; i++) { const w = Math.max(1, Math.abs(8 - i) * 0.6 + 1) | 0; g.fillStyle = "rgba(207,238,252,0.55)"; g.fillRect(X + 6 - w + jig, Y + 3 + i, w * 2, 1); const sandy = up ? i < 6 : i > 9; if (sandy) { g.fillStyle = "#e8c070"; g.fillRect(X + 6 - w + jig + 1, Y + 3 + i, Math.max(1, w * 2 - 2), 1); } }
            if (frameNo % 8 < 4) { g.fillStyle = "#f8dc98"; g.fillRect(X + 5 + jig, Y + 11, 2, 1); }
        }
    }
    // a slag raft: glowing when new, darkening and cracking as it cools
    function drawRaft(m) {
        const X = Math.round(m.x), Y = Math.round(m.y), k = Math.min(1, m.age / RAFT_LIFE);
        const body = k < 0.35 ? "#ff8a30" : k < 0.7 ? "#c8501e" : "#5a2a1a", top = k < 0.35 ? "#ffd080" : k < 0.7 ? "#e0702a" : "#7a3a22";
        g.fillStyle = "#1a0806"; g.fillRect(X, Y, m.w, 10);
        g.fillStyle = body; g.fillRect(X + 1, Y + 1, m.w - 2, 8);
        g.fillStyle = top; g.fillRect(X + 1, Y + 1, m.w - 2, 2);
        g.fillStyle = k < 0.7 ? "#ffe0a0" : "#ff7a2a"; for (let i = 3; i < m.w - 3; i += 7) g.fillRect(X + i, Y + 4 + (i % 3), 3, 1);
    }
    // the rain, the darker sky with it
    /* THE RAIN (14 Oct 2026, the owner's: "just have it raining constantly above ground"): streaks
       only where the sky is (open up to the top of the map); none underground. */
    function drawRain(cam) {
        const W = act.weather, M = act.skyMask;
        if (W && W.dark > 0) { g.fillStyle = "rgba(16,24,34," + (0.32 * W.dark).toFixed(2) + ")"; g.fillRect(cam.x, cam.y, VW, VH); }
        if (W && !W.rain && !TH.rainy) return;
        const open = (px, py) => { if (!M) return true; const tx = Math.floor(px / TS), ty = Math.floor(py / TS); return tx >= 0 && ty >= 0 && tx < act.w && ty < act.h && M[ty * act.w + tx] === 1; };
        for (let i = 0; i < 120; i++) {
            const x0 = (i * 37 + frameNo * 2) % (VW + 40) - 20, y0 = (i * 53 + frameNo * 9) % VH, far = i % 3 === 0;
            g.fillStyle = far ? "rgba(170,200,225,0.35)" : "rgba(200,225,245,0.6)";
            for (let j = 0; j < (far ? 4 : 6); j++) { const px = cam.x + x0 - j, py = cam.y + y0 + j * 2; if (open(px, py)) g.fillRect(px, py, 1, 2); }
        }
    }
    /* A GEAR'S PICTURE (14 Oct 2026, the owner's: "the gears don't look properly circular"): worked
       out pixel by pixel from a true circle, teeth spaced evenly round it, lit from the top left,
       spokes from a hub; made once for each size and each of 48 turns and kept. cols: k outline,
       b body, l lit, d shade, h hub.
       (26 Oct 2026, the bug scan) Kept for the passage they are drawn in, not the whole visit: the
       Steamworks Factory's gears behind it and its two cogs (240 turns each) came to some 1,300 pictures,
       about 50MB, in ten minutes there, all still held after leaving it. buildAct lets them go, and a
       cap well over that one passage's need stops any one passage holding more. */
    const gearCache = new Map();
    const hexRGB = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const gearHash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const gearNoise = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), A = gearHash(ix, iy), B = gearHash(ix + 1, iy), C = gearHash(ix, iy + 1), D = gearHash(ix + 1, iy + 1); return (A + (B - A) * su) * (1 - sv) + (C + (D - C) * su) * sv; };
    function gearImage(R, teeth, cols, ang) {
        const steps = cols.steps || 48, q = ((Math.round(ang / (Math.PI * 2) * steps) % steps) + steps) % steps;
        const key = R + "|" + teeth + "|" + cols.b + "|" + (cols.wear || 0) + "|" + steps + "|" + (cols.depth || 0) + "|" + q;
        let c = gearCache.get(key); if (c) return c;
        const depth = cols.depth || Math.max(3, Math.round(R * 0.13)), S = (R + depth + 2) * 2 + 1, cx = (S - 1) / 2, rot = q / steps * Math.PI * 2;
        c = document.createElement("canvas"); c.width = c.height = S;
        const x = c.getContext("2d"), img = x.createImageData(S, S), P = {};
        for (const k of Object.keys(cols)) if (typeof cols[k] === "string") P[k] = hexRGB(cols[k]);
        if (cols.ramp) cols.ramp.forEach((c, i) => { P["s" + i] = hexRGB(c); });
        if (cols.rust) cols.rust.forEach((c, i) => { P["r" + i] = hexRGB(c); });
        const rin = R * 0.66, hub = Math.max(3, R * 0.2), spokes = Math.max(4, Math.min(6, Math.round(R / 8))), step = Math.PI * 2 / teeth;
        for (let y = 0; y < S; y++) for (let X = 0; X < S; X++) {
            const dx = X - cx, dy = y - cx, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
            const t = ((((a - rot) / step) % 1) + 1) % 1, tooth = t > 0.08 && t < 0.5;
            const outer = tooth ? R + depth : R;
            if (d > outer + 0.5) continue;
            let k;
            const lightK = (-dx - dy) / (d || 1);
            if (d > outer - 0.9) k = "k";
            else if (d > rin + 1.5) {
                if (cols.ramp) { let lv = 3 + Math.round(lightK * 1.25); if (d > outer - 1.9 && lightK > 0.3) lv++; if (d < rin + 2.6) lv--; k = "s" + Math.max(1, Math.min(5, lv)); }
                else k = lightK > 0.55 ? "l" : lightK < -0.55 ? "d" : "b";
            }
            else if (d > rin + 0.5) k = "k";
            else if (d <= hub) k = d > hub - 1 ? "k" : "h";
            else {
                let spoke = false;
                for (let i = 0; i < spokes; i++) { const sa = rot + i * Math.PI * 2 / spokes, rel = a - sa, cs = Math.cos(rel), sn = Math.abs(Math.sin(rel) * d); if (cs > 0 && sn < 1.8) { spoke = true; if (sn > 0.9) k = "k"; break; } }
                if (!spoke) continue;
                if (!k) k = cols.ramp ? (lightK > 0.3 ? "s4" : lightK < -0.3 ? "s2" : "s3") : lightK > 0.3 ? "l" : "b";
            }
            /* (14 Oct 2026) rust in patches, worked out on the wheel itself so it turns with it */
            if (cols.rust && cols.wear > 0 && (k === "b" || k === "l" || k === "d" || k[0] === "s")) {
                const cr = Math.cos(-rot), sr = Math.sin(-rot), lx = dx * cr - dy * sr + 300, ly = dx * sr + dy * cr + 300;
                const n = gearNoise(lx / 7, ly / 7) * 0.6 + gearNoise(lx / 2.6 + 40, ly / 2.6) * 0.4, hs = gearHash(Math.round(lx * 3), Math.round(ly * 5));
                if (n > 0.84 - cols.wear * 0.2) k = k === "l" || k > "s3" ? "r2" : k === "b" || k === "s3" ? "r1" : "r0";
                else if (hs < 0.012 * cols.wear) k = "r1";
            }
            const p = P[k], o = (y * S + X) * 4; img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = 255;
        }
        x.putImageData(img, 0, 0);
        gearCache.set(key, c); if (gearCache.size > 2000) gearCache.delete(gearCache.keys().next().value);
        return c;
    }
    // THE GEAR WHEELS: the cog, turning, and an iron arm out to each ledge
    function drawGears(cam) {
        const cols = (TH.gearColsFor && TH.gearColsFor(act)) || TH.gearCols || { k: "#120a04", b: "#8a5e18", l: "#c8962e", d: "#5a3a10", h: "#f2cc4e" };
        for (const G of act.gears) {
            if (G.cx + G.R + 60 < cam.x || G.cx - G.R - 60 > cam.x + VW || G.cy + G.R + 60 < cam.y || G.cy - G.R - 60 > cam.y + VH) continue;
            drawGear(G, cols);
        }
    }
    const cogDepth = R => Math.max(2, Math.round(R * 0.07));
    function drawGear(G, cols) {
        cols = cols || (TH.gearColsFor && TH.gearColsFor(act)) || TH.gearCols || { k: "#120a04", b: "#8a5e18", l: "#c8962e", d: "#5a3a10", h: "#f2cc4e" };
        // small teeth, about six pixels apart round the rim; turned in fine steps so they creep round rather than jump
        const R = Math.round(G.R), teeth = Math.max(10, Math.round(Math.PI * 2 * R / 6)), img = gearImage(R, teeth, Object.assign({}, cols, { depth: cogDepth(R), steps: 240 }), G.ang);
        g.drawImage(img, Math.round(G.cx - img.width / 2), Math.round(G.cy - img.height / 2));
        g.fillStyle = "#0e0c10"; g.fillRect(Math.round(G.cx) - 3, Math.round(G.cy) - 3, 6, 6); g.fillStyle = "#c8c8d8"; g.fillRect(Math.round(G.cx) - 1, Math.round(G.cy) - 1, 2, 2);
    }
    /* A COG TO STAND ON: come down on it and Scout stands on its teeth wherever on its top he lands; as
       it turns it carries him round with it (and off the side, if he lets it); from the side it is a
       wall, from below a roof. Run after Scout has moved, so he is put back on it each frame. */
    function stepCogs() {
        const h = hero;
        for (const G of act.gears) {
            const Ro = G.R + cogDepth(G.R) * 0.6, hx = h.x + h.w / 2, dx = hx - G.cx;
            if (Math.abs(dx) > Ro + 20 || h.y > G.cy + Ro + 4 || h.y + h.h < G.cy - Ro - 30) continue;
            const feet = h.y + h.h, prevFeet = feet - h.vy;
            // the point of his feet nearest the wheel's middle: a toe on the rim is enough to stand on
            const near = () => Math.max(h.x + 1, Math.min(G.cx, h.x + h.w - 1)) - G.cx, dn = near();
            if (Math.abs(dn) < Ro * 0.94 && h.vy >= 0) {
                const surf = G.cy - Math.sqrt(Ro * Ro - dn * dn);
                if (feet >= surf - 1 && prevFeet <= surf + 6 && feet <= surf + 12 && !h.climb) {
                    if (!G.still) h.x += -G.speed * (surf - G.cy);   // carried round with the rim
                    const dx2 = near();
                    if (Math.abs(dx2) < Ro) h.y = G.cy - Math.sqrt(Ro * Ro - dx2 * dx2) - h.h;
                    h.vy = 0; h.ground = true; h.coyote = COYOTE;
                    continue;
                }
            }
            const px = Math.max(h.x, Math.min(G.cx, h.x + h.w)), py = Math.max(h.y, Math.min(G.cy, h.y + h.h)), d = Math.hypot(px - G.cx, py - G.cy);
            if (d < Ro) {
                if (py > G.cy + Ro * 0.3 && h.vy < 0) { h.y += Ro - d + 0.5; h.vy = 0.5; }
                else { const s = hx < G.cx ? -1 : 1; h.x += s * (Ro - d + 0.5); h.vx = 0; }
            }
        }
    }
    // a gear's ledge: a riveted iron plate, its hook to the arm in the middle
    function drawOrbitLedge(m) {
        if (TH.ledge) return TH.ledge(g, m, act, helpers());
        const X = Math.round(m.x), Y = Math.round(m.y), W = m.w;
        g.fillStyle = "#0e0c10"; g.fillRect(X, Y, W, 8); g.fillRect(X + W / 2 - 2, Y + 7, 4, 4);
        g.fillStyle = "#8a8294"; g.fillRect(X + 1, Y + 1, W - 2, 1); g.fillStyle = "#5a5262"; g.fillRect(X + 1, Y + 2, W - 2, 4); g.fillStyle = "#3a3240"; g.fillRect(X + 1, Y + 6, W - 2, 1);
        g.fillStyle = "#e8b020"; for (let i = 3; i < W - 3; i += 8) g.fillRect(X + i, Y + 3, 4, 2);
        g.fillStyle = "#c8c8d8"; g.fillRect(X + 2, Y + 3, 1, 1); g.fillRect(X + W - 3, Y + 3, 1, 1);
    }
    /* HEAT (14 Oct 2026, the owner's: "it's clearly just 4 colours making up the lava, make it 100x
       better!!"). Lava, the fire jets and the molten drops are drawn pixel by pixel from a field of
       heat: thirteen shades from near black through blood red, orange and gold to white, laid on with
       an ordered dither so one shade melts into the next; the heat itself moving (flowing along a pool,
       roaring out of a jet), worked out from smooth noise, so nothing is ever the same twice. */
    const HEATHEX = ["#140302", "#2c0603", "#4c0a04", "#741205", "#9c1e07", "#c4300a", "#e44a10", "#f86a18", "#ff8e24", "#ffb238", "#ffd25a", "#ffea94", "#fff8d8"];
    const HEAT = HEATHEX.map(hexRGB);
    /* SLIME (14 Oct 2026, the owner's: "swap out the orange lava for a green slime", the Steamworks as a
       science experiment gone wrong): the same field, laid on in thirteen greens from near black through
       toxic green to a pale, glowing lime, where a zone says so (TH.slime). Fire stays fire. */
    const SLIMEHEX = ["#010603", "#03100a", "#061c0e", "#0a2c12", "#104016", "#18581a", "#22721e", "#309022", "#46ae28", "#68ca30", "#94e244", "#c6f47a", "#effdd0"];
    const SLIME = SLIMEHEX.map(hexRGB);
    let HP = HEAT, HPX = HEATHEX;
    const liq = on => { const s = on && TH.slime; HP = s ? SLIME : HEAT; HPX = s ? SLIMEHEX : HEATHEX; };
    const liqGlow = () => (TH.slime ? "110,255,90" : undefined), liqCore = () => (TH.slime ? "200,255,150" : "255,200,90");
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - 0.47);
    function heatPut(D, o, h, x, y, alpha) {
        const n = HEAT.length - 1; let i = Math.floor(h * n + BAYER[(y & 3) * 4 + (x & 3)] * 0.9 + 0.5);
        i = i < 0 ? 0 : i > n ? n : i; const p = HP[i];
        D[o] = p[0]; D[o + 1] = p[1]; D[o + 2] = p[2]; D[o + 3] = alpha === undefined ? 255 : alpha;
    }
    const heatHex = h => HPX[Math.max(0, Math.min(HPX.length - 1, Math.round(h * (HPX.length - 1))))];
    const glowAt = (x, y, r, a, rgb) => { const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, "rgba(" + (rgb || "255,120,30") + "," + a.toFixed(3) + ")"); gr.addColorStop(1, "rgba(" + (rgb || "255,120,30") + ",0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    // the lava as boxes (each a run of tiles, as deep as it goes), each with a picture of its own
    function lavaBoxesOf(a) {
        if (a._lavaBoxes) return a._lavaBoxes;
        const set = a.lava, done = new Set(), boxes = [];
        const tiles = [...set].map(k => k.split(",").map(Number)).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
        for (const [tx, ty] of tiles) {
            if (done.has(tx + "," + ty)) continue;
            let x1 = tx; while (set.has((x1 + 1) + "," + ty) && !done.has((x1 + 1) + "," + ty)) x1++;
            const full = yy => { for (let x = tx; x <= x1; x++) if (!set.has(x + "," + yy) || done.has(x + "," + yy)) return false; return true; };
            let y1 = ty; while (full(y1 + 1)) y1++;
            for (let y = ty; y <= y1; y++) for (let x = tx; x <= x1; x++) done.add(x + "," + y);
            boxes.push({ tx, ty, w: (x1 - tx + 1) * TS, h: (y1 - ty + 1) * TS, top: !set.has(tx + "," + (ty - 1)), c: null, bubbles: [], rings: [] });
        }
        return (a._lavaBoxes = boxes);
    }
    const lavaSurf = (wx, t) => 2 + Math.round(Math.sin(wx / 7 + t / 14) * 1.1 + Math.sin(wx / 3.1 - t / 9) * 0.5);
    /* A POOL: its surface rolling, white-hot along the top and gold just under it; below, molten
       metal flowing slowly, bright veins wandering through deep red, darker the deeper it goes; plates
       of cooled crust drifting on top, glowing at their cracks; bubbles swelling and bursting. */
    function paintLava(B) {
        liq(true);
        const W = B.w, H = B.h, X0 = B.tx * TS, Y0 = B.ty * TS, t = TH.slime ? frameNo * 0.6 : frameNo;
        if (!B.c) { B.c = document.createElement("canvas"); B.c.width = W; B.c.height = H; B.x = B.c.getContext("2d"); B.img = B.x.createImageData(W, H); }
        const D = B.img.data; D.fill(0);
        for (let x = 0; x < W; x++) {
            const wx = X0 + x, sy = B.top ? lavaSurf(wx, t) : -99;
            // a plate of cooled crust riding the surface: a little proud of it, dark, cracked through with light, glowing at its edges
            const cn = gearNoise(wx / 16 - t * 0.01 + 200, 3.7), crust = B.top && cn > 0.63, edge = crust && cn < 0.645;
            const y0 = crust ? Math.max(0, sy - 1) : Math.max(0, sy);
            for (let y = y0; y < H; y++) {
                const wy = Y0 + y, dy = y - sy;
                let h;
                if (crust && dy < 3) {
                    const crack = Math.abs(Math.sin(wx / 2.3 + cn * 23 + (dy === 1 ? 0.9 : 0))) < 0.16;
                    h = edge ? 0.9 : crack ? 0.72 : dy === -1 ? (gearHash(wx, 7) < 0.3 ? 0.24 : 0.16) : 0.09 + (gearHash(wx, wy) < 0.2 ? 0.06 : 0);
                } else {
                    const f1 = gearNoise(wx / 14 + t * 0.025, wy / 7 - t * 0.003), f2 = gearNoise(wx / 6 - t * 0.04 + 30, wy / 4 + t * 0.01);
                    h = 0.62 + (f1 - 0.5) * 0.5 + (f2 - 0.5) * 0.24 - Math.min(0.22, Math.max(0, dy) * 0.008);
                    const band = Math.sin(wx / 9 + f1 * 5 + wy / 6 - t * 0.05);
                    if (band > 0.8) h += 0.24 * (band - 0.8) / 0.2; else if (band < -0.86) h -= 0.1;
                    if (dy === 0) h = 1; else if (dy === 1) h = Math.max(h, 0.9); else if (dy === 2) h = Math.max(h, 0.8); else if (dy > 2 && dy < 6) h += 0.08;
                    if (crust && dy === 3) h = Math.max(h, 0.9);
                    h = Math.max(h, dy < 10 ? 0.34 : 0.26);
                }
                heatPut(D, (y * W + x) * 4, h, wx, wy);
            }
        }
        // the bubbles: a dome swelling out of the surface, lit, then gone with a spit of sparks
        if (B.top && Math.random() < W / 7000) B.bubbles.push({ x: 4 + Math.floor(Math.random() * (W - 8)), t: 0, life: 24 + Math.floor(Math.random() * 24), r: 1.6 + Math.random() * 1.6 });
        for (const b of B.bubbles) {
            b.t += 2; const R = b.r * Math.min(1, b.t / 16), sy = lavaSurf(X0 + b.x, t);
            for (let dy = -Math.ceil(R); dy <= 0; dy++) for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) {
                const d = Math.hypot(dx, dy); if (d > R + 0.3) continue;
                const px = b.x + dx, py = sy + dy; if (px < 0 || px >= W || py < 0 || py >= H) continue;
                heatPut(D, (py * W + px) * 4, d > R - 0.9 ? 0.62 : dx === -1 && dy === -Math.round(R) + 1 ? 1 : 0.9, X0 + px, Y0 + py);
            }
            if (b.t >= b.life) { b.gone = true; for (let i = 0; i < 4; i++) state.parts.push({ kind: "spark", slime: TH.slime, x: X0 + b.x, y: Y0 + sy - 1, vx: (Math.random() - 0.5) * 1.2, vy: -0.8 - Math.random() * 1.4, t: 0, life: 18 + Math.random() * 14 }); }
        }
        if (B.bubbles.length) B.bubbles = B.bubbles.filter(b => !b.gone);
        // rings where a drop fell in
        for (const r of B.rings) {
            r.t += 2; const sp = r.t * 0.35;
            for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const px = Math.round(r.x + sx * (sp + k)); if (px < 0 || px >= W) continue; const py = Math.max(0, lavaSurf(X0 + px, t) - (k === 1 ? 1 : 0)); heatPut(D, (py * W + px) * 4, 1 - r.t / 40, X0 + px, Y0 + py); }
            if (r.t > 30) r.gone = true;
        }
        if (B.rings.length) B.rings = B.rings.filter(r => !r.gone);
        B.x.putImageData(B.img, 0, 0);
    }
    function drawLava(cam) {
        const boxes = lavaBoxesOf(act);
        for (const B of boxes) {
            const X = B.tx * TS, Y = B.ty * TS;
            if (X + B.w < cam.x - 8 || X > cam.x + VW + 8 || Y + B.h < cam.y - 8 || Y > cam.y + VH + 8) continue;
            if (!B.c || frameNo % 2 === 0) paintLava(B);
            g.drawImage(B.c, X, Y);
            if (B.top && frameNo % 23 === 0) { const sx = X + Math.random() * B.w; state.parts.push({ kind: "spark", slime: TH.slime, x: sx, y: Y + 1, vx: (Math.random() - 0.5) * 0.3, vy: -0.4 - Math.random() * 0.5, t: 0, life: 50, float: true }); }
        }
        // its heat, glowing up the walls and over the roof, breathing
        g.save(); g.globalCompositeOperation = "lighter";
        for (const B of boxes) {
            if (!B.top) continue;
            for (let x = B.tx * TS + 16; x < B.tx * TS + B.w; x += 32) {
                const Y = B.ty * TS; if (x < cam.x - 70 || x > cam.x + VW + 70 || Y < cam.y - 70 || Y > cam.y + VH + 70) continue;
                const f = 0.17 + Math.sin(frameNo / 23 + x / 40) * 0.035; glowAt(x, Y, 64, f, liqGlow());
                glowAt(x, Y + 2, 22, 0.12, liqCore());
            }
        }
        g.restore();
    }
    /* A FIRE JET'S FLAME: a roaring plume, narrow and white at the nozzle, swelling gold and orange,
       ragged red licks at its end and a little smoke; the turbulence races outward. Drawn along +x
       into a picture of its own, turned to the jet's way. */
    function jetImage(b, L) {
        liq(false);
        const W = b.len + 10, H = 17;
        let J = b._jet; if (!J) { J = b._jet = { c: document.createElement("canvas") }; J.c.width = W; J.c.height = H; J.x = J.c.getContext("2d"); J.img = J.x.createImageData(W, H); }
        const D = J.img.data, t = frameNo, sd = (b.x * 7 + b.y * 3) % 97; D.fill(0);
        for (let u = 0; u < W; u++) {
            const f = u / Math.max(4, L); if (f > 1.2) break;
            const grow = Math.sin(Math.min(1, f * 1.7) * Math.PI / 2), base = 1.7 + 4.8 * grow * (f > 0.68 ? Math.max(0, 1 - (f - 0.68) * 2.3) : 1);
            const wave = Math.sin(u / 5 - t * 0.35 + sd) * Math.min(1.5, f * 2.2);
            for (let v = -8; v <= 8; v++) {
                const n = gearNoise(u / 3.4 - t * 0.62 + sd, v / 2.3 + sd * 0.3), edge = base * (0.68 + 0.64 * n), av = Math.abs(v - wave);
                if (av > edge) continue;
                let h = 1.04 - f * 0.8 - Math.pow(av / (edge + 0.01), 2) * 0.45 + (n - 0.5) * 0.36;
                if (f < 0.16 && av < 1.6) h = 1;
                const o = (v + 8) * W * 4 + u * 4;
                if (h < 0.2) { if (f > 0.55) { D[o] = 52; D[o + 1] = 40; D[o + 2] = 36; D[o + 3] = 120; } continue; }
                heatPut(D, o, h, u, v + 8);
            }
        }
        J.x.putImageData(J.img, 0, 0);
        return J.c;
    }
    // the way each jet faces: where its flame starts (the nozzle's mouth) and the turn from +x
    const JET = { up: [8, 7, -Math.PI / 2], down: [8, 9, Math.PI / 2], left: [7, 8, Math.PI], right: [9, 8, 0] };   // (14 Oct 2026) from the nozzle's mouth, not from inside it
    const NOZZLE_TURN = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
    /* A NOZZLE: a short iron pipe out of the floor (or wall, or roof), a bolted flange at its root,
       worn and rusty; drawn facing up and turned. Its mouth glows as it heats, before it fires. */
    let nozzleArt = null;
    function nozzleImage() {
        if (nozzleArt) return nozzleArt;
        const c = document.createElement("canvas"); c.width = c.height = 16; const x = c.getContext("2d");
        const K = "#0c0a0c", I = ["#1c1a1e", "#2c2a30", "#3e3c44", "#56545c", "#76747c"], RU = ["#433022", "#64482e", "#86603a"];
        const px = (X, Y, col) => { x.fillStyle = col; x.fillRect(X, Y, 1, 1); };
        // the flange
        for (let X = 2; X <= 13; X++) for (let Y = 13; Y <= 15; Y++) px(X, Y, X === 2 || X === 13 || Y === 13 ? K : Y === 14 ? (X < 6 ? I[4] : I[3]) : I[1]);
        px(3, 14, I[4]); px(12, 14, I[2]); px(4, 14, "#9a98a0"); px(11, 14, "#9a98a0");
        // the stub
        for (let Y = 8; Y <= 12; Y++) for (let X = 4; X <= 11; X++) px(X, Y, X === 4 || X === 11 ? K : [I[4], I[3], I[3], I[2], I[2], I[1]][X - 5]);
        // the lip of its mouth
        for (let X = 3; X <= 12; X++) { px(X, 7, K); px(X, 8, X === 3 || X === 12 ? K : X < 7 ? I[4] : I[2]); }
        px(3, 9, K); px(12, 9, K);
        for (let X = 4; X <= 11; X++) px(X, 9, X < 7 ? I[3] : I[1]);
        // rust, here and there
        px(9, 11, RU[1]); px(10, 12, RU[0]); px(6, 15, RU[1]); px(10, 15, RU[2]); px(5, 10, RU[2]);
        nozzleArt = c; return c;
    }
    // THE HAZARDS: fire jets; drops of molten metal from pipes in the roof; what is left where they land
    function drawHazards(cam) {
        liq(false);
        for (const b of act.burners) {
            if (b.x < cam.x - 80 || b.x > cam.x + VW + 80 || b.y < cam.y - 80 || b.y > cam.y + VH + 80) continue;
            const warn = b.t > b.every - 40, warmK = b.k > 0 ? 1 : warn ? (b.t - (b.every - 40)) / 40 : b.t < b.on + 40 ? Math.max(0, 1 - (b.t - b.on) / 40) : 0;
            drawNozzle(b, warmK);
            if (warn && frameNo % 5 === 0) { const [jx, jy, ang] = JET[b.dir]; state.parts.push({ kind: "spark", x: b.x + jx + (Math.random() - 0.5) * 4, y: b.y + jy, vx: Math.cos(ang) * 0.8 + (Math.random() - 0.5) * 0.6, vy: Math.sin(ang) * 0.8 + (Math.random() - 0.5) * 0.6, t: 0, life: 14 }); }
            if (warn && frameNo % 7 === 0) state.parts.push({ kind: "smoke", x: b.x + 8, y: b.y + 8, vx: (Math.random() - 0.5) * 0.3, vy: -0.35, t: 0, life: 40 });
            if (!(b.k > 0)) continue;
            const L = b.len * b.k, [jx, jy, ang] = JET[b.dir];
            const img = jetImage(b, L);
            g.save(); g.translate(b.x + jx, b.y + jy); g.rotate(ang); g.drawImage(img, 0, -8);
            g.globalCompositeOperation = "lighter"; glowAt(L * 0.45, 0, L * 0.55 + 12, 0.22 * b.k); glowAt(4, 0, 14, 0.25 * b.k, "255,220,140");
            g.restore();
            if (frameNo % 2 === 0) { const tip = Math.random() * 0.4 + 0.6; state.parts.push({ kind: "spark", x: b.x + jx + Math.cos(ang) * L * tip + (Math.random() - 0.5) * 6, y: b.y + jy + Math.sin(ang) * L * tip + (Math.random() - 0.5) * 6, vx: Math.cos(ang) * 0.6 + (Math.random() - 0.5) * 0.8, vy: Math.sin(ang) * 0.6 + (Math.random() - 0.5) * 0.8, t: 0, life: 16 + Math.random() * 12, float: true }); }
        }
        // the old splashes (none in the factory now): the lava bubbling, then the blobs thrown up
        for (const sp of act.splashes) if (sp.t > sp.every - 45 && frameNo % 4 === 0) state.parts.push({ kind: "spark", x: sp.x + 4 + Math.random() * 8, y: sp.y + 1, vx: (Math.random() - 0.5) * 0.6, vy: -0.6, t: 0, life: 14 });
        for (const bl of act.blobs) drawDrop(Math.round(bl.x), Math.round(bl.y), 2.2, bl.vy);
        // THE DRIPPING PIPES: a pipe down from the roof, a glob of molten metal (or slime) swelling at its mouth, letting go, falling slowly
        liq(true);
        for (const oz of act.oozes) {
            const X = oz.x + 8, mouth = oz.y + oz.len;
            if (X < cam.x - 40 || X > cam.x + VW + 40 || (mouth < cam.y - 30 && !(oz.drop && oz.drop.y > cam.y)) || oz.y > cam.y + VH + 20) { continue; }
            drawOozePipe(oz);
            const REL = oozeRelease(oz);
            if (oz.t < REL) {
                const k = oz.t / REL, R = 3.3 * k;
                if (R > 0.6) drawGlob(X, mouth + 1, R, k);
                g.save(); g.globalCompositeOperation = "lighter"; glowAt(X, mouth + 2, 10 + 10 * k, 0.12 + 0.2 * k, liqGlow()); g.restore();
            }
            const d = oz.drop;
            if (d) {
                if (d.age < 7) { g.fillStyle = heatHex(0.75 - d.age * 0.06); g.fillRect(X, mouth + 1, 1, Math.max(0, Math.round(d.y - mouth - 3))); }
                drawDrop(Math.round(d.x), Math.round(d.y), 2.4, d.vy);
                g.save(); g.globalCompositeOperation = "lighter"; glowAt(d.x, d.y, 14, 0.26, liqGlow()); g.restore();
            }
        }
        // where a drop landed on iron: a splash of metal, glowing, cooling to a dark crust, gone
        for (const p of act.puddles) {
            const k = p.t / p.life, h = 0.95 - k * 0.85, w = Math.max(2, Math.round(7 - k * 2));
            g.fillStyle = heatHex(h); g.fillRect(Math.round(p.x - w / 2), p.y - 1, w, 1);
            g.fillStyle = heatHex(h + 0.08); g.fillRect(Math.round(p.x - w / 2) + 1, p.y - 2, Math.max(1, w - 2), 1);
            if (k < 0.5) { g.save(); g.globalCompositeOperation = "lighter"; glowAt(p.x, p.y - 1, 10, 0.2 * (1 - k * 2), liqGlow()); g.restore(); }
        }
        liq(false);
    }
    function drawNozzle(b, warmK) {
        g.save(); g.translate(b.x + 8, b.y + 8); g.rotate(NOZZLE_TURN[b.dir] || 0);
        g.drawImage(nozzleImage(), -8, -8);
        // the mouth, heating: dark iron, dull red, orange, white
        for (let X = 4; X <= 11; X++) { g.fillStyle = warmK > 0.05 ? heatHex(0.15 + warmK * 0.8 - Math.abs(X - 7.5) * 0.04) : "#141012"; g.fillRect(X - 8, -1, 1, 1); }
        if (warmK > 0.3) { g.fillStyle = heatHex(warmK * 0.45); g.fillRect(-4, 0, 1, 1); g.fillRect(3, 0, 1, 1); }
        g.restore();
    }
    const onScreen = (x, y) => x > state.cam.x - 8 && x < state.cam.x + VW + 8 && y > state.cam.y - 8 && y < state.cam.y + VH + 8;
    const oozeRelease = oz => Math.min(95, oz.every - 25);
    // a glob, hanging: a ball of molten metal, white-hot in its heart, red at its skin, lit from the top left; heavy, it sags
    function drawGlob(cx, top, R, k) {
        const sag = R > 2.4 ? (R - 2.4) * 1.4 : 0;
        for (let dy = 0; dy <= Math.ceil(R * 2 + sag); dy++) for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) {
            const ny = dy - R - sag * 0.5, d = Math.hypot(dx, ny / (1 + sag / (R * 2))); if (d > R + 0.35) continue;
            let h = 0.98 - (d / R) * 0.42 + (-dx - ny) * 0.04; if (dx === -1 && Math.round(ny) === -Math.round(R * 0.5)) h = 1;
            g.fillStyle = heatHex(h); g.fillRect(cx + dx, top + dy, 1, 1);
        }
    }
    // a falling drop: a bead with a tail drawn out behind it, longer the faster it goes
    function drawDrop(cx, cy, R, vy) {
        const tail = Math.min(7, Math.max(0, Math.abs(vy) * 2.6)), up = vy >= 0 ? -1 : 1;
        for (let i = 1; i <= tail; i++) { const w = i < tail * 0.5 ? 1 : 0; g.fillStyle = heatHex(0.85 - i / tail * 0.45); g.fillRect(cx - w, cy + up * (Math.round(R) + i - 1), 1 + w * 2 > 1 && i < 3 ? 3 : 1, 1); }
        for (let dy = -Math.ceil(R); dy <= Math.ceil(R); dy++) for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) {
            const d = Math.hypot(dx, dy); if (d > R + 0.3) continue;
            let h = 1 - (d / R) * 0.4 + (-dx - dy) * 0.04; if (dx === -1 && dy === -1) h = 1;
            g.fillStyle = heatHex(h); g.fillRect(cx + dx, cy + dy, 1, 1);
        }
    }
    // the pipe down from the roof: a flange bolted to the roof, the pipe, a collar, its mouth hot (the hotter the bigger the glob)
    function drawOozePipe(oz) {
        const X = oz.x + 5, Y = oz.y, L = oz.len, warm = oz.t < oozeRelease(oz) ? oz.t / oozeRelease(oz) : 0.2;
        const K = "#0c0a0c", I = ["#1c1a1e", "#2c2a30", "#3e3c44", "#56545c", "#76747c"];
        g.fillStyle = K; g.fillRect(X - 3, Y, 12, 4); g.fillStyle = I[3]; g.fillRect(X - 2, Y, 10, 2); g.fillStyle = I[1]; g.fillRect(X - 2, Y + 2, 10, 1);
        g.fillStyle = "#9a98a0"; g.fillRect(X - 1, Y + 1, 1, 1); g.fillRect(X + 6, Y + 1, 1, 1);
        for (let y = Y + 4; y < Y + L; y++) {
            g.fillStyle = K; g.fillRect(X, y, 6, 1);
            const hot = y > Y + L - 4 ? (y - (Y + L - 4)) / 4 * warm : 0;
            const cols = [I[4], I[3], I[2], I[2], I[1]].map((c, i) => hot > 0.15 ? heatHex(Math.min(0.75, hot * 0.7 + 0.1 - i * 0.03)) : c);
            for (let i = 0; i < 4; i++) { g.fillStyle = gearHash(X + i, y) < 0.05 ? "#64482e" : cols[i]; g.fillRect(X + 1 + i, y, 1, 1); }
        }
        const cy = Y + L - 5; g.fillStyle = K; g.fillRect(X - 1, cy, 8, 3); g.fillStyle = I[3]; g.fillRect(X, cy + 1, 6, 1); g.fillStyle = "#86603a"; g.fillRect(X + 4, cy + 1, 1, 1);
        g.fillStyle = K; g.fillRect(X, Y + L, 6, 1); g.fillStyle = heatHex(0.2 + warm * 0.7); g.fillRect(X + 1, Y + L, 4, 1);
    }
    function oozeSplat(oz, d, intoLava, landY) {
        const n = 6;
        for (let i = 0; i < n; i++) state.parts.push({ kind: "spark", slime: TH.slime, x: d.x, y: landY - 1, vx: (Math.random() - 0.5) * 2.2, vy: -0.6 - Math.random() * 1.6, t: 0, life: 16 + Math.random() * 14 });
        for (let i = 0; i < 2; i++) state.parts.push({ kind: "smoke", x: d.x + (Math.random() - 0.5) * 6, y: landY - 3, vx: (Math.random() - 0.5) * 0.3, vy: -0.4, t: 0, life: 44 });
        if (intoLava) { const B = lavaBoxesOf(act).find(B => d.x >= B.tx * TS && d.x < B.tx * TS + B.w && landY >= B.ty * TS - 4 && landY < B.ty * TS + B.h); if (B) B.rings.push({ x: Math.round(d.x - B.tx * TS), t: 0 }); }
        else act.puddles.push({ x: Math.round(d.x), y: landY, t: 0, life: 110 });
        oz.drop = null;
        // (14 Oct 2026, the owner's: "a dropping goo sound that only plays when theyre on screen"; it was the steam hiss, heard from off screen)
        if (onScreen(d.x, landY)) sfx(TH.slime ? "goo" : "sizzle", intoLava);
    }
    /* THE ARCADE'S TOYS (14 Oct 2026, for the owner's "abandoned 90s neon jungle arcade"). A pinball
       bumper: touch it and it throws Scout off, away from its middle (up and over, if he comes down on
       it), lit up and ringing. A spring pad on a floor: step on it and it flings him high. */
    const BUMPER_COLS = [["#ff3ea8", "#ffb2dc", "#6a1648"], ["#3effe8", "#c4fffa", "#12504e"], ["#ffe23e", "#fff4b8", "#5e5010"], ["#b6ff3e", "#e4ffb0", "#3e5a12"], ["#a46bff", "#dcc8ff", "#36246a"]];
    function stepToys() {
        const h = hero, play = state.mode === "play";
        for (const b of act.bumpers) {
            if (b.cd > 0) b.cd--;
            b.k = Math.max(0, b.k - 0.05);
            if (!play || b.cd > 0) continue;
            const cx = Math.max(h.x, Math.min(b.x, h.x + h.w)), cy = Math.max(h.y, Math.min(b.y, h.y + h.h)), d = Math.hypot(cx - b.x, cy - b.y);
            if (d > b.r) continue;
            let nx = h.x + h.w / 2 - b.x, ny = h.y + h.h / 2 - b.y; const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
            if (ny < -0.45) { h.vy = -b.power * 1.12; h.vx = nx * b.power * 0.5; }      // come down on it: up and over
            else { if (Math.abs(nx) < 0.3) nx = nx < 0 ? -0.3 : 0.3; h.vx = Math.sign(nx) * b.power * 0.85; h.vy = -2.6; ny = 0; } // from the side or below: off sideways, and a little up (never pushed down, into a floor)
            // out of it, as far as there is room
            const push = Math.max(0, b.r - d + 1), px = h.x + nx * push, py = h.y + ny * push;
            if (!overlapsSolid(h, px, py, h.w, h.h)) { h.x = px; h.y = py; }
            h.ground = false; h.coyote = 0; h.climb = null; h.wallLock = 12; h.leap = Math.max(10, Math.round(-h.vy / GRAVITY * 0.8)); if (h.vx) h.face = Math.sign(h.vx);
            b.cd = 10; b.k = 1; b.rings.push(0); state.score += 10; state.shake = Math.max(state.shake || 0, 2);
            sfx("bumper");
        }
        for (const s of act.springs) {
            s.sq = Math.max(0, s.sq - 0.06);
            if (!play) continue;
            const mid = h.x + h.w / 2, feet = h.y + h.h;
            if (mid > s.x + 1 && mid < s.x + 15 && h.vy >= 0 && feet >= s.y + 16 - 3 && feet <= s.y + 16 + 2 && (h.ground || h.vy > 0)) {
                h.vy = -s.power; h.ground = false; h.coyote = 0; h.leap = Math.round(s.power / GRAVITY * 0.8); h.climb = null;
                s.sq = 1; sfx("spring");
            }
        }
        for (const b of act.bumpers) { for (let i = 0; i < b.rings.length; i++) b.rings[i] += 1; if (b.rings.length && b.rings[0] > 18) b.rings.shift(); }
    }
    /* A BUMPER'S PICTURE (14 Oct 2026, redrawn after the owner's "make the pin ball balls appear more
       round, the quality on those is a bit rubbish"): worked out per pixel from a true circle about a
       pixel's middle, so it is round from every side; a chrome ring lit from the top left; a dark
       groove; the cap shaded as a ball (a light from the top left, the colour's own five shades laid
       on with a dither, a white shine). Lit: the cap a shade or two brighter and a white heart. Made
       once for each colour and size, lit and unlit, and never scaled when drawn. */
    const bumperArt = new Map();
    const mixHex = (a, b, t) => { const A = hexRGB(a), B = hexRGB(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
    function bumperImage(ci, lit, r) {
        const key = ci + "|" + lit + "|" + r; let c = bumperArt.get(key); if (c) return c;
        const [col, light] = BUMPER_COLS[ci % BUMPER_COLS.length], S = r * 2 + 1;
        const CAP = [mixHex(col, "#000000", 0.62), mixHex(col, "#000000", 0.35), col, mixHex(col, light, 0.55), light, mixHex(light, "#ffffff", 0.6), "#ffffff"];
        const CHROME = ["#2e2e3c", "#55556a", "#8a8aa0", "#c4c4d6", "#f0f0fa"];
        c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d");
        const L = [-0.5, -0.62, 0.6], Ln = Math.hypot(...L);
        for (let y = 0; y < S; y++) for (let X = 0; X < S; X++) {
            const dx = X - r, dy = y - r, d = Math.hypot(dx, dy), dith = BAYER[(y & 3) * 4 + (X & 3)];
            if (d > r + 0.4) continue;
            let f;
            if (d > r - 0.6) f = "#07040c";
            else if (d > r - 2.6) { const lk = (-dx - dy) / (Math.max(0.5, d) * 1.414); f = CHROME[Math.max(0, Math.min(4, Math.round(2 + lk * 2.1 + dith)))]; }
            else if (d > r - 3.4) f = "#160c22";
            else {
                const rc = r - 3.4, nx = dx / rc, ny = dy / rc, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
                const sh = (nx * L[0] + ny * L[1] + nz * L[2]) / Ln;   // -1 .. 1
                let i = Math.round(1.2 + sh * 3.2 + dith * 0.9 + (lit ? 1.4 : 0));
                if (sh > 0.94) i = 6;
                f = CAP[Math.max(0, Math.min(lit ? 6 : 5, i))];
                if (lit && d < rc * 0.32) f = "#ffffff";
            }
            x.fillStyle = f; x.fillRect(X, y, 1, 1);
        }
        bumperArt.set(key, c); return c;
    }
    /* A SPRING PAD (redrawn after "they don't look like springs"): a riveted base, a real coil (a wire
       wound round, the near side of each turn lit and the far side in shadow, so it reads as a helix),
       a rubber-capped plate on top. Squashes as Scout lands, then stretches as it throws him. */
    function drawSpring(s) {
        const X = s.x, base = s.y + 16, q = s.sq, ext = q > 0.82 ? -3 : q > 0 ? Math.round(7 * Math.sin((1 - q) * Math.PI) * q * 1.6) : 0;
        const ch = Math.max(5, 9 + ext), cx = X + 8;
        // the base: a steel box, bevelled, two rivets
        g.fillStyle = "#07040c"; g.fillRect(X, base - 5, 16, 5);
        g.fillStyle = "#8a8aa0"; g.fillRect(X + 1, base - 4, 14, 1); g.fillStyle = "#55556a"; g.fillRect(X + 1, base - 3, 14, 2); g.fillStyle = "#2e2e3c"; g.fillRect(X + 1, base - 1, 14, 1);
        g.fillStyle = "#e4e4f0"; g.fillRect(X + 2, base - 3, 1, 1); g.fillRect(X + 13, base - 3, 1, 1);
        // the coil: the far side of the turns first, then the near
        // the wire: steep turns, so each one slopes plainly across (far side down to the left, near side up to the right)
        const top = base - 5 - ch, turns = 1.75;
        for (const near of [false, true]) for (let i = 0; i <= ch * 10; i++) {
            const k = i / (ch * 10), ph = k * turns * Math.PI * 2, sx = Math.cos(ph) * 5.5, front = Math.sin(ph) > 0;
            if (front !== near) continue;
            const px = Math.round(cx - 0.5 + sx), py = Math.round(base - 6 - k * (ch - 1));
            if (near) { g.fillStyle = "#07040c"; g.fillRect(px, py + 1, 2, 1); }
            g.fillStyle = near ? (Math.cos(ph) < -0.4 ? "#ffffff" : Math.cos(ph) > 0.5 ? "#8a8aa0" : "#cfcfe0") : "#45455a";
            g.fillRect(px, py, near ? 2 : 1, 1);
        }
        // the plate: a rubber cap on a steel plate, rounded at its ends
        const py = top - 4;
        g.fillStyle = "#07040c"; g.fillRect(X + 1, py, 14, 5); g.fillRect(X, py + 1, 16, 3);
        g.fillStyle = "#ff3e6a"; g.fillRect(X + 1, py + 1, 14, 2); g.fillStyle = "#ffb0c4"; g.fillRect(X + 2, py + 1, 11, 1); g.fillStyle = "#ffffff"; g.fillRect(X + 3, py + 1, 3, 1);
        g.fillStyle = "#9a1a3a"; g.fillRect(X + 1, py + 2, 14, 1);
        g.fillStyle = "#8a8aa0"; g.fillRect(X + 1, py + 3, 14, 1);
        if (q > 0.2) { g.save(); g.globalCompositeOperation = "lighter"; const gr = g.createRadialGradient(cx, py, 1, cx, py, 20); gr.addColorStop(0, "rgba(255,90,140," + (0.35 * q).toFixed(3) + ")"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(cx - 20, py - 20, 40, 40); g.restore(); }
    }
    function drawToys(cam) {
        for (const b of act.bumpers) {
            if (b.x < cam.x - 40 || b.x > cam.x + VW + 40 || b.y < cam.y - 40 || b.y > cam.y + VH + 40) continue;
            const lit = b.k > 0.3 || (Math.floor(frameNo / 30) + b.ci) % 7 === 0, img = bumperImage(b.ci, lit, b.r);
            g.save(); g.globalCompositeOperation = "lighter";
            const [r0, g0, b0] = hexRGB(BUMPER_COLS[b.ci % BUMPER_COLS.length][0]), gr = g.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.r * 2.6);
            gr.addColorStop(0, "rgba(" + r0 + "," + g0 + "," + b0 + "," + (0.16 + b.k * 0.35).toFixed(3) + ")"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(b.x - b.r * 3, b.y - b.r * 3, b.r * 6, b.r * 6);
            g.restore();
            g.drawImage(img, Math.round(b.x) - b.r, Math.round(b.y) - b.r);
            for (const t of b.rings) { g.strokeStyle = "rgba(255,255,255," + (0.6 * (1 - t / 18)).toFixed(3) + ")"; g.lineWidth = 1; g.beginPath(); g.arc(b.x + 0.5, b.y + 0.5, b.r + 2 + t * 0.9, 0, Math.PI * 2); g.stroke(); }
        }
        for (const s of act.springs) {
            if (s.x < cam.x - 30 || s.x > cam.x + VW + 30 || s.y < cam.y - 30 || s.y > cam.y + VH + 30) continue;
            drawSpring(s);
        }
    }

    /* THE ARCADE'S FURNISHINGS (14 Oct 2026, the owner's: "the background image needs to be cleared
       and all the current elements should be placeable by me, make the arcade machines into actual
       placeable items, and the same for the vines ... neon shapes placeable items too"). Three kinds of
       object, each with a place of its own on the map, behind Scout or in front:
         machine  an upright cabinet, a pinball table, a claw machine or a television, switched on or
                  dead; its screen plays (space, maze, bat-and-ball, a racer, or static) and glows.
         vine     a vine hanging from where it is put, swaying, leaves and (if asked) glowing flowers.
         neon     a sign in neon tube: a bolt, a star, a heart, an arrow, a palm, a ring, a wave,
                  cherries, a ghost, a joystick, a planet, a note, or words; on, buzzing, or dead. */
    const MACH_SIZE = { cab: [24, 44], pinball: [34, 30], claw: [24, 46], tv: [18, 17] };
    const NEON_BOX = { bolt: [20, 34], star: [32, 32], heart: [30, 28], arrow: [40, 20], palm: [32, 40], ring: [30, 30], wave: [44, 16], cherries: [28, 30], ghost: [26, 30], joystick: [24, 34], planet: [40, 28], note: [22, 32] };
    function neonSize(o) {
        const s = Math.max(1, Math.min(4, o.scale || 1));
        if ((o.kind || "star") === "text") { const t = String(o.text || "OPEN").slice(0, 24); return { w: RatFont.width(t.toUpperCase(), 2 * s) + 16, h: 14 * s + 16, s }; }
        const [w, h] = NEON_BOX[o.kind] || NEON_BOX.star; return { w: w * s + 16, h: h * s + 16, s };
    }
    function decoBox(o) {
        if (o.type === "machine") { const [w, h] = MACH_SIZE[o.kind] || MACH_SIZE.cab; return { x: o.x, y: o.y, w, h }; }
        if (o.type === "vine") return { x: o.x, y: o.y, w: 14, h: Math.max(8, o.h || 48) };
        if (o.type === "neon") { const n = neonSize(o); return { x: o.x, y: o.y, w: n.w, h: n.h }; }
        if (o.type === "wreck") return wreckBox(o);
        if (o.type === "waterfall") return waterfallBox(o);
        return { x: o.x, y: o.y, w: 16, h: 16 };
    }
    const okCol = (c, d) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : d);
    // ---- the machines' bodies, made once for each look
    const machArt = new Map();
    function machineArt(o) {
        const kind = MACH_SIZE[o.kind] ? o.kind : "cab", on = o.on !== false, mq = okCol(o.marquee, "#ff3ea8"), bodyC = okCol(o.body, "#2a1c46");
        const key = [kind, on, mq, bodyC, o.flip ? 1 : 0, o.seed || 0].join("|"); let c = machArt.get(key); if (c) return c;
        const [W, H] = MACH_SIZE[kind];
        c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
        const F = (X, Y, w, h, col) => { x.fillStyle = col; x.fillRect(X, Y, w, h); }, P = (X, Y, col) => F(X, Y, 1, 1, col);
        const K = "#07040c", B = [mixHex(bodyC, "#000000", 0.55), mixHex(bodyC, "#000000", 0.28), bodyC, mixHex(bodyC, "#ffffff", 0.14), mixHex(bodyC, "#ffffff", 0.3)];
        const M = [mixHex(mq, "#000000", 0.7), mixHex(mq, "#000000", 0.35), mq, mixHex(mq, "#ffffff", 0.45), mixHex(mq, "#ffffff", 0.8)];
        const MQ = on ? M : [mixHex(mq, "#000000", 0.85), mixHex(mq, "#000000", 0.78), mixHex(mq, "#000000", 0.7), mixHex(mq, "#000000", 0.62), mixHex(mq, "#000000", 0.55)];
        const CH = ["#2e2e3c", "#55556a", "#8a8aa0", "#c4c4d6", "#f0f0fa"];
        if (kind === "cab") {
            F(0, 0, W, H, K);
            F(1, 1, 22, 1, B[4]);
            // the marquee, its logo three blocks and a star
            F(2, 2, 20, 6, MQ[2]); F(2, 2, 20, 1, MQ[3]); F(2, 7, 20, 1, MQ[1]);
            for (const lx of [5, 10, 15]) { F(lx, 4, 3, 2, MQ[4]); P(lx + 1, 5, MQ[1]); }
            P(20, 3, MQ[4]); P(3, 6, MQ[4]);
            F(1, 8, 22, 1, K);
            // the bezel, bevelled; the screen's glass set in it with rounded corners
            F(1, 9, 22, 17, B[1]); F(1, 9, 1, 17, B[3]); F(22, 9, 1, 17, B[0]); F(1, 9, 22, 1, B[2]);
            F(3, 10, 18, 15, K); F(4, 11, 16, 13, "#04060a");
            for (const [cx, cy] of [[4, 11], [19, 11], [4, 23], [19, 23]]) P(cx, cy, K);
            // the speaker grille
            F(1, 26, 22, 2, B[0]); for (let gx = 5; gx < 19; gx += 2) { P(gx, 26, K); P(gx + 1, 27, K); }
            // the control panel, jutting out: the stick and three buttons
            F(0, 28, 24, 4, K); F(1, 29, 22, 1, B[4]); F(1, 30, 22, 1, B[3]); F(1, 31, 22, 1, B[1]);
            F(6, 26, 1, 3, CH[3]); F(5, 24, 3, 2, "#e8303e"); P(5, 24, "#ff9aa4"); P(7, 25, "#8a1a24");
            for (const [bx, bc] of [[12, "#ffe23e"], [15, "#3effe8"], [18, "#ff3ea8"]]) { F(bx, 29, 2, 1, bc); P(bx, 29, mixHex(bc, "#ffffff", 0.6)); F(bx, 30, 2, 1, mixHex(bc, "#000000", 0.5)); }
            // the cabinet below: a stripe of side art, the coin door, its slots, the kick plate
            F(1, 32, 22, 11, B[2]); F(1, 32, 1, 11, B[3]); F(22, 32, 1, 11, B[0]);
            for (let y = 32; y < 42; y++) { const zx = 2 + ((y >> 1) % 2); P(zx, y, M[on ? 2 : 0]); }
            F(8, 34, 8, 7, K); F(9, 35, 6, 5, CH[1]); F(9, 35, 6, 1, CH[2]);
            F(10, 36, 1, 2, on ? "#ff8a2e" : "#3a2216"); F(13, 36, 1, 2, on ? "#ff8a2e" : "#3a2216"); P(11, 39, CH[3]); P(12, 39, CH[3]);
            F(1, 42, 22, 1, B[0]); F(1, 43, 3, 1, K); F(20, 43, 3, 1, K);
        } else if (kind === "pinball") {
            // the backbox: its art lit, a score panel under it
            F(23, 0, 11, 15, K); F(24, 1, 9, 9, MQ[2]); F(24, 1, 9, 1, MQ[3]);
            for (let i = 0; i < 9; i++) P(24 + i, 1 + Math.round(4 + Math.sin(i / 1.4) * 3), MQ[4]);
            P(28, 4, "#ffffff"); P(27, 4, MQ[4]); P(29, 4, MQ[4]); P(28, 3, MQ[4]); P(28, 5, MQ[4]);
            F(24, 11, 9, 2, "#120808"); F(24, 13, 9, 1, B[1]);
            // the table: the rail, the glass over the playfield, the cabinet's side with its art, the lockdown bar, the plunger
            F(0, 15, 34, 7, K); F(1, 15, 32, 1, CH[3]); F(1, 16, 32, 1, "#2a5a7a"); F(1, 17, 32, 4, B[2]); F(1, 17, 32, 1, B[3]); F(1, 20, 32, 1, B[0]);
            for (let i = 3; i < 31; i += 6) { P(i, 18, M[on ? 3 : 1]); P(i + 1, 19, M[on ? 2 : 0]); P(i + 2, 18, M[on ? 3 : 1]); }
            F(0, 15, 2, 7, CH[2]); P(0, 15, CH[4]); F(0, 18, 1, 2, "#e8303e");
            // the legs, chrome, and their levellers
            for (const lx of [3, 28]) { F(lx, 22, 3, 7, K); F(lx + 1, 22, 1, 7, CH[3]); P(lx + 1, 22, CH[4]); F(lx - 1, 28, 5, 2, K); F(lx, 28, 3, 1, CH[1]); }
        } else if (kind === "claw") {
            F(0, 0, W, H, K);
            F(1, 1, 22, 6, MQ[2]); F(1, 1, 22, 1, MQ[3]); for (const lx of [4, 9, 14, 19]) { F(lx, 3, 2, 2, MQ[4]); }
            // the glass case: chrome posts, the dark inside, a reflection across the glass
            F(1, 7, 22, 22, CH[2]); F(2, 8, 20, 20, "#0a0e18"); F(1, 7, 1, 22, CH[3]); F(22, 7, 1, 22, CH[1]);
            F(2, 8, 20, 1, CH[1]);
            // the prizes heaped in the bottom of it, each a round plush
            const toys = ["#ff5a8a", "#ffe23e", "#3effe8", "#b6ff3e", "#a46bff", "#ff8a2e"];
            for (let i = 0; i < 14; i++) { const tx = 3 + ((i * 7 + (o.seed || 0) * 3) % 16), ty = 23 + (i % 3) * 2 - (i % 2); const tc = toys[(i + (o.seed || 0)) % toys.length]; F(tx, ty, 3, 3, mixHex(tc, "#000000", 0.35)); F(tx, ty, 2, 2, tc); P(tx, ty, mixHex(tc, "#ffffff", 0.6)); }
            P(3, 9, "#ffffff"); P(4, 10, "#9ab8d8"); P(5, 11, "#5a7898");
            // the lower cabinet: the panel, the stick, the prize door, the coin slot
            F(1, 29, 22, 2, B[4]); F(1, 31, 22, 14, B[2]); F(1, 31, 1, 14, B[3]); F(22, 31, 1, 14, B[0]);
            F(15, 27, 1, 3, CH[3]); F(14, 26, 3, 2, "#e8303e"); P(14, 26, "#ff9aa4");
            F(3, 33, 8, 8, K); F(4, 34, 6, 6, "#05050a"); F(4, 34, 6, 2, CH[1]);
            F(15, 34, 4, 2, K); P(16, 34, on ? "#ff8a2e" : "#3a2216"); P(17, 34, on ? "#ff8a2e" : "#3a2216");
            F(1, 44, 22, 1, B[0]);
        } else {
            // a television: two rabbit-ear aerials, the set, its rounded screen, the knobs and a grille
            for (let i = 0; i < 4; i++) { P(7 - i, 3 - i, CH[2]); P(10 + i, 3 - i, CH[2]); }
            F(8, 3, 2, 1, CH[1]);
            F(0, 4, 18, 13, K); F(1, 5, 16, 11, B[2]); F(1, 5, 16, 1, B[4]); F(1, 15, 16, 1, B[0]);
            F(2, 6, 11, 8, K); F(3, 7, 9, 6, "#04060a");
            F(14, 7, 2, 2, CH[3]); P(14, 7, CH[4]); F(14, 10, 2, 2, CH[2]); for (let y = 13; y < 15; y++) { P(14, y, K); P(15, y + 1, K); }
            F(2, 16, 3, 1, K); F(13, 16, 3, 1, K);
        }
        if (o.flip) { const m = document.createElement("canvas"); m.width = W; m.height = H; const mx = m.getContext("2d"); mx.translate(W, 0); mx.scale(-1, 1); mx.drawImage(c, 0, 0); c = m; }
        machArt.set(key, c); return c;
    }
    // where each machine's screen is (in its own picture), and how big
    const SCREEN = { cab: [4, 11, 16, 13], claw: null, pinball: [24, 11, 9, 2], tv: [3, 7, 9, 6] };
    // ---- a screen playing: one of five shows, in its own colour, scanlines over it
    function playScreen(X, Y, w, h, show, col, seed, t) {
        const C = hexRGB(col), dim = `rgb(${Math.round(C[0] * 0.18)},${Math.round(C[1] * 0.18)},${Math.round(C[2] * 0.22)})`;
        g.fillStyle = dim; g.fillRect(X, Y, w, h);
        const P = (px, py, c) => { if (px >= 0 && py >= 0 && px < w && py < h) { g.fillStyle = c; g.fillRect(X + px, Y + py, 1, 1); } };
        if (show === "static") { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = gearHash(x * 7 + t * 13, y * 11 + (t >> 1)); if (n < 0.5) P(x, y, n < 0.15 ? "#ffffff" : n < 0.3 ? "#a0a0b0" : "#50505c"); } }
        else if (show === "maze") {
            for (let y = 1; y < h; y += 3) for (let x = 1; x < w; x += 3) P(x, y, (x + y) % 2 ? col : mixHex(col, "#000000", 0.4));
            for (let y = 2; y < h; y += 6) for (let x = 0; x < w; x++) if (gearHash(x, y + seed) < 0.55) P(x, y, mixHex(col, "#ffffff", 0.2));
            const path = (t * 0.3) % (w * 2), cx = Math.round(path < w ? path : w * 2 - path), cy = 1 + 3 * Math.floor(h / 6), open = (t >> 3) % 2;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!(open && dx === (path < w ? 1 : -1) && dy === 0)) P(cx + dx, cy + dy, "#ffe23e");
            const gx = Math.round((t * 0.22 + w / 2) % w); P(gx, cy, "#ff5a8a"); P(gx + 1, cy, "#ff5a8a"); P(gx, cy - 1, "#ff5a8a"); P(gx + 1, cy - 1, "#ff5a8a");
        } else if (show === "pong") {
            for (let y = 0; y < h; y += 2) P(w >> 1, y, mixHex(col, "#000000", 0.3));
            const bx = (t * 0.5) % ((w - 3) * 2), by = (t * 0.37) % ((h - 1) * 2), X1 = Math.round(bx < w - 3 ? bx : (w - 3) * 2 - bx) + 1, Y1 = Math.round(by < h - 1 ? by : (h - 1) * 2 - by);
            P(X1, Y1, "#ffffff");
            for (const [px, k] of [[0, 0], [w - 1, 1]]) { const py = Math.max(0, Math.min(h - 4, Y1 - 2 + (k ? 1 : -1))); for (let i = 0; i < 4; i++) P(px, py + i, "#ffffff"); }
        } else if (show === "racer") {
            for (let y = Math.floor(h / 3); y < h; y++) { const k = (y - h / 3) / (h * 2 / 3), half = 1 + k * w * 0.42, cx = w / 2 + Math.sin(t / 40) * 2 * k; for (let x = 0; x < w; x++) { const inRoad = Math.abs(x - cx) < half; if (inRoad) P(x, y, ((Math.floor((y * 3 - t * 0.6) / 4)) % 2) && Math.abs(x - cx) < 0.6 ? "#ffffff" : "#3a3a4a"); else P(x, y, ((y + (t >> 2)) % 4) < 2 ? "#1e5a28" : "#2a7a34"); } }
            for (let y = 0; y < Math.floor(h / 3); y++) for (let x = 0; x < w; x++) P(x, y, mixHex(col, "#ffffff", y / h));
            const carX = Math.round(w / 2 - 2 + Math.sin(t / 25) * 2); for (let i = 0; i < 4; i++) { P(carX + i, h - 3, "#e8303e"); P(carX + i, h - 2, i === 0 || i === 3 ? "#07040c" : "#ff7a84"); }
        } else {
            // space: stars falling, a row of invaders marching, a ship along the bottom
            for (let i = 0; i < 9; i++) { const sx = Math.floor(gearHash(i, seed) * w), sy = Math.floor((gearHash(i, seed + 3) * h + t * (0.2 + (i % 3) * 0.12)) % h); P(sx, sy, i % 3 ? "#8a8aa0" : "#ffffff"); }
            const march = Math.round(Math.sin(t / 30) * 2), frame2 = (t >> 4) % 2;
            for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) { const ix = 1 + i * 4 + march, iy = 1 + r * 3; P(ix, iy, col); P(ix + 1, iy, col); P(ix + 2, iy, col); P(ix + (frame2 ? 0 : 2), iy + 1, col); }
            const shx = Math.round(w / 2 + Math.sin(t / 22) * (w / 2 - 3)); P(shx, h - 3, "#ffffff"); P(shx - 1, h - 2, "#3effe8"); P(shx, h - 2, "#ffffff"); P(shx + 1, h - 2, "#3effe8");
            if ((t >> 3) % 3 === 0) { const by = h - 4 - ((t % 24) >> 1); P(shx, by, "#ffe23e"); }
        }
        // scanlines and the glass's shine
        g.fillStyle = "rgba(0,0,0,0.28)"; for (let y = 1; y < h; y += 2) g.fillRect(X, Y + y, w, 1);
        g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(X, Y, 2, 1); g.fillRect(X, Y + 1, 1, 1);
    }
    const SHOWS = ["space", "maze", "pong", "racer"];
    function drawMachine(o) {
        const kind = MACH_SIZE[o.kind] ? o.kind : "cab", on = o.on !== false, img = machineArt(o), seed = o.seed || ((o.x * 7 + o.y * 3) % 97);
        g.drawImage(img, Math.round(o.x), Math.round(o.y));
        const t = frameNo + seed * 17, buzz = on && (o.flicker || 0) > 0 && gearHash(seed, Math.floor(t / 6)) < (o.flicker || 0) * 0.3;
        const scr = okCol(o.screen, "#3effe8"), [W, H] = MACH_SIZE[kind];
        let S = SCREEN[kind]; if (S && o.flip) S = [W - S[0] - S[2], S[1], S[2], S[3]];
        if (S) {
            if (on && !buzz) {
                if (kind === "pinball") { g.fillStyle = "#120808"; g.fillRect(o.x + S[0], o.y + S[1], S[2], S[3]); for (let i = 0; i < S[2]; i += 2) if (gearHash(i, Math.floor(t / 20)) < 0.7) { g.fillStyle = "#ff8a2e"; g.fillRect(o.x + S[0] + i, o.y + S[1], 1, 2); } }
                else playScreen(o.x + S[0], o.y + S[1], S[2], S[3], kind === "tv" && !o.show ? "static" : (o.show || SHOWS[seed % SHOWS.length]), scr, seed, t);
            } else if (!on) { g.fillStyle = "#04060a"; g.fillRect(o.x + S[0], o.y + S[1], S[2], S[3]); g.fillStyle = "rgba(160,170,200,0.25)"; g.fillRect(o.x + S[0] + 1, o.y + S[1] + 1, 2, 1); g.fillRect(o.x + S[0] + S[2] - 4, o.y + S[1] + Math.floor(S[3] / 2), 3, 1); }
        }
        // the claw machine's claw: along its rail and down to the prizes, now and then
        if (kind === "claw") {
            const cx = Math.round(o.x + 12 + Math.sin(t / 70) * 7), drop = on ? Math.max(0, Math.sin(t / 45) * 9) : 0, cy = o.y + 9 + Math.round(drop);
            g.fillStyle = "#8a8aa0"; g.fillRect(o.x + 2, o.y + 8, 20, 1); g.fillStyle = "#c4c4d6"; g.fillRect(cx, o.y + 9, 1, cy - o.y - 9 + 1);
            g.fillStyle = "#f0f0fa"; g.fillRect(cx - 1, cy + 1, 3, 1); g.fillStyle = "#8a8aa0"; g.fillRect(cx - 2, cy + 2, 1, 2); g.fillRect(cx + 2, cy + 2, 1, 2); g.fillRect(cx - 1, cy + 4, 1, 1); g.fillRect(cx + 1, cy + 4, 1, 1);
            if (on) { g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = "rgba(160,200,255,0.06)"; g.fillRect(o.x + 2, o.y + 8, 20, 20); g.restore(); }
        }
        // its light on the walls about it
        if (on && !buzz && o.glow !== false) {
            g.save(); g.globalCompositeOperation = "lighter";
            const [sr, sg, sb] = hexRGB(scr), [mr, mg, mb] = hexRGB(okCol(o.marquee, "#ff3ea8"));
            if (S && kind !== "pinball") { const cx = o.x + S[0] + S[2] / 2, cy = o.y + S[1] + S[3] / 2, gr = g.createRadialGradient(cx, cy, 2, cx, cy, 34); gr.addColorStop(0, `rgba(${sr},${sg},${sb},0.2)`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(cx - 34, cy - 34, 68, 68); }
            if (kind !== "tv") { const mxc = kind === "pinball" ? o.x + (o.flip ? 5 : 28) : o.x + W / 2, myc = o.y + 4, gr = g.createRadialGradient(mxc, myc, 2, mxc, myc, 26); gr.addColorStop(0, `rgba(${mr},${mg},${mb},0.22)`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(mxc - 26, myc - 26, 52, 52); }
            g.restore();
        }
    }
    // ---- a vine hanging, swaying a little, leaves (and flowers, glowing) along it
    const VLEAF = ["#0a2410", "#123c1a", "#1e6428", "#2e8a36", "#52b444", "#94dc5c"];
    /* A WATERFALL (21 Oct 2026, the owner's: "some sort of waterfall type scenery item, to help give some of the
       water context for as to how/why it's there ... including for the mirky green water"; then "I need to ability
       to make waterfalls etc longer/wider. I don't really get what the spout waterfall is supposed to be
       representing. Add in some slow drips and things like that too"): only to look at, falling from where it is
       put (its top) for its length (h) to the pool it feeds.
         spout     an old iron drain pipe out of the rock face (put it at the face), gushing in an arc and falling;
                   thick its stream's thickness
         curtain   a sheet over the lip of a ledge, w wide
         flume     an old wooden trough out of the rock on a post, spilling off its end; thick its stream's thickness
         seep      thin runs down the rock face, a wet streak, drops falling into the pool; w wide
         drips     slow drops along a roof, w wide: each forms under a little stalactite, swells, lets go and falls,
                   and lands with a fleck or two and a ring
         trickle   a thin stream from the roof that keeps breaking into drops
       In clear water or the murky green (water: "murk"), the murky slower and duller. Mirrored, it faces left. */
    const FALL_PAL = {
        clear: { dark: "#1c5a80", mid: "#3f8fbf", light: "#86c8ea", foam: "#e6f6ff", white: "#ffffff", mist: "220,240,255", out: "#0d2c40", speed: 3 },
        murk: { dark: "#26321a", mid: "#45552a", light: "#6f7a34", foam: "#a9b264", white: "#cfd49c", mist: "160,172,100", out: "#141a0c", speed: 1.6 }
    };
    const FALL_W = { curtain: [4, 256, 12], seep: [4, 128, 10], drips: [4, 256, 16], spout: [2, 10, 4], flume: [3, 12, 5], trickle: [1, 1, 1] };
    const fallKind = o => (FALL_W[o.kind] ? o.kind : "curtain");
    // (a spout's and a flume's stream: its thickness, thick; the others' width, w)
    const fallW = o => { const k = fallKind(o), [lo, hi, def] = FALL_W[k], v = k === "spout" || k === "flume" ? o.thick : o.w; return Math.max(lo, Math.min(hi, Math.round(v > 0 ? v : def))); };
    function waterfallBox(o) {
        const k = fallKind(o), w = fallW(o), bw = k === "spout" ? 22 + w * 2 : k === "flume" ? 24 + w : k === "trickle" ? 8 : w;
        return { x: Math.round(o.x), y: Math.round(o.y), w: bw, h: Math.max(16, Math.min(1600, Math.round(o.h || 96))) };
    }
    function drawWaterfall(o) {
        const P = FALL_PAL[o.water === "murk" ? "murk" : "clear"], B = waterfallBox(o), k = fallKind(o), W = fallW(o);
        const seed = (B.x * 7 + B.y * 3) % 97, t = frameNo + seed, sp = P.speed, bot = B.y + B.h, slow = o.water === "murk" ? 1.4 : 1;
        const hh = (x, y, s) => hashTile(x * 3 + (s || 0) * 17, y * 5 + (s || 0) * 29);
        const px = (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
        g.save();
        if (o.flip) { g.translate(B.x * 2 + B.w, 0); g.scale(-1, 1); }   // (mirrored: about the box's middle)
        // falling water: a column, streaks running down it
        const fall = (x0, y0, y1, w, alpha) => {
            g.globalAlpha = alpha;
            for (let i = 0; i < w; i++) {
                const X = x0 + i, edge = w > 2 && (i === 0 || i === w - 1), off = Math.floor(hh(X, 1) * 40);
                for (let Y = y0; Y < y1; Y++) {
                    const ph = ((Math.floor(Y - t * sp) + off) % 13 + 13) % 13;
                    let c = edge ? P.dark : ph < 3 ? P.light : ph < 4 ? P.foam : P.mid;
                    if (!edge && hh(X, Math.floor(Y - t * sp), 7) < 0.03) c = P.white;
                    px(X, Y, c);
                }
            }
            g.globalAlpha = 1;
        };
        // where it meets the pool: foam churning, droplets thrown up and falling back, a mist
        const splash = (cx, ys, w) => {
            const R = w + 8, gr = g.createRadialGradient(cx, ys - 2, 1, cx, ys - 2, R);
            gr.addColorStop(0, `rgba(${P.mist},${(0.26 + Math.sin(t / 9) * 0.05).toFixed(3)})`); gr.addColorStop(1, `rgba(${P.mist},0)`);
            g.fillStyle = gr; g.fillRect(cx - R - 2, ys - R - 4, (R + 2) * 2, R + 8);
            const half = w / 2 + 5;
            for (let i = -half; i < half; i++) {
                const X = Math.round(cx + i), d = Math.abs(i) / half, hgt = Math.round((1 - d) * 3 + hh(X, Math.floor(t / 4), 3) * 1.6);
                for (let q = 0; q < hgt; q++) px(X, ys - q, q === hgt - 1 ? P.white : P.foam);
                px(X, ys + 1, P.light);
            }
            const n = Math.min(24, 6 + Math.round(w / 2));
            for (let m = 0; m < n; m++) {
                const a = (hh(m, 1, 4) - 0.5) * 2.4, s = (((t * sp / 1.5 + m * 7) % 16) + 16) % 16 / 16;
                px(cx + Math.sin(a) * s * (w + 10), ys - 3 - Math.cos(a) * 14 * s + 18 * s * s, m % 2 ? P.white : P.foam);
            }
        };
        // a drop landing: a fleck or two thrown up, a ring spreading on the water
        const plink = (cx, ys, f) => {   // f: frames since it landed
            if (f < 0 || f > 24) return;
            if (f < 8) { px(cx - 1 - f * 0.4, ys - 2 - f * 0.6 + f * f * 0.09, P.white); px(cx + 1 + f * 0.4, ys - 1 - f * 0.5 + f * f * 0.08, P.foam); }
            const r = Math.min(5, 1 + Math.floor(f / 4)); for (let i = -r; i <= r; i++) if (Math.abs(i) >= r - 1) px(cx + i, ys, f < 14 ? P.foam : P.light);
        };
        if (k === "curtain") {
            const x0 = B.x, w = W;
            for (let i = -1; i <= w; i++) { px(x0 + i, B.y - 1, P.foam); px(x0 + i, B.y, i < 0 || i === w ? P.dark : P.light); }
            for (let i = 0; i < 4; i++) px(x0 - 3 + i, B.y - 1, P.light);
            fall(x0, B.y + 1, bot, w, 0.85);
            splash(x0 + w / 2, bot, w);
        } else if (k === "spout") {
            // the pipe: rusty iron out of the rock face, a flange where it meets it, its mouth dark
            // (a round iron pipe: lit along its top, falling into shadow underneath, a flange where it leaves the rock,
            // patches of rust, and its open mouth a dark ring)
            const fx = B.x, pr = Math.max(3, Math.ceil(W / 2) + 1), cy = B.y + pr + 2, L = 10;
            const IRON = ["#0c0b0e", "#2a2830", "#46444e", "#66646e", "#8e8c96", "#b4b2ba"], RUST = ["#6a3418", "#8a4a26", "#a8622f"];
            const shade = j => { const v = j / pr; return v < -0.8 ? IRON[4] : v < -0.45 ? IRON[5] : v < -0.1 ? IRON[4] : v < 0.3 ? IRON[3] : v < 0.7 ? IRON[2] : IRON[1]; };
            for (let i = 0; i < L; i++) for (let j = -pr; j <= pr; j++) {
                let c = Math.abs(j) === pr ? IRON[0] : shade(j);
                if (Math.abs(j) < pr && hh(fx + i, cy + j, 6) < 0.13) c = RUST[Math.floor(hh(i, j, 8) * 3)];
                px(fx + i, cy + j, c);
            }
            for (let j = -pr - 2; j <= pr + 2; j++) { const edge = Math.abs(j) >= pr + 2; px(fx, cy + j, IRON[0]); px(fx + 1, cy + j, edge ? IRON[0] : shade(j * pr / (pr + 2))); px(fx + 2, cy + j, edge || Math.abs(j) > pr ? IRON[0] : IRON[1]); }
            for (let j = -pr; j <= pr; j++) { const v = Math.abs(j); px(fx + L, cy + j, v === pr ? IRON[0] : v === pr - 1 ? (j < 0 ? IRON[5] : IRON[2]) : "#050406"); }
            // the water out of its mouth: an arc, every column of it, then straight down
            const vx = 1.1 + W * 0.08, mx = fx + L + 1, top = cy - Math.floor(W / 2);
            g.globalAlpha = 0.95;
            let ex = mx, ey = top;
            for (let dx = 0; dx < 60; dx++) {
                const s = dx / vx, drop = s * s * 0.045, x = mx + dx, y = top + drop;
                const ph = ((Math.floor(dx - t * sp / 1.5)) % 6 + 6) % 6;
                for (let q = 0; q < W; q++) px(x, y + q, q === 0 ? (ph === 0 ? P.foam : P.light) : q === W - 1 ? P.dark : ph === 3 && q === 1 ? P.light : P.mid);
                ex = x; ey = y;
                if (drop > 14) break;
            }
            g.globalAlpha = 1;
            // a little spray at the mouth
            for (let m = 0; m < 3; m++) { const f = ((t * 2 + m * 5) % 10); px(mx + f * 0.8, top - 1 - f * 0.3 + (m - 1), P.foam); }
            fall(Math.round(ex - W / 2), Math.round(ey), bot, W, 0.92);
            splash(ex, bot, W);
        } else if (k === "flume") {
            const x0 = B.x, y0 = B.y, L = 22;
            for (let i = 0; i < L; i++) {
                const ripple = ((i - Math.floor(t * sp / 2)) % 6 + 6) % 6 === 0;
                px(x0 + i, y0, "#1a110a"); px(x0 + i, y0 + 1, ripple ? P.foam : P.light); px(x0 + i, y0 + 2, P.mid);
                px(x0 + i, y0 + 3, i % 7 === 0 ? "#3a2614" : "#8a643a"); px(x0 + i, y0 + 4, "#6a4a2c"); px(x0 + i, y0 + 5, "#5a3e24"); px(x0 + i, y0 + 6, "#1a110a");
            }
            for (let j = 0; j < 7; j++) { px(x0 + L, y0 + j, "#1a110a"); px(x0 + L - 1, y0 + j, j < 2 ? "#8a643a" : "#5a3e24"); }
            for (let j = y0 + 7; j < Math.min(bot, y0 + 22); j++) { px(x0 + 10, j, "#1a110a"); px(x0 + 11, j, "#6a4a2c"); px(x0 + 12, j, "#1a110a"); }
            fall(x0 + L + 1, y0 + 1, bot, W, 0.92);
            for (let i = 0; i < W; i++) px(x0 + L + 1 + i, y0, P.foam);
            splash(x0 + L + 1 + W / 2, bot, W);
        } else if (k === "seep") {
            // a wet streak, thin runs down it, drops falling, rings where they land
            const x0 = B.x, w = W;
            g.globalAlpha = 0.5; g.fillStyle = P.dark; g.fillRect(x0, B.y, w, B.h); g.globalAlpha = 1;
            const runs = Math.max(1, Math.round(w / 4));
            for (let r = 0; r < runs; r++) {
                const sx = x0 + 1 + Math.floor((r + 0.5) * w / runs) - 1, wob = 0.4 + hh(r, B.x, 9) * 0.8;
                for (let y = B.y; y < bot - 3; y++) { const x = sx + Math.round(Math.sin(y / (9 + wob * 5) + r) * wob), ph = ((Math.floor(y - t * sp * 0.7) + r * 7) % 11 + 11) % 11; px(x, y, ph < 2 ? P.foam : P.light); }
                const yy = bot - 4 + (((Math.floor(t * sp * 0.6) + r * 5) % 8) + 8) % 8 / 2; px(sx, yy, P.white);
            }
            for (let r = 0; r < runs; r++) { const cx = x0 + 1 + Math.floor((r + 0.5) * w / runs), rr = 1 + ((Math.floor(t / 6) + r * 3) % 4); for (let i = -rr; i <= rr; i++) if (Math.abs(i) > rr - 2) px(cx + i, bot, P.foam); }
        } else if (k === "drips") {
            // slow drops along the roof: each its own place and its own time
            const n = Math.max(1, Math.round(W / 10)), fallT = Math.sqrt(2 * B.h / 0.22);
            for (let r = 0; r < n; r++) {
                const dx = B.x + Math.floor((r + 0.25 + hh(r, B.x, 11) * 0.5) * W / n), per = Math.max(Math.round(fallT) + 90, Math.round((150 + hh(r, B.y, 12) * 170) * slow)), f = (t + Math.floor(hh(r, B.x, 13) * per)) % per;
                // the little stalactite it hangs from, and the wet stain round it
                px(dx - 1, B.y, P.out); px(dx, B.y, "#8a8070"); px(dx + 1, B.y, P.out); px(dx, B.y + 1, "#6a6258");
                const grow = per - fallT - 26;   // swelling, then falling, then landing
                if (f < grow) { const sz = f / grow; px(dx, B.y + 2, sz > 0.25 ? P.light : P.dark); if (sz > 0.6) { px(dx, B.y + 3, P.mid); if (sz > 0.85) px(dx, B.y + 2, P.white); } }
                else if (f < grow + fallT) { const ft = f - grow, y = B.y + 3 + 0.11 * ft * ft; if (y < bot - 1) { px(dx, y, P.white); px(dx, y - 1, P.light); if (ft > 8) px(dx, y - 2, P.mid); } }
                else plink(dx, bot, f - grow - fallT);
            }
        } else {
            // a trickle: a thread of water from the roof, breaking into drops now and then
            const cx = B.x + 4, on = ((t / (90 * slow)) % 1) < 0.7;
            px(cx - 1, B.y, P.out); px(cx, B.y, P.dark); px(cx + 1, B.y, P.out);
            for (let y = B.y + 1; y < bot; y++) {
                const ph = ((Math.floor(y - t * sp * 0.8)) % 9 + 9) % 9, broken = !on && y > B.y + 6;
                if (broken ? ph === 0 : ph < 6) px(cx, y, ph === 0 ? P.white : ph < 3 ? P.light : P.mid);
            }
            plink(cx, bot, Math.floor(t % 12));
        }
        g.restore();
    }
    function drawVine(o) {
        const H = Math.max(8, o.h || 48), seed = o.seed !== undefined ? o.seed : ((o.x * 7 + o.y * 3) % 97), dens = o.leaves === undefined ? 0.6 : o.leaves, sway = o.sway !== false, t = frameNo;
        const off = y => { const k = y / H; return (sway ? Math.sin(t / 55 + seed) * 1.8 * k * k : 0) + Math.sin(y / 11 + seed) * 1.3 * Math.min(1, y / 12); };
        const X0 = o.x + 6, P = (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
        const flowers = [];
        for (let y = 0; y < H; y++) {
            const x = X0 + off(y), tw = Math.sin(y / 2.1 + seed) > 0;
            P(x - 1, o.y + y, VLEAF[0]); P(x + 2, o.y + y, VLEAF[0]);
            P(x + (tw ? 0 : 1), o.y + y, VLEAF[2]); P(x + (tw ? 1 : 0), o.y + y, VLEAF[3]);
            if (y > 2 && y < H - 3 && gearHash(y, seed * 7 + 1) < dens * 0.3) {
                const s = gearHash(y, seed + 5) < 0.5 ? -1 : 1, bx = x + (s > 0 ? 2 : -1);
                const leaf = [[1, 0, 3], [2, -1, 4], [3, -1, 5], [2, 0, 3], [3, 0, 4], [4, 0, 3], [2, 1, 2], [3, 1, 2], [1, 1, 1]];
                for (const [dx, dy, ci] of leaf) P(bx + s * dx, o.y + y + dy, VLEAF[ci]);
                P(bx + s * 5, o.y + y + 1, VLEAF[2]);
                if (o.flowers && gearHash(y, seed + 9) < 0.35) flowers.push([bx + s * 4, o.y + y - 2, ["#ff5ab4", "#ffe23e", "#3effe8"][Math.floor(gearHash(y, seed + 11) * 3)]]);
            }
        }
        // the tip, curling
        const tx = X0 + off(H - 1), ty = o.y + H;
        for (const [dx, dy] of [[0, 0], [1, 1], [2, 1], [3, 0], [3, -1], [2, -2]]) P(tx + dx, ty + dy, VLEAF[3]);
        for (const [fx, fy, fc] of flowers) {
            P(fx, fy, fc); P(fx - 1, fy + 1, fc); P(fx + 1, fy + 1, fc); P(fx, fy + 2, fc); P(fx, fy + 1, "#ffffff");
            g.save(); g.globalCompositeOperation = "lighter"; const [r, gg, b] = hexRGB(fc), gr = g.createRadialGradient(fx, fy + 1, 0.5, fx, fy + 1, 7); gr.addColorStop(0, `rgba(${r},${gg},${b},0.35)`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(fx - 7, fy - 6, 14, 14); g.restore();
        }
    }
    // ---- the neon signs, drawn once for each look, lit and dead
    const neonArt = new Map();
    function neonImage(o, lit) {
        const kind = o.kind || "star", col = okCol(o.color, "#ff3ea8"), n = neonSize(o), s = n.s, text = String(o.text || "OPEN").slice(0, 24).toUpperCase();
        const key = [kind, col, s, lit, kind === "text" ? text : ""].join("|"); let c = neonArt.get(key); if (c) return c;
        c = document.createElement("canvas"); c.width = n.w; c.height = n.h; const x = c.getContext("2d");
        const core = mixHex(col, "#ffffff", 0.65), deadC = mixHex(col, "#000000", 0.72);
        x.translate(8, 8); x.lineCap = "round"; x.lineJoin = "round";
        const path = () => {
            x.beginPath();
            const M = (a, b) => x.moveTo(a * s, b * s), Lt = (a, b) => x.lineTo(a * s, b * s), Q = (a, b, c2, d) => x.quadraticCurveTo(a * s, b * s, c2 * s, d * s), A = (a, b, r, s0, s1) => { x.moveTo((a + Math.cos(s0) * r) * s, (b + Math.sin(s0) * r) * s); x.arc(a * s, b * s, r * s, s0, s1); };
            switch (kind) {
                case "bolt": M(13, 1); Lt(3, 18); Lt(10, 18); Lt(5, 33); Lt(18, 13); Lt(11, 13); x.closePath(); break;
                case "star": for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 15, an = -Math.PI / 2 + i * Math.PI / 5; (i ? Lt : M)(16 + Math.cos(an) * r, 17 + Math.sin(an) * r); } x.closePath(); break;
                case "heart": M(15, 26); Q(1, 15, 3, 7); Q(7, 1, 15, 8); Q(23, 1, 27, 7); Q(29, 15, 15, 26); break;
                case "arrow": M(2, 10); Lt(30, 10); M(24, 3); Lt(36, 10); Lt(24, 17); break;
                case "palm": M(15, 39); Q(13, 24, 17, 12); for (const [dx, dy] of [[-12, 3], [-8, -6], [9, -6], [13, 4]]) { M(17, 12); Q(17 + dx * 0.5, 12 + dy - 6, 17 + dx, 12 + dy); } M(3, 39); Q(16, 34, 29, 39); break;
                case "ring": A(15, 15, 13, 0, Math.PI * 2); A(15, 15, 7, 0, Math.PI * 2); break;
                case "wave": M(2, 8); for (let i = 0; i <= 40; i += 2) Lt(2 + i, 8 + Math.sin(i / 3.2) * 5); break;
                case "cherries": A(8, 22, 6, 0, Math.PI * 2); A(20, 24, 6, 0, Math.PI * 2); M(9, 16); Q(12, 6, 21, 2); M(20, 18); Q(20, 8, 21, 2); M(21, 2); Lt(26, 4); break;
                case "ghost": M(3, 28); Lt(3, 13); Q(3, 2, 13, 2); Q(23, 2, 23, 13); Lt(23, 28); Lt(19, 24); Lt(15, 28); Lt(11, 24); Lt(7, 28); Lt(3, 28); A(9, 13, 2, 0, Math.PI * 2); A(17, 13, 2, 0, Math.PI * 2); break;
                case "joystick": M(4, 32); Lt(20, 32); Lt(20, 25); Lt(4, 25); x.closePath(); M(12, 25); Lt(12, 11); A(12, 7, 5, 0, Math.PI * 2); break;
                case "planet": A(20, 14, 10, 0, Math.PI * 2); x.moveTo(2 * s, 18 * s); x.ellipse(20 * s, 15 * s, 19 * s, 5 * s, -0.25, 0, Math.PI * 2); break;
                case "note": M(6, 26); A(6, 26, 4, 0, Math.PI * 2); M(10, 26); Lt(10, 3); Q(16, 6, 19, 12); M(10, 3); Q(15, 8, 18, 9); break;
            }
        };
        if (kind === "text") {
            x.shadowColor = col; x.shadowBlur = lit ? 10 : 0;
            RatFont.draw(x, text, 0, 0, { scale: 2 * s, outline: false, color: lit ? col : deadC });
            if (lit) { x.shadowBlur = 0; RatFont.draw(x, text, 0, 0, { scale: 2 * s, outline: false, ramp: [core, col, col, col, col, col, col] }); }
        } else if (lit) {
            x.shadowColor = col; x.shadowBlur = 10 * s; x.strokeStyle = col; x.lineWidth = 3 * s; path(); x.stroke(); x.shadowBlur = 4 * s; x.stroke();
            x.shadowBlur = 0; x.strokeStyle = core; x.lineWidth = Math.max(1, s); path(); x.stroke();
        } else { x.strokeStyle = deadC; x.lineWidth = 2 * s; path(); x.stroke(); x.strokeStyle = "rgba(255,255,255,0.12)"; x.lineWidth = 1; path(); x.stroke(); }
        neonArt.set(key, c); return c;
    }
    function drawNeon(o) {
        const seed = (o.x * 7 + o.y * 3) % 97, t = frameNo + seed * 31, on = o.on !== false;
        const buzz = on && (o.flicker || 0) > 0 && gearHash(seed, Math.floor(t / 5)) < (o.flicker || 0) * 0.35;
        const lit = on && !buzz, img = neonImage(o, lit);
        if (lit) { g.save(); g.globalCompositeOperation = "lighter"; g.drawImage(img, o.x, o.y); const n = neonSize(o), [r, gg, b] = hexRGB(okCol(o.color, "#ff3ea8")), cx = o.x + n.w / 2, cy = o.y + n.h / 2, R = Math.max(n.w, n.h) * 0.9, gr = g.createRadialGradient(cx, cy, 2, cx, cy, R); gr.addColorStop(0, `rgba(${r},${gg},${b},0.12)`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(cx - R, cy - R, R * 2, R * 2); g.restore(); }
        else g.drawImage(img, o.x, o.y);
    }
    function drawDeco(cam, layer) {
        for (const o of act.deco2) {
            if ((o.layer === "front" ? "front" : "back") !== layer) continue;
            // (a broken crane by its whole drawing: its straps reach up to the roof, above its box)
            const b = o.type === "wreck" ? (A => ({ x: A.ox, y: A.oy, w: A.c.width, h: A.c.height }))(wreckArt(o, act)) : decoBox(o); if (b.x > cam.x + VW + 40 || b.y > cam.y + VH + 40 || b.x + b.w < cam.x - 40 || b.y + b.h < cam.y - 40) continue;
            if (o.type === "machine") drawMachine(o); else if (o.type === "vine") drawVine(o); else if (o.type === "wreck") drawWreck(o); else if (o.type === "waterfall") drawWaterfall(o); else drawNeon(o);
        }
    }
    function drawDecoOne(o) { if (o.type === "machine") drawMachine(o); else if (o.type === "vine") drawVine(o); else if (o.type === "neon") drawNeon(o); else if (o.type === "wreck") drawWreck(o); else if (o.type === "waterfall") drawWaterfall(o); }
    /* A LANTERN IN ITS OWN COLOUR (14 Oct 2026, the owner's: "changing the colour of the lanterns in
       the arcade zone only changes the glow, it doesn't effect the lantern colour"): where the zone's
       lamp says it may be (TH.tintLamp), the glass and its glow inside are turned to the lantern's
       colour, keeping their light and dark; white stays white. */
    const tintArt = new Map();
    function tinted(img, rgb) {
        if (!img) return img;
        const key = img.width + "x" + img.height + "|" + (img._tid || (img._tid = Math.random().toString(36).slice(2))) + "|" + rgb.join(","); let c = tintArt.get(key); if (c) return c;
        c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const D = x.getImageData(0, 0, c.width, c.height), d = D.data;
        const toHsl = (r, g2, b) => { r /= 255; g2 /= 255; b /= 255; const mx = Math.max(r, g2, b), mn = Math.min(r, g2, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const dd = mx - mn, s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); const h = mx === r ? (g2 - b) / dd + (g2 < b ? 6 : 0) : mx === g2 ? (b - r) / dd + 2 : (r - g2) / dd + 4; return [h * 60, s, l]; };
        const fromHsl = (h, s, l) => { const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0), f(8), f(4)].map(v => Math.round(v * 255)); };
        const [th, ts] = toHsl(...rgb);
        for (let i = 0; i < d.length; i += 4) {
            if (!d[i + 3]) continue;
            const [h, s, l] = toHsl(d[i], d[i + 1], d[i + 2]);
            if (s < 0.3 || Math.min(Math.abs(h - 325), 360 - Math.abs(h - 325)) > 40) continue;
            const [r, g2, b] = fromHsl(th, Math.min(1, ts * 0.5 + s * 0.5), l); d[i] = r; d[i + 1] = g2; d[i + 2] = b;
        }
        x.putImageData(D, 0, 0); tintArt.set(key, c); return c;
    }
    function drawFloat(m) {
        const X = Math.round(m.x), Y = Math.round(m.y), W = m.w;
        g.fillStyle = "#0a0e14"; g.fillRect(X, Y, W, 4);
        g.fillStyle = "#7c8898"; g.fillRect(X + 1, Y + 1, W - 2, 2);
        g.fillStyle = "#b8c4d2"; g.fillRect(X + 1, Y + 1, W - 2, 1);
        g.fillStyle = "#3a4452"; for (let i = 3; i < W - 3; i += 4) g.fillRect(X + i, Y + 2, 2, 1);
        for (const dx of [2, W - 24]) {
            const x0 = X + dx, y0 = Y + 4;
            g.fillStyle = "#0a0e14"; g.fillRect(x0 + 1, y0, 20, 9); g.fillRect(x0, y0 + 1, 22, 7);
            g.fillStyle = "#c8501e"; g.fillRect(x0 + 1, y0 + 1, 20, 7);
            g.fillStyle = "#f07a32"; g.fillRect(x0 + 1, y0 + 1, 20, 2);
            g.fillStyle = "#8a3212"; g.fillRect(x0 + 1, y0 + 6, 20, 2);
            g.fillStyle = "#e8e4dc"; g.fillRect(x0 + 8, y0 + 1, 6, 7);
            g.fillStyle = "#ffffff"; g.fillRect(x0 + 8, y0 + 1, 6, 1);
            g.fillStyle = "#a8a49c"; g.fillRect(x0 + 8, y0 + 6, 6, 2);
            g.fillStyle = "#ffd8a8"; g.fillRect(x0 + 3, y0 + 2, 1, 1); g.fillRect(x0 + 17, y0 + 2, 1, 1);
        }
        g.fillStyle = "#0a0e14"; g.fillRect(X + 22, Y + 4, 4, 3);
        g.fillStyle = "#5a6676"; g.fillRect(X + 23, Y + 4, 2, 2);
    }
    function drawSteam(f) {
        const side = f.side, wallX = side > 0 ? f.tx * TS : f.tx * TS + TS, Y = Math.round(f.y), t = f.tt === undefined ? f.t : f.tt;
        // the nozzle
        const nx = side > 0 ? wallX : wallX - 6;
        g.fillStyle = "#0a0e14"; g.fillRect(nx, Y - 3, 6, 14);
        g.fillStyle = "#6a7686"; g.fillRect(nx + 1, Y - 2, 4, 12);
        g.fillStyle = "#9aa6b6"; g.fillRect(nx + 1, Y - 2, 4, 1); g.fillRect(side > 0 ? nx + 4 : nx + 1, Y - 2, 1, 12);
        g.fillStyle = "#1a2028"; g.fillRect(side > 0 ? nx + 5 : nx, Y + 1, 1, 6);
        const mouth = side > 0 ? wallX + 6 : wallX - 6;
        // the warning: wisps curling up from the nozzle
        if (t >= 96 && t < 142) {
            for (let i = 0; i < 3; i++) {
                const k = ((t - 96) * 1.3 + i * 9) % 26;
                blob(mouth + side * (2 + k * 0.3) + Math.sin((t + i * 13) / 5) * 1.5, Y + 4 - k * 0.7, 1 + (k > 12 ? 1 : 0), "rgba(220,230,240," + (0.55 - k / 60).toFixed(2) + ")");
            }
        }
        if (f.out <= 0) return;
        // the burst
        const L = 34 * f.out;
        for (let i = 0; i < 9; i++) {
            const k = i / 8, along = k * L;
            const r = Math.round(2 + k * 4 + Math.sin((frameNo + i * 7) / 3) * 0.8);
            const cy = Y + 4 + Math.sin((frameNo * 0.6 + i * 11) / 4) * (1 + k * 2) - k * 2;
            const a = (0.85 - k * 0.45) * Math.min(1, f.out * 1.5);
            blob(mouth + side * along, cy, r + 1, "rgba(150,165,180," + (a * 0.6).toFixed(2) + ")");
            blob(mouth + side * along, cy - 1, r, "rgba(235,242,248," + a.toFixed(2) + ")");
        }
    }
    function stepStation() {
        const h = hero;
        for (const d of act.doors) {
            if (d.open) { d.anim = Math.min(1, d.anim + 1 / 30); continue; }
            d.idle++;
            if (d.idle > 24 && d.prog > 0) d.prog = Math.max(0, d.prog - 0.004);
        }
        // the alarm: passing it sets the flood rising
        const F = act.flood;
        if (F) {
            for (const al of act.alarms) if (!al.fired && (!F.active || F.sea) && Math.abs(h.x + h.w / 2 - (al.x + 8)) < 14 && Math.abs(h.y + h.h - (al.y + 16)) < 30) { al.fired = true; F.active = true; if (F.sea) { F.surge = true; F.base = F.y; F.wait = 90; } sfx("alarmTone"); pop(al.x + 8, al.y - 4, "FLOOD!"); }
            // a pump turned: the sea going down to its new line
            if (F.sea && F.draining && !F.surge) { F.base = Math.min(F.drainTo, F.base + 1.2); if (frameNo % 8 === 0) state.shake = Math.max(state.shake, 2); if (F.base >= F.drainTo) F.draining = false; }
            if (F.sea && F.surge) {
                // the surge: up and up, to the u line
                if (F.wait > 0) { F.wait--; state.shake = Math.max(state.shake, 2); } else F.base = Math.max(F.cap, F.base - F.rate);
                F.y = F.base; F.rising = true;
                if (frameNo % 150 === 0) sfx("alarmTone");
                const gap = h.y - F.y;
                sfx("danger", gap > 0 ? 1 : Math.max(0, 1 - (-gap) / 120));
            } else if (F.sea && TH.sand) {
                const want = F.sandHigh ? F.base - F.amp : F.base;
                F.y += Math.max(-0.6, Math.min(0.6, want - F.y)); F.rising = want < F.y;
            } else if (F.sea) {
                const CALM = 900, RISE = 480, HIGH = 300, FALL = 480;
                F.t = (F.t + 1) % (CALM + RISE + HIGH + FALL);
                const t = F.t, ease = k => k * k * (3 - 2 * k);
                const k = t < CALM ? 0 : t < CALM + RISE ? ease((t - CALM) / RISE) : t < CALM + RISE + HIGH ? 1 : 1 - ease((t - CALM - RISE - HIGH) / FALL);
                F.y = F.base - F.amp * k;
                F.rising = t >= CALM && t < CALM + RISE;
                if (t === CALM && !TH.sand) sfx("tideHorn");   // the horn: no words
            } else if (F.active) {
                if (F.wait > 0) F.wait--; else F.y = Math.max(F.cap, F.y - F.rate);
                if (frameNo % 150 === 0) sfx("alarmTone");
                // the warning in the music: how near the water is to his head
                const gap = (h.y) - F.y;
                sfx("danger", gap > 0 ? 1 : Math.max(0, 1 - (-gap) / 120));
            }
        }
        // air
        const under = (act.water.size || F) && wetAt(h.x + h.w / 2, h.y + 3);
        /* AIR (13 Oct 2026, after the Labyrinth Zone): twenty seconds under;
           a bell at fifteen, ten and five seconds left, then the count
           (drawn over his head) and the warning in the music. Standing by
           an oxygen tank fills it again. */
        const tank = act.tanks.find(t => Math.abs((t.x + t.w / 2) - (h.x + h.w / 2)) < 16 && h.y + h.h > t.y - 8 && h.y < t.y + t.h);
        for (const t of act.tanks) { t.glow = Math.max(0, (t.glow || 0) - 0.05); if (frameNo % 9 === 0 && wetAt(t.x + 6, t.y + 2)) state.parts.push({ kind: "bubble", x: t.x + 6 + (Math.random() - 0.5) * 3, y: t.y - 1, vx: 0, vy: -0.5 - Math.random() * 0.4, t: 0 }); }
        if (tank && act.air < 1 && state.mode === "play") {
            if (act.air < 0.9) sfx("gulp");
            act.air = Math.min(1, act.air + 0.03); tank.glow = 1; act.airBell = 0;
            if (frameNo % 3 === 0) state.parts.push({ kind: "bubble", x: tank.x + 6, y: tank.y + 2, vx: (h.x - tank.x) * 0.02, vy: -0.7, t: 0 });
        }
        /* AIR VENTS (14 Oct 2026, after the Labyrinth Zone's): a trickle of
           little bubbles, a froth to warn, then a big bubble, slow to rise:
           swim into it for a breath, all of one. */
        for (const v of act.vents) {
            v.t = (v.t + 1) % v.every;
            const inSea = wetAt(v.x + 8, v.y - 6);
            if (!inSea) continue;
            if (frameNo % (v.t > v.every - 40 ? 4 : 14) === 0) state.parts.push({ kind: "bubble", x: v.x + 6 + Math.random() * 4, y: v.y - 4, vx: 0, vy: -0.6 - Math.random() * 0.5, t: 0 });
            if (v.t === 0) act.bigBubbles.push({ x: v.x + 8, y: v.y - 6, r: 2, t: 0 });
        }
        act.bigBubbles = act.bigBubbles.filter(b => {
            b.t++; b.r = Math.min(7, 2 + b.t / 12); b.y -= 0.42; b.x += Math.sin(b.t / 14) * 0.25;
            if (!wetAt(b.x, b.y - b.r) || solidAt(Math.floor(b.x / TS), Math.floor((b.y - b.r) / TS))) return false;
            if (state.mode === "play" && Math.abs(b.x - (h.x + h.w / 2)) < b.r + 6 && Math.abs(b.y - (h.y + 8)) < b.r + 9) {
                act.air = 1; act.airBell = 0; sfx("gulp"); sfx("danger", 0); sparkle(b.x, b.y, "#dff6ff", 8); return false;
            }
            return b.t < 900;
        });
        const AIR = 1200;
        if (under && state.mode === "play" && !tank) {
            act.air = Math.max(0, act.air - 1 / AIR);
            const left = act.air * AIR / 60;
            for (const [i, mark] of [[1, 15], [2, 10], [3, 5]]) if (left <= mark && (act.airBell || 0) < i) { act.airBell = i; sfx("airBell", i); }
            sfx("danger", left < 6 ? 1 - left / 8 : 0);
            if (frameNo % 40 === 0) state.parts.push({ kind: "bubble", x: h.x + h.w / 2 + h.face * 4, y: h.y + 4, vx: 0, vy: -0.5, t: 0 });
            if (act.air <= 0) { pop(h.x + h.w / 2, h.y - 4, "NO AIR!"); die(); }
        } else if (!tank) { if (act.air < 1 && act.air * 1200 / 60 < 6) sfx("danger", 0); act.air = Math.min(1, act.air + 0.02); if (act.air >= 1) act.airBell = 0; }
    }
    function burnerBox(b, k) {
        const L = b.len * k;
        // from the nozzle's mouth (see JET)
        if (b.dir === "up") return { x: b.x + 3, y: b.y + 7 - L, w: 10, h: L };
        if (b.dir === "down") return { x: b.x + 3, y: b.y + 9, w: 10, h: L };
        if (b.dir === "left") return { x: b.x + 7 - L, y: b.y + 3, w: L, h: 10 };
        return { x: b.x + 9, y: b.y + 3, w: L, h: 10 };
    }
    /* THE NEW ZONES' WORKINGS (14 Oct 2026). */
    function stepLab() {
        const h = hero;
        act.clock++;
        const B = TH.beat || 36;
        // the weather, round and round: sun, cloud coming over, rain, clearing
        if (TH.weather) {
            const W = act.weather || (act.weather = { t: 0 });
            W.t = (W.t + 1) % 2280;
            const t = W.t;
            W.rain = t >= 1380 && t < 2100;
            W.dark = t < 1200 ? 0 : t < 1380 ? (t - 1200) / 180 : t < 2100 ? 1 : 1 - (t - 2100) / 180;
            if (t === 1290) sfx("thunder");
        }
        // what is solid now: beat blocks by turns, roots in the rain, brambles in the sun; never shut on Scout
        for (const sw of act.switchers) {
            let want;
            if (sw.kind === "beatA" || sw.kind === "beatB") { const ph = Math.floor(act.clock / (B * 2)) % 2; want = (sw.kind === "beatA") === (ph === 0); }
            else want = sw.kind === "rain" ? Boolean(act.weather && act.weather.rain) : !(act.weather && act.weather.rain);
            if (want && !sw.on) { if (hit(h, { x: sw.tx * TS, y: sw.ty * TS, w: TS, h: TS })) continue; sw.on = true; sw.grow = 0; act.tiles[sw.ty][sw.tx] = "■"; }
            else if (!want && sw.on) { sw.on = false; act.tiles[sw.ty][sw.tx] = "."; }
            sw.grow = Math.min(1, sw.grow + 0.07);
        }
        if (TH.beat && act.clock % B === 0) sfx("tick", Math.floor(act.clock / B) % 4);
        // lava: a touch is the end of him
        if (act.lava.size && state.mode === "play" && !debug.invincible) {
            const x0 = Math.floor((h.x + 2) / TS), x1 = Math.floor((h.x + h.w - 3) / TS), ty = Math.floor((h.y + h.h - 3) / TS);
            for (let tx = x0; tx <= x1; tx++) if (act.lava.has(tx + "," + ty)) { pop(h.x + h.w / 2, h.y - 4, "OUCH!"); die(); break; }
        }
        // the slag rafts: from each spout now and then, off along the lava
        for (const sp of act.spouts) { sp.t++; if (sp.t >= 170) { sp.t = 0; act.movers.push({ kind: "raft", x: sp.x, y: sp.y - 4, y0: sp.y - 4, w: 32, dx: 0, dy: 0, age: 0, tx: Math.floor(sp.x / TS), ty: Math.floor(sp.y / TS), dir: 1, pause: 0 }); } }
        // the gear wheels turn (unless set still)
        for (const G of act.gears) if (!G.still) G.ang += G.speed;
        // the fire jets: a burst, then quiet; a flicker and a puff of smoke just before
        for (const b of act.burners) {
            b.t = (b.t + 1) % b.every;
            const burning = b.t < b.on, k = burning ? Math.min(1, b.t / 6, (b.on - b.t) / 8) : 0;
            b.k = k;
            if (b.t === 0 && onScreen(b.x + 8, b.y + 8)) sfx("flame");   // (14 Oct 2026) a soft whoosh, and only from a jet in view (it was the steam hiss, from 16 tiles off)
            if (k > 0.3 && state.mode === "play" && !debug.invincible) { const bx = burnerBox(b, k); if (hit(h, bx)) hurt(); }
        }
        // the splashes: a bubbling first, then the blobs thrown up
        for (const sp of act.splashes) {
            sp.t = (sp.t + 1) % sp.every;
            if (sp.t === 0) for (let i = 0; i < 3; i++) act.blobs.push({ x: sp.x + 6 + (i - 1) * 3, y: sp.y + 2, y0: sp.y + 6, vx: (i - 1) * 0.55 + (Math.random() - 0.5) * 0.3, vy: -(3.4 + Math.random() * 1.1) * Math.sqrt(sp.high) });
        }
        for (const bl of act.blobs) {
            bl.vy += 0.14; bl.x += bl.vx; bl.y += bl.vy;
            if (bl.y > bl.y0 && bl.vy > 0) bl.gone = true;
            if (!bl.gone && state.mode === "play" && !debug.invincible && hit(h, { x: bl.x - 2, y: bl.y - 2, w: 5, h: 5 })) { bl.gone = true; hurt(); }
        }
        if (act.blobs.length) act.blobs = act.blobs.filter(bl => !bl.gone);
        // THE DRIPPING PIPES: a glob swells at the mouth, lets go, falls slowly; it burns him if it lands on him
        for (const oz of act.oozes) {
            oz.t = (oz.t + 1) % oz.every;
            if (oz.t === oozeRelease(oz) && !oz.drop) oz.drop = { x: oz.x + 8, y: oz.y + oz.len + 4, vy: 0.15, age: 0 };
            const d = oz.drop; if (!d) continue;
            d.age++; d.vy = Math.min(2.4, d.vy + 0.07); d.y += d.vy;
            const tx = Math.floor(d.x / TS), ty = Math.floor((d.y + 2) / TS);
            if (state.mode === "play" && !debug.invincible && hit(h, { x: d.x - 3, y: d.y - 3, w: 6, h: 7 })) { oozeSplat(oz, d, false, Math.round(d.y + 2)); hurt(); continue; }
            const lava = act.lava.has(tx + "," + ty);
            if (ty >= act.h || solidAt(tx, ty) || lava) oozeSplat(oz, d, lava, lava ? ty * TS + 3 : ty * TS);
        }
        for (const p of act.puddles) p.t++;
        if (act.puddles.length) act.puddles = act.puddles.filter(p => p.t < p.life);
        // the drips: a drop swells under the roof, lets go, falls, and splashes
        for (const d of act.drips) {
            d.t = (d.t + 1) % d.every;
            if (d.t === 0) d.drop = { y: d.y + 3, vy: 0 };
            if (d.drop) { d.drop.vy = Math.min(5, d.drop.vy + 0.2); d.drop.y += d.drop.vy; const ty = Math.floor(d.drop.y / TS), tx = Math.floor((d.x + 8) / TS); if (solidAt(tx, ty) || ty >= act.h || (act.flood && d.drop.y > act.flood.y) || act.water.has(tx + "," + ty)) { for (let i = 0; i < 4; i++) state.parts.push({ kind: "dust", x: d.x + 8, y: d.drop.y - 2, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 1.2, t: 0, col: "#9fd0ee" }); d.drop = null; } }
        }
        // an hourglass: walk into it and it turns over, and the sand goes to its other line
        for (const gl of act.glasses) {
            if (gl.cd > 0) gl.cd--;
            gl.flip = Math.max(0, gl.flip - 0.03);
            if (gl.cd === 0 && state.mode === "play" && hit(h, { x: gl.x + 2, y: gl.y - 6, w: 12, h: 22 })) { gl.cd = 90; gl.flip = 1; if (act.flood) act.flood.sandHigh = !act.flood.sandHigh; sfx("drain"); state.shake = 6; }
        }
    }
    function stepFalls() {
        const h = hero;
        for (const f of act.falls) {
            f.t = (f.t + 1) % f.period;
            const left = f.period - f.t;
            if (left < WARN && frameNo % 3 === 0) state.parts.push({ kind: "grit", x: f.x + 4 + Math.random() * 8, y: f.y + 2, vx: 0, vy: 0.6 + Math.random() * 0.6, t: 0 });
            if (f.t === 0) act.rocks.push({ x: f.x + 2, y: f.y + 2, w: 12, h: 10, vy: 0.5 });
        }
        act.rocks = act.rocks.filter(r => {
            r.vy = Math.min(6, r.vy + 0.3);
            r.y += r.vy;
            if (hero.hurt === 0 && state.mode === "play" && hit(h, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 })) hurt();
            const below = Math.floor((r.y + r.h) / TS), tx0 = Math.floor((r.x + 2) / TS), tx1 = Math.floor((r.x + r.w - 2) / TS);
            let landed = r.y > act.h * TS;
            for (let tx = tx0; tx <= tx1 && !landed; tx++) { const c = tileAt(tx, below); if (c === "#" || c === "=" || c === "^" || c === "X") landed = true; }
            // (23 Oct 2026) or on a slope's line
            if (!landed && act.slopes) { const cx = r.x + r.w / 2, ctx = Math.floor(cx / TS), S = SLOPES[tileAt(ctx, below)]; if (S && r.y + r.h >= below * TS + slopeY(S, cx - ctx * TS)) { landed = true; r.y = below * TS + slopeY(S, cx - ctx * TS) - r.h; } }
            if (landed) {
                for (let i = 0; i < 7; i++) state.parts.push({ kind: "shard", x: r.x + 6, y: Math.floor(below) * TS - 3, vx: (Math.random() - 0.5) * 2.4, vy: -1 - Math.random() * 1.6, t: 0 });
                /* heard only where it is seen, and softly (13 Oct 2026: every rock
                   in the passage thudding, off screen and all, about twice a
                   second, was the owner's "short buzzy clicks in rhythm") */
                const cam = state.cam;
                if (r.x + r.w > cam.x - 8 && r.x < cam.x + VW + 8 && r.y + r.h > cam.y - 8 && r.y < cam.y + VH + 8) sfx("land", true);
                return false;
            }
            return true;
        });
    }
    function stepCrates() {
        for (const c of act.crates) {
            if (c.hang) continue;
            // an ice block sliding: on until something stops it; anything in its way is knocked flat
            if (c.vx) {
                const step = Math.sign(c.vx);
                let left = Math.abs(c.vx);
                while (left > 0) {
                    const d = Math.min(1, left);
                    if (overlapsSolid(c, c.x + step * d, c.y, c.w, c.h) || hit({ x: c.x + step * d, y: c.y, w: c.w, h: c.h }, hero)) { c.vx = 0; c.x = Math.round(c.x); sfx("land", false); break; }
                    c.x += step * d; left -= d;
                }
                for (const f of act.foes) if (f.alive && hit(c, f)) { f.alive = false; f.deadT = 0; state.score += 200; pop(f.x + f.w / 2, f.y, "200"); sparkle(f.x + f.w / 2, f.y + f.h / 2, "#d8f0ff", 8); sfx("stomp"); }
                if (frameNo % 3 === 0) state.parts.push({ kind: "dust", x: c.x + (step > 0 ? 0 : c.w), y: c.y + c.h - 1, vx: -step * 0.3, vy: -0.2, t: 0 });
            }
            c.vy = Math.min(FALL_MAX, c.vy + GRAVITY);
            let left = c.vy, landed = false;
            while (left > 0) {
                const d = Math.min(1, left);
                if (overlapsSolid(c, c.x, c.y + d, c.w, c.h) || beamUnder(c.x + 1, c.w - 2, c.y + c.h, c.y + c.h + d) !== null) { landed = true; break; }
                // (16 Oct 2026) one cut down onto Scout lands on him (a knock, if it was really falling) rather than through him
                if (c.hang0 && hit({ x: c.x, y: c.y + d, w: c.w, h: c.h }, hero) && hero.y >= c.y + c.h - 2) { if (c.vy > 1.5) hurt(); landed = true; break; }
                c.y += d; left -= d;
            }
            if (c.hang0 && c.vy > 1.5) for (const f of act.foes) if (f.alive && f.kind !== "steam" && f.kind !== "hammer" && hit(c, f)) { f.alive = false; f.deadT = 0; state.score += 200; pop(f.x + f.w / 2, f.y, "200"); sparkle(f.x + f.w / 2, f.y + f.h / 2, "#ffffff", 8); sfx("stomp"); }
            if (landed) {
                if (c.vy > 2) sfx("land", false);
                c.vy = 0;
                const snap = Math.ceil(c.y);
                if (snap !== c.y && !overlapsSolid(c, c.x, snap, c.w, c.h) && beamUnder(c.x + 1, c.w - 2, c.y + c.h, snap + c.h) === null) c.y = snap;
            }
            /* (14 Oct 2026, found by the play-tester) never inside a crate: caught a
               few pixels into its top (a crate come down beside a ladder he was on),
               he is set up onto it, where he would otherwise be wedged for good */
            const h = hero, sink = h.y + h.h - c.y;
            if (sink > 0 && sink <= 8 && h.x < c.x + c.w && h.x + h.w > c.x && h.vy >= 0) {
                const ny = c.y - h.h;
                if (!act.crates.some(o => o !== c && h.x < o.x + o.w && h.x + h.w > o.x && ny < o.y + o.h && ny + h.h > o.y) && !overlapsSolid(Object.assign({}, h, { y: ny }), h.x, ny, h.w, h.h)) { h.y = ny; h.vy = 0; h.ground = true; if (h.climb) h.climb = null; }
            }
        }
    }

    /* ---------------------------------------------------------------- LOSING A LIFE
       A pop up and a fall off the screen, as the old games did, then back to
       where Scout came into the room. */
    function hurt() {
        if (state.mode !== "play" || act.entering || hero.hurt > 0 || debug.invincible) return;
        if (state.coins <= 0) { die(); return; }
        const n = Math.min(state.coins, 24), h = hero;
        state.coins = 0;
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i / n - 0.5) * Math.PI * 1.6 + (i % 2 ? 0.08 : -0.08);
            const sp = 2.2 + (i % 3) * 0.7;
            act.loose.push({ x: h.x + h.w / 2 - 6, y: h.y + 4, w: 13, h: 13, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, t: 0 });
        }
        h.hurt = 100; h.vy = -3.6; h.vx = -h.face * 1.6; h.climb = null; h.mantle = null; h.ride = null; h.wallLock = 12;
        if (h.cart) { h.cart.ride = false; h.cart = null; }
        state.shake = 6;
        sfx("hurt"); sfx("coin", 1);
    }
    function stepLoose() {
        const h = hero;
        act.loose = act.loose.filter(c => {
            c.t++;
            c.vy = Math.min(5, c.vy + 0.18);
            c.x += c.vx;
            if (overlapsSolid(c, c.x, c.y, c.w, c.h)) { c.x -= c.vx; c.vx = -c.vx * 0.6; }
            c.y += c.vy;
            if (overlapsSolid(c, c.x, c.y, c.w, c.h)) { c.y -= c.vy; c.vy = c.vy > 0 ? -c.vy * 0.6 : 0; c.vx *= 0.8; if (Math.abs(c.vy) < 0.6) c.vy = 0; }
            if (c.t > 24 && hit(h, c)) { state.coins++; state.score += 10; sfx("coin", 1); sparkle(c.x + 7, c.y + 7, "#fff3b8", 4); return false; }
            return c.t < 200;
        });
    }
    function die() {
        if (state.mode !== "play" || act.entering) return;
        // (testing, invincible: a fall out of the map puts him back at the start or the flag, a lost air bubble refills)
        if (debug.invincible) { if (hero.y > act.h * TS) { state.lives++; } else { act.air = 1; return; } }
        state.mode = "dying"; state.t = 0;
        if (!state.endless) state.lives--;
        hero.vy = -4.2; hero.vx = 0; hero.climb = null;
        state.shake = 12;
        sfx("hurt"); sfx("lifeLost");
    }
    function respawn() {
        // Back to the flag if he has passed it (13 Oct 2026), or else the start of the act.
        // (testing in the editor: back where he was dropped in, unless the flag is taken)
        const f = act.flag, s = f && f.taken ? { x: f.x + 6 - BODY_W / 2 + 10, y: f.y + f.h - STAND_H } : debug.dropAt || act.start;
        hero = newHero(s.x, s.y);
        hero.face = 1; hero.hurt = 90; hero.safeSet = true; hero.room = roomOf(hero);
        // Crates go back where they began, so one pushed into a corner never strands him.
        for (const c of act.crates) { c.x = c.hx; c.y = c.hy; c.vy = 0; c.vx = 0; c.hang = c.hang0; c.cutY = null; c.tail = 0; }
        for (const ic of act.icicles) { ic.state = "hang"; ic.y = ic.hy; ic.vy = 0; ic.t = 0; }
        for (const c of act.crumbles.values()) { c.state = "ok"; c.t = 0; act.tiles[c.ty][c.tx] = "c"; }
        act.air = 1;
        if (act.flood && act.flood.active && !act.flood.sea) { act.flood.y = Math.max(act.flood.y, hero.y + hero.h + 72); act.flood.wait = 150; }
        // the surge starts again from the bottom, its alarm set again
        if (act.flood && act.flood.sea && act.flood.surge) {
            const F = act.flood; F.surge = false; F.base = F.drainTo !== undefined ? F.drainTo : F.base0; F.y = F.base; F.t = 0;
            for (const al of act.alarms) al.fired = false;
            // and the key the alarm was by goes back, so the climb is not skipped by a lost life
            for (const t of act.things) if (t.kind === "key" && t.got && act.alarms.some(al => Math.abs(al.x - t.x) < 64 && Math.abs(al.y - t.y) < 48)) { t.got = false; act.keyTaken = false; }
        }
        /* AND A KEY UNDER A PUMP'S WATER (14 Oct 2026): the passage's key, lying below
           where the pump would leave the sea, taken before the pump is turned (by swimming
           down on the last of the air), goes back too, so a lost life is no way past the pump. */
        if (act.flood && act.flood.sea && act.flood.drain !== undefined && act.doors.some(d => d.kind === "pump" && !d.open))
            for (const t of act.things) if (t.kind === "key" && !t.opens && t.got && t.y + t.h > act.flood.drain) { t.got = false; act.keyTaken = false; }
        act.bigBubbles = [];
        act.airBell = 0;
        sfx("danger", 0);
        snapCamera();
        state.mode = "play";
    }
    const roomOf = b => Math.floor((b.x + b.w / 2) / (ROOM_W * TS)) + "," + Math.floor((b.y + b.h / 2) / (ROOM_H * TS));

    function finishAct() {
        state.mode = "clear"; state.t = 0;
        const secs = state.time / 60;
        const timeBonus = Math.max(0, Math.round((360 - secs) * 5) * 10);   // par: six minutes (the acts grew, 13 Oct 2026)
        const coinBonus = act.coins * 20;
        const allCoins = act.coins === act.coinsTotal ? 1000 : 0;
        state.tally = { time: state.time, timeBonus, coinBonus, allCoins, gems: act.gems, newBest: false, best: null };
        state.score += timeBonus + coinBonus + allCoins;
        state.zoneTime += state.time;
        const key = "a" + state.zi + "-" + state.ai;
        state.tally.best = best[key] || null;
        if (!state.practice && (!best[key] || state.time < best[key])) { best[key] = state.time; saveBest(); state.tally.newBest = true; }
        sfx("actClear");
    }

    /* ---------------------------------------------------------------- THE LITTLE THINGS */
    function pop(x, y, text) { state.pops.push({ x, y, text, t: 0 }); }
    function sparkle(x, y, col, n) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; state.parts.push({ kind: "spark", x, y, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4 - 0.5, t: 0, col }); } }
    function dust(x, y, n) { for (let i = 0; i < n; i++) state.parts.push({ kind: "dust", x: x + (Math.random() - 0.5) * 6, y, vx: (Math.random() - 0.5) * 0.8, vy: -Math.random() * 0.6, t: 0 }); }

    /* ---------------------------------------------------------------- THE CAMERA
       Following Scout, a little ahead of where he faces, never past the map. */
    let camYT = null, camLook = 0;
    function camTarget() {
        const h = hero;
        /* (14 Oct 2026, the owner's: "climbing a long shaft is disorientating as
           the camera wobbles side to side") The look ahead eases round, and only
           while he runs on the ground, not with every turn of his head on a
           ladder or a wall-jump. */
        if (h.ground && Math.abs(h.vx) > 0.6 && !h.climb) camLook += (h.face * 24 - camLook) * 0.05;
        let x = h.x + h.w / 2 - VW / 2 + camLook;
        /* (13 Oct 2026: "when climbing up platforms the camera follows scout too
           literally ... i can no longer see what's below") A window, as the old
           platformers had: while his feet are between two lines on the screen
           the view stays put, however he climbs or jumps; past one, it moves
           just far enough to keep him inside, never recentring. Standing on a
           room's floor his feet are on the lower line, so the room is framed
           as before. */
        const feet = h.y + h.h, TOP = VH * 0.42, BOTTOM = VH * 0.82;
        if (camYT === null) camYT = feet - BOTTOM;
        const onScreen = feet - camYT;
        if (onScreen < TOP) camYT = feet - TOP;
        else if (onScreen > BOTTOM) camYT = feet - BOTTOM;
        // (16 Oct 2026) looking up or down: the view leans that way (see LOOK_WAIT)
        let y = camYT + (h.lookY || 0);
        x = Math.max(0, Math.min(act.w * TS - VW, x));
        y = Math.max(0, Math.min(act.h * TS - VH, y));
        return { x, y };
    }
    function snapCamera() { camLook = hero ? hero.face * 24 : 0; camYT = null; const t = camTarget(); state.cam.x = t.x; state.cam.y = t.y; }
    function stepCamera() {
        const t = camTarget();
        state.cam.x += (t.x - state.cam.x) * 0.12;
        state.cam.y += (t.y - state.cam.y) * 0.14;
    }

    /* ================================================================ THE LOOP
       A fixed step of a 60th of a second, however fast the screen draws. */
    let raf = 0, last = 0, acc = 0;
    function startLoop() { if (!raf) { last = performance.now(); acc = 0; raf = requestAnimationFrame(tick); } }
    function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function tick(now) {
        raf = requestAnimationFrame(tick);
        acc += Math.min(0.1, (now - last) / 1000);
        last = now;
        let steps = 0;
        while (acc >= 1 / 60 && steps < 6) { update(); acc -= 1 / 60; steps++; }
        draw();
    }

    function update() {
        frameNo++;
        state.t++;
        if (!act) return;
        if (state.shake > 0) state.shake--;
        state.pops = state.pops.filter(p => ++p.t < 50);
        state.parts = state.parts.filter(p => {
            p.t++; p.x += p.vx; p.y += p.vy;
            if (p.kind === "padlock") { p.vy += 0.25; return p.t < 90; }
            if (p.kind === "dust") { p.vy -= 0.01; return p.t < 24; }
            if (p.kind === "grit") return p.t < 26;
            if (p.kind === "fuse") { p.vy += 0.06; return p.t < 16; }
            if (p.kind === "bubble") { p.x += Math.sin(p.t / 5) * 0.2; return p.t < 90 && wetAt(p.x, p.y); }
            if (p.kind === "shard") { p.vy += 0.15; return p.t < 30; }
            if (p.kind === "spark") { if (p.float) { p.vy -= 0.004; p.vx += (Math.random() - 0.5) * 0.06; } else p.vy += 0.09; return p.t < p.life; }
            if (p.kind === "smoke") { p.vx *= 0.98; p.vy *= 0.985; return p.t < p.life; }
            if (p.kind === "ember" && p.drift) {
                // a lantern's: round it loosely, rising the height of it and on, wandering as it goes
                p.a += p.spin;
                p.x = p.cx + Math.cos(p.a) * p.r + Math.sin(p.t / 19 + p.ph) * 1.6;
                p.y = p.base + Math.sin(p.a) * p.r * 0.45 - p.t * 0.13 + Math.sin(p.t / 13 + p.ph) * 1.2;
                return p.t < p.life;
            }
            if (p.kind === "ember") {
                // round the flame on a ring of its own, slowly, barely rising
                p.a += p.spin;
                p.x = p.cx + Math.cos(p.a) * p.r; p.y = p.base + Math.sin(p.a) * p.r * 0.8 - p.t * 0.03;
                return p.t < p.life;
            }
            p.vy += 0.05; return p.t < 26;
        });
        for (const d of act.deco) if (d.kind === "t" && frameNo % 7 === 0) d.t = (d.t + 1) % 4;
        // (26 Oct 2026) behind another game, a life lost a moment before comes back paused (see ONE GAME IN FRONT)
        if (hushed && (state.mode === "play" || state.mode === "card")) { pause(true); return; }
        if (state.mode === "card") { if (state.t > 150) state.mode = "play"; stepCamera(); return; }
        if (state.mode === "play") {
            state.time++;
            stepMovers();
            stepCrumbles();
            if (act.icicles.length) stepIcicles();
            if (act.doors.length || act.flood || act.water.size) stepStation();
            if (TH.beat || TH.weather || act.switchers.length || act.lava.size || act.spouts.length || act.glasses.length || act.gears.length || act.burners.length || act.splashes.length || act.drips.length || act.oozes.length) stepLab();
            if (act.bumpers.length || act.springs.length) stepToys();
            if (act.nx) stepNew();
            stepHero();
            if (act.gears.length) stepCogs();
            stepTravel();
            stepCrates();
            stepHaunt();
            stepThings();
            stepLoose();
            stepFalls();
            stepDynamite();
            stepFlows();
            if (state.mode === "play") stepFoes();
            // where Scout came into this room is where a lost life puts him back
            const room = roomOf(hero);
            if (hero.ground && !hero.climb && hero.hurt === 0 && (room !== hero.room || !hero.safeSet)) { hero.room = room; hero.safe = { x: hero.x, y: hero.y - (hero.crouch ? STAND_H - CROUCH_H : 0) }; hero.safeSet = true; }
            stepCamera();
            const near = act.signs.find(s => Math.abs(hero.x + hero.w / 2 - (s.x + 8)) < 22 && Math.abs(hero.y + hero.h - (s.y + 16)) < 26);
            /* (16 Oct 2026) beside a hanging crate's rope with the knife, till the
               first rope of the passage is cut: how to cut it, on the notice the
               signposts use */
            const ropeTip = !near && act.ropeNear ? (act.ropeTip || (act.ropeTip = { text: "[CUT] CUTS THE ROPE" })) : null;
            if (near || ropeTip) { act.hint = near || ropeTip; act.hintA = Math.min(1, act.hintA + 0.12); } else act.hintA = Math.max(0, act.hintA - 0.08);
            const htx = Math.floor((hero.x + hero.w / 2) / TS), hty = Math.floor((hero.y + hero.h / 2) / TS);
            for (const cv of act.covers) cv.alpha = cv.set.has(htx + "," + hty) ? Math.max(0, cv.alpha - 0.08) : Math.min(1, cv.alpha + 0.05);
        } else if (state.mode === "dying") {
            if (act.bomb) { act.bomb.t = Math.max(act.bomb.t, FUSE - 1); stepDynamite(); }
            if (state.t > 24) { hero.vy = Math.min(FALL_MAX, hero.vy + 0.2); hero.y += hero.vy; }
            if (state.t > 110) { if (state.lives <= 0) { state.mode = "over"; state.t = 0; sfx("gameOver"); } else respawn(); }
        } else if (state.mode === "clear") stepCamera();
        else if (state.mode === "title") {
            state.titleT = (state.titleT || 0) + 1;
            // drifting slowly from one open room to the next
            const route = state.titleRoute || [{ x: 0, y: 0 }], to = route[(state.titleLeg + 1) % route.length];
            const dx = to.x - state.cam.x, dy = to.y - state.cam.y, d = Math.hypot(dx, dy);
            if (d < 1) state.titleLeg = (state.titleLeg + 1) % route.length;
            else { state.cam.x += dx / d * Math.min(d, 0.35); state.cam.y += dy / d * Math.min(d, 0.35); }
            if (state.titleT > 1500) titleAct();
        }
    }

    // a lantern's light on the wall (each lantern's own reach, brightness, flicker and colour; the theme's when not said)
    function torchGlow(d) {
        if (!(d.radius > 0 && d.intensity > 0)) return;
        /* (a candle's light breathes with its own flame: the same pulse its flame's height and its halo follow,
           its flames' together, rather than a flicker of its own; brighter as it reaches further) */
        const C = CANDLES[d.style], cp = C ? C.wicks.reduce((s, w, i) => s + lampPulse((d.x * 7 + d.y * 3) % 97 + i * 13), 0) / Math.max(1, C.wicks.length) : 0;
        const flick = C ? 1 + (cp - 0.5) * 2 * d.flicker : 1 + Math.sin(frameNo / 5 + d.x) * d.flicker, L = lampAt(d.style), [lr, lg, lb] = d.color || TH.glow;
        const gx = d.x + L.gx, gy = d.y + L.gy, R = d.radius * flick, I0 = d.intensity * (C && C.wicks.length ? 0.86 + 0.28 * cp : 1);
        const gr = g.createRadialGradient(gx, gy, 2, gx, gy, R);
        gr.addColorStop(0, `rgba(${lr},${lg},${lb},${+I0.toFixed(3)})`); gr.addColorStop(0.5, `rgba(${lr},${Math.round(lg * 0.77)},${Math.round(lb * 0.6)},${+(I0 / 3).toFixed(3)})`); gr.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
        g.fillStyle = gr;
        if (d.radius === 70) g.fillRect(d.x - 64, d.y - 72, 144, 144); else g.fillRect(gx - R - 1, gy - R - 1, R * 2 + 2, R * 2 + 2);
    }
    /* (22 Oct 2026, the owner's: "Light's glows are interrupted by walk-behind walls, meaning the hidden room isn't
       really hidden!") the lanterns' and the lights' glow is laid on the wall before the hidden rooms' covers and
       the walk-behind walls are drawn over everything, so each cut a hole in it the shape of itself. So the same
       glow is laid again over them: drawn into a picture of the view, kept only where a cover (as faded as it is)
       or a walk-behind wall is, and put on as it was the first time (the lanterns' painted, the lights' added). */
    let wallGlowCv = null, wallMaskCv = null;
    function glowOverWalls(cam) {
        const inView = (x, y, w, h) => x < cam.x + VW && x + w > cam.x && y < cam.y + VH && y + h > cam.y;
        const cvs = act.covers.filter(cv => cv.alpha > 0 && cv.canvas && inView(cv.x, cv.y, cv.canvas.width, cv.canvas.height));
        const fws = (act.fronts || []).filter(fw => inView(fw.x, fw.y, fw.canvas.width, fw.canvas.height));
        if ((!cvs.length && !fws.length) || debug.noWallGlow) return;
        if (!wallGlowCv) { wallGlowCv = document.createElement("canvas"); wallMaskCv = document.createElement("canvas"); }
        for (const c of [wallGlowCv, wallMaskCv]) if (c.width !== VW || c.height !== VH) { c.width = VW; c.height = VH; }
        const mx = wallMaskCv.getContext("2d");
        mx.setTransform(1, 0, 0, 1, 0, 0); mx.clearRect(0, 0, VW, VH); mx.translate(-cam.x, -cam.y);
        for (const cv of cvs) { mx.globalAlpha = cv.alpha; mx.drawImage(cv.canvas, cv.x, cv.y); }
        mx.globalAlpha = 1;
        for (const fw of fws) mx.drawImage(fw.canvas, fw.x, fw.y);
        const gx = wallGlowCv.getContext("2d"), kg = g;
        const pass = (paint, op) => {
            gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalCompositeOperation = "source-over"; gx.globalAlpha = 1; gx.clearRect(0, 0, VW, VH);
            gx.translate(-cam.x, -cam.y);
            g = gx; let any = false; try { any = paint(); } finally { g = kg; }
            if (!any) return;
            gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalCompositeOperation = "destination-in"; gx.drawImage(wallMaskCv, 0, 0);
            g.save(); g.globalCompositeOperation = op; g.drawImage(wallGlowCv, cam.x, cam.y); g.restore();
        };
        pass(() => {
            let any = false;
            for (const d of act.deco) {
                if (d.kind !== "t" || (d.cover && d.cover.alpha > 0.5)) continue;
                const R0 = Math.max(80, d.radius + 16);
                if (d.x < cam.x - R0 || d.x > cam.x + VW + R0 || d.y < cam.y - R0 || d.y > cam.y + VH + R0) continue;
                torchGlow(d); any = true;
            }
            return any;
        }, "source-over");
        if (act.lights.length) pass(() => { drawLights(cam, "back"); drawLights(cam, "front"); return true; }, "lighter");
    }

    /* ================================================================ THE NEW MECHANICS
       (22 Oct 2026, the owner's picks from the list of platform-game ideas: "Zipline yes. Swinging ropes and
       chandeliers, yes. Scree slopes, yes. Quicksand, yes. ... Mine cart rides, yes! ... Mummy, yes. Snakes in urns,
       yes. Ghost miner, yes ... Lighting the braziers for the Tomb ... Water you control, yes", and his answers: the
       ghost drifts after Scout, a cart rolls by itself, he carries a torch from a bracket, a mummy is stomped twice.)
       Each is an object the editor places; their state is the act's nx. */
    const newBag = () => ({ swings: [], zips: [], screes: [], sands: [], carts: [], rails: [], pools: [], sluices: [], brackets: [], gates: [], carry: null });
    const NEW_FOES = new Set(["mummy", "snake"]);
    const TORCH_LIFE = 40 * 60;
    // the objects' parts at build (false: not one of these)
    function buildNew(a, o, tx, ty) {
        const N = a.nx, t = o.type;
        if (t === "swing") {
            const kind = o.kind === "chandelier" ? "chandelier" : "rope", len = Math.max(24, o.len || (kind === "chandelier" ? 40 : 72));
            N.swings.push({ kind, ax: o.x + 8, ay: o.y, len, th: (o.angle || 0) * Math.PI / 180, om: 0, d: 0, seed: (tx * 7 + ty * 3) % 97, obj: o });
        } else if (t === "zipline") {
            const dx = o.dx === undefined ? 160 : o.dx, dy = o.dy === undefined ? 48 : o.dy, len = Math.max(16, Math.hypot(dx, dy));
            N.zips.push({ x0: o.x + 8, y0: o.y + 4, x1: o.x + 8 + dx, y1: o.y + 4 + dy, len, ux: dx / len, uy: dy / len });
        } else if (t === "scree") N.screes.push({ x: o.x, y: o.y, w: Math.max(16, o.w || 64), h: Math.max(8, o.h || 64), dir: o.dir === -1 ? -1 : 1, art: null });
        else if (t === "quicksand") N.sands.push({ x: o.x, y: o.y, w: Math.max(16, o.w || 64), h: Math.max(16, o.h || 32), t: (tx * 13) % 97 });
        else if (t === "minecart") N.carts.push({ x: o.x, y: o.y, w: 24, h: 13, vx: 0, vy: 0, dir: o.dir === -1 ? -1 : 1, speed: (o.speed > 0 ? o.speed : 2.4) * CART_PACE, ride: false, ground: false, spin: 0, cartBody: true, tiltA: 0, tiltB: 0 });
        else if (t === "rails") {
            N.rails.push({ x: o.x, y: o.y, w: Math.max(16, o.w || 64) });
            // (23 Oct 2026) the rails before they were a layer: made rail tiles along their span
            if (a.tiles && a.tiles.length) { if (!a.railRows) a.railRows = Array.from({ length: a.h }, () => Array(a.w).fill(".")); const ry = Math.floor(o.y / TS); if (a.railRows[ry]) for (let rx = Math.floor(o.x / TS); rx <= Math.floor((o.x + Math.max(16, o.w || 64) - 1) / TS); rx++) if (rx >= 0 && rx < a.w && a.railRows[ry][rx] === ".") a.railRows[ry][rx] = "-"; }
        }
        else if (t === "pool") {
            const p = { x: o.x, y: o.y, w: Math.max(16, o.w || 64), h: Math.max(16, o.h || 48), name: String(o.name || ""), keys: new Set() };
            p.drop = Math.max(0, Math.min(p.h, o.drop >= 0 ? o.drop : p.h));
            p.level = o.low ? p.y + p.drop : p.y; p.want = p.level;
            N.pools.push(p); poolWater(a, p);
        }
        else if (t === "sluice") N.sluices.push({ x: o.x, y: o.y, pool: String(o.pool || ""), on: false, swing: 0 });
        else if (t === "torchbracket") N.brackets.push({ x: o.x, y: o.y, burn: o.burn > 0 ? o.burn * 60 : TORCH_LIFE, t: (tx * 5) % 4 });
        else if (t === "firegate") {
            const g = { tx, ty, x: tx * TS, y: ty * TS, group: String(o.group || ""), open: 0, opening: false };
            for (let j = 0; j < 3; j++) if (a.tiles[ty + j] && a.tiles[ty + j][tx] !== undefined) a.tiles[ty + j][tx] = "■";
            N.gates.push(g);
        }
        else return false;
        return true;
    }

    /* ---- WATER YOU CONTROL: a pool (a box), its surface between its top (high) and drop below it (low), moved by a
       sluice lever named for it. Its water is the passage's own (act.water, act.waterTop), so swimming, the air
       count and the drawing all hold for it as for any water. */
    function poolWater(a, p) {
        const tx0 = Math.floor(p.x / TS), tx1 = Math.floor((p.x + p.w - 1) / TS), ty0 = Math.floor(p.y / TS), ty1 = Math.floor((p.y + p.h - 1) / TS);
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
            const k = tx + "," + ty, top = ty * TS, bot = top + TS;
            if (p.level >= bot - 0.5) { if (p.keys.has(k)) { a.water.delete(k); a.waterTop.delete(k); p.keys.delete(k); } continue; }
            a.water.add(k); p.keys.add(k);
            if (p.level <= top) a.waterTop.delete(k); else a.waterTop.set(k, p.level);
        }
    }
    function stepPools() {
        const N = act.nx;
        for (const p of N.pools) {
            if (Math.abs(p.want - p.level) < 0.01) { if (p.moving) { p.moving = false; sfx("rush", 0); } continue; }
            p.level += Math.sign(p.want - p.level) * Math.min(0.4, Math.abs(p.want - p.level));
            poolWater(act, p);
            p.moving = true; sfx("rush", 0.35);
        }
        for (const s of N.sluices) s.swing += ((s.on ? 1 : 0) - s.swing) * 0.25;
    }
    // up in front of a lever pulls it: its pool's water goes to its other line
    function useLever(h) {
        const s = act.nx.sluices.find(q => Math.abs(h.x + h.w / 2 - (q.x + 8)) < 12 && h.y + h.h > q.y && h.y < q.y + TS + 4);
        if (!s) return false;
        s.on = !s.on;
        for (const p of act.nx.pools) if (p.name === s.pool) p.want = Math.abs(p.want - p.y) < 0.5 ? p.y + p.drop : p.y;
        sfx("pauseBlip"); dust(s.x + 8, s.y + 12, 2);
        return true;
    }

    /* ---- SCREE: loose rock heaped in a slope, from the box's top on its high side down to its bottom on its low
       (dir: the way down). Standing on it he slides down it, faster and faster, and cannot walk back up it; a jump
       is the only way off but its foot. Carts roll down it too, gathering speed. */
    const screeY = (s, px) => s.y + s.h * (s.dir > 0 ? (px - s.x) : (s.x + s.w - px)) / s.w;
    function screeUnder(b, f0, f1) {
        const cx = b.x + b.w / 2;
        // (23 Oct 2026) a slope tile holds him while either foot is on it, the highest of them under him: off its foot onto the floor with no drop
        if (act.slopes) {
            let best = null;
            for (const s of act.nx.screes) {
                if (!s.tile || b.x + b.w - 1 < s.x || b.x + 1 > s.x + s.w) continue;
                const sy = screeY(s, Math.max(s.x, Math.min(s.x + s.w, s.dir > 0 ? b.x + 1 : b.x + b.w - 1)));
                if (f0 <= sy + 0.01 && f1 >= sy - 0.01 && (!best || sy < best.y)) best = { y: sy, s };
            }
            if (best) return best;
        }
        for (const s of act.nx.screes) {
            if (s.tile || cx < s.x || cx > s.x + s.w) continue;
            // (the slope where his uphill foot is: at its top he is clear of the ledge's corner it starts from)
            const sy = screeY(s, Math.max(s.x, Math.min(s.x + s.w, s.dir > 0 ? b.x + 1 : b.x + b.w - 1)));
            if (f0 <= sy + 0.01 && f1 >= sy - 0.01) return { y: sy, s };
        }
        return null;
    }
    function screePush(h, dir) {
        const s = h.onScree; if (!s) return;
        // (its own speed down it, gathering, whatever he presses: pressing back up it only slows the gathering)
        const down = s.dir, steep = Math.min(1.6, s.h / s.w);
        h.screeV = Math.min(3.4, Math.max(Math.abs(h.vx) * (Math.sign(h.vx) === down ? 1 : 0), h.screeV || 0) + (0.06 + 0.07 * steep) * (dir === -down ? 0.5 : 1));
        h.vx = down * h.screeV;
        h.runT = 0;
        if (frameNo % 3 === 0) state.parts.push({ kind: "grit", x: h.x + h.w / 2 - down * 4, y: h.y + h.h - 1, vx: down * (0.6 + Math.random()), vy: -0.6 - Math.random() * 0.8, t: 0 });
        if (frameNo % 10 === 0) sfx("crawl");
    }

    /* ---- QUICKSAND: a box of it. In it he sinks slowly, can barely move, and only jumping keeps him up (a weaker
       jump the deeper he is); over his head is the end of him. */
    function sandStep(h, wantJump) {
        const cx = h.x + h.w / 2, feet = h.y + h.h, s = act.nx.sands.find(q => cx > q.x && cx < q.x + q.w && feet > q.y && h.y < q.y + q.h);
        if (!s) { h.sand = 0; return; }
        const depth = feet - s.y;
        if (!h.sand && h.vy > 1) { for (let i = 0; i < 6; i++) state.parts.push({ kind: "grit", x: cx + (Math.random() - 0.5) * 10, y: s.y, vx: (Math.random() - 0.5) * 1.6, vy: -1 - Math.random() * 1.4, t: 0 }); sfx("land", true); }
        h.sand = depth;
        h.vx = Math.max(-0.7, Math.min(0.7, h.vx));
        if (wantJump && depth > 0) {
            pressedAt.jump = pressedAt.up = -99;
            h.vy = -JUMP_V * Math.max(0.42, 0.9 - depth / 30); h.leap = 4;
            sfx("jump"); for (let i = 0; i < 4; i++) state.parts.push({ kind: "grit", x: cx + (Math.random() - 0.5) * 8, y: s.y, vx: (Math.random() - 0.5) * 1.2, vy: -0.8 - Math.random(), t: 0 });
        } else if (h.vy > 0) h.vy = 0.08 + Math.min(0.06, depth / 400);   // (four to five seconds from his feet to over his hat)
        if (h.y > s.y + 4 && state.mode === "play") die();
    }

    /* ---- THE SWINGS: a rope from the roof, and a chandelier on a chain, each a pendulum. A rope catches him
       where he meets it (up and down it to climb); a chandelier's hoop he hangs from. Left and right pump the
       swing, a jump lets go flying with all its speed; down at a rope's end drops off. */
    const swingAt = (s, d) => ({ x: s.ax + Math.sin(s.th) * d, y: s.ay + Math.cos(s.th) * d });
    const CHANDELIER_HANG = 37;   // (straight down from the chain's end, the ring, to under the hoop, where his hands are: the chandelier hangs upright)
    const hoopAt = s => { const e = swingAt(s, s.len); return { x: e.x, y: e.y + CHANDELIER_HANG }; };
    /* (22 Oct 2026, the owner's: "make it more of a natural swing", "it also can swing way too fast, make sure it's
       natural") a pendulum at the pace of a real one, not at the pace of his jumps: SWING_G is the pull on it, so a
       rope of 5 tiles swings there and back in under four seconds, no faster at the bottom than he runs. Pushing
       the way it is going builds it up, slowly, swing by swing (from still, some seven seconds to 40 degrees; a
       running catch starts it well on its way); pushing against it brakes it; the air drags on it the more the
       faster it goes, so pumped steadily it settles at about 48 degrees rather than going on up. Without him it sways a
       little in the draught and settles. */
    const SWING_G = 0.07;
    function stepSwings() {
        for (const s of act.nx.swings) {
            const riding = hero.ride && hero.ride.s === s, L = s.kind === "chandelier" ? s.len + CHANDELIER_HANG : s.len;
            s.om += -(SWING_G / L) * Math.sin(s.th);
            if (riding) s.om *= 1 - (0.0008 + 9 * s.om * s.om);
            else { s.om *= 0.991; s.om += 0.00003 * Math.sin(frameNo / 97 + s.seed); }
            const cap = s.kind === "chandelier" ? 0.8 : 1.05;
            s.th += s.om;
            if (Math.abs(s.th) > cap) { s.th = Math.sign(s.th) * cap; s.om *= -0.3; }
        }
    }
    // a swing's pump: with it, more; against it, a brake; from still, a start
    function pumpSwing(s, dir) {
        if (!dir) return;
        const k = s.kind === "chandelier" ? 0.6 : 1;
        if (Math.abs(s.om) < 0.0015) s.om += dir * 0.0002 * k;
        else if (Math.sign(s.om) === dir) s.om += dir * 0.0001 * k * Math.cos(s.th);
        else s.om *= 0.975;
    }
    function tryGrab(h, U) {
        if (h.ground || h.climb || h.ride || h.cart || h.swim || h.mantle || state.mode !== "play") return false;
        const N = act.nx, hx = h.x + h.w / 2, hy = h.y + 2;
        for (const s of N.swings) {
            if (h.letGoSwing === s && h.letGo > 0) continue;
            if (s.kind === "rope") {
                // (the owner's: "can't climb up it, only hold onto the bottom") his hands near its end, over the knot
                const ux = Math.sin(s.th), uy = Math.cos(s.th), px = hx - s.ax, py = hy - s.ay, d = px * ux + py * uy;
                if (d < s.len - 18 || d > s.len + 6) continue;
                if (Math.abs(px * uy - py * ux) > 7) continue;
                h.ride = { kind: "swing", s, d: s.len - ROPE_GRIP };
            } else {
                const e = hoopAt(s);
                if (Math.abs(hx - e.x) > 12 || Math.abs(hy - e.y) > 9) continue;
                h.ride = { kind: "swing", s, d: s.len };
            }
            // his own speed carried into the swing (not all of it: his weight takes the rope with him, and the rope gives)
            const d = s.kind === "chandelier" ? s.len + CHANDELIER_HANG : h.ride.d, tang = h.vx * Math.cos(s.th) - h.vy * Math.sin(s.th);
            s.om = Math.max(-0.022, Math.min(0.022, s.om + tang / Math.max(20, d) * 0.35));
            h.vx = h.vy = 0; sfx("climb");
            return true;
        }
        for (const z of N.zips) {
            if (h.letGoZip === z && h.letGo > 0) continue;
            const px = hx - z.x0, py = (h.y + 2) - z.y0, s = px * z.ux + py * z.uy, off = px * z.uy - py * z.ux;
            // (23 Oct 2026, the owner's: grabbed when he jumps to it, up not needed: the reach up held gave, always)
            if (s < 6 || s > z.len - 6 || off > 4 || off < -14) continue;
            // his speed along it carried on, else it sets him going downhill
            let v = h.vx * z.ux + h.vy * z.uy;
            if (Math.abs(z.uy) > 0.05 && Math.sign(v) !== Math.sign(z.uy) * 1) v = Math.sign(z.uy) * Math.max(0.6, Math.abs(v) * 0.3);
            h.ride = { kind: "zip", z, s, v };
            h.vx = h.vy = 0; sfx("climb");
            return true;
        }
        return false;
    }
    function stepRide(h, dir, U, Dn, wantJump) {
        const r = h.ride;
        h.ground = false; h.anim += 0.08;
        const letGo = (vx, vy) => { h.ride = null; h.vx = vx; h.vy = vy; h.letGo = 16; h.airTop = Math.max(RUN_MAX, Math.min(4, Math.abs(vx))); h.leap = 6; };
        if (r.kind === "swing") {
            const s = r.s;
            pumpSwing(s, dir);
            // he faces the way it swings; his hands on it (his sprite's rows 0-2: his y is his hands' + 3)
            if (Math.abs(s.om) > 0.002) h.face = Math.sign(s.om); else if (dir) h.face = dir;
            const p = s.kind === "chandelier" ? hoopAt(s) : swingAt(s, r.d), nx = p.x - h.w / 2, ny = p.y + 3;
            if (overlapsSolid(h, nx, ny, h.w, h.h)) { s.om *= -0.35; s.th += s.om * 2; }
            else { h.x = nx; h.y = ny; }
            const L = s.kind === "chandelier" ? s.len + CHANDELIER_HANG : r.d, vx = L * s.om * Math.cos(s.th), vy = -L * s.om * Math.sin(s.th);
            if (wantJump) { pressedAt.jump = pressedAt.up = -99; h.letGoSwing = s; letGo(Math.max(-4, Math.min(4, vx * 1.15)), Math.min(vy, 0) - 2.4); sfx("jump"); }
            else if (Dn && recently("down", 1)) { h.letGoSwing = s; letGo(vx, Math.max(0, vy)); }
            return;
        }
        // the zipline: down it under its own weight, or along a level one hand over hand
        const z = r.z;
        if (Math.abs(z.uy) > 0.05) { r.v += GRAVITY * z.uy * 0.55; r.v *= 0.996; }
        else r.v += ((dir || 0) * 1.1 - r.v) * 0.2;
        r.v = Math.max(-5, Math.min(5, r.v));
        r.s += r.v;
        if (r.v) h.face = Math.sign(r.v * z.ux) || h.face;
        const px = z.x0 + z.ux * r.s, py = z.y0 + z.uy * r.s, nx = px - h.w / 2, ny = py + 4;
        if (r.s <= 4 || r.s >= z.len - 4 || overlapsSolid(h, nx, ny, h.w, h.h)) { h.letGoZip = z; letGo(r.v * z.ux, r.v * z.uy); return; }
        h.x = nx; h.y = ny;
        if (frameNo % 5 === 0 && Math.abs(r.v) > 1.5) state.parts.push({ kind: "spark", x: px, y: py - 1, vx: -r.v * z.ux * 0.3 + (Math.random() - 0.5), vy: -Math.random(), t: 0, life: 12, col: "#ffd890" });
        if (wantJump) { pressedAt.jump = pressedAt.up = -99; h.letGoZip = z; letGo(r.v * z.ux, r.v * z.uy - 2.4); sfx("jump"); }
        else if (Dn && recently("down", 1)) { h.letGoZip = z; letGo(r.v * z.ux, Math.max(0, r.v * z.uy)); }
    }

    /* ---- THE MINE CART: stands still till he gets in (dropping into it, or up or down beside it), then rolls off
       by itself its way, faster downhill (scree); left and right lean it faster or slower, a jump jumps it and
       him; into a wall it stops (hard, and he is thrown out), a low beam knocks him out of it. Stopped, a jump or
       up gets him out. */
    /* (23 Oct 2026, the owner's: "we want good movement physics, so make sure if the mine cart hits the end buffers at
       speed, scout gets throw out into the air") THROWN OUT: the cart stopped dead under him, he carries on, up and
       out over its front, as fast as it was going, the way it was going, with no say in it for a moment. */
    /* CALMER (23 Oct 2026, the owner's: "the mine cart moves slightly too fast, and therefore jumping out the mine cart and
       when the mine cart crashes at the end of a rail, all feels overly chaotic"): every cart a little over a fifth slower
       than its level says (CART_PACE: the levels' own 2.4 kept), leaning on it adding less, slopes pulling less, never past 4
       (it had reached 6 down a slope); thrown out more gently, flung off a rail's end with less hop and spin, its bounces
       lower. Its jump the same, for the gaps. */
    const CART_PACE = 0.78;
    const BUFFER_THROW = 1.0;   // (buffers: all but a crawl throws him)
    const THROW_V = 2.3;   // (its own speed, 2.4 × the pace, stops him safely; leant on, or downhill, it throws him)
    function throwOut(c, v, hurtToo, vy) {
        const h = hero;
        h.cart = null; c.ride = false;
        h.x = c.x + 7; h.y = c.y - 20;
        if (overlapsSolid(h, h.x, h.y, h.w, h.h)) h.y = c.y - 12;
        h.vx = v * 0.8; h.vy = vy !== undefined ? vy : -(2.6 + Math.abs(v) * 0.4); h.face = Math.sign(v) || h.face;
        h.ground = false; h.coyote = 0; h.wallLock = 16; h.airTop = Math.abs(h.vx); h.runT = 0;
        h.offCart = c; h.offCartT = 60;
        state.shake = 5; sfx("clang"); sfx("whoosh");
        if (hurtToo) hurt();
    }
    // a cart brought to a stop against something: sparks, a jolt, and him thrown out if it was going fast enough
    function cartStruck(c, was, ridden, hurtToo, at) {
        const T = at || THROW_V;
        sfx("land", Math.abs(was) < T); state.shake = Math.abs(was) > T ? 4 : 2;
        for (let i = 0; i < 6; i++) state.parts.push({ kind: "spark", x: c.x + (was > 0 ? c.w : 0), y: c.y + 6, vx: -Math.sign(was) * Math.random() * 2, vy: -Math.random() * 2, t: 0, life: 18, col: "#ffd060" });
        if (ridden && Math.abs(was) > T) throwOut(c, was, hurtToo);
    }
    /* A CART OFF ITS RAILS (23 Oct 2026, the owner's: "The cart needs some movement physics as well, it should tumble,
       'bounce' off surfaces etc."): turning over in the air as it was flung; coming down hard it bounces, up a little less
       each time, slower, its turning knocked about; on the ground and slow it rocks down onto whichever way up it is
       nearer, on its wheels or upturned, and lies there. */
    function cartTumble(c, fell) {
        c.rot = (c.rot || 0) + (c.av || 0);
        if (c.ground && fell > 1.4) {
            c.vy = -fell * 0.3; c.ground = false; c.y -= 1; c.vx *= 0.7; c.av = -(c.av || 0) * 0.35 + c.vx * 0.025;
            sfx("land", fell < 3); if (fell > 2.5) sfx("clang"); state.shake = Math.min(4, Math.round(fell)); dust(c.x + c.w / 2, c.y + c.h, 4);
            for (let i = 0; i < 4; i++) state.parts.push({ kind: "spark", x: c.x + 4 + Math.random() * 16, y: c.y + c.h, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.5, t: 0, life: 12, col: "#ffd060" });
        } else if (c.ground) {
            const rest = Math.round(c.rot / Math.PI) * Math.PI;
            c.av *= 0.6; c.rot += (rest - c.rot) * 0.18; if (Math.abs(rest - c.rot) < 0.01) { c.rot = rest; c.av = 0; }
        }
    }
    function stepCarts(dir, U, Dn, wantJump) {
        const h = hero;
        for (const c of act.nx.carts) {
            if (!c.settled) { c.settled = true; settleCart(c); }   // (out of a slope it was put in, onto its line)
            const ridden = h.cart === c;
            if (ridden) c.used = true;
            /* rolling (23 Oct 2026, momentum): downhill it gathers speed and uphill it loses it, whatever he does; his
               weight forward keeps it rolling up to its speed and a little past, back on it brakes it. Slopes: scree
               and a steep slope's tile pull hardest, a gentle one less. */
            const pull = c.onScree ? c.onScree.dir * (c.onScree.tile ? (c.onScree.walk ? 0.045 : 0.1) : 0.068) : 0;
            if (c.ground && ridden && !c.dug && !c.loose) {
                const want = c.dir * c.speed * (dir === c.dir ? 1.3 : 1);
                if (dir === -c.dir) c.vx *= 0.96;
                else if (c.vx * c.dir < Math.abs(want)) c.vx += (want - c.vx) * 0.035;
                c.vx = (c.vx + pull) * 0.998;
                if (wantJump && Math.abs(c.vx) > 0.4) { pressedAt.jump = pressedAt.up = -99; c.vy = -JUMP_V * 0.95; sfx("jump"); }
            } else if (c.ground && c.loose) { c.vx *= 0.84; if (Math.abs(c.vx) < 0.05) c.vx = 0; if (c.railed) c.loose = false; }   // (off its rails: skidding to a stop)
            else if (c.ground && !c.used) c.vx = 0;   // (23 Oct 2026) parked where it was put, chocked, till he first gets in: not rolled away down a slope before he comes
            else if (c.ground) { if (c.dug) c.vx *= 0.5; c.vx *= pull ? 0.99 : 0.94; c.vx += pull; if (Math.abs(c.vx) < 0.02 && !pull) c.vx = 0; }
            c.vx = Math.max(-4, Math.min(4, c.vx));
            c.vy = Math.min(FALL_MAX, c.vy + GRAVITY);
            const was = c.vx;
            /* ON RAILS (the rails layer): buffers at a rail's end stop it dead; past a rail's broken end (or its end
               with nothing there) it comes off them and its wheels dig in. Off a ledge it simply falls. */
            const front = c.vx > 0 ? c.x + c.w - 5 : c.x + 5, feet = c.y + c.h;   // (its leading wheel)
            const railNow = act.railRows && c.ground ? railUnder(front, feet) : null;
            if (railNow && railNow.ch === "b" && c.vx) {
                const d = Math.sign(c.vx), open = d > 0 ? !railNow.R : !railNow.L;
                if (open) {
                    const face = d > 0 ? railNow.tx * TS + TS - BUFFER_FACE : railNow.tx * TS + BUFFER_FACE;
                    if (d > 0 ? c.x + c.w + c.vx >= face : c.x + c.vx <= face) {
                        c.x = d > 0 ? face - c.w : face; c.vx = -was * 0.12;
                        cartStruck(c, was, ridden, false, BUFFER_THROW);   // (23 Oct 2026, the owner's: buffers stop it dead and throw him forwards, into the air)
                        moveY(c, c.vy, false); c.spin += c.vx / 4;
                        continue;
                    }
                }
            }
            if (act.railRows && c.ground && c.railed && !railNow && Math.abs(c.vx) > 0.2) {
                /* OFF THE END OF THE RAILS (23 Oct 2026, the owner's: "at the end of a sloped rail, have the cart fling off the
                   tracks (if no end buffers), and scout comes out the cart too, being thrown with momentum from the
                   cart's movement on the rails"): it leaves them the way it was going, as fast, along the rails' own
                   slope, with a jolt up off them; loose, it skids to a stop where it comes down. He is thrown out with it. */
                const grad = ((c.tiltB || 0) - (c.tiltA || 0)) / 13, v = c.vx, vy = v * grad - 0.9;   // (grad: the rails' fall a pixel along to the right)
                c.railed = false; c.loose = true; c.ground = false; c.onScree = null; c.vy = vy + 0.6; c.vx = v * 0.75; c.y -= 1;
                c.av = Math.sign(v || 1) * (0.07 + Math.min(0.08, Math.abs(v) * 0.015)); c.rot = c.rot || 0;   // (tumbling, its nose over the way it was going)
                sfx("clang"); state.shake = 3;
                for (let i = 0; i < 8; i++) state.parts.push({ kind: "spark", x: front, y: feet - 2, vx: Math.sign(v) * Math.random() * 2, vy: -Math.random() * 2, t: 0, life: 16, col: "#ffd060" });
                // (23 Oct 2026, the owner's: they fell the same way and he looked still in it: so he springs up out of it, higher and further, the cart dropping away under him)
                if (ridden && Math.abs(v) > 0.6) { throwOut(c, v * 0.95, false, Math.min(-3.1, vy - 2.6)); hero.y = c.y - 24; }
            }
            if (c.ground) c.railed = Boolean(act.railRows && (railUnder(c.x + 5, feet) || railUnder(c.x + c.w - 5, feet)));
            moveX(c, c.vx);
            if (c.vx === 0 && Math.abs(was) > 0.3 && c.loose) { c.vx = -was * 0.3; c.av = -(c.av || 0) * 0.5; sfx("clang"); dust(c.x + (was > 0 ? c.w : 0), c.y + 6, 3); }   // (loose: off the wall, back the way it came)
            else if (c.vx === 0 && Math.abs(was) > 0.3) cartStruck(c, was, ridden, false);   // (23 Oct 2026, the owner's: a wall hit no longer hurts him, "that seems unintuitive")
            const fell = c.vy;
            moveY(c, c.vy, false);
            c.ground = c.ground || false;
            if (c.loose) cartTumble(c, fell);
            else if (c.ground && fell > 3) { sfx("land", false); dust(c.x + c.w / 2, c.y + c.h, 3); }
            c.spin += c.vx / 4;
            // (23 Oct 2026) on a slope, or going over its brow: each wheel down to the ground under it, the cart tilted between them
            { const f = c.y + c.h; c.tiltA = groundAt(c.x + 5, f) - f; c.tiltB = groundAt(c.x + c.w - 6, f) - f; }
            if (ridden && h.cart) {
                // his head against a low roof: knocked out of it (not hurt, since 23 Oct 2026)
                if (overlapsSolid(h, c.x + 7, c.y - 16, h.w, 18)) { h.cart = null; c.ride = false; h.x = c.x + 7; h.y = c.y - 10; h.vx = -c.vx * 0.3; h.vy = 0; h.offCart = c; h.offCartT = 45; sfx("clang"); state.shake = 4; }
                else if (c.y > act.h * TS + 32) { h.cart = null; c.ride = false; }
            }
            if (ridden && Math.abs(c.vx) > 1.2 && frameNo % 4 === 0 && c.ground) state.parts.push({ kind: "spark", x: c.x + (c.vx > 0 ? 4 : c.w - 4), y: c.y + c.h, vx: -Math.sign(c.vx) * Math.random(), vy: -Math.random() * 1.2, t: 0, life: 10, col: "#ffe080" });
        }
        // getting in: dropping into one, or up or down beside one
        if (h.offCartT > 0) h.offCartT--;
        if (!h.cart && !h.ride && !h.climb && state.mode === "play") for (const c of act.nx.carts) {
            if (h.offCart === c && h.offCartT > 0) continue;
            if (c.loose) continue;   // (off its rails, wrecked where it fell)
            const over = h.x + h.w / 2 > c.x + 2 && h.x + h.w / 2 < c.x + c.w - 2, feet = h.y + h.h;
            if (over && ((h.vy > 0 && feet >= c.y - 2 && feet <= c.y + 8) || ((U || Dn) && h.ground && Math.abs(feet - (c.y + c.h)) < 6 && recently(U ? "up" : "down", 2)))) {
                pressedAt.up = pressedAt.down = -99; h.cart = c; c.ride = true; h.vx = h.vy = 0; h.crouch = false; h.h = STAND_H; sfx("land", true); break;
            }
        }
    }
    function stepCartRider(h, U, wantJump) {
        const c = h.cart;
        h.x = c.x + 7; h.y = c.y - 16 + Math.round(((c.tiltA || 0) + (c.tiltB || 0)) / 2); h.vx = c.vx; h.vy = c.vy; h.ground = false; h.face = c.vx ? Math.sign(c.vx) : c.dir;
        // stopped: out of it
        if (Math.abs(c.vx) <= 0.4 && c.ground && (wantJump || recently("up", BUFFER))) {
            // (out over its back end, the way it came, and not straight back into it)
            pressedAt.jump = pressedAt.up = -99; h.cart = null; c.ride = false; c.vx = 0; h.vy = -JUMP_V * 0.85; h.vx = -c.dir * 1.3; h.face = -c.dir; h.offCart = c; h.offCartT = 45; sfx("jump");
        }
    }

    /* ---- THE TORCH (the Tomb's): one taken off its bracket burns for a while (the bracket's burn) and is out;
       held to a lit brazier it burns afresh, to an unlit one it lights it. Under water it goes out. A group of
       braziers all lit opens its fire gate. */
    function stepTorch() {
        const N = act.nx, h = hero;
        for (const b of N.brackets) if (hit(h, { x: b.x + 2, y: b.y + 2, w: 12, h: 14 }) && (!N.carry || N.carry.life < N.carry.max * 0.8)) {
            N.carry = { life: b.burn, max: b.burn }; sfx("checkpoint"); sparkle(b.x + 8, b.y + 4, "#ffd060", 6);
        }
        const c = N.carry;
        if (c) {
            c.life--;
            if (wetAt(h.x + h.w / 2, h.y + 8)) c.life = 0;
            const hand = torchHand(h);
            for (const b of act.braziers) if (Math.hypot(hand.x - (b.x + 8), hand.y - (b.y + 4)) < 14) {
                if (b.lit) c.life = c.max;
                else if (c.life > 0) { b.lit = true; state.score += 50; sfx("checkpoint"); sparkle(b.x + 8, b.y + 6, "#ffd060", 10); }
            }
            if (c.life <= 0) { N.carry = null; for (let i = 0; i < 6; i++) state.parts.push({ kind: "smoke", x: hand.x, y: hand.y - 6, vx: (Math.random() - 0.5) * 0.4, vy: -0.4 - Math.random() * 0.4, t: 0, life: 40 }); sfx("pauseBlip"); }
        }
        for (const g of N.gates) {
            if (!g.opening && g.group) {
                const mine = act.braziers.filter(b => b.group === g.group);
                if (mine.length && mine.every(b => b.lit)) { g.opening = true; sfx("checkpoint"); state.shake = 8; }
            }
            if (g.opening && g.open < 1) {
                g.open = Math.min(1, g.open + 1 / 90);
                if (frameNo % 4 === 0) dust(g.x + 3 + Math.random() * 10, g.y + 48 - 48 * g.open, 1);
                if (g.open >= 1) for (let j = 0; j < 3; j++) if (act.tiles[g.ty + j]) act.tiles[g.ty + j][g.tx] = ".";
            }
        }
    }
    const torchHand = h => ({ x: h.face > 0 ? h.x + h.w + 1 : h.x - 2, y: h.y + 11 });

    /* ---- THE NEW CREATURES' ways. THE MUMMY walks as a rat does (stomped once it falls to a crawling half, the
       second finishes it); THE SNAKE IN ITS URN rattles it when Scout comes near, strikes up and out at him, and
       draws back (its head, out, can be stomped). (The ghost miner that drifted after him through the rock: scrapped,
       23 Oct 2026.) */
    function stepNewFoe(f) {
        const h = hero;
        if (f.kind === "snake") {
            const near = Math.abs(h.x + h.w / 2 - (f.x + 8)) < 46 && h.y + h.h > f.y - 34 && h.y < f.y + 16;
            f.t++;
            if (f.st === "rest") { if (near && f.cd <= 0) { f.st = "rattle"; f.t = 0; sfx("fuse"); } }
            else if (f.st === "rattle") { if (f.t > 26) { f.st = "out"; f.t = 0; f.lean = Math.sign(h.x + h.w / 2 - (f.x + 8)) || 1; sfx("pauseBlip"); } }
            else if (f.st === "out") { f.out = Math.min(1, f.out + 0.14); if (f.t > 46) { f.st = "back"; f.t = 0; } }
            else if (f.st === "back") { f.out = Math.max(0, f.out - 0.08); if (f.out <= 0) { f.st = "rest"; f.cd = 70; } }
            if (f.cd > 0) f.cd--;
            return;
        }
    }
    // a touch: what it does to him, and he to it
    function newFoeHit(f, h) {
        if (f.kind === "snake") {
            if (f.out < 0.35) return;
            const hd = snakeHead(f), box = { x: hd.x, y: hd.y, w: 8, h: 5 }, neck = { x: f.x + 6, y: hd.y + 4, w: 4, h: f.y - hd.y - 2 };
            if (!hit(h, box) && !hit(h, neck)) return;
            const onTop = h.vy > 0.2 && h.y + h.h - h.vy <= hd.y + 4;
            if (onTop) { f.alive = false; f.deadT = 0; h.vy = held.has("jump") ? -JUMP_V : -STOMP_BOUNCE; state.score += 150; sfx("stomp"); pop(f.x + 8, hd.y, "150"); sparkle(hd.x + 4, hd.y + 2, "#9ad06a", 8); }
            else hurt();
            return;
        }
        // the mummy
        if (!hit(h, { x: f.x + 2, y: f.y + 2, w: f.w - 4, h: f.h - 3 })) return;
        const onTop = h.vy > 0.2 && h.y + h.h - h.vy <= f.y + 6;
        if (onTop && f.stomp) {
            h.vy = held.has("jump") ? -JUMP_V : -STOMP_BOUNCE; sfx("stomp");
            if (f.half) { f.alive = false; f.deadT = 0; state.score += 200; pop(f.x + f.w / 2, f.y, "200"); for (let i = 0; i < 10; i++) state.parts.push({ kind: "dust", x: f.x + Math.random() * f.w, y: f.y + Math.random() * f.h, vx: (Math.random() - 0.5) * 1.4, vy: -Math.random(), t: 0 }); }
            else { f.half = true; f.y += 14; f.h = 10; f.w = 20; f.x -= 3; f.vx = Math.sign(f.vx || -1) * 0.2 * f.sp; state.score += 50; pop(f.x + f.w / 2, f.y - 8, "50"); for (let i = 0; i < 6; i++) state.parts.push({ kind: "dust", x: f.x + Math.random() * f.w, y: f.y, vx: (Math.random() - 0.5), vy: -Math.random(), t: 0 }); }
        } else hurt();
    }
    // (its head at full stretch: a tile out over the urn's rim towards him, at his chest's height, just over the rim)
    const snakeHead = f => { const e = f.out, k = e * e * (3 - 2 * e); return { x: Math.round(f.x + 4 + f.lean * 20 * k), y: Math.round(f.y - 2 - 8 * k) }; };

    // per frame: all of it (before Scout's own step)
    function stepNew() {
        const N = act.nx, U = held.has("up"), Dn = held.has("down"), dir = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0), wantJump = recently("jump", BUFFER);
        if (N.pools.length || N.sluices.length) stepPools();
        if (N.swings.length) stepSwings();
        if (N.carts.length) stepCarts(dir, U, Dn, wantJump);
        if (N.brackets.length || N.carry || N.gates.length) stepTorch();
    }

    /* ---------------------------------------------------------------- DRAWING THEM */
    function drawChainLine(x0, y0, x1, y1) {
        const I = RIG_MINE.iron, n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let i = 0; i <= n; i++) { const t = i / n; g.fillStyle = i % 3 === 0 ? I[1] : i % 3 === 1 ? I[3] : I[2]; g.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1); }
    }
    const plate = (x, y) => { const I = RIG_MINE.iron; g.fillStyle = I[0]; g.fillRect(x - 3, y, 7, 2); g.fillStyle = I[3]; g.fillRect(x - 2, y, 5, 1); };
    function screeArt(s) {
        if (s.art) return s.art;
        const c = document.createElement("canvas"); c.width = s.w; c.height = s.h + TS; const x = c.getContext("2d");
        // the zone's own rock, cut to the slope
        const tx0 = Math.floor(s.x / TS), ty0 = Math.floor(s.y / TS);
        for (let ty = ty0; ty * TS < s.y + s.h + TS; ty++) for (let tx = tx0; tx * TS < s.x + s.w; tx++) { try { drawWall(x, act, tx, ty, s.x, s.y); } catch (e) { /* edge */ } }
        x.globalCompositeOperation = "destination-in"; x.beginPath();
        if (s.dir > 0) { x.moveTo(0, 0); x.lineTo(s.w, s.h); x.lineTo(s.w, s.h + TS); x.lineTo(0, s.h + TS); }
        else { x.moveTo(s.w, 0); x.lineTo(0, s.h); x.lineTo(0, s.h + TS); x.lineTo(s.w, s.h + TS); }
        x.closePath(); x.fill(); x.globalCompositeOperation = "source-over";
        // the loose stones heaped along it: a band of pebbles, lit on top, a dark seam under
        const cols = ["#8e8478", "#6e665c", "#4c463f", "#b2a898"];
        for (let px = 0; px < s.w; px++) {
            const sy = (s.dir > 0 ? px : s.w - px) * s.h / s.w;
            for (let j = 0; j < 5; j++) { const hsh = hashTile(px * 3 + s.x, j * 7 + s.y); if (j > 0 && hsh < 0.25) continue; x.fillStyle = j === 0 ? cols[3] : j === 4 ? "rgba(0,0,0,0.35)" : cols[Math.floor(hsh * 3)]; x.fillRect(px, Math.round(sy) + j, 1, 1); }
            if (hashTile(px, s.y) > 0.86) { x.fillStyle = cols[3]; x.fillRect(px, Math.round(sy) - 1, 1, 1); }
        }
        s.art = c; return c;
    }
    // the sand's grain, once for each box: lighter at the top, dark in its depths, dithered with lighter and darker grains
    function sandArt(s) {
        if (s.art) return s.art;
        const c = document.createElement("canvas"); c.width = s.w; c.height = s.h; const x = c.getContext("2d");
        const bands = ["#e9c07a", "#ddae62", "#d09e54", "#c08c46", "#a8763a", "#8a5e2e"];
        for (let y = 0; y < s.h; y++) for (let px = 0; px < s.w; px++) {
            const k = Math.min(bands.length - 1, Math.floor((y / s.h) * (bands.length - 1) + hashTile(px + s.x, y + s.y) * 0.9));
            const hs = hashTile(px * 7 + s.x, y * 5 + s.y);
            x.fillStyle = hs > 0.93 ? "#f4d698" : hs < 0.06 ? "#9a6a34" : bands[k];
            x.fillRect(px, y, 1, 1);
        }
        s.art = c; return c;
    }
    function drawSand(s) {
        g.drawImage(sandArt(s), s.x, s.y);
        // the pull of it: faint rings drawn in toward its middle, slowly, one after another
        const mid = s.x + s.w / 2;
        for (let i = 0; i < 3; i++) {
            const ph = ((frameNo * 0.004 + i / 3 + s.t / 97) % 1), r = (1 - ph) * s.w / 2;
            for (let px = Math.ceil(mid - r); px <= mid + r; px += 1) { const dy = Math.round(Math.sqrt(Math.max(0, r * r - (px - mid) * (px - mid))) * 0.18) + 2; if ((px + i) % 3) continue; g.fillStyle = "rgba(140,92,40,0.45)"; g.fillRect(px, s.y + dy, 1, 1); }
        }
        // its surface: a lit lip, rippling
        for (let px = 0; px < s.w; px++) { const k = Math.sin((px + frameNo * 0.12) / 6 + s.t) > 0.55; g.fillStyle = k ? "#f8dea4" : "#ecc884"; g.fillRect(s.x + px, s.y, 1, 1); }
        // where Scout is in it: a dip round him, darker, the sand heaped a little either side
        const h = hero, cx = h ? h.x + h.w / 2 : 0;
        if (h && h.sand > 0 && cx > s.x && cx < s.x + s.w) {
            for (let d = -9; d <= 9; d++) { const px = Math.round(cx + d); if (px < s.x || px >= s.x + s.w) continue; const dip = Math.abs(d) < 7 ? 2 - Math.abs(d) / 4 : 0; g.fillStyle = "#8a5e2e"; g.fillRect(px, s.y + Math.round(dip), 1, 1); if (Math.abs(d) >= 7) { g.fillStyle = "#f4d698"; g.fillRect(px, s.y - 1, 1, 1); } }
        }
    }
    const CART_WHEEL = [
        ["..kkk..", ".kljlk.", "kjjmjjk", "klmnmlk", "kjjmjjk", ".kjmjk.", "..kkk.."],
        ["..kkk..", ".klmlk.", "kmjmjmk", "kjjnjjk", "kmjmjmk", ".kmjmk.", "..kkk.."]
    ];
    /* THE CART TURNED TO A SLOPE (23 Oct 2026, the owner's: "Mine carts don't look right when on a slope, they look
       distorted"; its columns had been slid down, which skews it). Turned properly instead, as pixel art is: the
       picture made eight times bigger edge-preservingly (Scale2x, three times over), turned there, and every pixel of
       the result read back from it, so its edges stay clean lines, not ragged. One per angle (to a degree) and wheel
       picture, kept. */
    const cartPics = [0, 1].map(() => { const c = document.createElement("canvas"); c.width = 24; c.height = 14; return c; });
    function cartPic(k) {
        const c = cartPics[k], cx = c.getContext("2d"), I = RIG_MINE.iron;
        if (c.made) return c;
        cx.clearRect(0, 0, 24, 14); cx.drawImage(spr("mineCart", 0), 0, 0);
        // its wheels, round, their spokes (+ then x), their bottoms on the floor (its y + 13)
        const W = CART_WHEEL[k], C = { k: I[0], j: I[1], m: I[2], n: I[4], l: I[3] };
        for (const wx of [5, 18]) W.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] !== ".") { cx.fillStyle = C[r[i]]; cx.fillRect(wx - 3 + i, 7 + j, 1, 1); } });
        c.made = sprites.ready; return c;
    }
    function scale2x(px, w, h) {
        const out = new Uint32Array(w * h * 4), at = (x, y) => px[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1), o = (y * 2) * w * 2 + x * 2;
            out[o] = C === A && C !== D && A !== B ? A : P; out[o + 1] = A === B && A !== C && B !== D ? B : P;
            out[o + w * 2] = D === C && D !== B && C !== A ? C : P; out[o + w * 2 + 1] = B === D && B !== A && D !== C ? D : P;
        }
        return out;
    }
    const cartTurned = new Map();
    // the cart's picture turned by ang about its wheels' midpoint at the floor (12, 14): the picture and where that point lands in it
    function cartTurn(k, ang, mid) {
        const key = k + ":" + ang + (mid ? "m" : ""); if (cartTurned.has(key)) return cartTurned.get(key);
        const src = cartPic(k), w = 24, h = 14, d = src.getContext("2d").getImageData(0, 0, w, h);
        let big = new Uint32Array(d.data.buffer.slice(0)), bw = w, bh = h;
        for (let i = 0; i < 3; i++) { big = scale2x(big, bw, bh); bw *= 2; bh *= 2; }
        const r = ang * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), px = 12, py = mid ? 7 : 14;
        const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => [px + (x - px) * cs - (y - py) * sn, py + (x - px) * sn + (y - py) * cs]);
        const x0 = Math.floor(Math.min(...corners.map(q => q[0]))), y0 = Math.floor(Math.min(...corners.map(q => q[1]))), x1 = Math.ceil(Math.max(...corners.map(q => q[0]))), y1 = Math.ceil(Math.max(...corners.map(q => q[1])));
        const ow = x1 - x0, oh = y1 - y0, out = document.createElement("canvas"); out.width = ow; out.height = oh;
        const ox = out.getContext("2d"), od = ox.createImageData(ow, oh), o32 = new Uint32Array(od.data.buffer);
        for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
            const wx = x0 + x + 0.5 - px, wy = y0 + y + 0.5 - py, sx = px + wx * cs + wy * sn, sy = py - wx * sn + wy * cs;
            const bx = Math.floor(sx * 8), by = Math.floor(sy * 8);
            if (bx >= 0 && by >= 0 && bx < bw && by < bh) o32[y * ow + x] = big[by * bw + bx];
        }
        ox.putImageData(od, 0, 0);
        const res = { c: out, ox: px - x0, oy: py - y0 };
        if (sprites.ready) cartTurned.set(key, res);
        return res;
    }
    function drawCart(c) {
        const X = Math.round(c.x), Y = Math.round(c.y), k = Math.floor(Math.abs(c.spin) * 2) % 2;
        // tumbling, off its rails: turned about its middle
        if (c.loose && c.rot) { const deg = ((Math.round(c.rot * 180 / Math.PI) % 360) + 360) % 360; if (deg) { const T = cartTurn(k, deg, true); g.drawImage(T.c, Math.round(X + 12 - T.ox), Math.round(Y + 6.5 - T.oy)); return; } }
        const a = c.tiltA || 0, b = c.tiltB || 0;
        if (Math.abs(a - b) < 0.5 && Math.abs(a) < 0.5) { g.drawImage(cartPic(k), X, Y); return; }
        // tilted on a slope: turned to the line between its wheels' grounds, its middle on that line
        const ang = Math.round(Math.atan2(b - a, 13) * 180 / Math.PI), T = cartTurn(k, ang);
        g.drawImage(T.c, Math.round(X + 12 - T.ox), Math.round(Y + 14 + (a + b) / 2 - T.oy));
    }
    /* where the ground is under px, searching down from y0 to y1: the first pixel that is rock (a wall's, or under a
       slope's line), or null */
    function groundBelow(px, y0, y1, beamFrom) {
        const tx = Math.floor(px / TS); let air = false;
        for (let y = Math.floor(y0); y <= y1; y++) {
            const ty = Math.floor(y / TS), t = tileAt(tx, ty), S = SLOPES[t], C = CEILS[t];
            const rock = S ? y >= ty * TS + slopeY(S, px - tx * TS) : C ? y < ty * TS + slopeY(C, px - tx * TS) : solidAt(tx, ty) || (t === "=" && y >= (beamFrom === undefined ? y0 : beamFrom));   // (a beam only stood on from above: at or under where it was put)
            if (!rock) { air = true; continue; }
            if (air) return S ? ty * TS + slopeY(S, px - tx * TS) : y;   // (ground: rock with air over it; rock from the start is a wall)
        }
        return null;
    }
    // a cart where it was put: down onto the ground under its wheels (a slope's line, or a floor), tilted to it
    function settleCart(c) {
        settleDown(c);
        // put partly into a wall: out of it, to the nearest place it stands free, and down again
        if (overlapsSolid(c, c.x, c.y, c.w, c.h)) { const x0 = c.x, y0 = c.y; for (let k = 1; k <= 14; k++) for (const d of [-k, k]) { c.x = x0 + d; c.y = y0; settleDown(c); if (!overlapsSolid(c, c.x, c.y, c.w, c.h)) return; } c.x = x0; c.y = y0; }
    }
    function settleDown(c) {
        const f = c.y + c.h, ga = groundBelow(c.x + 5, f - 18, f + 20, f - 2), gb = groundBelow(c.x + c.w - 6, f - 18, f + 20, f - 2);
        if (ga === null && gb === null) return;
        const A = ga === null ? gb : ga, B = gb === null ? ga : gb;
        // (its box stands on the highest ground anywhere under it, as it does rolling; the wheels drawn down to theirs)
        let top = Math.min(A, B); for (let x = c.x + 1; x <= c.x + c.w - 1; x += 2) { const y = groundBelow(x, f - 18, f + 20, f - 2); if (y !== null && y < top) top = y; }
        c.y = top - c.h; c.tiltA = A - top; c.tiltB = B - top;
    }
    /* ---- RAILS, A TILE AT A TIME (23 Oct 2026, the owner's: "rails should be drawn tile by tile, and therefore will
       be easy to place them onto slopes etc."; "add a end buffers option"; "options for the rails being broken at
       the end, or broken and hanging off the edge of a wall"). A layer of their own (spec.rails), a piece a tile:
         -  rail
         b  rail ending in buffers (at whichever end no rail joins it)
         x  rail broken off short (likewise)
         v  rails broken and hanging over a ledge's edge (painted in the air past the ledge)
       Each lies on what is under it: along a slope's line in a slope's tile, on a wall tile's top, or on the floor
       under an empty tile. A rail a row up or down beside it still joins it (where a slope meets the level). */
    const RAIL_CH = new Set(["-", "b", "x", "v"]);
    const railCh = (a, tx, ty) => { const r = a.railRows && a.railRows[ty]; return r && tx >= 0 && tx < r.length && RAIL_CH.has(r[tx]) ? r[tx] : null; };
    function railY(a, tx, ty, lx) {
        const t = tileAtIn(a, tx, ty), S = SLOPES[t];
        if (S) return ty * TS + slopeY(S, lx);
        if (t === "#" || t === "%") return ty * TS;   // (rubble, X, is not: a rail under it lies on the floor beneath, the rubble on the rail)
        return (ty + 1) * TS;
    }
    const railJoins = (a, tx, ty, d) => Boolean(railCh(a, tx + d, ty) || railCh(a, tx + d, ty - 1) || railCh(a, tx + d, ty + 1));
    // a broken end's rail stops this far into its tile (from its joined side)
    const RAIL_BROKEN = 9, BUFFER_FACE = 6;
    const RW = ["#1a0f08", "#3a2210", "#55331a", "#74482a", "#96633a"];   // (the rails' timber: outline, dark, shade, body, lit)
    function drawRailCell(x, a, tx, ty) {
        const ch = railCh(a, tx, ty); if (!ch) return;
        const I = RIG_MINE.iron, X0 = tx * TS, L = railJoins(a, tx, ty, -1), R = railJoins(a, tx, ty, 1);
        if (ch === "v") { drawRailHang(x, a, tx, ty, L, R); return; }
        let i0 = 0, i1 = TS;
        if (ch === "x") { if (L && !R) i1 = RAIL_BROKEN; else if (R && !L) i0 = TS - RAIL_BROKEN; }
        const yAt = i => Math.round(railY(a, tx, ty, i + 0.5) - 0.5) + 1;   // (the floor's line under column i)
        // the sleepers' ends, every six pixels along the world, set into the floor's top; the rail along them
        for (let i = i0; i < i1; i++) {
            const wx = X0 + i, y = yAt(i);
            if (((wx % 6) + 6) % 6 < 4) { x.fillStyle = RW[1]; x.fillRect(wx, y - 1, 1, 2); x.fillStyle = RW[3]; x.fillRect(wx, y - 1, 1, 1); }
            x.fillStyle = I[3]; x.fillRect(wx, y - 3, 1, 1); x.fillStyle = I[1]; x.fillRect(wx, y - 2, 1, 1);
        }
        if (ch === "x") {
            // its end bent up and splintered off, a sleeper knocked askew beyond it
            const dir = L && !R ? 1 : -1, ex = dir > 0 ? X0 + i1 : X0 + i0 - 1, y = yAt(dir > 0 ? i1 - 1 : i0);
            for (let k = 0; k < 4; k++) { x.fillStyle = I[3]; x.fillRect(ex + dir * k, y - 4 - k, 1, 1); x.fillStyle = I[1]; x.fillRect(ex + dir * k, y - 3 - k, 1, 1); }
            x.fillStyle = I[4]; x.fillRect(ex + dir * 3, y - 7, 1, 1);
            const sx = ex + dir * 4; x.fillStyle = RW[0]; x.fillRect(sx, y - 1, 1, 1); x.fillRect(sx + dir, y - 2, 1, 1); x.fillRect(sx + dir * 2, y - 2, 1, 1); x.fillStyle = RW[3]; x.fillRect(sx + dir, y - 1, 2 * dir > 0 ? 2 : 1, 1);
            x.fillStyle = RW[2]; x.fillRect(ex + dir * 2, y - 1, 1, 1);
        }
        if (ch === "b") { if (!R) drawBuffer(x, X0 + TS, yAt(TS - 1), 1); if (!L) drawBuffer(x, X0, yAt(0), -1); }
    }
    /* buffers: a heavy timber post at the rail's end, braced back along it, a beam across at a cart's height, its face
       plated in iron where a cart strikes it (dir: the way the rail ends; end: the end's x; y: the floor's line) */
    function drawBuffer(x, end, y, dir) {
        const I = RIG_MINE.iron, px = dir > 0 ? end - 4 : end, bx = dir > 0 ? end - BUFFER_FACE - 1 : end + 1;
        // the brace: from the post's top back down to the floor
        for (let k = 0; k < 10; k++) { const sx = dir > 0 ? px - 1 - k : px + 4 + k, sy = y - 11 + k; x.fillStyle = RW[0]; x.fillRect(sx, sy - 1, 1, 3); x.fillStyle = k % 3 ? RW[3] : RW[2]; x.fillRect(sx, sy, 1, 1); }
        // the post
        x.fillStyle = RW[0]; x.fillRect(px - 1, y - 14, 6, 14);
        x.fillStyle = RW[2]; x.fillRect(px, y - 13, 4, 13); x.fillStyle = RW[4]; x.fillRect(px + (dir > 0 ? 0 : 3), y - 13, 1, 13); x.fillStyle = RW[1]; x.fillRect(px + (dir > 0 ? 3 : 0), y - 13, 1, 13);
        x.fillStyle = RW[3]; x.fillRect(px, y - 13, 4, 1);
        // the beam across at a cart's height, iron on its striking face, a bolt through it
        const by = y - 10;
        x.fillStyle = RW[0]; x.fillRect(Math.min(bx, px) - 1, by - 1, Math.abs(px - bx) + 6, 6);
        x.fillStyle = RW[3]; x.fillRect(Math.min(bx, px), by, Math.abs(px - bx) + 4, 4); x.fillStyle = RW[4]; x.fillRect(Math.min(bx, px), by, Math.abs(px - bx) + 4, 1); x.fillStyle = RW[1]; x.fillRect(Math.min(bx, px), by + 3, Math.abs(px - bx) + 4, 1);
        const fx = dir > 0 ? bx : bx + 4; x.fillStyle = I[0]; x.fillRect(fx - 1, by - 1, 2, 6); x.fillStyle = I[3]; x.fillRect(fx - (dir > 0 ? 0 : 1), by, 1, 4); x.fillStyle = I[4]; x.fillRect(fx - (dir > 0 ? 0 : 1), by, 1, 1);
        x.fillStyle = I[1]; x.fillRect(px + 1, by + 1, 2, 2); x.fillStyle = I[4]; x.fillRect(px + 1, by + 1, 1, 1);
    }
    // rails hanging over a ledge: out past its edge, bent down, the sleepers still on them swinging free
    function drawRailHang(x, a, tx, ty, L, R) {
        const I = RIG_MINE.iron, dir = L && !R ? 1 : R && !L ? -1 : 1;
        const fromTx = tx - dir, fromTy = railCh(a, fromTx, ty) ? ty : railCh(a, fromTx, ty - 1) ? ty - 1 : ty + 1;
        const ex = dir > 0 ? tx * TS : tx * TS + TS - 1, ey = Math.round(railY(a, fromTx, fromTy, dir > 0 ? TS : 0)) + 1;
        let px = ex, py = ey - 3;
        const pts = [];
        for (let k = 0; k < 22; k++) { const ang = Math.min(1.35, 0.15 + k * 0.09); px += dir * Math.cos(ang) * 1.05; py += Math.sin(ang) * 1.05; pts.push([Math.round(px), Math.round(py)]); }
        for (const [qx, qy] of pts) { x.fillStyle = I[0]; x.fillRect(qx - (dir > 0 ? 1 : 0), qy, 2, 2); }
        for (const [qx, qy] of pts) { x.fillStyle = I[3]; x.fillRect(qx, qy, 1, 1); x.fillStyle = I[1]; x.fillRect(qx, qy + 1, 1, 1); }
        // two sleepers still nailed on, hanging off it
        for (const k of [6, 14]) { const [qx, qy] = pts[k]; x.fillStyle = RW[0]; x.fillRect(qx - 1, qy + 1, 3, 4); x.fillStyle = RW[3]; x.fillRect(qx, qy + 2, 1, 2); x.fillStyle = RW[2]; x.fillRect(qx + (dir > 0 ? 1 : -1), qy + 2, 1, 2); }
        const [lx, ly] = pts[pts.length - 1]; x.fillStyle = I[4]; x.fillRect(lx, ly + 1, 1, 1);
    }
    // the rails over a span of tiles (the game's, behind everything moving; the editor's, over its map)
    function drawRailRange(x, a, X0, Y0, X1, Y1, showAll) {
        if (!a.railRows) return;
        // (23 Oct 2026) in a hidden room: as hidden as its cover is, there as it is found
        const cov = showAll ? null : coverOfTile(a);   // (the editor's map shows them all: showAll)
        for (let ty = Math.max(0, Y0); ty < Math.min(a.h, Y1); ty++) for (let tx = Math.max(0, X0); tx < Math.min(a.w, X1); tx++) {
            if (!railCh(a, tx, ty)) continue;
            const cv = cov && cov[ty * a.w + tx] ? a.covers[cov[ty * a.w + tx] - 1] : null, hide = cv && typeof cv.alpha === "number" ? cv.alpha : 0;
            if (hide >= 0.99) continue;
            if (hide > 0) { x.save(); x.globalAlpha = 1 - hide; drawRailCell(x, a, tx, ty); x.restore(); } else drawRailCell(x, a, tx, ty);
        }
    }
    /* where the rail under a wheel at px is, near feet: the rail's piece, and the floor line; null if none (or past a
       broken end) */
    function railUnder(px, feet) {
        const a = act, tx = Math.floor(px / TS);
        for (const ty of [Math.floor((feet - 1) / TS), Math.floor(feet / TS), Math.floor((feet + 15) / TS), Math.floor((feet + 26) / TS)]) {
            const ch = railCh(a, tx, ty); if (!ch || ch === "v") continue;
            const lx = px - tx * TS, y = railY(a, tx, ty, lx);
            if (y < feet - 6 || y > feet + 26) continue;   // (a wheel over a slope's fall, a steep one's most, is well under the cart's feet)   // (a wheel over a slope's fall is a little under the cart's feet)
            if (ch === "x") { const L = railJoins(a, tx, ty, -1), R = railJoins(a, tx, ty, 1); if ((L && !R && lx > RAIL_BROKEN) || (R && !L && lx < TS - RAIL_BROKEN)) continue; }
            return { ch, tx, ty, y, L: railJoins(a, tx, ty, -1), R: railJoins(a, tx, ty, 1) };
        }
        return null;
    }
    // the ground's height under px near feet: a slope's line if there is one there, else feet
    function groundAt(px, feet) {
        if (!act.slopes) return feet;
        const tx = Math.floor(px / TS);
        for (const ty of [Math.floor((feet - 1) / TS), Math.floor((feet + 10) / TS)]) { const S = SLOPES[tileAt(tx, ty)]; if (S) { const y = ty * TS + slopeY(S, px - tx * TS); if (y > feet - 12 && y < feet + 12) return y; } }
        return feet;
    }
    function drawRails(r) {
        // set into the floor's top: the sleepers' ends showing, the rail on them, the wheels on the rail
        const I = RIG_MINE.iron, y = r.y + TS - 2;
        for (let px = 0; px < r.w; px += 6) { g.fillStyle = "#3a2210"; g.fillRect(r.x + px, y + 1, 4, 2); g.fillStyle = "#74482a"; g.fillRect(r.x + px, y + 1, 4, 1); }
        g.fillStyle = I[1]; g.fillRect(r.x, y + 1, r.w, 1); g.fillStyle = I[3]; g.fillRect(r.x, y, r.w, 1);
    }
    function drawSluice(s) {
        const I = RIG_MINE.iron, X = s.x, Y = s.y, px = X + 8, py = Y + 11, a = (-0.75 + 1.5 * s.swing);
        g.fillStyle = I[0]; g.fillRect(X + 3, Y + 9, 10, 6); g.fillStyle = I[2]; g.fillRect(X + 4, Y + 10, 8, 4); g.fillStyle = I[3]; g.fillRect(X + 4, Y + 10, 8, 1);
        for (let i = 0; i < 9; i++) { const x = Math.round(px + Math.sin(a) * i), y = Math.round(py - Math.cos(a) * i); g.fillStyle = I[0]; g.fillRect(x, y, 2, 1); g.fillStyle = I[3]; g.fillRect(x, y, 1, 1); }
        const kx = Math.round(px + Math.sin(a) * 10), ky = Math.round(py - Math.cos(a) * 10);
        g.fillStyle = "#1a0f08"; g.fillRect(kx - 2, ky - 2, 5, 4); g.fillStyle = s.on ? "#3f9a4a" : "#b23a2a"; g.fillRect(kx - 1, ky - 1, 3, 2); g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(kx - 1, ky - 1, 1, 1);
        g.fillStyle = I[4]; g.fillRect(px, py, 1, 1);
    }
    /* a fire gate: three blocks of carved sandstone, each bevelled (lit at its top and left, shaded at its bottom
       and right), grained; a flame cut into the middle one, its recess dark, gold in it as its braziers are lit,
       blazing white-gold once they all are. It rises into the roof as it opens. */
    function drawGate(gt) {
        const X = gt.x, Y = gt.y - Math.round(48 * gt.open);
        g.save(); g.beginPath(); g.rect(X - 1, gt.y, TS + 2, 48); g.clip();
        for (let b = 0; b < 3; b++) {
            const by = Y + b * 16;
            g.fillStyle = "#2a1c10"; g.fillRect(X, by, TS, 16);
            g.fillStyle = "#a07e52"; g.fillRect(X + 1, by + 1, TS - 2, 14);
            for (let j = 0; j < 14; j++) for (let i = 0; i < 14; i++) { const hs = hashTile(X + i * 3 + b * 31, by + j * 5); if (hs > 0.9) { g.fillStyle = "#b8946a"; g.fillRect(X + 1 + i, by + 1 + j, 1, 1); } else if (hs < 0.07) { g.fillStyle = "#86643e"; g.fillRect(X + 1 + i, by + 1 + j, 1, 1); } }
            g.fillStyle = "#d4b07e"; g.fillRect(X + 1, by + 1, TS - 2, 1); g.fillRect(X + 1, by + 1, 1, 14);
            g.fillStyle = "#6e5032"; g.fillRect(X + 1, by + 14, TS - 2, 1); g.fillRect(X + TS - 2, by + 1, 1, 14);
        }
        const lit = act.braziers.filter(b => b.group && b.group === gt.group), k = lit.length ? lit.filter(b => b.lit).length / lit.length : 0;
        const F = ["..a..", ".aba.", ".aba.", "abbba", "abcba", ".aaa."], cy = Y + 21;
        F.forEach((r, j) => { for (let i = 0; i < 5; i++) { const ch = r[i]; if (ch === ".") continue; g.fillStyle = "#3a2614"; g.fillRect(X + 5 + i, cy + j, 1, 1);
            const col = k >= 1 ? (ch === "a" ? "#ffc840" : ch === "b" ? "#fff4c4" : "#ffffff") : k > 0 ? (ch === "a" ? "#9a6410" : ch === "b" ? "#d39a1e" : "#f2cc4e") : (ch === "a" ? "#5a3c1c" : "#4a3018");
            if (k > 0 || ch !== "a") { g.fillStyle = col; g.fillRect(X + 5 + i, cy + j, 1, 1); } } });
        if (k >= 1) { g.globalCompositeOperation = "lighter"; const p = 0.5 + 0.5 * Math.sin(frameNo / 9), gr = g.createRadialGradient(X + 8, cy + 3, 0, X + 8, cy + 3, 10); gr.addColorStop(0, `rgba(255,200,90,${(0.25 + 0.15 * p).toFixed(3)})`); gr.addColorStop(1, "rgba(255,200,90,0)"); g.fillStyle = gr; g.fillRect(X - 2, cy - 7, 20, 20); g.globalCompositeOperation = "source-over"; }
        g.restore();
    }
    function drawZip(z) {
        const I = RIG_MINE.iron;
        const n = Math.ceil(z.len);
        // (a steel cable: its strands lit every other pixel, a shadow under it)
        for (let i = 0; i <= n; i++) { const x = Math.round(z.x0 + z.ux * i), y = Math.round(z.y0 + z.uy * i); g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x, y + 1, 1, 1); g.fillStyle = i % 2 ? I[2] : I[3]; g.fillRect(x, y, 1, 1); }
        for (const [x, y] of [[z.x0, z.y0], [z.x1, z.y1]]) { g.fillStyle = I[0]; g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7); g.fillStyle = I[2]; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5); g.fillStyle = I[4]; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1); g.fillStyle = I[0]; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
    }
    function drawTrolley(h) {
        const r = h.ride, z = r.z, I = RIG_MINE.iron, px = Math.round(z.x0 + z.ux * r.s), py = Math.round(z.y0 + z.uy * r.s);
        // the pulley on the cable, a strap down from it, and the bar his hands are on (his hands at his top, py + 2 to + 3)
        g.fillStyle = I[0]; g.fillRect(px - 3, py - 3, 7, 4); g.fillStyle = I[3]; g.fillRect(px - 2, py - 3, 5, 1); g.fillStyle = I[2]; g.fillRect(px - 2, py - 2, 5, 2); g.fillStyle = I[4]; g.fillRect(px, py - 2, 1, 1);
        g.fillStyle = I[0]; g.fillRect(px, py + 1, 1, 2);
        const bx = Math.round(h.x) - 3, bw = h.w + 6;
        g.fillStyle = "#1a0f08"; g.fillRect(bx, py + 2, bw, 3); g.fillStyle = "#96633a"; g.fillRect(bx + 1, py + 3, bw - 2, 1); g.fillStyle = "#d9a76b"; g.fillRect(bx + 1, py + 3, 2, 1);
    }
    let lampChainFree = false;
    /* A SWINGING ROPE (22 Oct 2026, the owner's: "styled more like our normal rope with a subtle difference"): the
       climbing rope's own three twisted strands and its iron eye-bolt in the roof, laid along the swing; bending a
       little behind as it goes (its foot lags its top); and, the difference, a fat stopper knot at its end with the
       frayed tail under it, where Scout holds on. Drawn a row at a time: each row the rope's cross-section (stretched
       as it leans, so it keeps its thickness), its twist following the rope's own length, so it turns as it swings. */
    const ROPE_GRIP = 3;   // (how far above the knot his hands are)
    function drawSwingRope(s) {
        const P = ART.pal, R = ART.sprites.rope.rows, top = ART.sprites.ropeTop.rows, x0 = Math.round(s.ax) - 8;
        for (let j = 0; j < 7; j++) for (let i = 0; i < 16; i++) { const ch = top[j][i]; if (ch !== ".") { g.fillStyle = P[ch]; g.fillRect(x0 + i, s.ay + j, 1, 1); } }
        const ax = s.ax, ay = s.ay + 7, L = s.len - 7, ex = ax + Math.sin(s.th) * L, ey = ay + Math.cos(s.th) * L;
        const bend = Math.max(-5, Math.min(5, -s.om * L * 3.5)), cx = (ax + ex) / 2 + Math.cos(s.th) * bend, cy = (ay + ey) / 2 - Math.sin(s.th) * bend;
        const pts = [], n = Math.ceil(L * 3);
        let arc = 0, px = ax, py = ay;
        for (let i = 0; i <= n; i++) { const t = i / n, x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * ex, y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * ey; arc += Math.hypot(x - px, y - py); px = x; py = y; pts.push({ x, y, arc }); }
        let k = 0;
        for (let y = Math.round(ay); y <= Math.round(ey); y++) {
            while (k < pts.length - 1 && pts[k + 1].y <= y) k++;
            const p = pts[k], q = pts[Math.min(pts.length - 1, k + 1)], lean = Math.atan2(q.x - p.x, Math.max(0.0001, q.y - p.y));
            const row = R[Math.floor(p.arc) % 4].slice(5, 11), w = Math.max(6, Math.round(6 / Math.max(0.35, Math.cos(lean)))), left = Math.round(p.x) - Math.floor(w / 2);
            for (let i = 0; i < w; i++) {
                const ch = i === 0 || i === w - 1 ? "k" : row[1 + Math.min(3, Math.floor((i - 1) * 4 / (w - 2)))];
                g.fillStyle = P[ch]; g.fillRect(left + i, y, 1, 1);
            }
        }
        g.drawImage(spr("ropeKnot", 0), Math.round(ex) - 4, Math.round(ey) - 1);
    }
    function drawSwing(s) {
        const e = swingAt(s, s.len);
        if (s.kind === "rope") { drawSwingRope(s); return; }
        plate(s.ax, s.ay);
        drawChainLine(s.ax, s.ay + 2, e.x, e.y);
        lampChainFree = true;
        try { drawLamp(g, "chandelier", Math.round(e.x) - 8, Math.round(e.y), 0, act, null); } finally { lampChainFree = false; }
    }
    function drawCarried(h) {
        const c = act.nx.carry; if (!c) return;
        const hd = torchHand(h), x = Math.round(hd.x), y = Math.round(hd.y);
        g.fillStyle = "#1a0f08"; g.fillRect(x - 1, y - 7, 3, 10); g.fillStyle = "#96633a"; g.fillRect(x, y - 4, 1, 7); g.fillStyle = "#3c342b"; g.fillRect(x - 1, y - 8, 3, 3);
        const k = c.life / c.max, low = k < 0.2;
        if (low && frameNo % 7 < 2) return;
        const p = lampPulse(7), sz = low ? 0.4 + p * 0.3 : 1;
        g.save(); g.globalCompositeOperation = "lighter";
        const R = (10 + 5 * p) * sz, gr = g.createRadialGradient(x + 0.5, y - 11, 0, x + 0.5, y - 11, R); gr.addColorStop(0, `rgba(255,190,90,${(0.32 * sz).toFixed(3)})`); gr.addColorStop(1, "rgba(255,190,90,0)");
        g.fillStyle = gr; g.fillRect(x - R, y - 11 - R, R * 2 + 1, R * 2 + 1); g.restore();
        candleFlame(g, x, y - 8, low ? 0.1 : 0.5 + p * 0.5, candleLean(3), FIRE_HEX);
        if (!low) candleFlame(g, x, y - 9, 0.3 + p * 0.4, candleLean(5), FIRE_HEX);
    }
    function drawNewFoe(f) {
        const X = Math.round(f.x), Y = Math.round(f.y);
        if (f.kind === "snake") {
            const shake = f.st === "rattle" ? (frameNo % 4 < 2 ? 1 : -1) : 0;
            if (f.alive && f.out > 0) {
                /* its body: up out of the urn's mouth and arching over to its head, round (an outline, then the body
                   in its bands, lit along its top), as a curve (from the mouth, up, over to the back of its head) */
                const hd = snakeHead(f), mx = X + 8, my = Y + 3, ex = hd.x + (f.lean > 0 ? 1 : 6), ey = hd.y + 3, cx = mx, cy = Math.min(my, ey) - 7 * f.out;
                const at = t => ({ x: (1 - t) * (1 - t) * mx + 2 * (1 - t) * t * cx + t * t * ex, y: (1 - t) * (1 - t) * my + 2 * (1 - t) * t * cy + t * t * ey });
                const n = Math.max(4, Math.ceil(Math.hypot(ex - mx, ey - my) * 1.6)), pts = [];
                for (let i = 0; i <= n; i++) pts.push(at(i / n));
                for (const p of pts) { g.fillStyle = "#1a0f08"; g.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 1, 4, 4); g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 2, 2, 6); }
                pts.forEach((p, i) => { const bx = Math.round(p.x), by = Math.round(p.y); g.fillStyle = (i >> 2) % 2 ? "#2f5a26" : "#4f8a3a"; g.fillRect(bx - 1, by - 1, 2, 3); g.fillStyle = "#9ad06a"; g.fillRect(bx - 1, by - 1, 1, 1); });
                g.drawImage(spr("snakeHead", 0, f.lean < 0), hd.x, hd.y);
                if (f.st === "out" && frameNo % 16 < 8) { g.fillStyle = "#cf3a3a"; const tx = f.lean > 0 ? hd.x + 8 : hd.x - 2; g.fillRect(tx, hd.y + 2, 2, 1); g.fillRect(tx + (f.lean > 0 ? 2 : -1), hd.y + (frameNo % 8 < 4 ? 1 : 3), 1, 1); }
            }
            g.drawImage(spr("snake", 0), X + shake, Y);
            return;
        }
        if (!f.alive) { if (f.deadT < 20) { g.globalAlpha = 1 - f.deadT / 20; g.drawImage(f.half ? spr("mummyCrawl", 0, f.vx < 0) : spr(f.kind, 0, f.vx < 0), X, Y + f.deadT); g.globalAlpha = 1; } return; }
        if (f.kind === "mummy") {
            if (f.half) g.drawImage(spr("mummyCrawl", Math.floor(f.anim || 0) % 2, f.vx < 0), X, Y);
            else g.drawImage(spr("mummy", Math.floor((f.anim || 0) * 0.7) % 2, f.vx < 0), X - 1, Y);
            return;
        }
    }
    // behind Scout: the rails, the scree, the levers, the brackets, the fire gates, the ziplines and the swings
    function drawNew(cam, layer) {
        const N = act.nx, vis = (x, y, w, h) => x < cam.x + VW + 40 && x + w > cam.x - 40 && y < cam.y + VH + 40 && y + h > cam.y - 40;
        if (layer === "back") {
            drawRailRange(g, act, Math.floor(cam.x / TS) - 2, Math.floor(cam.y / TS) - 2, Math.ceil((cam.x + VW) / TS) + 3, Math.ceil((cam.y + VH) / TS) + 3);
            for (const s of N.screes) if (!s.tile && vis(s.x, s.y, s.w, s.h + TS)) g.drawImage(screeArt(s), s.x, s.y);   // (a slope tile's drawn with the walls)
            for (const s of N.sluices) if (vis(s.x, s.y, TS, TS)) drawSluice(s);
            for (const b of N.brackets) if (vis(b.x, b.y, TS, TS)) { g.drawImage(spr("torchBracket", 0), b.x + 2, b.y); g.drawImage(spr("flame", b.t), b.x + 1, b.y - 6); b.t = Math.floor(frameNo / 7 + b.x) % 4; }
            for (const gt of N.gates) if (vis(gt.x, gt.y, TS, 48)) drawGate(gt);
            for (const z of N.zips) if (vis(Math.min(z.x0, z.x1), Math.min(z.y0, z.y1), Math.abs(z.x1 - z.x0) + 8, Math.abs(z.y1 - z.y0) + 8)) drawZip(z);
            for (const s of N.swings) if (vis(s.ax - s.len - 40, s.ay, (s.len + 40) * 2, s.len + 60)) drawSwing(s);
            if (hero.ride && hero.ride.kind === "zip") drawTrolley(hero);
        } else {
            for (const c of N.carts) if (vis(c.x, c.y, c.w, c.h)) drawCart(c);
            for (const s of N.sands) if (vis(s.x, s.y, s.w, s.h)) drawSand(s);
            drawCarried(hero);
        }
    }
    // the editor's picture of one at rest
    function drawNewAtRest(o) {
        const tx = Math.floor(o.x / TS), ty = Math.floor(o.y / TS), a = act;
        if (!a.nx) a.nx = newBag();
        const tmp = newBag(), keep = a.nx; a.nx = tmp;
        try {
            if (NEW_FOES.has(o.type)) {
                const f = makeFoe(o, tx, ty); f.t = 0; f.bob = 0; f.anim = 0; f.face = o.dir === 1 ? 1 : -1; f.vx = o.dir === 1 ? 1 : -1;
                if (o.type === "snake") { f.out = 0.85; f.lean = o.dir === 1 ? 1 : -1; f.st = "out"; }
                drawNewFoe(f); return;
            }
            const water = new Set(a.water), tops = new Map(a.waterTop), under = o.type === "firegate" ? [0, 1, 2].map(j => a.tiles[ty + j] && a.tiles[ty + j][tx]) : null;
            buildNew(a, o, tx, ty);
            a.water = water; a.waterTop = tops;
            for (const r of tmp.rails) drawRails(r);
            for (const s of tmp.screes) g.drawImage(screeArt(s), s.x, s.y);
            for (const s of tmp.sluices) drawSluice(s);
            for (const b of tmp.brackets) { g.drawImage(spr("torchBracket", 0), b.x + 2, b.y); g.drawImage(spr("flame", 0), b.x + 1, b.y - 6); }
            for (const gt of tmp.gates) { drawGate(gt); for (let j = 0; j < 3; j++) if (a.tiles[gt.ty + j] && under[j] !== undefined) a.tiles[gt.ty + j][gt.tx] = under[j]; }
            for (const z of tmp.zips) drawZip(z);
            for (const s of tmp.swings) drawSwing(s);
            for (const c of tmp.carts) { settleCart(c); drawCart(c); }   // (on a slope, sat on it and tilted, as it will be)
            for (const s of tmp.sands) drawSand(s);
            for (const p of tmp.pools) {
                g.fillStyle = "rgba(60,140,200,0.35)"; g.fillRect(p.x, p.level, p.w, p.y + p.h - p.level);
                g.fillStyle = "rgba(160,220,255,0.8)"; g.fillRect(p.x, p.level, p.w, 1);
                g.strokeStyle = "rgba(120,200,255,0.6)"; g.setLineDash([3, 2]); g.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1); g.setLineDash([]);
                g.fillStyle = "rgba(255,200,120,0.9)"; g.fillRect(p.x, p.y + p.drop, p.w, 1);
            }
        } finally { a.nx = keep; }
    }

    /* ================================================================ DRAWING */
    function draw() {
        if (!g || !act) return;
        const cam = { x: Math.round(state.cam.x), y: Math.round(state.cam.y) };
        if (state.shake > 0) { cam.x += Math.round((Math.random() - 0.5) * 4); cam.y += Math.round((Math.random() - 0.5) * 4); }
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = "#0d0805";
        g.fillRect(0, 0, VW, VH);
        if (TH.sky && act.skyMask) TH.sky(g, cam, act, helpers());
        g.drawImage(act.static, Math.max(0, cam.x), Math.max(0, cam.y), VW, VH, 0, 0, VW, VH);
        g.translate(-cam.x, -cam.y);
        // a hidden room being found: its walls as an open room's, as its cover goes (renderStatic: THE HIDDEN ROOMS, OPEN)
        for (const cv of act.covers) if (cv.reveal && cv.alpha < 1) { g.globalAlpha = 1 - cv.alpha; g.drawImage(cv.reveal.c, cv.reveal.x, cv.reveal.y); g.globalAlpha = 1; }

        // torches, with their light on the wall
        for (const d of act.deco) {
            if (d.kind !== "t") continue;
            if (d.cover && d.cover.alpha > 0.5) continue;
            const R0 = Math.max(80, d.radius + 16);
            if (d.x < cam.x - R0 || d.x > cam.x + VW + R0 || d.y < cam.y - R0 || d.y > cam.y + VH + R0) continue;
            // (14 Oct 2026, the editor's) each lantern's own reach, brightness, flicker and colour; the theme's when not said
            const L = lampAt(d.style);
            torchGlow(d);
            if (d.lamp && d.style !== "wall") drawLamp(g, d.style, d.x, d.y, d.t, act, d.color);
            else if (d.lamp) {
                const [base, fl] = wallLampArt(d.color, d.t);
                g.drawImage(base, d.x + L.bx, d.y + L.by);
                g.drawImage(fl, d.x + L.fx, d.y + L.fy);
            }
            // embers drifting slowly round the flame
            if ((d.embers === null ? TH.embers && d.style === "wall" : d.embers) && d.lamp && frameNo % 16 === 0 && Math.random() < 0.7 && state.mode !== "paused") { /* (14 Oct 2026, the owner's: "seem to just spin in a circle around the top of the lantern, rather than smoothly float around the whole lantern"): about the lamp's own middle (its glow, wherever the zone's lamp hangs it), starting low, drifting up and round, wandering */ const L = lampAt(d.style); state.parts.push({ kind: "ember", drift: true, cx: d.x + L.gx, base: d.y + L.gy + 4 + Math.random() * 6, x: d.x + L.gx, y: d.y + L.gy, vx: 0, vy: 0, a: Math.random() * Math.PI * 2, spin: (Math.random() < 0.5 ? -1 : 1) * (0.018 + Math.random() * 0.016), r: 6 + Math.random() * 4, ph: Math.random() * 9, life: 90 + Math.floor(Math.random() * 50), t: 0 }); }
        }

        if (act.deco2.length) drawDeco(cam, "back");
        drawLights(cam, "back");
        if (act.nx) drawNew(cam, "back");
        if (act.gears.length) drawGears(cam);
        if (TH.beat || TH.weather || act.switchers.length || act.conveyors.size || act.glasses.length || act.pours.length || act.drips.length) drawLab(cam);
        // (16 Oct 2026) the still parts of the platforms' rigs (beams, posts, headframes), behind all that moves
        if (TH.mover && TH.mover.back) for (const m of act.movers) {
            if (m.kind !== "h" && m.kind !== "v") continue;
            const runL = m.kind === "h" && m.x0 !== undefined ? Math.min(m.x, m.x0) - 24 : m.x, runR = m.kind === "h" && m.x1 !== undefined ? Math.max(m.x + m.w, m.x1 + m.w) + 24 : m.x + m.w;
            if (runL > cam.x + VW + 40 || runR < cam.x - 40) continue;
            TH.mover.back(g, m, act, helpers());
        }
        // blast doors and hatches, and their wheels
        for (const d of act.doors) {
            const X = d.tx * TS, Y = d.ty * TS;
            if (X < cam.x - 64 || X > cam.x + VW + 64 || Y < cam.y - 64 || Y > cam.y + VH + 64) continue;
            if (d.kind === "pump") { drawPump(d, X, Y); continue; }
            if (!d.open || d.anim < 1) {
                if (d.kind === "door") { g.save(); g.beginPath(); g.rect(X - 1, Y, TS + 2, 48); g.clip(); g.drawImage(spr("blast", 0), X, Y - Math.round(d.anim * 46)); g.restore(); }
                else { g.save(); g.beginPath(); g.rect(X, Y - 1, 48, TS + 2); g.clip(); g.drawImage(spr("hatch", 0), X + Math.round(d.anim * 46), Y + 2); g.restore(); }
            }
            if (d.open) continue;
            const fr = (d.spin || 0) % 4;
            const spots = d.kind === "door" ? [[X - 15, Y + 18], [X + TS + 1, Y + 18]].filter(([wx]) => !solidAt(Math.floor((wx + 7) / TS), d.ty + 1)) : [[X + 17, Y + TS + 1], [X + 17, Y - 15]].filter(([, wy]) => !solidAt(d.tx + 1, Math.floor((wy + 7) / TS)));
            for (const [wx, wy] of spots) {
                g.drawImage(spr("wheel", fr), wx, wy);
                if (d.prog > 0) { g.fillStyle = "#0a0e14"; g.fillRect(wx - 1, wy - 5, 16, 3); g.fillStyle = d.prog > 0.75 ? "#7ae07a" : "#e8c040"; g.fillRect(wx, wy - 4, Math.round(14 * d.prog), 1); }
            }
        }
        // air vents: a grating in the floor, a dome of rivets round it
        for (const v of act.vents) {
            if (v.x < cam.x - TS || v.x > cam.x + VW || v.y < cam.y || v.y > cam.y + VH + TS) continue;
            const X = v.x, Y = v.y - 4, froth = v.t > v.every - 40;
            g.fillStyle = "#0a0e14"; g.fillRect(X + 1, Y, 14, 4); g.fillRect(X + 3, Y - 1, 10, 1);
            g.fillStyle = "#6a7686"; g.fillRect(X + 2, Y + 1, 12, 3); g.fillRect(X + 4, Y, 8, 1);
            g.fillStyle = froth ? "#bfeaff" : "#1a2028"; for (let i = 0; i < 4; i++) g.fillRect(X + 3 + i * 3, Y + 1, 1, 2);
            g.fillStyle = "#b8c4d2"; g.fillRect(X + 4, Y, 8, 1);
        }
        // roots across the way, and burning
        for (const r of act.roots) {
            if (r.burn >= 60) continue;
            const X = r.x * TS, Y = r.y * TS;
            if (X < cam.x - TS || X > cam.x + VW || Y < cam.y - TS || Y > cam.y + VH) continue;
            g.globalAlpha = r.burn ? Math.max(0, 1 - r.burn / 60) : 1;
            g.drawImage(spr("roots", (r.x + r.y) % 2), X, Y);
            g.globalAlpha = 1;
            if (r.burn) g.drawImage(spr("fire", Math.floor(frameNo / 4 + r.x) % 4), X + 2, Y + 6 - Math.floor(r.burn / 12));
        }
        // braziers, cold or alight
        for (const b of act.braziers) {
            if (b.x < cam.x - 40 || b.x > cam.x + VW + 40) continue;
            g.drawImage(spr("brazier", 0), b.x, b.y);
            if (b.lit) {
                g.drawImage(spr("fire", Math.floor(frameNo / 6 + b.t) % 4), b.x + 2, b.y + 1);
                if (frameNo % 14 === 0 && state.mode !== "paused") state.parts.push({ kind: "ember", cx: b.x + 8, base: b.y + 1, x: b.x + 8, y: b.y, vx: 0, vy: 0, a: Math.random() * Math.PI * 2, spin: (Math.random() < 0.5 ? -1 : 1) * 0.03, r: 5 + Math.random() * 3, life: 60, t: 0 });
            }
        }

        // doorways (14 Oct 2026, the editor's): a door like the exit's, a padlock on one that is locked
        for (const dw of act.doorways) {
            if (dw.x > cam.x + VW + 40 || dw.x + dw.w < cam.x - 40 || dw.y > cam.y + VH + 40 || dw.y + dw.h < cam.y - 40) continue;
            g.drawImage(spr("door", 0), dw.x, dw.y);
            if (dw.lock && !act.keys.has(dw.lock)) g.drawImage(spr("padlock", 0), dw.x + 11, dw.y + 22);
        }
        // the door
        const d = act.door;
        if (d) {
            if (act.unlocked) g.drawImage(spr("doorOpen", 0), d.x, d.y);
            else {
                g.drawImage(spr("door", 0), d.x, d.y);
                g.drawImage(spr("padlock", 0), d.x + 11, d.y + 22);
            }
        }

        // oxygen tanks, glowing while he breathes from one
        for (const t of act.tanks) {
            if (t.x < cam.x - 20 || t.x > cam.x + VW + 20) continue;
            g.drawImage(spr("tank", 0), t.x - 2, t.y);
            if (t.glow > 0) { g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = t.glow * 0.5; const gr = g.createRadialGradient(t.x + 6, t.y + 12, 2, t.x + 6, t.y + 12, 26); gr.addColorStop(0, "rgba(140,255,200,0.8)"); gr.addColorStop(1, "rgba(140,255,200,0)"); g.fillStyle = gr; g.fillRect(t.x - 20, t.y - 14, 52, 52); g.restore(); }
        }

        // pickups, bobbing
        for (const t of act.things) {
            if (t.got) continue;
            const bob = Math.round(Math.sin(frameNo / 12 + t.x / 30) * 1.5);
            if (t.kind === "coin") g.drawImage(spr("coin", Math.floor(frameNo / 8 + t.x / 40)), t.x, t.y + bob);
            else if (t.kind === "gem") { g.drawImage(spr("gem", 0), t.x, t.y + bob); if (frameNo % 40 < 6) { g.fillStyle = "#ffffff"; g.fillRect(t.x + 2, t.y + 2 + bob, 1, 1); } }
            else if (t.kind === "life") g.drawImage(spr("hat", 0), t.x, t.y + bob);
            else if (t.kind === "dynamite") g.drawImage(spr("dynamite", 0), t.x, t.y + bob);
            else if (t.kind === "knife") { g.drawImage(spr("knife", 0), t.x, t.y + bob); if (frameNo % 46 < 6) { g.fillStyle = "#ffffff"; g.fillRect(t.x + 3, t.y + 2 + bob, 1, 1); } }
            else if (t.kind === "key") {
                const gr = g.createRadialGradient(t.x + 6, t.y + 9, 1, t.x + 6, t.y + 9, 20);
                gr.addColorStop(0, "rgba(255,230,120,0.4)"); gr.addColorStop(1, "rgba(255,230,120,0)");
                g.fillStyle = gr; g.fillRect(t.x - 14, t.y - 11, 40, 40);
                g.drawImage(spr("key", 0), t.x, t.y + bob);
                if (frameNo % 50 < 8) { g.fillStyle = "#ffffff"; g.fillRect(t.x + 4, t.y + 1 + bob, 1, 1); }
            }
        }
        for (const c of act.crates) paintCrate(g, c);
        // icicles, shivering before they drop
        for (const ic of act.icicles) { if (ic.state === "gone") continue; const jig = ic.state === "shake" ? (frameNo % 4 < 2 ? 1 : -1) : 0; g.drawImage(spr("icicle", 0), Math.round(ic.x) + jig, Math.round(ic.y)); }
        // the crumbling ledges, shaking before they go
        for (const c of act.crumbles.values()) {
            if (c.state === "gone") continue;
            const X = c.tx * TS, Y = c.ty * TS;
            if (X < cam.x - TS || X > cam.x + VW || Y < cam.y - TS || Y > cam.y + VH) continue;
            const jig = c.state === "shake" ? (frameNo % 4 < 2 ? 1 : -1) * (c.t > 20 ? 1 : 0) : 0;
            g.drawImage(spr("crumble", (c.tx + c.ty) % 2), X + jig, Y + (c.state === "shake" && c.t > 30 ? 1 : 0));
        }
        // the moving platforms, and what they hang from
        for (const m of act.movers) {
            // (14 Oct 2026) a block's rig (its girder, the ropes or chains it hangs from) spans its whole run: drawn while any of the run is in view, not only the block
            const runL = m.kind === "h" && m.x0 !== undefined ? Math.min(m.x, m.x0) - 24 : m.x, runR = m.kind === "h" && m.x1 !== undefined ? Math.max(m.x + m.w, m.x1 + m.w) + 24 : m.x + m.w;
            if (runL > cam.x + VW + 40 || runR < cam.x - 40) continue;
            if (m.kind === "f") drawFloat(m);
            else if (m.kind === "raft") drawRaft(m);
            else if (m.kind === "orbit") drawOrbitLedge(m);
            else if (TH.mover && m.kind !== "p") TH.mover(g, m, act, helpers()); else platform(g, Math.round(m.x), Math.round(m.y), m.w, { seed: m.tx * 7 });
        }
        for (const c of act.loose) if (c.t < 150 || frameNo % 6 < 3) g.drawImage(spr("coin", Math.floor(frameNo / 4 + c.x)), Math.round(c.x), Math.round(c.y));
        for (const r of act.rocks) g.drawImage(spr("rock", 0), Math.round(r.x), Math.round(r.y));
        // the rubble piles, each drawn whole (pileArt)
        // (23 Oct 2026, the owner's: rubble "doesn't sit ontop of a rail properly") rubble on rails sits on them, up their height, the rails under it
        for (const pile of act.piles) if (pile.alive) { const art = pileArt(pile); if (pile.onRail === undefined) pile.onRail = Boolean(act.railRows && pile.cells.some(([cx, cy]) => railCh(act, cx, cy) && !pile.cells.some(q => q[0] === cx && q[1] === cy + 1))); const up = pile.onRail ? 3 : 0; if (art.x < cam.x + VW && art.x + art.c.width > cam.x && art.y < cam.y + VH && art.y + art.c.height > cam.y) g.drawImage(art.c, art.x, art.y - up); }
        if (act.bomb) { const b = act.bomb; const flash = b.t > FUSE - 40 && b.t % 6 < 3; g.drawImage(spr("dynamite", 0), Math.round(b.x), Math.round(b.y)); if (flash) { g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(Math.round(b.x) + 2, Math.round(b.y) + 4, 6, 10); } }
        // the crack in the roof each rock falls from
        for (const f of act.falls) { g.fillStyle = "#1a0f08"; g.fillRect(f.x + 5, f.y, 6, 2); g.fillRect(f.x + 7, f.y + 2, 2, 1); }
        if (act.flag) g.drawImage(act.flag.taken ? spr("flagPole", 0) : spr("flag", Math.floor(frameNo / 18)), act.flag.x, act.flag.y);

        // creatures
        for (const f of act.foes) {
            if (NEW_FOES.has(f.kind)) { drawNewFoe(f); continue; }
            if (!f.alive) {
                if (f.deadT < 20) { g.globalAlpha = 1 - f.deadT / 20; g.drawImage(spr(f.kind, 0, f.vx < 0), Math.round(f.x), Math.round(f.y + f.deadT)); g.globalAlpha = 1; }
                continue;
            }
            if (f.kind === "rat") g.drawImage(spr("rat", Math.floor(f.anim || 0), f.vx < 0), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "bat") g.drawImage(spr("bat", Math.floor(frameNo / 8)), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "spider") {
                g.fillStyle = "rgba(220,220,230,0.7)"; g.fillRect(Math.round(f.ax), f.top, 1, Math.round(f.y - f.top) + 1);
                g.drawImage(spr("spider", Math.floor(frameNo / 12)), Math.round(f.x), Math.round(f.y));
            }
            else if (f.kind === "beetle") g.drawImage(spr("beetle", f.flipT > 0 ? 2 + (Math.floor(f.anim) % 2) : Math.floor(f.anim || 0) % 2, f.vx < 0 || (f.flipT > 0 && (f.lastVx || 0) < 0)), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "hammer") {
                // the rope it hangs by, from an iron plate under the roof down to its handle
                const rx = Math.round(f.x + 15), top = f.pivot, jig = f.state === "shake" ? (frameNo % 4 < 2 ? 1 : -1) : 0;
                g.fillStyle = "#0e0e14"; g.fillRect(rx - 4, top, 10, 3); g.fillStyle = "#6e6e84"; g.fillRect(rx - 3, top, 8, 2);
                for (let yy = top + 3; yy < f.y + 1; yy++) { const tw = (yy >> 1) % 2; g.fillStyle = tw ? "#c9a160" : "#946d34"; g.fillRect(rx + jig, yy, 1, 1); g.fillStyle = tw ? "#946d34" : "#ecd29a"; g.fillRect(rx + 1 + jig, yy, 1, 1); g.fillStyle = "#5c3f19"; g.fillRect(rx + 2 + jig, yy, 1, 1); }
                g.drawImage(spr("hammer", 0), Math.round(f.x) + jig, Math.round(f.y));
            }
            else if (f.kind === "bot") g.drawImage(spr("bot", Math.floor(f.anim || 0) % 2, f.vx < 0), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "jelly") g.drawImage(spr("jelly", Math.floor(frameNo / 20) % 2, false), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "steam") drawSteam(f);
            else if (f.kind === "piston") {
                // a plate on the wall, the rod, the head: brass and iron
                const wallX = f.side > 0 ? f.tx * TS : f.tx * TS + TS, Y = Math.round(f.y), L = Math.round(36 * f.out);
                const px0 = f.side > 0 ? wallX : wallX - 5;
                g.fillStyle = "#0e0e14"; g.fillRect(px0, Y - 4, 5, 18); g.fillStyle = "#7a8a9a"; g.fillRect(px0 + 1, Y - 3, 3, 16);
                const rx = f.side > 0 ? wallX + 5 : wallX - 5 - L;
                if (L > 0) { g.fillStyle = "#0e0e14"; g.fillRect(rx, Y + 3, L, 4); g.fillStyle = "#c8d2de"; g.fillRect(rx, Y + 4, L, 1); }
                const hx = f.side > 0 ? wallX + 5 + L : wallX - 5 - L - 6;
                g.fillStyle = "#1a120a"; g.fillRect(hx, Y - 1, 6, 12); g.fillStyle = "#c8962e"; g.fillRect(hx + 1, Y, 4, 10); g.fillStyle = "#f2cc4e"; g.fillRect(hx + 1, Y, 4, 2);
            }
            else if (f.kind === "grub") g.drawImage(spr("grub", Math.floor(f.anim || 0) % 2, f.vx < 0), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "charger") g.drawImage(spr("charger", Math.floor(f.anim || 0) % 2, f.vx < 0), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "wisp") g.drawImage(spr("wisp", Math.floor(frameNo / 9) % 2, f.vx < 0), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "hare") g.drawImage(spr("hare", f.onGround ? 0 : 1, f.vx < 0), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "crawler") g.drawImage(spr("crawler", Math.floor(f.anim || 0) % 2, f.vx < 0), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "swift") g.drawImage(spr("swift", f.state === "dive" ? 2 : Math.floor(frameNo / 6) % 2, f.vx < 0), Math.round(f.x), Math.round(f.y));
            else if (f.kind === "lizard") {
                const img = spr("lizard", Math.floor(f.anim || 0) % 2, f.side > 0);
                if (f.vy > 0) { g.save(); g.translate(Math.round(f.x), Math.round(f.y) + f.h); g.scale(1, -1); g.drawImage(img, 0, 0); g.restore(); }
                else g.drawImage(img, Math.round(f.x), Math.round(f.y));
            }
        }

        drawHero();
        if (act.nx) drawNew(cam, "front");
        drawAirCount();
        doorLight();
        /* IN FRONT OF EVERYTHING (14 Oct 2026, the editor's front layer): props
           Scout passes behind, as the crates a secret crawl comes out behind. */
        if (act.deco2.length) drawDeco(cam, "front");
        for (const o of act.front) { if (o.x > cam.x + VW + 64 || o.y > cam.y + VH + 64 || o.x < cam.x - 128 || o.y < cam.y - 128) continue; const img = propImg(o); if (img) g.drawImage(img, o.x, o.y); }
        drawLights(cam, "front");
        if (act.lava.size) drawLava(cam);
        if (act.water.size || act.flood) drawWater(cam);
        if (act.flows.length) drawFlows(cam);
        if (act.burners.length || act.blobs.length || act.splashes.length || act.oozes.length || act.puddles.length) drawHazards(cam);
        if (act.bumpers.length || act.springs.length) drawToys(cam);
        /* (17 Oct 2026, the owner's: "if there's water in a hidden room ... the water parts are visible") the
           hidden rooms' covers and the walk-behind walls, over the water, the lava and the rest, as well as Scout */
        for (const cv of act.covers) if (cv.alpha > 0 && cv.canvas) { g.globalAlpha = cv.alpha; g.drawImage(cv.canvas, cv.x, cv.y); g.globalAlpha = 1; }
        for (const fw of act.fronts || []) if (fw.x < cam.x + VW && fw.x + fw.canvas.width > cam.x && fw.y < cam.y + VH && fw.y + fw.canvas.height > cam.y) g.drawImage(fw.canvas, fw.x, fw.y);
        glowOverWalls(cam);
        if (TH.rainy || (TH.weather && act.weather)) drawRain(cam);
        if (darkOn() && state.mode !== "title" && !state.lightsOn) drawDark(cam);
        else if ((act.darkZones.length || act.darkRows) && state.mode !== "title" && !state.lightsOn && zonesInView(cam)) drawDark(cam, true);
        else drawBeacons();   // (lightsOn: a debug look at the Depths by daylight)
        if (act.travel) { const t = act.travel.t; g.fillStyle = `rgba(0,0,0,${(t < 18 ? t / 18 : Math.max(0, 1 - (t - 18) / 18)).toFixed(3)})`; g.fillRect(cam.x, cam.y, VW, VH); }

        for (const p of state.parts) {
            if (p.kind === "spark") { g.fillStyle = p.col; const s = p.t < 10 ? 2 : 1; g.fillRect(Math.round(p.x), Math.round(p.y), s, s); }
            else if (p.kind === "dust") { g.fillStyle = `rgba(200,170,130,${1 - p.t / 24})`; g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
            else if (p.kind === "bubble") { const mk = act.murk.size && act.murk.has(Math.floor(p.x / TS) + "," + Math.floor(p.y / TS)); g.fillStyle = mk ? "rgba(150,170,96,0.75)" : "rgba(220,245,255,0.8)"; g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); g.fillStyle = mk ? "rgba(196,210,140,0.85)" : "rgba(255,255,255,0.9)"; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
            else if (p.kind === "fuse") { g.fillStyle = p.t < 6 ? "#fff3b8" : p.t < 11 ? "#ffc840" : "#f5841a"; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
            else if (p.kind === "grit") { g.fillStyle = "#8a7a68"; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
            else if (p.kind === "shard") { g.fillStyle = p.ice ? (p.t < 18 ? "#d8f0ff" : "#6eb2e0") : TH.shard ? TH.shard[p.t < 18 ? 0 : 1] : (p.t < 18 ? "#6f665e" : "#4d4641"); g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
            else if (p.kind === "spark") { liq(Boolean(p.slime)); const k = p.t / p.life; g.fillStyle = heatHex(1 - k * 0.75); g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); if (k < 0.3 && !p.float) { g.fillStyle = heatHex(0.7); g.fillRect(Math.round(p.x - p.vx), Math.round(p.y - p.vy), 1, 1); } }
            else if (p.kind === "smoke") { const k = p.t / p.life, r = 2 + Math.round(k * 3); g.fillStyle = "rgba(60,52,50," + (0.32 * (1 - k)).toFixed(3) + ")"; g.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), r, r); }
            else if (p.kind === "ember") { const k = p.t / p.life; g.fillStyle = k < 0.15 || k > 0.8 ? "#9a3a0a" : k < 0.5 ? "#ffd25a" : "#f07a12"; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
            else if (p.kind === "padlock") g.drawImage(spr("padlock", 0), Math.round(p.x), Math.round(p.y));
        }
        for (const p of state.pops) FONT.draw(g, p.text, p.x, p.y - 8 - p.t * 0.5, { align: "center", color: p.text.length > 4 ? "#ffd23c" : "#ffffff" });
        if (debug.boxes) drawDebug(cam);

        g.setTransform(1, 0, 0, 1, 0, 0);
        // (22 Oct 2026: debug.clean, the dev tools' switch for filming the trailer: the picture alone, nothing over it)
        if (!debug.clean) { drawAir(); drawHint(); drawHud(); }
        drawOverlay();
        drawMixer();
    }

    /* THE DARK (13 Oct 2026, the owner's: "a couple of lit areas around
       checkpoints and things in the levels, but 90% is dark"). Over the
       whole picture a darkness, with the light cut out of it in soft
       circles: Scout's own (small, flickering), each lit brazier and torch,
       the checkpoint's, the door's, the key's, the toadstools', the wisps'.
       (Ariadne's thread, a gold line unspooled behind him, was here too: the
       owner had it taken out, 13 Oct 2026.) */
    /* THE WATER: over everything in it, a blue-green wash, deeper further
       down; its surface a bright line that moves; light rippling on it. */
    function drawWater(cam) {
        const F = act.flood;
        g.save();
        if (F && F.y < cam.y + VH && TH.sand) {
            // sand, not water: thick and gold, grains in it that stay where they are in the world, a bright skin on top
            const top = Math.max(cam.y, F.y);
            const gr = g.createLinearGradient(0, top, 0, cam.y + VH);
            gr.addColorStop(0, "rgba(222,178,96,0.86)"); gr.addColorStop(1, "rgba(168,116,58,0.94)");
            g.fillStyle = gr; g.fillRect(cam.x, top, VW, cam.y + VH - top);
            for (let i = 0; i < 260; i++) { const wx = cam.x - (cam.x % 64) + ((i * 97) % (VW + 64)), wy = top - (top % 64) + ((i * 61) % (cam.y + VH - top + 64)); if (wy < F.y || solidAt(Math.floor(wx / TS), Math.floor(wy / TS))) continue; g.fillStyle = i % 3 ? "rgba(120,80,30,0.5)" : "rgba(255,236,180,0.6)"; g.fillRect(wx, wy, 1, 1); }
            if (F.y > cam.y - 4) for (let x = 0; x < VW; x += 2) { if (solidAt(Math.floor((cam.x + x) / TS), Math.floor((F.y + 1) / TS))) continue; const wy = Math.round(F.y + Math.sin((cam.x + x) / 15 + frameNo / 30) * 0.8); g.fillStyle = "#fbe4a8"; g.fillRect(cam.x + x, wy, 2, 1); g.fillStyle = "#c8964e"; g.fillRect(cam.x + x, wy + 1, 2, 1); }
        } else if (F && F.y < cam.y + VH) {
            const top = Math.max(cam.y, F.y);
            const gr = g.createLinearGradient(0, top, 0, cam.y + VH);
            gr.addColorStop(0, "rgba(30,110,150,0.38)"); gr.addColorStop(1, "rgba(10,50,90,0.55)");
            g.fillStyle = gr; g.fillRect(cam.x, top, VW, cam.y + VH - top);
            if (F.y > cam.y - 4) for (let x = 0; x < VW; x += 2) { if (solidAt(Math.floor((cam.x + x) / TS), Math.floor((F.y + 1) / TS))) continue; const wy = Math.round(F.y + Math.sin((cam.x + x) / 11 + frameNo / 9) * 1.2); g.fillStyle = "rgba(200,240,255,0.75)"; g.fillRect(cam.x + x, wy, 2, 1); g.fillStyle = "rgba(120,200,235,0.4)"; g.fillRect(cam.x + x, wy + 1, 2, 1); }
        }
        // the currents: streaks of light running the way they flow
        for (const c of act.currents) {
            if (c.x > cam.x + VW || c.x + c.w < cam.x || c.y > cam.y + VH || c.y + c.h < cam.y) continue;
            const dir = Math.sign(c.dx), up = Math.sign(c.dy);
            for (let Y = c.y; Y < c.y + c.h; Y += TS) for (let X = c.x; X < c.x + c.w; X += TS) {
                const tx = Math.floor(X / TS), ty = Math.floor(Y / TS);
                if (X < cam.x - TS || X > cam.x + VW || Y < cam.y - TS || Y > cam.y + VH || !wetAt(X + 8, Y + 8)) continue;
                for (let i = 0; i < 2; i++) {
                    if (dir) { const off = ((frameNo * 2.2 * dir + (tx * 7 + ty * 13 + i * 9) * 3) % TS + TS) % TS; g.fillStyle = "rgba(200,240,255,0.35)"; g.fillRect(X + off, Y + 4 + i * 7 + ((tx + i) % 2), 5, 1); }
                    if (up) { const off = ((frameNo * 2.2 * up + (tx * 13 + ty * 7 + i * 9) * 3) % TS + TS) % TS; g.fillStyle = "rgba(200,240,255,0.35)"; g.fillRect(X + 4 + i * 7 + ((ty + i) % 2), Y + off, 1, 5); }
                }
            }
        }
        // the big bubbles from the vents
        for (const b of act.bigBubbles) {
            const r = Math.round(b.r), X = Math.round(b.x), Y = Math.round(b.y);
            g.fillStyle = "rgba(190,240,255,0.25)"; blob(X, Y, r, "rgba(190,240,255,0.22)");
            g.fillStyle = "rgba(230,250,255,0.85)";
            for (let a2 = 0; a2 < 28; a2++) { const an = a2 / 28 * Math.PI * 2; g.fillRect(Math.round(X + Math.cos(an) * r), Math.round(Y + Math.sin(an) * r), 1, 1); }
            g.fillStyle = "#ffffff"; g.fillRect(X - Math.round(r / 2), Y - Math.round(r / 2), 2, 1); g.fillRect(X - Math.round(r / 2), Y - Math.round(r / 2) + 1, 1, 1);
        }
        for (const k of act.water) {
            const [tx, ty] = k.split(",").map(Number), X = tx * TS, Y = ty * TS;
            if (X < cam.x - TS || X > cam.x + VW || Y < cam.y - TS || Y > cam.y + VH) continue;
            // (water on a wall's tile: only through the wall's see-through pixels, its rounded corner; renderStatic)
            const ch = act.tiles[ty][tx], wall = ch === "#" || ch === "%" || Boolean(SLOPES[ch] || CEILS[ch]);   // (a slope's tile as a wall's: only its open part)
            const p = wall ? act.underWall && act.underWall.get(k) : null; if (wall && !p) continue;
            // (21 Oct 2026) part full: its surface part way down (FLOWING WATER), only the water below it drawn
            const top = act.waterTop.size ? act.waterTop.get(k) : undefined, Y0 = top === undefined ? Y : top;
            const clip = wall || top !== undefined;
            if (clip) { g.save(); if (wall) g.clip(p); if (top !== undefined) { g.beginPath(); g.rect(X, Math.floor(Y0) - 2, TS, Y + TS - Math.floor(Y0) + 2); g.clip(); } }
            if (act.murk.has(k)) murkTile(tx, ty, X, Y, top);
            else {
                if (top === undefined) { g.fillStyle = "rgba(30,110,150,0.42)"; g.fillRect(X, Y, TS, TS); }
                else { const y0 = Math.round(Y0); g.fillStyle = "rgba(30,110,150,0.42)"; g.fillRect(X, y0, TS, Y + TS - y0); }
                // (17 Oct 2026) the bright surface only where it is open above: not along the roof of a flooded tunnel
                if (top !== undefined || (!act.water.has(tx + "," + (ty - 1)) && !solidAt(tx, ty - 1))) for (let x = 0; x < TS; x += 2) { const wy = Math.round(Y0 + Math.sin((X + x) / 11 + frameNo / 9) * 1.2); g.fillStyle = "rgba(200,240,255,0.7)"; g.fillRect(X + x, wy, 2, 1); }
            }
            if (clip) g.restore();
        }
        g.restore();
    }
    /* MURKY WATER (17 Oct 2026, the owner's: "a dark green, mirky version of
       Water that i can use in the mine zone"): water as any other to swim
       in, but stagnant: a thick dark green that Scout half disappears into,
       darker the deeper it goes; silt hanging in it and drifting; on top a
       dull skin of scum that barely moves, with flecks of weed floating on
       it, and now and then a bubble of marsh gas swelling up through it and
       bursting. */
    function murkTile(tx, ty, X, Y, top) {
        // how far down from its top this tile is: the green thickens and darkens all the way down, two pixels at a time
        const above = top === undefined && act.water.has(tx + "," + (ty - 1));
        let d = 0; while (d < 4 && act.water.has(tx + "," + (ty - d - 1))) d++;
        // (part full: the green from its surface down, the skin and weed and gas on that)
        if (top !== undefined) { d = 0; const y0 = Math.round(top); for (let y = y0; y < Y + TS; y += 2) { const t = Math.min(1, (y - y0) / 56); g.fillStyle = `rgba(${Math.round(38 - 22 * t)},${Math.round(64 - 32 * t)},${Math.round(24 - 12 * t)},${(0.68 + 0.18 * t).toFixed(3)})`; g.fillRect(X, y, TS, Math.min(2, Y + TS - y)); } }
        else for (let y = 0; y < TS; y += 2) { const t = Math.min(1, (d * TS + y) / 56); g.fillStyle = `rgba(${Math.round(38 - 22 * t)},${Math.round(64 - 32 * t)},${Math.round(24 - 12 * t)},${(0.68 + 0.18 * t).toFixed(3)})`; g.fillRect(X, Y + y, TS, 2); }
        // the silt: specks hanging in it, drifting slowly round where they are
        for (let i = 0; i < 3; i++) {
            const h1 = hashTile(tx * 3 + i, ty * 5 + 1), h2 = hashTile(ty * 7 + i, tx * 3 + 2);
            const sx = X + Math.floor(h1 * TS + Math.sin(frameNo / (70 + i * 13) + h2 * 6) * 2), sy = Y + Math.floor(h2 * TS + Math.cos(frameNo / (90 + i * 11) + h1 * 6) * 1.5);
            g.fillStyle = i ? "rgba(120,136,70,0.45)" : "rgba(160,170,96,0.5)"; g.fillRect(sx, sy, 1, 1);
        }
        if (top !== undefined) Y = Math.round(top); else if (above || solidAt(tx, ty - 1)) return;
        // the skin of scum along the top, a slow swell in it
        for (let x = 0; x < TS; x += 2) {
            const wy = Math.round(Y + Math.sin((X + x) / 17 + frameNo / 40) * 0.6);
            g.fillStyle = "#6f7a34"; g.fillRect(X + x, wy, 2, 1);
            g.fillStyle = "rgba(58,74,28,0.9)"; g.fillRect(X + x, wy + 1, 2, 1);
        }
        // weed floating on it, drifting a little one way and back
        for (let i = 0; i < 2; i++) {
            const q = hashTile(tx * 11 + i, ty * 13 + 7); if (q > 0.62) continue;
            const fx = X + Math.floor(q * 24) % 13 + Math.round(Math.sin(frameNo / 150 + q * 9) * 1.5), fw = 2 + Math.floor(q * 9) % 3;
            g.fillStyle = q < 0.3 ? "#8e9a42" : "#55692a"; g.fillRect(fx, Y - 1 + Math.round(Math.sin((fx) / 17 + frameNo / 40) * 0.6), fw, 1);
        }
        // marsh gas: a bubble swells through the skin, and bursts with a fleck thrown up
        const per = 260 + Math.floor(hashTile(tx, ty * 3) * 260), f = (frameNo + Math.floor(hashTile(ty, tx * 3) * per)) % per;
        if (f < 26) {
            const bx = X + 4 + Math.floor(hashTile(tx * 5, ty) * 8);
            if (f < 20) { const r = f < 8 ? 1 : 2; g.fillStyle = "#7d8a3c"; g.fillRect(bx - r, Y - r, r * 2 + 1, r); g.fillStyle = "#a9b264"; g.fillRect(bx - r + 1, Y - r, 1, 1); }
            else { g.fillStyle = "rgba(169,178,100,0.8)"; g.fillRect(bx - 2, Y - 2 - (f - 20), 1, 1); g.fillRect(bx + 2, Y - 3 - (f - 20), 1, 1); }
        }
    }
    let darkCv = null;
    /* A DARK AREA (17 Oct 2026, the owner's: "the ability to make a section
       or area of a level dark and only lit by lanterns etc similar to how
       dark depths works"): a box of the passage dark as the Depths are, its
       edges fading out over fade pixels so the dark comes on as Scout walks
       into it; everything that lights the Depths (his own light, lanterns,
       lights, braziers, glowing creatures) lights it. Drawn into ctx with its
       top left at (ox, oy) of the map. */
    /* (17 Oct 2026, the owner's: "light from [the walls] shouldn't spill into
       the playable area of a dark area"): a dark area fades only where it
       opens onto open air, the way Scout comes in; where its side meets rock
       it stays fully dark right up to the rock, with no lit band along the
       wall. The rock itself is left as it is. (Done by blurring the area
       together with the rock beside it, then keeping the blur only inside the
       area, and in the open air at its open sides.) Made once for each area
       and the rock about it (darkZoneArt), and kept. */
    const DARK_SOLID = new Set(["#", "%", "X", "V", "8", "9", "2", "Q", "i"]);
    /* (23 Oct 2026, the owner's: "Dark areas don't merge well with walls and slopes") the dark worked out a pixel at a
       time where it meets rock: a slope's tile is rock under its line and air over it, not one or the other */
    const darkRockPx = (a, solidTile, wx, wy) => { const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS); if (solidTile(tx, ty)) return true; const S = SLOPES[tileAtIn(a, tx, ty)], C = CEILS[tileAtIn(a, tx, ty)]; return S ? wy - ty * TS >= slopeY(S, wx - tx * TS + 0.5) : C ? wy - ty * TS < slopeY(C, wx - tx * TS + 0.5) : false; };
    const darkArt = new WeakMap();
    function blurBox(A, W, H, r) {
        if (r < 1) return;
        const T = new Float32Array(A.length), n = 2 * r + 1;
        for (let pass = 0; pass < 3; pass++) {
            for (let y = 0; y < H; y++) { const row = y * W; let s = 0; for (let x = -r; x <= r; x++) s += A[row + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { T[row + x] = s / n; s += A[row + Math.min(W - 1, x + r + 1)] - A[row + Math.max(0, x - r)]; } }
            for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += T[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { A[y * W + x] = s / n; s += T[Math.min(H - 1, y + r + 1) * W + x] - T[Math.max(0, y - r) * W + x]; } }
        }
    }
    /* HIDDEN ROOMS IN THE DARK (19 Oct 2026, the owner's: "if a hidden area is Dark, black overlay tiles reveal
       the hidden area before you've found it"). A hidden room is open air behind a picture of rock (its cover);
       the dark, worked out from the map, went black over its open tiles and left the real rock round it as it
       was, its shape plain through the cover. So the dark is made both ways (hide: the covered tiles taken for
       rock, and nothing painted dark on them; and as they are) and drawDark goes from the one to the other over
       each room as its cover fades. coveredAt: the act's covered tiles, as a mask, made once. */
    // which cover (its index + 1) each tile is under, 0 for none, made once for the act
    function coverOfTile(a) {
        if (!a.covers || !a.covers.length) return null;
        if (!a.coverIdx) { a.coverIdx = new Uint16Array(a.w * a.h); a.covers.forEach((cv, i) => { for (const [cx, cy] of cv.tiles) a.coverIdx[cy * a.w + cx] = i + 1; }); }
        return a.coverIdx;
    }
    function coveredAt(a, tx, ty) {
        if (!a.covers || !a.covers.length) return false;
        if (!a.coverMask) { a.coverMask = new Uint8Array(a.w * a.h); for (const cv of a.covers) for (const [cx, cy] of cv.tiles) a.coverMask[cy * a.w + cx] = 1; }
        return tx >= 0 && ty >= 0 && tx < a.w && ty < a.h && a.coverMask[ty * a.w + tx] === 1;
    }
    function darkZoneArt(a, z, hide) {
        let m = darkArt.get(a); if (!m) { m = new Map(); darkArt.set(a, m); }
        const r = Math.max(0, Math.round((z.fade || 0) / 3)), ring = r ? Math.ceil((3 * r + 2) / TS) : 0, pad = ring * TS + 3 * r + 2;
        const tx0 = Math.floor(z.x / TS), ty0 = Math.floor(z.y / TS), tx1 = Math.floor((z.x + z.w - 1) / TS), ty1 = Math.floor((z.y + z.h - 1) / TS);
        const solid = (tx, ty) => tx >= 0 && ty >= 0 && tx < a.w && ty < a.h && (DARK_SOLID.has(tileAtIn(a, tx, ty)) || (hide && coveredAt(a, tx, ty)));
        // the rock beside it, as a key (so the editor's changes to it are seen)
        let rock = "";
        if (ring) for (let ty = ty0 - ring; ty <= ty1 + ring; ty++) for (let tx = tx0 - ring; tx <= tx1 + ring; tx++) rock += solid(tx, ty) ? "1" : "0";
        const key = [z.x, z.y, z.w, z.h, r, z.rgb.join(","), z.a, rock, hide ? "hide" : ""].join("|");
        let art = m.get(key); if (art) return art;
        const X0 = Math.floor(z.x - pad), Y0 = Math.floor(z.y - pad), W = Math.ceil(z.w + pad * 2), H = Math.ceil(z.h + pad * 2);
        const A = new Float32Array(W * H), B = new Float32Array(W * H);
        const fill = (M, px, py, w, h) => { for (let y = Math.max(0, py - Y0); y < Math.min(H, py - Y0 + h); y++) for (let x = Math.max(0, px - X0); x < Math.min(W, px - X0 + w); x++) M[y * W + x] = 1; };
        fill(A, z.x, z.y, z.w, z.h); fill(B, z.x, z.y, z.w, z.h);
        if (ring) {
            // the rock against its sides, straight out from them (a tile round its corners), as deep as the blur reaches
            const seen = new Set(), q = [];
            for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) if (solid(tx, ty)) { seen.add(tx + "," + ty); q.push([tx, ty, 1]); }
            for (let i = 0; i < q.length; i++) {
                const [tx, ty, d] = q[i]; fill(A, tx * TS, ty * TS, TS, TS);
                if (d >= ring) continue;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = tx + dx, ny = ty + dy, k = nx + "," + ny;
                    if (seen.has(k) || !solid(nx, ny) || (!(nx >= tx0 && nx <= tx1) && !(ny >= ty0 && ny <= ty1))) continue;
                    seen.add(k); q.push([nx, ny, d + 1]);
                }
            }
        }
        // (23 Oct 2026) the lit open air outside it, blurred: rock it lights keeps its light
        const L = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const wx = X0 + xx, wy = Y0 + y; if (!(wx >= z.x && wx < z.x + z.w && wy >= z.y && wy < z.y + z.h) && !darkRockPx(a, solid, wx, wy)) L[y * W + xx] = 1; }
        blurBox(A, W, H, r); blurBox(B, W, H, r); blurBox(L, W, H, Math.max(1, Math.round(r / 2)));
        const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"), D = x.createImageData(W, H), d = D.data;
        for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
            const i = y * W + xx, wx = X0 + xx, wy = Y0 + y, inside = wx >= z.x && wx < z.x + z.w && wy >= z.y && wy < z.y + z.h;
            // inside: the blur with the rock (no fading along a wall); outside: none on rock, and in the open air only the area's own fade
            const v = inside ? A[i] : darkRockPx(a, solid, wx, wy) ? A[i] * (1 - Math.min(1, L[i] * 2)) : B[i];   // (23 Oct 2026: the rock beside it in the dark too, but lit where lit air meets it)
            if (v <= 0.002) continue;
            d[i * 4] = z.rgb[0]; d[i * 4 + 1] = z.rgb[1]; d[i * 4 + 2] = z.rgb[2]; d[i * 4 + 3] = Math.round(255 * z.a * Math.min(1, v));
        }
        x.putImageData(D, 0, 0);
        art = { c, x: X0, y: Y0 }; if (m.size > 40) m.delete(m.keys().next().value); m.set(key, art);
        return art;
    }
    /* PAINTED DARK (17 Oct 2026, the owner's: "allow me to draw dark areas tile
       by tile rather than a fixed rectangle", and "a dark area transition ...
       where i draw the area where a dark area and light area have a natural
       gradient"): the level's dark layer. d is dark, as a dark area is; t is
       the turn between: there the dark goes from full beside the d to none
       beside the light, by how far each tile is from each (through t only),
       however wide and whatever shape it is painted. As a dark area: soft
       where it opens onto lit air, dark right up to rock, the rock left as
       it is. Its soft edge, darkness and colour are the passage's
       (settings.darkPaint). Made once for each act and kept. */
    /* (23 Oct 2026, the owner's: "make sure the game isn't laggy") what the first frame of a passage made (the dark, about
       0.2 s; the hidden rooms' covers put on screen, 0.1 s) and what finding a room made (the dark with its cover gone, as
       long again), all made as the passage is built instead, while it loads: no hitch as play starts or a room is found */
    function warmAct(a) {
        for (const hide of a.covers && a.covers.length ? [true, false] : [true]) {
            darkPaintArt(a, hide);
            for (const z of a.darkZones || []) if (z.rgb) darkZoneArt(a, z, hide);
        }
        const w = blankCanvas(1, 1).getContext("2d");
        for (const cv of a.covers || []) if (cv.canvas) w.drawImage(cv.canvas, 0, 0);
    }
    function darkPaintArt(a, hide) {
        if (!a.darkRows) return null;
        let m = darkArt.get(a); if (!m) { m = new Map(); darkArt.set(a, m); }
        const P = (a.settings && a.settings.darkPaint) || {}, fade = P.fade >= 0 ? P.fade : 32, alpha = P.alpha >= 0 && P.alpha <= 1 ? P.alpha : 0.965, rgb = hexRgb(P.color || "#030207");
        const key = "paint|" + fade + "|" + alpha + "|" + rgb.join(",") + (hide ? "|hide" : "");
        if (m.has(key)) return m.get(key);
        /* (hide: a covered tile painted as the rock round it is, the nearest real rock's paint: dark if the rock
           about it is painted dark, clear if not; whatever was painted on the room itself shows only when found) */
        const R0 = a.darkRows, R = hide ? R0.map((row, y) => row.split("").map((ch, x) => {
            if (!coveredAt(a, x, y)) return ch;
            for (let r = 1; r <= 6; r++) { const n = { d: 0, t: 0, ".": 0 }; let any = false; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue; const nx = x + i, ny = y + j; if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h || coveredAt(a, nx, ny) || !DARK_SOLID.has(tileAtIn(a, nx, ny))) continue; const c2 = (R0[ny] && R0[ny][nx]) || "."; n[c2 in n ? c2 : "."]++; any = true; } if (any) return n.d >= n.t && n.d >= n["."] ? "d" : n.t >= n["."] ? "t" : "."; }
            return ".";
        }).join("")) : R0, at = (x, y) => (R[y] && R[y][x]) || ".";
        const TW = a.w, THt = a.h;
        const solid = (tx, ty) => tx >= 0 && ty >= 0 && tx < TW && ty < THt && (DARK_SOLID.has(tileAtIn(a, tx, ty)) || (hide && coveredAt(a, tx, ty)));
        // each tile's dark: d full; t by how near the dark it is against how near the light
        const val = new Float32Array(TW * THt), N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const dist = from => {
            const D = new Int32Array(TW * THt).fill(-1), q = [];
            for (let y = 0; y < THt; y++) for (let x = 0; x < TW; x++) if (from(x, y)) { D[y * TW + x] = 0; q.push(y * TW + x); }
            for (let i = 0; i < q.length; i++) { const k = q[i], x = k % TW, y = (k - x) / TW; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= TW || ny >= THt) continue; const nk = ny * TW + nx; if (D[nk] >= 0 || at(nx, ny) !== "t") continue; D[nk] = D[k] + 1; q.push(nk); } }
            return D;
        };
        const toDark = dist((x, y) => at(x, y) === "d"), toLight = dist((x, y) => at(x, y) !== "d" && at(x, y) !== "t" && !solid(x, y));
        for (let y = 0; y < THt; y++) for (let x = 0; x < TW; x++) {
            const c = at(x, y), k = y * TW + x;
            if (c === "d") val[k] = 1;
            else if (c === "t") { const dd = toDark[k], dl = toLight[k]; val[k] = dd < 0 ? 0 : dl < 0 ? 1 : dl / (dd + dl); }
        }
        // the rock beside it takes the dark of what it is beside, as deep as the blur reaches (so no lit band along a wall)
        const r = Math.max(0, Math.round(fade / 3)), ring = r ? Math.ceil((3 * r + 2) / TS) : 0;
        const rockV = new Float32Array(TW * THt), base = new Float32Array(TW * THt);
        if (ring) {
            let q = [];
            for (let y = 0; y < THt; y++) for (let x = 0; x < TW; x++) if (val[y * TW + x] > 0) q.push(y * TW + x);
            const seen = new Uint8Array(TW * THt);
            for (let step = 0; step < ring && q.length; step++) {
                const next = [];
                // (23 Oct 2026: each tile further into the rock a little less dark, so a wall goes from the dark to its own light over the ring, not all at once)
                const fall = 1 - step / ring;
                for (const k of q) { const x = k % TW, y = (k - x) / TW, v = val[k] || base[k]; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (!solid(nx, ny)) continue; const nk = ny * TW + nx; if (at(nx, ny) === "d" || at(nx, ny) === "t") continue; if (v > base[nk]) base[nk] = v; if (v * fall > rockV[nk]) rockV[nk] = v * fall; if (!seen[nk]) { seen[nk] = 1; next.push(nk); } } }
                q = next;
            }
        }
        // rock facing lit open air keeps its light: none of the dark carried into it (so it does not shade the lit place either)
        for (let y = 0; y < THt; y++) for (let x = 0; x < TW; x++) { const k = y * TW + x; if (!(rockV[k] > 0)) continue; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < TW && ny < THt && !solid(nx, ny) && at(nx, ny) !== "d" && at(nx, ny) !== "t") { rockV[k] = 0; break; } } }
        const b = a.darkBox, pad = ring * TS + 3 * r + 2;
        const X0 = Math.max(0, b.x - pad), Y0 = Math.max(0, b.y - pad), X1 = Math.min(TW * TS, b.x + b.w + pad), Y1 = Math.min(THt * TS, b.y + b.h + pad), W = X1 - X0, H = Y1 - Y0;
        const kind = new Uint8Array(TW * THt); for (let ty = 0; ty < THt; ty++) for (let tx = 0; tx < TW; tx++) kind[ty * TW + tx] = solid(tx, ty) ? 1 : CEILS[tileAtIn(a, tx, ty)] ? 2 : SLOPES[tileAtIn(a, tx, ty)] ? 2 : 0;
        const rockPx = (wx, wy) => { const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS), kd = tx >= 0 && ty >= 0 && tx < TW && ty < THt ? kind[ty * TW + tx] : 1; return kd === 1 || (kd === 2 && darkRockPx(a, solid, wx, wy)); };
        const A = new Float32Array(W * H), B = new Float32Array(W * H);
        for (let ty = Math.floor(Y0 / TS); ty * TS < Y1; ty++) for (let tx = Math.floor(X0 / TS); tx * TS < X1; tx++) {
            const k = ty * TW + tx, v = val[k], rv = rockV[k]; if (!(v > 0) && !(rv > 0)) continue;
            for (let y = Math.max(0, ty * TS - Y0); y < Math.min(H, ty * TS - Y0 + TS); y++) for (let x = Math.max(0, tx * TS - X0); x < Math.min(W, tx * TS - X0 + TS); x++) { A[y * W + x] = Math.max(v, rv); B[y * W + x] = v; }
        }
        // the lit open air near, blurred as the dark is: rock it lights keeps its light (a thin wall between the dark and a lit place, its lit face lit)
        const L = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const tx = Math.floor((X0 + xx) / TS), ty = Math.floor((Y0 + y) / TS), ch = at(tx, ty); if (ch !== "d" && ch !== "t" && !rockPx(X0 + xx, Y0 + y)) L[y * W + xx] = 1; }
        blurBox(A, W, H, r); blurBox(B, W, H, r); blurBox(L, W, H, Math.max(1, Math.round(r / 2)));
        const c = document.createElement("canvas"); c.width = Math.max(1, W); c.height = Math.max(1, H); const x = c.getContext("2d"), Dd = x.createImageData(c.width, c.height), d = Dd.data;
        for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
            const i = y * W + xx, tx = Math.floor((X0 + xx) / TS), ty = Math.floor((Y0 + y) / TS), ch = at(tx, ty);
            // painted: the blur with the rock; rock beside it (a wall's, or under a slope's line): the dark carried into it; open air: the dark's own fade
            /* (23 Oct 2026) one dark, blurred with the rock, for the painted tiles and the open air round them alike (the two had
               been worked out apart, and where they met beside rock it showed as a step along the tiles); rock itself kept lit
               where lit air meets it */
            const v = ch !== "d" && ch !== "t" && rockPx(X0 + xx, Y0 + y) ? A[i] * (1 - Math.min(1, L[i] * 2)) : A[i];
            if (v <= 0.002) continue;
            d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = Math.round(255 * alpha * Math.min(1, v));
        }
        x.putImageData(Dd, 0, 0);
        const art = { c, x: X0, y: Y0 }; m.set(key, art); return art;
    }
    function darkZoneFill(ctx, z, ox, oy, a, hide) {
        if (a && z.rgb) { const art = darkZoneArt(a, z, hide); ctx.drawImage(art.c, art.x - ox, art.y - oy); return; }
        const X = z.x - ox, Y = z.y - oy, W = z.w, H = z.h, f = Math.max(0, Math.min(z.fade, Math.floor(W / 2), Math.floor(H / 2)));
        ctx.fillStyle = z.fill; ctx.fillRect(X + f, Y + f, W - 2 * f, H - 2 * f);
        if (!f) return;
        const lin = (x0, y0, x1, y1) => { const gr = ctx.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, z.clear); gr.addColorStop(1, z.fill); return gr; };
        ctx.fillStyle = lin(X, 0, X + f, 0); ctx.fillRect(X, Y + f, f, H - 2 * f);
        ctx.fillStyle = lin(X + W, 0, X + W - f, 0); ctx.fillRect(X + W - f, Y + f, f, H - 2 * f);
        ctx.fillStyle = lin(0, Y, 0, Y + f); ctx.fillRect(X + f, Y, W - 2 * f, f);
        ctx.fillStyle = lin(0, Y + H, 0, Y + H - f); ctx.fillRect(X + f, Y + H - f, W - 2 * f, f);
        for (const [cx, cy, sx, sy] of [[X + f, Y + f, X, Y], [X + W - f, Y + f, X + W - f, Y], [X + f, Y + H - f, X, Y + H - f], [X + W - f, Y + H - f, X + W - f, Y + H - f]]) {
            const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, f); gr.addColorStop(0, z.fill); gr.addColorStop(1, z.clear);
            ctx.fillStyle = gr; ctx.fillRect(sx, sy, f, f);
        }
    }
    const zonesInView = cam => (act.darkBox && act.darkBox.x - 48 < cam.x + VW && act.darkBox.x + act.darkBox.w + 48 > cam.x && act.darkBox.y - 48 < cam.y + VH && act.darkBox.y + act.darkBox.h + 48 > cam.y) || act.darkZones.some(z => { const p = (z.fade || 0) + 2; return z.x - p < cam.x + VW && z.x + z.w + p > cam.x && z.y - p < cam.y + VH && z.y + z.h + p > cam.y; });
    function drawDark(cam, zonesOnly) {
        if (!darkCv) { darkCv = document.createElement("canvas"); darkCv.width = VW; darkCv.height = VH; }
        const x = darkCv.getContext("2d"), h = hero;
        x.globalCompositeOperation = "source-over";
        x.clearRect(0, 0, VW, VH);
        const SD = act.settings.dark;
        if (zonesOnly) {
            const arts = hide => { for (const z of act.darkZones) darkZoneFill(x, z, cam.x, cam.y, act, hide); const pa = darkPaintArt(act, hide); if (pa) x.drawImage(pa.c, pa.x - cam.x, pa.y - cam.y); };
            arts(true);
            // a room being found (its cover fading): over its tiles, from the dark it hid behind to its own, as the cover goes
            for (const cv of act.covers) {
                if (!(cv.alpha < 1)) continue;
                x.save(); x.beginPath();
                let any = false;
                for (const [tx, ty] of cv.tiles) { const sx = tx * TS - cam.x, sy = ty * TS - cam.y; if (sx > -TS && sy > -TS && sx < VW && sy < VH) { x.rect(sx, sy, TS, TS); any = true; } }
                if (any) { x.clip(); x.clearRect(0, 0, VW, VH); x.globalAlpha = cv.alpha; arts(true); x.globalCompositeOperation = "lighter"; x.globalAlpha = 1 - cv.alpha; arts(false); }
                x.restore();
            }
        }
        else { x.fillStyle = SD && SD.alpha >= 0 && SD.alpha !== null && SD.alpha !== undefined ? `rgba(${hexRgb(SD.color || "#030207").join(",")},${SD.alpha})` : TH.darkFill || "rgba(3,2,7,0.965)"; x.fillRect(0, 0, VW, VH); }
        x.globalCompositeOperation = "destination-out";
        const hole = (wx, wy, r, k) => {
            const sx = wx - cam.x, sy = wy - cam.y, K = k === undefined ? 1 : k;
            if (!(r > 0) || !(K > 0) || sx < -r || sy < -r || sx > VW + r || sy > VH + r) return;
            const gr = x.createRadialGradient(sx, sy, r * 0.3, sx, sy, r);
            gr.addColorStop(0, `rgba(0,0,0,${K})`); gr.addColorStop(0.6, `rgba(0,0,0,${0.9 * K})`); gr.addColorStop(1, "rgba(0,0,0,0)");
            x.fillStyle = gr; x.fillRect(sx - r, sy - r, r * 2, r * 2);
        };
        const flick = 1 + Math.sin(frameNo / 6) * 0.03 + Math.sin(frameNo / 2.3) * 0.015;
        // (13 Oct 2026, the owner's: "the radius of the glow for our own torch needs to be brighter/bigger")
        const AS = act.settings;
        /* (17 Oct 2026, the owner's: "an option for the light that naturally surrounds Scout so i can tone it
           down or remove it altogether"): its size (0 now none at all, not the zone's) and how much it opens the dark */
        const said = v => typeof v === "number" && v >= 0;
        const own = act.torch ? (said(AS.torchLight) ? AS.torchLight : 112) : said(AS.heroLight) ? AS.heroLight : TH.torch ? 34 : (TH.heroLight || 64);
        const ownK = said(AS.heroLightK) ? Math.min(1, AS.heroLightK) : 1;
        if (state.mode !== "dying" || state.t < 60) hole(h.x + h.w / 2, h.y + h.h / 2 - 2, own * flick, ownK);
        for (const r of act.roots) if (r.burn && r.burn < 70) hole(r.x * TS + 8, r.y * TS + 8, 80);
        for (const [lx, ly, r] of lights()) hole(lx, ly, r * flick);
        for (const gl of act.glows) hole(gl[0], gl[1], gl[2]);
        // a light that opens the dark but is no light to a wisp (the Depths' toadstools)
        for (const l of act.lights) if (l.reveal > 0 && !l.scare && !(l.cover && l.cover.alpha > 0.5)) hole(l.x, l.y, l.reveal);
        for (const f of act.foes) if (f.alive && f.kind === "wisp") hole(f.x + 6, f.y + 6, 34);
        for (const f of act.foes) if (f.alive && f.kind === "grub") hole(f.x + 10, f.y + 5, 30);
        if (act.bomb) hole(act.bomb.x + 5, act.bomb.y, 48);
        g.drawImage(darkCv, cam.x, cam.y);
        if (zonesOnly) { drawBeacons(); return; }
        // warm the lit places a little
        g.save(); g.globalCompositeOperation = "lighter";
        for (const [lx, ly, r] of lights()) { const gr = g.createRadialGradient(lx, ly, 2, lx, ly, r * 0.7); gr.addColorStop(0, "rgba(255,150,60,0.10)"); gr.addColorStop(1, "rgba(255,150,60,0)"); g.fillStyle = gr; g.fillRect(lx - r, ly - r, r * 2, r * 2); }
        g.restore();
        drawBeacons();
    }
    // The beacons, turning (the Station's red ones), over it all.
    function drawBeacons() {
        for (const l of act.lights) {
            if (l.kind !== "beacon") continue;
            const k = 0.5 + Math.sin(frameNo / (l.pulse > 0 ? l.pulse / (2 * Math.PI) : 12) + l.x - 8) * 0.5, [r, gg, b] = l.rgb, R = l.radius || 70;
            g.save(); g.globalCompositeOperation = "lighter";
            const gr = g.createRadialGradient(l.x, l.y, 1, l.x, l.y, R); gr.addColorStop(0, `rgba(${r},${gg},${b},${l.intensity * k})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
            g.fillStyle = gr; g.fillRect(l.x - R, l.y - R, R * 2, R * 2); g.restore();
        }
    }
    const darkOn = () => { const SD = act.settings.dark; return SD && (SD.on === true || SD.on === false) ? SD.on : Boolean(TH.dark); };
    /* THE LEVEL'S LIGHTS (14 Oct 2026, the editor's "plenty of lighting
       options"), added to what is there: a point's round glow; a spot's
       cone; a shaft, a beam falling at its angle and widening as it goes,
       motes turning in it; flickering and breathing as they are set. Behind
       Scout ("back") or over him ("front"). */
    function drawLights(cam, layer) {
        if (!act.lights.length) return;
        g.save();
        g.globalCompositeOperation = "lighter";
        for (const l of act.lights) {
            if (l.layer !== layer || l.kind === "beacon" || !(l.intensity > 0) || !(l.radius > 0 || l.kind === "shaft")) continue;
            if (l.cover && l.cover.alpha > 0.5) continue;
            const reach = l.kind === "shaft" ? Math.max(l.w, l.h) * 1.8 : l.radius;
            if (l.x + reach < cam.x || l.x - reach > cam.x + VW || l.y + reach < cam.y || l.y - reach > cam.y + VH) continue;
            const fl = 1 + (Math.sin(frameNo / 5 + l.x) + Math.sin(frameNo / 2.3 + l.y) * 0.5) * l.flicker;
            const br = l.pulse > 0 ? 0.7 + 0.3 * Math.sin(frameNo * 2 * Math.PI / l.pulse) : 1;
            const I = Math.max(0, Math.min(1, l.intensity * br)), [r, gg, b] = l.rgb;
            if (l.kind === "shaft") {
                const ang = (l.angle - 90) * Math.PI / 180, len = l.h * fl;
                g.save(); g.translate(l.x, l.y); g.rotate(ang);
                const gr = g.createLinearGradient(0, 0, 0, len);
                gr.addColorStop(0, `rgba(${r},${gg},${b},${I})`); gr.addColorStop(0.7, `rgba(${r},${gg},${b},${I * 0.35})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
                g.fillStyle = gr;
                g.beginPath(); g.moveTo(-l.w / 2, 0); g.lineTo(l.w / 2, 0); g.lineTo(l.w * 0.8, len); g.lineTo(-l.w * 0.8, len); g.closePath(); g.fill();
                // motes, turning slowly in the beam
                for (let i = 0; i < 7; i++) {
                    const hs = hashTile(Math.round(l.x) + i * 17, Math.round(l.y) + i * 5), yy = ((hs * len + frameNo * (0.12 + hs * 0.1)) % len), xx = Math.sin(frameNo / 60 + i * 2) * l.w * 0.3 * (0.5 + yy / len);
                    g.fillStyle = `rgba(${r},${gg},${b},${(I * 1.4 * (1 - yy / len)).toFixed(3)})`; g.fillRect(Math.round(xx), Math.round(yy), 1, 1);
                }
                g.restore();
                continue;
            }
            const R = l.radius * fl;
            const gr = g.createRadialGradient(l.x, l.y, 1, l.x, l.y, R);
            gr.addColorStop(0, `rgba(${r},${gg},${b},${I})`); gr.addColorStop(0.5, `rgba(${r},${gg},${b},${I / 3})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
            g.fillStyle = gr;
            if (l.kind === "spot") {
                const a0 = (l.angle - l.spread / 2) * Math.PI / 180, a1 = (l.angle + l.spread / 2) * Math.PI / 180;
                g.beginPath(); g.moveTo(l.x, l.y); g.arc(l.x, l.y, R, a0, a1); g.closePath(); g.fill();
            } else g.fillRect(l.x - R, l.y - R, R * 2, R * 2);
        }
        g.restore();
    }

    /* THE OPEN DOOR'S LIGHT (13 Oct 2026: "a blinding glowing light coming
       from inside ... this adds mystery of what's next"). Added light, not
       paint: a white-hot core filling the doorway, a bloom round it, and
       shafts fanning out across the floor and walls, slowly turning and
       breathing. Opening, it flares; as Scout steps in it swells over him;
       once the act is done it keeps growing, until the room is lost in it. */
    function doorLight() {
        const d = act.door;
        if (!d || !act.unlocked) return;
        const since = frameNo - (act.unlockT || frameNo);
        const flare = since < 40 ? (1 - since / 40) * 0.4 : 0;
        const entering = act.entering ? Math.min(1, (frameNo - act.entering) / 30) : 0;
        const done = state.mode === "clear" ? Math.min(1, state.t / 90) : 0;
        const k = (0.55 + flare + entering * 0.3 + done * 0.5) * (0.95 + Math.sin(frameNo / 14) * 0.05);
        const cx = d.x + d.w / 2, cy = d.y + d.h * 0.55;
        g.save();
        g.globalCompositeOperation = "lighter";
        const r = 52 + done * 120;
        const bl = g.createRadialGradient(cx, cy, 6, cx, cy, r);
        bl.addColorStop(0, `rgba(255,236,190,${0.32 * k})`); bl.addColorStop(0.45, `rgba(255,200,120,${0.12 * k})`); bl.addColorStop(1, "rgba(255,180,90,0)");
        g.fillStyle = bl; g.fillRect(cx - r, cy - r, r * 2, r * 2);
        /* the doorway floods white with light as Scout goes in, and he fades
           into it; at rest it is the doorway as drawn (13 Oct 2026: the owner
           shades it himself, in assets/img/ariadne/door-open.png). One shape,
           filled once, so no seam where the arch meets the sides. */
        const wash = Math.min(1, entering * 0.9 + done);
        if (wash > 0) {
            g.globalCompositeOperation = "source-over";
            g.globalAlpha = wash;
            g.fillStyle = "#fff8e6";
            g.beginPath();
            g.moveTo(d.x + 5, d.y + d.h - 2);
            g.lineTo(d.x + 5, d.y + 12);
            g.ellipse(cx, d.y + 12, d.w / 2 - 5, 8, 0, Math.PI, 0);
            g.lineTo(d.x + d.w - 5, d.y + d.h - 2);
            g.closePath(); g.fill();
        }
        g.restore();
    }
    // The last five seconds of air, counted over his head, as in the Labyrinth
    function drawAirCount() {
        if (!act || state.mode !== "play" || act.air >= 1) return;
        const left = act.air * 1200 / 60;
        if (left > 5 || !wetAt(hero.x + hero.w / 2, hero.y + 3)) return;
        const n = Math.ceil(left), k = left - Math.floor(left);
        FONT.draw(g, String(n), Math.round(hero.x + hero.w / 2), Math.round(hero.y - 22 - (1 - k) * 4), { align: "center", scale: 2, ramp: ["#ffffff", "#bfeaff", "#6ab8e0"], outline: "#06121c" });
    }
    function drawHero() {
        const h = hero;
        if (state.mode === "title" || state.mode === "select" || debug.noHero) return;   // (debug.noHero: the trailer's, a shot without him)
        if (h.hurt > 0 && state.mode === "play" && Math.floor(h.hurt / 3) % 2) return;
        const left = h.face < 0;
        let img, ox = -3, oy = -2;
        if (state.mode === "dying") img = spr("scoutHurt", 0, left);
        else if (state.mode === "clear") img = spr("scoutCheer", 0, left);
        else if (h.mantle) img = spr("scoutMantle", 0, left);
        else if (h.cart) img = spr("scoutIdle", 0, left);
        // (23 Oct 2026) sliding down a steep slope: sat back on it, his legs out ahead down it ("similar to mario")
        else if (h.ground && h.onScree && !h.onScree.walk && !h.crouch) img = spr("scoutSlideDown", 0, h.onScree.dir < 0);
        // (22 Oct 2026) hanging from a swing: side on, his legs kicking forward as it rises in front, trailing as it falls back
        else if (h.ride && h.ride.kind === "swing") { const th = h.ride.s.th * h.face; img = spr("scoutSwing", th > -0.08 ? 0 : 1, left); oy = -4; }
        else if (h.climb || h.ride || act.entering) img = spr("scoutClimb", act.entering ? 0 : Math.floor(h.anim) % 2, false);
        else if (h.crouch) {
            // (21 Oct 2026: the crawl and swim redrawn 16 tall, his hat under a one-tile tunnel's roof; their offsets keep his head where it was)
            if (h.slideT) { img = spr("scoutSlide", 0, left); ox = left ? -(30 - h.w - 13) : -13; oy = h.h - 14; }
            else if (Math.abs(h.vx) > 0.2) { img = spr("scoutCrawl", Math.floor(h.anim), left); ox = left ? -(30 - h.w - 16) : -16; oy = h.h - 16; }   // (30 wide since 23 Oct 2026, his head where it was)
            else { img = spr("scoutCrouch", 0, left); oy = h.h - 24; }
        }
        else if (h.swim) { img = spr("scoutSwim", Math.floor(h.anim * 0.8), left); ox = left ? -(30 - h.w - 13) : -13; oy = h.h - 16; }
        else if (!h.ground && h.wall) img = spr("scoutWall", 0, h.wall < 0);
        else if (!h.ground) img = spr(h.vy < 0 ? "scoutJump" : "scoutFall", 0, left);
        else if (h.push) img = spr("scoutPush", Math.floor(h.anim * 2), left);
        else if (Math.abs(h.vx) > 0.25) img = spr("scoutRun", Math.floor(h.anim), left);
        else img = spr("scoutIdle", (frameNo % 200) < 8 ? 1 : 0, left);
        if (h.ground && !h.climb && state.mode !== "dying") { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(Math.round(h.x - 1), Math.round(h.y + h.h), h.w + 2, 1); }
        g.drawImage(img, Math.round(h.x + ox), Math.round(h.y + oy + (h.landT > 3 ? 1 : 0)));
        /* HIS TORCH (13 Oct 2026, the owner's: "we need a visible torch to be
           carried by Scout"): held up in his front hand, its flame moving. */
        if (act.torch && state.mode !== "dying") {
            const tx = h.face > 0 ? h.x + h.w - 1 : h.x - 4, ty = h.y + (h.crouch ? h.h - 14 : h.swim ? h.h - 14 : 6);
            g.drawImage(spr("htorch", 0, h.face < 0), Math.round(tx), Math.round(ty));
            g.drawImage(spr("hflame", Math.floor(frameNo / 5) % 3), Math.round(tx), Math.round(ty) - 6);
        }
    }

    let airDots = null;
    function drawAir() {
        if (!airDots) { airDots = []; for (let i = 0; i < 26; i++) airDots.push({ x: Math.random() * VW, y: Math.random() * VH, s: 0.1 + Math.random() * 0.3 }); }
        for (const p of airDots) {
            if (TH.snow) { p.y += 0.2 + p.s * 0.9; p.x += Math.sin((frameNo + p.y * 3) / 50) * 0.25; if (p.y > VH) { p.y = 0; p.x = Math.random() * VW; } }
            else { p.y -= p.s * 0.3; p.x += Math.sin((frameNo + p.y) / 60) * 0.1; }
            if (p.y < 0) { p.y = VH; p.x = Math.random() * VW; }
            g.fillStyle = `rgba(${TH.air[0]},${TH.air[1]},${TH.air[2]},${0.15 + p.s})`;
            g.fillRect(Math.round(((p.x - state.cam.x * p.s) % VW + VW) % VW), Math.round(p.y), 1, 1);
        }
        const v = g.createRadialGradient(VW / 2, VH / 2, 90, VW / 2, VH / 2, 230);
        v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.55)");
        g.fillStyle = v; g.fillRect(0, 0, VW, VH);
    }

    const clock = f => { const s = Math.floor(f / 60); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    const clockFine = f => clock(f) + "." + String(Math.floor((f % 60) / 6));
    const GOLD = ["#fff3b8", "#f2cc4e", "#d39a1e"];
    /* A SIGNPOST'S WORDS, on a board that drops in at the top of the screen
       while Scout stands by it. [JUMP], [RETRY] and [TURN] say this player's keys. */
    function words(text) {
        return text.replace(/\[CUT\]/g, touchy() ? "THE Z BUTTON" : "Z").replace(/\[JUMP\]/g, touchy() ? "JUMP" : "SPACE").replace(/\[RETRY\]/g, touchy() ? "DOWN + JUMP" : "PRESS R").replace(/\[TURN\]/g, touchy() ? "THE TWO WHEEL BUTTONS" : "Z AND X");
    }
    function wrap(text, max) {
        const lines = [""];
        for (const w of text.split(" ")) {
            const cur = lines[lines.length - 1];
            if (cur && (cur + " " + w).length > max) lines.push(w); else lines[lines.length - 1] = cur ? cur + " " + w : w;
        }
        return lines;
    }
    function drawHint() {
        if (!act || act.hintA <= 0 || !act.hint || !act.hint.text || state.mode === "paused") return;
        // (13 Oct 2026) at the top left, under the coins and the time, sliding out from the left edge: down at the bottom it hid the rats it was about
        const lines = wrap(words(act.hint.text), 24);
        const w = Math.max(...lines.map(l => FONT.width(l, 1))) + 22, h = lines.length * 11 + 15;
        const ease = 1 - Math.pow(1 - act.hintA, 3);
        const x = Math.round(4 - (1 - ease) * (w + 12)), y = 22;
        notice(x, y, w, h);
        lines.forEach((l, i) => FONT.draw(g, l, x + 11, y + 8 + i * 11, { color: "#3a2210", outline: null }));
    }
    // A parchment notice in a wooden frame, for the signposts' words.
    function notice(x, y, w, h) {
        g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(x + 2, y + 3, w, h);   // its shadow
        g.fillStyle = "#1a0f08"; g.fillRect(x, y, w, h);                     // the outline
        g.fillStyle = "#74482a"; g.fillRect(x + 1, y + 1, w - 2, h - 2);     // the frame
        g.fillStyle = "#b88350"; g.fillRect(x + 1, y + 1, w - 2, 1); g.fillRect(x + 1, y + 1, 1, h - 2);
        g.fillStyle = "#3a2210"; g.fillRect(x + 1, y + h - 2, w - 2, 1); g.fillRect(x + w - 2, y + 1, 1, h - 2);
        g.fillStyle = "#3a2210"; g.fillRect(x + 4, y + 4, w - 8, h - 8);     // the parchment's edge
        g.fillStyle = "#e9d6ad"; g.fillRect(x + 5, y + 5, w - 10, h - 10);   // the parchment
        g.fillStyle = "#d8c08e"; g.fillRect(x + 5, y + h - 6, w - 10, 1); g.fillRect(x + w - 6, y + 5, 1, h - 10);
        g.fillStyle = "#f6e8c6"; g.fillRect(x + 5, y + 5, w - 10, 1);
        // iron corners, a rivet in each
        for (const [cx, cy] of [[x, y], [x + w - 5, y], [x, y + h - 5], [x + w - 5, y + h - 5]]) {
            g.fillStyle = "#23232b"; g.fillRect(cx, cy, 5, 5);
            g.fillStyle = "#74748a"; g.fillRect(cx + 1, cy + 1, 3, 3);
            g.fillStyle = "#b2b2c4"; g.fillRect(cx + 2, cy + 2, 1, 1);
        }
    }
    function drawHud() {
        if (state.mode === "card" && state.t < 130) return;   // the act card hangs where the HUD sits; it comes back as the card goes
        if (state.mode === "title" || state.mode === "zoneclear" || state.mode === "select" || state.mode === "ending") return;
        g.drawImage(spr("coin", 0), 8, 6);
        FONT.draw(g, String(state.coins).padStart(3, "0"), 22, 8, { color: "#ffffff" });
        FONT.draw(g, "TIME", 66, 8, { ramp: GOLD });
        FONT.draw(g, clock(state.time), 94, 8, { color: "#ffffff" });
        // (the tide clock that sat here went, 14 Oct 2026: the owner did not like it; the horn is the warning)
        // THE BEAT (the vault): four lamps for the four beats of the bar, the one now lit
        if (TH.beat) {
            const B = TH.beat, n = Math.floor(act.clock / B) % 4, fresh = act.clock % B < 6;
            for (let i = 0; i < 4; i++) { const X = 140 + i * 7, Y = 7; g.fillStyle = "#0a0806"; g.fillRect(X - 1, Y - 1, 6, 6); g.fillStyle = i === n ? (fresh ? "#ffffff" : "#f2cc4e") : "#4a3418"; g.fillRect(X, Y, 4, 4); }
            const blockSet = Math.floor(act.clock / (B * 2)) % 2;
            g.fillStyle = blockSet === 0 ? "#b07a28" : "#7a8a9a"; g.fillRect(170, 7, 4, 4); g.fillStyle = "#0a0806"; g.fillRect(169, 6, 6, 1); g.fillRect(169, 11, 6, 1);
        }
        // THE WEATHER (the ruins): a dial, sun, cloud, rain, clearing
        if (TH.weather && act.weather) {
            const cx = 152, cy = 11, t = act.weather.t;
            for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) { const d = Math.sqrt(xx * xx + yy * yy); if (d > 6.4) continue; const an = (Math.atan2(xx, -yy) / (Math.PI * 2) + 1) % 1, at = an * 2280; g.fillStyle = d > 5.4 ? "#0a0e14" : at < 1200 ? "#f2cc4e" : at < 1380 ? "#8a96a6" : at < 2100 ? "#3a7ab0" : "#c8e0f0"; g.fillRect(cx + xx, cy + yy, 1, 1); }
            const an = t / 2280 * Math.PI * 2; for (let i = 0; i <= 4; i++) { g.fillStyle = "#ffffff"; g.fillRect(Math.round(cx + Math.sin(an) * i), Math.round(cy - Math.cos(an) * i), 1, 1); }
        }
        // THE SAND (the tomb): a little glass, its sand high or low
        if (TH.sand && act.flood) {
            const up = act.flood.sandHigh, X = 147, Y = 3;
            g.fillStyle = "#0a0806"; g.fillRect(X - 1, Y - 1, 12, 17); g.fillStyle = "#c8962e"; g.fillRect(X, Y, 10, 2); g.fillRect(X, Y + 13, 10, 2);
            g.fillStyle = "rgba(207,238,252,0.6)"; g.fillRect(X + 2, Y + 2, 6, 11);
            g.fillStyle = "#e8c070"; if (up) g.fillRect(X + 2, Y + 2, 6, 5); else g.fillRect(X + 2, Y + 8, 6, 5);
        }
        /* THE SATCHEL (14 Oct 2026, the owner's: nothing he hasn't got shows,
           the key included). Only what Scout carries, in the order he got it,
           filling in from the right; each new thing drops in with a bounce,
           the way Sonic's and Mario's counters own what you've picked up. */
        const got = act.satchel || (act.satchel = []);
        [["key", act.keyTaken], ["flag", act.flag && act.flag.taken], ["dynamite", act.dynamite > 0], ["knife", act.hasKnife]].forEach(([k, have]) => {
            const i = got.findIndex(s => s.k === k);
            if (have && i < 0) got.push({ k, at: frameNo });
            else if (!have && i >= 0) got.splice(i, 1);
        });
        got.forEach((s, i) => {
            const x = VW - 21 - i * 17, age = frameNo - s.at;
            const drop = age < 12 ? -Math.round(12 * Math.pow(1 - age / 12, 2)) : 0;
            const bump = age >= 12 && age < 17 ? 1 : 0;
            g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(x, 4, 14, 16);
            g.strokeStyle = age < 24 && age % 6 < 3 ? "#ffe9a0" : "#9a6410"; g.lineWidth = 1; g.strokeRect(x - 0.5, 3.5, 15, 17);
            if (s.k === "key") g.drawImage(spr("keyIcon", 0), x + 3, 5 + drop + bump);
            else if (s.k === "flag") g.drawImage(spr("flagIcon", 0), x + 2, 6 + drop + bump);
            else if (s.k === "knife") g.drawImage(spr("knife", 0), x + 3, 4 + drop + bump);
            else {
                g.drawImage(spr("dynamiteIcon", 0), x + 3, 7 + drop + bump);
                // (18 Oct 2026, the owner's: "add a counter so the player knows how many they have") how many sticks
                g.fillStyle = "rgba(0,0,0,0.75)"; g.fillRect(x + 7, 12, 7, 8);
                FONT.draw(g, String(act.dynamite), x + 13, 13, { align: "right", color: "#ffe9a0" });
            }
        });
        if (act.air < 1) {
            // the air: bubbles in a row under the time, going as it goes
            const n = Math.ceil(act.air * 10);
            for (let i = 0; i < 10; i++) { const X = 66 + i * 9, Y = 20; g.fillStyle = "#0a0e14"; g.fillRect(X, Y, 7, 7); g.fillStyle = i < n ? (act.air < 0.3 && frameNo % 20 < 10 ? "#ff6a5a" : "#bfeaff") : "#26323e"; g.fillRect(X + 1, Y + 1, 5, 5); if (i < n) { g.fillStyle = "#ffffff"; g.fillRect(X + 2, Y + 2, 1, 1); } }
        }
        g.drawImage(spr("hat", 0), 6, VH - 16);
        FONT.draw(g, state.endless ? "x--" : "x" + Math.max(0, state.lives), 24, VH - 14, { color: "#ffffff" });
        if (state.practice) FONT.draw(g, "PRACTICE", VW / 2, VH - 14, { align: "center", color: "#a89a88" });
        FONT.draw(g, String(state.score).padStart(6, "0"), VW - 8, VH - 14, { align: "right", color: "#ffffff" });
    }

    /* The screens over the game: the title, the zone and act card, pause,
       the tally at the end of an act, the zone done, game over. */
    /* THE SECRET MIXER's panel (13 Oct 2026; kept for players to find, the
       owner's): which layers of the music are playing. */
    let mixerOn = false;
    const MIX_LAYERS = [["kick", "KICK"], ["snare", "SNARE + TOMS"], ["hats", "HATS + CRASH"], ["bass", "BASS"], ["stabs", "CHORD STABS"], ["echo", "ECHO"], ["parts", "ANSWER PARTS"], ["lead", "LEAD"]];
    function drawMixer() {
        if (!mixerOn || !music() || !music().mixState) return;
        const st = music().mixState(), x = VW - 150, y = 20, w = 146, h = 18 + MIX_LAYERS.length * 10;
        g.fillStyle = "rgba(0,0,0,0.82)"; g.fillRect(x, y, w, h);
        g.fillStyle = "#f2cc4e"; g.fillRect(x, y, w, 1);
        FONT.draw(g, "MIXER: 1-8, 0 HIDES", x + 4, y + 4, { color: "#f2cc4e" });
        MIX_LAYERS.forEach(([key, label], i) => {
            const on = st[key];
            FONT.draw(g, (i + 1) + " " + label, x + 4, y + 15 + i * 10, { color: on ? "#ffffff" : "#ff6a5a" });
            FONT.draw(g, on ? "ON" : "OFF", x + w - 4, y + 15 + i * 10, { align: "right", color: on ? "#7ae07a" : "#ff6a5a" });
        });
    }
    function drawOverlay() {
        const m = state.mode;
        if (m === "title") drawTitle();
        else if (m === "card") drawCard();
        else if (m === "paused") {
            shade(0.55);
            FONT.draw(g, "PAUSED", VW / 2, 52, { align: "center", scale: 3, ramp: ["#fff3b8", "#f2cc4e", "#d39a1e", "#9a6410"], outline: "#2a1804" });
            PAUSE_ITEMS.forEach((label, i) => {
                const b = pauseBtnAt(i), on = (state.pauseSel || 0) === i;
                g.globalAlpha = on ? 1 : 0.72;
                plank(b.x, b.y, b.w, b.h);
                g.globalAlpha = 1;
                const text = i === 2 && on && state.pauseSure ? "SURE? END GAME" : label;
                FONT.draw(g, text, VW / 2, b.y + 5, on ? { align: "center", ramp: GOLD, outline: "#2a1606" } : { align: "center", color: "#d8c4a0", outline: "#2a1606" });
                // the chosen one pointed at from either side (the font has no < or >): a small gold triangle each
                if (on) for (const [tx, dir] of [[b.x - 9, 1], [b.x + b.w + 4, -1]]) for (let i = 0; i < 5; i++) {
                    const col = dir > 0 ? tx + i : tx + 4 - i, hgt = 9 - i * 2, ty = b.y + 4 + i;
                    g.fillStyle = "#2a1606"; g.fillRect(col - 1, ty - 1, 3, hgt + 2);
                }
                if (on) for (const [tx, dir] of [[b.x - 9, 1], [b.x + b.w + 4, -1]]) for (let i = 0; i < 4; i++) {
                    const col = dir > 0 ? tx + i : tx + 4 - i, hgt = 9 - i * 2, ty = b.y + 4 + i;
                    g.fillStyle = i === 0 ? "#fff3b8" : "#f2cc4e"; g.fillRect(col, ty, 1, hgt);
                }
            });
            FONT.draw(g, touchy() ? "UP AND DOWN TO CHOOSE, JUMP TO PRESS" : "UP AND DOWN TO CHOOSE, SPACE TO PRESS", VW / 2, 168, { align: "center", color: "#a89a88" });
            FONT.draw(g, touchy() ? "PAUSE TO PLAY ON" : "P TO PLAY ON", VW / 2, 180, { align: "center", color: "#7a6e60" });
        }
        else if (m === "clear") drawTally();
        else if (m === "over") {
            shade(0.7);
            FONT.draw(g, "GAME OVER", VW / 2, VH / 2 - 16, { align: "center", scale: 3, ramp: ["#f6c08a", "#d0702c", "#a64a18", "#7a3010"], outline: "#2a1004" });
            FONT.draw(g, touchy() ? "PRESS JUMP" : "PRESS SPACE", VW / 2, VH / 2 + 20, { align: "center", color: frameNo % 60 < 40 ? "#ffffff" : "#888888" });
        }
        else if (m === "zoneclear") drawZoneClear();
        else if (m === "ending") drawEnding();
        else if (m === "select") drawSelect();
        else if (m === "dying" && state.lives <= 0 && state.t > 60) shade(Math.min(0.7, (state.t - 60) / 60));
    }
    function shade(a) { g.fillStyle = `rgba(6,3,1,${a})`; g.fillRect(0, 0, VW, VH); }

    function drawTitle() {
        shade(0.5);
        // a fade between one act and the next as the view drifts
        const ft = state.titleT || 0, fade = ft < 40 ? 1 - ft / 40 : ft > 1460 ? (ft - 1460) / 40 : 0;
        if (fade > 0) shade(Math.min(1, fade));
        // the rig is always the first zone's timber and rope, whichever zone pans by behind (13 Oct 2026, the owner's)
        const keepTH = TH, keepZK = ZK;
        TH = WOOD; ZK = "wood";
        try { drawTitleRig(); } finally { TH = keepTH; ZK = keepZK; }
        titleScout();
        if (!mayPlayNow()) {
            FONT.draw(g, gateDone ? "BACK SOON!" : "...", VW / 2, 128, { align: "center", color: "#ffffff" });
            // (13 Oct 2026, the owner's words)
            if (gateDone) {
                FONT.draw(g, "WE'RE WORKING HARD TO BRING YOU", VW / 2, 140, { align: "center", color: "#bbbbbb" });
                FONT.draw(g, "A BETTER GAME!", VW / 2, 151, { align: "center", color: "#bbbbbb" });
            }
        } else {
            FONT.draw(g, touchy() ? "PRESS JUMP TO START" : "PRESS SPACE TO START", VW / 2, 132, { align: "center", color: frameNo % 70 < 46 ? "#ffffff" : "#777777" });
            /* ZONES OPEN (13 Oct 2026, the owner's: "reaching a zone unlocks it"):
               left and right choose which to start in. */
            const top = pickTop();
            if (top > 0) {
                const z = Math.min(state.pickZone || 0, top), name = LEVELS.zones[z].name;
                FONT.draw(g, (z > 0 ? "< " : "  ") + name + (z < top ? " >" : "  "), VW / 2, 146, { align: "center", ramp: GOLD });
            }
            // (26 Oct 2026: a line under the zone's name where there is one; drawn over it, neither could be read)
            if (!gate.live) FONT.draw(g, "MAINTENANCE: ADMINS ONLY", VW / 2, top > 0 ? 158 : 146, { align: "center", color: "#ff9a6a" });
        }
        drawControls();
        const zb = best.z0;
        if (zb) FONT.draw(g, "BEST MINE LABYRINTH " + clockFine(zb), VW / 2, 212, { align: "center", ramp: GOLD });
    }

    /* THE TITLE'S RIG (13 Oct 2026, the owner's design): the two words, the
       second spaced out to the first's width, standing on a timber platform
       that hangs from two ropes running up out of the window, one at either
       end; the tagline on a small board hung under the platform on two short
       ropes. (15 Oct 2026, the owner's: the game is SCOUT'S TRAIL, "In Search
       of Ariadne"; it was ARIADNE'S THREAD, "A Maze Rats Adventure".) */
    const TITLE_TOP = "SCOUT'S", TITLE_BIG = "TRAIL", TAGLINE = "In Search of Ariadne";
    const T_ARI = 34, T_THR = 58, T_PLAT = 90, T_FLOOR = 136;   // the tops of the words and the platform, and the ground
    const ROPE_L = 52, ROPE_R = 268, PLAT_X0 = 44, PLAT_X1 = 276;
    const TITLE_RAMP = ["#fff3b8", "#f6d860", "#f2cc4e", "#e0a828", "#c88a1a", "#9a6410", "#7a4c08"];
    function drawRope(x, y0, y1) {
        const rope = spr("rope", 0);
        for (let y = y0; y < y1; y += TS) g.drawImage(rope, 0, 0, TS, Math.min(TS, y1 - y), x - 8, y, TS, Math.min(TS, y1 - y));
    }
    function drawTitleRig() {
        const P = ART.pal;
        // the ropes, down from out of sight to the platform's ends
        drawRope(ROPE_L, 0, T_PLAT + 2);
        drawRope(ROPE_R, 0, T_PLAT + 2);
        // the words: the first as it comes; the second a letter at a time, spaced to the same width
        FONT.draw(g, TITLE_TOP, VW / 2 + 2, T_ARI + 2, { align: "center", scale: 3, color: "#000000", outline: null });
        // (13 Oct 2026) a black outline two pixels thick on both words, so the gap between them stays clear
        FONT.draw(g, TITLE_TOP, VW / 2, T_ARI, { align: "center", scale: 3, ramp: TITLE_RAMP, outline: "#000000", outlineW: 2 });
        const width = FONT.width(TITLE_TOP, 3), x0 = Math.round(VW / 2 - width / 2), gap = (width - TITLE_BIG.length * 20) / (TITLE_BIG.length - 1);
        [...TITLE_BIG].forEach((ch, i) => {
            const x = Math.round(x0 + i * (20 + gap));
            FONT.draw(g, ch, x + 2, T_THR + 2, { scale: 4, color: "#000000", outline: null });
            FONT.draw(g, ch, x, T_THR, { scale: 4, ramp: TITLE_RAMP, outline: "#000000", outlineW: 2 });
        });
        // the platform: a long timber, drawn as the game's platforms are
        const y = T_PLAT;
        platform(g, PLAT_X0, y, PLAT_X1 - PLAT_X0, { seed: 11, hung: true });
        g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(PLAT_X0 + 4, y + PLAT_H, PLAT_X1 - PLAT_X0 - 8, 2);
        // where each rope is lashed round its end
        for (const rx of [ROPE_L, ROPE_R]) { g.fillStyle = P.k; g.fillRect(rx - 3, y - 1, 7, PLAT_H + 2); for (let ry = 0; ry < PLAT_H; ry += 3) { g.fillStyle = "#ecd29a"; g.fillRect(rx - 2, y + ry, 5, 1); g.fillStyle = "#946d34"; g.fillRect(rx - 2, y + ry + 1, 5, 2); } }
        // the tagline's board, hung under the platform
        const tag = TAGLINE, tw = FONT.width(tag, 1) + 20, tx = Math.round(VW / 2 - tw / 2), ty = T_PLAT + PLAT_H + 5;
        drawRope(tx + 10, T_PLAT + PLAT_H, ty + 2);
        drawRope(tx + tw - 10, T_PLAT + PLAT_H, ty + 2);
        plank(tx, ty, tw, 17);
        // painted on, cream with a dark rim, so it reads (13 Oct 2026: carved, it did not)
        FONT.draw(g, tag, VW / 2, ty + 5, { align: "center", color: "#fff3d8", outline: "#2a1606", mixed: true });
    }

    /* THE CONTROLS, AS KEYS (13 Oct 2026, drawn a third time: the owner's
       "key's images should match the height of the text", then "slightly
       bigger; we've lost the nice icons"). One line: each key as tall as
       the words beside it with their outline (nine pixels), a black rim
       round a glassy face lit along the top and left and deepest at the
       front, its legend in white: an arrow with its shaft, or the small
       lettering. What it does beside it, in the game's own letters. */
    const KEY_H = 9;
    function keyCap(x, y, w, legend) {
        g.fillStyle = "#000000"; g.fillRect(x, y, w, KEY_H);                                  // the rim
        g.fillStyle = "rgba(238,238,238,0.2)"; g.fillRect(x + 1, y + 1, w - 2, KEY_H - 2);    // the face
        g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(x + 1, y + 1, w - 2, 1);           // lit along the top
        g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x + 1, y + 2, 1, KEY_H - 4);       // and down the left
        g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(x + 1, y + KEY_H - 2, w - 2, 1);          // deepest at the front
        g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x + w - 2, y + 2, 1, KEY_H - 4);          // shaded down the right
        legend(x, y + 2);
    }
    const ARROW_PX = ["..#..", ".###.", "#####", "..#..", "..#.."];   // pointing up, its shaft under it
    function arrowKey(x, y, dir) {
        const w = 9;
        keyCap(x, y, w, (lx, ly) => {
            g.fillStyle = "#ffffff";
            for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
                if (ARROW_PX[r][c] !== "#") continue;
                const [px, py] = dir === "up" ? [c, r] : dir === "down" ? [c, 4 - r] : dir === "left" ? [r, c] : [4 - r, c];
                g.fillRect(lx + 2 + px, ly + py, 1, 1);
            }
        });
        return x + w;
    }
    function textKey(x, y, text) {
        const w = FONT.miniWidth(text) + 6;
        keyCap(x, y, w, (lx, ly) => FONT.drawMini(g, text, lx + 3, ly, "#ffffff", null));
        return x + w;
    }
    function drawControls() {
        if (touchy()) {
            FONT.draw(g, "THE PAD MOVES, JUMP JUMPS", VW / 2, 176, { align: "center", color: "#a89878" });
            FONT.draw(g, "THE II BUTTON PAUSES", VW / 2, 188, { align: "center", color: "#a89878" });
            return;
        }
        // run, crouch, jump, pause, music; measured first, so the line sits centred
        const items = [[["left", "right"], "RUN"], [["down"], "CROUCH"], [["SPACE"], "JUMP"], [["P"], "PAUSE"], [["M"], "MUSIC"]];
        const ARROWS = ["left", "right", "up", "down"];
        const keyW = k => ARROWS.includes(k) ? 9 : FONT.miniWidth(k) + 6;
        const GAP_KEYS = 1, GAP_WORD = 3, GAP_ITEM = 9;
        const itemW = ([keys, word]) => keys.reduce((n, k) => n + keyW(k), 0) + GAP_KEYS * (keys.length - 1) + GAP_WORD + FONT.width(word, 1);
        const total = items.reduce((n, it) => n + itemW(it), 0) + GAP_ITEM * (items.length - 1);
        let x = Math.round(VW / 2 - total / 2);
        const y = 180;
        items.forEach(([keys, word]) => {
            keys.forEach((k, j) => { x = (ARROWS.includes(k) ? arrowKey(x, y, k) : textKey(x, y, k)) + (j < keys.length - 1 ? GAP_KEYS : 0); });
            x += GAP_WORD;
            FONT.draw(g, word, x, y + 1, { color: "#e8dcc0", outline: "#000000" });
            x += FONT.width(word, 1) + GAP_ITEM;
        });
    }

    /* SCOUT ON THE TITLE (13 Oct 2026). He runs in along the ground, hops up
       onto the platform's end, climbs the left rope above the words, steps
       across onto the top word, raises his hat, runs along it and jumps down
       to the platform's far end, hops off to the ground, and runs away; and in
       again. Every move is a pose he has in the game, at the game's speeds.
       (15 Oct 2026) He lands on the word and leaves it where its letters are,
       whatever its width: the jumps to and from it as long as they need. */
    const RUN = 1.6;
    function titleRoutine() {
        const L = [];
        const run = (x0, x1, y) => L.push({ k: "run", x0, x1, y0: y, y1: y, d: Math.abs(x1 - x0) / RUN });
        const jump = (x0, y0, x1, y1, d, hgt) => L.push({ k: "jump", x0, x1, y0, y1, d, hgt });
        const pose = (x, y, d, img, face) => L.push({ k: "pose", x0: x, x1: x, y0: y, y1: y, d, img, face });
        run(-24, 24, T_FLOOR);
        jump(24, T_FLOOR, ROPE_L - 6, T_PLAT, 34, 14);
        pose(ROPE_L - 6, T_PLAT, 5, "scoutCrouch", 1);
        pose(ROPE_L - 6, T_PLAT, 16, "scoutIdle", 1);
        run(ROPE_L - 6, ROPE_L, T_PLAT);
        L.push({ k: "climb", x0: ROPE_L, x1: ROPE_L, y0: T_PLAT - 2, y1: T_ARI - 4, d: 90 });
        const wordL = Math.round(VW / 2 - FONT.width(TITLE_TOP, 3) / 2), wordR = wordL + FONT.width(TITLE_TOP, 3);
        const on = wordL + 12, off = wordR - 8, mid = Math.round(VW / 2);
        jump(ROPE_L, T_ARI - 4, on, T_ARI, Math.max(16, Math.round((on - ROPE_L) * 0.4)), 8);
        pose(on, T_ARI, 4, "scoutCrouch", 1);
        run(on, mid, T_ARI);
        pose(mid, T_ARI, 60, "scoutCheer", 1);
        run(mid, off, T_ARI);
        jump(off, T_ARI, 262, T_PLAT, Math.max(30, 262 - off), 12);
        pose(262, T_PLAT, 5, "scoutCrouch", 1);
        jump(262, T_PLAT, 296, T_FLOOR, 30, 10);
        pose(296, T_FLOOR, 5, "scoutCrouch", 1);
        run(296, 350, T_FLOOR);
        pose(400, T_FLOOR, 1200, "scoutIdle", 1);   // off the screen for twenty seconds or so: he comes by every now and then (13 Oct 2026)
        let t = 0; for (const seg of L) { seg.t0 = t; t += Math.max(1, Math.round(seg.d)); }
        L.total = t;
        return L;
    }
    let routine = null;
    function titleScout() {
        routine = routine || titleRoutine();
        const t = frameNo % routine.total;
        const seg = routine.find(sg => t >= sg.t0 && t < sg.t0 + Math.max(1, Math.round(sg.d))) || routine[0];
        const u = Math.min(1, (t - seg.t0) / Math.max(1, Math.round(seg.d)));
        let x = seg.x0 + (seg.x1 - seg.x0) * u, y = seg.y0 + (seg.y1 - seg.y0) * u, img;
        const face = seg.face || (seg.x1 < seg.x0 ? -1 : 1), left = face < 0;
        if (seg.k === "run") img = spr("scoutRun", Math.floor(t / 6), left);
        else if (seg.k === "jump") { y -= seg.hgt * 4 * u * (1 - u); img = spr(u < 0.5 ? "scoutJump" : "scoutFall", 0, left); }
        else if (seg.k === "climb") img = spr("scoutClimb", Math.floor(t / 10), false);
        else img = spr(seg.img, seg.img === "scoutIdle" && frameNo % 160 < 8 ? 1 : 0, left);
        if (x < -20 || x > VW + 20) return;
        const ground = seg.k === "run" || seg.k === "pose";
        if (ground) { g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(Math.round(x - 6), Math.round(y), 12, 1); }
        // the crouch picture is shorter than the standing ones: keep the feet on the ground
        const oy = seg.img === "scoutCrouch" ? 24 - img.height : 0;
        g.drawImage(img, Math.round(x - 8), Math.round(y - 24 + oy));
    }

    /* THE ACT CARD (13 Oct 2026, its second design: the first was too close
       to Sonic's sliding bars). The act opens in darkness, and torchlight
       opens round Scout like an eye; a carved wooden sign drops in on two
       chains from above, the zone's name cut into it, and under it, on
       short chains of its own and a moment behind, a little plaque with
       the act in Roman numerals. Both settle with a bounce and a sway,
       hang a while, then are hauled back up as the light finishes opening. */
    const ROMAN = ["I", "II", "III", "IV", "V"];
    function drawCard() {
        const t = state.t;
        const clamp01 = v => Math.max(0, Math.min(1, v));
        // a drop on a spring: overshoots, bounces, settles
        const spring = v => { v = clamp01(v); return 1 - Math.exp(-6 * v) * Math.cos(v * 11); };
        const pull = clamp01((t - 116) / 26), pullE = pull * pull;
        // THE LIGHT opening round Scout
        const hx = hero.x + hero.w / 2 - state.cam.x, hy = hero.y + hero.h / 2 - state.cam.y;
        const open = clamp01((t - 8) / 120);
        const radius = 6 + Math.pow(open, 1.6) * 420 + Math.sin(frameNo / 4) * 1.5;
        g.save();
        g.beginPath(); g.rect(0, 0, VW, VH); g.arc(hx, hy, radius, 0, Math.PI * 2, true);
        g.fillStyle = "#080402"; g.fill("evenodd");
        const rim = g.createRadialGradient(hx, hy, Math.max(0, radius - 18), hx, hy, radius + 2);
        rim.addColorStop(0, "rgba(0,0,0,0)"); rim.addColorStop(0.8, "rgba(40,18,4,0.45)"); rim.addColorStop(1, "rgba(255,150,60,0.25)");
        g.fillStyle = rim; g.beginPath(); g.arc(hx, hy, radius + 2, 0, Math.PI * 2); g.fill();
        g.restore();

        // THE SIGN
        const name = act.zone.name;
        // a long name (the Heart's) in smaller letters, so its sign still fits the screen
        const nsc = FONT.width(name, 2) + 36 > VW - 8 ? 1 : 2;
        const tw = FONT.width(name, nsc), sw = tw + 36, sh = nsc === 2 ? 34 : 26;
        const sx = Math.round(VW / 2 - sw / 2);
        const drop = spring((t - 14) / 60);
        const sy = Math.round(-sh - 40 + (sh + 40 + 46) * drop - pullE * 200);
        const sway = Math.round(Math.sin(t / 9) * 2 * Math.exp(-t / 50) * (1 - pull));
        const chain = (x, y0, y1) => { for (let y = y0, i = 0; y < y1; y += 3, i++) { g.fillStyle = "#23232b"; g.fillRect(x - 1, y, 3, 3); g.fillStyle = i % 2 ? "#74748a" : "#b2b2c4"; g.fillRect(x, y, 1, 2); } };
        chain(sx + 14 + sway, -4, sy + 2); chain(sx + sw - 15 + sway, -4, sy + 2);
        const bx = sx + sway;
        plank(bx, sy, sw, sh);
        // the name, cut into the wood: a light lower edge, the cut dark
        FONT.draw(g, name, bx + sw / 2, sy + (nsc === 2 ? 11 : 10), { align: "center", scale: nsc, color: "#d9a76b", outline: null });
        FONT.draw(g, name, bx + sw / 2, sy + (nsc === 2 ? 10 : 9), { align: "center", scale: nsc, color: "#2a1606", outline: null });
        // THE PLAQUE, a beat behind
        const numeral = ROMAN[state.ai] || String(state.ai + 1);
        const pw = Math.max(54, FONT.width("PASSAGE " + numeral, 1) + 22), ph = 20;
        const drop2 = spring((t - 30) / 60);
        const py = Math.round(sy + sh + 4 + 10 * drop2 - (1 - drop2) * 30);
        const sway2 = Math.round(Math.sin(t / 7 + 1) * 3 * Math.exp(-t / 45) * (1 - pull));
        const px = Math.round(bx + sw / 2 - pw / 2 + sway2);
        if (t > 22) {
            chain(px + 8, sy + sh - 2, py + 2); chain(px + pw - 9, sy + sh - 2, py + 2);
            plank(px, py, pw, ph);
            FONT.draw(g, "PASSAGE " + numeral, px + pw / 2, py + 7, { align: "center", color: "#d9a76b", outline: null });
            FONT.draw(g, "PASSAGE " + numeral, px + pw / 2, py + 6, { align: "center", color: "#2a1606", outline: null });
        }
    }
    // A board for the act card: planks edged in dark, lit along the top, nails at the corners.
    function plank(x, y, w, h) {
        g.fillStyle = "#1a0f08"; g.fillRect(x, y, w, h);
        g.fillStyle = "#96633a"; g.fillRect(x + 1, y + 1, w - 2, h - 2);
        g.fillStyle = "#b88350"; g.fillRect(x + 1, y + 1, w - 2, 2);
        g.fillStyle = "#74482a"; g.fillRect(x + 1, y + h - 3, w - 2, 2);
        // the joins between the boards, and grain
        for (let yy = y + 9; yy < y + h - 4; yy += 9) { g.fillStyle = "#55331a"; g.fillRect(x + 1, yy, w - 2, 1); }
        for (let i = 0; i < w / 9; i++) { const gx = x + 4 + ((i * 37) % (w - 8)), gy = y + 4 + ((i * 13) % (h - 8)); g.fillStyle = "#86562f"; g.fillRect(gx, gy, Math.max(0, Math.min(5 + (i % 3) * 2, x + w - 3 - gx)), 1); }   // (kept inside the board: a long streak near the right end ran out past it)
        // nails
        for (const [nx, ny] of [[x + 3, y + 3], [x + w - 5, y + 3], [x + 3, y + h - 5], [x + w - 5, y + h - 5]]) { g.fillStyle = "#23232b"; g.fillRect(nx, ny, 2, 2); g.fillStyle = "#b2b2c4"; g.fillRect(nx, ny, 1, 1); }
    }

    function drawTally() {
        const t = state.t, T = state.tally;
        shade(Math.min(0.55, t / 60));
        if (t < 20) return;
        FONT.draw(g, "PASSAGE " + (ROMAN[state.ai] || state.ai + 1), VW / 2, 40, { align: "center", scale: 2, color: "#ffffff" });
        FONT.draw(g, "COMPLETE", VW / 2, 60, { align: "center", scale: 2, ramp: GOLD });
        const rows = [["TIME", clockFine(T.time)], ["TIME BONUS", String(T.timeBonus)], ["COIN BONUS", String(T.coinBonus)]];
        if (T.allCoins) rows.push(["EVERY COIN", String(T.allCoins)]);
        if (T.gems) rows.push(["RUBIES", String(T.gems)]);
        rows.forEach((r, i) => {
            if (t < 50 + i * 18) return;
            FONT.draw(g, r[0], 84, 92 + i * 14, { ramp: GOLD });
            FONT.draw(g, r[1], 236, 92 + i * 14, { align: "right", color: "#ffffff" });
        });
        // (26 Oct 2026: a practice run on a passage with no best yet says nothing here; it said "BEST 0:00.0")
        if (t > 120 && (T.newBest || T.best)) FONT.draw(g, T.newBest ? "NEW BEST TIME!" : "BEST " + clockFine(T.best), VW / 2, 98 + rows.length * 14 + 6, { align: "center", color: T.newBest ? "#9cf09c" : "#d8c8a8" });
        if (t > 150) FONT.draw(g, touchy() ? "PRESS JUMP" : "PRESS SPACE", VW / 2, VH - 34, { align: "center", color: frameNo % 60 < 40 ? "#ffffff" : "#777777" });
    }
    function drawZoneClear() {
        shade(0.75);
        FONT.draw(g, "ZONE CLEAR!", VW / 2, 34, { align: "center", scale: 3, ramp: ["#fff3b8", "#f2cc4e", "#d39a1e", "#9a6410"], outline: "#2a1804" });
        FONT.draw(g, act.zone.name, VW / 2, 64, { align: "center", color: "#ffffff" });
        FONT.draw(g, "ZONE TIME", 84, 92, { ramp: GOLD });
        FONT.draw(g, clockFine(state.zoneTime), 236, 92, { align: "right", color: "#ffffff" });
        FONT.draw(g, "SCORE", 84, 106, { ramp: GOLD });
        FONT.draw(g, String(state.score), 236, 106, { align: "right", color: "#ffffff" });
        if (state.zoneBest) FONT.draw(g, "NEW BEST ZONE TIME!", VW / 2, 126, { align: "center", color: "#9cf09c" });
        g.drawImage(spr("scoutCheer", 0, false), VW / 2 - 8, 140);
        const next = LEVELS.zones[state.zi + 1], sz = secretZone();
        const line = state.practice ? "" : state.zi + 1 < mainZones() ? "ON INTO THE " + next.name : state.zi === sz ? "" : rubiesFound() >= allRubies().length ? "EVERY RUBY FOUND: THE HEART OPENS..." : "";
        if (line) FONT.draw(g, line, VW / 2, 176, { align: "center", color: "#d8c8a8" });
        FONT.draw(g, "RUBIES " + rubiesFound() + "/" + allRubies().length, VW / 2, 190, { align: "center", color: "#ffb0bc" });
        if (state.t > 90) FONT.draw(g, touchy() ? "PRESS JUMP" : "PRESS SPACE", VW / 2, VH - 16, { align: "center", color: frameNo % 60 < 40 ? "#ffffff" : "#777777" });
    }

    /* THE END (13 Oct 2026): out of the labyrinth. With every ruby, the Heart
       was the last of it; without, it says how many are still to be found. */
    function drawEnding() {
        shade(0.82);
        const won = act.zone.secret;
        FONT.draw(g, won ? "THE HEART OF" : "OUT OF THE", VW / 2, 30, { align: "center", scale: 2, ramp: GOLD, outline: "#2a1804" });
        FONT.draw(g, won ? "THE LABYRINTH" : "LABYRINTH!", VW / 2, 50, { align: "center", scale: 2, ramp: GOLD, outline: "#2a1804" });
        g.drawImage(spr("scoutCheer", 0, false), VW / 2 - 8, 76);
        FONT.draw(g, "SCORE", 84, 112, { ramp: GOLD });
        FONT.draw(g, String(state.score), 236, 112, { align: "right", color: "#ffffff" });
        FONT.draw(g, "RUBIES", 84, 126, { ramp: GOLD });
        FONT.draw(g, rubiesFound() + "/" + allRubies().length, 236, 126, { align: "right", color: "#ffb0bc" });
        const left = allRubies().length - rubiesFound();
        if (won) { FONT.draw(g, "YOU FOUND ARIADNE", VW / 2, 150, { align: "center", color: "#ffffff" }); FONT.draw(g, "AT THE END OF THE TRAIL", VW / 2, 162, { align: "center", color: "#d8c8a8" }); }
        else { FONT.draw(g, left + (left === 1 ? " RUBY IS" : " RUBIES ARE") + " STILL HIDDEN", VW / 2, 150, { align: "center", color: "#ffffff" }); FONT.draw(g, "FIND THEM ALL TO OPEN THE HEART", VW / 2, 162, { align: "center", color: "#d8c8a8" }); }
        if (state.t > 120) FONT.draw(g, touchy() ? "PRESS JUMP" : "PRESS SPACE", VW / 2, VH - 16, { align: "center", color: frameNo % 60 < 40 ? "#ffffff" : "#777777" });
    }

    /* ================================================================ ICONS */
    function pixelSvg(rows, scale) {
        const w = rows[0].length, h = rows.length;
        let rects = "";
        rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
        return `<svg width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`;
    }
    function rot90(rows) { return rows[0].split("").map((_, x) => rows.map(r => r[x]).reverse().join("")); }
    const BULB = [".............", ".###########.", ".#.........#.", ".#...###...#.", ".#..#####..#.", ".#..#####..#.", ".#..#####..#.", ".#...###...#.", ".#...###...#.", ".#....#....#.", ".#.........#.", ".###########.", "............."];
    const SOUND_ICON = ["....#.....", "...##..#..", "####....#.", "####..#.#.", "####..#.#.", "####....#.", "...##..#..", "....#....."];
    const MUTED_ICON = ["....#.....", "...##.....", "####.#..#.", "####..##..", "####..##..", "####.#..#.", "...##.....", "....#....."];
    const PAUSE_ICON = ["........", ".##..##.", ".##..##.", ".##..##.", ".##..##.", ".##..##.", ".##..##.", "........"];
    const FULL_ICON = ["###..###", "#......#", "#......#", "........", "........", "#......#", "#......#", "###..###"];
    const ARROW_UP = ["...#...", "..###..", ".#####.", "#######", "..###..", "..###..", "..###.."];

    /* ================================================================ TESTING
       (14 Oct 2026, for the level editor.) THE COLLISION OVERLAY: every box
       the game tests against, drawn over the picture: walls red, false walls
       (walked through, into a secret) cyan, beams and tops yellow, ladders
       and ropes green, spikes and every hazard magenta, water and currents
       blue, the creatures' bodies orange, Scout white, the hidden rooms'
       covers hatched. The backquote key turns it on and off while testing. */
    const debug = { boxes: false, invincible: false };
    function drawDebug(cam) {
        const x0 = Math.max(0, Math.floor(cam.x / TS)), y0 = Math.max(0, Math.floor(cam.y / TS)), x1 = Math.min(act.w - 1, Math.floor((cam.x + VW) / TS)), y1 = Math.min(act.h - 1, Math.floor((cam.y + VH) / TS));
        const box = (x, y, w, h, col, fill) => { if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); } g.strokeStyle = col; g.lineWidth = 1; g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.max(0, Math.round(w) - 1), Math.max(0, Math.round(h) - 1)); };
        g.save();
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
            const c = act.tiles[ty][tx], X = tx * TS, Y = ty * TS;
            if (c === "#" || c === "X" || c === "V" || c === "8" || c === "9") box(X, Y, TS, TS, "rgba(255,70,60,0.85)", "rgba(255,70,60,0.12)");
            else if (c === "%") box(X, Y, TS, TS, "rgba(80,230,255,0.9)", "rgba(80,230,255,0.15)");
            else if (c === "=" || c === "c") { g.fillStyle = "rgba(255,220,60,0.9)"; g.fillRect(X, Y, TS, 2); }
            else if (c === "H" || c === "|") box(X + 4, Y, 8, TS, "rgba(90,240,120,0.8)");
            else if (c === "^") box(X, Y + 9, TS, 7, "rgba(255,70,220,0.95)", "rgba(255,70,220,0.25)");
            if (act.seams.has(tx + "," + ty)) box(X + 2, Y + 2, TS - 4, TS - 4, "rgba(80,230,255,0.6)");
            if (act.water.has(tx + "," + ty)) { g.fillStyle = "rgba(60,140,255,0.18)"; g.fillRect(X, Y, TS, TS); }
        }
        for (const cv of act.covers) for (const [tx, ty] of cv.tiles) { if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue; g.fillStyle = "rgba(80,230,255,0.10)"; for (let i = 0; i < TS; i += 4) g.fillRect(tx * TS + i, ty * TS + ((i / 4) % 2) * 8, 2, 2); }
        for (const s2 of act.solids) box(s2.x, s2.y, s2.w, s2.h, "rgba(255,70,60,0.95)", "rgba(255,70,60,0.18)");
        for (const t of act.tops) { g.fillStyle = "rgba(255,220,60,0.95)"; g.fillRect(t.x, t.y, t.w, 2); }
        for (const m of act.movers) { g.fillStyle = "rgba(255,220,60,0.95)"; g.fillRect(m.x, m.y, m.w, 2); }
        for (const c of act.crates) box(c.x, c.y, c.w, c.h, "rgba(255,150,40,0.9)");
        for (const c of act.currents) { box(c.x, c.y, c.w, c.h, "rgba(60,140,255,0.9)"); FONT.draw(g, c.dx > 0 ? ">" : c.dx < 0 ? "<" : c.dy > 0 ? "V" : "^", c.x + 3, c.y + 3, { color: "#9fd0ff" }); }
        if (act.flood) { g.fillStyle = "rgba(60,140,255,0.9)"; g.fillRect(cam.x, Math.round(act.flood.y), VW, 1); }
        for (const f of act.foes) {
            if (!f.alive) continue;
            const hz = f.kind === "steam" || f.kind === "hammer" || !f.stomp;
            const b = f.kind === "bat" ? { x: f.x + 5, y: f.y + 2, w: f.w - 10, h: f.h - 3 } : { x: f.x + 2, y: f.y + 2, w: f.w - 4, h: f.h - 3 };
            box(b.x, b.y, b.w, b.h, hz ? "rgba(255,70,220,0.95)" : "rgba(255,150,40,0.95)");
            if (f.stomp) { g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(b.x, b.y, b.w, 1); }
            if (f.kind === "steam" && f.out > 0.4) { const L = 34 * f.out, ex = f.side > 0 ? f.tx * TS : f.tx * TS + TS - L; box(ex, f.y, L, 9, "rgba(255,70,220,0.95)", "rgba(255,70,220,0.2)"); }
            if (f.path) { g.strokeStyle = "rgba(255,150,40,0.6)"; g.beginPath(); f.path.forEach((p, i) => (i ? g.lineTo(p.x + f.w / 2, p.y + f.h / 2) : g.moveTo(p.x + f.w / 2, p.y + f.h / 2))); if (f.loop) g.closePath(); g.stroke(); }
        }
        for (const ic of act.icicles) if (ic.state !== "gone") box(ic.x + 2, ic.y + 6, 4, 11, "rgba(255,70,220,0.9)");
        for (const r of act.rocks) box(r.x + 1, r.y + 1, r.w - 2, r.h - 2, "rgba(255,70,220,0.9)");
        for (const t of act.things) if (!t.got) box(t.x, t.y, t.w, t.h, "rgba(255,230,120,0.8)");
        for (const sg of act.signs) box(sg.x + 8 - 22, sg.y + 16 - 26, 44, 52, "rgba(200,200,200,0.35)");
        for (const dw of act.doorways) box(dw.x + 4, dw.y + dw.h - 3, dw.w - 8, 3, "rgba(80,230,255,0.9)");
        if (act.door) box(act.door.x + 6, act.door.y, act.door.w - 12, act.door.h, "rgba(255,255,255,0.6)");
        if (act.flag) box(act.flag.x + 1, act.flag.y, 3, act.flag.h, "rgba(255,255,255,0.6)");
        box(hero.x, hero.y, hero.w, hero.h, "#ffffff");
        g.restore();
    }

    window.RatRace = { open, close, isOpen };

    /* THE EDITOR'S HANDLE (14 Oct 2026): ariadne-editor.html draws levels with
       the game's own drawing and plays them in the game itself. It is on the
       dev server only: the editor is never published. */
    if (window.AriadneEditor || location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        let embedded = null;
        window.RatRace.dev = {
            TS, VW, VH, ROOM_W, ROOM_H, STAND_H, BODY_W, PLAT_H, TYPES, FOES, STOMP, TERRAIN, decoBox,
            sprites: () => { buildArt(); return sprites; },
            theme: zone => { TH = themeOf(zone); ZK = TH.key; return TH; },
            spr, spriteImg, applyTone, toneOn, hashTile, timberPal,
            build: (spec, zone, opts) => buildAct(spec, zone, 0, 0, opts),
            // the pieces of the still picture, for the editor to draw room by room
            drawBackdrop, drawFrame, clearSky, drawBackWalls, drawBackObject, drawTerrain, renderCovers, skyMaskOf, findHidden, beamRuns, drawWall,
            // (23 Oct 2026) the rails layer, as it stands in the editor (rows), over a span of tiles
            CEILS, drawRails: (x, a, rows, X0, Y0, X1, Y1) => { const keep = a.railRows; a.railRows = rows; try { drawRailRange(x, a, X0, Y0, X1, Y1, true); } finally { a.railRows = keep; } }, SLOPES,
            platform: (x, X, Y, W, o) => platform(x, X, Y, W, o),
            NEW_FOES, frameWidth, autoFrame, autoSupports, autoShaftBeams, autoProps, lanternBlocked, propBox, propImg, lightOf, torchOf,
            helpers,
            // the game's own drawing of the things that move, onto the editor's canvas, for its act
            paintCrate: (ctx, c) => paintCrate(ctx, c), ropeTopOf, crateImg, drawLamp, lampAt, lampStyle, wallLampArt, darkZoneFill, darkPaintArt,
            paint(ctx, a, fn) { const kg = g, ka = act; g = ctx; act = a; try { return fn({ drawNewAtRest, drawPump, drawFloat, drawSteam, pileArt, blob, drawToys, bumperImage, drawDecoOne, drawSpring, drawGear, drawNozzle, drawOozePipe, drawGlob, drawOrbitLedge, paintLava, heatHex, jetImage }); } finally { g = kg; act = ka; } },
            /* PLAY A LEVEL in a canvas of the editor's: spec as it stands, Scout
               at (x, y) or at its start, endless lives, nothing kept. */
            play(canvas, spec, zone, opts) {
                const o = opts || {};
                buildArt();
                embedded = { canvas, prevCv: cv, prevG: g, onExit: o.onExit || null };
                cv = canvas; g = canvas.getContext("2d"); g.imageSmoothingEnabled = false;
                if (!window.__rrKeys) { window.addEventListener("keydown", onKey, true); window.addEventListener("keyup", onKeyUp, true); window.__rrKeys = true; }
                gate = { live: true, admin: true }; gateDone = true;
                act = buildAct(spec, zone, o.zi || 0, o.ai || 0);
                state.zi = o.zi || 0; state.ai = o.ai || 0; state.lives = LIVES; state.score = 0; state.zoneTime = 0; state.practice = true; state.endless = true;
                state.coins = 0; state.time = 0; state.pops = []; state.parts = []; state.actScore = 0;
                const at = o.at || act.start;
                debug.dropAt = o.at ? { x: o.at.x, y: o.at.y } : null;
                hero = newHero(at.x, at.y);
                if (o.flag && act.flag) act.flag.taken = true;
                held.clear();
                snapCamera();
                state.mode = "play"; state.t = 0;
                sfx("stop");
                if (o.music !== false) { sfx("start", 1 + (o.ai || 0) * 3, {}); sfx("setZone", zone.music || 1); }
                startLoop();
                return { act, hero };
            },
            stop() {
                stopLoop(); held.clear(); sfx("haunt", 0); sfx("stop");
                const where = hero ? { x: hero.x, y: hero.y } : null;
                if (embedded) { cv = embedded.prevCv; g = embedded.prevG; embedded = null; }
                state.mode = "title";
                return where;
            },
            restart(spec, zone, opts) { return window.RatRace.dev.play(cv, spec, zone, opts); },
            debug,
            state: () => ({ mode: state.mode, hero, act, time: state.time, coins: state.coins, score: state.score }),
            step: n => { for (let i = 0; i < (n || 1); i++) update(); draw(); return state.mode; },
            freeze: () => stopLoop(), thaw: () => startLoop(),
            press: k => { press(k); held.add(k); }, release: k => held.delete(k),
            isEmbedded: () => Boolean(embedded),
            mute: on => sfx("setMuted", Boolean(on)),
            isMuted: () => { const m = music(); return Boolean(m && m.isMuted && m.isMuted()); }
        };
    }

    // Dev server only: a look inside, and a way to step the game for tests.
    if (location.hostname === "localhost") {
        window.RatRace._debug = () => ({
            state, hero, act, held, press, sprites, best, tileAt,
            step: n => { for (let i = 0; i < (n || 1); i++) update(); draw(); return state.mode; },
            tick: n => { for (let i = 0; i < (n || 1); i++) update(); return state.mode; },   // (no drawing: the play-tester's)
            freeze: () => stopLoop(), thaw: () => startLoop(),
            goAct: (zi, ai) => { state.zi = zi; state.ai = ai; startAct(); },
            // (26 Oct 2026, the bug scan: stood up and let go of whatever he held first; a ladder kept from before
            // drew him back toward it, through the rock, and a flat swim kept him 13px high in a 22px drop)
            teleport: (tx, ty) => { hero.climb = null; hero.mantle = null; hero.swim = false; hero.crouch = false; hero.h = STAND_H; hero.x = tx * TS + 3; hero.y = ty * TS + TS - STAND_H; hero.vx = hero.vy = 0; snapCamera(); },
            setGate: g2 => { gate = g2; },
            setFrame: n => { frameNo = n; },
            lava: () => lavaBoxesOf(act)
        });
    }
})();
