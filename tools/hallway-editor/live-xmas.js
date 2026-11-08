/* Christmas in the Hallway: it follows the site's skin, the Warren's preview included, as it is when the page opens. The tree, gifts, garlands and snowy views are in their own sets of pictures;
   here we only say which sets to ask for, and let snow fall in the windows. */
(function () {
    "use strict";
    const worn = () => { try { if (/[?&]xmas=1/.test(location.search)) return true; const p = window.parent !== window ? window.parent : window; return !!(p.SkinWear && p.SkinWear.current && /^xmas$|christmas/i.test(String(p.SkinWear.current() || ""))); } catch (e) { return false; } };
    let tries = 0; const again = setInterval(() => { if (!window.HALLWAY_PLAY) { clearInterval(again); return; } if (worn() && !window.hallwayXmas) { window.hallwayXmas = true; if (window.HallwayLive) HallwayLive.wake(); } if (++tries > 8) clearInterval(again); }, 800);
    const LIVE = window.HallwayLive; if (!LIVE) return;
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
    const snowCv = document.createElement("canvas"), sg = snowCv.getContext("2d");
    LIVE.add({ active: () => !!window.hallwayXmas && windows().length > 0,
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
                LIVE.as({ x: V.who.x, y: V.who.y, z, l, dir: 2, frame: 0, st: null }, () => { LIVE.cutInFront(sg, bx0, by0); LIVE.tint(sg, w, h); });
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

/* ---------- the big tree's bulbs: a warm, soft incandescent glow round each, breathing slowly (8 Nov 2026, his: "The tree still doesn't
   have that nostalgic, incandescent glow"). The bulbs are found once from the tree's lights picture; each gets a halo drawn with
   "lighter" in a warm amber, on its own slow cycle, never off, as old filament bulbs on a string do. Drawn under the avatar. ---------- */
(function () {
    "use strict";
    const LIVE = window.HallwayLive; if (!LIVE) return;
    let bulbs = null, fp = null;
    function load() {
        if (bulbs !== null) return; bulbs = false; fp = (window.FLOOR_PIECES || {}).bigtree; if (!fp || !fp.lights) return;
        /* the tree's second version (8 Nov) says where its bulbs are; the baubles' highlights are lit too, and must not get a halo */
        if (fp.bulbs) { bulbs = fp.bulbs.map(b => ({ x: b[0] + .5, y: b[1] + .5, c: [b[2], b[3], b[4]], ph: Math.random(), per: 4 + Math.random() * 3 })); LIVE.wake(); return; }
        const im = new Image(); im.onload = () => {
            const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0);
            const d = g.getImageData(0, 0, c.width, c.height).data, seen = new Uint8Array(c.width * c.height), out = [];
            /* each touching group of lit pixels is one bulb, at its middle, in its own colour */
            for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = y * c.width + x; if (seen[i] || d[i * 4 + 3] < 128) continue;
                const st = [i], px = []; seen[i] = 1; while (st.length) { const k = st.pop(); px.push(k); const kx = k % c.width, ky = (k / c.width) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = kx + dx, ny = ky + dy; if (nx < 0 || ny < 0 || nx >= c.width || ny >= c.height) continue; const n = ny * c.width + nx; if (!seen[n] && d[n * 4 + 3] >= 128) { seen[n] = 1; st.push(n); } } }
                if (px.length > 40) continue;                                   // the star, not a bulb: it has its own glow
                let sx = 0, sy = 0, r = 0, gg = 0, b = 0; for (const k of px) { sx += k % c.width; sy += (k / c.width) | 0; r += d[k * 4]; gg += d[k * 4 + 1]; b += d[k * 4 + 2]; }
                const n = px.length; out.push({ x: sx / n + .5, y: sy / n + .5, c: [r / n, gg / n, b / n], ph: Math.random(), per: 4 + Math.random() * 3 });
            }
            bulbs = out; LIVE.wake();
        };
        im.src = "art/wall/" + fp.lights;
    }
    const trees = () => { if (!window.hallwayXmas) return []; const l = LIVE.floor || (LIVE.editorApi && LIVE.editorApi().level); if (!l) return []; return (l.props || []).filter(p => p.k === "statue").map(p => ({ l, p })); };
    LIVE.add({
        active: () => { if (!window.hallwayXmas) return false; load(); return !!bulbs && trees().length > 0; },
        under(c, ox, oy, now) {
            if (!bulbs || !fp) return; const t = now / 1000, v = LIVE.view();
            c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.globalCompositeOperation = "lighter";
            for (const { l, p } of trees()) {
                const a = LIVE.mapPoint(p.x + 1, p.y + 1, LIVE.nodeZ(l, p.x, p.y) || 0), X0 = Math.round(a[0]) - fp.ox, Y0 = Math.round(a[1]) - fp.oy;
                if (X0 > v.x1 || X0 + fp.w < v.x0 || Y0 > v.y1 || Y0 + fp.h < v.y0) continue;
                for (const b of bulbs) {
                    /* warm, never cold: the bulb's own colour pulled towards a filament's amber, and a slow breath of 70% to 100% */
                    const k = .7 + .3 * (.5 + .5 * Math.sin((t / b.per + b.ph) * Math.PI * 2)), col = [Math.round(b.c[0] * .55 + 255 * .45), Math.round(b.c[1] * .55 + 176 * .45), Math.round(b.c[2] * .55 + 86 * .45)];
                    const x = X0 + b.x, y = Y0 + b.y, R = 4, g = c.createRadialGradient(x, y, 0, x, y, R);
                    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${(.2 * k).toFixed(3)})`); g.addColorStop(.5, `rgba(${col[0]},${col[1]},${col[2]},${(.06 * k).toFixed(3)})`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
                    c.fillStyle = g; c.fillRect(x - R, y - R, R * 2, R * 2);
                }
            }
            c.restore();
        }
    });
})();
