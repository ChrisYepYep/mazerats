/* Christmas in the Hallway: it follows the site's skin, the Warren's preview included, as it is when the page opens. The tree, gifts, garlands and snowy views are in their own sets of pictures;
   here we only say which sets to ask for, and let snow fall in the windows. */
(function () {
    "use strict";
    const worn = () => { try { if (/[?&]xmas=1/.test(location.search)) return true; const p = window.parent !== window ? window.parent : window; return !!(p.SkinWear && p.SkinWear.current && /^xmas$|christmas/i.test(String(p.SkinWear.current() || ""))); } catch (e) { return false; } };
    let tries = 0; const again = setInterval(() => { if (!window.HALLWAY_PLAY) { clearInterval(again); return; } if (worn() && !window.hallwayXmas) { window.hallwayXmas = true; if (window.HallwayLive) HallwayLive.wake(); } if (++tries > 8) clearInterval(again); }, 800);
    const LIVE = window.HallwayLive; if (!LIVE) return;
    const barsOf = W => Math.max(1, Math.round(W / 26)), railsOf = (b, top) => top - b > 90 ? [b + (top - b) * .33, b + (top - b) * .66] : [b + (top - b) * .55];
    const glass = (W, b, top, y, z) => { if (y < 1 || y > W - 1 || z < b + 3 || z > top - 2) return false; const n = barsOf(W); for (let i = 1; i <= n; i++) if (Math.abs(y - W * i / (n + 1)) < 1.3) return false; for (const r of railsOf(b, top)) if (Math.abs(z - r) < 1.3) return false; return true; };
    function windows() { const l = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi && LIVE.editorApi().level); if (!l || !l.wallItems) return []; const v = LIVE.view(), out = []; for (const q of l.wallItems) { if (q.k !== "i_window") continue; const t = q.axis === "y" ? [q.line, Math.floor(q.at)] : [Math.floor(q.at), q.line], z = LIVE.nodeZ(l, t[0], t[1]) || 0, a = q.axis === "y" ? LIVE.mapPoint(q.line, q.at, z) : LIVE.mapPoint(q.at, q.line, z); if (a[0] > v.x0 - 200 && a[0] < v.x1 + 200 && a[1] > v.y0 - 40 && a[1] < v.y1 + 200) out.push({ q, z }); } return out; }
    LIVE.add({ active: () => !!window.hallwayXmas && windows().length > 0,
        over(c, ox, oy, now) { const t = now / 1000; c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.fillStyle = "#ffffff";
            for (const { q, z } of windows()) { const W = q.w || 52, b = q.b || 0, top = q.top || 78, start = q.at - W / 32, H = top - b;
                for (let i = 0; i < W * 2; i++) { const u = (i * 17 + Math.round(Math.sin(t * .8 + i) * 2) + 500) % W, h = H - (Math.floor(i * 11 + t * (10 + i % 4)) % H), zz = b + h; if (!glass(W, b, top, u, zz)) continue; const p = q.axis === "y" ? LIVE.mapPoint(q.line, start + u / 16, z + zz) : LIVE.mapPoint(start + u / 16, q.line, z + zz); c.fillRect(Math.round(p[0]), Math.round(p[1]) - 6, 1, 1); } } } });

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
    function onScreen(l, f, u, down) { const along = f.axis === "x" ? f.a + u / 16 : f.a + 1 + u / 16, t = f.axis === "x" ? [Math.floor(along), f.line] : [f.line, Math.floor(along)], z = (LIVE.nodeZ(l, t[0], t[1]) || l.k * 163) + (f.h || 118) - down; return f.axis === "x" ? LIVE.mapPoint(along, f.line, z) : LIVE.mapPoint(f.line, along, z); }
    function nightness() { const m = LIVE.mood(); if (!m) return .6; const n = q => q === "night" ? 1 : q === "dusk" || q === "dawn" || q === "failing" ? .7 : .2; return n(m.a) * (1 - m.f) + n(m.b) * m.f; }
    function drawString(c, l, f, t, night, ghost) {
        const s = shape(f), pal = COL[f.colour] || COL.amber, px = (X, Y, cc, al) => { c.globalAlpha = al === undefined ? 1 : al; c.fillStyle = `rgb(${cc[0]},${cc[1]},${cc[2]})`; c.fillRect(Math.round(X), Math.round(Y), 1, 1); };
        if (ghost) c.globalAlpha = .7;
        /* the flex, standing a little off the wall: its shadow first, a few pixels down */
        for (const [u, d] of s.pts) { const p = onScreen(l, f, u, -d); px(p[0], p[1] + 3, [0, 0, 0], .18 * (1 - night * .6)); }
        for (const [u, d] of s.pts) { const p = onScreen(l, f, u, -d); px(p[0], p[1], [24, 20, 16]); if (Math.round(u * 2) % 8 === 0) px(p[0], p[1] - 1, [70, 60, 50]); }
        /* the hooks it hangs from */
        for (const u of s.hooks) { const p = onScreen(l, f, u, 0); px(p[0], p[1] - 1, [190, 160, 110]); px(p[0], p[1], [120, 96, 60]); px(p[0], p[1] + 1, [60, 46, 30]); }
        s.bulbs.forEach(([u, d], i) => {
            const p = onScreen(l, f, u, -d), X = Math.round(p[0]), Y = Math.round(p[1]), col = pal[i % pal.length], L = level(f, i, t);
            /* light on the wall round it, stronger after dark */
            if (night > .3) { c.globalCompositeOperation = "lighter"; c.globalAlpha = 1; const g = c.createRadialGradient(X + .5, Y + 6, 0, X + .5, Y + 6, 16); g.addColorStop(0, `rgba(${col.lit[0]},${col.lit[1]},${col.lit[2]},${.32 * L * night})`); g.addColorStop(.4, `rgba(${col.lit[0]},${col.lit[1]},${col.lit[2]},${.11 * L * night})`); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(X - 16, Y - 10, 33, 33); c.globalCompositeOperation = "source-over"; }
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
    function drawFestoons(c, ox, oy, now) {
        if (!window.hallwayXmas) return; const l = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi && LIVE.editorApi().level); if (!l) return; const list = runsOn(l), d = window.HallwayFestoon.draft; if (!list.length && !d) return;
        const t = now / 1000, night = nightness(); c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false;
        for (const f of list) drawString(c, l, f, t, night, false); if (d && d.l === l) drawString(c, l, d, t, night, true);
        c.restore();
    }
    LIVE.add({ still: true, under: drawFestoons });
    LIVE.add({ active: () => !!window.hallwayXmas && runsOn(LIVE.floor).some(f => f.twinkle), under() { } });
    /* ---------- garlands: l.garlands = [{ axis, line, a, b, baubles }] ---------- */
    const swagImg = new Image(); swagImg.onload = () => LIVE.wake(); swagImg.src = "art/wall/i_swag.png";
    const BAUB = { red: ["c8352a", "ff8a78", "7a1b16"], gold: ["d6ad56", "fff4c8", "86601f"], blue: ["3a7ad6", "a8d0ff", "1f4a90"], silver: ["c9cdd4", "ffffff", "7a808a"], purple: ["8a3ac8", "d0a0ff", "4e1f7a"], pink: ["e0568c", "ffb0cc", "8a2450"], teal: ["2aa8a0", "a0f0e8", "146a64"] };
    const ROW = ["..c..", ".KKK.", "KHGGK", "KGGGK", "KGGDK", ".KKK."];
    /* one tile's place: where the art goes so its rope runs 12px under the wall's top there */
    function tileAt(l, g, t) { const def = (window.WALL_ITEMS || []).find(i => i.id === "i_swag"); if (!def || !LIVE.wallTop) return null; const at = g.axis === "x" ? t + .5 : t + 1.5, top = LIVE.wallTop(l, g.axis, g.line, t); if (top === null) return null; const c = g.axis === "x" ? LIVE.mapPoint(at, g.line, top - 6) : LIVE.mapPoint(g.line, at, top - 6); return { def, c, box: g.axis === "x" ? def.x : def.y }; }
    function drawGarland(c, l, g, ghost) {
        if (!swagImg.complete || !swagImg.naturalWidth) return; const use = ((LIVE.map && LIVE.map.baubles) || Object.keys(BAUB)).filter(n => BAUB[n]), hex = s => "#" + s; let n = 0;
        c.globalAlpha = ghost ? .7 : 1;
        for (let t = g.a; t < g.b; t++) { const q = tileAt(l, g, t); if (!q) continue; const L0 = q.box.layers[0], X = Math.round(q.c[0]) + L0.x, Y = Math.round(q.c[1]) + L0.y;
            if (L0.flip) { c.save(); c.translate(X + swagImg.naturalWidth, Y); c.scale(-1, 1); c.drawImage(swagImg, 0, 0); c.restore(); } else c.drawImage(swagImg, X, Y);
            /* a bauble in the dip of each tile's swag */
            if (g.baubles !== false) { const B = BAUB[use[n++ % use.length]] || BAUB.red, bx = Math.round(q.c[0]) - 2, by = Math.round(q.c[1]) + 8; ROW.forEach((r, j) => { for (let u = 0; u < 5; u++) { const ch = r[u]; if (ch === ".") continue; c.fillStyle = ch === "K" ? "#000" : ch === "c" ? "#d6ad56" : ch === "H" ? hex(B[1]) : ch === "D" ? hex(B[2]) : hex(B[0]); c.fillRect(bx + u, by + j, 1, 1); } }); } }
        c.globalAlpha = 1;
    }
    window.HallwayGarland = { tileAt, draft: null };
    function drawGarlands(c, ox, oy) {
        if (!window.hallwayXmas) return; const l = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi && LIVE.editorApi().level); if (!l) return; const list = l.garlands || [], d = window.HallwayGarland.draft; if (!list.length && !d) return;
        c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; for (const g of list) drawGarland(c, l, g, false); if (d && d.l === l) drawGarland(c, l, d, true); c.restore();
    }
    LIVE.add({ still: true, under: drawGarlands });
})();
