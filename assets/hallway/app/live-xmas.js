/* Christmas in the Hallway: it follows the site's skin, the Warren's preview included, as it is when the page opens. The tree, gifts, garlands and snowy views are in their own sets of pictures;
   here we only say which sets to ask for, and let snow fall in the windows. */
(function () {
    "use strict";
    const worn = () => { try { if (/[?&]xmas=1/.test(location.search)) return true; const p = window.parent !== window ? window.parent : window; return !!(p.SkinWear && p.SkinWear.current && /^xmas$|christmas/i.test(String(p.SkinWear.current() || ""))); } catch (e) { return false; } };
    let tries = 0; const again = setInterval(() => { if (!window.HALLWAY_PLAY) { clearInterval(again); return; } if (worn() && !window.hallwayXmas) { window.hallwayXmas = true; if (window.HallwayLive) HallwayLive.wake(); } if (++tries > 8) clearInterval(again); }, 800);
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const reducedX = matchMedia("(prefers-reduced-motion: reduce)");      // the lights and snow stay still for those who ask (10 Nov scan b, live 12)
    /* Snow falling outside the windows (9 Nov 2026, his: "snowfall is appearing as if it's inside the window frame, it should be behind it to
       appear outside, and doesn't always fall properly"). It falls in the view's own upright picture, as render/hw3.js lays the view out,
       and shows only where the view does: never on the frame, its bars or rails (the frame's own pixels, render/hall-window.js), never over
       what stands in front (cut as the rats are) or over the avatar (drawn under it). Each flake has its own steady speed, a slow sway and a
       size: the far ones small, slow and dim, the near ones bigger and quicker. */
    const HW = window.HallWindow;
    function windows() { const l = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi && LIVE.editorApi().level); if (!l || !l.wallItems) return []; const v = LIVE.view(), out = []; for (const q of l.wallItems) { if (q.k !== "i_window") continue; const t = q.axis === "y" ? [q.line, Math.floor(q.at)] : [Math.floor(q.at), q.line], z = LIVE.nodeZ(l, t[0], t[1]) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, q.at, z) : LIVE.mapPoint(q.at, q.line, z); if (a[0] > v.x0 - 200 && a[0] < v.x1 + 200 && a[1] > v.y0 - 260 && a[1] < v.y1 + 200) out.push({ q, z, l }); } return out; }
    /* a window's view on screen, and which of its pixels show past the frame: worked out once per window and place */
    const views = new Map();
    function viewOf(q, z) {
        const wide = q.w || 52, b0 = q.b || 0, top0 = q.top || 78, flip = q.axis === "x", key = [q.axis, q.line, q.at, wide, b0, top0, z].join("|"); if (views.has(key)) return views.get(key);
        const start = q.at - wide / 32, s0 = flip ? LIVE.mapPoint(start, q.line, z) : LIVE.mapPoint(q.line, start, z), a0 = Math.round(s0[0]), a1 = Math.round(s0[1]) - 6, H2 = top0 - b0, Y0 = a1 + wide / 2 - top0;
        const frame = new Set(); if (HW) { const fr = HW.art(wide, b0, top0); for (let j = 0; j < fr.h; j++) for (let i = 0; i < fr.w; i++) { if (fr.rgba[(j * fr.w + i) * 4 + 3] < 128) continue; const sx = a0 - fr.ox + i; frame.add((flip ? 2 * a0 - sx - 1 : sx) + "," + (a1 - fr.oy + j)); } }
        /* the view's pixel (u across, v down) on screen, or null where the frame covers it */
        const at = (u, v) => { if (u < 0 || v < 0 || u >= wide || v >= H2) return null; const sxm = a0 - wide + u, X = flip ? 2 * a0 - sxm - 1 : sxm, Y = Y0 - Math.floor(u / 2) + v; return frame.has(X + "," + Y) ? null : [X, Y]; };
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const u of [0, wide - 1]) for (const v of [0, H2 - 1]) { const sxm = a0 - wide + u, X = flip ? 2 * a0 - sxm - 1 : sxm, Y = Y0 - Math.floor(u / 2) + v; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
        /* the flakes: about one for every 70 pixels of view, each with its own place, speed, sway and size */
        const n = Math.max(6, Math.round(wide * H2 / 70)), flakes = []; for (let i = 0; i < n; i++) { const r = k => { const v = Math.sin((i + 1) * 12.9898 + k * 78.233 + wide) * 43758.5453; return v - Math.floor(v); }, near = r(1) > .72; flakes.push({ u: r(2) * wide, ph: r(3) * (H2 + 8), sp: near ? 11 + r(4) * 5 : 5 + r(4) * 4, sw: .6 + r(5) * 1.2, sf: .4 + r(6) * .5, sp2: r(7) * 6.28, big: near, a: near ? 1 : .55 + r(8) * .3 }); }
        const o = { at, wide, H2, flakes, box: [x0 - 2, y0 - 2, x1 + 3, y1 + 3], who: flip ? { x: Math.floor(q.at - wide / 32), y: q.line } : { x: q.line, y: Math.floor(q.at - wide / 32) } };
        if (views.size > 40) views.clear(); views.set(key, o); return o;
    }
    /* read back each frame (cut and tinted), so kept where reading is cheap (9 Nov scan, page finding 4) */
    const snowCv = document.createElement("canvas"), sg = snowCv.getContext("2d", { willReadFrequently: true });
    LIVE.add({ active: () => !!window.hallwayXmas && !reducedX.matches && windows().length > 0,
        under(c, ox, oy, now) { const t = now / 1000;
            for (const { q, z, l } of windows()) {
                const V = viewOf(q, z), [bx0, by0, bx1, by1] = V.box, w = bx1 - bx0, h = by1 - by0; if (w <= 0 || h <= 0) continue;
                if (snowCv.width < w || snowCv.height < h) { snowCv.width = Math.max(snowCv.width, w); snowCv.height = Math.max(snowCv.height, h); }
                sg.clearRect(0, 0, snowCv.width, snowCv.height);
                for (const f of V.flakes) {
                    const v = ((f.ph + t * f.sp) % (V.H2 + 8)) - 4, u = f.u + Math.sin(t * f.sf + f.sp2) * f.sw;
                    const put = (du, dv, al) => { const p = V.at(Math.round(u) + du, Math.round(v) + dv); if (!p) return; sg.fillStyle = `rgba(255,255,255,${al})`; sg.fillRect(p[0] - bx0, p[1] - by0, 1, 1); };
                    put(0, 0, f.a); if (f.big) { put(1, 0, .55); put(0, 1, .55); put(1, 1, .3); }
                }
                /* what stands in front of the window hides the snow behind it, and the time of day tints it */
                LIVE.as({ x: V.who.x, y: V.who.y, z, l, dir: 2, frame: 0, st: null }, () => { LIVE.cutInFront(sg, bx0, by0, true); LIVE.tint(sg, w, h); });
                c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; c.drawImage(snowCv, 0, 0, w, h, bx0, by0, w, h); c.restore();
            }
        } });

    /* ---------- festoon lights: strings along the walls ---------- */
    const COL = { amber: [{ lit: [255, 176, 64], dark: [150, 84, 18], hi: [255, 236, 190] }], warm: [{ lit: [255, 226, 160], dark: [170, 130, 70], hi: [255, 250, 230] }], cool: [{ lit: [214, 236, 255], dark: [110, 140, 170], hi: [255, 255, 255] }],
        multi: [{ lit: [255, 74, 90], dark: [150, 22, 40], hi: [255, 196, 200] }, { lit: [255, 206, 70], dark: [168, 116, 20], hi: [255, 245, 200] }, { lit: [82, 214, 106], dark: [24, 112, 48], hi: [208, 250, 214] }, { lit: [90, 184, 255], dark: [26, 90, 170], hi: [214, 238, 255] }, { lit: [255, 140, 56], dark: [160, 66, 14], hi: [255, 222, 190] }],
        redgreen: [{ lit: [255, 74, 90], dark: [150, 22, 40], hi: [255, 196, 200] }, { lit: [82, 214, 106], dark: [24, 112, 48], hi: [208, 250, 214] }], blue: [{ lit: [90, 184, 255], dark: [26, 90, 170], hi: [214, 238, 255] }, { lit: [214, 236, 255], dark: [110, 140, 170], hi: [255, 255, 255] }] };
    const mix = (p, q, t) => [Math.round(p[0] + (q[0] - p[0]) * t), Math.round(p[1] + (q[1] - p[1]) * t), Math.round(p[2] + (q[2] - p[2]) * t)];
    const hash = n => { const v = Math.sin(n * 91.7) * 43758.5; return v - Math.floor(v); };
    /* the homepage's breathing: each bulb on its own slow cycle, and a swell along the string, never off */
    const level = (f, i, t) => { if (!f.twinkle) return 1; const ph = hash(i + f.a * 7 + f.line), per = 3 + hash(i * 3 + f.a) * 2.5, own = Math.pow(.5 + .5 * Math.sin((t / per + ph) * Math.PI * 2), .7), swell = .5 + .5 * Math.sin((t / 9 - i / 12) * Math.PI * 2); return .25 + .75 * (.6 * own + .4 * swell); };
    /* the string's shape along the wall: a hook every three tiles or so, an even catenary between */
    function shape(f) {
        const len = (f.b - f.a) * 16, spans = Math.max(1, Math.round(len / 48)), w = len / spans, sag = Math.min(9, 3 + w / 9), pts = [];
        for (let u = 0; u <= len; u += .5) { const s = u % w, t = s / w; pts.push([u, sag * (Math.cosh((t - .5) * 2) - Math.cosh(1)) / (Math.cosh(1) - 1)]); }
        const bulbs = []; for (let n = 0; n < spans; n++) { const k = Math.max(2, Math.round(w / 11)); for (let i = 1; i < k; i++) { const u = n * w + w * i / k, t = i / k; bulbs.push([u, sag * (Math.cosh((t - .5) * 2) - Math.cosh(1)) / (Math.cosh(1) - 1)]); } }
        return { len, pts, bulbs, hooks: Array.from({ length: spans + 1 }, (_, n) => n * w) };
    }
    const runsOn = l => (l && l.festoons) || [];
    /* Where a string hangs (9 Nov 2026, his: festoons should behave as the garlands now do): its hooks just under the wall's top, or the
       underside of the floor above, raised or lowered, following it as it steps (the garlands' own joins, render/garland.js), and on the tiles
       it was laid on (on a y wall it used to sit a tile further along). HANG: how far under that edge the hooks go. */
    const HANG = 5, topsMemo = new WeakMap();
    function edgeOf(l, f) {
        const m = topsMemo.get(f), now = performance.now(); if (m && m.l === l && m.a === f.a && m.b === f.b && now - m.at < 500) return m.E;
        const tops = []; for (let t = f.a; t < f.b; t++) tops.push(LIVE.wallTop ? LIVE.wallTop(l, f.axis, f.line, t) : null);
        let E = window.HallwayGarlandArt ? HallwayGarlandArt.joins(tops) : tops.concat([tops[tops.length - 1]]);
        /* where there's no wall (a doorway), the edge either side carries on across it */
        const known = E.map((v, i) => v === null ? null : i).filter(i => i !== null); if (!known.length) E = E.map(() => l.k * 163 + 150);
        else E = E.map((v, i) => { if (v !== null) return v; let a = null, b = null; for (const k of known) { if (k < i) a = k; else if (b === null) b = k; } return a === null ? E[b] : b === null ? E[a] : E[a] + (E[b] - E[a]) * (i - a) / (b - a); });
        topsMemo.set(f, { l, a: f.a, b: f.b, at: now, E }); return E;
    }
    function onScreen(l, f, u, down) { const E = edgeOf(l, f), e = Math.max(0, Math.min(E.length - 1, u / 16)), i = Math.min(E.length - 2, Math.floor(e)), k = e - i, top = E.length > 1 ? E[i] + (E[i + 1] - E[i]) * k : E[0], along = f.a + u / 16, z = top - HANG - down; return f.axis === "x" ? LIVE.mapPoint(along, f.line, z) : LIVE.mapPoint(f.line, along, z); }
    function nightness() { const m = LIVE.mood(); if (!m) return .6; const n = q => q === "night" ? 1 : q === "dusk" || q === "dawn" || q === "failing" ? .7 : .2; return n(m.a) * (1 - m.f) + n(m.b) * m.f; }
    function drawString(c, l, f, t, night, ghost, glow) {
        glow = glow || c; const s = shape(f), pal = COL[f.colour] || COL.amber, px = (X, Y, cc, al) => { c.globalAlpha = (al === undefined ? 1 : al) * (ghost ? .7 : 1); c.fillStyle = `rgb(${cc[0]},${cc[1]},${cc[2]})`; c.fillRect(Math.round(X), Math.round(Y), 1, 1); };
        /* the one being laid is a ghost: px() sets its own alpha for every pixel, so the .7 is in there (9 Nov scan, page finding 5) */
        /* the flex, standing a little off the wall: its shadow first, a few pixels down */
        for (const [u, d] of s.pts) { const p = onScreen(l, f, u, -d); px(p[0], p[1] + 3, [0, 0, 0], .18 * (1 - night * .6)); }
        for (const [u, d] of s.pts) { const p = onScreen(l, f, u, -d); px(p[0], p[1], [24, 20, 16]); if (Math.round(u * 2) % 8 === 0) px(p[0], p[1] - 1, [70, 60, 50]); }
        /* the hooks it hangs from */
        for (const u of s.hooks) { const p = onScreen(l, f, u, 0); px(p[0], p[1] - 1, [190, 160, 110]); px(p[0], p[1], [120, 96, 60]); px(p[0], p[1] + 1, [60, 46, 30]); }
        s.bulbs.forEach(([u, d], i) => {
            const p = onScreen(l, f, u, -d), X = Math.round(p[0]), Y = Math.round(p[1]), col = pal[i % pal.length], L = level(f, i, t);
            /* light on the wall round it, stronger after dark */
            if (night > .3) { glow.globalCompositeOperation = "lighter"; glow.globalAlpha = ghost ? .7 : 1; const g = glow.createRadialGradient(X + .5, Y + 6, 0, X + .5, Y + 6, 16); g.addColorStop(0, `rgba(${col.lit[0]},${col.lit[1]},${col.lit[2]},${.32 * L * night})`); g.addColorStop(.4, `rgba(${col.lit[0]},${col.lit[1]},${col.lit[2]},${.11 * L * night})`); g.addColorStop(1, "rgba(0,0,0,0)"); glow.fillStyle = g; glow.fillRect(X - 16, Y - 10, 33, 33); glow.globalCompositeOperation = "source-over"; }
            /* the homepage's C9: a socket, the glass widening and closing to a point, a dark rim on the right, a highlight on the left */
            const SOCK = [26, 32, 26], SOCK_HI = [70, 84, 70], body = mix(col.dark, col.lit, L), edge = mix(mix(col.dark, [0, 0, 0], .35), col.dark, L), hi = mix(body, col.hi, L);
            px(X, Y + 1, SOCK); px(X - 1, Y + 2, SOCK_HI); px(X, Y + 2, SOCK_HI); px(X + 1, Y + 2, SOCK);
            for (const [dy, a0, a1] of [[3, -1, 1], [4, -2, 2], [5, -2, 2], [6, -2, 2], [7, -1, 1], [8, 0, 0]]) for (let dx = a0; dx <= a1; dx++) px(X + dx, Y + dy, body);
            for (const [dx, dy] of [[2, 4], [2, 5], [2, 6], [1, 7], [0, 8]]) px(X + dx, Y + dy, edge);
            for (const [dx, dy] of [[-1, 3], [0, 3], [-2, 4], [-2, 5]]) px(X + dx, Y + dy, hi);
            px(X - 1, Y + 4, mix(hi, [255, 255, 255], L));
            /* a dithered halo, as the homepage's */
            if (night > .3) for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const dd = Math.hypot(dx, dy * 1.1); if (dd > 5.2 || dd < 2.6 || ((X + dx + Y + dy) & 1)) continue; px(X + dx, Y + 5 + dy, col.lit, (dd > 3.8 ? .2 : .35) * L * night); }
        });
        c.globalAlpha = 1;
    }
    window.HallwayFestoon = { shape, onScreen, draft: null };
    const strCv = document.createElement("canvas"), sgx = strCv.getContext("2d", { willReadFrequently: true }), glowCv = document.createElement("canvas"), ggx = glowCv.getContext("2d", { willReadFrequently: true });
    function drawFestoons(c, ox, oy, now) {
        if (!window.hallwayXmas) return; const l = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi && LIVE.editorApi().level); if (!l) return; const list = runsOn(l), d = window.HallwayFestoon.draft; if (!list.length && !d) return;
        const t = now / 1000, night = nightness(); c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false;
        for (const f of list) {
            /* its box on the map, from its own points */
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const sh = shape(f); for (const [u, dd] of sh.pts.filter((q, i) => i % 4 === 0).concat(sh.bulbs)) { const p = onScreen(l, f, u, -dd); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
            x0 = Math.floor(x0) - 20; y0 = Math.floor(y0) - 14; const w = Math.ceil(x1) + 21 - x0, h = Math.ceil(y1) + 28 - y0; if (w <= 0 || h <= 0 || w > 4000 || h > 2000) continue;
            for (const cv of [strCv, glowCv]) if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
            for (const g of [sgx, ggx]) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.setTransform(1, 0, 0, 1, -x0, -y0); g.imageSmoothingEnabled = false; }
            drawString(sgx, l, f, t, night, false, ggx);
            for (const g of [sgx, ggx]) g.setTransform(1, 0, 0, 1, 0, 0);
            const who = f.axis === "x" ? { x: f.a, y: f.line } : { x: f.line, y: f.a }, z = LIVE.nodeZ(l, who.x, who.y) || l.k * 163;
            LIVE.as({ x: who.x, y: who.y, z, l, dir: 2, frame: 0, st: null }, () => { LIVE.cutInFront(sgx, x0, y0, true); LIVE.cutInFront(ggx, x0, y0, true); });
            c.drawImage(strCv, 0, 0, w, h, x0, y0, w, h); c.globalCompositeOperation = "lighter"; c.drawImage(glowCv, 0, 0, w, h, x0, y0, w, h); c.globalCompositeOperation = "source-over";
        }
        if (d && d.l === l) drawString(c, l, d, t, night, true);
        c.restore();
    }
    LIVE.add({ still: true, under: drawFestoons });
    /* a twinkling string: woken ten times a second, not every frame, and not under reduced motion (10 Nov scan b, live 11 and 12) */
    setInterval(() => { if (!document.hidden && window.hallwayXmas && !reducedX.matches && runsOn(LIVE.floor).some(f => f.twinkle)) LIVE.wake(); }, 100);
    /* ---------- garlands: l.garlands = [{ axis, line, a, b, baubles }] ----------
       Baked into the Christmas tiles by render/hw3.js (9 Nov 2026, his: they weren't hidden by walls and furniture in front, and sat a tile
       to the left). Here only the one being laid is drawn, from the same pixels (render/garland.js), and a click finds a tile of one. */
    const GA = window.HallwayGarlandArt;
    const topsOf = (l, g) => { const tops = []; for (let t = g.a; t < g.b; t++) tops.push(LIVE.wallTop ? LIVE.wallTop(l, g.axis, g.line, t) : null); return tops; };
    const screen = (x, y, z) => LIVE.mapPoint(x, y, z);
    /* one tile's place: c is the middle of its dip, where a click finds it */
    function tileAt(l, g, t) { if (!GA || !LIVE.wallTop || t < g.a || t >= g.b) return null; const q = GA.pixels(g, topsOf(l, g), screen, null).find(p => p.t === t); return q ? { c: [q.mid[0], q.mid[1] - 8] } : null; }
    function drawGarland(c, l, g, ghost) {
        if (!GA || !LIVE.wallTop) return; c.globalAlpha = ghost ? .7 : 1;
        for (const q of GA.pixels(g, topsOf(l, g), screen, LIVE.map && LIVE.map.baubles)) for (const [X, Y, col] of q.px) { c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; c.fillRect(X, Y, 1, 1); }
        c.globalAlpha = 1;
    }
    window.HallwayGarland = { tileAt, draft: null };
    function drawGarlands(c, ox, oy) {
        if (!window.hallwayXmas) return; const l = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi && LIVE.editorApi().level); if (!l) return; const d = window.HallwayGarland.draft; if (!d || d.l !== l) return;
        c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; drawGarland(c, l, d, true); c.restore();
    }
    LIVE.add({ still: true, under: drawGarlands });
})();

/* ---------- the Christmas trees' lights, alive: every bulb breathes slowly on its own, warm like an old filament bulb, now and then one
   sparkles, and the star's glow swells and settles (8 Nov 2026, his: "that nostalgic, incandescent glow"; 10 Nov: "I'm seeing no glow",
   so: the giant tree and our own firs alike, stronger as the light goes, and cut by whatever stands in front of the tree, as the snow is).
   The steady glow is baked into the map's pictures (render/hw3.js); this only adds the movement on top, so it's never the whole of it.
   It redraws about eleven times a second, not every frame, and only while a tree is on screen. ---------- */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const reducedX = matchMedia("(prefers-reduced-motion: reduce)");
    const FP = k => (window.FLOOR_PIECES || {})[k] || null;
    const floorNow = () => window.HALLWAY_PLAY ? LIVE.floor : (LIVE.editorApi && LIVE.editorApi().level) || LIVE.floor;
    /* each tree on the floor shown: its picture's place and the tile its foot is on, as render/hw3.js puts it */
    function trees() {
        if (!window.hallwayXmas) return []; const l = floorNow(); if (!l) return []; const out = [];
        for (const p of l.props || []) {
            let k = null, fx, fy, cx, cy;
            if (p.k === "statue") { k = "bigtree"; cx = p.x + 1; cy = p.y + 1; fx = p.x + 1; fy = p.y + 1; }
            else if (p.k === "xmasfir" || p.k === "xmasfir2" || p.k === "xmasfir4") { const turned = ((p.rot || 0) & 1) === 1; k = p.k; cx = p.x + (p.k === "xmasfir4" || (p.k === "xmasfir2" && !turned) ? 1 : .5); cy = p.y + (p.k === "xmasfir4" || (p.k === "xmasfir2" && turned) ? 1 : .5); fx = Math.ceil(cx) - 1; fy = Math.ceil(cy) - 1; }
            const fp = k && FP(k); if (!fp || !fp.bulbs) continue;
            const a = LIVE.mapPoint(cx, cy, LIVE.nodeZ(l, p.x, p.y) || 0);
            out.push({ l, p, k, fp, fx, fy, X0: Math.round(a[0]) - fp.ox, Y0: Math.round(a[1]) - fp.oy });
        }
        return out;
    }
    const onScreen = (t, v) => !(t.X0 - 20 > v.x1 || t.X0 + t.fp.w + 20 < v.x0 || t.Y0 - 30 > v.y1 || t.Y0 + t.fp.h + 20 < v.y0);
    /* the bulbs of each kind of tree, with a phase and pace each that stay the same from visit to visit */
    const bulbsOf = new Map();
    function bulbs(k, fp) {
        if (bulbsOf.has(k)) return bulbsOf.get(k);
        const rnd = n => { const v = Math.sin(n * 12.9898 + k.length * 78.233) * 43758.5453; return v - Math.floor(v); };
        const list = fp.bulbs.map((b, i) => ({ x: b[0], y: b[1], c: [Math.round(b[2] * .6 + 255 * .4), Math.round(b[3] * .6 + 180 * .4), Math.round(b[4] * .6 + 90 * .4)], ph: rnd(i + 1), per: 2.6 + rnd(i + 7) * 3.8, sp: rnd(i + 13) < .14 }));
        /* the star: the middle of the gold at the top of the tree's lights */
        let sx = fp.ox, sy = 6, n = 0, X = 0, Y = 0; const im = new Image(); im.src = "art/wall/" + fp.lights;
        const o = { list, star: [sx, sy], big: k === "bigtree" };
        im.onload = () => { const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = Math.min(im.naturalHeight, o.big ? 34 : 18); const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
            for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) { const q = (j * c.width + i) * 4; if (!d[q + 3] || d[q] + d[q + 1] < 400 || d[q + 2] > d[q + 1]) continue; n++; X += i; Y += j; }
            if (n) o.star = [X / n, Y / n]; LIVE.wake(); };
        bulbsOf.set(k, o); return o;
    }
    /* one soft round halo per colour, drawn once */
    const halos = new Map();
    function halo(c, R) {
        const key = c.join(",") + "|" + R; let h = halos.get(key); if (h) return h;
        h = document.createElement("canvas"); h.width = h.height = R * 2 + 1; const g = h.getContext("2d"), gr = g.createRadialGradient(R + .5, R + .5, 0, R + .5, R + .5, R + .5);
        gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},1)`); gr.addColorStop(.35, `rgba(${c[0]},${c[1]},${c[2]},.38)`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        g.fillStyle = gr; g.fillRect(0, 0, h.width, h.height); if (halos.size > 200) halos.clear(); halos.set(key, h); return h;
    }
    function nightness() { const m = LIVE.mood(); if (!m) return .6; const n = q => q === "night" ? 1 : q === "dusk" || q === "dawn" || q === "failing" ? .7 : .2; return n(m.a) * (1 - m.f) + n(m.b) * m.f; }
    const cv = document.createElement("canvas"), g = cv.getContext("2d"), PAD = 26;
    /* what stands in front of each tree, as a mask: worked out once per tree and map, not every frame (it was 4ms of a 5ms frame) */
    const masks = new Map();
    function maskOf(tr, w, h) {
        const key = [tr.l.id, tr.X0, tr.Y0, w, h, LIVE.tileGen].join("|"), mk = tr.k + "@" + tr.p.x + "," + tr.p.y; let m = masks.get(mk); if (m && m.key === key) return m.cv;
        const c = (m && m.cv) || document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
        const z = LIVE.nodeZ(tr.l, tr.fx, tr.fy) || 0; LIVE.as({ x: tr.fx, y: tr.fy, z, l: tr.l, dir: 2, frame: 0, st: null }, () => LIVE.cutInFront(x, tr.X0 - PAD, tr.Y0 - PAD, true));
        if (masks.size > 30) masks.clear(); masks.set(mk, { key, cv: c }); return c;
    }
    function draw(c, ox, oy, now) {
        const ts = trees(); if (!ts.length) return; const v = LIVE.view(), t = now / 1000, s = .55 + .45 * nightness();
        c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = true;
        for (const tr of ts) {
            if (!onScreen(tr, v)) continue;
            const B = bulbs(tr.k, tr.fp), w = tr.fp.w + PAD * 2, h = tr.fp.h + PAD * 2, R = B.big ? 4 : 3;
            if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
            g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, w, h); g.globalCompositeOperation = "lighter";
            for (const b of B.list) {
                /* a slow breath, 50% to 100%; a few now and then flare for a moment, as a loose filament does */
                let k = .5 + .5 * (.5 + .5 * Math.sin((t / b.per + b.ph) * Math.PI * 2));
                if (b.sp) { const u = ((t / (b.per * 2.3) + b.ph) % 1); if (u < .06) k += .9 * Math.sin(u / .06 * Math.PI); }
                g.globalAlpha = Math.min(1, .3 * k * s); g.drawImage(halo(b.c, R), PAD + b.x - R, PAD + b.y - R);
            }
            /* the star: a glow that swells and settles over about five seconds */
            const sk = .75 + .25 * Math.sin(t * 1.25), SR = B.big ? 20 : 9; g.globalAlpha = Math.min(1, (.32 + .3 * s) * sk); g.drawImage(halo([255, 228, 160], SR), PAD + B.star[0] - SR, PAD + B.star[1] - SR);
            g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
            /* what stands in front of the tree hides its lights */
            const X = tr.X0 - PAD, Y = tr.Y0 - PAD; g.globalCompositeOperation = "destination-in"; g.drawImage(maskOf(tr, w, h), 0, 0); g.globalCompositeOperation = "source-over";
            c.globalCompositeOperation = "lighter"; c.drawImage(cv, 0, 0, w, h, X, Y, w, h); c.globalCompositeOperation = "source-over";
        }
        c.restore();
    }
    LIVE.add({ still: true, under: draw });
    /* about eleven times a second while a tree is on screen and the tab is in view */
    setInterval(() => { if (document.hidden || !window.hallwayXmas || reducedX.matches) return; const v = LIVE.view(); if (trees().some(tr => onScreen(tr, v))) LIVE.wake(); }, 90);
})();

