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
    const BAUB = { red: ["c8352a", "ff8a78", "7a1b16"], gold: ["d6ad56", "fff4c8", "86601f"], blue: ["3a7ad6", "a8d0ff", "1f4a90"], silver: ["c9cdd4", "ffffff", "7a808a"], purple: ["8a3ac8", "d0a0ff", "4e1f7a"], pink: ["e0568c", "ffb0cc", "8a2450"], teal: ["2aa8a0", "a0f0e8", "146a64"] };
    const ROW = ["..c..", ".KKK.", "KHGGK", "KGGGK", "KGGDK", ".KKK."];
    /* one tile's place: where the art goes so its rope runs 12px under the wall's top there (on a climb, half way up it, so a click finds it) */
    function tileAt(l, g, t) { const def = (window.WALL_ITEMS || []).find(i => i.id === "i_swag"); if (!def || !LIVE.wallTop) return null; const at = g.axis === "x" ? t + .5 : t + 1.5; let top = LIVE.wallTop(l, g.axis, g.line, t); if (top === null) return null;
        if (t >= g.a && t < g.b) { const { E } = joins(l, g), i = t - g.a; if (E[i] !== null && E[i + 1] !== null) top = (E[i] + E[i + 1]) / 2; } const c = g.axis === "x" ? LIVE.mapPoint(at, g.line, top - 6) : LIVE.mapPoint(g.line, at, top - 6); return { def, c, box: g.axis === "x" ? def.x : def.y }; }
    /* One tile of garland, pixel for pixel as ideas/christmas.js swag() draws i_swag.png, but able to climb: where the wall's top steps up
       (the floor above raised, the wall going on up to it) the rope rises across the higher tiles instead of staying level (8 Nov, his).
       up = how much higher the tile's far end hangs than its near end; back = the same for the tile before, which the holly's other half lies over.
       Pixels come out relative to the picture's own anchor: [x, y, colour]. A level tile gives exactly the picture's pixels. */
    const GK = [10, 8, 8], GH = s => [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    const GN = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }, gsag = (u, w, z0, drop) => z0 - drop * 4 * (u / w) * (1 - u / w);
    const tileMemo = new Map();
    function swagTile(up, back) {
        const key = up + "|" + back; if (tileMemo.has(key)) return tileMemo.get(key);
        const px = new Map(), wall = (u, z, col) => px.set(Math.round(-u) + "," + Math.round(Math.floor(u / 2) - z), col);
        const shape = paint => { const seen = new Map(), mark = (u, z, col) => seen.set(Math.round(u) + "," + Math.round(z), col); paint(mark); for (const k of seen.keys()) { const [u, z] = k.split(",").map(Number); for (const [p, q] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!seen.has((u + p) + "," + (z + q))) wall(u + p, z + q, GK); } for (const [k, col] of seen) { const [u, z] = k.split(",").map(Number); wall(u, z, col); } };
        const W = 16, Z = 126, DROP = 3, lift = u => u >= 0 ? up * u / W : back * u / W, rope = u => gsag(u, W, Z, DROP) + lift(u);
        for (let u = 0; u < W; u += .5) { const z = rope(u); for (let d = -2.5; d <= 2.5; d += .5) { const n = GN(Math.round(u * 2), Math.round(d * 2) + 9), edge = Math.abs(d) > 2.2 - n * .8; if (edge && n < .6) continue; const col = d > 1.5 ? GH("6cb05e") : d > .5 ? (n > .5 ? GH("4fa858") : GH("3f8a44")) : d > -1 ? GH("2f7d3a") : GH("1c5426"); wall(u, z + d, col); } wall(u, z - 3, GK); wall(u, z + 3, [16, 34, 18]);
            /* climbing steeply, the needles would come apart into stripes: fill each half-step's rise */
            const z2 = rope(u + .5); for (let s = 1; s < Math.abs(z2 - z) - .5; s++) { const zz = z + Math.sign(z2 - z) * s; for (let d = -2; d <= 2; d += .5) wall(u, zz + d, d > 1.5 ? GH("6cb05e") : d > .5 ? GH("3f8a44") : d > -1 ? GH("2f7d3a") : GH("1c5426")); } }
        /* holly where the tiles meet, each half lying along its own tile's rope */
        for (const side of [-1, 1]) shape(mark => { for (let i = 0; i < 6; i++) { const wid = Math.round(2 * Math.sin((i + 1) / 7 * Math.PI)) + (i % 3 === 1 ? 1 : 0); for (let j = -wid; j <= wid; j++) mark(side * (i + 1), Z + 1 + j - i * .3 + lift(side * (i + 1)), j === 0 ? GH("6cb05e") : (j > 0 ? GH("3f8a44") : GH("1c5426"))); } });
        shape(mark => { for (const [p, q] of [[0, 0], [2, -1], [-2, -1]]) for (const [e, f] of [[0, 0], [1, 0], [0, 1], [1, 1]]) mark(p + e, Z - 2 + q + f, e === 0 && f === 1 ? GH("ff8a78") : e === 1 && f === 0 ? GH("a81f16") : GH("e0352a")); });
        const out = []; for (const [k, col] of px) { const [x, y] = k.split(",").map(Number); out.push([x, y, `rgb(${col[0]},${col[1]},${col[2]})`]); }
        tileMemo.set(key, out); return out;
    }
    /* where the rope hangs at each join along the run: never above the wall on either side of it, and where the top steps, a climb of at most
       16 a tile on the higher side, so the garland stays on the wall all the way up */
    function joins(l, g) {
        const n = g.b - g.a, top = [], E = []; for (let i = 0; i < n; i++) top.push(LIVE.wallTop(l, g.axis, g.line, g.a + i));
        for (let e = 0; e <= n; e++) { const a = e > 0 ? top[e - 1] : null, b = e < n ? top[e] : null; E.push(a === null ? b : b === null ? a : Math.min(a, b)); }
        const CLIMB = 16; for (let e = 0; e <= n; e++) if (E[e] !== null) for (let j = 0; j <= n; j++) if (E[j] !== null) E[e] = Math.min(E[e], E[j] + CLIMB * Math.abs(e - j));
        return { top, E };
    }
    function drawGarland(c, l, g, ghost) {
        if (!LIVE.wallTop || !LIVE.mapPoint) return; const use = ((LIVE.map && LIVE.map.baubles) || Object.keys(BAUB)).filter(n => BAUB[n]), hex = s => "#" + s; let n = 0;
        c.globalAlpha = ghost ? .7 : 1; const { top, E } = joins(l, g);
        for (let t = g.a; t < g.b; t++) { const i = t - g.a; if (top[i] === null || E[i] === null || E[i + 1] === null) continue;
            /* the tile's near end hangs 6 under its join; c is where the picture's anchor goes, as tileAt's was for a level wall */
            const at = g.axis === "x" ? t + .5 : t + 1.5, p = g.axis === "x" ? LIVE.mapPoint(at, g.line, E[i] - 6) : LIVE.mapPoint(g.line, at, E[i] - 6), cx = Math.round(p[0]), cy = Math.round(p[1]);
            const up = Math.round(E[i + 1] - E[i]), back = i > 0 && E[i - 1] !== null ? Math.round(E[i] - E[i - 1]) : 0, flip = g.axis === "x";
            for (const [x, y, col] of swagTile(up, back)) { c.fillStyle = col; c.fillRect(flip ? cx - 8 - x : cx + 8 + x, cy + 124 + y, 1, 1); }
            /* a bauble in the dip of each tile's swag, half way up its climb */
            if (g.baubles !== false) { const B = BAUB[use[n++ % use.length]] || BAUB.red, bx = cx - 2, by = cy + 8 - Math.round(up / 2); ROW.forEach((r, j) => { for (let u = 0; u < 5; u++) { const ch = r[u]; if (ch === ".") continue; c.fillStyle = ch === "K" ? "#000" : ch === "c" ? "#d6ad56" : ch === "H" ? hex(B[1]) : ch === "D" ? hex(B[2]) : hex(B[0]); c.fillRect(bx + u, by + j, 1, 1); } }); } }
        c.globalAlpha = 1;
    }
    window.HallwayGarland = { tileAt, draft: null };
    function drawGarlands(c, ox, oy) {
        if (!window.hallwayXmas) return; const l = LIVE.floor || (!window.HALLWAY_PLAY && LIVE.editorApi && LIVE.editorApi().level); if (!l) return; const list = l.garlands || [], d = window.HallwayGarland.draft; if (!list.length && !d) return;
        c.save(); c.translate(ox, oy); c.scale(LIVE.zoom, LIVE.zoom); c.imageSmoothingEnabled = false; for (const g of list) drawGarland(c, l, g, false); if (d && d.l === l) drawGarland(c, l, d, true); c.restore();
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
