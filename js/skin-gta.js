/* The GTA VI launch skin (18 Nov 2026; the owner's picks from four mock-ups:
   "A and B, A being default, B the dark mode", with most of D's extras).

   Worn with the Vice palette (tools/themes.js, PAIRED in js/skin-wear.js).
   Everything here is original pixel art drawn at run time; nothing of the
   game's own art or logo is used.

     THE SKY      a pixel sunset over the sea, palms and a skyline (A), or the
                  same coast at night with a moon and lit windows when the
                  dark-mode bulb is on (B). Painted once per size into a
                  fixed layer behind the page, at a quarter of the screen's
                  pixels and scaled up crisp, so it costs nothing per frame.
     WANTED       five stars in the header: the visitor's daily-game streak
                  (the longer live one of Guess the Maze and Odd One Out, read
                  from this device's own records). One star a day, five max.
     CASH         the same records' all-time points, as dollars, top right.
     PHONE        texts in a pixel phone, bottom right: today's daily games
                  if they have not been played here, the next event. Click
                  it for the big phone, with the day's texts in a list.
     RADAR        bottom left, a little maze and a waypoint. Click (or tap)
                  it for Maze Maps, the radar maze (js/gta-maze.js): a
                  window on a computer, a sheet with a pad on a phone.
     RADIO        the car radio under the header, top left (js/gta-radio.js),
                  and the phone's Radio app.
     MISSION      "Mission passed!" across the screen when a daily game's day
                  is finished (the mazerats:daily-done event from js/guess.js
                  and js/oddoneout.js), with the day's points as cash.

   The extras are the homepage's only (body[data-page="home"]); the other
   pages that wear skins get the sky and the lettering. Nothing at all
   inside the homepage's game window (html.ff-embed), and none of it in the
   Hallway (html.hallway-open): it slides away with the archive and comes
   back with it (hallwayWatch, below). Reduced motion keeps everything
   still. stop() takes every node, listener and observer away. */
(function () {
    "use strict";

    const NAME = "gta";
    const root = document.documentElement;
    const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A finger rather than a mouse: the words say "tap", not "click" (scan 18 Nov evening).
    const touch = () => !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
    // The Hallway is open over the homepage: none of the skin's pieces are out (the owner's, 18 Nov 2026).
    const inHallway = () => document.documentElement.classList.contains("hallway-open");
    const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
    const read = (k) => { try { return store ? store.getItem(k) : null; } catch (e) { return null; } };
    const write = (k, v) => { try { if (store) store.setItem(k, v); } catch (e) { /* private mode */ } };
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

    let nodes = [], offs = [], timers = [], observer = null, on = false;
    const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); offs.push(() => target.removeEventListener(type, fn, opts)); };
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const add = (el, parent) => { (parent || document.body).appendChild(el); nodes.push(el); return el; };
    const make = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; };

    /* ---------------------------------------------------------------
       THE SKY */
    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const PAL = {
        sunset: { sky: ["#140a33", "#2a0d4f", "#4b1268", "#7a1a72", "#b02774", "#e2456c", "#ff7356", "#ffa04a", "#ffc861"],
            sea: ["#3a0f52", "#2b0b45", "#1d0836"], sun: ["#ffe27a", "#ffb14a", "#ff7a5a", "#ff4f7b"], silh: "#12061f", ring: "#2a0f3d",
            city: "#1e0a33", win: ["#ff5fa8", "#ffd27a", "#49e0ff"] },
        night: { sky: ["#05040f", "#08081d", "#0d0c2b", "#15103a", "#211447", "#331853", "#4a1c5e"],
            sea: ["#0b0820", "#080618", "#050412"], sun: null, silh: "#030208", ring: null,
            city: "#0b0a1d", win: ["#ff3fa4", "#2ee6ff", "#ffd45c", "#b44dff"] }
    };
    function paintSky(mode, vw, vh) {
        const S = 4, W = Math.ceil(vw / S), H = Math.ceil(vh / S);
        const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
        const g = cv.getContext("2d");
        const img = g.createImageData(W, H), d = img.data;
        const P = PAL[mode];
        let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const rgb = {};
        const hex = (c) => rgb[c] || (rgb[c] = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
        const px = (x, y, c, a) => {
            x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
            const i = (y * W + x) * 4, v = hex(c), k = a == null ? 1 : a;
            d[i] = d[i] * (1 - k) + v[0] * k; d[i + 1] = d[i + 1] * (1 - k) + v[1] * k; d[i + 2] = d[i + 2] * (1 - k) + v[2] * k; d[i + 3] = 255;
        };
        const rect = (x, y, w, h, c, a) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c, a); };
        const band = (list, y, y0, y1, x) => { const t = (y - y0) / Math.max(1, y1 - y0) * (list.length - 1), i = Math.floor(t), f = t - i;
            return list[Math.min(i + (f * 16 > BAYER[y & 3][x & 3] ? 1 : 0), list.length - 1)]; };

        const HZ = Math.round(H * 0.70);
        for (let y = 0; y < HZ; y++) for (let x = 0; x < W; x++) px(x, y, band(P.sky, y, 0, HZ, x));
        for (let k = 0; k < (mode === "night" ? Math.round(W * H / 400) : Math.round(W * H / 1600)); k++) {
            px(rnd() * W, rnd() * HZ * (mode === "night" ? 0.8 : 0.35), rnd() < 0.2 ? "#ffd6f0" : "#9a8cc8");
        }
        // The sun (striped as it sets) beside the window, or the moon.
        const narrow = vw < 760;
        const SX = Math.round(W * (narrow ? 0.72 : 0.79)), SY = HZ - 4, SR = Math.round(Math.min(H * 0.2, W * 0.16));
        if (P.sun) {
            for (let y = -SR; y <= 0; y++) for (let x = -SR; x <= SR; x++) {
                if (x * x + y * y > SR * SR) continue;
                const ty = (y + SR) / SR;
                if (ty > 0.45) { const b = Math.floor((ty - 0.45) * 22); if ((y + SR) % 6 < Math.min(1 + b * 0.5, 4)) continue; }
                const ci = Math.min(P.sun.length - 1, Math.floor(ty * P.sun.length * 0.999 + (BAYER[(y + 99) & 3][(x + 99) & 3] / 16 - 0.5)));
                px(SX + x, SY + y, P.sun[Math.max(0, ci)]);
            }
        } else {
            const mx = Math.round(W * 0.8), my = Math.round(H * 0.16), r = Math.max(6, Math.round(Math.min(W, H) * 0.045));
            for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
                if (x * x + y * y <= r * r && (x - r * 0.45) ** 2 + (y + r * 0.2) ** 2 > r * r * 0.7) px(mx + x, my + y, "#f4e9ff");
            }
        }
        /* The skyline: taller towards the edges, low behind the window. THE SAME
           TOWERS BY DAY AND NIGHT (20 Nov 2026, the owner's: "the buildings
           change"): they have a random stream of their own, and every window
           takes its draws whether lit or not, so the night's extra stars and
           extra lit windows no longer reshuffle the city. The night lights a
           window wherever the day does, and more besides. */
        let cs = 31; const crnd = () => (cs = (cs * 16807) % 2147483647) / 2147483647;
        const lit = [];
        for (let x = 0; x < W;) {
            const bw = 4 + Math.floor(crnd() * 9), dc = Math.abs(x - W / 2) / (W / 2);
            const bh = Math.floor(5 + crnd() * 17 * (0.3 + dc));
            rect(x, HZ - bh, bw, bh, P.city);
            if (crnd() < 0.25) rect(x + (bw >> 1), HZ - bh - 4, 1, 4, P.city);
            for (let wy = HZ - bh + 2; wy < HZ - 1; wy += 3) for (let wx = x + 1; wx < x + bw - 1; wx += 2) {
                const on = crnd(), pick = crnd();
                if (on < (mode === "night" ? 0.42 : 0.22)) { const c = P.win[Math.floor(pick * P.win.length)]; px(wx, wy, c); lit.push([wx, wy, c]); }
            }
            x += bw + (crnd() < 0.3 ? 1 : 0);
        }
        /* The sea, and the light on it. The sun's glint at half strength (20
           Nov 2026, the owner's: "a bit darker, so it's more subtle"). */
        for (let y = HZ; y < H; y++) {
            for (let x = 0; x < W; x++) px(x, y, band(P.sea, y, HZ, H, x));
            const k = y - HZ, cx = P.sun ? SX : W * 0.8, half = (P.sun ? SR : 12) * (1 - k / (H - HZ) * 0.6);
            if (k % 2 === 0) for (let s = 0; s < 3; s++) {
                const len = Math.floor(half * (0.3 + rnd() * 0.8)), x0 = Math.floor(cx - len / 2 + (rnd() - 0.5) * half);
                rect(x0, y, len, 1, mode === "night" ? "#6b4aa8" : P.sun[Math.min(P.sun.length - 1, 1 + (k >> 3))], mode === "night" ? 0.85 : 0.42);
            }
        }
        /* The city's lights on the water at night: a soft streak straight under
           each lit window, where its mirror image falls, stretched down the
           ripples and fading, then blurred and laid on faintly (20 Nov 2026,
           the owner's: "more subtle and blurry"). Built in a light buffer of
           its own, so the blur never smears the sea itself. */
        if (mode === "night" && lit.length) {
            const SH = H - HZ, acc = new Float32Array(W * SH * 3);
            const addL = (x, y, v, k) => { if (x < 0 || x >= W || y < 0 || y >= SH) return; const i = (y * W + x) * 3; acc[i] += v[0] * k; acc[i + 1] += v[1] * k; acc[i + 2] += v[2] * k; };
            for (const [wx, wy, c] of lit) {
                const v = hex(c), m = HZ - wy, len = 3 + Math.round(m * 0.6);
                for (let j = 0; j < len; j++) {
                    const y = m + j - 1;
                    if ((y + wx) % 3 === 2) continue;                                  // broken by the ripples
                    const k = (1 - j / len) * 0.9;
                    const jig = Math.round(Math.sin((y + wx * 3) * 1.7) * 0.8);
                    addL(wx + jig, y, v, k);
                }
            }
            // Box blur, twice across and once down: wide and soft, as lights on water are.
            const blur = (src, rx, ry) => {
                const out = new Float32Array(src.length);
                for (let y = 0; y < SH; y++) for (let x = 0; x < W; x++) {
                    let r = 0, gg = 0, b = 0, n = 0;
                    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
                        const X = x + dx, Y = y + dy;
                        if (X < 0 || X >= W || Y < 0 || Y >= SH) continue;
                        const i = (Y * W + X) * 3; r += src[i]; gg += src[i + 1]; b += src[i + 2]; n++;
                    }
                    const o = (y * W + x) * 3; out[o] = r / n; out[o + 1] = gg / n; out[o + 2] = b / n;
                }
                return out;
            };
            const soft = blur(blur(acc, 1, 0), 1, 1);
            for (let y = 0; y < SH; y++) for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 3, p = ((HZ + y) * W + x) * 4;
                const a = 0.55 * (1 - y / SH * 0.5);
                d[p] = Math.min(255, d[p] + soft[i] * a); d[p + 1] = Math.min(255, d[p + 1] + soft[i + 1] * a); d[p + 2] = Math.min(255, d[p + 2] + soft[i + 2] * a);
            }
        }
        // Palms.
        const palm = (bx, h, lean, scale) => {
            const c = P.silh; let tx = bx, ty = H;
            for (let i = 0; i <= h; i++) {
                const t = i / h; tx = bx + lean * t * t; ty = H - i;
                const w = t < 0.3 ? 3 : 2; rect(Math.round(tx) - (w >> 1), Math.round(ty), w, 1, c);
                if (i % 4 === 0 && P.ring) px(Math.round(tx) - 1, Math.round(ty), P.ring);
            }
            for (const [a, lm] of [[-2.9, 1], [-2.5, 1.1], [-2.0, 0.9], [-1.2, 0.8], [-0.6, 1], [-0.2, 1.1], [0.25, 1], [-1.6, 0.7], [-3.3, 0.8]]) {
                const L = 26 * scale * lm;
                for (let s = 0; s < L; s++) {
                    const fx = tx + Math.cos(a) * s, fy = ty + Math.sin(a) * s + 0.022 * s * s / scale;
                    const th = s < L * 0.5 ? 2 : 1;
                    rect(Math.round(fx), Math.round(fy), th, th, c);
                    const prof = Math.sin(Math.PI * Math.min(1, s / L * 1.05)) * 6 * scale;
                    if (s > 2) {
                        const dir = Math.cos(a) > 0 ? 1 : -1;
                        for (let q = 1; q <= prof; q++) { px(fx - dir * q * 0.35, fy + q, c); if (q < prof * 0.45) px(fx + dir * q * 0.5, fy - q * 0.6, c); }
                    }
                }
            }
            rect(Math.round(tx) - 2, Math.round(ty) - 1, 4, 3, c);
        };
        const ps = Math.max(0.6, Math.min(1.3, W / 320));
        palm(Math.round(W * 0.06), Math.round(H * 0.78), 18 * ps, 1.25 * ps);
        palm(Math.round(W * 0.93), Math.round(H * 0.82), -20 * ps, 1.3 * ps);
        if (!narrow) {
            palm(Math.round(W * 0.15), Math.round(H * 0.55), -10, 0.95);
            palm(Math.round(W * 0.84), Math.round(H * 0.5), 9, 0.85);
        }
        if (mode !== "night") for (const [bx, by] of [[0.32, 0.18], [0.35, 0.2], [0.66, 0.12]]) {
            const x = W * bx, y = H * by;
            [[-2, 0], [-1, 1], [0, 0], [1, 1], [2, 0]].forEach(([i, j]) => px(x + i, y + j, P.silh));
        }
        g.putImageData(img, 0, 0);
        return { url: cv.toDataURL(), w: W * S, h: H * S };
    }

    let sky = null, painted = "", resizeTimer = 0;
    // The phone's Weather app can fix it; otherwise the dark-mode bulb decides.
    function skyMode() {
        const pick = prefs().sky, hr = new Date().getHours();
        return pick === "sunset" || pick === "night" ? pick : pick === "live" ? (hr >= 7 && hr < 19 ? "sunset" : "night") : root.hasAttribute("data-dark") ? "night" : "sunset";
    }
    function drawSky() {
        if (!sky) return;
        const mode = skyMode();
        neonMode = mode;
        const w = innerWidth, h = Math.max(innerHeight, 320);
        // A page laid out at no width (a hidden pane or frame) has no sky to paint yet: the resize repaints it.
        if (!(w > 0)) return;
        // Only when something it depends on changed: the mode, or the size by more than a little.
        const key = mode + ":" + Math.round(w / 40) + ":" + Math.round(h / 40);
        if (key === painted) return;
        painted = key;
        const s = paintSky(mode, w, h);
        sky.style.backgroundImage = "url(" + s.url + ")";
        sky.style.backgroundSize = s.w + "px " + s.h + "px";
    }

    /* ---------------------------------------------------------------
       THE NEON (20 Nov 2026, the owner's: "neon festoon lights or something
       hanging from the top bar - subtle animation similar to christmas
       skin's lights"; he picked tube swags over bulbs). Glass tubes in the
       Vice colours, each draped between two clips under the bar, with dark
       electrode caps at the ends. Drawn smooth at the screen's own density,
       not as pixels: neon is light, and a glow in steps reads as paint. Each
       tube breathes on its own slow cycle (between about half and full), a
       swell rolls along the row every eleven seconds, and once in a long
       while one tube sputters, as old neon does. Softer at sunset than at
       night. Still, at full, for reduced motion. */
    const NEON = ["#ff3fa4", "#2ee6ff", "#ffd45c", "#b44dff", "#ff7a3d"];
    const NEON_H = 42;
    let neonCv = null, neonTubes = [], neonW = 0, neonRaf = 0, neonMode = "sunset", neonSputter = null;
    function neonLayout(w) {
        let s = 97; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const tubes = [];
        let x = 8 + Math.floor(r() * 30), ci = 0;
        while (x < w - 40) {
            const span = Math.min(w - 8 - x, 130 + Math.floor(r() * 80));
            if (span < 60) break;
            // About one in three hangs lower (the owner's, 20 Nov 2026: "so it's less consistent").
            const low = r() < 0.34;
            tubes.push({ x0: x, x1: x + span, sag: low ? 15 + r() * 6 : 7 + r() * 6, c: NEON[ci % NEON.length], phase: r(), period: 4 + r() * 3 });
            ci++;
            x += span + 10 + Math.floor(r() * 26);
        }
        return tubes;
    }
    function neonLevel(t, i, now) {
        if (now == null) return 0.9;
        const own = 0.5 + 0.5 * Math.sin((now / t.period + t.phase) * Math.PI * 2);
        const swell = 0.5 + 0.5 * Math.sin((now / 11 - t.x0 / 420) * Math.PI * 2);
        let L = 0.5 + 0.5 * (0.6 * own + 0.4 * swell);
        // The sputter: a few quick drops over half a second.
        if (neonSputter && neonSputter.i === i && now >= neonSputter.at && now < neonSputter.at + 0.55) {
            const k = Math.floor((now - neonSputter.at) * 22);
            if (k % 3 !== 2) L *= 0.25;
        }
        return L;
    }
    function neonDraw(now) {
        if (!neonCv) return;
        const ctx = neonCv.getContext("2d"), dpr = neonCv.width / Math.max(1, neonW);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, neonW, NEON_H);
        // Pick the next sputter now and then, never two at once.
        if (now != null && neonTubes.length && (!neonSputter || now > neonSputter.at + 1)) {
            neonSputter = { i: Math.floor(Math.random() * neonTubes.length), at: now + 22 + Math.random() * 20 };
        }
        const night = neonMode === "night", strength = night ? 1 : 0.72;
        const path = (t, inset) => {
            const a = t.x0 + inset, b = t.x1 - inset, top = 4;
            ctx.beginPath();
            ctx.moveTo(a, top);
            ctx.quadraticCurveTo((a + b) / 2, top + t.sag * 2, b, top);
        };
        neonTubes.forEach((t, i) => {
            const L = neonLevel(t, i, now) * strength;
            ctx.lineCap = "round";
            // The glow: wide, faint, blurred.
            ctx.save();
            ctx.shadowColor = t.c; ctx.shadowBlur = 14 * L;
            ctx.globalAlpha = 0.28 * L; ctx.strokeStyle = t.c; ctx.lineWidth = 7;
            path(t, 4); ctx.stroke();
            ctx.restore();
            // The tube: its colour, then a hot thin core.
            ctx.globalAlpha = 0.55 + 0.45 * L; ctx.strokeStyle = t.c; ctx.lineWidth = 2.6;
            path(t, 4); ctx.stroke();
            ctx.globalAlpha = 0.35 + 0.5 * L; ctx.strokeStyle = "#fff4fb"; ctx.lineWidth = 0.9;
            path(t, 5); ctx.stroke();
            ctx.globalAlpha = 1;
            // Electrode caps and the clips that hold them up.
            for (const x of [t.x0 + 3, t.x1 - 3]) {
                ctx.fillStyle = "#1b0f26"; ctx.fillRect(x - 2.5, 2, 5, 5);
                ctx.fillStyle = "#4a3360"; ctx.fillRect(x - 2.5, 2, 5, 1);
                ctx.fillStyle = "#0e0716"; ctx.fillRect(x - 0.5, 0, 1, 2);
            }
        });
    }
    function neonSize() {
        if (!neonCv) return;
        const hd = neonCv.parentNode, w = hd ? hd.clientWidth : innerWidth;
        if (w === neonW) return;
        neonW = w;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        neonCv.width = Math.round(w * dpr); neonCv.height = Math.round(NEON_H * dpr);
        neonCv.style.width = w + "px"; neonCv.style.height = NEON_H + "px";
        neonTubes = neonLayout(w);
        neonDraw(reduced() ? null : performance.now() / 1000);
    }
    /* 20 Nov 2026, the scan: the tubes hang below the bar, over the page. Not on the Atlas, whose title sits
       right under its short bar (they ran across "The Sorcerer's Atlas" and the Find a room box); and once
       the page is scrolled they fade away, so they never draw over what passes under the bar (the Menu's
       rows, a card's title). Back as the page returns to its top. Gone in the Hallway (css). */
    function neonStart() {
        const hd = document.querySelector(".site-header");
        if (!hd || (document.body && document.body.getAttribute("data-page") === "wizard")) return;
        neonCv = add(make("canvas", "gx-neon"), hd);
        neonCv.setAttribute("aria-hidden", "true");
        const away = () => { if (neonCv) neonCv.classList.toggle("is-away", (window.scrollY || 0) > 4); };
        listen(window, "scroll", away, { passive: true });
        away();
        neonSize();
        // Twelve frames a second is plenty for a breath; nothing is drawn while the page is hidden.
        let last = 0;
        const tick = (ms) => {
            neonRaf = requestAnimationFrame(tick);
            if (ms - last < 83) return;
            last = ms;
            // Faded away or in the Hallway: nothing to see, nothing drawn (the fade itself keeps the last frame).
            if (neonCv && neonCv.classList.contains("is-away") && getComputedStyle(neonCv).opacity === "0") return;
            if (inHallway()) return;
            neonDraw(performance.now() / 1000);
        };
        if (!reduced()) neonRaf = requestAnimationFrame(tick);
        offs.push(() => { cancelAnimationFrame(neonRaf); neonRaf = 0; neonCv = null; neonW = 0; });
    }

    /* ---------------------------------------------------------------
       THE PLAYER'S RECORDS: this device's own, as the games keep them. */
    const GAMES = [
        { key: "guess", label: "Guess the Maze", stats: "mazerats_guess_stats_v4", open: () => window.openGuessGame },
        { key: "odd", label: "Odd One Out", stats: "mazerats_odd_stats_v2", open: () => window.openOddOneOut }
    ];
    const utcDay = (t) => new Date(t).toISOString().slice(0, 10);
    function who() { return window.Account && Account.current && Account.current.publicId ? String(Account.current.publicId) : ""; }
    function record(game) {
        let s = null;
        try { s = JSON.parse(read(game.stats) || "null"); } catch (e) { s = null; }
        // Only this person's: a record stamped by someone else on a shared computer is not theirs to show.
        if (!s || typeof s !== "object" || (s.who || "") !== who()) return null;
        return s;
    }
    /* NO WRONG FIRST PAINT (the owner's, 18 Nov 2026: "streak wanted stars
       and maze points cash don't all load in properly at first"). A
       signed-in player's records are stamped with their account, and the
       account is not known until `me` answers, a moment after the page
       paints: read before then, every record looked like someone else's and
       the header showed no stars and $0 until the next look. So the last
       figures shown are kept (STAND_KEY) and shown straight away while the
       account is still being asked, then replaced the moment it answers
       (Account.onChange, below). */
    const STAND_KEY = "mazerats_gta_standing";
    /* THE ACCOUNT'S OWN FIGURES (the owner's, 19 Nov 2026: "stars dont seem
       accurate, likely because its browser saved, make it so signed in
       players have these things saved to their account across devices").
       This device's records only know the days played on it, so a player
       who plays on their phone and their computer saw a different streak and
       total on each. Signed in, the server's figures (player-data.js: stats
       and oddStats, counted from the score rows, the same ones the games'
       own cards show) are used, and the device's only where they are ahead
       (a day just finished, its save still on the way). The same answer
       carries the Street Cash (STREET CASH, below). Asked again at most
       once a minute, when the page comes back into view. */
    let acct = null, acctAt = 0, acctAsking = false, storedHooked = false;
    const accountData = () => (acct && who() && acct.who === who() ? acct.data : null);
    function takeAccount(w, d) {
        if (!d || typeof d !== "object") return;
        acct = { who: w, data: d };
        adoptStreet(d.gta);
        if (on) { drawStanding(); drawPhone(); }
    }
    function pullAccount(force) {
        if (!window.Account || !Account.current || typeof Account.fetchState !== "function" || !who()) { acct = null; return; }
        if (acctAsking || (!force && accountData() && Date.now() - acctAt < 60000)) return;
        acctAt = Date.now(); acctAsking = true;
        const asked = who();
        Account.fetchState().then((d) => { if (who() === asked) takeAccount(asked, d); })
            .catch(() => { /* the device's own records stand */ })
            .then(() => { acctAsking = false; if (on) drawStanding(); });
    }
    // Signed in and the account's answer still on its way: the last figures stand meanwhile.
    const accountPending = () => !!(window.Account && (!Account.known || (who() && !accountData() && acctAsking)));
    function standing() {
        const today = utcDay(Date.now()), yesterday = utcDay(Date.now() - 864e5);
        if (accountPending()) {
            try {
                const c = JSON.parse(read(STAND_KEY) || "null");
                // Yesterday's figures still stand today: a streak is alive until a day is missed.
                // Only this player's (or, before the sign-in is known, the last one shown here).
                if (c && (c.day === today || c.day === yesterday) && (!Account.known || (c.who || "") === who())) return { streak: c.streak || 0, points: c.points || 0, played: c.day === today ? c.played || {} : {} };
            } catch (e) { /* worked out below */ }
        }
        const remote = accountData();
        let streak = 0, points = 0; const played = {};
        GAMES.forEach((g) => {
            const r = remote && remote[g.key === "guess" ? "stats" : "oddStats"];
            let pts = 0;
            [record(g), r && typeof r === "object" ? r : null].forEach((s) => {
                if (!s) return;
                const live = s.lastDay === today || s.lastDay === yesterday ? Number(s.streak) || 0 : 0;
                streak = Math.max(streak, live);
                pts = Math.max(pts, Number(s.points) || 0);
                if (s.lastDay === today) played[g.key] = true;
            });
            points += pts;
            if (!played[g.key]) played[g.key] = false;
        });
        if (!accountPending()) write(STAND_KEY, JSON.stringify({ day: today, streak, points, played, who: who() }));
        return { streak, points, played };
    }

    /* ---------------------------------------------------------------
       WANTED (the streak) and CASH (the points) */
    let wanted = null, cash = null, shownCash = -1;
    function drawStanding() {
        const st = standing();
        if (wanted) {
            const n = Math.min(5, st.streak);
            wanted.innerHTML = `<span class="gx-wanted-lab">Wanted</span><span class="gx-stars">${
                [0, 1, 2, 3, 4].map((i) => `<i class="gx-star${i < n ? " is-on" : ""}${i === n - 1 && st.streak > 0 ? " is-new" : ""}"></i>`).join("")}</span>`;
            const say = st.streak > 0 ? `Wanted level ${n}: a ${st.streak}-day daily-game streak` : "Wanted level 0: play today's daily games to start a streak";
            wanted.setAttribute("title", say);
            wanted.setAttribute("aria-label", say);
        }
        // Maze Points and Street Cash together (Street Cash is seen only here).
        const total = st.points + street().cash;
        if (cash && total !== shownCash) {
            countTo(cash.querySelector(".gx-cash-n"), shownCash < 0 ? total : shownCash, total);
            shownCash = total;
        }
    }
    /* Phones (760px and under): the cash goes into the hero, top right, level with the
       MAZE RATS title, and back to its own place on a wider window (css/skin-gta.css,
       .gx-cash.is-inhero; 19 Nov 2026). */
    /* The WANTED stars go with it (20 Nov 2026, the scan): in the top bar on a phone they took a third row,
       115px of bar against Classic's 88. In the hero they sit level with the title, just left of the cash. */
    function placeCash() {
        if (!cash) return;
        const hero = innerWidth <= 760 ? document.querySelector("main .hero") : null;
        const title = hero && hero.querySelector(".hero-title");
        if (hero && title) {
            if (cash.parentNode !== hero) hero.prepend(cash);
            cash.classList.add("is-inhero");
            const top = Math.round(title.getBoundingClientRect().top - hero.getBoundingClientRect().top);
            cash.style.top = top + "px";
            if (wanted) {
                if (wanted.parentNode !== hero) hero.prepend(wanted);
                wanted.classList.add("is-inhero");
                wanted.style.top = top + "px";
                fitWanted();
            }
        } else {
            if (cash.parentNode !== document.body) document.body.appendChild(cash);
            cash.classList.remove("is-inhero");
            cash.style.top = "";
            const brand = document.querySelector(".site-header .brand-group");
            if (wanted && brand && wanted.parentNode !== brand) brand.appendChild(wanted);
            if (wanted) { wanted.classList.remove("is-inhero"); wanted.style.top = ""; }
        }
    }
    function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
    // The stars beside the cash in the hero keep clear of it as its figure grows.
    const fitWanted = () => { if (wanted && cash && wanted.classList.contains("is-inhero")) wanted.style.setProperty("--gx-cash-w", Math.ceil(cash.getBoundingClientRect().width) + "px"); };
    function countTo(el, from, to) {
        if (!el) return;
        if (reduced() || from === to) { el.textContent = money(to); fitWanted(); return; }
        const t0 = performance.now(), dur = 900;
        const step = (t) => {
            if (!on) return;
            const k = Math.min(1, (t - t0) / dur);
            el.textContent = money(from + (to - from) * (1 - Math.pow(1 - k, 3)));
            fitWanted();
            if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /* ---------------------------------------------------------------
       THE PHONE */
    /* The small phone in the corner buzzes while there are unread texts, with
       a count; a preview of the newest pops up beside it on a big screen.
       Clicking either opens the BIG phone: every text of the day in a list,
       newest first, each with its own button where it leads somewhere.
       Opening it reads them all. Read is remembered for the day. */
    const SEEN_KEY = "mazerats_gta_texts";        // { day, ids: [...] } read today
    let phone = null, inbox = [], unread = [], noteTimer = 0;
    function seen() {
        try { const s = JSON.parse(read(SEEN_KEY) || "null"); if (s && s.day === utcDay(Date.now()) && Array.isArray(s.ids)) return s.ids; } catch (e) { /* none */ }
        return [];
    }
    function markSeen(ids) {
        const all = seen();
        ids.forEach((id) => { if (!all.includes(id)) all.push(id); });
        write(SEEN_KEY, JSON.stringify({ day: utcDay(Date.now()), ids: all }));
    }
    function texts() {
        const st = standing(), out = [];
        out.push({ id: "hello", from: "Maze Rats", text: "Welcome to Maze Rats. To celebrate the launch of GTA VI, the archive is running from Vice City until the end of the month." });
        GAMES.forEach((g) => {
            if (!st.played[g.key]) out.push({ id: "daily-" + g.key, from: g.label, text: `Today's ${g.label} just dropped. Don't keep me waiting.`, act: "Play", go: () => { const f = g.open(); if (typeof f === "function") f(); } });
        });
        const nxt = street().top + 1;
        out.push({ id: "maps-" + nxt, from: "Maze Maps", text: nxt === 1 ? `Cops are out on the streets. ${touch() ? "Tap" : "Click"} the radar (or open Maze Maps) and lose them.` : `Cops are out on Level ${nxt}. Think you can lose them?`, act: "Drive", go: () => drive() });
        const ev = document.querySelector(".header-events-title");
        const when = document.querySelector(".header-events-when");
        const evName = ev && ev.textContent.trim();
        if (evName && !/^no upcoming/i.test(evName)) out.push({ id: "event-" + evName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40), from: "Events", text: `Heads up: ${evName}${when && when.textContent.trim() ? ", " + when.textContent.trim() : ""}.` });
        return out;
    }
    const clock = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
    const isBig = () => !!(phone && phone.classList.contains("is-big"));
    function drawPhone() {
        if (!phone) return;
        inbox = texts();
        const read = seen();
        unread = inbox.filter((m) => !read.includes(m.id));
        const badge = phone.querySelector(".gx-phone-badge");
        badge.textContent = unread.length ? String(unread.length) : "";
        badge.hidden = !unread.length;
        phone.classList.toggle("has-texts", unread.length > 0 && prefs().buzz);
        phone.querySelector(".gx-phone-btn").setAttribute("aria-label", unread.length ? `Texts: ${unread.length} new` : "Texts");
        if (isBig()) drawList();
        syncEdge();
    }
    /* THE APPS (the owner's, 19 Nov 2026: six that each do something the
       page can't, plus the screensaver). The big phone opens on its home
       screen, Messages wearing a red dot with the count of new texts. ‹ Home goes
       back to it; ✕ (or Esc, or a click outside) shrinks the phone. */
    /* The icons are drawn, not typed (the owner's, 19 Nov 2026: "perfectly
       centered"): a font's glyphs sit off its own baseline, so each is a 32px
       drawing centred on a 32px square. */
    const gear = (() => {
        let d = "";
        for (let k = 0; k < 8; k++) {
            const a = k * Math.PI / 4, w = 0.2;
            for (const [r, t] of [[10.5, a - 0.32], [14, a - w], [14, a + w], [10.5, a + 0.32]]) d += (d ? "L" : "M") + (16 + Math.cos(t) * r).toFixed(2) + " " + (16 + Math.sin(t) * r).toFixed(2);
        }
        return d + "Z";
    })();
    const ICONS = {
        messages: `<rect x="4" y="8" width="24" height="17" rx="3" fill="#fff"/><path d="M5.5 10 16 18 26.5 10" fill="none" stroke="#13a050" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`,
        // A folded paper map, a route winding across it to a pin.
        maps: `<path d="M3.5 8.5 11.5 5.5V24.5L3.5 27.5Z" fill="#f2ecd9"/><path d="M11.5 5.5 20.5 8.5V27.5L11.5 24.5Z" fill="#d6cdb3"/><path d="M20.5 8.5 28.5 5.5V24.5L20.5 27.5Z" fill="#f2ecd9"/>` +
            `<path d="M6.5 23V17H10V12.5H15V19.5H18.5V14H23" fill="none" stroke="#ff5fa2" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
            `<path d="M23.5 3a4.8 4.8 0 0 1 4.8 4.8c0 3.6-4.8 8.2-4.8 8.2s-4.8-4.6-4.8-8.2A4.8 4.8 0 0 1 23.5 3z" fill="#e2185b" stroke="#35373a" stroke-width="1.4"/><circle cx="23.5" cy="7.8" r="1.8" fill="#fff"/>`,
        radio: `<path d="M11.5 23V10.5L25 7.5V20" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M11.5 10.5 25 7.5V11.5L11.5 14.5Z" fill="#fff"/>` +
            `<ellipse cx="8.4" cy="23" rx="4" ry="3.1" transform="rotate(-20 8.4 23)" fill="#fff"/><ellipse cx="21.9" cy="20" rx="4" ry="3.1" transform="rotate(-20 21.9 20)" fill="#fff"/>`,
        bank: `<path d="M16 3.5 28.5 10.5H3.5Z" fill="#7dff9a"/><rect x="5" y="11.5" width="22" height="2" fill="#7dff9a"/>` +
            `<g fill="#7dff9a"><rect x="6.5" y="14.5" width="3" height="9"/><rect x="12" y="14.5" width="3" height="9"/><rect x="17" y="14.5" width="3" height="9"/><rect x="22.5" y="14.5" width="3" height="9"/></g>` +
            `<rect x="3.5" y="24.5" width="25" height="3.5" rx="1" fill="#7dff9a"/>`,
        weather: `<g stroke="#ffe27a" stroke-width="2.2" stroke-linecap="round">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = k * Math.PI / 4; return `<line x1="${(20 + Math.cos(a) * 8.5).toFixed(1)}" y1="${(11 + Math.sin(a) * 8.5).toFixed(1)}" x2="${(20 + Math.cos(a) * 11).toFixed(1)}" y2="${(11 + Math.sin(a) * 11).toFixed(1)}"/>`; }).join("")}</g>` +
            `<circle cx="20" cy="11" r="6" fill="#ffe27a"/>` +
            `<path d="M8.5 27h14a5 5 0 0 0 .3-10 7 7 0 0 0-13.3 1.6A4.3 4.3 0 0 0 8.5 27z" fill="#fff"/>`,
        screensaver: `<rect x="3.5" y="5" width="25" height="17.5" rx="2.2" fill="#12061f" stroke="#fff" stroke-width="2"/>` +
            `<path d="M6 7.5H13L10.5 20H6Z" fill="#ff5fa2"/><path d="M14.5 7.5H21L18.5 20H12Z" fill="#ffd166"/><path d="M22.5 7.5H26V20H20Z" fill="#2ee6ff"/>` +
            `<rect x="13.5" y="22.5" width="5" height="3" fill="#fff"/><rect x="9.5" y="25.5" width="13" height="2.5" rx="1.2" fill="#fff"/>`,
        settings: `<path d="${gear}M20.2 16a4.2 4.2 0 1 0-8.4 0a4.2 4.2 0 1 0 8.4 0Z" fill="#fff" fill-rule="evenodd"/>`
    };
    const APPS = [
        { id: "messages", label: "Messages", cls: "a-msg" },
        { id: "maps", label: "Maze Maps", cls: "a-maps" },
        { id: "radio", label: "Radio", cls: "a-radio" },
        { id: "bank", label: "Bank", cls: "a-bank" },
        { id: "weather", label: "Weather", cls: "a-wx" },
        { id: "screensaver", label: "Screensaver", cls: "a-ss" },
        { id: "settings", label: "Settings", cls: "a-set" }
    ].map((a) => Object.assign(a, { icon: `<svg viewBox="0 0 32 32" width="32" height="32">${ICONS[a.id]}</svg>` }));
    let view = "home", phoneGame = null;
    const TITLES = { home: "", messages: "Messages", maps: "Maze Maps", drive: "Maze Maps", radio: "Radio", bank: "Maze Bank", weather: "Vice Weather", settings: "Settings" };
    /* The radar is the way in, on a computer and (since 19 Nov 2026, the owner's) on a phone too, where
       it is smaller and opens as a sheet across the bottom with the pad. With it switched off in
       Settings, the game plays inside the phone instead. */
    const radarShown = () => !!(gps && prefs().radar);
    const narrow = () => innerWidth <= 900;
    function drawList() { if (isBig()) renderView(); }
    function renderView() {
        if (!phone) return;
        if (view !== "drive" && phoneGame) { phoneGame.destroy(); phoneGame = null; }
        phone.querySelector(".gx-big-time").textContent = clock();
        const head = phone.querySelector(".gx-big-head"), body = phone.querySelector(".gx-big-body");
        head.hidden = view === "home";
        head.querySelector(".gx-big-title").textContent = TITLES[view] || "";
        body.className = "gx-big-body v-" + view;
        // The phone's own dark mode, on unless switched off (the owner's, 19 Nov 2026).
        phone.querySelector(".gx-big").classList.toggle("is-dark", !!prefs().phoneDark);
        const read = seen();
        if (view === "home") {
            const d = new Date();
            body.innerHTML = `<div class="gx-home-clock">${esc(clock())}</div><div class="gx-home-date">${esc(d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }))}</div>` +
                `<div class="gx-apps">${APPS.map((a) => `<button type="button" class="gx-app ${a.cls}" data-app="${a.id}"><i aria-hidden="true">${a.icon}</i><span>${a.label}</span>` +
                    `${a.id === "messages" && unread.length ? `<b class="gx-app-badge">${unread.length}</b>` : ""}</button>`).join("")}</div>` +
                `<div class="gx-home-foot"><button type="button" class="gx-big-shut" aria-label="Close phone">✕</button>` +
                `<button type="button" class="gx-dk${prefs().phoneDark ? " is-on" : ""}" data-dark="1" role="switch" aria-checked="${!!prefs().phoneDark}" aria-label="Dark mode"><i aria-hidden="true">` +
                `<svg viewBox="0 0 20 20"><path d="M10 2.5a5.5 5.5 0 0 0-3.3 9.9c.6.5.9 1.1.9 1.8v.3h4.8v-.3c0-.7.3-1.3.9-1.8A5.5 5.5 0 0 0 10 2.5z" fill="currentColor"/><rect x="7.6" y="15.3" width="4.8" height="1.4" rx=".7" fill="currentColor"/><rect x="8.2" y="17.3" width="3.6" height="1.3" rx=".65" fill="currentColor"/></svg></i></button></div>`;
        } else if (view === "messages") {
            body.innerHTML = `<ul class="gx-big-list">${inbox.length ? inbox.slice().reverse().map((m, i) =>
                `<li class="gx-text${read.includes(m.id) ? "" : " is-new"}">` +
                `<span class="gx-text-pic" aria-hidden="true">${esc(m.from.charAt(0))}</span>` +
                `<span class="gx-text-body"><b>${esc(m.from)}</b><span>${esc(m.text)}</span>` +
                `${m.go ? `<button type="button" class="gx-text-go" data-i="${inbox.length - 1 - i}">${esc(m.act || "Open")}</button>` : ""}</span></li>`).join("")
                : `<li class="gx-text-none">No texts. It's quiet out there.</li>`}</ul>`;
            markSeen(inbox.map((m) => m.id));
            unread = [];
            const badge = phone.querySelector(".gx-phone-badge"); badge.hidden = true;
            phone.classList.remove("has-texts");
            syncEdge();
        } else if (view === "maps") {
            const s = street(), nxt = s.top + 1, lv = window.GtaMaze ? GtaMaze.copsOf(nxt) : (nxt >= 2 ? 2 : 1);
            const rows = [];
            for (let l = s.top; l >= 1; l--) rows.push(`<li class="gx-row"><span>Level ${l}${s.times[l] ? ` · best ${s.times[l]}s` : ""}</span><b class="gx-g">${money(s.best[l] || 0)}</b><button type="button" class="gx-pill gx-ghost" data-level="${l}">Replay</button></li>`);
            body.innerHTML = `<div class="gx-big-top"><span>Street Cash</span><b>${money(s.cash)}</b><span>Only seen in Vice City</span></div>` +
                `<ul class="gx-rows"><li class="gx-row is-next"><span><b>Level ${nxt}</b> · ${lv} cop${lv > 1 ? "s" : ""}</span><button type="button" class="gx-pill" data-level="${nxt}">Drive ▸</button></li>` +
                rows.join("") + `<li class="gx-row"><span>Busted today</span><b>${s.busts}</b></li></ul>` +
                `<p class="gx-small">Replays pay only what beats your best for that level.</p>`;
        } else if (view === "drive") {
            body.innerHTML = `<div class="gx-drive"></div>`;
        } else if (view === "bank") {
            const st = standing(), s = street();
            const log = s.log.filter((l) => l.day === utcDay(Date.now())).slice(0, 6);
            body.innerHTML = `<div class="gx-big-top"><span>Balance</span><b>${money(st.points + s.cash)}</b><span>Only seen in Vice City</span></div>` +
                `<ul class="gx-rows"><li class="gx-row"><span>Maze points <small>daily games</small></span><b>${money(st.points)}</b></li>` +
                `<li class="gx-row"><span>Street Cash <small>Maze Maps</small></span><b>${money(s.cash)}</b></li>` +
                `<li class="gx-row gx-sec">Today</li>` +
                (log.length ? log.map((l) => `<li class="gx-row"><span>${esc(l.what)}</span><b class="gx-g">+${money(l.amt)}</b></li>`).join("") : `<li class="gx-row"><span class="gx-dim">Nothing paid in yet today.</span></li>`) +
                `</ul><p class="gx-small">Read-only: there's nothing to spend it on.</p>`;
        } else if (view === "weather") {
            const p = prefs(), tiles = [["sunset", "☀ Sunset"], ["night", "☾ Night"], ["live", "◌ Live"]];
            body.innerHTML = `<div class="gx-wx">${tiles.map(([k, l]) => `<button type="button" class="gx-wx-t wx-${k}${p.sky === k ? " is-on" : ""}" data-sky="${k}" aria-pressed="${p.sky === k}">${l}</button>`).join("")}` +
                `<button type="button" class="gx-wx-t wx-rain${p.rain ? " is-on" : ""}" data-rain="1" aria-pressed="${p.rain}">☂ Rain</button></div>` +
                `<p class="gx-small">${p.sky === "auto" ? "The sky follows your dark-mode bulb. Pick one to fix it; tap it again to go back." : p.sky === "live" ? "Live: sunset by day, night after dark, on your clock." : "Tap it again to follow the bulb."} Rain falls over either: mostly light, with heavy bursts.</p>`;
        } else if (view === "settings") {
            const p = prefs(), row = (k, l) => `<li class="gx-row"><span>${l}</span><button type="button" class="gx-tog${p[k] ? " is-on" : ""}" data-pref="${k}" role="switch" aria-checked="${!!p[k]}" aria-label="${l}"></button></li>`;
            /* The car radio has its own switch: it was tied to the radar's, so switching the radar off took the
               radio away too (scan 18 Nov evening). Only where there is a car radio, on a computer. */
            body.innerHTML = `<ul class="gx-rows">${row("radar", "Radar in the corner")}${narrow() ? "" : row("car", "Car radio under the header")}${row("wasted", "Wasted / Busted screens")}${row("loading", "Loading screen")}${row("buzz", "Phone buzz for new texts")}${row("sfx", "Sound effects")}</ul>` +
                `<p class="gx-small">Only changes the GTA skin, on this device.</p>`;
        } else if (view === "radio") {
            drawRadioApp(body);
        }
    }
    function goView(v, level) {
        view = v;
        renderView();
        if (v === "drive") {
            loadMaze().then((ok) => {
                if (!ok || view !== "drive" || !isBig()) { if (!ok) goView("maps"); return; }
                phoneGame = mountGame(phone.querySelector(".gx-drive"), true, level || nextLevel(), () => goView("maps"));
                phoneGame.focus();
            });
        }
        const focusable = phone.querySelector(view === "home" ? ".gx-app" : ".gx-big-back");
        if (focusable && v !== "drive") focusable.focus({ preventScroll: true });
    }
    function drive(level) {
        if (radarShown()) { closeBig(false); openRadar(level); }
        else { if (!isBig()) openBig("drive"); goView("drive", level); }
    }
    function openBig(start) {
        if (!phone) return;
        hideNote();
        drawPhone();
        phone.classList.add("is-big");
        phone.querySelector(".gx-big").hidden = false;
        phone.querySelector(".gx-phone-btn").setAttribute("aria-expanded", "true");
        // Always the home screen (the owner's, 19 Nov 2026); a red dot on Messages says there are new texts.
        goView(start || "home");
    }
    /* The small phone GROWS into the big one and shrinks back into its
       corner (the owner's, 18 Nov 2026): the big phone sits exactly where the
       small one was, scaled up from its bottom-right corner, and the small
       one is hidden meanwhile (css: .gx-phone.is-big). */
    let shrinking = 0;
    function closeBig(refocus) {
        if (!isBig() || phone.classList.contains("is-shrinking")) return;
        if (phoneGame) { phoneGame.destroy(); phoneGame = null; }
        const done = () => {
            if (!phone) return;
            view = "home";
            phone.classList.remove("is-big", "is-shrinking");
            phone.querySelector(".gx-big").hidden = true;
            phone.querySelector(".gx-phone-btn").setAttribute("aria-expanded", "false");
            if (refocus) phone.querySelector(".gx-phone-btn").focus({ preventScroll: true });
            drawPhone();
        };
        if (reduced()) { done(); return; }
        phone.classList.add("is-shrinking");
        clearTimeout(shrinking);
        shrinking = later(done, 200);
    }
    /* Not over a game's window (it was half tucked behind Fallin' Furni's), not in the Hallway, and not on
       a window too short for it: on a phone on its side it ran up under the header (scan 18 Nov evening). */
    /* And only where there is clear room beside the archive window (20 Nov 2026, the scan): from 760 to
       1000 wide it sat over Surprise me, What's New, the fansites or the Privacy link for its 12 seconds. */
    const noteBlocked = () => inHallway() || innerWidth < 1100 || innerHeight < 600 || !!root.dataset.gameFront ||
        !!document.querySelector("#ff-overlay.open, #pura-overlay.open, #rr-overlay.open, .modal-overlay.active, .modal-overlay.open, dialog[open]");
    function showNote() {
        if (!phone || !unread.length || isBig() || noteBlocked()) return;
        const m = unread[0];   // the welcome first, the way the day began
        const note = phone.querySelector(".gx-phone-note");
        note.innerHTML = `<b>${esc(m.from)}</b><span>${esc(m.text)}</span><em>${unread.length > 1 ? `+${unread.length - 1} more · ` : ""}${touch() ? "Tap" : "Click"} to read</em>`;
        note.hidden = false;
        clearTimeout(noteTimer);
        noteTimer = later(hideNote, 12000);
    }
    function hideNote() {
        clearTimeout(noteTimer);
        const note = phone && phone.querySelector(".gx-phone-note");
        if (note) note.hidden = true;
    }

    /* ---------------------------------------------------------------
       THE SKIN'S OWN SETTINGS (the phone's Settings and Weather apps),
       on this device. */
    const PREFS_KEY = "mazerats_gta_prefs";
    const PREF_DEFAULTS = { radar: true, car: true, wasted: true, loading: true, buzz: true, sfx: false, sky: "auto", rain: false, phoneDark: true };
    function prefs() {
        let p = null;
        try { p = JSON.parse(read(PREFS_KEY) || "null"); } catch (e) { p = null; }
        return Object.assign({}, PREF_DEFAULTS, p && typeof p === "object" ? p : {});
    }
    function setPref(k, v) { const p = prefs(); p[k] = v; write(PREFS_KEY, JSON.stringify(p)); }

    /* ---------------------------------------------------------------
       STREET CASH: what the radar maze pays (the owner's, 18 Nov 2026:
       "points can be large, but must be locked to the gta skin"). Kept
       here, on this device, per player (signed in, or the guest); shown
       nowhere but in this skin, where the cash top right is Maze Points
       and Street Cash together and the phone's Bank splits them.
       Signed in, it is kept on the account too (19 Nov 2026; `gta` in
       player-data.js), which merges every device's: each level's best pay
       and best time, and the cash as the sum of the best pays. */
    const STREET_KEY = "mazerats_gta_street";
    function streetAll() { try { const s = JSON.parse(read(STREET_KEY) || "null"); return s && typeof s === "object" ? s : {}; } catch (e) { return {}; } }
    function street() {
        const all = streetAll(), me = all[who() || "guest"];
        const s = Object.assign({ cash: 0, top: 0, best: {}, times: {}, day: "", busts: 0, log: [] }, me || {});
        if (s.day !== utcDay(Date.now())) { s.day = utcDay(Date.now()); s.busts = 0; }
        return s;
    }
    function saveStreet(s) {
        const all = streetAll(); all[who() || "guest"] = s; write(STREET_KEY, JSON.stringify(all));
        if (who() && window.Account && typeof Account.saveState === "function") {
            Account.saveState({ gta: { best: s.best, times: s.times, day: s.day, busts: s.busts, log: s.log } });
        }
    }
    /* The account's copy, merged into this device's. Anything this device
       has that the account lacks (won here before it was kept there, or a
       save that never arrived) is sent up. */
    function adoptStreet(g) {
        if (!who()) return;
        const s = street(), r = g && typeof g === "object" ? g : {};
        Object.entries(r.best || {}).forEach(([lv, v]) => { s.best[lv] = Math.max(Number(s.best[lv]) || 0, Number(v) || 0); });
        Object.entries(r.times || {}).forEach(([lv, t]) => { s.times[lv] = Math.min(Number(s.times[lv]) || Infinity, Number(t) || Infinity); });
        if (r.day === s.day) s.busts = Math.max(s.busts, Number(r.busts) || 0);
        const seen = new Set(), log = [];
        [...(Array.isArray(r.log) ? r.log : []), ...s.log].forEach((e) => { const k = e && e.day + "|" + e.what + "|" + e.amt; if (e && !seen.has(k)) { seen.add(k); log.push(e); } });
        s.log = log.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)).slice(0, 30);
        const levels = Object.keys(s.best).map(Number).filter((n) => n > 0);
        s.cash = levels.reduce((n, lv) => n + (Number(s.best[lv]) || 0), 0);
        s.top = Math.max(Number(s.top) || 0, levels.length ? Math.max(...levels) : 0, Number(r.top) || 0);
        const all = streetAll(); all[who()] = s; write(STREET_KEY, JSON.stringify(all));
        // This device knew something the account did not (a better pay or time on a level the
        // server keeps): send it up. Only then, so the save's own answer cannot start another.
        const rb = r.best || {}, rt = r.times || {};
        const ahead = Object.keys(s.best).some((lv) => lv >= 1 && lv <= 200 && (Number(s.best[lv]) || 0) > (Number(rb[lv]) || 0)) ||
            Object.keys(s.times).some((lv) => lv >= 1 && lv <= 200 && Number(s.times[lv]) > 0 && Number(s.times[lv]) < (Number(rt[lv]) || Infinity));
        if (ahead && window.Account && typeof Account.saveState === "function") Account.saveState({ gta: { best: s.best, times: s.times, day: s.day, busts: s.busts, log: s.log } });
    }
    const roundTo = (n, k) => Math.round(n / k) * k;
    const BANK = {
        street: () => street().cash,
        /* A level passed. The first time: the level's pay, a speed bonus
           under par and a clean-run bonus with no bust. Again: only what
           beats the best paid for that level before. */
        pass(level, secs, base, par, bustedHere) {
            const s = street(), speed = secs < par * 1.5 ? roundTo((par * 1.5 - secs) * 120, 50) : 0, clean = bustedHere ? 0 : 250 * level;
            const total = base + speed + clean, before = s.best[level] || 0;
            const paid = Math.max(0, total - before);
            s.best[level] = Math.max(before, total);
            s.times[level] = Math.min(s.times[level] || Infinity, Math.round(secs * 10) / 10);
            s.top = Math.max(s.top, level);
            s.cash += paid;
            if (paid) { s.log.unshift({ day: s.day, what: "Maze Maps · Level " + level, amt: paid }); s.log = s.log.slice(0, 30); }
            saveStreet(s);
            const note = before ? (paid ? "Beat your best: paid the difference" : "Replay: no new cash (best $" + before.toLocaleString("en-US") + ")")
                : [speed ? "speed " + money(speed) : "", clean ? "no bust " + money(clean) : ""].filter(Boolean).join(" · ");
            return { paid, note };
        },
        bust() { const s = street(); s.busts++; saveStreet(s); }
    };

    /* ---------------------------------------------------------------
       THE RADAR (bottom left): a GTA V street map. Click it and it grows
       into Maze Maps, the radar maze (js/gta-maze.js, fetched then). */
    function drawRadar(cv) {
        const dpr = Math.min(3, window.devicePixelRatio || 1), S = 104;
        cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + "px"; cv.style.height = S + "px";
        const g = cv.getContext("2d");
        g.scale(dpr, dpr);
        const N = 5, R = 15, WL = 5, P = R + WL;
        let seed = Number(utcDay(Date.now()).replace(/-/g, "")) % 2147483647 || 1;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const open = new Set(), seenCell = new Set(["0,0"]), stack = [[0, 0]];
        while (stack.length) {
            const [x, y] = stack[stack.length - 1];
            const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seenCell.has(a + "," + b));
            if (!next.length) { stack.pop(); continue; }
            const [a, b] = next[Math.floor(rnd() * next.length)];
            seenCell.add(a + "," + b); open.add([x, y, a, b].join()); stack.push([a, b]);
        }
        for (let i = 0; i < 4; i++) { const x = Math.floor(rnd() * (N - 1)), y = Math.floor(rnd() * N); open.add([x, y, x + 1, y].join()); }
        const off = (S - (WL + N * P)) / 2, c = (i) => off + WL + i * P + R / 2;
        g.fillStyle = "#35373a"; g.fillRect(0, 0, S, S);
        for (let k = 0; k < 40; k++) { g.fillStyle = rnd() < 0.5 ? "#3a3c3f" : "#303235"; g.fillRect(rnd() * S, rnd() * S, 6 + rnd() * 8, 6 + rnd() * 8); }
        const roads = (w, col) => { g.lineWidth = w; g.strokeStyle = col; g.lineCap = "square"; g.beginPath(); open.forEach((k) => { const [x, y, a, b] = k.split(",").map(Number); g.moveTo(c(x), c(y)); g.lineTo(c(a), c(b)); }); g.stroke(); };
        roads(R - 2, "#232427"); roads(R - 5, "#aeb0b3");
        // the flag, and you
        g.save(); g.translate(c(N - 1), c(N - 1)); g.scale(0.7, 0.7); g.lineJoin = g.lineCap = "round";
        g.lineWidth = 6; g.strokeStyle = "#000"; g.beginPath(); g.moveTo(-4, 8); g.lineTo(-4, -8); g.lineTo(7, -4.5); g.lineTo(-4, -1); g.stroke();
        g.fillStyle = "#fff"; g.beginPath(); g.moveTo(-4, -8); g.lineTo(7, -4.5); g.lineTo(-4, -1); g.fill();
        g.lineWidth = 2; g.strokeStyle = "#fff"; g.beginPath(); g.moveTo(-4, 8); g.lineTo(-4, -8); g.stroke(); g.restore();
        const mx = c(2), my = c(2);
        g.fillStyle = "#fff"; g.beginPath(); g.arc(mx, my, 5, 0, 7); g.fill();
        g.fillStyle = "#ff5fa2"; g.beginPath(); g.arc(mx, my, 3.5, 0, 7); g.fill();
    }

    let gps = null, game = null, gameHost = null, mazeReady = null, radarCompact = false;
    function loadMaze() {
        if (window.GtaMaze) return Promise.resolve(true);
        if (mazeReady) return mazeReady;
        mazeReady = new Promise((ok) => {
            const s = document.createElement("script");
            s.src = "/js/gta-maze.js?v=1";
            s.onload = () => ok(!!window.GtaMaze);
            s.onerror = () => { mazeReady = null; ok(false); };
            document.head.appendChild(s);
        });
        return mazeReady;
    }
    const nextLevel = () => street().top + 1;
    function mountGame(host, compact, level, onClose) {
        return window.GtaMaze.mount(host, {
            compact, level, bank: BANK,
            onPassed: () => { drawStanding(); sfx("cash"); },
            onRetry: () => hideBigWord(),
            /* The big BUSTED word only over the wide radar window: in the phone and the phone sheet the
               game card says Busted already, and the word landed on top of its Try again (scan 18 Nov). */
            onBusted: () => { sfx("siren"); if (!compact) bigWord("busted", "Maze Maps · Level " + (game ? game.level : level), matchMedia("(pointer: coarse)").matches ? "Tap Try again" : "Space to try again"); },
            onClose
        });
    }
    function openRadar(level) {
        if (!gps || gps.classList.contains("is-open")) return;
        closeBig(false);
        gps.classList.add("is-open");
        gps.setAttribute("aria-expanded", "true");
        gameHost = gps.querySelector(".gx-gps-game");
        // On a phone the page underneath stays still while you drive.
        radarCompact = narrow();
        document.documentElement.classList.toggle("gx-radar-open", radarCompact);
        loadMaze().then((ok) => {
            if (!ok || !gps || !gps.classList.contains("is-open")) { if (!ok) closeRadar(); return; }
            game = mountGame(gameHost, radarCompact, level || nextLevel(), () => closeRadar(true));
            later(() => game && game.resize(), reduced() ? 0 : 320);
            game.focus();
        });
    }
    /* A turn of the phone, or a window dragged across 900px: the open game is fitted to its new
       size, or remade (same level) when it changes between the phone sheet and the computer window. */
    function radarResize() {
        if (!game || !gps || !gps.classList.contains("is-open")) return;
        if (narrow() === radarCompact) { game.resize(); return; }
        const lv = game.level;
        closeRadar(false); openRadar(lv);
    }
    function closeRadar(refocus) {
        if (!gps || !gps.classList.contains("is-open")) return;
        if (game) { game.destroy(); game = null; }
        gps.classList.remove("is-open");
        gps.setAttribute("aria-expanded", "false");
        document.documentElement.classList.remove("gx-radar-open");
        hideBigWord();
        if (refocus) gps.focus({ preventScroll: true });
    }

    /* ---------------------------------------------------------------
       WASTED / BUSTED: the page goes grey and the word comes up in red
       (the owner's). Busted from the radar's cops; Wasted when an arcade
       game is lost (the mazerats:game-over event). Off in Settings. */
    let word = null, wordTimer = 0;
    function bigWord(text, line, hint) {
        if (!word || !prefs().wasted || inHallway()) return;
        word.innerHTML = `<div class="gx-word-bar"><b>${esc(text)}</b><p>${esc(line)}${hint ? ` · <span>${esc(hint)}</span>` : ""}</p></div>`;
        word.classList.remove("is-on"); void word.offsetWidth; word.classList.add("is-on");
        clearTimeout(wordTimer);
        wordTimer = later(hideBigWord, 2800);
    }
    function hideBigWord() { clearTimeout(wordTimer); if (word) word.classList.remove("is-on"); }

    /* ---------------------------------------------------------------
       SOUNDS (Settings: off by default): a till for cash, a siren for a
       bust, a ping for a text. Made here, nothing to fetch. */
    let actx = null;
    function sfx(kind) {
        if (!prefs().sfx) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            actx = actx || new AC();
            if (actx.state !== "running") actx.resume();
            const t = actx.currentTime, out = actx.createGain();
            out.gain.value = 0.12; out.connect(actx.destination);
            const tone = (f, at, dur, type, f2) => {
                const o = actx.createOscillator(), e = actx.createGain();
                o.type = type || "square"; o.frequency.setValueAtTime(f, at);
                if (f2) o.frequency.linearRampToValueAtTime(f2, at + dur);
                e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(1, at + 0.01); e.gain.exponentialRampToValueAtTime(0.001, at + dur);
                o.connect(e); e.connect(out); o.start(at); o.stop(at + dur + 0.02);
            };
            if (kind === "cash") { tone(1568, t, 0.09); tone(2093, t + 0.08, 0.25); }
            else if (kind === "siren") { for (let i = 0; i < 3; i++) { tone(700, t + i * 0.5, 0.25, "sawtooth", 950); tone(950, t + i * 0.5 + 0.25, 0.25, "sawtooth", 700); } }
            else if (kind === "ping") { tone(1318, t, 0.12, "sine"); tone(1760, t + 0.1, 0.2, "sine"); }
        } catch (e) { /* no sound, no matter */ }
    }

    /* ---------------------------------------------------------------
       THE COLLAGE: GTA's loading-screen art, dealt from the archive's own
       room pictures (the owner's, 19 Nov 2026: "fantastic now"). Each deal
       cuts the screen with tilted lines into 3 to 5 panels with 26px black
       gaps, and fills each with a different room, zoomed into its middle
       half (where every room picture has its room, never its black edge)
       and washed in a Vice colour. Used by the loading screen and the
       phone's screensaver.

       THE PICTURES: every maze's gallery, gathered once the archive has
       loaded and kept (POOL_KEY) for the next loading screen, which comes
       before the archive does. The very first time, The Little Maze's
       rooms, which are this site's own files. No names on them: a picture
       alone gives nothing away about a daily game's answer. */
    const POOL_KEY = "mazerats_gta_pool";
    const TLM = Array.from({ length: 100 }, (_, i) => i + 1).filter((n) => n !== 2 && n !== 26).map((n) => "/assets/rooms/the-little-maze/Room " + String(n).padStart(3, "0") + ".png");
    function pool() {
        try { const p = JSON.parse(read(POOL_KEY) || "null"); if (Array.isArray(p) && p.length >= 12) return p; } catch (e) { /* the fallback */ }
        return TLM;
    }
    function gatherPool() {
        if (typeof Api === "undefined" || !Api.getRooms) return;
        Api.getRooms().then((rooms) => {
            const urls = [];
            (Array.isArray(rooms) ? rooms : []).forEach((r) => (Array.isArray(r && r.gallery) ? r.gallery : []).forEach((g) => {
                const u = typeof g === "string" ? g : g && g.image;
                if (u && typeof u === "string" && !/^data:/.test(u)) urls.push(u);
            }));
            for (let i = urls.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [urls[i], urls[k]] = [urls[k], urls[i]]; }
            if (urls.length >= 12) write(POOL_KEY, JSON.stringify(urls.slice(0, 400)));
        }).catch(() => { /* next time */ });
    }
    const TINTS = ["linear-gradient(135deg,#ff2e88,#7a2cff)", "linear-gradient(135deg,#ffb14a,#ff2e88)", "linear-gradient(135deg,#2ee6ff,#7a2cff)",
        "linear-gradient(135deg,#ff5fa2,#ffb86b)", "linear-gradient(135deg,#7a2cff,#2ee6ff)", "linear-gradient(160deg,#ffd166,#ff5fa2)"];
    const TIPS = ["Busted by a cop on the radar? Your Street Cash stays banked. Only that level restarts.",
        "Five wanted stars = a five-day daily-game streak. Miss a day and the heat drops.",
        "The Bank app on your phone splits Maze Points from Street Cash.",
        "The car radio sits under the header, top left. Scroll over it to flick stations.",
        "Fancy a downpour? Vice Weather on your phone has rain.",
        "Lost a cop? The streets loop. Double back.",
        "Every room in these pictures is from the archive. Go and find it.",
        "The radar map grows every level. Drag it to look ahead.",
        "Cops patrol the streets. Get close and they give chase.",
        "Flip the bulb for Vice City after dark."];
    /* The tips for this screen: no car radio below 900px, where there is none, and no dragging the map to
       look on a touch screen, where a drag steers (scan 18 Nov evening). */
    const tipsHere = () => TIPS.filter((t) => !(innerWidth <= 900 && /car radio/.test(t)) && !(touch() && /Drag it to look/.test(t)));
    // Clips a convex polygon to the half-plane n·p >= d.
    function clipPoly(poly, n, d) {
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length], da = n[0] * a[0] + n[1] * a[1] - d, db = n[0] * b[0] + n[1] * b[1] - d;
            if (da >= 0) out.push(a);
            if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
        }
        return out;
    }
    const polyArea = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2);
    const bbox = (p) => { const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
    function layout(W, H) {
        const GAP = W < 600 ? 16 : 26, target = W < 600 ? 3 : 3 + Math.floor(Math.random() * 3), minW = Math.min(230, W * 0.3), minH = Math.min(200, H * 0.22);
        for (let tries = 0; tries < 300; tries++) {
            let polys = [[[0, 0], [W, 0], [W, H], [0, H]]], ok = true;
            while (polys.length < target) {
                polys.sort((a, b) => polyArea(b) - polyArea(a));
                const p = polys.shift(), [x0, y0, x1, y1] = bbox(p), w = x1 - x0, h = y1 - y0;
                const vertical = w > h * (0.8 + Math.random() * 0.6);
                const t = 0.36 + Math.random() * 0.28, tilt = (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * 0.16);
                const cx = x0 + w * (vertical ? t : 0.5), cy = y0 + h * (vertical ? 0.5 : t);
                const dir = vertical ? [Math.sin(tilt), Math.cos(tilt)] : [Math.cos(tilt), Math.sin(tilt)], n = [dir[1], -dir[0]], d = n[0] * cx + n[1] * cy;
                const A = clipPoly(p, n, d + GAP / 2), B = clipPoly(p, [-n[0], -n[1]], -d + GAP / 2);
                if (A.length < 3 || B.length < 3 || polyArea(A) < W * H * 0.09 || polyArea(B) < W * H * 0.09 ||
                    [A, B].some((q) => { const [a, b, c, e] = bbox(q); return c - a < minW || e - b < minH; })) { ok = false; break; }
                polys.push(A, B);
            }
            if (ok) return polys;
        }
        return [[[0, 0], [W, 0], [W, H], [0, H]]];
    }
    // Deals a collage into `box` (positioned, sized). Answers a promise that settles when every panel is in.
    /* THE WHOLE COLLAGE DRIFTS, slowly, one way, left or right, picked
       afresh for every deal (the owner's, 19 Nov 2026: "the movement should
       be the whole collage"). A transform on the collage itself, so the
       browser slides it as one picture, smoothly, and redraws nothing.
       Each panel has a soft light behind it in its own colour (a drop
       shadow that follows its cut), so the pictures seem to stand a little
       off the black. */
    // How much of a picture's crop is near-black (sampled small); false when it cannot be looked into.
    function mostlyBlack(img, sx, sy, sw, sh) {
        try {
            const c = document.createElement("canvas"); c.width = 24; c.height = 16;
            const g = c.getContext("2d"); g.drawImage(img, sx, sy, sw, sh, 0, 0, 24, 16);
            const d = g.getImageData(0, 0, 24, 16).data; let dark = 0;
            for (let p = 0; p < d.length; p += 4) if (d[p] + d[p + 1] + d[p + 2] < 60) dark++;
            return dark / (d.length / 4) > 0.45;
        } catch (e) { return false; }
    }
    // A canvas filling its panel, drawn at `res` pixels to the CSS pixel.
    function canvasFor(cls, w, h, res) {
        const c = document.createElement("canvas");
        if (cls) c.className = cls;
        c.width = Math.max(1, Math.round(w * res)); c.height = Math.max(1, Math.round(h * res));
        return c;
    }
    // One of TINTS ("linear-gradient(135deg,#a,#b)") as a canvas gradient over w x h, laid as CSS lays it.
    function tintFill(g, css, w, h) {
        const m = /(\d+)deg\s*,\s*(#[0-9a-f]+)\s*,\s*(#[0-9a-f]+)/i.exec(css);
        if (!m) return "#ff2e88";
        const a = (+m[1] * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
        const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
        const gr = g.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half);
        gr.addColorStop(0, m[2]); gr.addColorStop(1, m[3]);
        return gr;
    }
    const GLOWS = ["#ff2e88", "#ffb14a", "#2ee6ff", "#ff5fa2", "#7a2cff", "#ffd166"];
    /* opts.fade: the collage's fade in and out, in seconds (0.9 unless said).
       opts.stagger: below.
       opts.glow: each panel's light is a blurred copy of its cut behind it
       that slowly circles round and breathes (the screensaver's, the owner's,
       20 Nov 2026), in place of the still drop shadow. Moved by transforms and
       opacity only, so the blur is drawn once and never again. */
    function deal(box, driftSecs, opts) {
        opts = opts || {};
        const fade = opts.fade || 0.9;
        const W = box.clientWidth || innerWidth, H = box.clientHeight || innerHeight;
        const pics = pool().slice(), polys = layout(W, H), tint = Math.floor(Math.random() * TINTS.length);
        const way = Math.random() < 0.5 ? -1 : 1, secs = driftSecs || 14, travel = Math.round(Math.min(48, W * 0.035));
        // Back to the start of this deal's drift, at once; then off it goes once the pictures are in.
        box.style.transition = `opacity ${fade}s ease`;
        box.style.transform = `translate3d(${-way * travel / 2}px, 0, 0)`;
        /* opts.stagger: the panels pop in one at a time, in a random order,
           like the loading screen's as their pictures arrive (the
           screensaver's, on some collages; the owner's, 20 Nov 2026). */
        const t0 = performance.now(), order = polys.map((_, i) => i).sort(() => Math.random() - 0.5);
        return Promise.all(polys.map((p, i) => new Promise((done) => {
            const [x0, y0, x1, y1] = bbox(p), w = x1 - x0, h = y1 - y0;
            const k = (tint + i) % TINTS.length;
            const holder = make("div", "gx-panw");
            Object.assign(holder.style, { left: x0 + "px", top: y0 + "px", width: w + "px", height: h + "px" });
            holder.style.setProperty("--glow", GLOWS[k]);   // (a custom property is only set this way)
            /* DRAWN, NOT CLIPPED (20 Nov 2026, the owner's bug: "some images load uncropped initially, the
               crop then pops in later"). The picture was a CSS background on a div cut by clip-path, under a
               filter, and once the glows were moving the browser gave each panel a layer of its own: a
               clip-path there is a separate mask, drawn on its own schedule, and a frame or more could go up
               with the picture whole before its cut arrived. Now the cut, the crop and the tint are all drawn
               into one canvas, so the pixels are already cut before anything is on screen. */
            const local = p.map(([x, y]) => [x - x0, y - y0]);
            const trace = (g) => { g.beginPath(); local.forEach(([x, y], n) => (n ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
            const pan = canvasFor("gx-pan", w, h, Math.min(2, window.devicePixelRatio || 1));
            if (opts.glow) {
                holder.classList.add("is-glow");
                // Each its own phase and way round, so the lights are never in step.
                const glow = make("div", "gx-glow", `<div class="gx-glow-o"></div>`);
                // The light's shape, at half size: it is blurred anyway.
                const gc = canvasFor("", w, h, 0.5), gg = gc.getContext("2d");
                gg.scale(0.5, 0.5); trace(gg); gg.fillStyle = GLOWS[k]; gg.fill();
                glow.firstChild.appendChild(gc);
                const d1 = -(Math.random() * 10).toFixed(2), d2 = -(Math.random() * 5).toFixed(2);
                glow.style.animationDelay = `${d1}s, ${d2}s`;
                glow.firstChild.style.animationDelay = `${d1}s`;
                if (i % 2) glow.classList.add("is-ccw");
                holder.appendChild(glow);
            }
            holder.appendChild(pan);
            box.appendChild(holder);
            /* A picture whose crop would be mostly black (an empty corner of
               a room) is passed over for another, up to four tries. Only
               this site's own pictures can be looked into; another site's
               are taken as they come. */
            let tries = 0, url = "", crop = null;
            // The panel, in one go: black, the picture at its crop (pixels kept square), the tint over it, all inside the cut.
            const paint = (img) => {
                const g = pan.getContext("2d"), s = pan.width / w;
                g.setTransform(s, 0, 0, s, 0, 0);
                g.clearRect(0, 0, w, h);
                g.save();
                trace(g); g.clip();
                g.fillStyle = "#0a0a0a"; g.fillRect(0, 0, w, h);
                if (img && crop) { g.imageSmoothingEnabled = false; g.drawImage(img, -crop[2], -crop[3], crop[0], crop[1]); }
                g.globalCompositeOperation = "color";
                g.fillStyle = tintFill(g, TINTS[k], w, h); g.fillRect(0, 0, w, h);
                g.restore();
            };
            const next = () => {
                url = pics.splice(Math.floor(Math.random() * pics.length), 1)[0] || TLM[(i + tries * 5) % TLM.length];
                tries++;
                const img = new Image();
                let settled = false;
                const fin = (ok) => {
                    if (settled) return; settled = true;
                    if (ok) {
                        const iw = img.naturalWidth, ih = img.naturalHeight;
                        const scale = Math.max(w / (iw * 0.5), h / (ih * 0.5)) * (1 + Math.random() * 0.25), bw = iw * scale, bh = ih * scale;
                        const fx = 0.4 + Math.random() * 0.2, fy = 0.4 + Math.random() * 0.2, ox = (bw - w) * fx, oy = (bh - h) * fy;
                        if (tries < 4 && mostlyBlack(img, ox / scale, oy / scale, w / scale, h / scale)) { next(); return; }
                        crop = [bw, bh, ox, oy];
                    }
                    // Decoded first, so drawing it doesn't stall a frame; drawn whole, then shown (when staggered, on its turn).
                    const ready = ok && img.decode ? img.decode().catch(() => {}) : Promise.resolve();
                    ready.then(() => {
                        paint(ok ? img : null);
                        const wait = opts.stagger ? Math.max(0, t0 + order[i] * 420 + 300 - performance.now()) : 0;
                        setTimeout(() => { holder.classList.add("is-in"); done(); }, wait);
                    });
                };
                img.onload = () => fin(img.naturalWidth > 0);
                img.onerror = () => fin(false);
                setTimeout(() => fin(false), 6000);
                img.src = url;
            };
            next();
        }))).then(() => {
            if (reduced() || !box.isConnected) return;
            void box.offsetWidth;
            box.style.transition = `opacity ${fade}s ease, transform ${secs}s linear`;
            box.style.transform = `translate3d(${way * travel / 2}px, 0, 0)`;
        });
    }

    /* THE LOADING SCREEN: the site's own loader, which under the Vice
       palette is already GTA's black screen with the title and the tip
       strip (css/style.css), and stays 3s at least (js/home.js). The
       collage is dealt into it here, the moment the skin starts. */
    function loadingScreen() {
        const loader = document.getElementById("site-loader");
        if (!loader || loader.dataset.done || !prefs().loading) return;
        /* Only for the archive itself: a link straight to a game (/odd, /guess, /pura...) or the Hallway wants
           the game, not GTA's loading art, and the collage's pictures only slowed it (dailies scan 18 Nov
           evening). js/home.js gtaHold() lets those go without the 3s hold. */
        if (!/^\/(home\/?)?$/.test(location.pathname)) return;
        const box = make("div", "gx-collage");
        loader.insertBefore(box, loader.firstChild);
        nodes.push(box);
        deal(box);
        const inner = loader.querySelector(".site-loader-inner");
        const tips = tipsHere();
        if (inner) { const tip = make("span", "gx-load-tip", esc(tips[Math.floor(Math.random() * tips.length)])); inner.appendChild(tip); nodes.push(tip); }
    }

    /* THE SCREENSAVER (a phone app, the owner's): the collage over the
       whole page, a new deal every few seconds, each faded out to black and
       the next faded in. The mouse can move over it; a click, a tap or a
       key ends it. */
    let saver = null, saverTimer = 0;
    function screensaver() {
        if (saver) return;
        saver = add(make("div", "gx-saver", `<div class="gx-collage"></div><div class="gx-saver-title" aria-hidden="true"><b><span>Maze</span><span>Rats</span></b><i>Vice City</i></div><div class="gx-saver-hint" aria-hidden="true">${touch() ? "Tap" : "Click"} to exit screensaver.</div>`));
        saver.setAttribute("role", "dialog");
        saver.setAttribute("aria-label", "Screensaver: press any key to leave");
        saver.tabIndex = -1;
        const box = saver.querySelector(".gx-collage"), title = saver.querySelector(".gx-saver-title");
        /* Each collage stays 10s and fades over 1.3s (the owner's, 20 Nov 2026; was 7s and 0.9s).
           The drift is stretched to match, so it is still moving as it fades. */
        const HOLD = 10000, FADE = 1.3, DRIFT = 13;
        /* THE TITLE COMES AND GOES, on one line under the pictures, where the
           exit hint was (the owner's, 20 Nov 2026): first once the hint has
           faded (at once on a phone, whose hint is at the top), then up for
           25-35s and away for 45-60s, whatever the collages are doing. */
        const me = saver;
        const titleIn = () => { if (saver !== me) return; title.classList.add("is-in"); later(titleOut, 25000 + Math.random() * 10000); };
        const titleOut = () => { if (saver !== me) return; title.classList.remove("is-in"); later(titleIn, 45000 + Math.random() * 15000); };
        later(titleIn, matchMedia("(max-width: 600px)").matches ? 3000 : 25000);
        /* Some collages pop in a panel at a time, like the loading screen
           (the owner's, 20 Nov 2026): about one in three, never two running. */
        let staggered = false;
        const shown = () => { if (!saver) return; box.classList.remove("is-out"); saverTimer = later(next, HOLD); };
        const next = () => {
            if (!saver) return;
            box.classList.add("is-out");
            saverTimer = later(() => {
                if (!saver) return;
                box.innerHTML = "";
                staggered = !staggered && !reduced() && Math.random() < 0.35;
                // Staggered, the empty collage is up at once and its panels arrive in it.
                if (staggered) box.classList.remove("is-out");
                deal(box, DRIFT, { fade: FADE, glow: true, stagger: staggered }).then(shown);
            }, reduced() ? 0 : FADE * 1000);
        };
        box.classList.add("is-out");
        requestAnimationFrame(() => { if (!saver) return; saver.classList.add("is-on"); saver.focus({ preventScroll: true }); deal(box, DRIFT, { fade: FADE, glow: true }).then(shown); });
        // Back on the phone it was opened from, not lost to the page (scan 18 Nov evening).
        const end = (e) => { if (e && e.type === "keydown") e.preventDefault(); saverStop(true); };
        // A beat before it listens, so the tap that opened it does not close it.
        later(() => { if (!saver) return; ["keydown", "pointerdown"].forEach((t) => saver && listenOnce(t, end)); }, 400);
    }
    const saverOffs = [];
    function listenOnce(type, fn) { const h = (e) => fn(e); document.addEventListener(type, h, true); saverOffs.push(() => document.removeEventListener(type, h, true)); }
    function saverStop(refocus) {
        clearTimeout(saverTimer);
        saverOffs.splice(0).forEach((f) => f());
        if (!saver) return;
        const s = saver; saver = null;
        const btn = refocus && phone && phone.querySelector(".gx-phone-btn");
        if (btn) btn.focus({ preventScroll: true });
        s.classList.remove("is-on");
        setTimeout(() => s.remove(), reduced() ? 0 : 500);
    }

    /* ---------------------------------------------------------------
       WEATHER: the sky the phone's Weather app picks, and RAIN (the
       owner's: "high quality, a mixture of light rain, with bursts of
       heavy downpours"). Drawn on a canvas just over the sky and under the
       page: two depths of streaks, the near ones longer, faster and
       brighter, slanting in a wind that shifts, and small splashes where
       they land along the bottom. Mostly a light rain; every minute or two
       a downpour rolls in over a few seconds, the drops thicken, the sky
       darkens and now and then lightning flickers, then it eases off.
       Reduced motion: a still sheet of rain instead. */
    let rainCv = null, rainRaf = 0, rainDrops = [], rainSplash = [], rainT = 0, rainLast = 0, storm = { level: 0.22, target: 0.22, until: 0, nextBurst: 0, flash: 0 };
    function weather() {
        drawSky();
        if (prefs().rain && sky) rainStart(); else rainStop();
    }
    function rainStart() {
        if (rainCv) return;
        rainCv = add(make("canvas", "gx-rain"));
        rainCv.setAttribute("aria-hidden", "true");
        storm = { level: 0.3, target: 0.3, until: 0, nextBurst: performance.now() + 25000 + Math.random() * 30000, flash: 0 };
        rainSize();
        if (reduced()) { rainStill(); return; }
        rainLast = 0;
        rainRaf = requestAnimationFrame(rainFrame);
    }
    function rainStop() {
        cancelAnimationFrame(rainRaf); rainRaf = 0;
        if (rainCv) { rainCv.remove(); nodes = nodes.filter((n) => n !== rainCv); rainCv = null; }
        rainDrops = []; rainSplash = [];
    }
    function rainSize() {
        if (!rainCv) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        rainCv.width = Math.round(innerWidth * dpr); rainCv.height = Math.round(innerHeight * dpr);
        rainCv.style.width = innerWidth + "px"; rainCv.style.height = innerHeight + "px";
        if (reduced()) rainStill();
    }
    function rainStill() {
        const g = rainCv.getContext("2d"), dpr = rainCv.width / innerWidth;
        g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
        g.fillStyle = "rgba(10,12,30,.18)"; g.fillRect(0, 0, innerWidth, innerHeight);
        g.strokeStyle = "rgba(200,215,255,.28)"; g.lineWidth = 1;
        for (let i = 0; i < innerWidth * innerHeight / 2600; i++) { const x = Math.random() * innerWidth, y = Math.random() * innerHeight, l = 8 + Math.random() * 14; g.beginPath(); g.moveTo(x, y); g.lineTo(x - l * 0.18, y + l); g.stroke(); }
    }
    function spawnDrop(top) {
        const near = Math.random() < 0.3;
        return { x: Math.random() * (innerWidth + 200) - 100, y: top ? -Math.random() * innerHeight : Math.random() * innerHeight,
            v: near ? 1150 + Math.random() * 350 : 650 + Math.random() * 250, len: near ? 18 + Math.random() * 14 : 8 + Math.random() * 8,
            w: near ? 1.3 : 0.8, a: near ? 0.42 : 0.24, near };
    }
    function rainFrame(t) {
        rainRaf = 0;
        if (!rainCv) return;
        // Put away in the Hallway: no frames at all until it closes (hallwayWatch starts it again).
        if (inHallway()) { rainLast = 0; return; }
        if (document.hidden) { rainLast = 0; rainRaf = requestAnimationFrame(rainFrame); return; }
        const dt = Math.min(0.05, rainLast ? (t - rainLast) / 1000 : 0.016);
        rainLast = t; rainT += dt;
        // The weather: light, then now and then a downpour rolls in, holds, and eases off.
        if (t > storm.nextBurst && storm.target < 0.5) { storm.target = 0.85 + Math.random() * 0.15; storm.until = t + 9000 + Math.random() * 14000; }
        if (storm.target > 0.5 && t > storm.until) { storm.target = 0.24 + Math.random() * 0.12; storm.nextBurst = t + 55000 + Math.random() * 65000; }
        storm.level += (storm.target - storm.level) * (1 - Math.exp(-dt / (storm.target > storm.level ? 2.6 : 4.5)));
        if (storm.level > 0.7 && Math.random() < dt * 0.06) storm.flash = 1;
        storm.flash = Math.max(0, storm.flash - dt * 2.8);
        const W = innerWidth, H = innerHeight, want = Math.round((W * H / 900) * storm.level);
        while (rainDrops.length < want) rainDrops.push(spawnDrop(true));
        if (rainDrops.length > want * 1.15) rainDrops.length = Math.round(want * 1.15);
        const wind = 0.16 + Math.sin(rainT * 0.21) * 0.08 + storm.level * 0.1;
        const g = rainCv.getContext("2d"), dpr = rainCv.width / W;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        // The sky darkens under the heavy rain; lightning flickers in it.
        g.fillStyle = `rgba(8,10,28,${(0.05 + storm.level * 0.28).toFixed(3)})`; g.fillRect(0, 0, W, H);
        if (storm.flash > 0) { g.fillStyle = `rgba(220,225,255,${(storm.flash * storm.flash * 0.35).toFixed(3)})`; g.fillRect(0, 0, W, H); }
        g.lineCap = "round";
        for (const near of [false, true]) {
            // Heavier rain: thicker, longer, brighter streaks.
            const k = storm.level;
            g.lineWidth = near ? 1.2 + k * 0.6 : 0.8 + k * 0.3;
            g.strokeStyle = near ? `rgba(215,225,255,${(0.42 + k * 0.3).toFixed(3)})` : `rgba(190,205,255,${(0.24 + k * 0.18).toFixed(3)})`;
            const stretch = 0.8 + k * 0.7;
            g.beginPath();
            for (const d of rainDrops) {
                if (d.near !== near) continue;
                const step = d.v * dt; d.y += step; d.x -= step * wind;
                if (d.y > H) {
                    if (Math.random() < (near ? 0.55 : 0.25)) rainSplash.push({ x: d.x, y: H - Math.random() * 30 * (near ? 1 : 0.4), r: 0, a: near ? 0.5 : 0.3 });
                    Object.assign(d, spawnDrop(false), { y: -d.len - Math.random() * 80 });
                    continue;
                }
                g.moveTo(d.x, d.y); g.lineTo(d.x + d.len * stretch * wind, d.y - d.len * stretch);
            }
            g.stroke();
        }
        // Splashes: little rings flattening out where the drops land.
        g.lineWidth = 1;
        for (let i = rainSplash.length - 1; i >= 0; i--) {
            const s = rainSplash[i]; s.r += dt * 26; s.a -= dt * 1.6;
            if (s.a <= 0) { rainSplash.splice(i, 1); continue; }
            g.strokeStyle = `rgba(215,225,255,${s.a.toFixed(3)})`;
            g.beginPath(); g.ellipse(s.x, s.y, s.r, s.r * 0.3, 0, Math.PI, 0); g.stroke();
        }
        if (rainSplash.length > 400) rainSplash.splice(0, rainSplash.length - 400);
        rainRaf = requestAnimationFrame(rainFrame);
    }

    /* ---------------------------------------------------------------
       THE RADIO (js/gta-radio.js, fetched the first time it is wanted):
       the car radio under the header (top left), its station wheel, and the phone's
       Radio app. Off on every visit until a station is picked (the owner's,
       19 Nov 2026); the station last played is remembered, and the wheel
       opens on it. Quiet in the Hallway, and on again as it was after. */
    let radio = null, radioReady = null, carRadio = null;
    function loadRadio() {
        if (window.GtaRadio) return Promise.resolve(true);
        if (radioReady) return radioReady;
        radioReady = new Promise((ok) => {
            const s = document.createElement("script");
            s.src = "/js/gta-radio.js?v=1";
            s.onload = () => ok(!!window.GtaRadio);
            s.onerror = () => { radioReady = null; ok(false); };
            document.head.appendChild(s);
        });
        return radioReady;
    }
    /* The knob wears the station's badge (the owner's, 19 Nov 2026): too
       small at 28px to read, so the face is blurred to a wash of the logo's
       own colours, and only the chrome rim stays sharp. */
    let knobFor = null;
    function drawKnob() {
        const knob = carRadio && carRadio.querySelector(".gx-car-knob");
        if (!knob || !window.GtaRadio) return;
        const st = radio ? radio.current() : null, i = st ? GtaRadio.STATIONS.indexOf(st) : -1;
        if (knobFor === i) return;
        knobFor = i;
        knob.innerHTML = `<svg viewBox="-54 -54 108 108" width="100%" height="100%" aria-hidden="true"><defs>${GtaRadio.LOGO.defs}` +
            `<filter id="gk-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/><feColorMatrix type="saturate" values="1.45"/></filter>` +
            `<clipPath id="gk-face"><circle r="48.5"/></clipPath></defs>` +
            `<g clip-path="url(#gk-face)"><g filter="url(#gk-blur)" transform="scale(1.32)">${GtaRadio.LOGO.svg(i)}</g></g>` +
            `<path d="M0 -54A54 54 0 1 1 0 54A54 54 0 1 1 0 -54ZM0 -48A48 48 0 1 0 0 48A48 48 0 1 0 0 -48Z" fill="url(#lg-chrome)" fill-rule="evenodd"/>` +
            `<circle r="53.4" fill="none" stroke="#0c0614" stroke-width="1.2"/><circle r="48" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="1.5"/>` +
            `<path d="M-40 -14 A42 42 0 0 1 40 -14 C22 -24 -22 -24 -40 -14Z" fill="#fff" fill-opacity=".22"/></svg>`;
        knob.classList.add("has-logo");
    }
    function radioUi() {
        drawKnob();
        if (carRadio && radio) {
            const st = radio.current();
            // The level bars only with a station on: off, they were a row of dots beside "Radio off" (scan 18 Nov evening).
            carRadio.querySelector(".gx-car-lcd").innerHTML = `<span>${esc(st ? st.name : "Radio off")}</span>` +
                (st ? `<span class="gx-eq${radio.playing() ? " is-on" : ""}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>` : "");
            carRadio.setAttribute("aria-label", st ? `Car radio: ${st.name}. Open the station wheel` : "Car radio: off. Open the station wheel");
        }
        if (isBig() && view === "radio") renderView();
    }
    function radioBoot() {
        carRadio = add(make("button", "gx-car", `<span class="gx-car-knob" aria-hidden="true"></span><span class="gx-car-lcd"><span>Radio off</span></span>`));
        carRadio.type = "button";
        carRadio.setAttribute("aria-label", "Car radio: open the station wheel");
        carRadio.hidden = !prefs().car;
        listen(carRadio, "click", () => loadRadio().then((ok) => { if (ok && withRadio()) radio.wheel(carRadio); }));
        /* One station a scroll: a trackpad flick sends dozens of wheel events, which raced through every
           station, restarting the music each time. A change only after a quarter-second with none (scan 18 Nov evening). */
        let wheelAt = 0;
        listen(carRadio, "wheel", (e) => {
            e.preventDefault();
            const now = performance.now(), fresh = now - wheelAt > 250;
            wheelAt = now;
            if (!fresh || !e.deltaY) return;
            loadRadio().then((ok) => { if (ok && withRadio()) radio.step(e.deltaY > 0 ? 1 : -1, true); });
        }, { passive: false });
        /* Every visit starts with the radio off (the owner's, 19 Nov 2026); the
           wheel opens on the station last played. The radio's script loads once
           the page has settled, for the knob's Off badge. */
        const t = setTimeout(() => loadRadio().then((ok) => { if (ok && on) drawKnob(); }), 2500);
        offs.push(() => clearTimeout(t));
    }
    function withRadio() {
        if (!window.GtaRadio) return false;
        if (!radio) radio = GtaRadio.create({ onChange: radioUi, reduced });
        return true;
    }
    function radioStop() { if (radio) { radio.destroy(); radio = null; } carRadio = null; knobFor = null; }
    /* The list is drawn again whenever the radio changes (a station coming on, a song moving on), so the
       button that had the keyboard is found again and given it back: it was lost to the page after every
       tap (scan 18 Nov evening). Drawn at once once the radio's script is in, with no "Tuning in" between. */
    function drawRadioApp(body) {
        const had = document.activeElement && body.contains(document.activeElement) ? document.activeElement : null;
        const key = had ? (had.dataset.station != null ? `[data-station="${had.dataset.station}"]` : had.dataset.ctl ? `[data-ctl="${had.dataset.ctl}"]` : "") : "";
        const fill = () => {
            if (view !== "radio" || !isBig()) return;
            if (!withRadio()) { body.innerHTML = `<p class="gx-small">The radio couldn't load. Try again in a moment.</p>`; return; }
            const st = radio.current(), list = GtaRadio.STATIONS;
            body.innerHTML = `<div class="gx-big-top gx-radio-top" style="--st:${st ? st.bg : "#3a3046"}"><span>${st ? "Now playing" : "Radio"}</span><b>${esc(st ? st.name : "Off")}</b>` +
                `<span>${esc(st ? (radio.track() || st.genre) : "Pick a station")}</span>` +
                `<span class="gx-radio-ctl"><button type="button" data-radio="prev" data-ctl="prev" aria-label="Previous station">⏮</button>` +
                `<button type="button" data-radio="${st && radio.playing() ? "stop" : "play"}" data-ctl="play" aria-label="${st && radio.playing() ? "Stop" : "Play"}">${st && radio.playing() ? "⏸" : "▶"}</button>` +
                `<button type="button" data-radio="next" data-ctl="next" aria-label="Next station">⏭</button></span></div>` +
                `<ul class="gx-rows">${list.map((s, i) => `<li class="gx-row"><button type="button" class="gx-station${st && st.id === s.id ? " is-on" : ""}" data-station="${i}">` +
                    `<span>${esc(s.name)}</span><small>${esc(s.genre)}</small></button></li>`).join("")}` +
                `<li class="gx-row"><button type="button" class="gx-station${st ? "" : " is-on"}" data-station="-1"><span>Off</span></button></li></ul>`;
            const back = key && body.querySelector(key);
            if (back) back.focus({ preventScroll: true });
        };
        if (window.GtaRadio) { fill(); return; }
        body.innerHTML = `<p class="gx-small">Tuning in…</p>`;
        loadRadio().then((ok) => { if (!ok) { if (view === "radio" && isBig()) body.innerHTML = `<p class="gx-small">The radio couldn't load. Try again in a moment.</p>`; return; } fill(); });
    }
    /* From the phone, quietly: the station's name across the whole screen is for the car radio; here it
       blacked out the phone too for two seconds on every tap (scan 18 Nov evening). */
    function radioPress(t) {
        if (!withRadio()) return;
        const had = t.dataset.station != null ? `[data-station="${t.dataset.station}"]` : `[data-ctl="${t.dataset.ctl}"]`;
        if (t.dataset.station != null) { const i = Number(t.dataset.station); if (i < 0) radio.off(true); else radio.tune(i, true); }
        else if (t.dataset.radio === "prev") radio.step(-1, false, true);
        else if (t.dataset.radio === "next") radio.step(1, false, true);
        else if (t.dataset.radio === "stop") radio.off(true);
        else if (t.dataset.radio === "play") radio.resumeSaved(true, true);
        renderView();
        const again = phone && phone.querySelector(had);
        if (again) again.focus({ preventScroll: true });
    }

    /* ---------------------------------------------------------------
       MISSION PASSED */
    let banner = null;
    function mission(detail) {
        if (!banner || !detail || inHallway()) return;
        const passed = (Number(detail.solved) || 0) > 0;
        const g = GAMES.find((x) => x.key === detail.game);
        banner.innerHTML = `<div class="gx-mission-bar"><h2>${passed ? "Mission passed!" : "Mission failed"}</h2>` +
            `<p>${esc(g ? g.label : "Daily game")}${passed ? ` · <b>+${esc(money(Number(detail.points) || 0))}</b>` : " · better luck tomorrow"}</p></div>`;
        banner.classList.remove("is-on");
        void banner.offsetWidth;
        banner.classList.add("is-on");
        later(() => banner && banner.classList.remove("is-on"), 3800);
        drawStanding();
        drawPhone();
    }

    /* ---------------------------------------------------------------
       THE EDGE TAB (20 Nov 2026, the owner's pick from the scan's mock-ups).
       On phones and tablets (900px and under) the small phone and the radar
       floated over the archive all the time: card text, the timeline, the
       events list and the open Menu's rows were under them, and a tap there
       opened the phone. There they are tucked away, and a slim neon tab on
       the right edge, a little below the middle, stands in for them: a phone,
       a radar and the red count of unread texts. A tap dims the page and
       brings both back in their usual places, and the tab becomes ×; the ×,
       a tap on the dimmed page or Escape tucks them away again. The big
       phone and Maze Maps, once opened, show whether tucked or not. Wider
       than 900px nothing changes. Hidden where the pieces are (the Hallway,
       a game's window in front): css/skin-gta.css. */
    let edge = null, edgeDim = null;
    const edgeOpen = () => root.classList.contains("gx-edge-open");
    function setEdge(open, refocus) {
        if (!edge || open === edgeOpen()) return;
        root.classList.toggle("gx-edge-open", open);
        edge.setAttribute("aria-expanded", String(open));
        syncEdge();
        if (open) { hideNote(); return; }
        closeBig(false); closeRadar(false);
        if (refocus) edge.focus({ preventScroll: true });
    }
    function syncEdge() {
        if (!edge) return;
        const b = edge.querySelector(".gx-edge-badge");
        b.textContent = unread.length ? String(unread.length) : "";
        b.hidden = !unread.length || edgeOpen();
        edge.classList.toggle("no-radar", !radarShown());
        edge.setAttribute("aria-label", edgeOpen() ? "Put the phone and radar away"
            : `Show the phone${radarShown() ? " and radar" : ""}${unread.length ? `: ${unread.length} new text${unread.length > 1 ? "s" : ""}` : ""}`);
    }
    function edgeBoot() {
        edgeDim = add(make("div", "gx-edge-dim"));
        edgeDim.setAttribute("aria-hidden", "true");
        edge = make("button", "gx-edge",
            `<span class="gx-edge-ph" aria-hidden="true"></span><span class="gx-edge-rd" aria-hidden="true"></span>` +
            `<span class="gx-edge-x" aria-hidden="true">✕</span><span class="gx-edge-badge" aria-hidden="true" hidden></span>`);
        edge.type = "button";
        edge.setAttribute("aria-expanded", "false");
        // Just before the phone, so Tab goes from the tab to the phone and the radar it brought out.
        document.body.insertBefore(edge, phone && phone.parentNode === document.body ? phone : null);
        nodes.push(edge);
        listen(edge, "click", () => setEdge(!edgeOpen(), false));
        listen(edgeDim, "click", () => setEdge(false, true));
        offs.push(() => { root.classList.remove("gx-edge-open"); edge = edgeDim = null; });
        syncEdge();
    }

    /* ---------------------------------------------------------------
       START AND STOP */
    function start(opts) {
        if (on) return;
        on = true;
        if (root.classList.contains("ff-embed")) return;
        /* THE TOP BAR ONLY (20 Nov 2026, the owner's: Classic picked on the Style tab while Vice City is
           on keeps the Vice City top bar "with the neon tubes, but everything else can go to Classic"; no
           wanted stars). js/skin-wear.js sets html[data-skin-bar="gta"] for it; here only the tubes. */
        if (opts && opts.bar) {
            neonMode = skyMode();
            neonStart();
            listen(window, "resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(neonSize, 250); });
            observer = new MutationObserver(() => { neonMode = skyMode(); neonDraw(reduced() ? null : performance.now() / 1000); });
            observer.observe(root, { attributes: true, attributeFilter: ["data-dark"] });
            return;
        }
        sky = add(make("div", "gx-sky"));
        sky.setAttribute("aria-hidden", "true");
        drawSky();
        neonStart();
        listen(window, "resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { drawSky(); rainSize(); radarResize(); placeCash(); neonSize(); if (!narrow()) setEdge(false, false); }, 250); });
        /* The bulb is the newest word on the sky: a press undoes a sky fixed in
           the phone's Weather app, which otherwise left the bulb doing nothing
           to it (the owner's, 19 Nov 2026). */
        /* THE WINDOW AND THE SKY TOGETHER (20 Nov 2026, the scan: for about a fifth of a second after the
           bulb the archive window kept the night's colours under the sunset sky, and the reverse). The first
           press fetches the dark stylesheet (theme-dark.css), and the window waits for it while the sky did
           not: the sky now waits for it too. And the window's own colour fades (0.12s on its buttons and
           rows) are skipped for the switch (css: html.gx-theming), so both change in the same frame. */
        let wasDark = root.hasAttribute("data-dark"), themingT = 0, sheetWait = null;
        const theming = () => {
            root.classList.add("gx-theming");
            clearTimeout(themingT);
            themingT = setTimeout(() => root.classList.remove("gx-theming"), 400);
        };
        offs.push(() => { clearTimeout(themingT); root.classList.remove("gx-theming"); if (sheetWait) sheetWait(); });
        observer = new MutationObserver(() => {
            const dark = root.hasAttribute("data-dark");
            if (dark !== wasDark) {
                wasDark = dark;
                theming();
                if (prefs().sky !== "auto") { setPref("sky", "auto"); if (view === "weather") renderView(); }
                const link = document.getElementById("dark-css");
                if (dark && link && link.getAttribute("href") && !link.sheet) {
                    if (sheetWait) sheetWait();
                    const go = () => { if (sheetWait) sheetWait(); if (on) { theming(); drawSky(); } };
                    const t = setTimeout(go, 1500);
                    link.addEventListener("load", go); link.addEventListener("error", go);
                    sheetWait = () => { clearTimeout(t); link.removeEventListener("load", go); link.removeEventListener("error", go); sheetWait = null; };
                    return;
                }
            }
            drawSky();
        });
        observer.observe(root, { attributes: true, attributeFilter: ["data-dark"] });

        if (!document.body || document.body.getAttribute("data-page") !== "home") return;

        loadingScreen();
        gatherPool();

        const brand = document.querySelector(".site-header .brand-group");
        if (brand) {
            wanted = add(make("div", "gx-wanted"), brand);
            wanted.setAttribute("role", "img");
        }
        cash = add(make("button", "gx-cash", `<span class="gx-cash-n">$0</span><span class="gx-cash-lab">Maze points</span>`));
        cash.type = "button";
        cash.setAttribute("title", "Maze Points from the daily games, plus Street Cash from Maze Maps. Click for the Bank.");
        listen(cash, "click", () => { if (isBig() && view === "bank") closeBig(true); else openBig("bank"); });
        placeCash();
        // The title's place can move a little once its font arrives.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (on) placeCash(); });

        phone = add(make("div", "gx-phone",
            `<div class="gx-big" role="dialog" aria-label="Phone" hidden>` +
                `<div class="gx-big-bar"><span class="gx-big-time"></span><span class="gx-big-sig" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>` +
                `<div class="gx-big-head"><button type="button" class="gx-big-back" aria-label="Back to the home screen"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13 4 7 10l6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span class="gx-big-title"></span></div>` +
                `<div class="gx-big-body"></div>` +
                `<button type="button" class="gx-big-home" aria-label="Home screen"></button>` +
            `</div>` +
            `<button type="button" class="gx-phone-note" hidden></button>` +
            `<button type="button" class="gx-phone-btn" aria-label="Phone" aria-expanded="false">` +
                `<span class="gx-phone-screen"><span class="gx-phone-clock" aria-hidden="true"><b></b><small></small></span><span class="gx-phone-mr" aria-hidden="true">MAZE<br>RATS</span></span><span class="gx-phone-badge" hidden></span></button>`));
        // The lock screen: the time and date over the MR (the owner's, 19 Nov 2026).
        const tickLock = () => {
            if (!phone) return;
            const c = phone.querySelector(".gx-phone-clock");
            c.querySelector("b").textContent = clock();
            c.querySelector("small").textContent = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
        };
        tickLock();
        const lockTimer = setInterval(tickLock, 15000);
        offs.push(() => clearInterval(lockTimer));
        listen(phone, "click", (e) => {
            const t = e.target.closest("button");
            if (!t || !phone.contains(t)) return;
            const c = t.classList;
            if (c.contains("gx-phone-btn")) { if (isBig()) closeBig(false); else openBig(); }
            else if (c.contains("gx-phone-note")) openBig("messages");
            else if (c.contains("gx-big-close") || c.contains("gx-big-shut")) closeBig(true);
            // The home button: home, or away when already there.
            else if (c.contains("gx-big-home")) { if (view === "home") closeBig(true); else goView("home"); }
            else if (c.contains("gx-big-back")) goView("home");
            else if (c.contains("gx-app")) {
                const id = t.dataset.app;
                if (id === "screensaver") { closeBig(false); screensaver(); }
                else goView(id);
            }
            else if (c.contains("gx-text-go")) { const m = inbox[Number(t.dataset.i)]; if (m && m.act !== "Drive") closeBig(false); if (m && m.go) m.go(); }
            else if (t.dataset.level) drive(Number(t.dataset.level));
            else if (t.dataset.pref) {
                const k = t.dataset.pref, v = !prefs()[k];
                setPref(k, v);
                if (k === "radar" && gps) { gps.hidden = !v; if (!v) closeRadar(false); syncEdge(); }
                if (k === "car" && carRadio) { carRadio.hidden = !v; if (!v && radio) radio.closeWheel(); }
                if (k === "sfx" && v) sfx("ping");
                renderView();
                const again = phone.querySelector(`[data-pref="${k}"]`); if (again) again.focus({ preventScroll: true });
            }
            else if (t.dataset.sky) { const k = t.dataset.sky; setPref("sky", prefs().sky === k ? "auto" : k); drawSky(); renderView(); }
            else if (t.dataset.dark) { setPref("phoneDark", !prefs().phoneDark); renderView(); const again = phone.querySelector(".gx-dk"); if (again) again.focus({ preventScroll: true }); }
            else if (t.dataset.rain) { setPref("rain", !prefs().rain); weather(); renderView(); }
            else if (t.dataset.station != null || t.dataset.radio) radioPress(t);
        });
        listen(document, "keydown", (e) => {
            /* Tab goes round the big phone while it's open, as in any dialog, not out onto the page behind (scan 18 Nov evening). */
            if (e.key === "Tab" && isBig() && !phone.classList.contains("is-shrinking")) {
                const big = phone.querySelector(".gx-big");
                const all = [...big.querySelectorAll("button, [tabindex]:not([tabindex='-1'])")].filter((b) => !b.disabled && b.offsetParent !== null);
                if (!all.length) return;
                const at = all.indexOf(document.activeElement);
                if (at < 0 || (e.shiftKey && at === 0) || (!e.shiftKey && at === all.length - 1)) {
                    e.preventDefault();
                    all[e.shiftKey ? all.length - 1 : 0].focus({ preventScroll: true });
                }
                return;
            }
            if (e.key !== "Escape") return;
            if (isBig()) { e.stopPropagation(); closeBig(true); }
            else if (gps && gps.classList.contains("is-open")) { e.stopPropagation(); closeRadar(true); }
            else if (edgeOpen()) { e.stopPropagation(); setEdge(false, true); }
        }, true);
        // A click anywhere else puts the big phone away.
        listen(document, "pointerdown", (e) => { if (isBig() && !phone.contains(e.target) && !(cash && cash.contains(e.target))) closeBig(false); });

        // The radar (bottom left): click it, or Enter on it, for Maze Maps.
        gps = add(make("div", "gx-gps", `<canvas class="gx-gps-map" aria-hidden="true"></canvas><div class="gx-gps-game"></div><span class="gx-gps-tip" aria-hidden="true"><b>Maze Maps</b>Click the radar to play. Hold the arrow keys to drive.</span>`));
        gps.setAttribute("role", "button");
        gps.setAttribute("tabindex", "0");
        gps.setAttribute("aria-label", "Maze Maps: play the radar maze");
        gps.setAttribute("aria-expanded", "false");
        gps.hidden = !prefs().radar;
        drawRadar(gps.querySelector("canvas"));
        /* Not the click that just closed it (the game's ✕): that click carries on up to here once the
           game has gone, and it reopened the radar at once (the owner's, 19 Nov 2026). Its button is
           out of the page by then, so a click from outside the radar as it is now is not an open. */
        listen(document, "click", (e) => { if (e.target === document.body && root.classList.contains("gx-radar-open")) { e.preventDefault(); closeRadar(true); } });
        listen(gps, "click", (e) => { if (!gps.classList.contains("is-open") && gps.contains(e.target)) { e.preventDefault(); openRadar(); } });
        listen(gps, "keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === gps && !gps.classList.contains("is-open")) { e.preventDefault(); openRadar(); } });
        edgeBoot();

        /* ESCAPE closes the front one of the skin's windows, through the
           site's one Escape listener (js/site.js EscapeLayers), which
           otherwise takes the press for its own windows first. Registered
           once a page: it reads whatever is open now. */
        if (window.EscapeLayers && !window.__gtaEscape) {
            window.__gtaEscape = true;
            EscapeLayers.register({
                elements: () => [saver, radio && radio.wheelEl, isBig() ? phone.querySelector(".gx-big") : null, gps && gps.classList.contains("is-open") ? gps : null, edgeOpen() ? edgeDim : null].filter(Boolean),
                close: (el) => {
                    if (el === saver) saverStop(true);
                    else if (radio && el === radio.wheelEl) radio.closeWheel();
                    else if (gps && el === gps) closeRadar(true);
                    else if (edgeDim && el === edgeDim) setEdge(false, true);
                    else closeBig(true);
                }
            });
        }

        word = add(make("div", "gx-word"));
        word.setAttribute("aria-live", "assertive");
        listen(document, "mazerats:game-over", (e) => {
            const d = e.detail || {};
            if (!d.game) return;
            bigWord("wasted", d.game + (d.line ? " · " + d.line : d.score != null ? " · score " + Number(d.score).toLocaleString("en-US") : ""), "");
        });

        radioBoot();
        weather();

        banner = add(make("div", "gx-mission"));
        banner.setAttribute("aria-live", "polite");
        listen(document, "mazerats:daily-done", (e) => mission(e.detail));

        drawStanding();
        drawPhone();
        // Records and the sign-in change under us: another tab, a game, the account arriving.
        listen(window, "storage", (e) => { if (!e.key || /stats|gta_texts/.test(e.key)) { drawStanding(); drawPhone(); } });
        listen(document, "visibilitychange", () => { if (document.visibilityState === "visible") { pullAccount(false); drawStanding(); drawPhone(); } });
        // The account answering (or changing): its own records, at once, then its saved figures.
        if (window.Account && typeof Account.onChange === "function") offs.push(Account.onChange(() => { if (on) { acct = null; pullAccount(true); drawStanding(); drawPhone(); } }));
        // Every save the account takes answers with the merged figures (a game finished, the radar paid).
        if (!storedHooked && window.Account && typeof Account.onStored === "function") {
            storedHooked = true;
            Account.onStored((d) => { if (on && who()) takeAccount(who(), d); });
        }
        pullAccount(true);
        timers.push(setInterval(() => { drawStanding(); drawPhone(); drawSky(); }, 20000));
        // The newest text pops up in a moment after the page settles.
        // Not on a phone, where it would sit over the archive: there it only buzzes.
        later(showNote, 4000);
        hallwayWatch();
    }

    /* THE HALLWAY (the owner's, 18 Nov 2026: "remove all gta skin features, have them do the slide out
       transitions with the rest of the homepage"). css/skin-gta.css slides the pieces away and hides them
       while html.hallway-open is on; here, whatever was open is closed on the way in (the big phone, Maze
       Maps, the wheel, the screensaver, a text or a banner), the pieces are made inert so nothing behind the
       walk takes a key, and the rain stops drawing. The radio holds itself (js/gta-radio.js). On the way
       out the rain starts again and the pieces are live once more; what had been closed stays closed. */
    let hallWatch = null, wasInHall = false;
    function hallwayWatch() {
        const apply = () => {
            const now = inHallway();
            if (now === wasInHall) return;
            wasInHall = now;
            [carRadio, cash, phone, gps, word, banner, edge].forEach((n) => { if (n) n.inert = now; });
            if (now) {
                setEdge(false, false);
                hideNote(); hideBigWord();
                closeBig(false); closeRadar(false); saverStop();
                if (radio) radio.closeWheel();
                if (banner) banner.classList.remove("is-on");
            } else if (rainCv && !rainRaf && !reduced()) {
                rainLast = 0;
                rainRaf = requestAnimationFrame(rainFrame);
            }
        };
        hallWatch = new MutationObserver(apply);
        hallWatch.observe(root, { attributes: true, attributeFilter: ["class"] });
        apply();
    }

    function stop() {
        on = false;
        offs.forEach((f) => f()); offs = [];
        timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = [];
        clearTimeout(resizeTimer);
        if (observer) observer.disconnect(); observer = null;
        if (hallWatch) hallWatch.disconnect(); hallWatch = null; wasInHall = false;
        nodes.forEach((n) => n.remove()); nodes = [];
        if (game) { game.destroy(); game = null; }
        if (phoneGame) { phoneGame.destroy(); phoneGame = null; }
        radioStop(); rainStop(); saverStop();
        sky = wanted = cash = phone = banner = gps = word = null; view = "home";
        painted = ""; shownCash = -1; inbox = []; unread = []; clearTimeout(noteTimer);
    }

    // For testing on the dev server only.
    if (location.hostname === "localhost") window.__gta = { get game() { return game; }, get phoneGame() { return phoneGame; }, get radio() { return radio; }, openRadar, closeRadar, openBig, goView, screensaver, saverStop, street, prefs, bigWord, deal, layout, get storm() { return storm; } };
    (window.SiteSkins = window.SiteSkins || {})[NAME] = { start, stop };
})();
