/* Ariadne's Thread: the zones after the Wood (13 Oct 2026). Each zone's own
   art and the way its world is drawn, for js/rat-race.js to use while that
   zone is on (THEMES there):

     sprites   "name@zone": rows of letters, one a pixel, "." clear, in a
               palette of the sprite's own over the game's shared one. While
               the zone is on, the game's spr("name") draws this in place of
               the Wood's sprite of that name.
     themes    per zone: how its walls, back wall, the frame in front of the
               back wall, platforms and props are drawn (functions given the
               game's helpers), its timber and edge colours, its lamps' glow,
               the colour of the air, the stones its rubble is made of.

   Everything faces RIGHT, lit from the top left, as in the Wood. */
(function () {
    "use strict";
    const sprites = {}, themes = {};
    /* (23 Oct 2026, the owner's: "On platforms that have the metal braces, it should be symmetrical") the straps, ties,
       brackets along a platform: spaced evenly about its middle, not every so many pixels from its left end (which left
       a two- or three-tile one with a single strap to one side). spread: n of them, each in the middle of its share (the
       ends left free); between: those between its two end pieces, evenly, for every so many pixels of it */
    // (each gives where a piece w wide starts: the left half worked out, the right half its mirror, so a pair is the same distance from each end)
    const mirrored = (W, w, n, at) => { const s = []; for (let i = 0; i < n; i++) s[i] = i < n / 2 ? Math.round(at(i) - w / 2) : W - w - s[n - 1 - i]; if (n % 2) s[(n - 1) / 2] = Math.floor((W - w) / 2); return s; };
    const spread = (W, every, w) => { const n = Math.max(1, Math.round(W / every)); return mirrored(W, w, n, i => W * (i + 0.5) / n); };
    const between = (W, every, w) => { const n = Math.max(0, Math.round(W / every) - 1); return mirrored(W, w, n, i => W * (i + 1) / (n + 1)); };
    const put = (zone, name, s) => { sprites[name + "@" + zone] = s; };
    // "#rrggbb" to [r, g, b]
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

    /* ================================================================ 1. THE MINE (its walls)
       (19 Oct 2026, the owner's: "I feel like our mine labyrinth is too wood-heavy when it comes to the walls and
       background walls, i like the wooden supports etc"; of the mock-ups, "Go with F, that feels the most natural
       but make it better ... make it look fantastic and immersive"). The Mine's timber stays as it was (its
       supports, beams, platforms, crates: the Wood in js/rat-race.js); the ground it is cut through is drawn here.

         THE WALLS     (since 21 Oct 2026, see slateWall) near-black slate after the underground of Super Mario Bros
                       3: rounded at its outer corners, a muted slate top surface along every floor, its face
                       cracked top to bottom. (19 to 21 Oct they were broken rock in packed earth: "too busy".)
         THE BACK      the rock face the tunnel was hewn from, behind the supports: big angular faces, dimmer and
                       cooler than the walls in front, scored with the picks' gouges in rows, an old drill hole
                       here and there, damp running down it.
       Per pixel: each wall tile into a scratch picture first (its 256 pixels at once) and then onto the map. */
    {
        const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
        const H = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
        const sm = t => t * t * (3 - 2 * t);
        const vn = (x, y, sc, s) => { const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy), u = sm(fx - ix), v = sm(fy - iy), a = H(ix, iy, s), b = H(ix + 1, iy, s), c = H(ix, iy + 1, s), d = H(ix + 1, iy + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
        const fbm = (x, y, sc, s) => vn(x, y, sc, s) * 0.55 + vn(x, y, sc / 2, s + 1) * 0.3 + vn(x, y, sc / 4, s + 2) * 0.15;
        // a ramp of colours, dark to light; t 0..1, dithered between its steps by where the pixel is
        // (each ramp blended out to three times its steps, so the dither falls between near colours, not a checkerboard)
        const ramp = list => { const c = list.map(rgb), out = []; for (let i = 0; i < c.length - 1; i++) for (let k = 0; k < 3; k++) out.push(c[i].map((v, j) => Math.round(v + (c[i + 1][j] - v) * k / 3))); out.push(c[c.length - 1]); return out; };
        const at = (R, t, x, y) => { const v = Math.max(0, Math.min(1, t)) * (R.length - 1), i = Math.floor(v); return R[Math.min(R.length - 1, i + (v - i > B4[(y & 3) * 4 + (x & 3)] ? 1 : 0))]; };
        const ROCK = [
            ramp(["#1e1610", "#3a2c21", "#544132", "#6e5844", "#8c7459", "#a89074"]),   // sandstone
            ramp(["#1a130e", "#33271d", "#4a392b", "#62503d", "#7d6750", "#98826a"]),   // umber
            ramp(["#191716", "#312d2a", "#48433e", "#615a53", "#7d756c", "#9c938a"]),   // grey grit
            ramp(["#24170c", "#45301b", "#624526", "#7e5b33", "#9a7344", "#b48c5a"]),   // ochre
            ramp(["#20140f", "#3c241b", "#563527", "#6e4634", "#8a5c46", "#a6765c"])    // iron-red
        ];
        /* the nearest two of a grid of jittered points (cell C, x stretched by sx): ids, the point, and how far the
           pixel is from the line between the two cells (the true distance to the edge) */
        /* (21 Oct 2026: made per use, each keeping the nine points round the last grid square it was asked about and
           giving back the same two objects each time: neighbouring pixels nearly always share them, and working
           them out afresh, and new objects, for every pixel of the back made the biggest passages take 3 seconds;
           the picture is the same to the pixel) */
        function makeCells(C, sx, s) {
            let lgx = NaN, lgy = NaN;
            const P = new Float64Array(36), A = { cx: 0, cy: 0, px: 0, py: 0 }, Bc = { cx: 0, cy: 0, px: 0, py: 0 }, out = { a: A, b: Bc, e: 0, dx: 0, dy: 0, r: 0 };
            return (x, y) => {
                const X = x * sx, gx = Math.floor(X / C), gy = Math.floor(y / C);
                if (gx !== lgx || gy !== lgy) {
                    lgx = gx; lgy = gy; let n = 0;
                    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const cx = gx + i, cy = gy + j; P[n++] = cx; P[n++] = cy; P[n++] = (cx + 0.12 + H(cx, cy, s) * 0.76) * C; P[n++] = (cy + 0.12 + H(cx, cy, s + 7) * 0.76) * C; }
                }
                let d1 = 1e9, d2 = 1e9, ai = 0, bi = 0;
                for (let n = 0; n < 36; n += 4) { const dd = (X - P[n + 2]) * (X - P[n + 2]) + (y - P[n + 3]) * (y - P[n + 3]); if (dd < d1) { d2 = d1; bi = ai; d1 = dd; ai = n; } else if (dd < d2) { d2 = dd; bi = n; } }
                A.cx = P[ai]; A.cy = P[ai + 1]; A.px = P[ai + 2]; A.py = P[ai + 3]; Bc.cx = P[bi]; Bc.cy = P[bi + 1]; Bc.px = P[bi + 2]; Bc.py = P[bi + 3];
                const L = Math.hypot(Bc.px - A.px, Bc.py - A.py) || 1;
                out.e = (d2 - d1) / (2 * L) / sx; out.dx = (X - A.px) / sx; out.dy = y - A.py; out.r = Math.sqrt(d1);
                return out;
            };
        }
        const cellsF = makeCells(19, 0.8, 511), cellsS = makeCells(9, 1, 531), cellsD = makeCells(37, 1, 621);
        /* which rock a block is: the ground's own tone, changing slowly through it (umber, sandstone, ochre), each
           block nudged from it; now and then a grey stone or an iron-red one among them */
        function toneOf(c, s) {
            const h = H(c.cx, c.cy, s);
            if (h < 0.08) return 2;
            if (h < 0.12) return 4;
            const k = vn(c.px, c.py, 140, 291) + (H(c.cx, c.cy, s + 1) - 0.5) * 0.3;
            return k < 0.38 ? 1 : k < 0.64 ? 0 : 3;
        }
        // how rocky the ground is about here (more rock than earth, earth in pockets and runs)
        /* THE WALLS (reworked 21 Oct 2026, the owner's: the rock "great, but ... a little too busy"; then, after the
           mock-ups, "similar to the darker underground levels in ... Super Mario Bros 3 Advance 4": near-black with
           coloured edges, rounded rock shapes, a simple repeating pattern inside, a lighter top surface; of the
           mock-ups, the slate one, "much more subtle ... think how mario's surfaces are", and for the face, cracks
           "less wiggly ... much much more of them ... mix it up a bit, add more too ... more again"). Near-black
           slate, its outer corners rounded (the back shows past them); along every floor a muted slate top, a
           highlight along it and its underside in small even scallops, a darker grain of pebble in it now and
           then; the sides and undersides only outlined; and down the face, cracks every pixel or two, each column
           of them its own rhythm, a stub to a long run, faint or brighter, some dark with a lit edge beside them,
           a pixel's step now and then, and tiny nicks between. */
        const SL = { body: rgb("#0f1016"), mo: [rgb("#171923"), rgb("#1e212d")], top: [rgb("#05060a"), rgb("#7e89a2"), rgb("#626c86"), rgb("#4c556c"), rgb("#353c50")], side: rgb("#1f2330"), out: rgb("#04050a") };
        const vn1 = (x, y, sc) => { const fy = y / sc, iy = Math.floor(fy), v = sm(fy - iy), a = H(x, iy, 61), b = H(x, iy + 1, 61); return a + (b - a) * v; };
        /* the face's cracks at a pixel: 0 none, 1 faint, 2 brighter, 3 a dark crack. Worked out once into a pattern
           512 by 256 that repeats (crackAt), not for every pixel of every wall: the biggest passages took 3 seconds */
        let crackPat = null;
        const CPW = 512, CPH = 256;
        function crackAt(X, Y) {
            if (!crackPat) { crackPat = new Uint8Array(CPW * CPH); for (let y = 0; y < CPH; y++) for (let x = 0; x < CPW; x++) crackPat[y * CPW + x] = crackMade(x, y); }
            return crackPat[(((Y % CPH) + CPH) % CPH) * CPW + (((X % CPW) + CPW) % CPW)];
        }
        function crackMade(X, Y) {
            for (let dc = -3; dc <= 2; dc++) {
                const col = Math.floor(X / 2) + dc, base = col * 2 + Math.floor(H(col, 0, 51) * 4);
                const P = 9 + Math.floor(H(col, 2, 56) * 16), yy = Y + Math.floor(H(col, 1, 52) * 60), seg = Math.floor(yy / P), off = yy - seg * P;
                const hl = H(col, seg, 53), len = 2 + Math.floor(Math.pow(hl, 1.3) * (P - 2));
                if (H(col, seg, 54) < 0.06 || off >= len) continue;
                const cx = base + (vn1(col * 13 + seg, Y, 7) > 0.72 ? 1 : 0), tone = H(col, seg, 57);
                if (X === cx) return tone < 0.18 ? 3 : (off === 0 || off === len - 1 || tone < 0.55) ? 1 : 2;
                if (tone < 0.18 && X === cx + 1) return 1;   // a dark crack's lit edge
            }
            const nx = Math.floor(X / 3), ny = Math.floor(Y / 5);   // the nicks
            if (H(nx, ny, 58) < 0.5 && X === nx * 3 + 1 && (Y - ny * 5) < 1 + Math.floor(H(nx, ny, 59) * 3)) return 1;
            return 0;
        }
        const RC = 4;   // the outer corners' roundness
        let crackCv = null;
        function crackFace() {
            if (crackCv) return crackCv;
            crackCv = document.createElement("canvas"); crackCv.width = CPW; crackCv.height = CPH;
            const x = crackCv.getContext("2d"), img = x.createImageData(CPW, CPH), d = img.data;
            for (let Y = 0; Y < CPH; Y++) for (let X = 0; X < CPW; X++) { const m = crackAt(X, Y), c = m === 3 ? SL.out : m === 2 ? SL.mo[1] : m === 1 ? SL.mo[0] : SL.body, k = (Y * CPW + X) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255; }
            x.putImageData(img, 0, 0);
            return crackCv;
        }
        const wallImg = (() => { const c = document.createElement("canvas"); c.width = 16; c.height = 16; const x = c.getContext("2d"); return { c, x, img: x.createImageData(16, 16) }; })();
        function slateWall(x, a, tx, ty, ppx, ppy, h) {
            const W = (dx, dy) => h.wallish(a, tx + dx, ty + dy);
            const u = !W(0, -1), dn = !W(0, 1), l = !W(-1, 0), r = !W(1, 0), d = wallImg.img.data;
            /* (21 Oct 2026, the owner's: "the play button is delayed and gameplay takes ages to load") a tile walled in
               on all four sides is nothing but the face's cracks: copied from them, made once (crackFace), not worked
               out a pixel at a time; most of a passage's wall is such tiles */
            if (!u && !dn && !l && !r) { x.drawImage(crackFace(), ((tx * 16) % CPW + CPW) % CPW, ((ty * 16) % CPH + CPH) % CPH, 16, 16, ppx, ppy, 16, 16); return; }
            // its rounded corners, only where two open sides meet (worked out once for the tile, not per pixel)
            /* (rounded everywhere, water or not: where a pool meets a rounded corner, water painted on the wall's tile
               shows through the corner's cut, behind the rock; js/rat-race.js, WATER BEHIND THE WALLS) */
            const corners = [[u, l, RC, RC], [u, r, 16 - RC, RC], [dn, l, RC, 16 - RC], [dn, r, 16 - RC, 16 - RC]].filter(c => c[0] && c[1]);
            for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
                const X = tx * 16 + i, Y = ty * 16 + j, k = (j * 16 + i) * 4;
                // how far in from the open air, the outer corners rounded
                let e = 99, eTop = u ? j : 99, rounded = false;
                if (u) e = Math.min(e, j); if (dn) e = Math.min(e, 15 - j); if (l) e = Math.min(e, i); if (r) e = Math.min(e, 15 - i);
                for (let q = 0; q < corners.length; q++) {
                    const cx = corners[q][2], cy = corners[q][3];
                    if (!(cx === RC ? i < RC : i >= 16 - RC) || !(cy === RC ? j < RC : j >= 16 - RC)) continue;
                    const v = RC - Math.hypot(i + 0.5 - cx, j + 0.5 - cy); e = v; rounded = true; if (u && cy === RC) eTop = Math.min(eTop, v);
                }
                if (e < 0) { d[k + 3] = 0; continue; }   // past the rounded corner: the back shows
                let c;
                const sc = ((X % 6) + 6) % 6, scal = 4 + (sc === 0 || sc === 5 ? 0 : 1);   // the scallops: one deeper in the middle of each six pixels
                if (u && eTop < scal + 1) {
                    if (eTop < 1) c = SL.out;
                    else if (eTop < 2) c = SL.top[1];
                    else if (eTop >= scal) c = SL.top[4];
                    else c = H(X, Y, 71) < 0.07 ? SL.top[4] : eTop < 3 ? SL.top[2] : SL.top[3];
                } else if (e < 1) c = SL.out;
                else if (e < 2 && (l || (u && rounded))) c = SL.side;
                else { const m = crackAt(X, Y); c = m === 3 ? SL.out : m === 2 ? SL.mo[1] : m === 1 ? SL.mo[0] : SL.body; }
                d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
            }
            wallImg.x.putImageData(wallImg.img, 0, 0); x.drawImage(wallImg.c, ppx, ppy);
        }

        function backPx(x, y) {
            // the face the tunnel was hewn from: big angular faces, dim and a little cool
            const F = cellsF(x, y), A = F.a, R = ROCK[toneOf(A, 521)];
            const S = cellsS(x, y), sx = H(S.a.cx, S.a.cy, 541) * 2 - 1, sy = H(S.a.cx, S.a.cy, 551) * 2 - 1;
            let t = 0.4 + (H(A.cx, A.cy, 561) - 0.5) * 0.12 - (sx * 0.55 + sy * 0.85) * 0.12;
            const rim = Math.max(0, 1 - F.e / 3), n = Math.hypot(F.dx, F.dy) || 1;
            t += -((F.dx / n) * 0.6 + (F.dy / n) * 0.8) * rim * 0.3;
            if (F.e < 0.8) t = 0.05; else if (S.e < 0.6) t -= 0.07;
            t += (vn(x, y, 4, 571) - 0.5) * 0.12 + (H(x, y, 581) - 0.5) * 0.06;
            // the picks' gouges: short strokes down to the right, in rows across a face
            const gx = Math.floor((x + y * 0.55) / 7), row = Math.floor(y / 10), along = (x + y * 0.55) - gx * 7, down = y - row * 10;
            if (H(gx, row, 591) < 0.4 && H(A.cx, A.cy, 601) < 0.7 && down > 1 && down < 8 - Math.floor(H(gx, row, 611) * 3)) { if (along < 0.9) t = 0.08; else if (along < 1.9) t += 0.16; }
            // an old drill hole
            const Dh = cellsD(x, y);
            if (H(Dh.a.cx, Dh.a.cy, 631) < 0.25) { if (Dh.r < 1.4) t = 0.02; else if (Dh.r < 2.2) t += Dh.dy < 0 ? -0.15 : 0.15; }
            // damp running down it
            const damp = vn(x / 3, y / 50, 1, 641); if (damp > 0.74) t -= (damp - 0.74) * 1.4;
            const c = at(R, t, x, y);
            return [c[0] * 0.62, c[1] * 0.62, c[2] * 0.66];
        }
        /* (21 Oct 2026, the owner's: "the play button is delayed and gameplay takes ages to load") the face behind
           depends only on where a pixel is, so it is made once, as big as the biggest passage asked for, and every
           passage is the top left of it: made a little at a time while the page is idle (a second's work for a big
           passage, all at once, when Play was pressed), and whatever is not made yet when it is wanted, then. */
        const BF = { W: 0, H: 0, c: null, d: null, rows: 0 };
        function backGrow(W, H) {
            if (W <= BF.W && H <= BF.H) return;
            const nW = Math.max(W, BF.W), nH = Math.max(H, BF.H), d = new Uint8ClampedArray(nW * nH * 4);
            // what is made already is kept (the same pixels: a pixel's colour is where it is)
            if (BF.d) for (let y = 0; y < Math.min(BF.rows, BF.H); y++) d.set(BF.d.subarray(y * BF.W * 4, (y + 1) * BF.W * 4), y * nW * 4);
            const keptW = BF.W, kept = BF.rows;
            Object.assign(BF, { W: nW, H: nH, d, c: null, rows: 0, keptW, kept });
        }
        function backRows(upTo) {
            for (; BF.rows < upTo; BF.rows++) {
                const y = BF.rows, from = y < BF.kept ? BF.keptW : 0;
                for (let X = from; X < BF.W; X++) { const c = backPx(X, y), k = (y * BF.W + X) * 4; BF.d[k] = c[0]; BF.d[k + 1] = c[1]; BF.d[k + 2] = c[2]; BF.d[k + 3] = 255; }
            }
        }
        function backFace(W, H) {
            backGrow(W, H); backRows(BF.H);
            if (!BF.c) { BF.c = document.createElement("canvas"); BF.c.width = BF.W; BF.c.height = BF.H; BF.c.getContext("2d").putImageData(new ImageData(BF.d, BF.W, BF.H), 0, 0); }
            return BF.c;
        }
        // made ahead while idle: as big as the biggest of the Mine's passages, if the levels are loaded
        if (typeof window !== "undefined" && window.requestIdleCallback) setTimeout(() => {
            const L = window.RatLevels; let W = 0, H = 0;
            if (L && L.zones) for (const z of L.zones) if (z.theme === "wood") for (const p of z.acts || []) { const w = p.w || (p.tiles && p.tiles[0] && p.tiles[0].length), h = p.h || (p.tiles && p.tiles.length); if (w && h) { W = Math.max(W, w * 16); H = Math.max(H, h * 16); } }
            if (!W || !H) return;
            backGrow(W, H);
            const step = dl => { while (BF.rows < BF.H && dl.timeRemaining() > 2) backRows(Math.min(BF.H, BF.rows + 8)); if (BF.rows < BF.H) requestIdleCallback(step); };
            requestIdleCallback(step);
        }, 1500);

        themes.wood = {
            // (the game's straight edge lines: none; the walls draw their own outline, round at the corners)
            edge: { out: "rgba(0,0,0,0)", lit: "rgba(0,0,0,0)", dark: "rgba(0,0,0,0)" },
            moss: false,
            wall: slateWall,
            shard: ["#7e89a2", "#353c50"],   // (21 Oct 2026) the blast's flying bits, the same slate
            // (21 Oct 2026) the rubble as fallen slabs of this slate (js/rat-race.js, FALLEN SLABS)
            slabRubble: { body: ["#2b3141", "#30374a", "#353c50"], rim: "#9aa5bd", rim2: "#626c86", rim3: "#4c556c", shade: "#1c1f2a", deep: "#14161e", out: "#04050a", crack: "#11131a", crackLit: "#46506a", gap: "#07080c" },
            lip() {}, under() {},
            back(x, a) {
                const W = a.w * 16, Hh = a.h * 16;
                x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(backFace(W, Hh), 0, 0, W, Hh, 0, 0, W, Hh); x.restore();
                // the roof of each room in shadow, where the lamps do not reach
                for (let ry = 0; ry * 14 < a.h; ry++) { const gr = x.createLinearGradient(0, ry * 224, 0, ry * 224 + 90); gr.addColorStop(0, "rgba(0,0,0,0.3)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, ry * 224, W, 90); }
            }
        };
    }

    /* ================================================================ 2. THE STONE QUARRY
       Out of the mine and into the quarry it fed: a hall cut out of the
       rock, its walls dressed limestone laid in courses, the face behind
       them quarried in bands with the drill marks still in it, wooden
       scaffolding up in front of that, plank walkways lashed on poles, oil
       lamps hung on iron hooks, cut blocks and barrows about the floor. */
    const Q = {
        out: "#2a2420",
        // the dressed limestone: its top edge, face, speckle, shade, the mortar
        hi: "#d6cab1", face: "#b0a38a", speck: "#a19479", speck2: "#bcb098", shade: "#8b7f6a", mortar: "#4d443a",
        // the quarry face behind: its bands, and the lines between them
        bands: ["#3d3229", "#45382d", "#4c3e31", "#3a2f27", "#42352a", "#4a3c2f"], seam: "#2a221c", ledge: "#5a4a3c", drill: "#2e251e", drillLit: "#55473a",
        // scaffold pine: outline, shade, body, light, highlight
        pd: "#1e150d", ps: "#4a331d", pm: "#6b4b2b", pl: "#8a6640", ph: "#a47c4e",
        // planks: top, edge, its grain, the seam
        kt: "#e0b982", ke: "#b88d58", kg: "#a07848", ks: "#5a3e22",
        // hemp lashings
        h1: "#ecd29a", h2: "#c9a160", h3: "#946d34", h4: "#5c3f19"
    };
    // The quarry's stones, each block one of these: lit, body, speckle, shade.
    const QT = [
        ["#d8ccb2", "#b4a68b", "#a29378", "#857a64"],
        ["#cfc2a4", "#a89a7c", "#968868", "#7a6e56"],
        ["#e0d4bc", "#c0b49a", "#ad9f84", "#8e8370"],
        ["#c8b896", "#a39070", "#907d5e", "#74654c"],
        ["#d2c8b4", "#aea28e", "#9a8e7a", "#7e7464"]
    ];
    // A world pixel's own small random number (the same every time).
    const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

    /* ---------------------------------------------------------------- OUT UNDER THE SKY
       (14 Oct 2026, the owner's: "a quarry isn't like a mine, it has large
       outdoor parts"). Where the game marks a cell out of doors (open to the
       sky all the way up), the quarry is a pit open to an afternoon sky: the
       sky in bands, as the old consoles drew it, the sun low in it, clouds
       drifting; far off, flat-topped hills in the haze; nearer, the benches
       of the quarry cut in steps, a derrick on the rim. Each a strip drawn
       once and slid behind at its own pace. The rock out in the open is the
       raw face, in its beds, sunlit, grass along the top; only where it
       lines a gallery, out of the sun, is it dressed stone in courses. */
    const SKY = ["#4677c0", "#5285c8", "#5f93d0", "#6ea2d8", "#80b1de", "#93bfe3", "#a9cce6", "#c0d8e6", "#d8e0de", "#ecdcc4", "#f4d6ae"];
    const ROCK = [["#e2cfa6", "#d3bd90", "#c2aa7e", "#a28a62"], ["#d9c49a", "#c8b086", "#b89e74", "#977f58"], ["#e6d6b2", "#d6c49c", "#c4b088", "#a48e68"], ["#d0b88c", "#bea47a", "#ac926a", "#8c7452"], ["#dccbaa", "#ccb894", "#baa482", "#9a8664"]];
    const GRASS = ["#3e5a1e", "#5a7c26", "#7a9c34", "#9cbc48", "#c4cc6a", "#d8c070"];
    const skyCache = new Map();
    function strip(w, h, paint) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.imageSmoothingEnabled = false; paint(x); return c; }
    function skyStrips() {
        if (skyCache.has("q")) return skyCache.get("q");
        const W = 640;
        // the far hills: flat tops and stepped shoulders, in haze
        const far = strip(W, 70, x => {
            let y = 40, run = 0;
            for (let px = 0; px < W; px++) {
                if (run <= 0) { const hs = hash2(px, 77); run = 20 + Math.floor(hs * 70); const target = 14 + Math.floor(hash2(px, 78) * 34); y = y + Math.sign(target - y) * Math.min(Math.abs(target - y), 6 + Math.floor(hs * 8)); }
                run--;
                // wrap smoothly: the last 40 pixels ease back to the first column's height
                const yy = px > W - 40 ? Math.round(y + (40 - y) * (px - (W - 40)) / 40) : y;
                x.fillStyle = "#b2c2d2"; x.fillRect(px, yy, 1, 1);
                x.fillStyle = "#9fb2c6"; x.fillRect(px, yy + 1, 1, 70);
                if (hash2(px, yy) < 0.18) { x.fillStyle = "#93a7bc"; x.fillRect(px, yy + 3 + Math.floor(hash2(px, 5) * 20), 1, 2); }
            }
            x.fillStyle = "rgba(220,226,222,0.35)"; x.fillRect(0, 52, W, 18);
        });
        // the quarry's far wall: benches cut in level steps, each a sunlit tread and a face in shadow with the drill lines down it; a derrick, cypresses on the rim
        const mid = strip(W, 110, x => {
            // the rim: level runs, stepping up and down
            const rim = new Int32Array(W); let r = 18, run = 0;
            for (let px = 0; px < W; px++) { if (run <= 0) { run = 30 + Math.floor(hash2(px, 61) * 60); r = 12 + Math.floor(hash2(px, 62) * 3) * 6; } run--; rim[px] = px > W - 30 ? Math.round(r + (rim[0] - r) * (px - (W - 30)) / 30) : r; }
            if (!rim[0]) rim[0] = 18;
            for (let px = 0; px < W; px++) {
                for (let y = rim[px]; y < 110; y++) {
                    const k = Math.floor(y / 12), inB = y % 12;
                    // each bench's edge a little ragged
                    const rag = Math.floor(hash2(px >> 2, k * 7) * 2);
                    let c;
                    if (y - rim[px] < 2) c = "#e4dac2";
                    else if (inB < 2 + rag) c = "#dcd0b4";
                    else if (inB === 2 + rag) c = "#9e927c";
                    else c = (px + k * 3) % 6 === 0 ? "#aea38c" : inB > 9 ? "#b0a58e" : "#bdb29a";
                    if (inB > 2 + rag && hash2(px, y >> 2) < 0.03) c = "#a2977f";
                    x.fillStyle = c; x.fillRect(px, y, 1, 1);
                }
                if (hash2(px, 3) < 0.3) { x.fillStyle = "#8c9a62"; x.fillRect(px, rim[px] - 1, 1, 1); }
            }
            // cypresses on the rim
            for (const cx of [70, 96, 300, 318, 470]) { const t = rim[cx]; for (let i = 0; i < 16; i++) { const wdt = Math.max(1, Math.round(Math.sin(i / 16 * Math.PI) * 3)); x.fillStyle = i % 3 ? "#6a7c56" : "#5a6c48"; x.fillRect(cx - wdt, t - 16 + i, wdt * 2 + 1, 1); } }
            // a derrick on the rim: two legs, a jib, a block on its rope
            const dx = 200, dt = rim[dx];
            x.fillStyle = "#6e5a40";
            for (let i = 0; i < 30; i++) { x.fillRect(dx - Math.round(i * 0.2), dt - i, 1, 1); x.fillRect(dx + 6 - Math.round(i * 0.2), dt - i, 1, 1); }
            for (let i = 0; i < 38; i++) x.fillRect(dx - 4 + i, dt - 28 + Math.round(i * 0.3), 1, 1);
            x.fillStyle = "#5a4a34"; for (let i = 0; i < 16; i++) x.fillRect(dx + 32, dt - 16 + i, 1, 1);
            x.fillStyle = "#cfc6ae"; x.fillRect(dx + 29, dt, 7, 5); x.fillStyle = "#9e927c"; x.fillRect(dx + 29, dt + 4, 7, 1);
            // the haze of distance over it all
            x.fillStyle = "rgba(176,196,220,0.32)"; x.fillRect(0, 0, W, 110);
        });
        // clouds: puffs in white with a lavender belly
        const clouds = strip(W, 60, x => {
            for (const [cx, cy, n] of [[40, 18, 5], [210, 30, 4], [380, 12, 6], [520, 34, 3]]) {
                for (let i = 0; i < n; i++) {
                    const bx = cx + i * 9 + Math.floor(hash2(cx, i) * 5), r = 6 + Math.floor(hash2(i, cx) * 6), by = cy - Math.floor(r / 2);
                    for (let dy = -r; dy <= r; dy++) { const w2 = Math.round(Math.sqrt(r * r - dy * dy) * 1.4); if (dy > r * 0.45) continue; x.fillStyle = dy > r * 0.15 ? "#d4dcee" : dy < -r * 0.5 ? "#ffffff" : "#f2f6fc"; x.fillRect(bx - w2, by + dy, w2 * 2 + 1, 1); }
                }
                x.fillStyle = "#c4cce4"; x.fillRect(cx - 8, cy + 1, n * 9 + 14, 1);
            }
        });
        /* THE PIT'S OWN WALLS, deeper down (14 Oct 2026): the benches nearer and
           taller, cut in steps of 24; each a lit tread, a dark lip under it, a
           face going darker toward its foot with the drill grooves down it;
           the edges broken here and there, a fallen block, a ladder up a
           face, scrub. Less haze than the far wall: it is closer. */
        const deep = strip(W, 96, x => {
            for (let px = 0; px < W; px++) {
                for (let y = 0; y < 96; y++) {
                    const k = Math.floor(y / 24), inB = y % 24;
                    const brk = hash2(px >> 3, k * 11) < 0.2 ? 1 : 0;   // a broken edge: the tread a pixel lower
                    let c;
                    if (inB < 2 + brk) c = inB === 0 ? "#e2d4b0" : "#d4c49c";
                    else if (inB === 2 + brk) c = "#7c6a4e";
                    else {
                        const t = (inB - 3) / 21;
                        const base = t < 0.3 ? "#c4b28c" : t < 0.65 ? "#b8a580" : "#a99674";
                        c = base;
                        const groove = (px + k * 5) % 7;
                        if (groove === 0) c = t < 0.5 ? "#a8956f" : "#9a8764";
                        else if (groove === 1) c = t < 0.5 ? "#d0bf98" : "#bdab86";
                        if (hash2(px, y) < 0.025) c = "#8e7c5c";
                    }
                    x.fillStyle = c; x.fillRect(px, y, 1, 1);
                }
            }
            // fallen blocks on the treads, a ladder up a face, scrub on the edges
            for (let i = 0; i < 9; i++) { const bx = Math.floor(hash2(i, 5) * (W - 12)), k = Math.floor(hash2(i, 6) * 4), by = k * 24 - 6; if (by < 0) continue; x.fillStyle = "#6e5e44"; x.fillRect(bx, by, 9, 6); x.fillStyle = "#d8c8a4"; x.fillRect(bx + 1, by + 1, 7, 1); x.fillStyle = "#bfae8a"; x.fillRect(bx + 1, by + 2, 7, 3); }
            for (const lx of [118, 402]) { x.fillStyle = "#6a5236"; x.fillRect(lx, 27, 1, 21); x.fillRect(lx + 4, 27, 1, 21); for (let yy = 29; yy < 48; yy += 4) x.fillRect(lx, yy, 5, 1); }
            for (let px = 0; px < W; px++) if (hash2(px, 77) < 0.12) { const k = Math.floor(hash2(px, 78) * 4); x.fillStyle = "#7d9050"; x.fillRect(px, k * 24 - 1, 1, 1); }
            x.fillStyle = "rgba(176,196,220,0.14)"; x.fillRect(0, 0, W, 96);
        });
        const out = { far, mid, clouds, deep, W };
        skyCache.set("q", out);
        return out;
    }
    // where the land meets the sky, the passage over: the row most columns' first rock is on
    function horizonOf(a) {
        if (a._horizon !== undefined) return a._horizon;
        const firsts = [];
        for (let x = 0; x < a.w; x++) { let y = 0; while (y < a.h && a.skyMask[y * a.w + x]) y++; if (y > 0 && y < a.h) firsts.push(y); }
        firsts.sort((p, q) => p - q);
        a._horizon = (firsts.length ? firsts[Math.floor(firsts.length * 0.3)] : 10) * 16;
        return a._horizon;
    }
    // is a wall tile the lining of a gallery (open, roofed air beside it), or the raw rock out in the open?
    function lining(a, tx, ty) {
        if (!a.skyMask) return true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = tx + dx, ny = ty + dy;
            if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h) continue;
            const c = a.tiles[ny][nx];
            if (c !== "#" && c !== "%" && c !== "X" && !a.skyMask[ny * a.w + nx]) return true;
        }
        return false;
    }
    // the beds of the raw rock: their heights down the whole map, the same every time
    const strata = [];
    function bedAt(wy) {
        while (strata.length <= wy) { const b = strata.length ? strata[strata.length - 1].b + 1 : 0, hgt = 5 + Math.floor(hash2(b, 41) * 8); for (let i = 0; i < hgt; i++) strata.push({ b, off: i, hgt }); }
        return strata[wy];
    }

    themes.quarry = {
        key: "quarry",
        sky(g, cam, a, h) {
            const S = skyStrips(), hz = horizonOf(a);
            // where the rim's ground is on the screen; the far things move less than it, up and down as across
            const ground = hz - cam.y;
            const midY = Math.round(ground * 0.5 + 34), farY = Math.round(ground * 0.3 + 66), skyEnd = farY + 44;
            const bandH = 10, top = skyEnd - SKY.length * bandH;
            for (let y = 0; y < Math.min(h.VH, skyEnd + 70); y++) {
                const k = Math.floor((y - top) / bandH), i = Math.max(0, Math.min(SKY.length - 1, k));
                const edge = (y - top) % bandH === 0 && k > 0 && k < SKY.length;
                g.fillStyle = SKY[i];
                if (edge) { for (let x2 = 0; x2 < h.VW; x2 += 2) g.fillRect(x2 + (y % 2), y, 1, 1); g.fillStyle = SKY[i - 1]; for (let x2 = 1; x2 < h.VW; x2 += 2) g.fillRect(x2 - (y % 2), y, 1, 1); }
                else g.fillRect(0, y, h.VW, 1);
            }
            // the sun, low, and its rings
            const sx = 236 - Math.round(cam.x * 0.02) % 40, sy = farY - 30;
            for (const [r, c] of [[19, "rgba(255,236,190,0.18)"], [15, "rgba(255,236,190,0.28)"], [11, "#fff3d0"], [9, "#fffaea"]]) { g.fillStyle = c; for (let dy = -r; dy <= r; dy++) { const w2 = Math.round(Math.sqrt(r * r - dy * dy)); g.fillRect(sx - w2, sy + dy, w2 * 2 + 1, 1); } }
            const slide = (img, kx, y, drift) => { const off = ((Math.round(cam.x * kx + drift) % S.W) + S.W) % S.W; for (let x2 = -off; x2 < h.VW; x2 += S.W) g.drawImage(img, x2, y); };
            slide(S.clouds, 0.06, farY - 110, h.frameNo * 0.04);
            slide(S.far, 0.15, farY, 0);
            slide(S.mid, 0.4, midY, 0);
            // below the strip, the benches go on down: the strip's lower steps, again and again
            // under the far wall, the pit's own walls, nearer (they slide a little faster), darker the deeper they go
            let n = 0;
            for (let y = midY + 110; y < h.VH; y += 96, n++) {
                const off = ((Math.round(cam.x * 0.5 + n * 173) % S.W) + S.W) % S.W;
                for (let x2 = -off; x2 < h.VW; x2 += S.W) g.drawImage(S.deep, x2, y);
                if (n > 0) { g.fillStyle = "rgba(40,28,14," + Math.min(0.3, n * 0.08).toFixed(2) + ")"; g.fillRect(0, y, h.VW, 96); }
            }
        },
        /* THE RAW ROCK, out in the open: limestone in its beds, each bed its
           own tone, a dark parting and a lit lip where one bed lies on the
           next; joints running down through a bed here and there; the half
           round grooves the drills left on some; speckled. */
        rock(x, a, tx, ty, px, py) {
            for (let j = 0; j < 16; j++) {
                const wy = ty * 16 + j, bed = bedAt(wy), tone = ROCK[Math.floor(hash2(bed.b, 17) * ROCK.length)];
                const drilled = hash2(bed.b, 23) < 0.12;
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i;
                    let c = tone[1];
                    if (bed.off === 0) c = tone[3];
                    else if (bed.off === 1) c = tone[0];
                    else if (bed.off === bed.hgt - 1) c = tone[2];
                    else {
                        const sp = hash2(wx, wy);
                        c = sp < 0.1 ? tone[2] : sp > 0.95 ? tone[0] : tone[1];
                        if (drilled) { const at = (wx + bed.b * 5) % 11; if (at === 0) c = tone[3]; else if (at === 1) c = tone[2]; else if (at === 2) c = tone[0]; }
                    }
                    // a joint down through the bed
                    const jx = Math.floor(hash2(bed.b, 29) * 37);
                    const lean = bed.off >> 1;   // a joint wanders as it goes down the bed
                    if (bed.off > 0 && (wx + jx + lean) % 61 === 0 && hash2(Math.floor((wx + jx + lean) / 61), bed.b) < 0.35) c = tone[3];
                    if (bed.off > 0 && (wx + jx + lean) % 61 === 1 && hash2(Math.floor((wx + jx + lean - 1) / 61), bed.b) < 0.35) c = tone[0];
                    x.fillStyle = c; x.fillRect(px + i, py + j, 1, 1);
                }
            }
        },
        timber: { d: Q.pd, s: Q.ps, m: Q.pm, l: Q.pl, q: Q.pl },
        edge: { out: Q.out, lit: Q.hi, dark: "#6e6352" },
        moss: false, embers: false, soot: true,
        glow: [255, 200, 110], air: [235, 220, 190],
        pushV: 0.42,   // a block of stone is heavier than a crate
        stones: [["#6e6352", "#8e826e", "#b0a38b"], ["#5e544a", "#7e7262", "#a09480"], ["#7a6450", "#9a8268", "#bca488"]],
        dirt: ["#2c241d", "#3e3328"],
        // the lamp: hung lower on its hook, the flame inside the glass
        lampAt: { bx: 1, by: -4, fx: 8, fy: 9, gx: 9, gy: 11 },

        /* THE WALLS (13 Oct 2026, laid again: "proper alignment as if they've
           actually been placed properly the way a brick wall traditionally is
           ... colours should vary more, less uniform in shape ... weathered,
           particularly on the corners"). Dressed stone in courses eight
           pixels deep, in running bond: each course's joints half a block
           along from the one below, every joint nudged a pixel or two so no
           two blocks are quite the same length. Each block its own stone,
           from five tones; lit along its top and left, in shadow along its
           foot and right; its corners worn round, and chipped; pitted, a
           crack across some, grime along the foot of others. Per pixel
           across the whole map. */
        wall(x, a, tx, ty, px, py, h) {
            if (!lining(a, tx, ty)) { this.rock(x, a, tx, ty, px, py); return; }
            const BL = 24;
            const joint = (cy, n) => n * BL + (cy % 2) * (BL / 2) + Math.round((hash2(cy * 7 + 3, n) - 0.5) * 5);
            for (let k = 0; k < 2; k++) {
                const cy = ty * 2 + k, y0 = py + k * 8;
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i;
                    let n = Math.floor((wx - (cy % 2) * (BL / 2)) / BL) + 1;
                    while (joint(cy, n) > wx) n--;
                    while (joint(cy, n + 1) <= wx) n++;
                    const along = wx - joint(cy, n), len = joint(cy, n + 1) - joint(cy, n);
                    const id = hash2(n * 13 + 5, cy * 3 + 1), tone = QT[Math.floor(id * QT.length)];
                    const cr = hash2(n, cy * 11), cracked = cr < 0.16, grimy = hash2(n * 3, cy) < 0.3;
                    // how worn each corner is (0 sharp .. 2 well worn)
                    const wear = c => Math.floor(hash2(n * 4 + c, cy * 5) * 3);
                    const wTL = wear(0), wTR = wear(1), wBL = wear(2), wBR = wear(3);
                    for (let r = 0; r < 8; r++) {
                        let c;
                        const last = len - 1, foot = 6;
                        if (r === 7 || along === 0) c = Q.mortar;
                        else if ((r - 0) + (along - 1) < wTL || (r - 0) + (last - along) < wTR || (foot - r) + (along - 1) < wBL || (foot - r) + (last - along) < wBR) c = Q.mortar;   // a worn corner
                        else if (r === 0 || along === 1) c = tone[0];
                        else if (r === foot || along === last) c = tone[3];
                        else {
                            const sp = hash2(wx, cy * 8 + r);
                            c = sp < 0.12 ? tone[2] : sp > 0.94 ? tone[0] : tone[1];
                            if (sp < 0.018) c = Q.mortar;                                                        // a pit
                            if (grimy && r >= 4) c = sp < 0.5 ? tone[2] : tone[3];
                            if (cracked && Math.abs((along - 2) - Math.round((r - 1) * (1.5 + cr * 6))) === 0 && along < last - 1) c = tone[3];
                        }
                        // the edges chipped here and there
                        if ((r === 0 || r === foot) && along > 1 && along < last && hash2(wx, cy * 2 + r) < 0.09) c = Q.mortar;
                        x.fillStyle = c; x.fillRect(px + i, y0 + r, 1, 1);
                    }
                }
            }
        },
        // The top of a wall where nothing is on it: worn pale, a pebble or two.
        lip(x, a, tx, ty, px, py, h) {
            // out in the open: a skin of earth and grass, tufts standing up into the air, a flower now and then
            if (a.skyMask && ty > 0 && a.skyMask[(ty - 1) * a.w + tx] && !lining(a, tx, ty)) {
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i, hs = hash2(wx, ty * 7);
                    x.fillStyle = "#4a3a22"; x.fillRect(px + i, py + 3, 1, 1);
                    x.fillStyle = hs < 0.5 ? GRASS[1] : GRASS[2]; x.fillRect(px + i, py + 1, 1, 2);
                    x.fillStyle = hs < 0.3 ? GRASS[3] : GRASS[2]; x.fillRect(px + i, py, 1, 1);
                    if (hs < 0.22) x.fillStyle = "#6a5636", x.fillRect(px + i, py + 4, 1, 1);
                    const tall = hs > 0.62 ? 1 + Math.floor((hs - 0.62) * 9) : 0;
                    for (let k = 1; k <= tall; k++) { x.fillStyle = k === tall ? (hs > 0.9 ? GRASS[5] : GRASS[4]) : GRASS[3]; x.fillRect(px + i + (k > 2 && hs > 0.8 ? 1 : 0), py - k, 1, 1); }
                    if (hs > 0.985) { x.fillStyle = "#ffffff"; x.fillRect(px + i, py - tall - 1, 1, 1); x.fillStyle = "#f0d040"; x.fillRect(px + i, py - tall, 1, 1); }
                }
                return;
            }
            x.fillStyle = Q.out; x.fillRect(px, py, 16, 1);
            x.fillStyle = "#e6dcc6"; x.fillRect(px, py + 1, 16, 1);
            x.fillStyle = Q.hi; x.fillRect(px, py + 2, 16, 1);
            x.fillStyle = Q.face; x.fillRect(px, py + 3, 16, 1);
            x.fillStyle = Q.shade; x.fillRect(px, py + 4, 16, 1);
            const hs = hash2(tx * 3, ty * 5);
            if (hs < 0.4) {
                const mx = px + 2 + Math.floor(hs * 31) % 11;
                x.fillStyle = Q.out; x.fillRect(mx, py - 2, 3, 2); x.fillRect(mx - 1, py - 1, 1, 1); x.fillRect(mx + 3, py - 1, 1, 1);
                x.fillStyle = Q.speck2; x.fillRect(mx, py - 1, 3, 1); x.fillStyle = Q.hi; x.fillRect(mx, py - 1, 1, 1);
            }
        },

        /* THE QUARRY FACE behind: the rock in bands, as it was laid down, a
           dark line and a lit ledge where one band meets the next; down
           each band the grooves the drills left, a lit edge beside each;
           the dressed rock speckled. One picture for the whole map, worked
           out pixel by pixel. */
        back(x, a, h) {
            const W = a.w * 16, H = a.h * 16;
            const img = x.createImageData(W, H), d = img.data;
            // the bands: their heights, top to bottom, the same every time
            const bandAt = new Int32Array(H), bandTop = new Int32Array(H);
            let y = 0, b = 0;
            while (y < H) { const hgt = 9 + Math.floor(hash2(b, 31) * 10); for (let i = 0; i < hgt && y + i < H; i++) { bandAt[y + i] = b; bandTop[y + i] = y; } y += hgt; b++; }
            const cols = Q.bands.map(rgb), seam = rgb(Q.seam), ledge = rgb(Q.ledge), drill = rgb(Q.drill), drillLit = rgb(Q.drillLit);
            for (let py = 0; py < H; py++) {
                const band = bandAt[py], top = bandTop[py], off = py - top;
                const base = cols[band % cols.length];
                const lean = Math.floor(hash2(band, 5) * 3) - 1;   // the band's drill grooves slant a little, or not
                for (let px = 0; px < W; px++) {
                    let c = base;
                    if (off === 0) c = seam;
                    else if (off === 1) c = ledge;
                    else {
                        const gx = px + Math.floor(off * lean / 6);
                        const slot = Math.floor(gx / 9), at = gx % 9;
                        const grooved = hash2(slot, band * 7 + 3) < 0.45 && off >= 2 && off <= 2 + 4 + Math.floor(hash2(slot, band) * 6);
                        if (grooved && at === 4) c = drill;
                        else if (grooved && at === 5) c = drillLit;
                        else {
                            const n = hash2(px, py);
                            if (n < 0.06) c = seam; else if (n > 0.95) c = ledge;
                        }
                    }
                    const i = (py * W + px) * 4;
                    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
                }
            }
            x.putImageData(img, 0, 0);
            // a little darker up high, where the lamps do not reach
            for (let ry = 0; ry * 14 < a.h; ry++) { const gr = x.createLinearGradient(0, ry * 224, 0, ry * 224 + 90); gr.addColorStop(0, "rgba(0,0,0,0.28)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, ry * 224, W, 90); }
        },

        /* THE SCAFFOLDING in front of the face: a round pole standing every
           ten tiles, floor to roof, its bark ringed; a pole across each room
           a quarter of the way down, lashed to the uprights with hemp; a
           thinner pole braced from each upright up to the cross-pole. In
           shadow, behind everything Scout touches. */
        /* (14 Oct 2026, the level editor) The frame is a list of parts kept
           in the level, so each can be moved, cut short or taken away:
           { type: "post", x, y, h, braces } an upright, { type: "rail", x, y, w }
           a cross-pole. frameParts(a) is the old layout, every ten tiles and
           a pole across each room, which "Generate frame" puts back. */
        frameW: { post: 7, rail: 6 },
        frameParts(a) {
            const out = [], W = a.w * 16, H = a.h * 16;
            for (let tx = 6; tx < a.w; tx += 10) out.push({ type: "post", x: tx * 16 - 1, y: 0, h: H, braces: true });
            for (let ty = 4; ty < a.h; ty += 14) out.push({ type: "rail", x: 0, y: ty * 16 + 5, w: W });
            return out;
        },
        frame(x, a, h, parts) {
            const fill = (c, X, Y, w2, h2) => { x.fillStyle = c; x.fillRect(X, Y, w2, h2); };
            const poles = parts.filter(p => p.type === "post"), bars = parts.filter(p => p.type === "rail");
            const meet = (p, r) => r.x <= p.x && r.x + r.w >= p.x + 7 && p.y <= r.y && p.y + p.h >= r.y + 6;
            // braces: thin poles from low on each upright up to the cross-pole
            for (const p of poles) if (p.braces !== false) for (const r of bars) if (meet(p, r)) for (const side of [1, -1]) {
                for (let i = 0; i < 40; i++) {
                    const X = side > 0 ? p.x + 8 + i : p.x - 2 - i, Y = r.y + 6 + 40 - i;
                    fill(Q.pd, X, Y - 1, 1, 1); fill(Q.pl, X, Y, 1, 1); fill(Q.pm, X, Y + 1, 1, 1); fill(Q.pd, X, Y + 2, 1, 1);
                }
            }
            for (const pp of poles) {
                const p = pp.x, y0 = pp.y, H = pp.h;
                fill(Q.pd, p, y0, 1, H); fill(Q.pl, p + 1, y0, 1, H); fill(Q.ph, p + 2, y0, 1, H); fill(Q.pm, p + 3, y0, 2, H); fill(Q.ps, p + 5, y0, 1, H); fill(Q.pd, p + 6, y0, 1, H);
                // bark rings and knots down the pole
                for (let y = y0; y < y0 + H; y += 6) { const hs = hash2(p, y); if (hs < 0.35) fill(Q.ps, p + 1, y + Math.floor(hs * 6), 5, 1); else if (hs > 0.9) { fill(Q.pd, p + 3, y + 2, 2, 2); } }
            }
            for (const rr of bars) {
                const r = rr.y, x0 = rr.x, W = rr.w;
                fill(Q.pd, x0, r, W, 1); fill(Q.ph, x0, r + 1, W, 1); fill(Q.pl, x0, r + 2, W, 1); fill(Q.pm, x0, r + 3, W, 1); fill(Q.ps, x0, r + 4, W, 1); fill(Q.pd, x0, r + 5, W, 1);
                for (let X = x0; X < x0 + W; X += 5) { const hs = hash2(X, r); if (hs < 0.3) fill(Q.ps, X + Math.floor(hs * 10), r + 2, 1, 2); }
                x.fillStyle = "rgba(0,0,0,0.3)"; x.fillRect(x0, r + 6, W, 2);
                // the lashing where the cross-pole meets each upright
                for (const pp of poles) {
                    if (!meet(pp, rr)) continue;
                    const p = pp.x;
                    for (let i = 0; i < 9; i++) { fill(i % 2 ? Q.h3 : Q.h2, p - 1 + i, r - 1, 1, 8); }
                    fill(Q.h4, p - 1, r - 1, 9, 1); fill(Q.h4, p - 1, r + 6, 9, 1); fill(Q.h1, p, r, 1, 6);
                }
            }
        },

        /* A WALKWAY (the quarry's platforms): a thick plank on edge, pale on
           top where boots wear it, its grain along it and a seam where two
           planks butt; under it a round ledger pole, set back from the
           ends; a hemp lashing round plank and pole every so often, or the
           iron of a chain's shackle where it hangs. Eleven pixels deep, as
           the Wood's. */
        platform(x, X, Y, W, o, h) {
            const seed = o.seed || 0;
            const fill = (c, x0, y0, w2, h2) => { x.fillStyle = c; x.fillRect(x0, y0, w2, h2); };
            const bx0 = X + (o.left ? 0 : 4), bx1 = X + W - (o.right ? 0 : 4);
            // the ledger pole
            fill(Q.pd, bx0, Y + 5, bx1 - bx0, 6);
            fill(Q.pl, bx0, Y + 6, bx1 - bx0, 1); fill(Q.pm, bx0, Y + 7, bx1 - bx0, 2); fill(Q.ps, bx0, Y + 9, bx1 - bx0, 1);
            // the plank
            fill(Q.pd, X, Y, W, 6);
            fill(Q.kt, X + 1, Y + 1, W - 2, 1);
            fill(Q.ke, X + 1, Y + 2, W - 2, 3);
            for (let i = 2; i < W - 4; i += 3) { const hs = hash2(seed * 17 + i, 3); if (hs < 0.32) fill(Q.kg, X + i, Y + 2 + (hs < 0.16 ? 1 : 2), Math.min(2 + Math.floor(hs * 14), W - 3 - i), 1); }
            const step = 40 + Math.floor(hash2(seed, 9) * 14);
            for (let j = 18 + Math.floor(hash2(seed, 5) * 14); j < W - 10; j += step) { fill(Q.ks, X + j, Y + 1, 1, 4); fill(Q.kt, X + j + 1, Y + 1, 1, 1); }
            // end grain where a plank is cut
            for (const [ex, free] of [[X, !o.left], [X + W - 4, !o.right]]) { if (!free) continue; fill(Q.pd, ex, Y, 4, 6); fill(Q.ke, ex + 1, Y + 1, 2, 4); fill(Q.kg, ex + 1, Y + 2, 2, 1); }
            // lashings (or a chain's shackle where it hangs on chains)
            const ties = spread(W, 32, 4);
            for (const sx of ties) {
                const SX = X + sx;
                if (SX < bx0 + 1 || SX + 4 > bx1 - 1) continue;
                if (o.hung && o.run && o.run.held === "chains") { fill("#23232b", SX, Y, 4, 11); fill("#74748a", SX + 1, Y + 1, 2, 9); fill("#b2b2c4", SX + 1, Y + 2, 1, 1); continue; }
                for (let i = 0; i < 4; i++) fill(i % 2 ? Q.h3 : Q.h2, SX + i, Y, 1, 11);
                fill(Q.h4, SX, Y, 4, 1); fill(Q.h4, SX, Y + 10, 4, 1); fill(Q.h1, SX, Y + 1, 1, 9);
            }
        },

        /* THE MOVING PLATFORMS: a walkway slung on ropes. One that travels
           across hangs from a trolley running on a cable stretched under
           the roof the length of its run; one that goes up and down hangs
           from a pulley block under the roof. */
        mover(g, m, a, h) {
            const fill = (c, x0, y0, w2, h2) => { g.fillStyle = c; g.fillRect(Math.round(x0), Math.round(y0), w2, h2); };
            if (m.ceil === undefined) {
                // the roof over the run: the lowest solid above it
                let ty = Math.floor((m.kind === "h" ? m.y : m.y0) / 16) - 1;
                const col = m.kind === "h" ? m.tx + 1 : m.tx + 1;
                while (ty > 0 && h.tileAtIn(a, col, ty) !== "#") ty--;
                m.ceil = (ty + 1) * 16;
                /* OUT UNDER THE SKY (14 Oct 2026) there is no roof to hang from: a
                   cable stretched between two timber towers, or a hoist's headframe */
                const ry = Math.floor((m.kind === "h" ? m.y : m.y0) / 16) - 1;
                m.open = Boolean(a.skyMask && ry >= 0 && a.skyMask[ry * a.w + m.tx + 1] && (m.kind === "h" ? m.y : m.y0) - m.ceil > 8 * 16);
                if (m.open) m.ceil = (m.kind === "h" ? m.y : m.y0) - (m.kind === "h" ? 54 : 30);
            }
            const X = Math.round(m.x), Y = Math.round(m.y), top = m.ceil;
            // a timber post: outline, lit side, body, shade
            const post = (px, y0, y1) => { fill(Q.pd, px, y0, 6, y1 - y0); fill(Q.pl, px + 1, y0 + 1, 1, y1 - y0 - 1); fill(Q.pm, px + 2, y0 + 1, 2, y1 - y0 - 1); fill(Q.ps, px + 4, y0 + 1, 1, y1 - y0 - 1); };
            if (m.open && m.kind === "h") {
                // the towers at either end of the cable, braced, their feet in the rock
                for (const tx of [m.x0 - 4, m.x1 + 46]) { post(tx, top - 4, m.y + 18); for (let i = 0; i < 14; i++) { fill(Q.pd, tx + (tx < m.x0 ? -1 - i : 6 + i), top + 10 + i * 2, 2, 2); fill(Q.pm, tx + (tx < m.x0 ? -1 - i : 6 + i), top + 10 + i * 2, 1, 1); } fill(Q.pd, tx - 2, top - 5, 10, 3); fill(Q.pl, tx - 1, top - 4, 8, 1); }
            }
            if (m.open && m.kind === "v") {
                // the headframe: two guide posts the height of its travel, a beam across their tops, the pulley under it
                const gy0 = m.ceil - 6, gy1 = m.y1 + 16;
                post(m.x - 7, gy0, gy1); post(m.x + m.w + 1, gy0, gy1);
                fill(Q.pd, m.x - 9, gy0 - 4, m.w + 18, 6); fill(Q.ph, m.x - 8, gy0 - 3, m.w + 16, 1); fill(Q.pm, m.x - 8, gy0 - 2, m.w + 16, 3);
                for (let yy = gy0 + 12; yy < gy1; yy += 24) { fill(Q.pd, m.x - 8, yy, 8, 2); fill(Q.pd, m.x + m.w, yy, 8, 2); }
            }
            const rope = (x0, y0, y1) => { for (let yy = Math.round(y0); yy < y1; yy++) { const tw = (yy >> 1) % 2; fill(tw ? Q.h2 : Q.h3, x0, yy, 1, 1); fill(tw ? Q.h3 : Q.h1, x0 + 1, yy, 1, 1); } };
            if (m.kind === "h") {
                // the cable, end to end of the run, and its anchors
                const c0 = m.x0 + 6, c1 = m.x1 + 42;
                fill("#2a2a32", c0, top + 3, c1 - c0, 1); fill("#6a6a78", c0, top + 2, c1 - c0, 1);
                for (const cx of [c0 - 2, c1]) { fill("#23232b", cx, top, 3, 6); fill("#74748a", cx + 1, top + 1, 1, 1); }
                for (const rx of [X + 6, X + 41]) {
                    rope(rx, top + 6, Y + 1);
                    // the trolley's wheel on the cable
                    fill("#23232b", rx - 2, top, 6, 6); fill("#74748a", rx - 1, top + 1, 4, 4); fill("#b2b2c4", rx, top + 2, 1, 1); fill("#23232b", rx, top + 3, 2, 1);
                }
            } else {
                // a bridle from both ends to a ring, one rope up to the pulley
                const cx = X + 24, ringY = Math.max(top + 14, Y - 18);
                for (let i = 0; i <= 18; i++) { const t = i / 18; fill(Q.h3, X + 4 + (cx - X - 4) * t, Y - (Y - ringY) * t, 1, 1); fill(Q.h3, X + 44 + (cx - X - 44) * t, Y - (Y - ringY) * t, 1, 1); }
                rope(cx - 1, top + 8, ringY);
                fill("#23232b", cx - 2, ringY - 1, 4, 3); fill("#b2b2c4", cx - 1, ringY, 1, 1);
                // the pulley block under the roof
                fill(Q.pd, cx - 6, top, 12, 9); fill(Q.pm, cx - 5, top + 1, 10, 7); fill(Q.pl, cx - 5, top + 1, 10, 1);
                fill("#23232b", cx - 4, top + 3, 8, 5); fill("#74748a", cx - 3, top + 4, 6, 3); fill("#b2b2c4", cx - 1, top + 5, 2, 1);
            }
            this.platform(g, X, Y, 48, { seed: m.tx * 7 + m.ty, left: false, right: false }, h);
        },
        /* PROPS (13 Oct 2026, again: "piles of stone, with rubble around ...
           we can reuse basic things like barrels and crates"): a weathered
           block or two, a heap of broken stone, rubble round them; the tools
           leant against the wall; a barrel or a crate. Darkened a shade. */
        props(x, a, h, spots) {
            for (const sp of spots) {
                const { px, py, tx, ty, hv } = sp;
                const kind = Math.floor(hv * 1000) % 5;
                const D = img => h.dim(h.spr(img, 0));
                if (kind === 0) { x.drawImage(D("qblock"), px, py); if (hash2(tx, ty * 9) < 0.4 && a.tiles[ty - 1][tx] === "." && a.tiles[ty - 2] && a.tiles[ty - 2][tx] === ".") x.drawImage(D("qblock"), px + 2, py - 13); x.drawImage(D("rubble"), px + 10, py + 9); }
                else if (kind === 1) { x.drawImage(D("qpile"), px - 4, py + 4); }
                else if (kind === 2) { x.drawImage(D("qpick"), px - 2, py - 4); x.drawImage(D("qshovel"), px + 8, py - 4); }
                else if (kind === 3) { x.drawImage(D("barrel"), px + 2, py + 2); x.drawImage(D("qsledge"), px + 10, py + 7); }
                else x.drawImage(h.dim(h.wood("crate")), px, py);
            }
        },
        /* A STONE BLOCK in the way (a map's 2: solid, to jump on or climb):
           a weathered cut block, its own stone, rubble at its foot. */
        block(x, a, tx, ty, px, py, h) {
            const tone = QT[Math.floor(hash2(tx * 5, ty * 7) * QT.length)];
            const fill = (c, x0, y0, w2, h2) => { x.fillStyle = c; x.fillRect(x0, y0, w2, h2); };
            fill(Q.out, px, py, 16, 16);
            fill(tone[1], px + 1, py + 1, 14, 14);
            fill(tone[0], px + 1, py + 1, 14, 1); fill(tone[0], px + 1, py + 1, 1, 14);
            fill(tone[3], px + 1, py + 14, 14, 1); fill(tone[3], px + 14, py + 1, 1, 14);
            for (let j = 2; j < 14; j++) for (let i = 2; i < 14; i++) { const sp = hash2(tx * 16 + i, ty * 16 + j); if (sp < 0.1) fill(tone[2], px + i, py + j, 1, 1); else if (sp > 0.97) fill(tone[0], px + i, py + j, 1, 1); }
            // worn corners, a chip, a crack
            for (const [cx, cy2] of [[1, 1], [14, 1], [1, 14], [14, 14]]) if (hash2(tx + cx, ty + cy2) < 0.7) fill(Q.out, px + cx, py + cy2, 1, 1);
            if (hash2(tx, ty) < 0.5) { fill(Q.out, px + 5 + Math.floor(hash2(tx, 3) * 5), py, 3, 2); }
            if (hash2(tx * 3, ty) < 0.4) for (let j = 3; j < 12; j++) fill(tone[3], px + 6 + Math.round(Math.sin(j) * 1.5) + Math.floor(hash2(ty, tx) * 4), py + j, 1, 1);
        }
    };

    // ---------------------------------------------------------------- the quarry's sprites
    const QP = { k: Q.out, a: Q.hi, b: Q.speck2, c: Q.face, d: Q.speck, e: Q.shade, f: Q.mortar, i: "#23232b", j: "#4a4a58", m: "#74748a", n: "#b2b2c4" };
    // The block Scout pushes: dressed limestone, a lewis hole in its top for the crane's hook.
    put("quarry", "crate", { pal: QP, rows: [
        "kkkkkkkkkkkkkkkk",
        "kaaaaaaaaaaaaaak",
        "kabbccccccccccek",
        "kbcccdcccccdccek",
        "kbccccccccccccek",
        "kbcdccckkkccdcek",
        "kbcccckfffkcccek",
        "kbccccckkkccccek",
        "kbcccdccccccccek",
        "kbccccccccdcccek",
        "kbcccccccccccdek",
        "kbcdccccccccccek",
        "kbcccccdccccccek",
        "kbccccccccccccek",
        "keeeeeeeeeeeeeek",
        "kkkkkkkkkkkkkkkk"
    ] });
;
    /* A CUT BLOCK among the props (16 x 16): weathered, its corners worn
       away, chipped along its top, a crack down it. */
    put("quarry", "qblock", { pal: { k: Q.out, a: "#d6cab0", b: "#b8aa8e", c: "#a29378", d: "#867a64", f: Q.mortar }, rows: [
        "..kkkkkkk.kkkk..",
        ".kaaaaaaakaaaak.",
        "kaabbbbbbbbbbbck",
        "kabbbcbbbbbbbbck",
        "kabbbbbbbcbbbbck",
        "kabbbbbbbdbbbbck",
        "kabcbbbbbbdbbbdk",
        "kabbbbbbbbdbbbdk",
        "kabbbbbbbdbbbbdk",
        "kabbbbcbbdbbbbdk",
        "kabbbbbbbbdbcbdk",
        "kabbbbbbbbbbbbdk",
        "kacbbbbbbbbbbbdk",
        "kccddddddddddddk",
        ".kdddddddddddd k".replace(" ", "d"),
        "..kkkkkkkkkkkk.."
    ] });
    /* A HEAP OF BROKEN STONE (24 x 12): blocks that cracked, piled; rubble
       spilling from its foot. */
    put("quarry", "qpile", { pal: { k: Q.out, a: "#d6cab0", b: "#b8aa8e", c: "#a29378", d: "#867a64" }, rows: [
        "..........kkkk..........",
        "........kkaabbk.........",
        "......kkaabbbbck........",
        ".....kaabkkkbbcdkk......",
        "....kabbk.kaabbcdk......",
        "...kabbbkkabbbbcddk.....",
        "..kaabbckabbbbbbcdkkk...",
        ".kabbbccdkbbbbbcdkabbk..",
        "kabbbbcddkbbbbccdkbbcdk.",
        "kbbbbccddkccccddkbbccdk.",
        "kkkkkkkkkkkkkkkkkkkkkkkk",
        "........................"
    ] });
    // THE TOOLS: a pick and a shovel leant on the wall, a sledgehammer down on the ground.
    put("quarry", "qpick", { pal: { k: "#140c06", a: "#a07040", b: "#c8945a", c: "#6a4824", i: "#2a2a34", m: "#6e6e80", n: "#a8a8bc" }, rows: ["................",".......kk.......","....kkknnkkk....","...kmmnmmnimk...","....kkmkkmiimk..","......k.kbacimk.",".......kbackkimk",".......kback.kim","......kbback..kk","......kback.....",".....kbback.....",".....kback......",".....kback......","....kback.......","....kback.......","...kbback.......","...kback........","..kbback........","..kback.........","...kkk.........."] });
    put("quarry", "qshovel", { pal: { k: "#140c06", a: "#a07040", b: "#c8945a", c: "#6a4824", i: "#2a2a34", m: "#6e6e80", n: "#a8a8bc" }, rows: ["...kkkkkk...","..kbaaaaak..","...kcccck...","...kback....","...kback....","...kback....","...kback....","...kback....","....kback...","....kback...","....kback...","....kback...","...knnmmk...","..knmmmmik..","..kmmmmmik..","..kmmmmmik..","..kmmmmiik..","...kmmiik...","....kiik....",".....kk....."] });
    put("quarry", "qsledge", { pal: { k: "#140c06", a: "#a07040", b: "#c8945a", c: "#6a4824", i: "#2a2a34", m: "#6e6e80", n: "#a8a8bc" }, rows: ["....................",".kkkkkk.............","knnmmmmk............","knmmmmikkkkkkkkkkkk.","kmmmmmibbbbbbbbbbbbk","kmmmmmiaaaaaaaaaaaak","kmmmmiicccccccccccck","kimiiiikkkkkkkkkkkk.",".kkkkkk............."] });
    // Rubble about the floor, and the stones that fall: the quarry's pale rock.
    put("quarry", "rubble", { pal: { k: Q.out, a: Q.hi, b: Q.speck2, c: Q.face, e: Q.shade }, rows: [
        "................",
        ".......kk.......",
        "..kk..kabk......",
        ".kabk.kbcek..kk.",
        "kbccek.keekkkabk",
        "kceeek..kkkbceek",
        ".kkkk.........kk",
        "................"
    ] });
    put("quarry", "rock", { pal: { k: Q.out, a: Q.hi, b: Q.speck2, c: Q.face, e: Q.shade }, rows: [
        "...kkkkk....",
        "..kaabbck...",
        ".kabbcccck..",
        "kabcccdccek.",
        "kbcccccccek.",
        "kbccdcccceek",
        "kcccccccceek",
        ".kcecceeeek.",
        "..keeeeekk..",
        "...kkkkk...."
    ].map(r => r.replace(/d/g, "c")) });

    /* THE LANTERN (14 x 22, drawn again: "the quarry lanterns designs need
       to be much better, make them perfect"). A hurricane lantern hung from
       an iron bracket: a plate on the wall, two rivets, an arm out with a
       hook on its end; the lantern's wire bail over the hook; a brass cap
       with its chimney holes; the glass globe, bulging, lit from the flame
       inside it, bright at its heart, warm at its sides, a glint on it; two
       guard wires down it; and the fuel tank under it, brass, lit on top. */
    put("quarry", "torchBase", { pal: { k: "#140c06", i: "#26262e", j: "#4a4a58", m: "#7a7a8e", n: "#b4b4c6", w: "#3a3226", B: "#6a4610", C: "#a8781e", D: "#dcae46", E: "#fff1b4", G: "#fffbe6", H: "#ffe7a0", I: "#f6c860", J: "#d89a38", K: "#a86a20" }, rows: [
        "kkk...........",
        "kmkkkkkkkkk...",
        "knjjjjjjjjmk..",
        "kjkkkkkkkkjk..",
        "kmk.....kjk...",
        "kkk.....kjk...",
        "........kmk...",
        ".......kkwkk..",
        "......kwkkkwk.",
        ".....kw.....wk",
        ".....kkDDDDkk.",
        "....kDCkCkCBk.",
        "....kkkkkkkkk.",
        "...kIwHHGHHwJk",
        "...kIwHGGGHwJk",
        "...kJwHGEGHwKk",
        "...kJwIHGHIwKk",
        "....kwJIIIJwk.",
        "....kkkkkkkkk.",
        "...kDDDDDDDCBk",
        "...kCCCCCCCBBk",
        "....kkkkkkkkk."
    ] });
    put("quarry", "flame", { pal: { W: "#ffffff", T: "#fff6c0", t: "#ffd060" }, frames: [
        [".W.", "WTW", ".t."],
        [".W.", ".TW", ".t."],
        ["..W", ".TW", ".t."],
        [".W.", "WT.", ".t."]
    ] });


    /* THE STONE BEETLE (20 x 12): a domed shell of grey stone plates, lit
       from the top left, a seam down it; a dark head with a red eye and
       pincers; six legs walking (two frames). On its back (two frames): the
       pale ridged belly up, legs waving. */
    const BEETLE_PAL = { k: "#16141a", A: "#3e4452", B: "#5c6476", C: "#7f889c", D: "#b4bccb", E: "#2c303b", H: "#25242b", R: "#d0403a", M: "#9a8458", G: "#8a7656", F: "#6a5a40" };
    const beetleTop = [
        "......kkkkkkk.......",
        "....kkDDCCCCBkk.....",
        "...kDDCCCCCCBBBk....",
        "..kDCCCCECCCBBBAk...",
        "..kCCCCCECCCBBAAkkk.",
        ".kCCCCCCECCBBBAAkHHk",
        ".kBBBBBBEBBBAAAAkRHk",
        ".kAAAAAAEAAAAAAEkHHk",
        ".kEEEEEEEEEEEEEEkkMk",
        "..kkkkkkkkkkkkkkk.Mk"
    ];
    put("quarry", "beetle", { pal: BEETLE_PAL, frames: [
        beetleTop.concat(["..k.k..k..k..k......", ".k..k.k..k..k......."]),
        beetleTop.concat(["...k.k..k..k..k.....", "...k..k.k...k.k....."]),
        [
            "..k..k...k..k.......",
            "...k.k..k..k........",
            "..kkkkkkkkkkkkkk....",
            ".kGGGGGGGGGGGGGGkk..",
            ".kFGFGFGFGFGFGFGkHk.",
            ".kAAAAAAAEAAAAAAkRk.",
            ".kBBBBBBBEBBBBBAkk..",
            "..kCCCCCCECCCBBAk...",
            "..kDCCCCCECCCBAk....",
            "...kDCCCCECCBAk.....",
            "....kkkkkkkkkk......",
            "...................."
        ],
        [
            ".k..k...k..k..k.....",
            "..k..k.k..k..k......",
            "..kkkkkkkkkkkkkk....",
            ".kGGGGGGGGGGGGGGkk..",
            ".kFGFGFGFGFGFGFGkHk.",
            ".kAAAAAAAEAAAAAAkRk.",
            ".kBBBBBBBEBBBBBAkk..",
            "..kCCCCCCECCCBBAk...",
            "..kDCCCCCECCCBAk....",
            "...kDCCCCECCBAk.....",
            "....kkkkkkkkkk......",
            "...................."
        ]
    ] });

    /* THE DROP HAMMER (32 x 22), in place of the swift (13 Oct 2026, the
       owner's: "a giant sledge hammer, that you can see coming! It'll shake
       before it drops"). A sledgehammer's head the size of a crate, iron,
       its faces bevelled and lit from the top left, hung by a stub of its
       handle from a rope (the game draws the rope, up to the roof). */
    put("quarry", "hammer", { pal: { k: "#0e0e14", a: "#c8c8d8", b: "#9a9aae", c: "#6e6e84", d: "#4a4a5c", e: "#2e2e3a", h: "#a07040", H: "#c8945a", j: "#6a4824", i: "#2a2a34", m: "#7a7a8e" }, rows: [
        "............kkkkkkk.............",
        "............kiimmik.............",
        "............kkkkkkk.............",
        ".............kHhhjk.............",
        ".............kHhhjk.............",
        ".............kHhhjk.............",
        "...kkkkkkkkkkkHhhjkkkkkkkkkkkk..",
        "..kaaaaaaaaaaaHhhjaaaaaaaaaaabk.",
        ".kaabbbbbbbbbbbbbbbbbbbbbbbbbcdk",
        "kaabbbbbbbbbbbbbbbbbbbbbbbbbbcdk",
        "kabbbbbbbbbbbbbbbbbbbbbbbbbbbcdk",
        "kabbbbbbbbbbbbbbbbbbbbbbbbbbbcdk",
        "kabbbbcccccccccccccccccccccbbcdk",
        "kabbbbbbbbbbbbbbbbbbbbbbbbbbbcdk",
        "kabbbbbbbbbbbbbbbbbbbbbbbbbbbcdk",
        "kabbbbbbbbbbbbbbbbbbbbbbbbbbbcdk",
        "kbccccccccccccccccccccccccccccdk",
        "kcddddddddddddddddddddddddddddek",
        ".kdddddddddddddddddddddddddddek.",
        "..keeeeeeeeeeeeeeeeeeeeeeeeeek..",
        "...kkkkkkkkkkkkkkkkkkkkkkkkkkk..",
        "................................"
    ] });

    /* THE WALL LIZARD (8 x 16, head up, its belly to the wall on its left):
       ochre green, a darker back stripe, splayed toes; two frames. */
    const LIZ_PAL = { k: "#15160c", A: "#4a5a22", B: "#6f8530", C: "#98ad4c", D: "#c8c46e", e: "#f0e060" };
    put("quarry", "lizard", { pal: LIZ_PAL, frames: [
        [
            "...kk...",
            "..kCCk..",
            "..kCek..",
            "..kBCk..",
            "kk.kBk.k",
            ".kkBCkk.",
            "..kABk..",
            "..kABCk.",
            "..kABCk.",
            "..kABk..",
            "kkkBCk.k",
            "...kBkk.",
            "...kAk..",
            "....kk..",
            "....k...",
            "...k...."
        ],
        [
            "...kk...",
            "..kCCk..",
            "..kCek..",
            "k.kBCk..",
            ".kkkBkk.",
            "..kBCk.k",
            "..kABk..",
            "..kABCk.",
            "..kABCk.",
            ".kkABk..",
            "k..BCkkk",
            "...kBk..",
            "...kAk..",
            "...kk...",
            "....k...",
            ".....k.."
        ]
    ] });

    /* A CRUMBLING LEDGE (16 x 9): a slab of the quarry's rock jutting out,
       cracked through, grit trickling from its underside. Two, so a row of
       them does not repeat. */
    const CR_PAL = { k: Q.out, a: Q.hi, b: Q.speck2, c: Q.face, d: Q.speck, e: Q.shade, f: Q.mortar };
    put("quarry", "crumble", { pal: CR_PAL, frames: [
        [
            "kkkkkkkkkkkkkkkk",
            "aaaaaakaaaaaaaaa",
            "bcccccfccccdcccb",
            "ccdcccfkcccccccc",
            "cccccccfcccccdcc",
            "eeceeeekfeeeceee",
            "keeeeekkkeeeeeek",
            ".kkkkk..kkkkkkk.",
            "...d.......d...."
        ],
        [
            "kkkkkkkkkkkkkkkk",
            "aaaaaaaaaaakaaaa",
            "bccdcccccccfcccb",
            "cccccccccdcfkccc",
            "ccccdcccccfccccc",
            "eeeeceeeeefkeeee",
            "keeeeeeeekkkeeek",
            ".kkkkkkkk...kkk.",
            ".....d.......d.."
        ]
    ] });


    /* ================================================================ 3. THE ICE CAVERNS
       Below the quarry the rock is frozen through: its walls ice-glazed
       slate, snow lying on every ledge, icicles under every overhang; a
       deep blue cavern behind, frozen falls of ice down it, crystals
       glinting in the dark; pillars of ice standing in front of it; ledges
       of clear ice; crystals in the walls for light; snow drifting down. */
    const I = {
        out: "#14202e",
        // the ice-glazed rock: deep, body, light, glaze, the frost
        r0: "#2c4462", r1: "#3a5a80", r2: "#4a6e98", r3: "#6890bc", r4: "#a8cce8", frost: "#e4f4ff",
        // snow: lit, body, shade
        s1: "#ffffff", s2: "#e2f0fa", s3: "#b4d0e6",
        // the cavern behind
        bg: ["#0f1c2e", "#122236", "#15283e", "#112033"], fall: "#1d3552", fallLit: "#28466a", vein: "#4fc3e8",
        // clear ice (ledges, pillars, blocks)
        c1: "#d8f0ff", c2: "#9fd2f2", c3: "#6eb2e0", c4: "#4a8ec4", c5: "#2e6a9e"
    };
    // A soft noise (value noise on a 6-pixel grid), 0..1, the same every time.
    const vnoise = (x, y, k) => {
        const gx = Math.floor(x / 6), gy = Math.floor(y / 6), fx = (x % 6) / 6, fy = (y % 6) / 6;
        const a = hash2(gx + k, gy), b = hash2(gx + 1 + k, gy), c = hash2(gx + k, gy + 1), d = hash2(gx + 1 + k, gy + 1);
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
    };

    themes.ice = {
        // (16 Oct 2026) the rig its moving platforms hang from (js/rat-race.js, THE RIGS), in its own materials
        rig: { beam: "girder", line: "chain", iron: ["#0e1620", "#2a3a4e", "#46607a", "#7a9cbc", "#d0e8fa"], frost: ["#f4fbff", "#a8d4f0"] },
        key: "ice",
        timber: { d: "#1e150d", s: "#4a331d", m: "#6b4b2b", l: "#8a6640", q: "#8a6640" },
        edge: { out: I.out, lit: I.r4, dark: "#22385a" },
        moss: false, embers: false, soot: false, supports: false,
        glow: [130, 210, 255], air: [230, 245, 255], snow: true, slide: true, shard: ["#d8f0ff", "#6eb2e0"],
        stones: [["#2e4a6a", "#4a7098", "#8cb8dc"], ["#3a5a80", "#6890bc", "#c4e2f6"], ["#284058", "#46668a", "#7aa2c8"]],
        dirt: ["#101c2a", "#1a2c42"],
        lampAt: { bx: 1, by: 0, fx: 1, fy: 0, gx: 8, gy: 8 },

        /* THE WALLS: slate under a glaze of ice, mottled by a soft noise from
           deep blue to a pale glaze, cracks running through it on the slant,
           a fleck of frost here and there. Per pixel across the map. */
        wall(x, a, tx, ty, px, py, h) {
            for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
                const wx = tx * 16 + i, wy = ty * 16 + j;
                const n = vnoise(wx, wy, 0) * 0.7 + vnoise(wx * 2, wy * 2, 9) * 0.3;
                let c = n < 0.3 ? I.r0 : n < 0.5 ? I.r1 : n < 0.68 ? I.r2 : n < 0.85 ? I.r3 : I.r4;
                // cracks: thin dark lines on the slant, broken
                const cr = (wx + Math.floor(wy * 0.55)) % 29;
                if (cr === 0 && hash2(Math.floor((wx + wy) / 9), 3) < 0.55) c = I.r0;
                else if (cr === 1 && hash2(Math.floor((wx + wy) / 9), 3) < 0.55) c = I.r3;
                if (hash2(wx, wy) > 0.992) c = I.frost;
                x.fillStyle = c; x.fillRect(px + i, py + j, 1, 1);
            }
        },
        // Snow lying on a wall's top: lumpy, lit, a blue shadow under its lip.
        lip(x, a, tx, ty, px, py, h) {
            for (let i = 0; i < 16; i++) {
                const wx = tx * 16 + i, bump = hash2(Math.floor(wx / 3), ty) < 0.35 ? 1 : 0, bump2 = hash2(Math.floor(wx / 5), ty * 7) < 0.15 ? 1 : 0;
                const top = -bump - bump2;
                x.fillStyle = I.out; x.fillRect(px + i, py + top - 1, 1, 1);
                x.fillStyle = I.s1; x.fillRect(px + i, py + top, 1, 1);
                x.fillStyle = I.s2; x.fillRect(px + i, py + top + 1, 1, 2 - top);
                x.fillStyle = I.s3; x.fillRect(px + i, py + 3, 1, 1);
                if (hash2(wx, ty * 3) < 0.3) { x.fillStyle = I.s3; x.fillRect(px + i, py + 4, 1, 1); }
            }
        },
        // Icicles under a wall where nothing is beneath it.
        under(x, a, tx, ty, px, py, h) {
            for (let i = 1; i < 15; i += 3) {
                const hs = hash2(tx * 16 + i, ty * 5 + 1);
                if (hs > 0.55) continue;
                const len = 2 + Math.floor(hs * 12);
                for (let k = 0; k < len; k++) {
                    const w2 = k < len * 0.4 ? 2 : 1;
                    x.fillStyle = k === len - 1 ? I.c1 : k < 2 ? I.c3 : I.c2; x.fillRect(px + i, py + 16 + k, w2, 1);
                    if (w2 === 2) { x.fillStyle = I.c1; x.fillRect(px + i, py + 16 + k, 1, 1); }
                }
            }
        },

        /* THE CAVERN behind: deep blue, darker up high; frozen falls of ice
           down it, each a column of lighter blue, lit down one side, wider
           and narrower as it goes; veins of crystal that catch the light.
           One picture, pixel by pixel. */
        back(x, a, h) {
            const W = a.w * 16, H = a.h * 16;
            const img = x.createImageData(W, H), d = img.data;
            const bg = I.bg.map(rgb), fall = rgb(I.fall), fallLit = rgb(I.fallLit), vein = rgb(I.vein);
            // where the frozen falls are: one every 40 to 90 pixels across
            const falls = [];
            for (let fx = 20; fx < W; fx += 40 + Math.floor(hash2(fx, 77) * 50)) falls.push({ x: fx, w: 6 + Math.floor(hash2(fx, 3) * 10) });
            /* (23 Oct 2026: every pixel looked through every fall, 2 to 3 s a passage as it loaded; now each row's falls are
               laid once. They never overlap, 40 px apart at the least and 15 wide at the most, so the picture is the same) */
            const rowC = new Array(W);
            for (let py = 0; py < H; py++) {
                const room = py % 224, dark = room < 60 ? (60 - room) / 60 * 0.35 : 0;
                for (let px = 0; px < W; px++) { const n = vnoise(px, py, 50); rowC[px] = bg[n < 0.3 ? 0 : n < 0.55 ? 1 : n < 0.8 ? 2 : 3]; }
                for (const f of falls) {
                    const wob = Math.round(Math.sin((py + f.x) / 23) * 2 + Math.sin(py / 7 + f.x) * 0.7);
                    for (let dx = 0; dx < f.w; dx++) { const px = f.x + wob + dx; if (px >= 0 && px < W) rowC[px] = dx === f.w - 1 ? bg[0] : dx < 2 ? fallLit : fall; }
                }
                for (let px = 0; px < W; px++) {
                    let c = rowC[px];
                    if (hash2(px, py) > 0.9975) c = vein;
                    const i = (py * W + px) * 4, k = 1 - dark;
                    d[i] = c[0] * k; d[i + 1] = c[1] * k; d[i + 2] = c[2] * k; d[i + 3] = 255;
                }
            }
            x.putImageData(img, 0, 0);
        },

        /* PILLARS OF ICE in front of the cavern, one every ten tiles, floor
           to roof: clear ice, lit down its left edge, a darker core, flaws
           frozen in it. Half see-through. */
        frameW: { post: 20 },
        frameParts(a) {
            const out = [];
            for (let tx = 6; tx < a.w; tx += 10) out.push({ type: "post", x: tx * 16 - 2, y: 0, h: a.h * 16 });
            return out;
        },
        frame(x, a, h, parts) {
            x.save();
            for (const p of parts) {
                if (p.type !== "post") continue;
                const X = p.x, y0 = p.y, H = p.h;
                x.globalAlpha = 0.42;
                x.fillStyle = I.c5; x.fillRect(X, y0, 20, H);
                x.fillStyle = I.c4; x.fillRect(X + 2, y0, 16, H);
                x.fillStyle = I.c3; x.fillRect(X + 3, y0, 3, H);
                x.fillStyle = I.c2; x.fillRect(X + 4, y0, 1, H);
                x.fillStyle = I.c5; x.fillRect(X + 12, y0, 4, H);
                x.globalAlpha = 0.6;
                for (let y = y0; y < y0 + H; y += 9) { const hs = hash2(X, y); if (hs < 0.3) { x.fillStyle = I.c1; x.fillRect(X + 6 + Math.floor(hs * 20) % 8, y, 1, Math.min(3 + Math.floor(hs * 10), y0 + H - y)); } }
            }
            x.restore();
        },

        /* A LEDGE OF ICE: a slab of clear ice, snow on its top, lit along its
           top edge, darker to its underside, a flaw or two in it, and short
           icicles under it. Eleven pixels deep. */
        platform(x, X, Y, W, o, h) {
            const fill = (c, x0, y0, w2, h2) => { x.fillStyle = c; x.fillRect(x0, y0, w2, h2); };
            const seed = o.seed || 0;
            fill(I.out, X, Y, W, 9);
            fill(I.s1, X + 1, Y + 1, W - 2, 1);
            fill(I.s2, X + 1, Y + 2, W - 2, 1);
            fill(I.c2, X + 1, Y + 3, W - 2, 2);
            fill(I.c3, X + 1, Y + 5, W - 2, 2);
            fill(I.c4, X + 1, Y + 7, W - 2, 1);
            for (let i = 3; i < W - 4; i += 4) { const hs = hash2(seed * 13 + i, 5); if (hs < 0.25) fill(I.c1, X + i, Y + 4, 2 + Math.floor(hs * 8), 1); else if (hs > 0.85) fill(I.c4, X + i, Y + 5, 1, 2); }
            // snow lumps on top
            for (let i = 2; i < W - 3; i += 3) if (hash2(seed + i, 1) < 0.3) { fill(I.out, X + i, Y - 1, 3, 1); fill(I.s1, X + i, Y, 3, 1); }
            // icicles under it
            for (let i = 2; i < W - 2; i += 3) { const hs = hash2(seed * 7 + i, 9); if (hs < 0.5) { const len = 1 + Math.floor(hs * 8); for (let k = 0; k < len; k++) fill(k === len - 1 ? I.c1 : I.c3, X + i, Y + 9 + k, 1, 1); } }
        },

        // PROPS: a drift of snow, a barrel frozen in ice, a cluster of crystals.
        props(x, a, h, spots) {
            for (const sp of spots) {
                const { px, py, kind } = sp;
                if (kind === 0) x.drawImage(h.dim(h.spr("idrift", 0)), px - 2, py + 8);
                else if (kind === 1) x.drawImage(h.dim(h.spr("ibarrel", 0)), px, py);
                else x.drawImage(h.dim(h.spr("icrystal", 0)), px + 2, py + 3);
            }
        }
    };

    const IP = { k: I.out, a: I.c1, b: I.c2, c: I.c3, d: I.c4, e: I.c5, w: "#ffffff", s: I.s2, t: I.s3 };
    // The block Scout pushes: a cube of clear ice, snow on its top. Once moving it slides.
    put("ice", "crate", { pal: IP, rows: [
        ".kkkkkkkkkkkkkk.",
        "kwwswwsswwwswwsk",
        "kssttsssttssstsk",
        "kaabbbbbbbbbbbck",
        "kabwabbbbbbbbbck",
        "kabbacbbbbbbbcdk",
        "kabbbbbbbbbbbcdk",
        "kabbbbbbbbcbbcdk",
        "kabbbbbbbbbbbcdk",
        "kabbbbbbbbbbbcdk",
        "kabbbcbbbbbbbcdk",
        "kabbbbbbbbbbacdk",
        "kabbbbbbbbbbbcdk",
        "kbcccccccccccddk",
        "kcddddddddddddek",
        ".kkkkkkkkkkkkkk."
    ] });
    put("ice", "idrift", { pal: IP, rows: [
        "......kkkkk.....",
        "...kkkwwwwwkk...",
        ".kkwwwssssswwkk.",
        "kwwssssssssssstk",
        "ksttttttttttttek",
        ".kkkkkkkkkkkkkk."
    ] });
    put("ice", "ibarrel", { pal: Object.assign({}, IP, { h: "#5a3a1c", g: "#7a5028", i: "#3a3a48" }), rows: [
        "..kkkkkkkkkkkk..",
        ".kaabbbbbbbbbck.",
        "kabkkkkkkkkkkbck",
        "kbkhgghhgghhkbck",
        "kbkiiiiiiiiiikck",
        "kbkhgghhgghhkcdk",
        "kbkhgghhgghhkcdk",
        "kbkiiiiiiiiiikcdk".slice(0, 16),
        "kbkhgghhgghhkcdk",
        "kbkkkkkkkkkkkcdk",
        "kbcccccccccccddk",
        "kccddddddddddddk",
        ".kddddddddddddk.",
        "..kkkkkkkkkkkk.."
    ] });
    put("ice", "icrystal", { pal: IP, rows: [
        "......k.....",
        ".....kak....",
        "..k..kak....",
        ".kak.kbck.k.",
        ".kab.kbck.kak",
        "kabck kbckkbck".replace(" ", ""),
        "kabckkbcckbck",
        "kbccdkbcdkbcd",
        "kkkkkkkkkkkkk"
    ].map(r => (r + ".............").slice(0, 13)) });
    put("ice", "rubble", { pal: IP, rows: [
        "................",
        "........kk......",
        "..kk...kabk.....",
        ".kabk..kbcdk.kk.",
        "kbccdk..kddkkabk",
        "kcdddk...kkkbcdk",
        ".kkkk.......kkk.",
        "................"
    ] });
    // A falling chunk of ice (the cracks in the roof drop these here).
    put("ice", "rock", { pal: IP, rows: [
        "...kkkkk....",
        "..kaabbck...",
        ".kabbbccck..",
        "kabbbbbccdk.",
        "kbbbbbbccdk.",
        "kbbbbcccdddk",
        "kccccccddddk",
        ".kcdddddddk.",
        "..kdddddkk..",
        "...kkkkk...."
    ] });
    // Spikes of ice.
    put("ice", "spikes", { pal: IP, rows: [
        "..k.....k.....k.",
        "..k.....k.....k.",
        ".kak...kak...kak",
        ".kak...kak...kab",
        "kabck.kabck.kabc",
        "kbcdk.kbcdk.kbcd",
        "kbcdkkkbcdkkkbcd",
        "kkkkkkkkkkkkkkkk"
    ].map(r => r.slice(0, 16)) });

    /* THE CRYSTAL (the Caverns' lights, 14 x 19): a cluster of blue
       crystals grown out of the wall, glowing from inside; its shimmer (four
       frames) moves through it. */
    put("ice", "torchBase", { pal: { k: I.out, a: I.c1, b: I.c2, c: I.c3, d: I.c4, e: I.c5, w: "#ffffff" }, rows: [
        "......k.......",
        ".....kak......",
        ".....kak...k..",
        "..k..kabk.kak.",
        ".kak.kabk.kab.",
        ".kab.kbck.kbck",
        ".kbckkbcdkkbck",
        ".kbcdkbcdkkcdk",
        "kkbcdkbcdkkcdk",
        "kabcdkbcdkbcdk",
        "kabcdkbcddbcdk",
        "kbccdkccddccdk",
        "kbccddccddccek",
        ".kccddcdddcdek",
        ".kcdddddddddek",
        "..kddddddddek.",
        "..kkdeeeeeekk.",
        "....kkkkkkk...",
        ".............."
    ] });
    put("ice", "flame", { pal: { w: "#ffffff", a: "#d8f4ff" }, frames: [
        ["..............", "......w.......", ".....waw......", "......w.......", "..............", "..............", "..............", "..............", "..............", "..............", "..........w...", "..............", ".............."],
        ["..............", "..............", "......a.......", "..............", "..........w...", ".........waw..", "..........w...", "..............", "..............", "..............", "..............", "..............", ".............."],
        ["..............", "..............", "..............", "..............", "..............", "..............", "..w...........", ".waw..........", "..w...........", "..............", "..............", "..............", ".............."],
        ["..............", "..............", "..............", "..............", "..............", "..............", "..............", "..............", "..............", "......w.......", ".....waw......", "......w.......", ".............."]
    ] });

    /* THIN ICE (16 x 9): a sheet of ice over nothing, cracked through; it
       gives way a moment after it is stood on. */
    put("ice", "crumble", { pal: IP, frames: [
        [
            "kkkkkkkkkkkkkkkk",
            "wwwwwkwwwwswwwww",
            "abbbbkkbbbbbbbba",
            "bbbbbbkbbbbcbbbb",
            "bbcbbbbkkbbbbbbb",
            "ccccccccckcccccc",
            "kdddddddddkddddk",
            ".kkkkkkkkk.kkkk.",
            "..c........c...."
        ],
        [
            "kkkkkkkkkkkkkkkk",
            "wwswwwwwwkwwwwww",
            "abbbbbbbbkbbbbba",
            "bbbbcbbbkbbbbbbb",
            "bbbbbbbkbbbbbcbb",
            "cccccckccccccccc",
            "kddddkddddddddddk".slice(0, 16),
            ".kkkk.kkkkkkkkk.",
            ".....c......c..."
        ]
    ] });

    /* THE SNOW HARE (16 x 12): white, a grey back, long ears laid back; it
       hops (crouched, then stretched in the air). */
    const HARE_PAL = { k: "#2a2e38", w: "#ffffff", s: "#dfe8f2", t: "#a9b6c8", e: "#141418", p: "#f0a0b0" };
    put("ice", "hare", { pal: HARE_PAL, frames: [
        [
            "................",
            "..........kk....",
            ".........kssk...",
            "........kssk....",
            "..kkkkkkksk.....",
            ".kttttssswkkk...",
            "ktttssssssswek..",
            "ktssssssswwwwkp.",
            "kssssssswwwwwk..",
            ".kwwkkkwwwkkk...",
            ".kwwk..kwwk.....",
            "..kk....kk......"
        ],
        [
            "..............kk",
            "............kssk",
            "...........kssk.",
            "..kkkkkkkkksk...",
            ".kttttsssswwkkk.",
            "kttssssssssswek.",
            "ktsssssssswwwwkp",
            ".kssssswwwwwwkk.",
            "kwwkkkkkkkwwk...",
            "kwk.......kwwk..",
            "kk.........kk...",
            "................"
        ]
    ] });

    /* THE ICE CRAWLER (18 x 11): a low blue grub with a back of ice spikes:
       jumping on it hurts. Two frames, its legs rippling. */
    const CRAWL_PAL = { k: "#101826", a: "#d8f0ff", b: "#9fd2f2", c: "#4a8ec4", d: "#2e5a8a", e: "#ffe060", f: "#1c3454" };
    put("ice", "crawler", { pal: CRAWL_PAL, frames: [
        [
            "...k...k...k...k..",
            "..kak.kak.kak.kak.",
            "..kbk.kbk.kbk.kbk.",
            ".kkbkkkbkkkbkkkbkk",
            "kccccccccccccccccek".slice(0, 18),
            "kcdddcddddcdddcdck",
            "kdddddddddddddddek".slice(0, 18),
            "kfdddddddddddddddk",
            ".kffffffffffffffk.",
            "..k.k..k.k..k.k...",
            ".k...k....k....k.."
        ],
        [
            "...k...k...k...k..",
            "..kak.kak.kak.kak.",
            "..kbk.kbk.kbk.kbk.",
            ".kkbkkkbkkkbkkkbkk",
            "kcccccccccccccccek",
            "kcdddcddddcdddcdck",
            "kddddddddddddddddk",
            "kfdddddddddddddddk",
            ".kffffffffffffffk.",
            ".k.k..k.k..k.k....",
            "..k....k....k..k.."
        ]
    ] });

    /* THE ICICLE that drops (8 x 18): hung under the roof, it shivers when
       Scout passes beneath and falls. */
    put("ice", "icicle", { pal: IP, rows: [
        "kkkkkkkk",
        "kwaaabck",
        ".kaabck.",
        ".kabbck.",
        ".kabbck.",
        ".kabck..",
        "..kbck..",
        "..kbck..",
        "..kbck..",
        "..kbk...",
        "..kbk...",
        "..kbk...",
        "...kk...",
        "...kk...",
        "...k....",
        "...k....",
        "........",
        "........"
    ] });
    // The frost bat (a bat in the Caverns).


    /* ================================================================ 4. THE DARK DEPTHS
       Under the ice, the oldest part of the labyrinth: black rock flecked
       with violet and a lichen that glows a faint green along its edges,
       the ruins of older walls behind, roots hanging down through it all,
       ledges of worn stone, bones and broken urns. Almost all of it dark:
       Scout sees by his own small light, the braziers he lights, and the
       glow round each checkpoint (see THE DARK in js/rat-race.js). */
    const K = {
        out: "#050308",
        // the rock: deep, body, light, its violet flecks, the lichen
        r0: "#0e0b14", r1: "#16121e", r2: "#201a2a", r3: "#2e2638", fleck: "#5a3e78", lichen: "#3fae7a", lichenLit: "#8ef0b0",
        // the ruins behind
        bg: ["#08060c", "#0b0810", "#0e0a14"], brick: "#141019", brickLit: "#1c1624", mortar: "#060409",
        // roots
        root: "#2a1c14", rootLit: "#3e2a1c",
        // worn stone (ledges)
        s1: "#4a4256", s2: "#36303f", s3: "#262130"
    };
    themes.dark = {
        // (16 Oct 2026) the rig its moving platforms hang from (js/rat-race.js, THE RIGS), in its own materials
        rig: { beam: "timber", line: "chain", wood: ["#050308", "#140e0a", "#221710", "#2e2016", "#3e2c1e", "#4e3a28"], iron: ["#050308", "#1a161e", "#2e2834", "#4a4256", "#6e6480"] },
        key: "dark",
        timber: { d: "#0a0806", s: "#2a1c14", m: "#3a2818", l: "#4e3622", q: "#4e3622" },
        edge: { out: K.out, lit: K.r3, dark: K.out },
        moss: false, embers: true, soot: false, supports: false,
        glow: [255, 150, 60], air: [160, 140, 200], dark: true, torch: true,
        stones: [["#1a1622", "#2e2838", "#4a4256"], ["#16121e", "#2a2434", "#3e3648"], ["#201a28", "#342c3e", "#544a60"]],
        dirt: ["#050308", "#0e0b14"], shard: ["#4a4256", "#262130"],
        lampAt: { bx: 0, by: 2, fx: 1, fy: -9, gx: 8, gy: -2 },

        // THE WALLS: black rock, a soft mottle of deep violet, flecks of
        // a brighter violet, and the lichen's faint green near the open air.
        wall(x, a, tx, ty, px, py, h) {
            for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
                const wx = tx * 16 + i, wy = ty * 16 + j;
                const n = vnoise(wx, wy, 31) * 0.75 + vnoise(wx * 3, wy * 3, 7) * 0.25;
                let c = n < 0.35 ? K.r0 : n < 0.6 ? K.r1 : n < 0.82 ? K.r2 : K.r3;
                if (hash2(wx, wy) > 0.985) c = K.fleck;
                x.fillStyle = c; x.fillRect(px + i, py + j, 1, 1);
            }
        },
        // A ledge's top: worn smooth, the lichen growing along it, glowing faintly.
        lip(x, a, tx, ty, px, py, h) {
            x.fillStyle = K.out; x.fillRect(px, py, 16, 1);
            x.fillStyle = K.r3; x.fillRect(px, py + 1, 16, 1);
            x.fillStyle = K.r2; x.fillRect(px, py + 2, 16, 2);
            for (let i = 0; i < 16; i++) {
                const hs = hash2(tx * 16 + i, ty * 11);
                if (hs < 0.3) { x.fillStyle = hs < 0.08 ? K.lichenLit : K.lichen; x.fillRect(px + i, py - (hs < 0.12 ? 1 : 0), 1, 1 + (hs < 0.12 ? 1 : 0)); }
            }
        },
        under(x, a, tx, ty, px, py, h) {
            // roots hanging out of the rock's underside
            for (let i = 2; i < 14; i += 5) {
                const hs = hash2(tx * 16 + i, ty * 3 + 7);
                if (hs > 0.4) continue;
                let rx = px + i;
                for (let k = 0; k < 4 + Math.floor(hs * 22); k++) { if (hash2(rx, k + ty) < 0.25) rx += hash2(k, rx) < 0.5 ? -1 : 1; x.fillStyle = k % 3 ? K.root : K.rootLit; x.fillRect(rx, py + 16 + k, 1, 1); }
            }
        },

        /* THE RUINS behind: older walls of dark brick, half fallen, the
           courses running out into rough rock; very dark. One picture. */
        back(x, a, h) {
            const W = a.w * 16, H = a.h * 16;
            const img = x.createImageData(W, H), d = img.data;
            const bg = K.bg.map(rgb), brick = rgb(K.brick), brickLit = rgb(K.brickLit), mortar = rgb(K.mortar);
            for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
                const ruin = vnoise(px, py, 90) > 0.48;        // where the old walls still stand
                let c;
                if (ruin) {
                    const row = Math.floor(py / 7), shift = (row % 2) * 9, along = (px + shift) % 18, inrow = py % 7;
                    c = inrow === 6 || along === 0 ? mortar : inrow === 0 ? brickLit : brick;
                } else { const n = vnoise(px, py, 40); c = bg[n < 0.4 ? 0 : n < 0.75 ? 1 : 2]; }
                const i = (py * W + px) * 4;
                d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
            }
            x.putImageData(img, 0, 0);
        },
        // ROOTS hanging down in front of the ruins, here and there.
        /* (14 Oct 2026, the level editor) each root a part: { type: "root",
           x, y, h, seed }, its wandering worked out from its own top down, so
           it keeps its shape wherever it is moved. */
        frameW: { root: 4 },
        frameParts(a) {
            const out = [], H = a.h * 16;
            for (let tx = 3; tx < a.w; tx += 7) {
                if (hash2(tx, 5) < 0.3) continue;
                const rx = tx * 16 + Math.floor(hash2(tx, 9) * 10);
                out.push({ type: "root", x: rx, y: 0, h: Math.min(H, 60 + Math.floor(hash2(tx, 2) * 180)), seed: rx });
            }
            return out;
        },
        frame(x, a, h, parts) {
            for (const p of parts) {
                if (p.type !== "root") continue;
                // (the seed is where it first hung: its shape goes with it)
                const seed = p.seed === undefined ? p.x : p.seed, tx = Math.floor(seed / 16);
                let rx = p.x;
                for (let y = 0; y < p.h; y++) {
                    if (hash2(rx - p.x + seed, y) < 0.08) rx += hash2(y, rx - p.x + seed) < 0.5 ? -1 : 1;
                    const Y = p.y + y;
                    x.fillStyle = K.out; x.fillRect(rx - 1, Y, 4, 1);
                    x.fillStyle = K.root; x.fillRect(rx, Y, 2, 1);
                    x.fillStyle = K.rootLit; x.fillRect(rx, Y, 1, 1);
                    if (hash2(y, tx) < 0.02) { for (let k = 1; k < 8; k++) { x.fillStyle = K.root; x.fillRect(rx + k, Y + k, 1, 1); } }
                }
            }
        },
        // A LEDGE of worn old stone, the lichen along its top.
        platform(x, X, Y, W, o, h) {
            const fill = (c, x0, y0, w2, h2) => { x.fillStyle = c; x.fillRect(x0, y0, w2, h2); };
            fill(K.out, X, Y, W, 9);
            fill(K.s1, X + 1, Y + 1, W - 2, 1);
            fill(K.s2, X + 1, Y + 2, W - 2, 4);
            fill(K.s3, X + 1, Y + 6, W - 2, 2);
            for (let j = 14; j < W - 6; j += 22 + Math.floor(hash2(o.seed || 0, j) * 10)) fill(K.out, X + j, Y + 2, 1, 6);
            for (let i = 1; i < W - 1; i++) { const hs = hash2(X + i, Y); if (hs < 0.22) fill(hs < 0.06 ? K.lichenLit : K.lichen, X + i, Y, 1, 1); }
        },
        // PROPS: bones, a broken urn, glowing toadstools.
        props(x, a, h, spots) {
            for (const sp of spots) {
                const { px, py, kind } = sp;
                if (kind === 0) x.drawImage(h.dim(h.spr("dbones", 0)), px, py + 8);
                else if (kind === 1) x.drawImage(h.dim(h.spr("durn", 0)), px + 2, py + 2);
                else { x.drawImage(h.dim(h.spr("dshroom", 0)), px + 2, py + 6); a.glows.push([px + 8, py + 9, 26]); }
            }
        }
    };

    const KP = { k: K.out, a: "#d8d0c4", b: "#a89c8c", c: "#6e6458", d: K.s1, e: K.s2, f: K.s3, g: K.lichen, G: K.lichenLit, u: "#7a4a2a", U: "#4e2e1a", w: "#ffffff" };
    put("dark", "dbones", { pal: KP, rows: [
        "..kkkk..........",
        ".kaaaak.........",
        "kakkakak....kk..",
        "kaaaaaak...kabk.",
        ".kakakk.kkkkbbk.",
        "..kkk..kaaaaaak.",
        ".......kbkkkkbk.",
        "........k....k.."
    ] });
    put("dark", "durn", { pal: KP, rows: [
        "...kkkkkk...",
        "..kuuuuuUk..",
        "...kuuuUk...",
        "..kuuuuuUk..",
        ".kuuuuuuuUk.",
        "kuuuuuuuuUUk",
        "kuuuu.kuuUUk",
        "kuuuk..kuUUk",
        ".kuuk...kUk.",
        "..kkkk.kkk..",
        "............",
        "............",
        "............",
        "............"
    ] });
    put("dark", "dshroom", { pal: KP, rows: [
        "....kkkk....",
        "..kkGggGkk..",
        ".kGgggggGgk.",
        "kgggGgggggGk",
        "kkkkkkkkkkkk",
        "....kGk.....",
        "....kgk..kk.",
        "...kkgkkkGk.",
        "...kggkkgk..",
        "...kkkkkkk.."
    ] });
    put("dark", "crate", { pal: Object.assign({}, KP, { h: "#3a2818", i: "#4e3622", j: "#22160e" }), rows: [
        "kkkkkkkkkkkkkkkk",
        "kiiiiiiiiiiiiihk",
        "kihhhhhhhhhhhhjk",
        "kihkkkkkkkkkkhjk",
        "kihkhhhhhhhhkhjk",
        "kihkhhhhhhhkkhjk",
        "kihkhhhhhhkhkhjk",
        "kihkhhhhhkhhkhjk",
        "kihkhhhhkhhhkhjk",
        "kihkhhhkhhhhkhjk",
        "kihkhhkhhhhhkhjk",
        "kihkkhhhhhhhkhjk",
        "kihkkkkkkkkkkhjk",
        "kihhhhhhhhhhhhjk",
        "khjjjjjjjjjjjjjk",
        "kkkkkkkkkkkkkkkk"
    ] });
    put("dark", "rubble", { pal: KP, rows: [
        "................",
        "........kk......",
        "..kk...kdek.....",
        ".kdek..kefk..kk.",
        "kdeefk..kfkkkdek",
        "keffk....kkkefk.",
        ".kkkk.......kk..",
        "................"
    ] });
    put("dark", "rock", { pal: KP, rows: [
        "...kkkkk....",
        "..kddeek....",
        ".kdeeeeek...",
        "kdeeeeeeffk.",
        "keeeeeeeffk.",
        "keeeeeefffk.",
        "kefffffffffk",
        ".kffffffffk.",
        "..kfffffkk..",
        "...kkkkk...."
    ] });
    put("dark", "spikes", { pal: KP, rows: [
        "..k.....k.....k.",
        ".kdk...kdk...kdk",
        ".kek...kek...kek",
        "kdeek.kdeek.kdee",
        "keefk.keefk.keef",
        "keffkkkeffkkkeff",
        "keffkkkeffkkkeff",
        "kkkkkkkkkkkkkkkk"
    ] });
    /* THE BRAZIER (16 x 16, standing on the floor): an iron bowl on three
       legs. Unlit, cold coals in it; lit, a fire in it (its flame, four
       frames, drawn over it). Scout lights one by touching it. */
    put("dark", "brazier", { pal: { k: "#050308", i: "#2a2a34", j: "#4a4a58", m: "#74748a", c: "#3a2a22", d: "#5a3a28", e: "#1a1210" }, frames: [
        [
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "..kkkkkkkkkkkk..",
            ".kmjjjjjjjjjjik.",
            ".kjcdcedcdcecik.",
            "..kjjjjjjjjjik..",
            "...kiiiiiiiik...",
            "....kkkiikkk....",
            "......kiik......",
            ".....kiiiik.....",
            "....kik..kik....",
            "...kkk....kkk..."
        ]
    ] });
    put("dark", "fire", { pal: { W: "#fffbe0", T: "#ffd060", t: "#f59a20", F: "#d2420c" }, frames: [
        ["......W.....", ".....WT.....", "....tTTW....", "...tTTTTt...", "..FtTWTTtF..", "..FttTTttF.."],
        [".....W......", "....WT......", "....TTTt....", "...tTWTTt...", "..FtTTTTtF..", "..FttTTttF.."],
        ["......W.....", "......TW....", "....tTTT....", "...tTTWTt...", "..FtTTTTtF..", "..FtTTTttF.."],
        [".......W....", "......TW....", "....tTTTt...", "...tTTTTt...", "..FtTTWTtF..", "..FttTTttF.."]
    ] });

    /* THE BLIND CRAWLER (20 x 12): pale and eyeless, long-limbed, it creeps
       until it hears running, then charges at the sound. */
    put("dark", "charger", { pal: { k: "#0a0808", a: "#e8dcd0", b: "#c4b4a4", c: "#8e7e70", d: "#5a4e44", m: "#7a2a2a" }, frames: [
        [
            "....................",
            ".......kkkkkk.......",
            ".....kkaaaabbkk.....",
            "...kkabbbbbbbccbkk..",
            "..kabbbbbbbbbbcccak.",
            ".kabbbcbbbcbbbcccmak",
            ".kbbbbbbbbbbbbcckkk.",
            "..kccccccccccckk....",
            "..kkkkkkkkkkkkk.....",
            ".k..k.k...k..k.k....",
            "k..k..k...k...k..k..",
            "...................."
        ],
        [
            "....................",
            ".......kkkkkk.......",
            ".....kkaaaabbkk.....",
            "...kkabbbbbbbccbkk..",
            "..kabbbbbbbbbbcccak.",
            ".kabbbcbbbcbbbcccmak",
            ".kbbbbbbbbbbbbcckkk.",
            "..kccccccccccckk....",
            "..kkkkkkkkkkkkk.....",
            "..k.k...k.k.k...k...",
            ".k...k.k...k.k...k..",
            "...................."
        ]
    ] });
    /* THE WILL-O'-THE-WISP (12 x 12): a cold flame with a face in it, two
       frames of flicker. It comes for Scout only while he is out of the light. */
    put("dark", "wisp", { pal: { a: "#e8fff4", b: "#8ef0d0", c: "#3ac8a0", d: "#1a7a68", k: "#043028" }, frames: [
        [
            ".....aa.....",
            "....abba....",
            "...abbcba...",
            "..abbbbcba..",
            ".abbkbbkbba.",
            ".abbbbbbcba.",
            "abbbbkkbbcba",
            "abcbbbbbbcba",
            ".acccbbcccd.",
            "..dccccccd..",
            "...dd..dd...",
            "....d..d...."
        ],
        [
            "......aa....",
            "....aabba...",
            "...abbbcba..",
            "..abbbbbcba.",
            ".abbkbbkbba.",
            ".abbbbbbcba.",
            "abbbbkkbbcba",
            "abcbbbbbbcba",
            ".acccbbcccd.",
            "..dcccccdd..",
            "..dd...dd...",
            "...d....d..."
        ]
    ] });
    /* ROOTS grown across the way (16 x 16, two): old, twisted, thorned;
       only fire gets through them. */
    const ROOT_PAL = { k: "#050308", a: "#5a3c24", b: "#3e2818", c: "#2a1a10", t: "#8a6a4a" };
    put("dark", "roots", { pal: ROOT_PAL, frames: [
        [
            "kabk..kbk...kabk",
            "kbck.kabck.kbck.",
            ".kbckbck.kbbck..",
            "..kbbbk.kbck.t..",
            ".t.kbbkkbck.....",
            "...kbcbbck..kk..",
            "..kbck.kbbkkabk.",
            ".kabk...kbbbbck.",
            "kabck.t..kbck...",
            "kbck....kabck..t",
            ".kbckkkkabck....",
            "..kbbbbbbck..kk.",
            "t..kbckkbck.kabk",
            "..kbck..kbbkbck.",
            ".kabk....kbbck..",
            "kabk......kbk..."
        ],
        [
            "...kbk..kabk..kb",
            "..kabck.kbck.kbc",
            ".kbck.kbbck.kbck",
            "kbck.t.kbck.kbk.",
            "kbk...kbbbkkbck.",
            ".kbk.kbck.kbbk..",
            "..kbkbck.t.kbck.",
            "...kbbk...kabck.",
            "..kabbbk.kbbk...",
            ".kbck.kbkbck..t.",
            "kbck...kbbk.....",
            "kbk.t.kabbbk....",
            ".kbk.kbck.kbk.kk",
            "..kbkbck...kbkbk",
            "...kbbk.....kbk.",
            "....kbk......kk."
        ]
    ] });
    // SCOUT'S TORCH (5 x 10) and its flame (5 x 7, three frames).
    put("dark", "htorch", { pal: { k: "#1a0f08", a: "#8a5a2a", b: "#5a3a18", c: "#c8a060", d: "#6a4a30" }, rows: [
        "kkkkk",
        "kcdck",
        "kdcdk",
        ".kak.",
        ".kab.".replace(".kab.", ".kak."),
        ".kak.",
        ".kbk.",
        ".kbk.",
        ".kbk.",
        "..k.."
    ] });
    put("dark", "hflame", { pal: { W: "#fffbe0", T: "#ffd060", t: "#f59a20", F: "#d2420c" }, frames: [
        ["..W..", ".WT..", ".TTt.", "tTWTt", "tTTTt", ".FtF.", "....."],
        ["..W..", "..TW.", ".tTT.", "tTTWt", "tTTTt", ".FtF.", "....."],
        [".W...", ".TW..", "tTTT.", "tTWTt", "FtTTt", ".FtF.", "....."]
    ] });
    /* THE GLOW-GRUB (20 x 10): a fat pale grub, segmented, lit green from
       inside, so it shows in the dark; it inches along. Two frames. */
    const GRUB_PAL = { k: "#06140c", a: "#e8ffd0", b: "#a8f080", c: "#5ac850", d: "#2a7a30", e: "#000000" };
    put("dark", "grub", { pal: GRUB_PAL, frames: [
        [
            "....................",
            "......kkkkkkkk......",
            "....kkbbaabbaabkk...",
            "...kbbaabbaabbaabbk.",
            "..kbaabbaabbaabbabek",
            "..kcbbccbbccbbccbbbk",
            "..kdccddccddccddcckk",
            "...kddkkddkkddkkddk.",
            "....kk..kk..kk..kk..",
            "...................."
        ],
        [
            "....................",
            ".......kkkkkkkk.....",
            ".....kkbbaabbaabkk..",
            "...kkbaabbaabbaabbk.",
            "..kbaabbaabbaabbabek",
            "..kcbbccbbccbbccbbbk",
            "..kdccddccddccddcckk",
            "...kddkkddkkddkkddk.",
            "...kk..kk..kk..kk...",
            "...................."
        ]
    ] });
    // the cave spider and the shadow bat: the Wood's, in the Depths' colours


    /* ================================================================ 5. THE STATION
       Past the depths, the labyrinth runs into something built: a station
       on the sea floor, half flooded. Walls of riveted steel plate with
       seams and runs of rust, bulkheads behind with pipes along them and
       portholes onto the deep, steel girders standing in front, grated
       catwalks, hazard stripes where a floor ends; wall lamps in cages and
       red emergency beacons turning; drums and crates about the floors. */
    const T = {
        out: "#0a0e14",
        // the plate: deep, body, light, its edge, a rivet's shine, rust
        p0: "#262e3a", p1: "#36404e", p2: "#465262", p3: "#5c6a7c", p4: "#8494a8", rust: "#6a3a22", rust2: "#8a4e2a",
        // the bulkheads behind
        b0: "#0e141c", b1: "#131a24", b2: "#18212d", pipe: "#2a3442", pipeLit: "#3c4858", glass: "#0a1e30", glassLit: "#1a3a58", sea: "#06121e",
        // hazard stripes
        hy: "#d8a020", hk: "#1a1a1a"
    };
    themes.station = {
        // (16 Oct 2026) the rig its moving platforms hang from (js/rat-race.js, THE RIGS), in its own materials
        rig: { beam: "girder", line: "chain", iron: ["#0a0e14", "#262e3a", "#36404e", "#5c6a7c", "#8494a8"] },
        key: "station",
        timber: { d: T.out, s: T.p0, m: T.p1, l: T.p3, q: T.p2 },
        edge: { out: T.out, lit: T.p4, dark: T.p0 },
        moss: false, embers: false, soot: false,
        glow: [255, 214, 140], air: [150, 200, 230], bubbles: true,
        dark: true, darkFill: "rgba(2,6,14,0.5)", heroLight: 84, beacons: true,   // half lit: its lamps and beacons stand out
        stones: [["#2a323e", "#465262", "#6a788a"], ["#36404e", "#5c6a7c", "#8494a8"], ["#4a3426", "#6a4a32", "#8a6448"]],
        dirt: ["#06080c", "#10161e"], shard: ["#8494a8", "#465262"],
        lampAt: { bx: 1, by: 2, fx: 5, fy: 7, gx: 8, gy: 10 },

        /* THE WALLS: plates of steel 16 wide and 8 deep, staggered, each lit
           along its top and left and shaded along its foot; a rivet at each
           corner; now and then a run of rust down from a seam. */
        wall(x, a, tx, ty, px, py, h) {
            for (let k = 0; k < 2; k++) {
                const cy = ty * 2 + k, y0 = py + k * 8, shift = (cy % 2) * 8;
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i, along = (wx + shift) % 16, plate = Math.floor((wx + shift) / 16);
                    const rusty = hash2(plate, cy) < 0.12, rustX = 3 + Math.floor(hash2(plate, cy * 3) * 10);
                    for (let r = 0; r < 8; r++) {
                        let c = T.p1;
                        if (r === 7 || along === 0) c = T.p0;
                        else if (r === 0) c = T.p3;
                        else if (along === 1) c = T.p2;
                        else if (r === 6 || along === 15) c = T.p0;
                        else if (hash2(wx, cy * 8 + r) < 0.06) c = T.p2;
                        if ((along === 2 || along === 13) && (r === 2 || r === 5)) c = r === 2 ? T.p4 : T.out;
                        if (rusty && along >= rustX && along <= rustX + 1 && r >= 1 && r <= 1 + Math.floor(hash2(plate, cy * 7) * 6)) c = along === rustX ? T.rust2 : T.rust;
                        x.fillStyle = c; x.fillRect(px + i, y0 + r, 1, 1);
                    }
                }
            }
        },
        // A floor's top: a lit steel edge, and hazard stripes where a floor ends at a drop.
        lip(x, a, tx, ty, px, py, h) {
            x.fillStyle = T.out; x.fillRect(px, py, 16, 1);
            x.fillStyle = T.p4; x.fillRect(px, py + 1, 16, 1);
            x.fillStyle = T.p3; x.fillRect(px, py + 2, 16, 2);
            const edge = !h.wallish(a, tx - 1, ty) || !h.wallish(a, tx + 1, ty);
            if (edge) for (let i = 0; i < 16; i++) { x.fillStyle = ((i + 16 * tx) >> 2) % 2 ? T.hy : T.hk; x.fillRect(px + i, py + 2, 1, 2); }
        },

        /* THE BULKHEADS behind: dark panels, seams between them; pipes run
           along at two heights, lit along their tops, with flanges; and now
           and then a porthole onto the deep, a fish passing it. One picture. */
        back(x, a, h) {
            const W = a.w * 16, H = a.h * 16;
            const img = x.createImageData(W, H), d = img.data;
            const b0 = rgb(T.b0), b1 = rgb(T.b1), b2 = rgb(T.b2), pipe = rgb(T.pipe), pipeLit = rgb(T.pipeLit), glass = rgb(T.glass), glassLit = rgb(T.glassLit), sea = rgb(T.sea), ring = rgb(T.p1), ringLit = rgb(T.p3);
            // portholes: round, every so often, at the height of a room's middle
            const holes = [];
            for (let ry = 0; ry * 224 < H; ry++) for (let px = 40; px < W; px += 80 + Math.floor(hash2(px, ry) * 90)) if (hash2(px, ry * 5) < 0.6) holes.push([px, ry * 224 + 80 + Math.floor(hash2(px, ry * 9) * 40)]);
            const put = (px, py, c) => { const i = (py * W + px) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
            for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
                const panelX = px % 48, panelY = py % 40;
                let c = panelX === 0 || panelY === 0 ? b0 : panelX === 1 || panelY === 1 ? b2 : b1;
                const ry = py % 224;
                if ((ry >= 38 && ry <= 43) || (ry >= 180 && ry <= 184)) { const top = ry === 38 || ry === 180; c = top ? pipeLit : (ry === 43 || ry === 184) ? b0 : pipe; if (px % 64 < 3) c = ry === 38 || ry === 180 ? ringLit : ring; }
                put(px, py, c);
            }
            /* the portholes over it, each over its own square only (23 Oct 2026: every pixel looked at every porthole,
               2.5 s a passage as it loaded; they never overlap, 80 px apart at the least, so the picture is the same) */
            for (const [hx, hy] of holes) for (let py = Math.max(0, hy - 13); py <= Math.min(H - 1, hy + 13); py++) for (let px = Math.max(0, hx - 13); px <= Math.min(W - 1, hx + 13); px++) {
                const dd = Math.hypot(px - hx, py - hy);
                if (!(dd < 13)) continue;
                let c = dd > 11 ? ring : dd > 10 ? ringLit : dd < 9 && (px - hx) + (py - hy) < -7 ? glassLit : glass; if (dd < 9 && Math.abs(py - hy - 2) < 2 && Math.abs(((px + Math.floor(py / 3)) % 23) - 11) < 3 && hash2(hx, hy) < 0.5) c = sea;
                put(px, py, c);
            }
            x.putImageData(img, 0, 0);
        },
        // GIRDERS standing in front of the bulkheads, every ten tiles: an I-beam, riveted.
        frameW: { post: 20 },
        frameParts(a) {
            const out = [];
            for (let tx = 6; tx < a.w; tx += 10) out.push({ type: "post", x: tx * 16 - 3, y: 0, h: a.h * 16 });
            return out;
        },
        frame(x, a, h, parts) {
            const fill = (c, X, Y, w2, h2) => { x.fillStyle = c; x.fillRect(X, Y, w2, h2); };
            for (const p of parts) {
                if (p.type !== "post") continue;
                const X = p.x, y0 = p.y, H = p.h;
                fill(T.out, X, y0, 20, H); fill(T.p0, X + 1, y0, 18, H); fill(T.p2, X + 2, y0, 3, H); fill(T.p1, X + 6, y0, 8, H); fill(T.p0, X + 14, y0, 4, H); fill(T.p3, X + 2, y0, 1, H);
                for (let y = y0 + 4; y < y0 + H - 1; y += 12) { fill(T.p4, X + 3, y, 1, 1); fill(T.p4, X + 16, y, 1, 1); fill(T.out, X + 3, y + 1, 1, 1); fill(T.out, X + 16, y + 1, 1, 1); }
            }
        },
        /* A CATWALK: a steel grating, its holes showing through, a lit edge
           on top, a channel under it. Eleven pixels deep. */
        platform(x, X, Y, W, o, h) {
            const fill = (c, x0, y0, w2, h2) => { x.fillStyle = c; x.fillRect(x0, y0, w2, h2); };
            fill(T.out, X, Y, W, 10);
            fill(T.p4, X + 1, Y + 1, W - 2, 1);
            fill(T.p2, X + 1, Y + 2, W - 2, 4);
            for (let i = 2; i < W - 2; i += 3) fill(T.out, X + i, Y + 3, 1, 2);
            fill(T.p1, X + 1, Y + 6, W - 2, 1);
            fill(T.p0, X + 1, Y + 7, W - 2, 2);
            for (let j = 8; j < W - 8; j += 16) { fill(T.p3, X + j, Y + 7, 2, 1); }
        },
        // PROPS: a drum, a steel crate, a coil of hose.
        props(x, a, h, spots) {
            for (const sp of spots) {
                const { px, py, kind } = sp;
                if (kind === 0) x.drawImage(h.dim(h.spr("sdrum", 0)), px + 2, py + 1);
                else if (kind === 1) x.drawImage(h.dim(h.spr("crate", 0)), px, py);
                else x.drawImage(h.dim(h.spr("shose", 0)), px, py + 9);
            }
        }
    };

    const SP = { k: T.out, a: T.p4, b: T.p3, c: T.p2, d: T.p1, e: T.p0, y: T.hy, z: T.hk, r: T.rust, R: T.rust2 };
    put("station", "crate", { pal: SP, rows: [
        "kkkkkkkkkkkkkkkk",
        "kaaaaaaaaaaaaabk",
        "kabbbbbbbbbbbbek",
        "kabkkkkkkkkkkbek",
        "kabkccccccccrbek",
        "kabkcddddddcRbek",
        "kabkcdkkkkdcrbek",
        "kabkcdkbbkdcbbek",
        "kabkcdkbbkdcbbek",
        "kabkcdkkkkdcbbek",
        "kabkcddddddcbbek",
        "kabkccccccccbbek",
        "kabkkkkkkkkkkbek",
        "kabbbbbbbbbbbbek",
        "kbeeeeeeeeeeeeek",
        "kkkkkkkkkkkkkkkk"
    ] });
    put("station", "sdrum", { pal: SP, rows: [
        ".kkkkkkkkkk.",
        "kyyyyyyyyyyk",
        "kzkkkkkkkkzk",
        "kyyyyyyyyyyk",
        "kyzzyyzzyyyk",
        "kyyzzyyzzyyk",
        "kyyyzzyyzzyk",
        "kyyyyyyyyyyk",
        "kzkkkkkkkkzk",
        "kyyyyyyyyyRk",
        "kyyyyyyyyrRk",
        "kyyyyyyyyyyk",
        "kzkkkkkkkkzk",
        "kyyyyyyyyyyk",
        ".kkkkkkkkkk."
    ] });
    put("station", "shose", { pal: { k: T.out, a: "#c8402a", b: "#8a2a1a", c: "#e06a4a" }, rows: [
        "....kkkkkk......",
        "..kkcaaaaakk....",
        ".kcakkkkkkaak...",
        "kcak......kabk..",
        "kabkkkkkkkkbbkkk",
        ".kbbbbbbbbbbbbbk",
        "..kkkkkkkkkkkkk."
    ] });
    put("station", "spikes", { pal: SP, rows: [
        "..k.....k.....k.",
        "..k.....k.....k.",
        ".kak...kak...kak",
        ".kbk...kbk...kbk",
        "kabck.kabck.kabc",
        "kbcdk.kbcdk.kbcd",
        "kzyzkkkzyzkkkzyz",
        "kkkkkkkkkkkkkkkk"
    ] });
    put("station", "rubble", { pal: SP, rows: [
        "................",
        "........kk......",
        "..kk...kbck.....",
        ".kbck..kcdk..kk.",
        "kcddk...kkkkkbck",
        "kdeek...kkkcdek.",
        ".kkkk.......kkk.",
        "................"
    ] });
    put("station", "rock", { pal: SP, rows: [
        "...kkkkk....",
        "..kbbcck....",
        ".kbcccdck...",
        "kbccccddek..",
        "kcccccdddek.",
        "kccccddddek.",
        "kcddddddeek.",
        ".kdeeeeeek..",
        "..kkkkkkk...",
        "............"
    ] });
    // A ladder of steel.
    put("station", "ladder", { pal: SP, rows: [
        ".kbck......kbck.",
        ".kbck......kbck.",
        ".kbckkkkkkkkbck.",
        ".kbcaaaaaaaabck.",
        ".kbcddddddddbck.",
        ".kbckkkkkkkkbck.",
        ".kbck......kbck.",
        ".kbck......kbck.",
        ".kbck......kbck.",
        ".kbck......kbck.",
        ".kbckkkkkkkkbck.",
        ".kbcaaaaaaaabck.",
        ".kbcddddddddbck.",
        ".kbckkkkkkkkbck.",
        ".kbck......kbck.",
        ".kbck......kbck."
    ] });
    // A chain to climb (where the Wood had a rope).
    const chain = top => [
        top ? "....kkkkkkkk...." : "......kkkk......",
        top ? "....kbbbbbbk...." : ".....kbccbk.....",
        top ? "......kbbk......" : ".....kc..ck.....",
        "......kbck......",
        ".....kbccbk.....",
        ".....kc..ck.....",
        ".....kc..ck.....",
        ".....kbccbk.....",
        "......kbck......",
        "......kcdk......",
        "......kbck......",
        ".....kbccbk.....",
        ".....kc..ck.....",
        ".....kc..ck.....",
        ".....kbccbk.....",
        "......kbck......"
    ];
    put("station", "rope", { pal: SP, rows: chain(false) });
    put("station", "ropeTop", { pal: SP, rows: chain(true) });
    put("station", "ropeEnd", { pal: SP, rows: chain(false).slice(0, 12).concat(["......kbck......", ".....kyyyyk.....", ".....kyzzyk.....", "......kkkk......"]) });

    /* THE WALL LAMP (14 x 19): a lamp in a steel cage on a bracket, its bulb
       warm; its glow (four frames) a slight flicker in the bulb. */
    put("station", "torchBase", { pal: { k: T.out, a: T.p4, b: T.p3, c: T.p2, d: T.p1, w: "#fff6d8", y: "#ffd88a", o: "#e0a040" }, rows: [
        "..............",
        "..kkkkkkkkkk..",
        "..kbccccccbk..",
        "...kkkkkkkk...",
        "....kbkkbk....",
        "...kbywwybk...",
        "...kywwwwyk...",
        "...kbywwybk...",
        "...kkyyyykk...",
        "...kbkookbk...",
        "....kkkkkk....",
        ".....kbbk.....",
        ".....kcck.....",
        "...kkkcckkk...",
        "...kbbbbbbk...",
        "...kkkkkkkk...",
        "..............",
        "..............",
        ".............."
    ] });
    put("station", "flame", { pal: { w: "#ffffff", y: "#fff0b0" }, frames: [["....", ".w..", "....", "...."], ["....", "..w.", "....", "...."], ["....", "....", ".y..", "...."], ["....", ".y..", "....", "...."]] });

    /* THE BLAST DOOR (16 x 48): a slab of plate, hazard stripes across its
       foot and top, bolts down it; the HATCH (48 x 16) the same, lying flat.
       The WHEEL (14 x 14) on the wall beside it, in four turns. */
    const blast = [];
    for (let y = 0; y < 48; y++) {
        let r;
        if (y === 0 || y === 47) r = "kkkkkkkkkkkkkkkk";
        else if (y < 5 || y > 42) r = "k" + [...Array(14)].map((_, i) => ((i + y) >> 1) % 2 ? "y" : "z").join("") + "k";
        else if (y % 10 === 5) r = "kbbbbbbbbbbbbbek";
        else if (y % 10 === 7) r = "kcakccccccccakek";
        else r = "kbccccccccccccek";
        blast.push(r);
    }
    put("station", "blast", { pal: SP, rows: blast });
    put("station", "hatch", { pal: SP, rows: [
        "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk",
        "kyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyk",
        "kzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyk",
        "kbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbk",
        "kbcakccccccccccccccccccccccccccccccccccccccakcek",
        "kbccccccccccccccccccccccccccccccccccccccccccccek",
        "kbcccccccccccccccccccccccccccccccccccccccccccc ek".replace(" ", ""),
        "kbccccccccccccccccccccccccccccccccccccccccccccek",
        "kbcakccccccccccccccccccccccccccccccccccccccakcek",
        "kbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbek",
        "kzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyk",
        "kyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyyk",
        "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk"
    ] });
    const wheel = (t) => {
        // a ring of steel, four spokes to a hub, turned by t eighths of a turn
        const rows = [];
        for (let y = 0; y < 14; y++) {
            let r = "";
            for (let x2 = 0; x2 < 14; x2++) {
                const dx = x2 - 6.5, dy = y - 6.5, dd = Math.hypot(dx, dy);
                let c = ".";
                if (dd <= 6.6 && dd >= 4.6) c = dd > 6 ? "k" : dd > 5.4 ? (dx + dy < 0 ? "a" : "d") : "c";
                else if (dd < 4.6) {
                    const ang = Math.atan2(dy, dx) - t * Math.PI / 8;
                    const spoke = Math.abs(Math.sin(2 * ang)) < 0.5;
                    if (dd < 1.8) c = dd < 1 ? "a" : "k"; else if (spoke) c = "b";
                }
                r += c;
            }
            rows.push(r);
        }
        return rows;
    };
    put("station", "wheel", { pal: Object.assign({}, SP, { a: "#e8d8a0", b: "#c8a040", c: "#8a6a20", d: "#5a4410" }), frames: [wheel(0), wheel(1), wheel(2), wheel(3)] });

    /* THE BEACON (16 x 10): a red emergency light on the wall, its glass dome
       over a turning reflector; drawn with its own red sweep of light. */
    put("station", "relief", { pal: { k: T.out, r: "#e02a2a", R: "#ff8a7a", d: "#7a1010", b: T.p3, c: T.p2 }, frames: [[
        "......kkkk......",
        ".....kRrrrk.....",
        "....kRrrrrdk....",
        "....krrrrrdk....",
        "...kkkkkkkkkk...",
        "...kbbbbbbbbk...",
        "...kccccccccck..".slice(0, 16),
        "..kkkkkkkkkkkk..",
        "................",
        "................"
    ]] });

    /* THE BILGE BOT (18 x 12; 13 Oct 2026, in place of the crab, the owner's
       "a different kind of enemy that fits the theme of the zone more"): a
       squat old maintenance robot, its paint chipped yellow over rust, a
       hazard band round its middle, rolling on treads; one red eye in its
       visor sweeping as it goes. Two frames: the treads turning, the eye
       across. One stomp. */
    const BOT_PAL = { k: "#120c08", a: "#f0d080", b: "#c89a38", c: "#8a5e1c", d: "#4a3010", r: "#ff3a2a", R: "#ffd8c8", e: "#0a0606", y: "#f0c020", z: "#1a1a1a", g: "#3a4048", h: "#8a94a0" };
    put("station", "bot", { pal: BOT_PAL, frames: [
        [
            "......kkkkkk......",
            ".....kaaaabbk.....",
            "....kaakkkkbbk....",
            "....kakeRreebk....",
            "....kbkeeeekck....",
            "..kkkkkkkkkkkkkk..",
            "..kayyzzyyzzyyck..",
            "..kbbbbcbbbbcbck..",
            ".kkkkkkkkkkkkkkkk.",
            "kghhghhghhghhghhgk",
            "kggggggggggggggggk",
            ".kkkkkkkkkkkkkkkk."
        ],
        [
            "......kkkkkk......",
            ".....kaaaabbk.....",
            "....kaakkkkbbk....",
            "....kakeeRrebk....",
            "....kbkeeeekck....",
            "..kkkkkkkkkkkkkk..",
            "..kayyzzyyzzyyck..",
            "..kbbbbcbbbbcbck..",
            ".kkkkkkkkkkkkkkkk.",
            "khghhghhghhghhghhk",
            "kggggggggggggggggk",
            ".kkkkkkkkkkkkkkkk."
        ]
    ] });
    /* THE END DOOR (32 x 48; 13 Oct 2026, the owner's: "the door at the end
       of the sunken levels is still wooden, it should be a big metal door
       like you'd get on a ship"): a watertight door in a riveted steel frame,
       its corners rounded, a striped sill to step over; the slab heavy
       plate with ribs across, a brass porthole high up, dogs down both
       edges, a plate for the padlock. Open: the dark way through, the slab
       swung back against the frame. */
    const SHIP_PAL = { k: "#0a0e14", "2": "#2e3844", "3": "#4a5866", "4": "#7a8a9a", r: "#c8d4e0", y: "#e8c040", z: "#1a1a1a", s: "#55636f", t: "#6e7e8e", p: "#3c4854", B: "#f0d080", b: "#a07820", G: "#bfeaff", g: "#ffffff", h: "#2a5a6a", v: "#05070a", w: "#0c1016" };
    put("station", "door", { pal: SHIP_PAL, rows: [
        ".......kkkkkkkkkkkkkkkkkk.......",
        ".....kk444444444333333333kk.....",
        "...kk44444r44444r33333r3333kk...",
        "..kk444422222222222222223333kk..",
        "..k44422kkkkkkkkkkkkkkkk22333k..",
        ".k44422kkttttttttttttttkk22333k.",
        ".k4422kttttttttttttttttttk2233k.",
        "k4442kttttttttkkkkttttttttk2333k",
        "k442kkttsssskkBBBBkkssssppkk233k",
        "k4r2ktBBBssskBGGGhBksssBBBpk2r3k",
        "k442ktbbbsskBGGGhhhbkssbbbpk233k",
        "k442ktttssskBGGghhhbkssspppk233k",
        "k442ktttsssBBGhghhhbbssspppk233k",
        "k442ktttssskBhhghhhbkssspppk233k",
        "k442ktttssskBhhhhhhbkssspppk233k",
        "k4r2ktttsssskbhhhhbksssspppk2r3k",
        "k442ktttsssskkbbbbkksssspppk233k",
        "k442ktttsssssskkkksssssspppk233k",
        "k442kppppppppppppppppppppppk233k",
        "k442kkkkkkkkkkkkkkkkkkkkkkkk233k",
        "k442kttttttttttttttttttttttk233k",
        "k4r2ktttsskkkkkkkkkkkksspppk2r3k",
        "k332ktttssk4444444444ksspppk222k",
        "k332ktttssk4333333333ksspppk222k",
        "k332ktttssk4333333333ksspppk222k",
        "k332ktttssk4333333333ksspppk222k",
        "k332ktBBBsk4333333333ksBBBpk222k",
        "k3r2ktbbbsk4333333333ksbbbpk2r2k",
        "k332ktttssk4333333333ksspppk222k",
        "k332ktttssk4333333333ksspppk222k",
        "k332ktttssk4333333333ksspppk222k",
        "k332ktttsskkkkkkkkkkkksspppk222k",
        "k332kppppppppppppppppppppppk222k",
        "k3r2kkkkkkkkkkkkkkkkkkkkkkkk2r2k",
        "k332kttttttttttttttttttttttk222k",
        "k332ktttsssssssssssssssspppk222k",
        "k332ktttsssssssssssssssspppk222k",
        "k332ktttsssssssssssssssspppk222k",
        ".k32kkBBBssssssssssssssBBBkk22k.",
        ".kr32kbbbssssssssssssssbbbk22rk.",
        "..k322ktsssssssssssssssspk222k..",
        "..kk322kksssssssssssssskk222kk..",
        "...kk322kkkkkkkkkkkkkkkk222kk...",
        ".....kk322222222222222222kk.....",
        "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk",
        "kzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyk",
        "k222222222222222222222222222222k",
        "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk"
    ] });
    put("station", "doorOpen", { pal: SHIP_PAL, rows: [
        ".......kkkkkkkkkkkkkkkkkk.......",
        ".....kk444444444333333333kk.....",
        "...kk44444r44444r33333r3333kk...",
        "..kk444422222222222222223333kk..",
        "..k44422vvvvvvvvvvvvvvvv22333k..",
        ".k44422svvvvvvvvvvvvvvvvv22333k.",
        ".k4422tskvvvvvvvvvvvvvvvvv2233k.",
        "k4442ttskvvvvvvvvvvvvvvvvvv2333k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k4r2kttskvvvvvvvvvvvvvvvvvvv2r3k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k4r2kttskvvvvvvvvvvvvvvvvvvv2r3k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k442kttskvvvvvvvvvvvvvvvvvvv233k",
        "k4r2kttskvvvvvvvvvvvvvvvvvvv2r3k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k3r2kttskvvvvvvvvvvvvvvvvvvv2r2k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k3r2kttskvvvvvvvvvvvvvvvvvvv2r2k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        "k332kttskvvvvvvvvvvvvvvvvvvv222k",
        ".k32kttskvvvvvvvvvvvvvvvvvvv22k.",
        ".kr32ttskwwwwwwwwwwwwwwwwww22rk.",
        "..k322tskwwwwwwwwwwwwwwwww222k..",
        "..kk322svwwwwwwwwwwwwwwww222kk..",
        "...kk322vwwwwwwwwwwwwwww222kk...",
        ".....kk322222222222222222kk.....",
        "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk",
        "kzyyzzyyzzyyzzyyzzyyzzyyzzyyzzyk",
        "k222222222222222222222222222222k",
        "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk"
    ] });
    /* THE OXYGEN TANK (16 x 24; 13 Oct 2026, the owner's: "for long
       sections under water, the occasional oxygen tank that the player can
       stand next to to refill their breath"): a green cylinder, a white band
       and a gauge, a red valve on top, bubbles always rising from it. */
    put("station", "tank", { pal: { k: "#06120c", a: "#b0f8c8", b: "#5ad08a", c: "#2a9a58", d: "#14602e", w: "#ffffff", W: "#dfe8e4", V: "#a8b4b0", r: "#e02a2a", R: "#ff8a7a", m: "#8a94a0", M: "#c8d0d8" }, rows: [
        ".....kkkkkk.....",
        "....kRRrrrrk....",
        ".....kkkkkk.....",
        "......kmmk......",
        ".....kMMMMk.....",
        ".....kkkkkk.....",
        "...kabbbcccdk...",
        "..kaabbbcccddk..",
        "..kaabbbcccddk..",
        "..kaabbbcccddk..",
        "..kkkkkkkkkkkk..",
        "..kwwWWWWWWVVk..",
        "..kwwWWkrWWVVk..",
        "..kwwWWkkWWVVk..",
        "..kwwWWWWWWVVk..",
        "..kkkkkkkkkkkk..",
        "..kaabbbcccddk..",
        "..kaabbbcccddk..",
        "..kaabbbcccddk..",
        "..kaabbbcccddk..",
        "..kaabbbcccddk..",
        "..kaabbbcccddk..",
        "..kaabbbcccddk..",
        ".kkkkkkkkkkkkkk."
    ] });
    /* THE JELLYFISH (14 x 16): a pale dome, glowing a little, its trailing
       stinging threads; it pulses (two frames). */
    put("station", "jelly", { pal: { k: "#2a0a3a", a: "#fbe0ff", b: "#e2a8f4", c: "#b06ad8", d: "#7a3aa8" }, frames: [
        [
            "....kkkkkk....",
            "..kkaaaabbkk..",
            ".kaabbbbbbcck.",
            "kabbbbbbbbbcck",
            "kbbcbbcbbcbbck",
            "kkbkkbkkbkkbkk",
            ".c.b..b..b.c..",
            ".c..b.b.b..c..",
            "..c.b..b.b.c..",
            "..c..b.b..c...",
            "...c.b..b.c...",
            "...c..b.b.c...",
            "....c.b..c....",
            "....c..b.c....",
            ".....c.b......",
            "......c......."
        ],
        [
            "..............",
            "...kkkkkkkk...",
            ".kkaaaabbbbkk.",
            "kaabbbbbbbbcck",
            "kkbcbbcbbcbckk",
            ".kbkkbkkbkkbk.",
            "..c.b..b..b.c.",
            "..c..b.b.b..c.",
            ".c..b..b.b.c..",
            ".c..b.b..b.c..",
            "..c.b..b..b.c.",
            "..c..b.b.b..c.",
            "...c.b..b..c..",
            "...c..b.b.c...",
            "....c.b..c....",
            ".....c..c....."
        ]
    ] });


    /* ================================================================ 6. THE HEART OF THE LABYRINTH
       The secret at the very end, open only to one who has found every
       ruby: the labyrinth's heart, where the thread was first tied. Walls of
       white marble veined with grey and gold, in great blocks with gilded
       joints; crimson hangings behind with a lattice of gold; golden columns
       standing in front; marble ledges edged in gold; gold everywhere. */
    const HT = {
        out: "#1a0e06",
        m0: "#bfb3a0", m1: "#d8cfbe", m2: "#ebe4d6", m3: "#f8f4ec", vein: "#a8a090", veinGold: "#c8a040",
        g0: "#6a4a10", g1: "#a07820", g2: "#d4a838", g3: "#ffe080",
        v0: "#22060e", v1: "#320a16", v2: "#42101e"
    };
    themes.heart = {
        // (16 Oct 2026) the rig its moving platforms hang from (js/rat-race.js, THE RIGS), in its own materials
        rig: { beam: "girder", line: "chain", iron: ["#1a0e06", "#6a4a10", "#a07820", "#d4a838", "#ffe080"], gild: "#fff3c0" },
        key: "heart",
        timber: { d: HT.out, s: HT.g0, m: HT.g1, l: HT.g3, q: HT.g2 },
        edge: { out: HT.out, lit: HT.m3, dark: HT.m0 },
        moss: false, embers: true, soot: false,
        glow: [255, 210, 120], air: [255, 230, 160],
        stones: [["#a07820", "#d4a838", "#ffe080"], ["#bfb3a0", "#d8cfbe", "#f8f4ec"], ["#8a6a20", "#c8a040", "#ffe8a0"]],
        dirt: ["#3a2a0a", "#5a420e"], shard: ["#ffe080", "#d4a838"],
        // MARBLE in great blocks, 32 by 16, gilded joints, veins wandering through it
        wall(x, a, tx, ty, px, py, h) {
            for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
                const wx = tx * 16 + i, wy = ty * 16 + j;
                const course = Math.floor(wy / 16), along = (wx + (course % 2) * 16) % 32, row = wy % 16;
                let c;
                if (row === 15 || along === 0) c = HT.g1;
                else if (row === 0 || along === 1) c = HT.m3;
                else if (row === 14 || along === 31) c = HT.m0;
                else {
                    const n = vnoise(wx, wy, 70);
                    c = n < 0.35 ? HT.m1 : n < 0.8 ? HT.m2 : HT.m3;
                    const v = Math.abs(Math.sin((wx + wy * 1.7) / 9 + vnoise(wx * 2, wy * 2, 5) * 4));
                    if (v < 0.05) c = hash2(Math.floor(wx / 7), course) < 0.3 ? HT.veinGold : HT.vein;
                }
                x.fillStyle = c; x.fillRect(px + i, py + j, 1, 1);
            }
        },
        lip(x, a, tx, ty, px, py, h) {
            x.fillStyle = HT.out; x.fillRect(px, py, 16, 1);
            x.fillStyle = HT.g3; x.fillRect(px, py + 1, 16, 1);
            x.fillStyle = HT.g2; x.fillRect(px, py + 2, 16, 1);
            x.fillStyle = HT.g1; x.fillRect(px, py + 3, 16, 1);
            if (((tx * 16) >> 3) % 2 === 0) { x.fillStyle = HT.g3; x.fillRect(px + 6, py + 2, 1, 1); }
        },
        // CRIMSON hung behind, a lattice of gold over it
        back(x, a, h) {
            const W = a.w * 16, H = a.h * 16;
            const img = x.createImageData(W, H), d = img.data;
            const v = [HT.v0, HT.v1, HT.v2].map(rgb), gl = rgb(HT.g0), gl2 = rgb(HT.g1);
            for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
                const n = vnoise(px, py * 0.4, 12);
                let c = v[n < 0.35 ? 0 : n < 0.75 ? 1 : 2];
                const u = (px + py) % 24, w2 = (px - py + 2400) % 24;
                if (u === 0 || w2 === 0) c = gl;
                if ((u === 0 && w2 === 0) || (u === 12 && w2 === 12)) c = gl2;
                const i = (py * W + px) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
            }
            x.putImageData(img, 0, 0);
        },
        // GOLDEN COLUMNS, fluted, every ten tiles
        frameW: { post: 18 },
        frameParts(a) {
            const out = [];
            for (let tx = 6; tx < a.w; tx += 10) out.push({ type: "post", x: tx * 16 - 1, y: 0, h: a.h * 16 });
            return out;
        },
        frame(x, a, h, parts) {
            const cols = [HT.out, HT.g3, HT.g2, HT.g2, HT.g1, HT.g2, HT.g1, HT.g2, HT.g1, HT.g2, HT.g1, HT.g2, HT.g1, HT.g0, HT.g1, HT.g0, HT.g0, HT.out];
            for (const p of parts) if (p.type === "post") cols.forEach((c, i) => { x.fillStyle = c; x.fillRect(p.x + i, p.y, 1, p.h); });
        },
        // A LEDGE of marble, edged in gold
        platform(x, X, Y, W, o, h) {
            const fill = (c, x0, y0, w2, h2) => { x.fillStyle = c; x.fillRect(x0, y0, w2, h2); };
            fill(HT.out, X, Y, W, 10);
            fill(HT.g3, X + 1, Y + 1, W - 2, 1); fill(HT.g2, X + 1, Y + 2, W - 2, 1);
            fill(HT.m2, X + 1, Y + 3, W - 2, 4); fill(HT.m1, X + 1, Y + 7, W - 2, 1);
            fill(HT.g1, X + 1, Y + 8, W - 2, 1);
            for (let i = 6; i < W - 4; i += 12) fill(HT.m3, X + i, Y + 4, 3, 1);
        },
        // PROPS: heaps of gold, a golden urn
        props(x, a, h, spots) {
            for (const sp of spots) {
                const { px, py, kind } = sp;
                if (kind === 1) x.drawImage(h.spr("hurn", 0), px + 2, py + 1);
                else x.drawImage(h.spr("hgold", 0), px - 2, py + 7);
            }
        }
    };
    const HP = { k: HT.out, a: HT.g3, b: HT.g2, c: HT.g1, d: HT.g0, w: "#ffffff", r: "#e0384e" };
    put("heart", "hgold", { pal: HP, rows: [
        "........kkk.........",
        "......kkaabk........",
        ".....kabbabbk.......",
        "...kkabkbbkbbkk.....",
        "..kabbbbabbbbbbk.k..",
        ".kabbkbbbbbkbbbbkak.",
        "kabbbbbbbrbbbbcbbbbk",
        "kkkkkkkkkkkkkkkkkkkk",
        "...................."
    ] });
    put("heart", "hurn", { pal: HP, rows: [
        "...kkkkkk...",
        "...kaaabk...",
        "....kbbk....",
        "..kkaabbkk..",
        ".kaabbbbbck.",
        "kaabbrbbbbck",
        "kabbbbbbbbck",
        "kabbbbbbbccdk".slice(0, 12),
        ".kbbbbbbccdk".slice(0, 12),
        "..kccccccdk.",
        "...kkccckk..",
        "...kabbcck..",
        "..kkkkkkkkk.",
        "............",
        "............"
    ] });
    put("heart", "rubble", { pal: HP, rows: [
        "................",
        "........kk......",
        "..kk...kabk.....",
        ".kabk..kbcdk.kk.",
        "kbccdk..kddkkabk",
        "kcdddk...kkkbcdk",
        ".kkkk.......kkk.",
        "................"
    ] });
    put("heart", "spikes", { pal: HP, rows: [
        "..k.....k.....k.",
        "..k.....k.....k.",
        ".kak...kak...kak",
        ".kak...kak...kab",
        "kabck.kabck.kabc",
        "kbcdk.kbcdk.kbcd",
        "kbcdkkkbcdkkkbcd",
        "kkkkkkkkkkkkkkkk"
    ] });

    /* ================================================================ THE NEW ZONES (14 Oct 2026)
       The owner's pick of the overnight ideas, one passage each to try:
       the Clockwork Vault, the Sandfall Tomb, the Lava Foundry and the
       Overgrown Ruins. Their creatures and lamps come from the scratchpad's
       lab/sprites-new.js (letter grids drawn with a few shape tools). */
    const NEW = {"mouse":[["......ksssssk.......","......ksktksk...k...",".......kktkk...ktk..","....kkkkatakkkkssk..","...kaaaaaaaaaaakbk..","k.kaaaaaaaaaaaabbak.","tktbaaaaaaaaaabbbebk","ktkbbbbbaaabbbbbbbck",".kkcctccccccctccbkk.","...ksttkbbbksttkk...","....ktk.kkk.ktk....."],["......ksssssk.......","......ksktksk...k...",".......kktkk...ktk..","....kkkkatakkkkssk..",".k.kaaaaaaaaaaakbk..","ktkaaaaaaaaaaaabbak.","tktbaaaaaaaaaabbbebk","k.kbbbbbaaabbbbbbbck","..kcctccccccctccbkk.","...kttskbbbkttskk...","....ktk.kkk.ktk....."]],"bird":[["..................","..................",".........k...k....","......kkkakkkekkk.",".....kaaaaaabbbcck","....kbbabaabbbkkk.","..kkkaabbbbabk....",".kcaakbbktkbaak...",".kakbbkk.k.kbkak..","..kbkk......kbk..."],["..kak.......kak...","...kbk.....kbk....","....kbkk.kkbak....",".....kbbkakbkekkk.",".....kaabababbbcck","....kbbbbabbbbkkk.","..kkkcbbbbbbbk....",".kccckkkktkkk.....","..kkk....k........",".................."]],"ember":[["..................","........ddd.......",".......drrrd......","......dryoord.....",".....drywykkrd....","....ddooyoooodd...","...doorooooorood..","..dorrdrooordrrod.",".drrdd.drrrd.ddrrd","..dd....ddd....dd."],["..d.............d.",".drd....ddd....drd","..dodd.drrrd.ddod.","...dordryoordrod..","....dorywykkrod...",".....dooyooood....",".....drooooord....","......drooord.....",".......drrrd......","........ddd......."]],"press":[["............ktsstttk............","............ktsstttk............","............ktsstttk............","............ktsstttk............","............ktsstttk............","..kkkkkkkkkkktsstttkkkkkkkkkkk..",".kssssssssssssssssssssssssssttk.",".kssssssssssssssssssssssssssttk.",".kssmmmmmmmmmmmmmmmmmmmmmmmmttk.",".kssmwmmmmmmmmmmmmmmmmmmmmwmttk.",".kssmmmmmmmmmmmmmmmmmmmmmmmmttk.",".kssmmmmmmmmmmmmmmmmmmmmmmmmttk.",".kssmmmmmmmmmmmmmmmmmmmmmmmmttk.",".kssmmmmmmmmmmmmmmmmmmmmmmmmttk.",".kssmmmmmmmmmmmmmmmmmmmmmmmmttk.",".kssmwmmmmmmmmmmmmmmmmmmmmwmttk.",".kssmmmmmmmmmmmmmmmmmmmmmmmmttk.",".kssmmmmmmmmmmmmmmmmmmmmmmmmttk.","..kkkkyyyykkkkyyyykkkkyyyykkkk..","..kkkkyyyykkkkyyyykkkkyyyykkkk..","......kkkk....kkkk....kkkk......","................................"]],"frog":[["................","............k...","...........kak..",".........kkaewk.",".......kkbbbabk.","....kkkabbbbbbbk","...kaaaaabbbbbck","..kaaaaaaaabaak.",".kbbaaaaaaaaabbk","..kbbbyaaybbbbk.","..kccccbbbcccck.","...kkkkbbbkkkk.."],["................",".............k..",".......kkk..kak.","...kkkkaaakkaeak","..kaaaaaaaaaaak.",".kbbbbbaaabbbbbk","..kcbbbbbbbbcbk.",".kcbkkkbbbkkkck.",".kcbk..kkk..kck.","kcbk.........kck","ckbk..........k.","kbk............."]],"caterpillar":[[".....krrrk....","...kkrwrrrkk..","..kbbrrrerbbk.",".kbabrrrrrbbbk",".kbbbbrrrbbbbk",".kbbbababbbbbk","..kbbbbbbbybk.","...kbbbbbbbk..","....kbybybk...",".....kkkkk....",".............."],["...kkkrrrk....","..kbbrwrrrk...",".kbabrrrerkk..",".kbbbrrrrrbbk.",".kbbbarrrabbbk","..kbbbbabbbbbk","...kbbbbbbbbbk","....kbbbbbybk.",".....kkbybkk..",".......kkk....",".............."]],"vine":[["......kbak......","......kbak.k....",".......kbckLkk..",".......kblllllk.",".......kbaklkk..",".......kbakk....",".......kbck.....","......kbck......","......kbak......","...k..kbak......",".kkLkkbck.......","klllllbck.......",".kklkkbak.......","...k.kbak.......",".....kbck.......","......kbck......"]],"vineTop":[["...kcllllllck...","...kcccccccck...","....kkkkbckLkk..",".......kblllllk.",".......kbaklkk..",".......kbakk....",".......kbck.....","......kbck......","......kbak......","...k..kbak......",".kkLkkbck.......","klllllbck.......",".kklkkbak.......","...k.kbak.......",".....kbck.......","......kbck......"]],"vineEnd":[["......kbak......","......kbak.k....",".......kbckLkk..",".......kblllllk.",".......kbaklkk..",".......kbakk....",".......kbck.....","......kbck......","......kbak......","...k..kbak......",".kkLkkbck.......","klllllbclk......",".kklkkklLlk.....","...k.klllllk....","......klllk.....","......kclk......"]],"gaslamp":[["kcccck........","kcaack........","kccccckk......",".kkkkkcckkkkk.","....kaaaaaaaak","....kbbbbbbbbk",".....kGgggggk.",".....kGgggggk.",".....kGgggggk.",".....kGgggggk.",".....kGgggggk.",".....kGgggggk.",".....kGgggggk.",".....kGgggggk.","....kbbbbbbbbk","....kbbbbbbbbk",".....kkcccckk.","......kcccck..",".......kckk..."]],"gasflame":[["......","...B..","...B..","..BWB.","...B..","...C.."],["...B..","...B..","...B..","..BWB.","...B..","...C.."],["......","...B..","...W..","..BBB.","...B..","...C.."],["...B..","...B..","...B..","..BWB.","...B..","...C.."]],"bulb":[[".....kttk.....",".....kttk.....",".....kttk.....",".....kttk.....","....kkttkk....","...kssssssk...","...kssssssk...","..kttttttttk..","..kggtggtggk..","..kggtggtggk..","..kttttttttk..","..kggtggtggk..","..kggtggtggk..","..kttttttttk..","..kggtggtggk..","..kggtggtggk..","...kksssskk...",".....kkkk.....",".............."]],"bulbglow":[["......","..OOO.",".OOWOO",".OOOOO",".OOOOO","..OOO."],["......","..YYY.",".YYWYY",".YYYYY",".YYYYY","..YYY."],["......","..OOO.",".OOWOO",".OOOOO",".OOOOO","..OOO."],["......","..YYY.",".YYWYY",".YYYYY",".YYYYY","..YYY."]]};
    // a span of rows into a filled shape on a canvas: used by the backdrops
    const span = (g, c, x, y, w) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), 1); };

    // ---------------------------------------------------------------- 7. THE CLOCKWORK VAULT
    const CL = { out: "#120a04", w0: "#1a0f08", w1: "#2a180c", w2: "#3a2212", w3: "#4e3018", w4: "#64401f", b0: "#5a3a10", b1: "#8a5e18", b2: "#c8962e", b3: "#f2cc4e", b4: "#fff0a0", s0: "#22262e", s1: "#3e4650", s2: "#6a7684", s3: "#a8b4c2" };
    // a gear: teeth, a rim, spokes, a hub; turned by `ang`
    function gear(g, cx, cy, r, teeth, ang, col, dark, hi) {
        for (let i = 0; i < teeth; i++) { const a = ang + i / teeth * Math.PI * 2, x = cx + Math.cos(a) * (r + 2), y = cy + Math.sin(a) * (r + 2); g.fillStyle = col; g.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6); }
        for (let dy = -r; dy <= r; dy++) { const w = Math.sqrt(r * r - dy * dy); span(g, col, cx - w, cy + dy, w * 2 + 1); }
        const ri = r - 5;
        for (let dy = -ri; dy <= ri; dy++) { const w = Math.sqrt(ri * ri - dy * dy); span(g, dark, cx - w, cy + dy, w * 2 + 1); }
        for (let k = 0; k < 5; k++) { const a = ang + k / 5 * Math.PI * 2; for (let t = 0; t < ri; t++) { g.fillStyle = col; g.fillRect(Math.round(cx + Math.cos(a) * t) - 1, Math.round(cy + Math.sin(a) * t) - 1, 3, 3); } }
        const rh = Math.max(3, Math.round(r * 0.22));
        for (let dy = -rh; dy <= rh; dy++) { const w = Math.sqrt(rh * rh - dy * dy); span(g, col, cx - w, cy + dy, w * 2 + 1); }
        g.fillStyle = hi; g.fillRect(cx - 1, cy - 1, 2, 2);
    }
    sprites["rat@clock"] = { pal: { k: CL.out, a: CL.b3, b: CL.b2, c: CL.b1, s: CL.s3, t: CL.s1, e: "#ff4a3a" }, frames: NEW.mouse };
    sprites["bat@clock"] = { pal: { k: CL.out, a: CL.b3, b: CL.b2, c: CL.b1, t: CL.s1, e: "#ff4a3a" }, frames: NEW.bird };
    sprites["torchBase@clock"] = { pal: { k: CL.out, a: CL.b3, b: CL.b2, c: CL.b1, g: "#3a3020", G: "#6a5a40" }, rows: NEW.gaslamp[0] };
    sprites["flame@clock"] = { pal: { B: "#9ad0ff", W: "#ffffff", C: "#3a6aff" }, frames: NEW.gasflame };
    themes.clock = {
        key: "clock", beat: 36, allBack: true,
        timber: { d: CL.out, s: CL.b0, m: CL.b1, l: CL.b2, q: CL.b2 },
        edge: { out: CL.out, lit: CL.b2, dark: CL.w0 },
        moss: false, embers: false, soot: false,
        glow: [255, 214, 150], air: [240, 220, 180],
        stones: [[CL.b0, CL.b1, CL.b2], [CL.s0, CL.s1, CL.s2], [CL.w1, CL.w2, CL.w3]], dirt: [CL.w0, CL.w1], shard: [CL.b2, CL.b1],
        lampAt: { bx: 1, by: -2, fx: 7, fy: 6, gx: 9, gy: 8 },
        /* THE WALLS: walnut panelling in boards eight deep, its grain, a brass
           band with rivets every third course; dark where it is deep. */
        wall(x, a, tx, ty, px, py) {
            for (let j = 0; j < 16; j++) {
                const wy = ty * 16 + j, course = Math.floor(wy / 8), r = wy % 8, band = course % 6 === 0;
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i, seam = (wx + course * 23) % 48;
                    let c = r === 0 ? CL.w4 : r === 7 ? CL.w0 : CL.w2;
                    if (r > 0 && r < 7) { const n = hash2(Math.floor(wx / 5), course * 3 + r); c = n < 0.25 ? CL.w1 : n > 0.85 ? CL.w3 : CL.w2; }
                    if (seam === 0) c = CL.w0; else if (seam === 1) c = CL.w4;
                    if (band) { c = r < 2 ? CL.b3 : r < 5 ? CL.b2 : r < 7 ? CL.b1 : CL.b0; if (r === 3 && wx % 12 === 4) c = CL.b4; }
                    x.fillStyle = c; x.fillRect(px + i, py + j, 1, 1);
                }
            }
        },
        lip(x, a, tx, ty, px, py) {
            x.fillStyle = CL.out; x.fillRect(px, py, 16, 1);
            x.fillStyle = CL.b3; x.fillRect(px, py + 1, 16, 1); x.fillStyle = CL.b2; x.fillRect(px, py + 2, 16, 1); x.fillStyle = CL.b1; x.fillRect(px, py + 3, 16, 1);
            x.fillStyle = CL.b4; x.fillRect(px + 3, py + 2, 1, 1); x.fillRect(px + 11, py + 2, 1, 1);
        },
        back(x, a) { x.fillStyle = CL.w0; x.fillRect(0, 0, a.w * 16, a.h * 16); },
        frame() {},
        /* BEHIND IT ALL: the vault's works, turning. Gears the size of rooms in
           the dark, each turning a notch on every beat, one way and the next
           the other, so they mesh; a pendulum swinging two beats a swing. */
        sky(g, cam, a, h) {
            g.fillStyle = "#120a05"; g.fillRect(0, 0, h.VW, h.VH);
            // the panelled back of the vault, slow
            const ox = Math.round(cam.x * 0.2) % 40;
            for (let X = -ox; X < h.VW; X += 40) { g.fillStyle = "#1a0f07"; g.fillRect(X, 0, 2, h.VH); g.fillStyle = "#24150a"; g.fillRect(X + 2, 0, 1, h.VH); }
            const B = 36, n = Math.floor(a.clock / B), f = (a.clock % B) / B, tick = n + Math.min(1, f * 6) ** 0.5;
            // the pendulum, far back
            const px0 = h.VW * 0.5 - (cam.x * 0.15) % (h.VW * 2) + h.VW, sw = Math.sin(a.clock / (B * 2) * Math.PI) * 0.35, len = 150;
            for (let t = 0; t < len; t += 1) { g.fillStyle = "#3a2410"; g.fillRect(Math.round(px0 % (h.VW * 2) - h.VW * 0.5 + Math.sin(sw) * t), Math.round(-20 + Math.cos(sw) * t), 2, 1); }
            for (let dy = -14; dy <= 14; dy++) { const w = Math.sqrt(196 - dy * dy); span(g, "#4a3010", px0 % (h.VW * 2) - h.VW * 0.5 + Math.sin(sw) * len - w, -20 + Math.cos(sw) * len + dy, w * 2); }
            // the gears, at two depths
            for (const [k, col, dark, hi] of [[0.25, "#2c1c0c", "#1a1008", "#4a3010"], [0.45, "#3e2810", "#20140a", "#6a4818"]]) {
                const step = k < 0.3 ? 170 : 130;
                for (let i = Math.floor((cam.x * k - 120) / step); i <= Math.floor((cam.x * k + h.VW + 120) / step); i++) {
                    const r = 28 + Math.floor(hash2(i, k * 100) * 40), teeth = 10 + Math.floor(r / 6);
                    const cx = i * step - cam.x * k + 40, cy = 60 + hash2(i, 7 + k * 10) * 120 - ((cam.y * k) % 260);
                    for (const yy of [cy, cy + 260]) gear(g, cx, yy, r, teeth, (i % 2 ? 1 : -1) * tick * Math.PI * 2 / teeth, col, dark, hi);
                }
            }
            const gr = g.createLinearGradient(0, 0, 0, h.VH); gr.addColorStop(0, "rgba(0,0,0,0.35)"); gr.addColorStop(0.5, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.3)"); g.fillStyle = gr; g.fillRect(0, 0, h.VW, h.VH);
        },
        // A BEAM: a brass girder, its web cut in triangles
        platform(x, X, Y, W, o) {
            x.fillStyle = CL.out; x.fillRect(X, Y, W, 9);
            x.fillStyle = CL.b3; x.fillRect(X + 1, Y + 1, W - 2, 1); x.fillStyle = CL.b2; x.fillRect(X + 1, Y + 2, W - 2, 1);
            x.fillStyle = CL.b1; x.fillRect(X + 1, Y + 7, W - 2, 1);
            for (let i = 1; i < W - 1; i++) { const k = (i + X) % 8; x.fillStyle = (k === Math.abs(4 - ((Y >> 0) % 1)) || k === 0) ? CL.b1 : CL.w0; x.fillRect(X + i, Y + 3, 1, 4); }
            for (let i = 2; i < W - 2; i += 8) { x.fillStyle = CL.b2; for (let t = 0; t < 4; t++) { x.fillRect(X + i + t, Y + 3 + t, 1, 1); x.fillRect(X + i + 7 - t, Y + 3 + t, 1, 1); } }
        },
        mover(g, m, a, h) {
            const X = Math.round(m.x), Y = Math.round(m.y);
            for (const rx of [X + 6, X + m.w - 8]) { g.fillStyle = CL.out; g.fillRect(rx, Y - 70, 3, 70); g.fillStyle = CL.s2; g.fillRect(rx + 1, Y - 70, 1, 70); }
            this.platform(g, X, Y, m.w, {});
        },
        // (14 Oct 2026) the scenery, chosen by each spot's own number, standing on the floor (dimmed: behind Scout)
        props(x, a, h, spots) {
            const PICK = [["cog"],["cogPair"],["spring","crateSmall"],["valve"],["crateIron"],["chainHeap"]];
            for (const sp of spots) {
                const names = PICK[Math.floor(sp.hv * 1000) % PICK.length];
                let dx = 0;
                for (const n of names) { const img = h.dim(h.spr(n, 0)); if (!img) continue; x.drawImage(img, sp.px + dx, sp.py + 16 - img.height); dx += img.width - 2; }
            }
        }
    };

    // ---------------------------------------------------------------- 8. THE SANDFALL TOMB
    const TB = { out: "#1e1008", s0: "#3e2612", s1: "#5e3c1e", s2: "#7e5630", s3: "#a27242", s4: "#c69458", s5: "#e2b878", s6: "#f4d49a", tq: "#1e7a7a", tq2: "#4ec0b8", oc: "#a43a24", gd: "#c8962e" };
    const BEETLE_SCARAB = { k: "#0e1614", A: "#14403a", B: "#1e6a5a", C: "#2e9a82", D: "#8ae0c4", E: "#0a2420", H: "#12100a", R: "#e8b030", M: "#c8962e", G: "#8a6a2a", F: "#5a4a1a" };
    themes.tomb = {
        // (16 Oct 2026) the rig its moving platforms hang from (js/rat-race.js, THE RIGS), in its own materials
        rig: { beam: "timber", line: "rope", wood: ["#1e1208", "#4a2e14", "#6a4420", "#8a5c2c", "#b07a3e", "#d09a58"], iron: ["#1a1006", "#4a3010", "#7a5420", "#b07c34", "#e0b060"], rope: ["#4a3410", "#8a6a30", "#c0a060", "#e8d098"] },
        key: "tomb", sand: true,
        timber: { d: TB.out, s: TB.s1, m: TB.s2, l: TB.s4, q: TB.s3 },
        edge: { out: TB.out, lit: TB.s5, dark: TB.s1 },
        moss: false, embers: true, soot: true,
        glow: [255, 180, 100], air: [240, 214, 170],
        stones: [[TB.s2, TB.s3, TB.s4], [TB.s1, TB.s2, TB.s3], [TB.s3, TB.s4, TB.s5]], dirt: [TB.s0, TB.s1], shard: [TB.s4, TB.s2],
        /* THE WALLS: dressed sandstone in big blocks, thirty-two by sixteen,
           each course staggered by half; lit along the top and left, shaded
           at the foot; worn at the corners; now and then a block carved with a
           picture (an eye, a bird, the waves) in shallow relief. */
        wall(x, a, tx, ty, px, py) {
            for (let j = 0; j < 16; j++) {
                const wy = ty * 16 + j, course = Math.floor(wy / 16), r = wy % 16;
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i, off = (course % 2) * 16, blk = Math.floor((wx + off) / 32), along = (wx + off) % 32;
                    const tone = hash2(blk, course * 5), glyph = hash2(blk * 3, course) < 0.1;
                    let c = tone < 0.33 ? TB.s3 : tone < 0.66 ? TB.s4 : TB.s2;
                    if (r === 0 || along === 0) c = TB.out;
                    else if (r === 1 || along === 1) c = TB.s5;
                    else if (r === 15 || along === 31) c = TB.s1;
                    else { const n = hash2(wx, wy); if (n < 0.08) c = TB.s2; else if (n > 0.96) c = TB.s5; }
                    if ((r <= 2 && along <= 2) || (r >= 14 && along >= 30)) c = TB.s1;   // worn corners
                    if (glyph && r > 3 && r < 13 && along > 8 && along < 24) {
                        const gx = along - 16, gy = r - 8, kind = Math.floor(hash2(blk, course * 7) * 3);
                        let on = false;
                        if (kind === 0) on = Math.abs(gx * gx / 30 + gy * gy / 6 - 1) < 0.35 || (gx * gx + gy * gy < 3);    // an eye
                        else if (kind === 1) on = (gy === 1 && Math.abs(gx) < 6) || (gy === -2 && gx > -2 && gx < 4) || (gx === -5 && gy > -1 && gy < 3) || (gx === 4 && gy === -3);   // a bird
                        else on = (gy === -2 || gy === 2) && ((gx + 20 + (gy > 0 ? 2 : 0)) % 4 < 2);   // the waves
                        if (on) c = TB.s1;
                    }
                    x.fillStyle = c; x.fillRect(px + i, py + j, 1, 1);
                }
            }
        },
        // The top of a wall: sand drifted on it, rippled
        lip(x, a, tx, ty, px, py) {
            for (let i = 0; i < 16; i++) { const wx = tx * 16 + i, rip = Math.round(Math.sin(wx / 3) * 0.6); x.fillStyle = TB.out; x.fillRect(px + i, py - 1 + rip, 1, 1); x.fillStyle = TB.s6; x.fillRect(px + i, py + rip, 1, 1); x.fillStyle = TB.s5; x.fillRect(px + i, py + 1 + rip, 1, 2); }
        },
        /* THE BACK WALL: the same stone, darker and further off, a painted
           frieze along every room (turquoise and ochre, a zigzag of water). */
        back(x, a) {
            const W = a.w * 16, H = a.h * 16;
            for (let y = 0; y < H; y += 12) for (let X = ((y / 12) % 2) * 20; X < W; X += 40) { const t = hash2(X, y); x.fillStyle = t < 0.5 ? "#3a2412" : "#432a16"; x.fillRect(X, y, 39, 11); x.fillStyle = "#4e321a"; x.fillRect(X, y, 39, 1); x.fillStyle = "#2a1a0c"; x.fillRect(X, y + 11, 40, 1); }
            for (let ry = 0; ry * 14 < a.h; ry++) {
                const y = ry * 224 + 40;
                x.fillStyle = "#1a3a3a"; x.fillRect(0, y, W, 10);
                for (let X = 0; X < W; X++) { const z = Math.abs(((X % 16) - 8)) / 2; x.fillStyle = TB.tq; x.fillRect(X, y + 2 + Math.round(z), 1, 2); x.fillStyle = TB.oc; x.fillRect(X, y + 8, 1, 1); }
                x.fillStyle = TB.gd; x.fillRect(0, y, W, 1); x.fillRect(0, y + 9, W, 1);
            }
        },
        // columns with lotus tops, every ten tiles, in shadow behind
        frame(x, a) {
            const H = a.h * 16;
            for (let tx = 6; tx < a.w; tx += 10) {
                const X = tx * 16 - 2;
                x.fillStyle = "#24160a"; x.fillRect(X, 0, 14, H); x.fillStyle = "#3a2614"; x.fillRect(X + 2, 0, 9, H); x.fillStyle = "#4a3220"; x.fillRect(X + 3, 0, 2, H);
                for (let ry = 0; ry * 14 < a.h; ry++) { const y = ry * 224 + 30; x.fillStyle = "#4a3220"; x.fillRect(X - 3, y, 20, 8); x.fillStyle = TB.tq; x.fillRect(X - 2, y + 2, 18, 2); x.fillStyle = "#24160a"; x.fillRect(X - 3, y + 8, 20, 1); }
            }
        },
        // A BEAM: a slab of sandstone, lit on top, sand on it
        platform(x, X, Y, W) {
            x.fillStyle = TB.out; x.fillRect(X, Y, W, 9);
            x.fillStyle = TB.s6; x.fillRect(X + 1, Y + 1, W - 2, 1); x.fillStyle = TB.s4; x.fillRect(X + 1, Y + 2, W - 2, 5); x.fillStyle = TB.s2; x.fillRect(X + 1, Y + 7, W - 2, 1);
            for (let i = 4; i < W - 4; i += 9) { x.fillStyle = TB.s3; x.fillRect(X + i, Y + 4, 3, 1); }
        },
        // (14 Oct 2026) the scenery, chosen by each spot's own number, standing on the floor (dimmed: behind Scout)
        props(x, a, h, spots) {
            const PICK = [["urnGold"],["sandHeap"],["canopic","pot"],["amphora"],["potBroken"],["skull","pebbles"]];
            for (const sp of spots) {
                const names = PICK[Math.floor(sp.hv * 1000) % PICK.length];
                let dx = 0;
                for (const n of names) { const img = h.dim(h.spr(n, 0)); if (!img) continue; x.drawImage(img, sp.px + dx, sp.py + 16 - img.height); dx += img.width - 2; }
            }
        }
    };
    sprites["beetle@tomb"] = { pal: BEETLE_SCARAB, frames: sprites["beetle@quarry"].frames };

    // ---------------------------------------------------------------- 9. THE LAVA FOUNDRY
    const FD = { out: "#0a0606", i0: "#161216", i1: "#26202a", i2: "#3a3240", i3: "#5a5262", i4: "#8a8294", b0: "#2a0e0a", b1: "#3e160e", b2: "#561e12", b3: "#6e2a18", b4: "#8a3a22", hot: "#ff8a30", hot2: "#ffd060", hz: "#e8b020" };
    sprites["grub@foundry"] = { pal: { k: "#1a0806", a: "#ffd060", b: "#ff8a30", c: "#c84a14", d: "#6a1e0a", e: "#ffffff", f: "#ffe8a0", g: "#ff6a20", h: "#a83010" }, frames: sprites["grub@dark"].frames };
    sprites["bat@foundry"] = { pal: { d: "#3a0e06", r: "#e04a10", o: "#ff9a30", y: "#ffe070", w: "#ffffff", k: "#3a0e06" }, frames: NEW.ember };
    sprites["hammer@foundry"] = { pal: { k: FD.out, t: FD.i2, s: FD.i4, m: FD.i3, y: FD.hz, w: "#d8d8e8" }, rows: NEW.press[0] };
    sprites["torchBase@foundry"] = { pal: { k: FD.out, t: FD.i2, s: FD.i4, g: "#5a3a1a" }, rows: NEW.bulb[0] };
    sprites["flame@foundry"] = { pal: { O: "#ffb040", Y: "#ffd870", W: "#ffffff" }, frames: NEW.bulbglow };
    themes.foundry = {
        key: "foundry", pressTimed: true,
        timber: { d: FD.out, s: FD.i1, m: FD.i2, l: FD.i3, q: FD.i3 },
        edge: { out: FD.out, lit: FD.i4, dark: FD.i0 },
        moss: false, embers: true, soot: true,
        glow: [255, 170, 90], air: [255, 200, 150],
        stones: [[FD.b1, FD.b2, FD.b3], [FD.i1, FD.i2, FD.i3], [FD.b2, FD.b3, FD.b4]], dirt: [FD.i0, FD.b0], shard: [FD.i3, FD.b3],
        lampAt: { bx: 1, by: -3, fx: 4, fy: 7, gx: 8, gy: 8 },
        /* THE WALLS: firebrick in running bond, soot-dark, the joints black;
           now and then a brick burnt nearly black, now and then a pale one. */
        wall(x, a, tx, ty, px, py) {
            for (let j = 0; j < 16; j++) {
                const wy = ty * 16 + j, course = Math.floor(wy / 6), r = wy % 6;
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i, off = (course % 2) * 8, br = Math.floor((wx + off) / 16), along = (wx + off) % 16;
                    const t = hash2(br, course * 3);
                    let c = t < 0.12 ? "#2a120c" : t > 0.9 ? FD.b4 : t > 0.55 ? FD.b3 : FD.b2;
                    if (r === 5 || along === 0) c = FD.out;
                    else if (r === 0) c = t > 0.55 ? FD.b4 : FD.b3;
                    else if (hash2(wx, wy) < 0.07) c = FD.b1;
                    x.fillStyle = c; x.fillRect(px + i, py + j, 1, 1);
                }
            }
        },
        // The top of a wall: a steel plate, riveted
        lip(x, a, tx, ty, px, py) {
            x.fillStyle = FD.out; x.fillRect(px, py, 16, 1); x.fillStyle = FD.i4; x.fillRect(px, py + 1, 16, 1); x.fillStyle = FD.i3; x.fillRect(px, py + 2, 16, 2); x.fillStyle = FD.i1; x.fillRect(px, py + 4, 16, 1);
            x.fillStyle = "#c8c8d8"; x.fillRect(px + 3, py + 2, 1, 1); x.fillRect(px + 12, py + 2, 1, 1);
        },
        /* THE BACK WALL: dark brick, and in it the slits of the furnaces glowing,
           pipes across, a chain or two hanging. */
        back(x, a) {
            const W = a.w * 16, H = a.h * 16;
            for (let y = 0; y < H; y += 6) for (let X = ((y / 6) % 2) * 8; X < W; X += 16) { const t = hash2(X, y); x.fillStyle = t < 0.5 ? "#1e0c08" : "#24100a"; x.fillRect(X, y, 15, 5); x.fillStyle = "#0e0604"; x.fillRect(X, y + 5, 16, 1); }
            for (let X = 40; X < W; X += 96) for (let ry = 0; ry * 14 < a.h; ry++) {
                const y = ry * 224 + 70 + Math.floor(hash2(X, ry) * 40);
                const gr = x.createRadialGradient(X + 4, y + 12, 1, X + 4, y + 12, 40); gr.addColorStop(0, "rgba(255,110,30,0.35)"); gr.addColorStop(1, "rgba(255,110,30,0)"); x.fillStyle = gr; x.fillRect(X - 36, y - 28, 80, 80);
                x.fillStyle = "#0a0404"; x.fillRect(X - 1, y - 1, 10, 26); for (let k = 0; k < 3; k++) { x.fillStyle = k === 1 ? "#ffd060" : "#ff7a20"; x.fillRect(X + 1, y + 2 + k * 8, 6, 4); }
            }
            for (let ry = 0; ry * 14 < a.h; ry++) { const y = ry * 224 + 24; x.fillStyle = "#0e0c10"; x.fillRect(0, y, W, 9); x.fillStyle = "#3a3440"; x.fillRect(0, y + 1, W, 2); x.fillStyle = "#26222a"; x.fillRect(0, y + 3, W, 4); for (let X = 0; X < W; X += 64) { x.fillStyle = "#0e0c10"; x.fillRect(X, y - 2, 6, 13); x.fillStyle = "#5a5262"; x.fillRect(X + 1, y - 1, 4, 11); } }
        },
        // steel columns, I-section, every ten tiles
        frame(x, a) {
            const H = a.h * 16;
            for (let tx = 6; tx < a.w; tx += 10) { const X = tx * 16; x.fillStyle = "#0a080c"; x.fillRect(X, 0, 12, H); x.fillStyle = "#2a2430"; x.fillRect(X + 1, 0, 2, H); x.fillRect(X + 9, 0, 2, H); x.fillStyle = "#1a161e"; x.fillRect(X + 3, 0, 6, H); for (let y = 8; y < H; y += 32) { x.fillStyle = "#5a5262"; x.fillRect(X + 1, y, 1, 1); x.fillRect(X + 10, y, 1, 1); } }
        },
        // A BEAM: an iron grating
        platform(x, X, Y, W) {
            x.fillStyle = FD.out; x.fillRect(X, Y, W, 8);
            x.fillStyle = FD.i4; x.fillRect(X + 1, Y + 1, W - 2, 1); x.fillStyle = FD.i2; x.fillRect(X + 1, Y + 2, W - 2, 5);
            for (let i = 2; i < W - 2; i += 3) { x.fillStyle = FD.out; x.fillRect(X + i, Y + 3, 2, 3); }
            x.fillStyle = FD.i3; x.fillRect(X + 1, Y + 6, W - 2, 1);
        },
        mover(g, m, a, h) {
            const X = Math.round(m.x), Y = Math.round(m.y);
            for (const rx of [X + 6, X + m.w - 8]) for (let yy = Y - 80; yy < Y; yy += 4) { g.fillStyle = FD.out; g.fillRect(rx, yy, 3, 4); g.fillStyle = FD.i3; g.fillRect(rx + 1, yy + 1, 1, 2); }
            this.platform(g, X, Y, m.w, {});
        },
        // (14 Oct 2026) the scenery, chosen by each spot's own number, standing on the floor (dimmed: behind Scout)
        props(x, a, h, spots) {
            const PICK = [["ingots"],["anvil"],["coal"],["barrelTall"],["crateIron"],["chainHeap","keg"]];
            for (const sp of spots) {
                const names = PICK[Math.floor(sp.hv * 1000) % PICK.length];
                let dx = 0;
                for (const n of names) { const img = h.dim(h.spr(n, 0)); if (!img) continue; x.drawImage(img, sp.px + dx, sp.py + 16 - img.height); dx += img.width - 2; }
            }
        }
    };

    // ---------------------------------------------------------------- 10. THE OVERGROWN RUINS
    const RU = { out: "#0e140c", s0: "#26302a", s1: "#3a463c", s2: "#55624f", s3: "#728068", s4: "#94a084", m0: "#2a4a1a", m1: "#3e6a22", m2: "#5a9a32", m3: "#8ad05a", f1: "#ff8ab0", f2: "#ffe060" };
    sprites["hare@ruins"] = { pal: { k: "#0e1a0a", a: "#8ad05a", b: "#4a9a2a", c: "#2a6a1a", e: "#1a1a1a", w: "#ffffff", y: "#e8e070" }, frames: NEW.frog };
    sprites["spider@ruins"] = { pal: { k: "#0e1a0a", a: "#b8f070", b: "#6ab83a", r: "#d84a3a", w: "#ffffff", e: "#1a1a1a", y: "#e8e070" }, frames: NEW.caterpillar };
    sprites["rope@ruins"] = { pal: { k: "#0e1a0a", a: "#6aa83a", b: "#3a7a22", c: "#2a5a1a", l: "#5aa83a", L: "#9ae070" }, rows: NEW.vine[0] };
    sprites["ropeTop@ruins"] = { pal: { k: "#0e1a0a", a: "#6aa83a", b: "#3a7a22", c: "#2a5a1a", l: "#5aa83a", L: "#9ae070" }, rows: NEW.vineTop[0] };
    sprites["ropeEnd@ruins"] = { pal: { k: "#0e1a0a", a: "#6aa83a", b: "#3a7a22", c: "#2a5a1a", l: "#5aa83a", L: "#9ae070" }, rows: NEW.vineEnd[0] };
    // a ruin's stones: irregular blocks, moss in the joints
    const ruinLining = (a, tx, ty) => { if (!a.skyMask) return true; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h) continue; const c = a.tiles[ny][nx]; if (c !== "#" && c !== "%" && !a.skyMask[ny * a.w + nx]) return true; } return false; };
    themes.ruins = {
        // (16 Oct 2026) the rig its moving platforms hang from (js/rat-race.js, THE RIGS), in its own materials
        rig: { beam: "timber", line: "rope", wood: ["#14100a", "#2e2414", "#43361e", "#5a4a28", "#74623a", "#8a7a4a"], iron: ["#10140e", "#2a3226", "#3e4a38", "#5e6e54", "#8a9a7e"], rope: ["#3a3014", "#6a5a2a", "#9a8a48", "#c8b878"] },
        key: "ruins", rainy: true,   // (14 Oct 2026, the owner: "just have it raining constantly above ground")
        timber: { d: RU.out, s: RU.s0, m: RU.s1, l: RU.s3, q: RU.s2 },
        edge: { out: RU.out, lit: RU.s4, dark: RU.s0 },
        moss: true, embers: false, soot: false,
        glow: [255, 230, 170], air: [220, 240, 210],
        stones: [[RU.s1, RU.s2, RU.s3], [RU.s0, RU.s1, RU.s2], [RU.s2, RU.s3, RU.s4]], dirt: [RU.s0, RU.m0], shard: [RU.s3, RU.s1],
        /* THE WALLS: old stone in blocks of no two sizes, grey-green, moss in
           the joints and over the tops, a root through a crack here and there. */
        wall(x, a, tx, ty, px, py) {
            for (let j = 0; j < 16; j++) {
                const wy = ty * 16 + j, course = Math.floor(wy / 10), r = wy % 10;
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i, len = 14 + Math.floor(hash2(course, 3) * 12), off = Math.floor(hash2(course, 9) * len), blk = Math.floor((wx + off) / len), along = (wx + off) % len;
                    const t = hash2(blk, course * 7);
                    let c = t < 0.33 ? RU.s2 : t < 0.7 ? RU.s3 : RU.s1;
                    if (r === 9 || along === 0) c = hash2(wx, course) < 0.5 ? RU.m1 : RU.out;
                    else if (r === 0 || along === 1) c = RU.s4;
                    else if (r === 8) c = RU.s1;
                    else if (hash2(wx, wy) < 0.06) c = RU.m0;
                    if (hash2(blk, course) < 0.18 && r < 4 && hash2(wx, wy * 3) < 0.5) c = r < 2 ? RU.m2 : RU.m1;   // moss on a block
                    x.fillStyle = c; x.fillRect(px + i, py + j, 1, 1);
                }
            }
        },
        // the top of a wall: moss, grass, a fern, flowers
        lip(x, a, tx, ty, px, py) {
            for (let i = 0; i < 16; i++) {
                const wx = tx * 16 + i, hs = hash2(wx, ty * 7);
                x.fillStyle = RU.out; x.fillRect(px + i, py + 3, 1, 1);
                x.fillStyle = hs < 0.5 ? RU.m1 : RU.m2; x.fillRect(px + i, py, 1, 3);
                x.fillStyle = RU.m3; if (hs < 0.4) x.fillRect(px + i, py, 1, 1);
                const tall = hs > 0.6 ? 1 + Math.floor((hs - 0.6) * 10) : 0;
                for (let k = 1; k <= tall; k++) { x.fillStyle = k === tall ? RU.m3 : RU.m2; x.fillRect(px + i + (k > 2 ? (hs > 0.8 ? 1 : -1) : 0), py - k, 1, 1); }
                if (hs > 0.975) { x.fillStyle = hs > 0.99 ? RU.f2 : RU.f1; x.fillRect(px + i, py - tall - 1, 1, 1); }
            }
        },
        // under the fallen roof: dark stone, a carved face in it now and then
        back(x, a) {
            const W = a.w * 16, H = a.h * 16;
            for (let y = 0; y < H; y += 10) for (let X = ((y / 10) % 2) * 12; X < W; X += 24) { const t = hash2(X, y); x.fillStyle = t < 0.5 ? "#1c241c" : "#222c22"; x.fillRect(X, y, 23, 9); x.fillStyle = "#14200e"; x.fillRect(X, y + 9, 24, 1); }
            for (let X = 60; X < W; X += 180) for (let ry = 0; ry * 14 < a.h; ry++) { const y = ry * 224 + 90; x.fillStyle = "#2c382a"; x.fillRect(X, y, 30, 34); x.fillStyle = "#14200e"; x.fillRect(X + 6, y + 10, 6, 4); x.fillRect(X + 18, y + 10, 6, 4); x.fillRect(X + 9, y + 24, 12, 3); x.fillStyle = "#3a4a36"; x.fillRect(X, y, 30, 2); }
        },
        frame() {},
        // the sky over the ruins: a humid blue, far hills in mist, the canopy, a temple on its hill; darker as the rain comes
        sky(g, cam, a, h) {
            const S = jungleStrips(), hz = horizonOf(a), ground = hz - cam.y;
            const farY = Math.round(ground * 0.3 + 60), midY = Math.round(ground * 0.5 + 40);
            const BAND = ["#5a8ac8", "#6a9ad0", "#7aaad6", "#8cb8da", "#a0c8dc", "#b6d6dc", "#cce2da"];
            const top = farY - BAND.length * 12 + 30;
            for (let y = 0; y < Math.min(h.VH, farY + 60); y++) { const k = Math.max(0, Math.min(BAND.length - 1, Math.floor((y - top) / 12))); g.fillStyle = BAND[k]; g.fillRect(0, y, h.VW, 1); }
            const slide = (img, kx, y) => { const off = ((Math.round(cam.x * kx) % S.W) + S.W) % S.W; for (let x2 = -off; x2 < h.VW; x2 += S.W) g.drawImage(img, x2, y); };
            slide(S.far, 0.15, farY); slide(S.mid, 0.4, midY);
            g.fillStyle = "#24401c"; g.fillRect(0, midY + 90, h.VW, Math.max(0, h.VH - midY - 90));
            const d = 0.55;   // overcast: it is always raining
            if (d > 0) { g.fillStyle = "rgba(30,40,50," + (0.45 * d).toFixed(2) + ")"; g.fillRect(0, 0, h.VW, h.VH); }
        },
        platform(x, X, Y, W) {
            x.fillStyle = RU.out; x.fillRect(X, Y, W, 9);
            x.fillStyle = RU.m2; x.fillRect(X + 1, Y + 1, W - 2, 1); x.fillStyle = RU.s3; x.fillRect(X + 1, Y + 2, W - 2, 5); x.fillStyle = RU.s1; x.fillRect(X + 1, Y + 7, W - 2, 1);
            for (let i = 3; i < W - 2; i += 5) if (hash2(X + i, Y) < 0.6) { x.fillStyle = RU.m1; x.fillRect(X + i, Y + 9, 1, 2 + Math.floor(hash2(i, Y) * 4)); }
        },
        // (14 Oct 2026) the scenery, chosen by each spot's own number, standing on the floor (dimmed: behind Scout)
        props(x, a, h, spots) {
            const PICK = [["columnBroken"],["statueHead"],["mossStone"],["fern"],["flowers","weeds"],["leaves"],["weedsTall"]];
            for (const sp of spots) {
                const names = PICK[Math.floor(sp.hv * 1000) % PICK.length];
                let dx = 0;
                for (const n of names) { const img = h.dim(h.spr(n, 0)); if (!img) continue; x.drawImage(img, sp.px + dx, sp.py + 16 - img.height); dx += img.width - 2; }
            }
        }
    };
    // the ruins' far hills and canopy, drawn once
    function jungleStrips() {
        if (skyCache.has("j")) return skyCache.get("j");
        const W = 640;
        const far = strip(W, 70, x => {
            for (let px = 0; px < W; px++) { const t = 20 + Math.round(Math.sin(px / 60) * 10 + Math.sin(px / 23 + 1) * 5); x.fillStyle = "#7aa0a8"; x.fillRect(px, t, 1, 70 - t); x.fillStyle = "#8ab0b4"; x.fillRect(px, t, 1, 1); }
            x.fillStyle = "rgba(220,235,230,0.35)"; x.fillRect(0, 40, W, 30);
        });
        const mid = strip(W, 90, x => {
            // a stepped temple on its hill, then the canopy
            for (let k = 0; k < 6; k++) { x.fillStyle = k % 2 ? "#4a5a48" : "#56664f"; x.fillRect(300 - 34 + k * 6, 18 + k * 7, 68 - k * 12, 7); }
            x.fillStyle = "#3a4a38"; x.fillRect(296, 12, 8, 8);
            for (let px = 0; px < W; px++) { const t = 36 + Math.round(Math.sin(px / 9) * 3 + Math.sin(px / 31) * 6 + (hash2(px >> 2, 3) - 0.5) * 4); x.fillStyle = "#2e5a26"; x.fillRect(px, t, 1, 90 - t); x.fillStyle = "#3e7030"; x.fillRect(px, t, 1, 2); if (hash2(px, 5) < 0.2) { x.fillStyle = "#4e8a3a"; x.fillRect(px, t - 1, 1, 1); } }
            x.fillStyle = "rgba(200,225,210,0.18)"; x.fillRect(0, 0, W, 90);
        });
        const out = { far, mid, W };
        skyCache.set("j", out);
        return out;
    }

    // ---------------------------------------------------------------- 11. THE STEAMWORKS (14 Oct 2026)
    /* The owner's: "combine the themes of the foundry and clockwork vault to create a steampunk
       factory, lots of pipes, lava to cross ... the little lanterns in the foundry are good, keep those
       but perfect them more ... use pipes as platforms and have moving gears". Riveted iron plate
       walls with brass bands; copper pipes for every platform; behind it all soot-dark brick, great
       pipes and gears turning slowly in the gloom, and the furnaces' slots glowing. */
    const FY = { out: "#0a0808", i0: "#14121a", i1: "#221e2a", i2: "#34303e", i3: "#4c4658", i4: "#6e6880", i5: "#a49eb4",
        c0: "#3e1c0c", c1: "#6e3416", c2: "#9a5226", c3: "#c87436", c4: "#f0a860", c5: "#ffd8a0",
        b0: "#5a3a10", b1: "#8a5e18", b2: "#c8962e", b3: "#f2cc4e", b4: "#fff0a0", hot: "#ff8a30", hot2: "#ffd060" };
    /* WEATHERED METAL (14 Oct 2026, the owner's: "all metal objects in the steampunk zone should
       appear slightly weathered or rusted (both, a mixture!), don't go too over the top"). Every
       metal surface here is drawn from a ramp of seven shades (made from one colour, which the level
       editor can change: walls, trim, floor edge, pipes, blocks, gears) and worn by one rule: rust in
       soft patches with a stained, pitted fringe; grime run down in streaks; a fleck of rust, a bright
       scratch. Worked out from where the pixel is in the world (or on the thing, for what moves), so
       it never repeats tile by tile. The level's Wear setting (0 to 1, a half by default) says how much. */
    const FCOL = { wall: "#4a4652", trim: "#8a6c40", lip: "#3c3b41", pipe: "#3e3d44", block: "#4a4850", gear: "#6a5230", oak: "#3e2716" };
    const RUST = ["#261c14", "#433022", "#64482e", "#86603a", "#a27a48"], VERD = ["#2a4840", "#3c6656", "#588a72"];
    const RUSTOF = [0, 1, 1, 2, 3, 3, 4];   // a ramp shade to its rust shade, so rust keeps the light
    const rgbOf = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const hexOf = v => "#" + v.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
    const mixC = (c, d, t) => { const A = rgbOf(c), B = rgbOf(d); return hexOf(A.map((n, i) => n + (B[i] - n) * t)); };
    const okHex = c => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
    // seven shades from one: three darker, the colour itself, three lighter (the shadows a touch warmer)
    function rampOf(hex) {
        const warm = mixC(hex, "#2a1408", 0.25);
        const lit = hexOf(rgbOf(hex).map(v => v * 1.85 + 26));   // lighter the way metal catches light: brighter, not paler
        return [mixC(warm, "#000000", 0.74), mixC(warm, "#000000", 0.52), mixC(hex, "#000000", 0.28), hex, mixC(hex, lit, 0.3), mixC(hex, lit, 0.62), mixC(lit, "#ffffff", 0.2)];
    }
    // smooth noise: a value on a grid, eased between
    const vn = (x, y, k) => {
        const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v), o = k * 131;
        const A = hash2(ix + o, iy), B = hash2(ix + 1 + o, iy), C = hash2(ix + o, iy + 1), D = hash2(ix + 1 + o, iy + 1);
        return (A + (B - A) * su) * (1 - sv) + (C + (D - C) * su) * sv;
    };
    const patchN = (x, y, k) => vn(x / 10, y / 10, k) * 0.62 + vn(x / 3.6, y / 3.6, k + 9) * 0.38;
    // the level's colours and wear, made once
    const FKITS = new Map();
    function fkit(a) {
        const S = (a && a.settings) || {}, C = S.colors || {}, wear = typeof S.wear === "number" ? Math.max(0, Math.min(1, S.wear)) : 0.5;
        const key = JSON.stringify([C, wear]);
        let k = FKITS.get(key); if (k) return k;
        k = { wear };
        for (const n of Object.keys(FCOL)) k[n] = rampOf(okHex(C[n]) ? C[n] : FCOL[n]);
        FKITS.set(key, k); return k;
    }
    /* A shade of worn metal: R the ramp, lvl its shade (0-6) by the light, wx wy where in the world,
       s the surface's own seed, bias more rust there (an underside, below a rivet). */
    function worn(k, R, lvl, wx, wy, s, bias) {
        const w = k.wear; if (w <= 0) return R[lvl];
        const hs = hash2(wx * 3 + s * 17, wy * 5 - s);
        const n = patchN(wx + s * 37, wy, s), th = 0.84 - w * 0.2 - (bias || 0);
        if (n > th + 0.045) { let ri = RUSTOF[lvl]; if (hs < 0.28) ri = Math.max(0, ri - 1); else if (hs > 0.88) ri = Math.min(4, ri + 1); return RUST[ri]; }
        if (n > th) return hs < 0.45 ? R[Math.max(0, lvl - 1)] : hs < 0.6 ? RUST[Math.min(2, RUSTOF[lvl])] : R[lvl];
        if (vn(wx / 1.7 + s, wy / 12, s + 3) > 0.76 - w * 0.08 && hs < 0.75) lvl = Math.max(1, lvl - 1);   // grime run down
        if (hs < 0.01 * w) return RUST[2];
        if (hs > 1 - 0.008 * w) return R[Math.min(6, lvl + 2)];
        return R[lvl];
    }
    // brass, gone dull: patches of verdigris in place of rust
    function tarnished(k, R, lvl, wx, wy, s) {
        const w = k.wear, hs = hash2(wx * 7 + s, wy * 3 + s);
        if (w > 0 && patchN(wx + 900, wy + s, s + 40) > 0.82 - w * 0.18) return VERD[Math.min(2, Math.max(0, lvl - 2))];
        if (hs < 0.03 * w) return R[Math.max(0, lvl - 2)];
        return R[lvl];
    }
    /* DARK OAK (14 Oct 2026, the owner's: "retro-steampunk ... a bit more of a science experiment gone wrong;
       so add in dark oak wooden elements mixed in with the hardened steel and rivets"): a plank 8 high, its
       grain running along it (a tone wandering slowly, fine darker and lighter lines), lit on its top
       edge, a seam under it, the ends of the planks staggered. */
    function oakAt(k, wx, wy) {
        const O = k.oak, r = ((wy % 8) + 8) % 8, plank = Math.floor(wy / 8);
        if (r === 0) return FY.out;
        if (((wx + plank * 23) % 48 + 48) % 48 === 0) return O[0];
        let lv = 2 + Math.round((vn(wx / 9, plank * 3.1, 81) - 0.5) * 2.4);
        if (r === 1) lv += 2; else if (r === 7) lv -= 1;
        const gr = vn(wx / 2.2 + plank * 40, r / 2.5 + plank * 7, 83); if (gr > 0.7) lv -= 1; else if (gr < 0.18) lv += 1;
        if (hash2(wx, wy) < 0.008) lv -= 2;
        return O[Math.max(0, Math.min(6, lv))];
    }
    // pixels as runs: one fill for each stretch of a row in the same colour
    function putRow(x, X, Y, cols) { let i = 0; while (i < cols.length) { let j = i + 1; while (j < cols.length && cols[j] === cols[i]) j++; if (cols[i]) { x.fillStyle = cols[i]; x.fillRect(X + i, Y, j - i, 1); } i = j; } }
    /* WORN SCENERY: the metal props (grey iron) given rust from the same rule, drawn once as the
       factory's own (name@factory), so a crate or a chain set down here is as old as the rest. */
    function rustedSprite(name, seed) {
        const s = sprites[name]; if (!s || !s.rows) return;
        const pal = Object.assign({}, s.pal, { "①": RUST[1], "②": RUST[2], "③": RUST[3], "④": RUST[4] });
        const grey = c => { if (!c) return -1; const [r, g, b] = rgbOf(c), mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx - mn < 34 && mx > 50 ? mx : -1; };
        const rows = s.rows.map((row, y) => [...row].map((ch, x) => {
            const L = grey(s.pal[ch]); if (L < 0) return ch;
            const n = patchN(x * 1.6 + seed * 13, y * 1.6, seed), hs = hash2(x + seed * 7, y * 3 + seed);
            if (n > 0.76) return L > 180 ? "④" : L > 120 ? "③" : L > 80 ? "②" : "①";
            if (n > 0.73 && hs < 0.5) return L > 120 ? "②" : "①";
            return hs < 0.025 ? "②" : ch;
        }).join(""));
        sprites[name + "@factory"] = { pal, rows };
    }
    /* A GEAR AS A PROP, worked out from a true circle (the owner's: "the gears don't look properly
       circular"): bronze, its teeth even, lit from the top left, spokes from a hub, rust in patches. */
    function gearRows(R, teeth, seed, rot) {
        const depth = Math.max(2, Math.round(R * 0.2)), S = (R + depth) * 2 + 1, c = (S - 1) / 2, rin = R * 0.62, hub = Math.max(1.6, R * 0.24), step = Math.PI * 2 / teeth;
        const rows = [];
        for (let y = 0; y < S; y++) {
            let row = "";
            for (let X = 0; X < S; X++) {
                const dx = X - c, dy = y - c, d = Math.hypot(dx, dy), an = Math.atan2(dy, dx), t = ((((an - rot) / step) % 1) + 1) % 1, tooth = t > 0.1 && t < 0.5;
                const outer = tooth ? R + depth : R; if (d > outer + 0.45) { row += "."; continue; }
                const lit = (-dx - dy) / (d || 1);
                let ch;
                if (d > outer - 0.85) ch = "k";
                else if (d > rin + 1.3) ch = lit > 0.5 ? "l" : lit < -0.5 ? "d" : "b";
                else if (d > rin + 0.4) ch = "k";
                else if (d <= hub + 0.5) ch = d > hub - 0.6 ? "k" : "h";
                else {
                    let sp = false; for (let i = 0; i < 4; i++) { const rel = an - rot - i * Math.PI / 2; if (Math.cos(rel) > 0 && Math.abs(Math.sin(rel) * d) < 1.1) { sp = true; break; } }
                    ch = sp ? (lit > 0.2 ? "l" : "b") : ".";
                }
                if ("lbd".includes(ch)) { const n = patchN(X * 1.4 + seed * 11, y * 1.4, seed), hs = hash2(X * 5 + seed, y * 9); if (n > 0.76) ch = ch === "l" ? "③" : ch === "b" ? "②" : "①"; else if (n > 0.73 && hs < 0.5) ch = "①"; else if (hs < 0.035) ch = "②"; }
                row += ch;
            }
            rows.push(row);
        }
        return rows;
    }
    {
        const G = rampOf(FCOL.gear), pal = { k: FY.out, d: G[1], b: G[2], l: G[4], h: G[5], "①": RUST[1], "②": RUST[2], "③": RUST[3] };
        sprites["cog@factory"] = { pal, rows: gearRows(6, 9, 3, 0.2) };
        // two in mesh: a big one and a small one, set side by side, the small one's teeth in the big one's gaps
        const big = gearRows(6, 9, 5, 0.1), small = gearRows(4, 7, 8, 0.45), H = big.length, W = big[0].length + small[0].length - 4;
        const out = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (big[y] && big[y][x]) || "."));
        const oy = H - small.length, ox = big[0].length - 4;
        small.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== ".") out[oy + y][ox + x] = ch; }));
        sprites["cogPair@factory"] = { pal, rows: out.map(r => r.join("")) };
    }
    // the lamp: a shade on a rod, gone dull and green at its rim and a little rusty; a wire cage; the bulb inside it (its filament flickers)
    sprites["torchBase@factory"] = { pal: { k: FY.out, s: "#8a8694", t: FY.i2, u: "#4e4a58", a: "#b8945a", b: "#8c6a36", c: "#5a4020", v: "#4e8070", r: "#6a4a2c", g: "#2a1a0e" }, rows: [
        "......kk......",
        "......ks......",
        ".....kssk.....",
        "....kkkkkk....",
        "...kabbvbbk...",
        "..kaabbbbrck..",
        ".kabbbbbbbcck.",
        ".kvkkkkkkkkrk.",
        "..kgtggtggtk..",
        "..kgtggtggtk..",
        "..kuuuuuuttk..",
        "..kgtggtggtk..",
        "..kgtggtggtk..",
        "..kgtggtggtk..",
        "..kuuuuuuttk..",
        "...kkcbrckk...",
        ".....kkkk....."
    ] };
    sprites["flame@factory"] = { pal: { O: "#ffa840", Y: "#ffd870", W: "#fffbe8", t: FY.i2, r: "#ff6a20" }, frames: [["OtYWtYOt","YtWWtWYt","tttttttt","YtWWtWYt","OtYYtYOt","OtOOtOOt"],["OtYYtYOt","YtWWtWYt","tttttttt","YtWYtWYt","OtYYtYOt","OtOOtOOt"],["OtOYtOOt","OtYYtYOt","tttttttt","OtYYtYOt","OtOOtOOt","rtOOtOrt"],["OtYWtYOt","YtWWtWYt","tttttttt","YtWWtWYt","OtYYtYOt","OtOOtOOt"]] };
    // the ladders: iron, riveted rungs, a little rust where the rungs meet the stiles
    sprites["ladder@factory"] = { pal: { k: FY.out, b: "#6a6872", c: "#3a3940", a: "#8a8890", d: "#2a292f", r: "#64482e", s: "#433022" }, rows: [
        ".kbck......kbck.",
        ".kbck......kbck.",
        ".kbckkkkkkkkbck.",
        ".kbcaaaaaaaabck.",
        ".kbcddddrddrbck.",
        ".kbskkkkkkkkbsk.",
        ".kbck......kbck.",
        ".kbck......kbrk.",
        ".kbck......kbck.",
        ".kbck......kbck.",
        ".kbckkkkkkkkbck.",
        ".kbcaaaaaaaabck.",
        ".kbcdrdddddddck.",
        ".kbskkkkkkkkbck.",
        ".krck......kbck.",
        ".kbck......kbck."
    ] };
    // the creatures: the vault's mouse and bird, the foundry's ember-bat, glow-grub and press
    sprites["rat@factory"] = sprites["rat@clock"];
    sprites["bat@factory"] = sprites["bat@foundry"];
    sprites["grub@factory"] = sprites["grub@foundry"];
    sprites["hammer@factory"] = sprites["hammer@foundry"];
    // behind it all: soot-dark brick, made once as a tile to repeat
    let factoryBrick = null;
    function brickTile() {
        if (factoryBrick) return factoryBrick;
        const c = document.createElement("canvas"); c.width = 32; c.height = 24; const x = c.getContext("2d");
        for (let y = 0; y < 24; y += 6) for (let X = ((y / 6) % 2) * 8 - 8; X < 32; X += 16) { const t = hash2(X + 40, y); x.fillStyle = t < 0.4 ? "#1a0c08" : t < 0.8 ? "#200f0a" : "#28140c"; x.fillRect(X, y, 15, 5); x.fillStyle = "#0c0604"; x.fillRect(X, y + 5, 16, 1); x.fillRect(X + 15, y, 1, 6); }
        factoryBrick = c; return c;
    }
    // the great pipes behind it all: iron, dark with distance, worn the same way; made once, standing and lying
    let farPipes = null;
    function farPipeArt() {
        if (farPipes) return farPipes;
        const k = { wear: 0.6 }, R = rampOf("#2c2a30"), sh = [0, 2, 3, 4, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1, 0, 0];
        const up = document.createElement("canvas"); up.width = 20; up.height = 192; const u = up.getContext("2d");
        for (let y = 0; y < 192; y++) {
            const row = []; const fl = y % 96 < 6;
            for (let i = 0; i < 20; i++) {
                if (fl) { const lv = y % 96 === 0 || y % 96 === 5 ? -1 : y % 96 === 1 ? 4 : 2; row.push(lv < 0 ? FY.out : worn(k, R, lv, i + 500, y, 21)); continue; }
                if (i < 2 || i > 17) { row.push(null); continue; }
                const j = i - 2; row.push(j === 0 || j === 15 ? FY.out : worn(k, R, sh[j], i + 500, y, 21, j > 10 ? 0.06 : 0));
            }
            putRow(u, 0, y, row);
        }
        const across = document.createElement("canvas"); across.width = 192; across.height = 12; const ac = across.getContext("2d");
        const sv = [0, 3, 4, 3, 2, 2, 2, 1, 1, 1, 1, 0];
        for (let y = 0; y < 12; y++) { const row = []; for (let i = 0; i < 192; i++) row.push(sv[y] === 0 && (y === 0 || y === 11) ? FY.out : worn(k, R, sv[y], i, y + 700, 23, y > 7 ? 0.06 : 0)); putRow(ac, 0, y, row); }
        farPipes = { up, across }; return farPipes;
    }
    // AN IRON BLOCK, made once for each width and look: riveted plate, its hazard stripes worn and chipped
    const blockArt = new Map();
    function blockImage(k, W) {
        const key = W + "|" + k.block[3] + "|" + k.wear; let c = blockArt.get(key); if (c) return c;
        c = document.createElement("canvas"); c.width = W; c.height = 13; const x = c.getContext("2d"), R = k.block;
        const YEL = ["#5e4a1c", "#9a7a2c", "#c49c3a"];
        for (let y = 0; y < 13; y++) {
            const row = [];
            for (let i = 0; i < W; i++) {
                if (y === 0 || y === 12 || i === 0 || i === W - 1) { row.push(FY.out); continue; }
                let lv = y === 1 ? 5 : y === 11 ? 1 : y === 10 ? 2 : i === 1 ? 4 : i === W - 2 ? 2 : 3;
                if (y >= 5 && y <= 9 && i > 5 && i < W - 6) { row.push(oakAt(k, i, y + 299)); continue; }   // an oak panel in its steel frame
                // the hazard stripes, worn through to the iron here and there
                if ((y === 2 || y === 3) && i > 1 && i < W - 2) {
                    const yel = ((i + y) % 8) < 4, chip = hash2(i * 3, y + 40) < 0.18 * (0.5 + k.wear) || patchN(i, y * 4 + 60, 33) > 0.7;
                    if (yel && !chip) { row.push(YEL[y === 2 ? 2 : 1]); continue; }
                    if (!yel) { row.push(chip ? R[2] : FY.out); continue; }
                    lv = 2;
                }
                row.push(worn(k, R, lv, i, y + 300, 31, y > 8 ? 0.08 : 0));
            }
            putRow(x, 0, y, row);
        }
        // the rivets: a lit dome, a shadow, a run of rust from the lower ones
        for (const rx of [3, W - 5]) for (const ry of [4, 8]) {
            x.fillStyle = R[6]; x.fillRect(rx, ry, 1, 1); x.fillStyle = R[4]; x.fillRect(rx + 1, ry, 1, 1); x.fillRect(rx, ry + 1, 1, 1); x.fillStyle = R[1]; x.fillRect(rx + 1, ry + 1, 1, 1);
            if (ry === 8 && hash2(rx, W) < 0.3 + k.wear * 0.6) { x.fillStyle = RUST[2]; x.fillRect(rx, ry + 2, 1, 1); x.fillStyle = RUST[1]; x.fillRect(rx, ry + 3, 1, 1); }
        }
        blockArt.set(key, c); return c;
    }
    // a gear's ledge, made once for each width: a worn plate, its hook to the arm in the middle
    const ledgeArt = new Map();
    function ledgeImage(k, W) {
        const key = W + "|" + k.block[3] + "|" + k.wear; let c = ledgeArt.get(key); if (c) return c;
        c = document.createElement("canvas"); c.width = W; c.height = 11; const x = c.getContext("2d"), R = k.block;
        for (let y = 0; y < 8; y++) {
            const row = [];
            for (let i = 0; i < W; i++) {
                if (y === 0 || y === 7 || i === 0 || i === W - 1) { row.push(FY.out); continue; }
                const lv = y === 1 ? 5 : y === 6 ? 1 : y === 5 ? 2 : 3;
                if (y === 3 || y === 4) { const yel = (i % 8) >= 3 && (i % 8) < 7 && i > 2 && i < W - 3, chip = hash2(i * 5, y + W) < 0.2 + k.wear * 0.15; if (yel && !chip) { row.push(y === 3 ? "#b8923a" : "#8e7030"); continue; } }
                row.push(worn(k, R, lv, i + W * 3, y + 400, 37, y > 4 ? 0.08 : 0));
            }
            putRow(x, 0, y, row);
        }
        x.fillStyle = FY.out; x.fillRect(W / 2 - 2, 7, 4, 4); x.fillStyle = R[2]; x.fillRect(W / 2 - 1, 8, 2, 2);
        x.fillStyle = R[6]; x.fillRect(2, 2, 1, 1); x.fillRect(W - 3, 2, 1, 1);
        ledgeArt.set(key, c); return c;
    }
    themes.factory = {
        key: "factory", allBack: true, embers: true, soot: true, moss: false, noRopes: true,
        timber: { d: "#0e0804", s: "#24160c", m: "#3a2414", l: "#56381f", q: "#46301a" },   // dark oak
        slime: true,   // (14 Oct 2026) its pools and drips are green slime, not molten metal
        edge: { out: FY.out, lit: "#5e5a66", dark: FY.i0 },
        edgeFor(a) { const k = fkit(a); return { out: FY.out, lit: k.wall[4], dark: k.wall[0] }; },
        glow: [255, 180, 100], air: [255, 210, 160],
        stones: [[FY.i2, FY.i3, FY.i4], [RUST[1], RUST[2], RUST[3]], [FY.i1, FY.i2, FY.i3]], dirt: [FY.i0, FY.i1], shard: [FY.i4, RUST[3]],
        lampAt: { bx: 1, by: -3, fx: 4, fy: 5, gx: 8, gy: 8 },
        // the level's colours the editor offers, and their defaults
        colors: [["wall", "Walls", FCOL.wall], ["trim", "Wall bands (brass)", FCOL.trim], ["lip", "Floor edge", FCOL.lip], ["pipe", "Pipes (platforms)", FCOL.pipe], ["block", "Iron blocks and ledges", FCOL.block], ["gear", "Cogs", FCOL.gear], ["oak", "Dark oak", FCOL.oak]],
        wearable: true,
        gearCols: { k: FY.out, b: "#5e4c30", l: "#86704a", d: "#3e3020", h: "#a08a60" },
        gearColsFor(a) { const k = fkit(a), G = k.gear; return { k: FY.out, b: G[3], l: G[4], d: G[1], h: G[5], ramp: G, rust: [RUST[1], RUST[2], RUST[3]], wear: k.wear }; },
        armCols(a) { const R = fkit(a).block; return [FY.out, R[3], R[5]]; },
        // the iron posts and braces under the pipes, worn like the rest: rust in patches down them, a fleck here and there
        // the posts and braces are dark oak: a grain down them, a riveted steel strap every so often, a bolt at each end of a brace
        wearPiece(x, kind, o) {
            if (kind === "post") {
                for (let y = o.y; y < o.y + o.h; y++) for (let i = 1; i < 5; i++) { const n = vn(y / 4 + i * 9, o.x / 16 + i, 85); if (n > 0.72) { x.fillStyle = "#1e1209"; x.fillRect(o.x + 1 + i, y, 1, 1); } else if (n < 0.14) { x.fillStyle = "#5e3e24"; x.fillRect(o.x + 1 + i, y, 1, 1); } }
                for (let y = o.y + 5; y < o.y + o.h - 4; y += 22) { x.fillStyle = FY.out; x.fillRect(o.x, y, 8, 4); x.fillStyle = "#7a7884"; x.fillRect(o.x + 1, y + 1, 6, 1); x.fillStyle = "#4a4852"; x.fillRect(o.x + 1, y + 2, 6, 1); x.fillStyle = "#d8d6e0"; x.fillRect(o.x + 3, y + 1, 1, 1); }
            } else for (const i of [1, o.len - 2]) { x.fillStyle = "#7a7884"; x.fillRect(o.x + o.dir * i, o.y + i + 1, 1, 1); x.fillStyle = "#d8d6e0"; x.fillRect(o.x + o.dir * i, o.y + i, 1, 1); }
        },
        ledge(g, m, a) { const img = ledgeImage(fkit(a), m.w); g.drawImage(img, Math.round(m.x), Math.round(m.y)); },
        /* THE WALLS: iron plates, thirty-two by sixteen, bevelled, a rivet in each corner (some
           weeping rust); every fifth course a band of dull brass, studded, gone green in places; all
           of it worn; under a floor's edge, rust run down from the lip. */
        wall(x, a, tx, ty, px, py, h) {
            const k = fkit(a), R = k.wall, T = k.trim;
            const lipAbove = h && !h.wallish(a, tx, ty - 1);
            for (let j = 0; j < 16; j++) {
                const row = [];
                const wy = ty * 16 + j, course = Math.floor(wy / 16), r = wy % 16, band = course % 5 === 2;
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i, off = (course % 2) * 16, plate = Math.floor((wx + off) / 32), along = (wx + off) % 32;
                    const tone = hash2(plate, course * 7);
                    if (course % 5 === 4 || course % 5 === 0) {   // a band of dark oak, strapped across with riveted steel
                        const sx = ((wx % 32) + 32) % 32;
                        if (sx >= 14 && sx <= 16) { row.push(wy % 8 === 4 && sx === 15 ? R[6] : wy % 8 === 5 && sx === 15 ? R[0] : R[sx === 14 ? 5 : sx === 16 ? 1 : 3]); continue; }
                        if (r === 0 && course % 5 === 4) { row.push(FY.out); continue; }
                        row.push(oakAt(k, wx, wy)); continue;
                    }
                    if (band && r > 5 && r < 11) {
                        let lv = r === 6 ? 5 : r === 10 ? 1 : r === 7 ? 4 : 3;
                        if (r === 8 && wx % 8 === 4) { row.push(T[6]); continue; }
                        if (r === 9 && wx % 8 === 4) { row.push(T[1]); continue; }
                        row.push(tarnished(k, T, lv, wx, wy, 5)); continue;
                    }
                    if (r === 0 || along === 0) { row.push(FY.out); continue; }
                    let lv = tone < 0.35 ? 2 : tone > 0.9 ? 4 : 3;
                    if (r === 1 || along === 1) lv = Math.min(6, lv + 2);
                    else if (r === 15 || along === 31) lv = 1;
                    else if (r === 14 || along === 30) lv = Math.max(1, lv - 1);
                    else if (r > 9 && hash2(wx, wy) < (r - 9) * 0.09) lv = Math.max(1, lv - 1);   // darker towards the plate's foot
                    // the rivets: a lit dome and its shadow
                    const rv = (along === 3 || along === 28) && (r === 3 || r === 11), rv2 = (along === 4 || along === 29) && (r === 3 || r === 11);
                    const rb = (along === 3 || along === 28) && (r === 4 || r === 12), rb2 = (along === 4 || along === 29) && (r === 4 || r === 12);
                    if (rv) { row.push(R[6]); continue; }
                    if (rv2 || rb) { row.push(R[4]); continue; }
                    if (rb2) { row.push(FY.out); continue; }
                    // rust weeping from a rivet, down the plate
                    const rivAt = along === 3 || along === 28 ? along : -1;
                    if (rivAt >= 0 && ((r > 4 && r < 11) || r > 12)) { const top = r > 12 ? 12 : 4, run = Math.floor(hash2(plate * 3 + rivAt, course * 11 + top) * 9) - 2; if (run > 1 && r - top <= (run - 1) * (0.3 + k.wear * 0.8)) { row.push(r - top < 2 ? RUST[2] : RUST[1]); continue; } }
                    // under a floor's edge: streaks of rust run down from the lip
                    if (lipAbove && j < 9 && j >= 4) { const sn = hash2(wx, ty * 3 + 1); if (sn < 0.12 * (0.4 + k.wear) && j - 4 < Math.floor(hash2(wx * 7, ty) * 6)) { row.push(j < 6 ? RUST[2] : RUST[1]); continue; } }
                    row.push(worn(k, R, lv, wx, wy, 1, tone > 0.86 ? 0.12 : 0));
                }
                putRow(x, px, py + j, row);
            }
        },
        /* The top of a wall, where Scout walks: a deep grey tread plate, its edge rubbed bright by
           feet, rust in its pits and down its face. */
        lip(x, a, tx, ty, px, py) {
            const k = fkit(a), R = k.lip;
            for (let j = 0; j < 5; j++) {
                const row = [];
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i;
                    if (j === 0 || j === 4) { row.push(FY.out); continue; }
                    if (wx % 32 === 0) { row.push(j === 1 ? R[3] : R[0]); continue; }       // the joint between plates
                    let lv = j === 1 ? 5 : j === 2 ? 3 : 2;
                    if (j === 1 && hash2(wx, ty) < 0.25) lv = 6;                          // rubbed bright
                    if (j === 2 && (wx + (tx % 2) * 2) % 4 === 1) lv = 4;                // the tread's raised diamonds
                    if (j === 3 && (wx + (tx % 2) * 2) % 4 === 3) lv = 3;
                    row.push(worn(k, R, lv, wx, ty * 16 + j + 900, 7, j === 3 ? 0.06 : 0));
                }
                putRow(x, px, py + j, row);
            }
        },
        back(x, a) { x.fillStyle = "#1a0c08"; x.fillRect(0, 0, a.w * 16, a.h * 16); },
        frame() {},
        /* BEHIND IT ALL, every open place: brick, slow; great pipes standing and crossing, slower than
           Scout; gears turning in the gloom at two depths; the furnaces' slots glowing. */
        sky(g, cam, a, h) {
            const pat = g.createPattern(brickTile(), "repeat");
            g.save(); g.translate(-Math.round(cam.x * 0.3) % 32, -Math.round(cam.y * 0.3) % 24); g.fillStyle = pat; g.fillRect(0, 0, h.VW + 32, h.VH + 24); g.restore();
            /* THE LAB, in the far wall (14 Oct 2026, "a science experiment gone wrong"): specimen vats glowing green,
               bubbles rising in them and something dark asleep in each, one in a few cracked and leaking; Tesla coils,
               arcing now and then with a flash. */
            const md = (v, p) => ((v % p) + p) % p, fr = h.frameNo;
            for (let i = Math.floor((cam.x * 0.3 - 60) / 150); i <= Math.floor((cam.x * 0.3 + h.VW + 60) / 150); i++) {
                const X = Math.round(i * 150 - cam.x * 0.3 + 60), Y0 = Math.round(md(60 + hash2(i, 3) * 60 - cam.y * 0.3, 224));
                for (const Y of [Y0 - 224, Y0]) {
                    if (Y > h.VH || Y < -80) continue;
                    if (hash2(i, 5) < 0.62) {
                        const cracked = hash2(i, 9) < 0.25, lvl = cracked ? 16 : 7;
                        g.save(); g.globalCompositeOperation = "lighter"; const gl = g.createRadialGradient(X + 10, Y + 26, 2, X + 10, Y + 26, 44); gl.addColorStop(0, "rgba(90,255,110," + (0.16 + Math.sin(fr / 30 + i) * 0.03).toFixed(3) + ")"); gl.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gl; g.fillRect(X - 34, Y - 18, 88, 88); g.restore();
                        g.fillStyle = "#0e1a10"; g.fillRect(X, Y + 5, 20, 38);
                        const lg = g.createLinearGradient(0, Y + 5 + lvl, 0, Y + 43); lg.addColorStop(0, "rgba(120,255,120,0.55)"); lg.addColorStop(1, "rgba(30,140,50,0.55)"); g.fillStyle = lg; g.fillRect(X + 1, Y + 5 + lvl, 18, 38 - lvl);
                        g.fillStyle = "rgba(8,30,12,0.85)"; g.beginPath(); g.ellipse(X + 10, Y + 28, 5, 9, 0, 0, Math.PI * 2); g.fill(); g.fillRect(X + 8, Y + 17, 4, 4);
                        for (let b = 0; b < 4; b++) { const by = Y + 42 - md(fr * 0.4 + b * 9 + i * 5, 36 - lvl); if (by > Y + 5 + lvl) { g.fillStyle = "rgba(220,255,200,0.8)"; g.fillRect(X + 4 + ((b * 5 + i) % 12), Math.round(by), 1, 1); } }
                        g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(X + 3, Y + 7, 1, 34);
                        if (cracked) { g.fillStyle = "#c8ffd0"; for (let k = 0; k < 7; k++) g.fillRect(X + 12 + (k % 3) - 1, Y + 9 + k * 2, 1, 2); g.fillStyle = "rgba(110,230,90,0.8)"; g.fillRect(X + 13, Y + 23, 1, 20 + md(fr * 0.3, 6)); }
                        g.fillStyle = "#07080a"; g.fillRect(X - 2, Y, 24, 6); g.fillRect(X - 2, Y + 42, 24, 7);
                        g.fillStyle = "#3a3842"; g.fillRect(X - 1, Y + 1, 22, 2); g.fillRect(X - 1, Y + 43, 22, 2); g.fillStyle = "#6a5a36"; g.fillRect(X - 1, Y + 4, 22, 1); g.fillRect(X - 1, Y + 46, 22, 1);
                        g.fillStyle = "#1c1a22"; g.fillRect(X + 8, Y - 30, 4, 30);
                    } else {
                        // a Tesla coil: a base, the copper winding, a steel ball; now and then a bolt off it
                        g.fillStyle = "#07080a"; g.fillRect(X - 2, Y + 38, 24, 10); g.fillStyle = "#2c2a32"; g.fillRect(X - 1, Y + 39, 22, 8);
                        for (let y = Y + 8; y < Y + 38; y++) { g.fillStyle = y % 2 ? "#5a2e14" : "#7a4420"; g.fillRect(X + 6, y, 8, 1); }
                        g.fillStyle = "#07080a"; g.beginPath(); g.arc(X + 10, Y + 4, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = "#4a4852"; g.beginPath(); g.arc(X + 10, Y + 4, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = "#8a8894"; g.fillRect(X + 7, Y + 1, 2, 2);
                        if (hash2(i, Math.floor(fr / 5)) < 0.14) {
                            g.save(); g.globalCompositeOperation = "lighter";
                            const fl = g.createRadialGradient(X + 10, Y + 4, 2, X + 10, Y + 4, 60); fl.addColorStop(0, "rgba(170,200,255,0.3)"); fl.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = fl; g.fillRect(X - 50, Y - 56, 120, 120);
                            for (let b = 0; b < 2; b++) { const ax = X + 10, ay = Y + 4, tx2 = ax + (hash2(i * 3 + b, fr >> 2) - 0.5) * 80, ty2 = ay + (hash2(i * 5 + b, fr >> 2) - 0.3) * 60; g.strokeStyle = "rgba(200,220,255,0.9)"; g.lineWidth = 1; g.beginPath(); g.moveTo(ax, ay); for (let k = 1; k <= 6; k++) { const kk = k / 6; g.lineTo(ax + (tx2 - ax) * kk + (hash2(k + b * 9, fr) - 0.5) * 8, ay + (ty2 - ay) * kk + (hash2(k * 3 + b, fr) - 0.5) * 8); } g.stroke(); }
                            g.restore();
                        }
                    }
                }
            }
            // the gears, in the gloom: two depths, each a little brighter than the one behind it, rusted
            for (const [k, cols] of [[0.35, { k: "#0a0706", b: "#1e1914", l: "#28221b", d: "#15110d", h: "#302820", rust: ["#1a140e", "#241c14", "#2e2418"], wear: 0.6 }], [0.5, { k: "#0a0706", b: "#2a231b", l: "#383024", d: "#1d1813", h: "#433a2c", rust: ["#221a12", "#30251a", "#3e3020"], wear: 0.6 }]]) {
                const step = k < 0.4 ? 190 : 150;
                for (let i = Math.floor((cam.x * k - 140) / step); i <= Math.floor((cam.x * k + h.VW + 140) / step); i++) {
                    const R = 26 + Math.floor(hash2(i, k * 100) * 30), teeth = 10 + Math.floor(R / 4);
                    const cx = i * step - cam.x * k + 50, cy = 50 + hash2(i, 7 + k * 10) * 120 - ((cam.y * k) % 240);
                    const img = h.gear(R, teeth, cols, (i % 2 ? 1 : -1) * h.frameNo * 0.004 * 40 / R);
                    for (const yy of [cy, cy + 240]) g.drawImage(img, Math.round(cx - img.width / 2), Math.round(yy - img.height / 2));
                }
            }
            // the great pipes: standing, a flange every so often; one lying across
            const kp = 0.6, FP = farPipeArt();
            for (let i = Math.floor((cam.x * kp - 60) / 230); i <= Math.floor((cam.x * kp + h.VW + 60) / 230); i++) {
                const X = Math.round(i * 230 - cam.x * kp + 28);
                for (let y = -(Math.round(cam.y * kp) % 192) - 192; y < h.VH; y += 192) g.drawImage(FP.up, X, y);
            }
            const Y2 = Math.round(150 - (cam.y * kp) % 224);
            for (let X = -(Math.round(cam.x * kp) % 192) - 192; X < h.VW; X += 192) g.drawImage(FP.across, X, Y2);
            const gr = g.createLinearGradient(0, 0, 0, h.VH); gr.addColorStop(0, "rgba(0,0,0,0.4)"); gr.addColorStop(0.5, "rgba(0,0,0,0.05)"); gr.addColorStop(1, "rgba(0,0,0,0.35)"); g.fillStyle = gr; g.fillRect(0, 0, h.VW, h.VH);
        },
        /* A PLATFORM: a deep grey iron pipe, round (lit along its top, a shine, shade beneath), rust
           gathered on its underside; a bolted flange at each free end and every two tiles along, rust
           weeping from the joints. */
        platform(x, X, Y, W, o) {
            const k = fkit(o && o.a), R = k.pipe, SH = [-1, 4, 5, 3, 3, 2, 2, 1, 1, -1];
            if (hash2((o && o.seed) || 0, 77) < 0.45) {
                // AN OAK BEAM: two planks deep, a steel cap riveted on each free end and a strap every two tiles
                const S = k.block;
                for (let j = 0; j < 10; j++) { const row = []; for (let i = 0; i < W; i++) row.push(j === 0 || j === 9 ? FY.out : oakAt(k, X + i, Y + j)); putRow(x, X, Y + j, row); }
                const cap = (cx, w) => { x.fillStyle = FY.out; x.fillRect(cx, Y - 1, w, 12); x.fillStyle = S[3]; x.fillRect(cx + 1, Y, w - 2, 10); x.fillStyle = S[5]; x.fillRect(cx + 1, Y, w - 2, 1); x.fillStyle = S[1]; x.fillRect(cx + 1, Y + 9, w - 2, 1); x.fillStyle = S[6]; x.fillRect(cx + Math.floor(w / 2), Y + 2, 1, 1); x.fillRect(cx + Math.floor(w / 2), Y + 7, 1, 1); x.fillStyle = FY.out; x.fillRect(cx + Math.floor(w / 2), Y + 3, 1, 1); x.fillRect(cx + Math.floor(w / 2), Y + 8, 1, 1); };
                if (!(o && o.left)) cap(X, 5); if (!(o && o.right)) cap(X + W - 5, 5);
                for (const s of between(W, 32, 4)) cap(X + s, 4);
                return;
            }
            for (let j = 0; j < 10; j++) {
                const row = [];
                for (let i = 0; i < W; i++) {
                    const lv = SH[j];
                    if (lv < 0) { row.push(FY.out); continue; }
                    if (j === 2 && hash2(X + i, Y) < 0.18) { row.push(R[5]); continue; }   // the shine, broken where it is dull
                    row.push(worn(k, R, lv, X + i, Y + j, 11, j > 5 ? 0.1 : j < 3 ? -0.05 : 0));
                }
                putRow(x, X, Y + j, row);
            }
            const flange = fx => {
                for (let j = -1; j < 11; j++) {
                    const row = [];
                    for (let i = 0; i < 5; i++) {
                        if (j === -1 || j === 10 || i === 0 || i === 4) { row.push(FY.out); continue; }
                        const lv = i === 1 ? 4 : i === 3 ? 1 : j < 1 ? 4 : j > 7 ? 1 : 2;
                        row.push(worn(k, R, lv, fx + i, Y + j + 50, 13, 0.08));
                    }
                    putRow(x, fx, Y + j, row);
                }
                x.fillStyle = R[6]; x.fillRect(fx + 2, Y + 1, 1, 1); x.fillRect(fx + 2, Y + 7, 1, 1);
                x.fillStyle = FY.out; x.fillRect(fx + 2, Y + 2, 1, 1); x.fillRect(fx + 2, Y + 8, 1, 1);
                // rust run down from the joint, a drop or two below the pipe
                const n = Math.floor(hash2(fx, Y) * 4 * (0.4 + k.wear));
                for (let d = 0; d < n; d++) { x.fillStyle = d === 0 ? RUST[2] : RUST[1]; x.fillRect(fx + 2 + (d > 1 ? 1 : 0), Y + 11 + d, 1, 1); }
            };
            if (!(o && o.left)) flange(X); if (!(o && o.right)) flange(X + W - 5);
            for (const s of between(W, 32, 5)) flange(X + s);
        },
        /* AN IRON BLOCK on the lava (the owner's: "the mechanism that carries scout across the lava
           looks unfinished"). Across: an I-girder hung from the roof on threaded rods, a stop at each
           end; a trolley riding it on two wheels, its housing below; from the housing two chains to a
           spreader bar, and from the bar's ends a chain to a shackle at each corner of the block. Up and
           down: a pulley wheel in a bracket on the roof, turning as the chains run, down to the bar. */
        mover(g, m, a, h) {
            const X = Math.round(m.x), Y = Math.round(m.y), W = m.w, k = fkit(a), R = k.block, K = FY.out;
            const link = (cx, y, i) => { g.fillStyle = K; if (i % 2) { g.fillRect(cx - 1, y, 3, 4); g.fillStyle = hash2(cx, y) < 0.2 ? RUST[2] : R[4]; g.fillRect(cx, y + 1, 1, 2); } else { g.fillRect(cx, y, 1, 4); g.fillStyle = R[5]; g.fillRect(cx, y + 1, 1, 1); } };
            const chainV = (cx, y0, y1) => { let i = 0; for (let y = y0; y < y1 - 1; y += 3, i++) link(cx, y, i); };
            const chainD = (x0, y0, x1, y1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3)); for (let i = 0; i < n; i++) { const px = Math.round(x0 + (x1 - x0) * i / n), py = Math.round(y0 + (y1 - y0) * i / n); g.fillStyle = K; g.fillRect(px - 1, py - 1, 3, 3); g.fillStyle = i % 2 ? R[4] : (hash2(px, py) < 0.2 ? RUST[2] : R[3]); g.fillRect(px, py, 1, 1); } };
            const ceilAbove = (px, py) => { let ty = Math.floor(py / 16); for (let n = 0; n < 20 && ty > 0; n++, ty--) if (h.wallish(a, Math.floor(px / 16), ty - 1)) return ty * 16; return py - 48; };
            // the sling: from the hook a chain down to a shackle at each end of the block (clear of Scout, who rides between them)
            const sling = (hx, hy) => {
                g.fillStyle = K; g.fillRect(hx - 3, hy, 7, 5); g.fillStyle = R[4]; g.fillRect(hx - 2, hy + 1, 5, 2); g.fillStyle = R[6]; g.fillRect(hx - 1, hy + 1, 1, 1);
                g.fillStyle = K; g.fillRect(hx - 1, hy + 5, 3, 3); g.fillStyle = R[3]; g.fillRect(hx, hy + 5, 1, 2);
                chainD(hx - 1, hy + 8, X + 3, Y - 3); chainD(hx + 1, hy + 8, X + W - 4, Y - 3);
                for (const ex of [X + 3, X + W - 4]) { g.fillStyle = K; g.fillRect(ex - 2, Y - 3, 5, 3); g.fillStyle = R[4]; g.fillRect(ex - 1, Y - 3, 1, 2); g.fillRect(ex + 1, Y - 3, 1, 2); }
            };
            if (m.kind === "h" && m.x0 !== undefined) {
                const railY = Y - 62, rx0 = Math.round(m.x0) - 12, rx1 = Math.round(m.x1) + W + 12;
                // the rig that stays put (rods, plates, girder, stops), drawn once and kept
                if (!m._rig || m._rigKey !== k.block[3] + "|" + k.wear) {
                    const hang = [], n = Math.max(1, Math.round((rx1 - rx0) / 56));
                    for (let i = 0; i <= n; i++) { const hx = Math.round(rx0 + 8 + (rx1 - rx0 - 16) * i / n); hang.push({ x: hx, top: ceilAbove(hx, railY) }); }
                    const top = Math.min(...hang.map(q => q.top)), c = document.createElement("canvas"); c.width = rx1 - rx0 + 2; c.height = railY + 8 - top; const x = c.getContext("2d"), ox = rx0, oy = top;
                    const P = (px, py, col) => { x.fillStyle = col; x.fillRect(px - ox, py - oy, 1, 1); }, F = (px, py, w, hh, col) => { x.fillStyle = col; x.fillRect(px - ox, py - oy, w, hh); };
                    for (const q of hang) {
                        F(q.x - 5, q.top, 11, 3, K); F(q.x - 4, q.top, 9, 1, R[4]); F(q.x - 4, q.top + 1, 9, 1, R[2]); P(q.x - 3, q.top + 1, R[6]); P(q.x + 3, q.top + 1, R[6]);
                        F(q.x - 1, q.top + 3, 3, railY - 7 - q.top - 3, K); F(q.x, q.top + 3, 1, railY - 7 - q.top - 3, R[4]);
                        for (let y = q.top + 5; y < railY - 8; y += 2) P(q.x, y, (y >> 1) % 2 ? R[2] : R[5]);
                        if (hash2(q.x, q.top) < 0.6) { P(q.x, q.top + 4, RUST[2]); P(q.x, q.top + 5, RUST[1]); }
                        F(q.x - 3, railY - 7, 7, 4, K); F(q.x - 2, railY - 6, 5, 2, R[3]); P(q.x - 2, railY - 6, R[5]);
                    }
                    // the girder: top flange, web, bottom flange (rows railY-4 to railY+6)
                    const prof = [-1, 5, 3, -1, 1, 1, 2, -1, 4, 2, -1];
                    for (let r = 0; r < prof.length; r++) for (let px = rx0; px < rx1; px++) {
                        const lv = prof[r];
                        P(px, railY - 4 + r, lv < 0 ? K : (r >= 4 && r <= 6) ? (((px - rx0) % 12 === 6 && r === 5) ? R[5] : R[lv]) : worn(k, R, lv, px, railY + r, 41, r > 7 ? 0.08 : 0));
                    }
                    // a stop at each end, striped
                    for (const sx of [rx0, rx1 - 5]) { F(sx, railY - 8, 5, 18, K); for (let r = 0; r < 16; r++) F(sx + 1, railY - 7 + r, 3, 1, ((r >> 1) % 2) ? "#b8923a" : "#2a2420"); }
                    m._rig = { c, ox, oy }; m._rigKey = k.block[3] + "|" + k.wear;
                }
                g.drawImage(m._rig.c, m._rig.ox, m._rig.oy);
                // the trolley: two wheels on the girder (turning as it goes), straps down either side, the housing below
                const tx = X + W / 2, spin = m.x / 3;
                for (const wx of [tx - 6, tx + 6]) {
                    const cy = railY - 8;
                    g.fillStyle = K; g.fillRect(wx - 3, cy - 2, 7, 5); g.fillRect(wx - 2, cy - 3, 5, 7);
                    g.fillStyle = R[4]; g.fillRect(wx - 2, cy - 2, 5, 5); g.fillStyle = R[2]; g.fillRect(wx - 1, cy + 1, 4, 1); g.fillRect(wx + 1, cy - 1, 1, 3);
                    g.fillStyle = R[6]; g.fillRect(wx, cy, 1, 1);
                    g.fillStyle = K; g.fillRect(Math.round(wx + Math.cos(spin) * 2), Math.round(cy + Math.sin(spin) * 2), 1, 1);
                }
                for (const sx of [tx - 10, tx + 8]) { g.fillStyle = K; g.fillRect(sx, railY - 8, 3, 18); g.fillStyle = R[3]; g.fillRect(sx + 1, railY - 7, 1, 16); g.fillStyle = R[6]; g.fillRect(sx + 1, railY - 6, 1, 1); g.fillRect(sx + 1, railY + 7, 1, 1); }
                const hy = railY + 9;
                g.fillStyle = K; g.fillRect(tx - 10, hy, 21, 8); g.fillStyle = R[3]; g.fillRect(tx - 9, hy + 1, 19, 6); g.fillStyle = R[5]; g.fillRect(tx - 9, hy + 1, 19, 1); g.fillStyle = R[1]; g.fillRect(tx - 9, hy + 6, 19, 1);
                g.fillStyle = R[6]; g.fillRect(tx - 8, hy + 3, 1, 1); g.fillRect(tx + 8, hy + 3, 1, 1); g.fillStyle = RUST[2]; g.fillRect(tx + 3, hy + 5, 2, 1); g.fillStyle = RUST[1]; g.fillRect(tx + 4, hy + 6, 1, 1);
                g.fillStyle = "#b8923a"; g.fillRect(tx - 5, hy + 3, 3, 2); g.fillRect(tx + 1, hy + 3, 3, 2); g.fillStyle = K; g.fillRect(tx - 2, hy + 3, 3, 2);
                chainV(tx, hy + 8, hy + 14); sling(tx, hy + 13);
            } else {
                // up and down: the pulley on the roof
                if (m._roof === undefined) m._roof = ceilAbove(X + W / 2, m.y0 !== undefined ? m.y0 : Y);
                const cx = X + W / 2, top = m._roof, py = top + 7, spin = m.y / 4;
                g.fillStyle = K; g.fillRect(cx - 8, top, 17, 3); g.fillStyle = R[4]; g.fillRect(cx - 7, top, 15, 1); g.fillStyle = R[2]; g.fillRect(cx - 7, top + 1, 15, 1);
                g.fillStyle = K; g.fillRect(cx - 7, top + 2, 2, 8); g.fillRect(cx + 6, top + 2, 2, 8);
                g.fillStyle = K; g.fillRect(cx - 5, py - 4, 11, 9); g.fillRect(cx - 4, py - 5, 9, 11);
                g.fillStyle = R[4]; g.fillRect(cx - 4, py - 4, 9, 9); g.fillStyle = R[2]; g.fillRect(cx - 3, py - 3, 7, 7); g.fillStyle = R[5]; g.fillRect(cx, py, 1, 1);
                for (let i = 0; i < 4; i++) { const an = spin + i * Math.PI / 2; g.fillStyle = K; g.fillRect(Math.round(cx + Math.cos(an) * 3), Math.round(py + Math.sin(an) * 3), 1, 1); }
                chainV(cx, py + 5, Y - 38); sling(cx, Y - 38);
            }
            g.drawImage(blockImage(k, W), X, Y);
        },
        // the scenery: cogs and springs, iron crates, chain, barrels, ingots, an anvil, coal
        props(x, a, h, spots) {
            const PICK = [["cog"], ["cogPair"], ["spring", "crateSmall"], ["crateIron"], ["chainHeap", "keg"], ["barrelTall"], ["ingots"], ["anvil"], ["coal"]];
            for (const sp of spots) {
                const names = PICK[Math.floor(sp.hv * 1000) % PICK.length];
                let dx = 0;
                for (const n of names) { const img = h.dim(h.spr(n, 0)); if (!img) continue; x.drawImage(img, sp.px + dx, sp.py + 16 - img.height); dx += img.width - 2; }
            }
        }
    };

    // ---------------------------------------------------------------- 12. THE NEON JUNGLE ARCADE (14 Oct 2026)
    /* The owner's: "abandoned 90s neon jungle arcade". A games arcade from the nineties, shut for
       years, the jungle come in through its roof. Black wall panels printed with faded squiggles,
       triangles and dots; cosmic carpet underfoot, edged with neon tube (some of it dead); the
       platforms its fallen neon signs, on brackets, vines hanging off them; behind it all rows of
       cabinets in the dark with their screens flickering, signs buzzing on the far wall, vines and
       leaves, and light falling through the holes in the roof. Pinball bumpers and spring pads. */
    const AR = { out: "#07040c", p0: "#0e0718", p1: "#160b28", p2: "#1f1138", p3: "#2c1a4e", p4: "#3e2868", p5: "#5a3c8e",
        pink: "#ff3ea8", pinkL: "#ffb2dc", pinkD: "#6a1648", cyan: "#3effe8", cyanL: "#c4fffa", cyanD: "#12504e", lime: "#b6ff3e", limeL: "#e4ffb0", limeD: "#3e5a12",
        yel: "#ffe23e", yelL: "#fff4b8", yelD: "#5e5010", vio: "#a46bff", vioL: "#dcc8ff", vioD: "#36246a", org: "#ff8a2e",
        g0: "#04120a", g1: "#0a2412", g2: "#12401c", g3: "#1e6428", g4: "#2e8a36", g5: "#52b444", g6: "#94dc5c",
        m0: "#14141e", m1: "#262634", m2: "#424256", m3: "#6e6e88", m4: "#b0b0c6" };
    // (14 Oct 2026, the owner's: "allow me to change the colours of the glows on the top of the walls ... and the colour of the glows on platforms too"): a tube's shades from one colour
    const tubeOf = c => [c, mixC(c, "#ffffff", 0.65), mixC(c, "#000000", 0.66)];
    const arcNeon = (a, k) => { const c = a && a.settings && a.settings.colors && a.settings.colors[k]; return typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? tubeOf(c) : null; };
    const TUBES = [[AR.pink, AR.pinkL, AR.pinkD], [AR.cyan, AR.cyanL, AR.cyanD], [AR.lime, AR.limeL, AR.limeD], [AR.vio, AR.vioL, AR.vioD], [AR.yel, AR.yelL, AR.yelD]];
    // a picture drawn into a grid of letters (for the props, which must be named sprites)
    function grid(w, h) {
        const G = Array.from({ length: h }, () => Array(w).fill("."));
        const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) G[y][x] = c; };
        return { G, set, get: (x, y) => (G[y] && G[y][x]) || ".", rect(x, y, ww, hh, c) { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) set(x + i, y + j, c); }, rows: () => G.map(r => r.join("")) };
    }
    // a vine up the side of a thing: a stem wandering, a leaf now and then
    function vineUp(Q, x0, y0, len, seed) {
        let x = x0;
        for (let i = 0; i < len; i++) {
            const y = y0 - i; Q.set(x, y, "v"); if (hash2(i, seed) < 0.3) Q.set(x + 1, y, "V");
            if (i % 4 === 2) { const sd = hash2(i, seed + 3) < 0.5 ? -1 : 1; Q.set(x + sd, y, "l"); Q.set(x + sd * 2, y - 1, "l"); Q.set(x + sd, y - 1, "L"); }
            if (hash2(i, seed + 9) < 0.18) x += hash2(i, seed + 11) < 0.5 ? -1 : 1;
        }
    }
    const ARCPAL = { k: AR.out, a: AR.p4, b: AR.p3, c: AR.p2, d: AR.p1, M: AR.pink, N: AR.pinkL, m: AR.pinkD, S: "#1e8a9a", T: "#46d8e0", U: "#b8fff8", s: "#0c1a24", P: AR.m2, p: AR.m1, B: AR.yel, R: AR.pink, J: AR.m4, C: AR.m1, Y: AR.org, v: AR.g3, V: AR.g5, l: AR.g4, L: AR.g6, x: AR.m3 };
    // AN ARCADE CABINET: marquee lit, the screen glowing (or dead and cracked), stick and buttons, the coin door; a vine up its side
    function cabinetRows(alive, seed) {
        const Q = grid(20, 34);
        Q.rect(0, 0, 20, 34, "k");
        Q.rect(1, 1, 18, 4, alive ? "M" : "m"); if (alive) for (let i = 3; i < 17; i += 3) { Q.set(i, 2, "N"); Q.set(i + 1, 3, "N"); }
        Q.rect(1, 6, 18, 12, "c"); Q.rect(1, 6, 1, 12, "a");
        Q.rect(3, 7, 14, 10, alive ? "S" : "s");
        if (alive) { for (let y = 7; y < 17; y += 2) Q.rect(3, y, 14, 1, "T"); Q.set(4, 8, "U"); Q.set(5, 8, "U"); Q.set(4, 9, "U"); Q.rect(8, 11, 4, 2, "U"); }
        else { let y = 9; for (let x = 4; x < 16; x++) { Q.set(x, y, "x"); if (hash2(x, seed) < 0.4) y += hash2(x, seed + 1) < 0.5 ? 1 : -1; y = Math.max(8, Math.min(15, y)); } }
        Q.rect(0, 18, 20, 4, "k"); Q.rect(1, 18, 18, 3, "P"); Q.rect(1, 18, 18, 1, "x");
        Q.set(5, 18, "J"); Q.set(4, 17, "R"); Q.set(5, 17, "R"); Q.set(10, 19, "B"); Q.set(12, 19, "R"); Q.set(14, 19, "B");
        Q.rect(1, 22, 18, 11, "b"); Q.rect(1, 22, 1, 11, "a"); Q.rect(18, 22, 1, 11, "d");
        Q.rect(7, 24, 6, 6, "C"); Q.set(9, 25, "Y"); Q.set(10, 25, "Y"); Q.set(9, 27, "Y"); Q.set(10, 27, "Y");
        vineUp(Q, 1 + (seed % 3), 33, alive ? 12 : 22, seed);
        return Q.rows();
    }
    sprites["arcadeCab"] = { pal: ARCPAL, rows: cabinetRows(true, 5) };
    sprites["arcadeCabDead"] = { pal: ARCPAL, rows: cabinetRows(false, 8) };
    // A PINBALL TABLE: the backbox lit up, the table on its legs, a fern grown over one end
    {
        const Q = grid(28, 24);
        Q.rect(18, 0, 10, 12, "k"); Q.rect(19, 1, 8, 10, "b"); Q.rect(20, 2, 6, 6, "S"); Q.set(21, 3, "U"); Q.set(24, 5, "B"); Q.set(22, 6, "R"); Q.rect(20, 9, 6, 1, "M");
        Q.rect(0, 10, 28, 6, "k"); Q.rect(1, 11, 26, 4, "b"); Q.rect(1, 11, 26, 1, "x"); Q.rect(3, 12, 2, 2, "R"); Q.rect(9, 12, 2, 2, "B"); Q.rect(15, 12, 2, 2, "T");
        for (const lx of [2, 24]) { Q.rect(lx, 16, 2, 8, "k"); Q.set(lx, 17, "x"); Q.rect(lx - 1, 22, 4, 2, "k"); }
        vineUp(Q, 4, 23, 10, 21);
        sprites["arcadePinball"] = { pal: ARCPAL, rows: Q.rows() };
    }
    // A CLAW MACHINE: the glass case, prizes heaped in it, the claw hung over them, the chute below
    {
        const Q = grid(20, 34);
        Q.rect(0, 0, 20, 34, "k"); Q.rect(1, 1, 18, 3, "M"); Q.rect(2, 2, 16, 1, "N");
        Q.rect(1, 4, 18, 16, "s"); Q.rect(2, 5, 1, 13, "U");
        Q.rect(9, 4, 1, 5, "x"); Q.set(8, 9, "J"); Q.set(10, 9, "J"); Q.set(7, 10, "J"); Q.set(11, 10, "J");
        const toys = ["R", "B", "T", "L", "N", "Y"]; for (let i = 0; i < 26; i++) { const x = 3 + Math.floor(hash2(i, 4) * 14), y = 14 + Math.floor(hash2(i, 9) * 5); Q.set(x, y, toys[i % toys.length]); Q.set(x + 1, y, toys[i % toys.length]); }
        Q.rect(1, 20, 18, 13, "b"); Q.rect(1, 20, 1, 13, "a"); Q.rect(3, 23, 6, 5, "d"); Q.rect(12, 22, 4, 2, "C"); Q.set(13, 22, "Y");
        vineUp(Q, 17, 33, 16, 33);
        sprites["arcadeClaw"] = { pal: ARCPAL, rows: Q.rows() };
    }
    // AN OLD TELEVISION, its screen all static
    {
        const Q = grid(16, 13);
        Q.rect(0, 1, 16, 12, "k"); Q.rect(1, 2, 14, 10, "p"); Q.rect(2, 3, 9, 7, "s");
        for (let y = 3; y < 10; y++) for (let x = 2; x < 11; x++) if (hash2(x * 3, y * 5) < 0.45) Q.set(x, y, hash2(x, y) < 0.5 ? "x" : "J");
        Q.set(13, 4, "B"); Q.set(13, 6, "x"); Q.set(6, 0, "x"); Q.set(9, 0, "x"); Q.set(7, 1, "x"); Q.set(8, 1, "x");
        sprites["arcadeTV"] = { pal: ARCPAL, rows: Q.rows() };
    }
    // TICKETS, a spill of them; A NEON TUBE fallen and broken
    sprites["arcadeTickets"] = { pal: { k: AR.out, a: "#ff9a3e", b: "#d8682a", c: "#ffd08a" }, rows: [
        "....kkkkk.....",
        "...kaacaak....",
        "..kkbbabbkkk..",
        ".kaacakaabcak.",
        "kbbabbbkbbabbk",
        "kkkkkkkkkkkkkk"] };
    sprites["arcadeTube"] = { pal: { k: AR.out, a: AR.pinkD, b: "#4a1a3a", c: AR.m3, d: "#9a7a90" }, rows: [
        "..............kk..",
        "kkkkkkkk....kkcck.",
        "kcaaaabak..kabbdk.",
        "kkkkkkkk...kkkkkk."] };
    // JUNGLE: a fern, a monstera's broad split leaves, a creeper heap
    {
        const Q = grid(18, 12);
        for (let f = 0; f < 5; f++) { const ang = -Math.PI * (0.15 + f * 0.17); let x = 9, y = 11; for (let i = 0; i < 9 - Math.abs(f - 2); i++) { x += Math.cos(ang) * 1; y += Math.sin(ang) * 1 + i * 0.07; Q.set(x, y, i > 5 ? "L" : "l"); if (i % 2) { Q.set(x, y - 1, "V"); Q.set(x + (f < 2 ? -1 : 1), y + 1, "v"); } } }
        sprites["jungleFern"] = { pal: ARCPAL, rows: Q.rows() };
    }
    {
        const Q = grid(22, 18);
        const leaf = (cx, cy, r, sd) => { for (let y = -r; y <= r; y++) for (let x = -r - 2; x <= r + 2; x++) { const d = (x * x) / ((r + 2) * (r + 2)) + (y * y) / (r * r); if (d > 1) continue; const slit = Math.abs(y) > 1 && (x * 7 + sd) % 5 === 0; if (slit) continue; Q.set(cx + x, cy + y, d > 0.75 ? "v" : y < 0 ? "L" : "l"); } for (let x = -r - 1; x <= r + 1; x++) Q.set(cx + x, cy, "V"); };
        leaf(6, 6, 4, 1); leaf(15, 8, 4, 3); leaf(10, 12, 3, 2);
        for (let y = 12; y < 18; y++) { Q.set(10, y, "v"); Q.set(11, y, "v"); }
        sprites["jungleMonstera"] = { pal: ARCPAL, rows: Q.rows() };
    }
    {
        const Q = grid(16, 8);
        for (let i = 0; i < 70; i++) { const x = Math.floor(hash2(i, 61) * 16), y = 3 + Math.floor(hash2(i, 67) * 5); Q.set(x, y, ["v", "l", "L", "V"][i % 4]); }
        Q.rect(0, 7, 16, 1, "v");
        sprites["jungleCreeper"] = { pal: ARCPAL, rows: Q.rows() };
    }
    /* VINES TO CLIMB (14 Oct 2026, the owner's: "rework them to make them the best quality you can, and be a
       rope type item"): the arcade's rope is a vine. Two strands twisted round each other (one lit, one in
       shade, swapping every four rows so it reads as a twist), broad leaves off it by turns, lit on top and
       darker under, a tendril curling; at the top a spread of leaves over the ledge it hangs from; at the
       foot the stem thinning to a curl. Tiles end to end without a seam. */
    {
        const VP = { k: "#04120a", a: "#3a9a3e", b: "#1e6428", v: "#123c1a", l: "#52b444", L: "#9be060", m: "#2e7a30" };
        const stem = (Q, y, thin) => { const tw = (y % 8) < 4; if (thin) { Q.set(7, y, "k"); Q.set(8, y, tw ? "a" : "b"); Q.set(9, y, "k"); return; } Q.set(6, y, "k"); Q.set(7, y, tw ? "a" : "b"); Q.set(8, y, tw ? "b" : "a"); Q.set(9, y, "k"); };
        const leaf = (Q, x, y, s) => {   // a leaf off the stem at (x, y), s = -1 to the left, 1 to the right
            for (const [dx, dy, c] of [[1, 0, "m"], [2, -1, "l"], [3, -2, "L"], [4, -2, "l"], [2, 0, "l"], [3, -1, "L"], [4, -1, "l"], [5, -1, "m"], [3, 0, "m"], [4, 0, "m"], [5, 0, "b"], [2, 1, "b"], [3, 1, "v"], [4, 1, "v"], [6, 0, "v"]]) Q.set(x + s * dx, y + dy, c);
            for (const [dx, dy] of [[2, 2], [3, 2], [4, 2], [5, 1], [6, 1], [7, 0], [1, 1], [5, -2], [6, -1], [3, -3], [4, -3], [2, -2]]) if (Q.get(x + s * dx, y + dy) === ".") Q.set(x + s * dx, y + dy, "k");
        };
        let Q = grid(16, 16);
        for (let y = 0; y < 16; y++) stem(Q, y);
        leaf(Q, 6, 4, -1); leaf(Q, 9, 12, 1);
        Q.set(10, 7, "m"); Q.set(11, 6, "m"); Q.set(12, 6, "b"); Q.set(12, 5, "b");   // a tendril
        sprites["rope@arcade"] = { pal: VP, rows: Q.rows() };
        Q = grid(16, 16);
        for (let y = 3; y < 16; y++) stem(Q, y);
        for (let x = 1; x < 15; x++) { const top = x < 4 || x > 11 ? 2 : 1; Q.set(x, top - 1 > 0 ? top - 1 : 0, x % 3 ? "k" : "."); for (let y = top; y < 4; y++) Q.set(x, y, y === top ? ((x * 5) % 7 < 3 ? "L" : "l") : y === 3 ? "b" : (x % 2 ? "m" : "l")); }
        Q.set(0, 2, "k"); Q.set(15, 2, "k"); Q.set(0, 3, "k"); Q.set(15, 3, "k");
        for (let x = 1; x < 15; x++) if (x < 6 || x > 9) Q.set(x, 4, "k");
        leaf(Q, 9, 11, 1);
        sprites["ropeTop@arcade"] = { pal: VP, rows: Q.rows() };
        Q = grid(16, 16);
        for (let y = 0; y < 7; y++) stem(Q, y);
        for (let y = 7; y < 11; y++) stem(Q, y, true);
        leaf(Q, 6, 3, -1);
        for (const [x, y, c] of [[8, 11, "a"], [9, 12, "a"], [10, 12, "m"], [11, 11, "m"], [11, 10, "b"], [10, 9, "b"]]) Q.set(x, y, c);
        for (const [x, y] of [[7, 11], [8, 12], [9, 13], [10, 13], [11, 12], [12, 11], [12, 10], [11, 9], [10, 8]]) if (Q.get(x, y) === ".") Q.set(x, y, "k");
        sprites["ropeEnd@arcade"] = { pal: VP, rows: Q.rows() };
    }
    // THE LAMP: a globe of neon on a chrome arm; its glow buzzes (the flame's frames)
    sprites["torchBase@arcade"] = { pal: { k: AR.out, s: AR.m4, t: AR.m2, a: AR.m3, g: "#2a0c22", u: AR.pinkD }, rows: [
        "......kk......",
        "......ks......",
        ".....ksak.....",
        "....kkkkkk....",
        "...kasssaak...",
        "..kaatttttak..",
        ".kkkkkkkkkkkk.",
        "..kguuuuuugk..",
        "..kguggggugk..",
        "..kguggggugk..",
        "..kguggggugk..",
        "..kguggggugk..",
        "..kguggggugk..",
        "..kguggggugk..",
        "..kguuuuuugk..",
        "...kkaaaakk...",
        ".....kkkk....."] };
    sprites["flame@arcade"] = { pal: { O: AR.pink, Y: AR.pinkL, W: "#fff4fa", t: AR.pinkD, r: "#c02a80" }, frames: [
        ["tOOOOOOt", "tOYYYYOt", "tOYWWYOt", "tOYWWYOt", "tOYYYYOt", "tOOOOOOt"],
        ["tOOOOOOt", "tOYYYYOt", "tOYWWYOt", "tOYWYYOt", "tOYYYYOt", "tOOOOOOt"],
        ["trOOOOrt", "tOOYYOOt", "tOYYYYOt", "tOYYYYOt", "tOOYYOOt", "trOOOOrt"],
        ["tOOOOOOt", "tOYYYYOt", "tOYWWYOt", "tOYWWYOt", "tOYYYYOt", "tOOOOOOt"]] };
    // the panels' prints, made once: a squiggle, triangles, dots, and a plain one cracked across (32 × 32 each)
    let arcPanels = null;
    function arcadePanels() {
        if (arcPanels) return arcPanels;
        arcPanels = [0, 1, 2, 3, 4].map(v => {
            const P = Array.from({ length: 32 }, () => Array(32).fill(null)), put = (x, y, c) => { if (x >= 2 && y >= 2 && x < 30 && y < 30) P[y][x] = c; };
            if (v === 0) for (let x = 4; x < 28; x++) { const y = Math.round(16 + Math.sin(x / 2.6) * 6); put(x, y, "c"); put(x, y + 1, "c"); }
            else if (v === 1) for (const [cx, cy, s] of [[10, 7, 7], [22, 19, 6]]) for (let i = 0; i <= s; i++) { put(cx - i, cy + i, "p"); put(cx + i, cy + i, "p"); put(cx - s + i * 2, cy + s, "p"); put(cx - s + i * 2 - 1, cy + s, "p"); }
            else if (v === 2) { for (let y = 5; y < 29; y += 6) for (let x = 5 + ((y / 6) % 2 ? 3 : 0); x < 28; x += 6) { put(x, y, "y"); put(x + 1, y, "y"); put(x, y + 1, "y"); put(x + 1, y + 1, "y"); } }
            else if (v === 3) { for (let x = 3; x < 29; x++) { const y = 22 + ((x % 6) < 3 ? (x % 3) : 3 - (x % 3)) * 2; put(x, y, "v"); put(x, y + 1, "v"); } for (let k = 0; k < 3; k++) for (let r = 0; r < 4; r++) { put(6 + k * 8 + r, 6 + r, "p"); put(6 + k * 8 + r, 13 - r, "p"); } }
            else { let y = 9; for (let x = 3; x < 29; x++) { put(x, y, "k"); if (hash2(x, 99) < 0.35) y += hash2(x, 7) < 0.5 ? 1 : -1; y = Math.max(4, Math.min(27, y)); } }
            return P;
        });
        return arcPanels;
    }
    const PRINT = { c: mixC(AR.cyan, AR.p1, 0.62), p: mixC(AR.pink, AR.p1, 0.62), y: mixC(AR.yel, AR.p1, 0.66), v: mixC(AR.vio, AR.p1, 0.5), k: AR.out };
    // behind it all, made once: a cabinet in the dark, its screen left for the light; signs in neon (lit and unlit)
    let arcBack = null;
    function arcadeBack() {
        if (arcBack) return arcBack;
        const cab = document.createElement("canvas"); cab.width = 26; cab.height = 46; const c = cab.getContext("2d");
        const F = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
        F(0, 0, 26, 46, "#05030a"); F(1, 1, 24, 6, "#1a0e2a"); F(1, 8, 24, 16, "#120a1e"); F(4, 10, 18, 12, "#000000"); F(0, 24, 26, 4, "#05030a"); F(1, 24, 24, 3, "#221a30"); F(1, 28, 24, 18, "#100818"); F(9, 31, 8, 7, "#07040c"); F(1, 8, 1, 38, "#1e1430");
        const sign = (w, h, drawFn) => { const mk = on => { const s = document.createElement("canvas"); s.width = w; s.height = h; const x = s.getContext("2d"); drawFn(x, on); return s; }; return { on: mk(true), off: mk(false) }; };
        const tube = (x, on, col, lit, path) => {
            x.lineCap = "round"; x.lineJoin = "round";
            if (on) { x.shadowColor = col; x.shadowBlur = 10; x.strokeStyle = col; x.lineWidth = 3; path(); x.stroke(); x.shadowBlur = 4; x.stroke(); x.shadowBlur = 0; x.strokeStyle = lit; x.lineWidth = 1; path(); x.stroke(); }
            else { x.strokeStyle = mixC(col, "#000000", 0.7); x.lineWidth = 2; path(); x.stroke(); }
        };
        const bolt = sign(40, 56, (x, on) => tube(x, on, AR.yel, AR.yelL, () => { x.beginPath(); x.moveTo(24, 6); x.lineTo(12, 28); x.lineTo(21, 28); x.lineTo(14, 50); x.lineTo(30, 22); x.lineTo(21, 22); x.closePath(); }));
        const star = sign(52, 52, (x, on) => tube(x, on, AR.pink, AR.pinkL, () => { x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 20, an = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(26 + Math.cos(an) * r, 27 + Math.sin(an) * r); } x.closePath(); }));
        const palm = sign(54, 64, (x, on) => { tube(x, on, AR.lime, AR.limeL, () => { x.beginPath(); x.moveTo(27, 58); x.quadraticCurveTo(24, 36, 30, 20); for (const [dx, dy] of [[-18, 4], [-12, -8], [14, -8], [19, 5]]) { x.moveTo(30, 20); x.quadraticCurveTo(30 + dx * 0.5, 20 + dy - 8, 30 + dx, 20 + dy); } }); tube(x, on, AR.cyan, AR.cyanL, () => { x.beginPath(); x.moveTo(6, 60); x.quadraticCurveTo(27, 52, 48, 60); }); });
        const word = (text, col, lit) => sign(RatFont.width(text, 2) + 16, 30, (x, on) => { x.shadowColor = col; x.shadowBlur = on ? 10 : 0; RatFont.draw(x, text, 8, 8, { scale: 2, outline: false, color: on ? col : mixC(col, "#000000", 0.7) }); if (on) { x.shadowBlur = 0; RatFont.draw(x, text, 8, 8, { scale: 2, outline: false, ramp: [lit, col, col, col, col, col, col] }); } });
        const arcade = word("ARCADE", AR.pink, AR.pinkL), over = word("GAME OVER", AR.cyan, AR.cyanL), score = word("HI-SCORE", AR.vio, AR.vioL), open = word("OPEN", AR.org, "#ffd0a0");
        // the vines hanging from the roof: a strip of them, made once, repeated
        const vines = document.createElement("canvas"); vines.width = 160; vines.height = 90; const v = vines.getContext("2d");
        for (let i = 0; i < 9; i++) {
            const x0 = 6 + i * 17 + Math.floor(hash2(i, 5) * 8), len = 24 + Math.floor(hash2(i, 9) * 64);
            let x = x0;
            for (let y = 0; y < len; y++) { v.fillStyle = y % 7 === 3 ? AR.g3 : AR.g2; v.fillRect(x, y, 2, 1); if (y % 6 === 2) { const sd = (y / 6) % 2 ? 1 : -1; v.fillStyle = AR.g3; v.fillRect(x + (sd > 0 ? 2 : -3), y, 3, 2); v.fillStyle = AR.g4; v.fillRect(x + (sd > 0 ? 3 : -2), y, 1, 1); } if (hash2(y, i) < 0.12) x += hash2(y, i + 3) < 0.5 ? -1 : 1; }
        }
        arcBack = { cab, signs: [arcade, bolt, over, star, score, palm, open], vines };
        return arcBack;
    }
    themes.arcade = {
        key: "arcade", allBack: true, moss: false, embers: false, soot: false, noRopes: true, tintLamp: true,
        colors: [["lipNeon", "Floor edge neon", "#3effe8"], ["platNeon", "Platform neon", "#ff3ea8"]],
        timber: { d: AR.out, s: AR.m0, m: AR.m1, l: AR.m2, q: AR.m1 },
        edge: { out: AR.out, lit: AR.p4, dark: AR.p0 },
        glow: [255, 80, 190], air: [200, 160, 255],
        stones: [[AR.p2, AR.p3, AR.p4], [AR.m1, AR.m2, AR.m3], [AR.g2, AR.g3, AR.g4]], dirt: [AR.p0, AR.p1], shard: [AR.cyan, AR.pink],
        lampAt: { bx: 1, by: -3, fx: 4, fy: 5, gx: 8, gy: 8 },
        /* THE WALLS: black-violet panels a tile and a half square, bevelled, some printed in faded
           neon (a squiggle, triangles, dots, a zigzag) and the print worn off in places; one cracked;
           the jungle in over the tops: moss and creepers hanging down the faces. */
        wall(x, a, tx, ty, px, py, h) {
            const P = arcadePanels(), open = h && !h.wallish(a, tx, ty - 1);
            for (let j = 0; j < 16; j++) {
                const row = [], wy = ty * 16 + j;
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i, bx = Math.floor(wx / 32), by = Math.floor(wy / 32), lx = wx % 32, ly = wy % 32;
                    let c;
                    if (lx === 0 || ly === 0) c = AR.out;
                    else if (lx === 1 || ly === 1) c = AR.p3;
                    else if (lx === 31 || ly === 31) c = AR.p0;
                    else {
                        const n = patchN(wx + 300, wy, 61);
                        c = n > 0.66 ? AR.p2 : n < 0.32 ? AR.p0 : AR.p1;
                        const v = Math.floor(hash2(bx * 3, by * 5) * 7);
                        if (v < 5) { const pc = P[v][ly][lx]; if (pc && hash2(wx * 3, wy * 7) > 0.22 && patchN(wx, wy + 500, 63) < 0.68) c = PRINT[pc]; }
                        if (hash2(wx, wy) < 0.004) c = AR.p4;
                    }
                    // the jungle over the top: moss, then creepers trailing down
                    if (open) {
                        const md = 2 + Math.floor(vn(wx / 4, ty * 3, 5) * 6), creeper = hash2(wx, 7 + ty) < 0.09 ? 4 + Math.floor(hash2(wx, ty + 3) * 12) : 0;
                        if (j < md) c = j === 0 ? AR.g4 : (hash2(wx, wy) < 0.3 ? AR.g2 : AR.g3);
                        else if (j === md && hash2(wx * 7, ty) < 0.5) c = AR.g1;
                        else if (j < md + creeper) c = (j - md) % 4 === 1 ? AR.g4 : AR.g2;
                    }
                    row.push(c);
                }
                putRow(x, px, py + j, row);
            }
        },
        /* The top of a wall, where Scout walks: cosmic carpet, its confetti pattern, and a neon tube
           along its edge, dead in stretches; a tuft of jungle on it now and then. */
        lip(x, a, tx, ty, px, py) {
            const CONF = [mixC(AR.pink, "#0c0820", 0.35), mixC(AR.cyan, "#0c0820", 0.35), mixC(AR.yel, "#0c0820", 0.4), mixC(AR.lime, "#0c0820", 0.4)];
            const tube = arcNeon(a, "lipNeon") || TUBES[Math.floor(hash2(Math.floor(tx / 6), ty) * 2)];
            for (let j = 0; j < 5; j++) {
                const row = [];
                for (let i = 0; i < 16; i++) {
                    const wx = tx * 16 + i;
                    if (j === 0 || j === 4) { row.push(AR.out); continue; }
                    if (j === 3) { const dead = vn(wx / 11, ty * 7, 71) < 0.3; row.push(dead ? tube[2] : (wx % 16 === 0 ? tube[2] : tube[0])); continue; }
                    const hs = hash2(wx * 5, ty * 11 + j);
                    row.push(hs < 0.16 ? CONF[Math.floor(hs * 25) % 4] : j === 1 ? "#1a1236" : "#0c0820");
                }
                putRow(x, px, py + j, row);
            }
            if (hash2(tx, ty * 3) < 0.3) { const gx = px + 2 + Math.floor(hash2(tx, ty) * 10); x.fillStyle = AR.g3; x.fillRect(gx, py - 1, 4, 1); x.fillStyle = AR.g4; x.fillRect(gx + 1, py - 2, 1, 1); x.fillRect(gx + 3, py - 3, 1, 2); x.fillStyle = AR.g5; x.fillRect(gx, py - 2, 1, 1); }
        },
        back(x, a) { x.fillStyle = "#0a0614"; x.fillRect(0, 0, a.w * 16, a.h * 16); },
        frame() {},
        /* BEHIND IT ALL: the far wall in the dark; the signs buzzing on it (now and then one cuts out);
           a row of cabinets, their screens flickering; vines hanging from the roof; light falling
           through the holes in it, dust turning in the light. */
        sky(g, cam, a, h) {
            const B = arcadeBack(), f = h.frameNo, md = (v, p) => ((v % p) + p) % p;
            const gr0 = g.createLinearGradient(0, 0, 0, h.VH); gr0.addColorStop(0, "#0c0718"); gr0.addColorStop(1, "#140a24"); g.fillStyle = gr0; g.fillRect(0, 0, h.VW, h.VH);
            // the far wall's panels, faint
            const k0 = 0.2, ox = -Math.round(cam.x * k0) % 48, oy = -Math.round(cam.y * k0) % 48;
            g.fillStyle = "#120a20"; for (let y = oy - 48; y < h.VH; y += 48) for (let x = ox - 48; x < h.VW; x += 48) { g.fillRect(x, y, 47, 1); g.fillRect(x, y, 1, 47); }
            /* (14 Oct 2026, the owner's: "the background image needs to be cleared and all the current elements should be
               placeable by me"): the cabinets, signs, vines and light that stood here are objects now (machine, neon, vine,
               and the editor's light shafts), put where he wants them. */
            const gv = g.createLinearGradient(0, 0, 0, h.VH); gv.addColorStop(0, "rgba(0,0,0,0.45)"); gv.addColorStop(0.45, "rgba(0,0,0,0)"); gv.addColorStop(1, "rgba(0,0,0,0.4)"); g.fillStyle = gv; g.fillRect(0, 0, h.VW, h.VH);
        },
        /* A PLATFORM: a neon sign fallen to a bracket: chrome on top, its tube along the front (one of
           five colours, a stretch of it dead), brackets every two tiles, vines hanging off it. */
        platform(x, X, Y, W, o) {
            const seed = (o && o.seed) || 0, tube = arcNeon(o && o.a, "platNeon") || TUBES[Math.floor(hash2(seed, 13) * TUBES.length)];
            const SH = [AR.out, AR.m4, AR.m3, AR.m2, AR.out, null, null, null, AR.m1, AR.out];
            for (let j = 0; j < 10; j++) {
                const row = [];
                for (let i = 0; i < W; i++) {
                    if (SH[j]) { row.push(j === 1 && hash2(X + i, Y) < 0.12 ? AR.m3 : SH[j]); continue; }
                    const dead = vn((X + i) / 10, Y / 16, seed + 3) < 0.26;
                    row.push(j === 6 ? (dead ? tube[2] : tube[1]) : (dead ? mixC(tube[2], "#000000", 0.4) : tube[0]));
                }
                putRow(x, X, Y + j, row);
            }
            const bracket = bx => { x.fillStyle = AR.out; x.fillRect(bx, Y - 1, 4, 12); x.fillStyle = AR.m2; x.fillRect(bx + 1, Y, 2, 10); x.fillStyle = AR.m4; x.fillRect(bx + 1, Y + 1, 1, 1); x.fillRect(bx + 1, Y + 7, 1, 1); };
            if (!(o && o.left)) bracket(X); if (!(o && o.right)) bracket(X + W - 4);
            for (const s of between(W, 32, 4)) bracket(X + s);
            for (let i = 3; i < W - 3; i += 5) {
                if (hash2(X + i, Y * 3) > 0.32) continue;
                const len = 3 + Math.floor(hash2(X + i, Y) * 14);
                for (let k = 0; k < len; k++) { x.fillStyle = k % 4 === 2 ? AR.g4 : AR.g2; x.fillRect(X + i, Y + 10 + k, 1, 1); if (k % 4 === 2) { x.fillStyle = AR.g3; x.fillRect(X + i + (k % 8 === 2 ? 1 : -1), Y + 10 + k, 1, 1); } }
            }
        },
        /* A MOVING PLATFORM: a light-up dance floor panel, hung on chains from a track in the roof */
        mover(g, m, a, h) {
            const X = Math.round(m.x), Y = Math.round(m.y), W = m.w;
            const ceil = (px, py) => { let ty = Math.floor(py / 16); for (let n = 0; n < 20 && ty > 0; n++, ty--) if (h.wallish(a, Math.floor(px / 16), ty - 1)) return ty * 16; return py - 48; };
            if (m._roofL === undefined) { m._roofL = ceil(X + 4, Y); m._roofR = ceil(X + W - 5, Y); }
            if (m.kind === "h" && m.x0 !== undefined) { const ry = Math.min(m._roofL, m._roofR); g.fillStyle = AR.out; g.fillRect(Math.round(m.x0) - 6, ry, Math.round(m.x1 - m.x0) + W + 12, 3); g.fillStyle = AR.m2; g.fillRect(Math.round(m.x0) - 5, ry, Math.round(m.x1 - m.x0) + W + 10, 1); }
            for (const [cx, top] of [[X + 4, m.kind === "h" ? Math.min(m._roofL, m._roofR) + 3 : m._roofL], [X + W - 5, m.kind === "h" ? Math.min(m._roofL, m._roofR) + 3 : m._roofR]]) for (let yy = top; yy < Y; yy += 3) { g.fillStyle = AR.out; g.fillRect(cx - 1, yy, 3, 3); g.fillStyle = (yy / 3) % 2 ? AR.m3 : AR.m2; g.fillRect(cx, yy + 1, 1, 1); }
            g.fillStyle = AR.out; g.fillRect(X, Y, W, 10);
            const n = Math.floor(W / 8), beat = Math.floor(h.frameNo / 20);
            for (let i = 0; i < n; i++) { const tc = TUBES[(i + beat + Math.floor(X / 8)) % TUBES.length], lit = hash2(i, beat) < 0.7; g.fillStyle = lit ? tc[0] : tc[2]; g.fillRect(X + 1 + i * 8, Y + 1, 7, 6); if (lit) { g.fillStyle = tc[1]; g.fillRect(X + 2 + i * 8, Y + 2, 2, 1); } }
            g.fillStyle = AR.m2; g.fillRect(X + 1, Y + 7, W - 2, 2);
        },
        // the scenery: cabinets (lit and dead), a pinball table, a claw machine, a television, tickets, the jungle
        props(x, a, h, spots) {
            const PICK = [["arcadeCab"], ["arcadeCabDead"], ["jungleFern"], ["arcadePinball"], ["arcadeTickets", "jungleCreeper"], ["arcadeClaw"], ["jungleMonstera"], ["arcadeTV"], ["arcadeTube"]];
            for (const sp of spots) {
                const names = PICK[Math.floor(sp.hv * 1000) % PICK.length];
                let dx = 0;
                for (const n of names) { const img = h.dim(h.spr(n, 0)); if (!img) continue; x.drawImage(img, sp.px + dx, sp.py + 16 - img.height); dx += img.width - 2; }
            }
        }
    };

    /* ---- THE SCENERY (written by the scratchpad's scenery/gen.js) ---- */
    /* THE SCENERY (14 Oct 2026, the owner's: "more scenery items ... which I
       can scatter around for decoration"). Props for any zone, offered in the
       level editor's Scenery library: crates, barrels, sacks, rope, planks,
       chain, rubble and rock, weeds and grass and ivy, pots, a chest, a cart,
       and the new zones' own (cogs and springs, urns and sand, ingots, an anvil
       and coal, fallen leaves). Each its own palette over the shared one. */
    sprites["crateSmall"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8","y":"#e8c860","Y":"#b08a34"}, rows: [
        "kkkkkkkkkk",
        "kaaaaaaack",
        "kaeeeeedck",
        "kaecccadck",
        "kaebbabdck",
        "kaebabbdck",
        "kaeacccdck",
        "kaddddddck",
        "kcccccccck",
        "kkkkkkkkkk"
    ] };
    sprites["crateX"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8","y":"#e8c860","Y":"#b08a34"}, rows: [
        "kkkkkkkkkkkkkkkk",
        "kaaaaaaaaaaaaack",
        "kaeeeeeeeeeeedck",
        "kaeaccccccccadck",
        "kaebabbbbbbabdck",
        "kaebbabbbbabbdck",
        "kaecccaccacccdck",
        "kaebbbbaabbbbdck",
        "kaebbbbaabbbbdck",
        "kaecccaccacccdck",
        "kaebbabbbbabbdck",
        "kaebabbbbbbabdck",
        "kaeaccccccccadck",
        "kaddddddddddddck",
        "kcccccccccccccck",
        "kkkkkkkkkkkkkkkk"
    ] };
    sprites["crateIron"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8","y":"#e8c860","Y":"#b08a34"}, rows: [
        "kkkkkkkkkkkkkkkk",
        "knmaaaaaaaaaanmk",
        "kmmeeeeeeeeeemmk",
        "kaeccccccccccdck",
        "kaebbbbbbbbbbdck",
        "kaebbbbbbbbbbdck",
        "kaebbbbbbbbbbdck",
        "kaeccccccccccdck",
        "kaebbbbbbbbbbdck",
        "kaebbbbbbbbbbdck",
        "kaebbbbbbbbbbdck",
        "kaeccccccccccdck",
        "kaebbbbbbbbbbdck",
        "knmddddddddddnmk",
        "kmmccccccccccmmk",
        "kkkkkkkkkkkkkkkk"
    ] };
    sprites["crateLong"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8","y":"#e8c860","Y":"#b08a34"}, rows: [
        "kkkkkkkkkkkkkkkkkkkkkkkk",
        "knmaaaaaaaaaaaaaaaaaanmk",
        "kmmeeeeeeeeeeeeeeeeeemmk",
        "kaeccccccccccccccccaadck",
        "kaebbbbbbbbbbbbaaaabbdck",
        "kaebbbbbbbdYddabbbbbbdck",
        "kaeccccccaddddcccccccdck",
        "kaebbaaaabbbbbbbbbbbbdck",
        "kaeaabbbbbbbbbbbbbbbbdck",
        "knmddddddddddddddddddnmk",
        "kmmccccccccccccccccccmmk",
        "kkkkkkkkkkkkkkkkkkkkkkkk"
    ] };
    sprites["crateStack"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8","y":"#e8c860","Y":"#b08a34"}, rows: [
        "....kkkkkkkkkkkk..",
        "....knmaaaaaanmk..",
        "....kmmeeeeeemmk..",
        "....kaeccccccdck..",
        "....kaebbbbbbdck..",
        "....kaebbbbbbdck..",
        "....kaeccccccdck..",
        "....kaebbbbbbdck..",
        "....knmddddddnmk..",
        "....kmmccccccmmk..",
        ".kkkkkkkkkkkkkkkk.",
        ".kaaaaaaaaaaaaack.",
        ".kaeeeeeeeeeeedck.",
        ".kaecccccccccadck.",
        ".kaebbbbbbbbabdck.",
        ".kaebbbbbbaabbdck.",
        ".kaecccccaccccdck.",
        ".kaebbbbabbbbbdck.",
        ".kaebbaabbbbbbdck.",
        ".kaecaccccccccdck.",
        ".kaeabbbbbbbbbdck.",
        ".kaddddddddddddck.",
        ".kcccccccccccccck.",
        ".kkkkkkkkkkkkkkkk."
    ] };
    sprites["crateOpen"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8","y":"#e8c860","Y":"#b08a34"}, rows: [
        "..........y.....",
        "....y.....Y..y..",
        "...yY...yyY.Y.y.",
        "k..YY..yyyY..Yyk",
        "kyyyYyYyYyyYyyYk",
        "kaaaaaaaaaaaaaak",
        "kaebbbbbbbbbbdck",
        "kaebbbbbbbbbbdck",
        "kaeccccccccccdck",
        "kaebbbbbbbbbbdck",
        "kaebbbbbbbbbbdck",
        "kaeccccccccccdck",
        "kaddddddddddddck",
        "kcccccccccccccck",
        "kkkkkkkkkkkkkkkk"
    ] };
    sprites["crateBroken"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8"}, rows: [
        "kkkkkkkkkkkkkk........",
        "kaaaaaaaaaaack........",
        "kaeeeeeeeeedck........",
        "kaeccccccccdck........",
        "kaeddddabbbdck........",
        "kaeddddddabdck........",
        "kaedcdddaccdck........",
        "kaedddddddadck........",
        "kaeddcdabbbdck........",
        "kaedddaccccdck........",
        "kaebbbbbbbbdck........",
        "kaddddddddddckkkkkkkkk",
        "kcccccccccccckabbmbbck",
        "kkkkkkkkkkkkkkkkkkkkkk"
    ] };
    sprites["barrelTall"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8"}, rows: [
        "kaaaaaaaaaak",
        "kabbbbbebbck",
        "kabbbbbebbck",
        "knnnnnmmmmmk",
        "kabbbbbebbck",
        "kabbbbbebbck",
        "kabbbbbebbck",
        "abbbbbbebbba",
        "abbbbbbebbbc",
        "nnnnnnmmmmmm",
        "abbbbbbebbbc",
        "kabbbbbebbck",
        "kabbbbbebbck",
        "kabbbbbebbck",
        "knnnnnmmmmmk",
        "kabbbbbebbck",
        "kabbbbbebbck",
        "kaccccccccck"
    ] };
    sprites["keg"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8"}, rows: [
        "kaaaaaaak",
        "kabbbebck",
        "knnnmmmmk",
        "kabbbebck",
        "abbbbebba",
        "abbbbebbc",
        "kabbbebck",
        "knnnmmmmk",
        "kabbbebck",
        "kacccccck"
    ] };
    sprites["barrelSide"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8"}, rows: [
        "..................",
        ".kkkkkkkkkkkkkk...",
        "kaanaaaaanaaacck..",
        "kbbnbbbbbnbccccck.",
        "kbbnbbbbbnccdddcck",
        "kbbnbbbbbncceddcck",
        "kbbmbbbbbmccdedcck",
        "kbbmbbbbbmccdddcck",
        "kbbmbbbbbmccdddcck",
        "kbbmbbbbbmccdddcck",
        "kbbmbbbbbmbccccck.",
        "kccmcccccmccccck..",
        ".kkkkkkkkkkkkkk..."
    ] };
    sprites["barrelBroken"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8"}, rows: [
        "................",
        "kk..........kk.k",
        "bck...kk.kkkbckb",
        "bckkkkbckbckbckb",
        "kbcbckbckbckbcbc",
        "kbcbckbckbckbcbc",
        "kbcbckbckbcbckbc",
        "kmnnmmmmmmmmmmmc",
        ".kbcbcbckbcbcbck",
        ".kbcbcbckbcbcbck"
    ] };
    sprites["bucket"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8"}, rows: [
        "....i.....",
        ".kiikiikk.",
        "kiaaaaaiik",
        "kmmmmmmmmk",
        "kabbbbbbck",
        "kabbbbbbck",
        ".kabbbbck.",
        ".mmmmmmmm.",
        ".kaccccck."
    ] };
    sprites["sack"] = { pal: {"k":"#1a0f08","p":"#6a4a26","q":"#94703e","r":"#c09a5e","R":"#e0c48e","y":"#e8c860","Y":"#b08a34"}, rows: [
        "...krkrkrk..",
        "....krqrk...",
        "....krqpk...",
        "...kkYYYk...",
        "..krrqqqrk..",
        ".krqqqqqqrk.",
        "krppqqqqqqrk",
        "krqpqqqqqqpk",
        "krqqqqqqqqpk",
        "krqqqqqqqqpk",
        "krqqqpqqqqpk",
        ".krqqqqqqpk.",
        "..krpppppk.."
    ] };
    sprites["sacks"] = { pal: {"k":"#1a0f08","p":"#6a4a26","q":"#94703e","r":"#c09a5e","R":"#e0c48e","y":"#e8c860","Y":"#b08a34"}, rows: [
        "...krkrkrk............",
        "....krqrk.............",
        "....krqpk...krkrkrk...",
        "...kkYYYk....krqrk....",
        "..krrqqqrk...krqpk....",
        ".krqqqqqqrk.krYYYrk...",
        "krpqpqqqqqrkrqqqqqrk..",
        "krqqqqqqpqpkpqqqqqqrk.",
        "krqqqqqqpqpkqqqqqqqpk.",
        "krqqqqqqqqpkqqqqqpppk.",
        "krqqqqqqqqpkqqpqqqqpk.",
        ".krqqqqqqpkkrqqqqqpk..",
        "..krpppppk.krppppppk.."
    ] };
    sprites["sackSpilt"] = { pal: {"k":"#1a0f08","p":"#6a4a26","q":"#94703e","r":"#c09a5e","R":"#e0c48e","y":"#e8c860","Y":"#b08a34"}, rows: [
        "...krkrkrk..........",
        "....krqrk...........",
        "....krqpk...........",
        "..kkrYYYkk..........",
        ".krrqqqqrrk.........",
        "krpqqqqqqprk........",
        "krqpqqqqqqpk........",
        "krpqqqqqqkpk........",
        "krqqqqqqqqkk........",
        ".krqqqqqqpkYYY......",
        "..krpppppkyYYyyYyyyy"
    ] };
    sprites["ropeCoil"] = { pal: {"k":"#1a0f08","p":"#6a4a26","q":"#94703e","r":"#c09a5e","R":"#e0c48e"}, rows: [
        ".............",
        "...kkkkkkk...",
        ".kkrqrqrqrkk.",
        "kqqqpppppqqqk",
        "qqqppkkkppqqq",
        "kqqqpppppqqqk",
        ".kkqqqqqqqkkq"
    ] };
    sprites["plankPile"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036"}, rows: [
        "......kkkk............",
        "......aaaaaaaaaaaaaa..",
        "...kaaaaaaaaaaaakkkk..",
        "...kbbbbbbbbbbbdbbk...",
        "...kkkkkkkkkkkkkkkk...",
        "kaaaaaaaaaaaaaaaaaaaak",
        "kbbbbbbbbdbbdbbbbbbbbk",
        "kcccccccccccccccccccck"
    ] };
    sprites["chainHeap"] = { pal: {"k":"#1a0f08","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8"}, rows: [
        "....kk...kk.....",
        "...knnkkknnkkk..",
        "..kmkkmnmkkmnmk.",
        ".kkkiikkkiikkkk.",
        "knnkknnkknnkknnk",
        "mkkmmmkmmmkmmmkm",
        "kiikkiikkiikkiik"
    ] };
    sprites["pebbles"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de"}, rows: [
        "................",
        ".kkk.kk.kkk...kk",
        "kvutkvukvutkvkvt",
        "kkskktskkskktkts"
    ] };
    sprites["rubbleSmall"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de"}, rows: [
        "............",
        ".....kkk....",
        "....kvvuk...",
        "...kvuuttk..",
        ".kkkkktkkkk.",
        "kvvuttkvvutk",
        "kuuttskuutku",
        "kkttskkttkut"
    ] };
    sprites["rubbleWide"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de"}, rows: [
        "..........................",
        "................k.........",
        ".........kkkk.kvvuk.......",
        "........kvuutkvuuttk......",
        ".kkkkk.kkukkvvkktkkk......",
        "kkvutkkvukkvuutkkvvukkkkk.",
        "kuuttsvuttkutttsvuttsvuttk",
        ".ktsskktsskttsskkttskktskk"
    ] };
    sprites["rubbleHeap"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de"}, rows: [
        "......................",
        ".........kkkk.........",
        "........kvuttk........",
        "......kkkkkkkkkk......",
        "......kvutkvvutk......",
        ".....kkutkkkutts......",
        "...kkvukkvvukkkkkkkk..",
        "...kvutkvuutkvuukkvuk.",
        "..kkktkkkttkkkktkuutk.",
        ".kvuukvvukkvvukkkvkkkk",
        "kvuttkvutkvuutkvuutkvu",
        "kuttskuttkuttskuttkutt",
        ".kkkkkkkkkkkkkkkkkkkkk"
    ] };
    sprites["boulder"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de"}, rows: [
        "................",
        "......k.........",
        "....kkukkkkk....",
        "...kvvtuuuuukk..",
        "..kvttttttttuuk.",
        ".kutttttttttttuk",
        ".kuttttttsttttsk",
        "kuttttttttsttttu",
        ".kutttttttstttsk",
        ".kuttttttttsttsk",
        "..kustttttttssk.",
        "...kkusssssskk.."
    ] };
    sprites["slab"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de"}, rows: [
        "....................",
        ".kkkkkkkkkkkkkkkkkk.",
        "kuuuuuuukuuuusuuuuuk",
        "uttttttttktttsttttsk",
        "kutttttttkttstttttsk",
        "kusssssssskssssssssk"
    ] };
    sprites["weeds"] = { pal: {"k":"#1a0f08","g":"#24461a","G":"#3e6e26","h":"#5e9a34","H":"#8ccc52","j":"#c4ec7a"}, rows: [
        "gHgg....",
        "gHgHg.g.",
        "gHhhggHg",
        ".ghhgHHg",
        ".ghGhhg.",
        "..gGGg.."
    ] };
    sprites["weedsTall"] = { pal: {"k":"#1a0f08","g":"#24461a","G":"#3e6e26","h":"#5e9a34","H":"#8ccc52","j":"#c4ec7a"}, rows: [
        ".gg...gHg.",
        "gHHg.gHgHg",
        "gHHg.gHHHg",
        ".gHg.ghhg.",
        ".ghhghhhg.",
        "..gHHhhg..",
        "..ghHGhg..",
        "...ghGg...",
        "...gGGg...",
        "...gGGg..."
    ] };
    sprites["weedsLow"] = { pal: {"k":"#1a0f08","g":"#24461a","G":"#3e6e26","h":"#5e9a34","H":"#8ccc52","j":"#c4ec7a"}, rows: [
        "gHggggg.gg..",
        "gHHhHHHgHHg.",
        ".gghhHHhhg..",
        "...ggGGgg..."
    ] };
    sprites["weedsSparse"] = { pal: {"k":"#1a0f08","g":"#24461a","G":"#3e6e26","h":"#5e9a34","H":"#8ccc52","j":"#c4ec7a"}, rows: [
        ".g...g",
        "gHg.gH",
        "gHggHg",
        "gHHhhg",
        ".gHhg.",
        ".ghGg.",
        ".gGGg."
    ] };
    sprites["grassStrip"] = { pal: {"k":"#1a0f08","g":"#24461a","G":"#3e6e26","h":"#5e9a34","H":"#8ccc52","j":"#c4ec7a"}, rows: [
        ".............ggg.g..g..g",
        "...gg.g..g.ggHHhgHgghggh",
        ".ggHHghggHgHgGGGgGggGggG",
        "gHgGGhGhgGhGgGGGgGhhGghG",
        "HGHGGGGGHGGGHGGGHGGGGHGG"
    ] };
    sprites["fern"] = { pal: {"k":"#1a0f08","g":"#24461a","G":"#3e6e26","h":"#5e9a34","H":"#8ccc52","j":"#c4ec7a"}, rows: [
        ".......gHg...g.g..",
        "..g.g.gGHGg.gGgGg.",
        ".gGgGggGhGggGghHHg",
        "gHHhgGgGhGgGghhGg.",
        ".gGghgGGhgGghgGg..",
        "..gGghgGhgGGGgGg..",
        "..gGGGgghGgGgGg...",
        "...ghgGGhgGhhHHg..",
        "..gHhhhGhGhhGGg...",
        "...gGGhhhghGGg....",
        "....ggGhhhggg.....",
        "......ggGGg......."
    ] };
    sprites["flowers"] = { pal: {"0":"#e05a3a","8":"#5a1410","9":"#a02a1e","k":"#1a0f08","g":"#24461a","G":"#3e6e26","h":"#5e9a34","H":"#8ccc52","j":"#c4ec7a","p":"#6a4a26","q":"#94703e","r":"#c09a5e","R":"#e0c48e"}, rows: [
        ".gHg..RRgg",
        ".g00g..gHH",
        "gHHHRR.g00",
        "gHhhHHghg.",
        ".ghhHghhg.",
        "..gGhgGg..",
        "...gGGg...",
        "...gGGg..."
    ] };
    sprites["ivy"] = { pal: {"k":"#1a0f08","g":"#24461a","G":"#3e6e26","h":"#5e9a34","H":"#8ccc52","j":"#c4ec7a"}, rows: [
        "gGgGHg.gHGhG",
        "gGhGg..ggGgG",
        "gGhGhggHGggg",
        ".gGgGHggGhHG",
        ".gGGgg..gGHG",
        "..gGg...gGgg",
        ".gHGGg.gHGg.",
        "..gGGhgghGg.",
        "..gGGg..gGg.",
        "...gGg...gGg",
        "..gHGg..ghGg",
        "..ghGg..gGg.",
        "...gg...gGg.",
        ".......ghGg.",
        "........gg..",
        "............"
    ] };
    sprites["mossStone"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de","g":"#24461a","G":"#3e6e26","h":"#5e9a34","H":"#8ccc52","j":"#c4ec7a"}, rows: [
        "................",
        "................",
        "......kkkkk.....",
        "...kkHHhhhhhkk..",
        "..khHvGvuGGGHHk.",
        ".kHGGvuuuGtGtGhk",
        ".kvvGuuuutttttGk",
        ".kvuuuuttttttsGk",
        ".kuuuttttttsshsk",
        "..kGtttttsssssk.",
        "...kktttsssskk.."
    ] };
    sprites["branch"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036"}, rows: [
        "..........kkck....",
        ".........kcck..k..",
        "........kckk..kck.",
        ".......kck...kckkk",
        ".....kkkckkkkccccc",
        "kkkkkccccccccddddd",
        "cccccdcddddddkkkkk",
        "dddddkkkkkkkk....."
    ] };
    sprites["pot"] = { pal: {"k":"#1a0f08","l":"#7a3a1e","L":"#a8562c","x":"#d07a42","X":"#eaa064"}, rows: [
        "kxxxxxxxxk",
        ".kxLLLLlk.",
        "kxLLLLLLxk",
        "kxLLLLLLlk",
        "kxLLLLLLlk",
        "kxLLLLLLlk",
        "kllXllXllk",
        ".kxlLLllk.",
        "..kkxlkk..",
        "....kk...."
    ] };
    sprites["amphora"] = { pal: {"k":"#1a0f08","l":"#7a3a1e","L":"#a8562c","x":"#d07a42","X":"#eaa064"}, rows: [
        ".kxxxxxxk.",
        "..kxLLlk..",
        "..kxLLlk..",
        "..kxLLlk..",
        ".kxLLLLxk.",
        ".kxLLLLlk.",
        "kxLLLLLLxk",
        "kxLLLLLLlk",
        "kxLLLLLLlk",
        "kllXllXllk",
        "kxLLLLLLlk",
        "kxLLLLLLlk",
        ".kxLLLLlk.",
        "..kxLLlk..",
        "...kxlk...",
        "....kk...."
    ] };
    sprites["potBroken"] = { pal: {"k":"#1a0f08","l":"#7a3a1e","L":"#a8562c","x":"#d07a42","X":"#eaa064"}, rows: [
        "kk..kkkkk.....",
        "kLkkLLLLlk....",
        "kxLLLLLLlk....",
        "kllXllXllk....",
        ".kxlLLllk.kkk.",
        "..kkxlkk.kLxLk",
        "....kk...kLLLk"
    ] };
    sprites["skull"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de"}, rows: [
        "..kkwkk..",
        ".kwwvwwk.",
        "kwvvvvvwk",
        "kwkkvkkuk",
        "kwsvvvsuk",
        ".kwvsvuk.",
        ".kwvvvuk.",
        ".kwsusuk."
    ] };
    sprites["candles"] = { pal: {"0":"#e05a3a","1":"#6a4410","2":"#a8781e","3":"#e0b040","4":"#fff0a0","8":"#5a1410","9":"#a02a1e","k":"#1a0f08","p":"#6a4a26","q":"#94703e","r":"#c09a5e","R":"#e0c48e"}, rows: [
        "...........",
        "...........",
        "...........",
        "........4..",
        ".4......03.",
        ".03....kkrk",
        "kkrk4..kRrk",
        "kRrk03.kRrk",
        "kRrkkrkkRrk",
        "kRrkRrkkRrk",
        "kRrkRrkkRrk",
        "kRrkRrkkRrk"
    ] };
    sprites["chest"] = { pal: {"1":"#6a4410","2":"#a8781e","3":"#e0b040","4":"#fff0a0","k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036"}, rows: [
        "................",
        "...kkkkkkkkkk...",
        "..k3aaaaaaaa3k..",
        ".ka3bbbbbbbb3ak.",
        "kab3bbbbbbbb3bak",
        "kkkkkkkkkkkkkkkk",
        "kab2bbb33bbb2bck",
        "kab2bbb33bbb2bck",
        "kab2bbb13bbb2bck",
        "kab2bbbbbbbb2bck",
        "kab2bbbbbbbb2bck",
        "kac2cccccccc2cck"
    ] };
    sprites["signpost"] = { pal: {"k":"#1a0f08","a":"#d8a868","b":"#b07c48","c":"#7a5028","d":"#4e3018","e":"#8c6036"}, rows: [
        "................",
        "................",
        ".kkkkkkkkkkkkk..",
        "kbaaaaaaaaaaaak.",
        "kbbbbbbbbbbdbbbk",
        "kbbbdddddddbbbbb",
        "kbbbbbbbbbbdbbbk",
        "kbcccccccccccck.",
        ".kkkkkabkkkkkk..",
        ".....kabk.......",
        ".....kabk.......",
        ".....kabk.......",
        ".....kabk.......",
        ".....kabk.......",
        ".....kabk.......",
        ".....kabk.......",
        ".....kabk.......",
        ".....kabk......."
    ] };
    /* OLD SIGNS (23 Oct 2026, the owner's: "Make some variations of the arrow scenery item; also make some new signs similar to
       the arrow, that are 'danger' signs - make a variety of different ones, with different words like 'STOP!' etc. Make them
       old/broken"). Each put together here from parts, as a sign is made: boards (or a sheet of iron) outlined, lit along the
       top and shaded along the foot, the wood's grain or its paint (peeling, the wood showing through); on a post or an iron
       pole or nailed to the wall; the words in a letter three pixels by five (faded, or painted on crudely and run); and the
       wear: cracks, a bite out of an edge, a board hung crooked, a post leaning or snapped, rust. Each with a seed of its own,
       so the same every time. The arrow board (signpost) above stays as it was; mirror any of them for the other way. */
    {
        const SP = { k: "#1a0f08", a: "#d8a868", b: "#b07c48", c: "#7a5028", d: "#4e3018", e: "#8c6036",
            r: "#a8382a", R: "#c8503a", q: "#7c2a20", w: "#cfc3a4", W: "#e6dcc0", v: "#a89c80", y: "#d0a030", Y: "#ecc450", z: "#9c7420",
            x: "#2a221c", n: "#7a7a84", N: "#b8b8c4", u: "#8a4a22", U: "#b0662e", s: "#5e5e6a", t: "#868692" };
        const FONT = {
            A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."], C: [".##", "#..", "#..", "#..", ".##"],
            D: ["##.", "#.#", "#.#", "#.#", "##."], E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."],
            G: [".##", "#..", "#.#", "#.#", ".##"], H: ["#.#", "#.#", "###", "#.#", "#.#"], I: ["###", ".#.", ".#.", ".#.", "###"],
            K: ["#.#", "##.", "#..", "##.", "#.#"], L: ["#..", "#..", "#..", "#..", "###"], N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
            O: ["###", "#.#", "#.#", "#.#", "###"], P: ["##.", "#.#", "##.", "#..", "#.."], R: ["##.", "#.#", "##.", "#.#", "#.#"],
            S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."], U: ["#.#", "#.#", "#.#", "#.#", "###"],
            V: ["#.#", "#.#", "#.#", "#.#", ".#."], W: ["#...#", "#...#", "#.#.#", "#.#.#", ".#.#."], X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
            Y: ["#.#", "#.#", ".#.", ".#.", ".#."], "!": ["#", "#", "#", ".", "#"], " ": ["..", "..", "..", "..", ".."]
        };
        const textW = str => [...str].reduce((n, ch, i) => n + (FONT[ch] || FONT[" "])[0].length + (i ? 1 : 0), 0);
        const make = (W, H, seed, draw) => {
            const g = Array.from({ length: H }, () => Array(W).fill("."));
            let sd = seed >>> 0;
            const P = { W, H, rnd: () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296,
                set: (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; },
                get: (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? g[y][x] : ".") };
            draw(P);
            return { pal: SP, rows: g.map(r => r.join("")) };
        };
        // a board: off(i), how far down its column i hangs (crooked); paint [body, lit, shade] and peel (how much of it is gone)
        const board = (P, x0, y0, w, h, o = {}) => {
            const off = o.off || (() => 0), pt = o.paint;
            for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
                const edge = i === 0 || i === w - 1 || j === 0 || j === h - 1, rim = Math.min(i, w - 1 - i, j, h - 1 - j);
                const c = edge ? "k" : pt && P.rnd() >= (o.peel || 0) * (rim <= 1 ? 1.6 : rim === 2 ? 0.5 : 0.1) ? (j === 1 ? pt[1] : j === h - 2 ? pt[2] : pt[0]) : j === 1 ? "a" : j === h - 2 ? "c" : P.rnd() < 0.14 ? "e" : "b";
                P.set(x0 + i, y0 + j + off(i), c);
            }
        };
        const post = (P, xc, y0, y1, lean = 0) => { for (let y = y0; y <= y1; y++) { const X = xc + Math.round((y - y0) * lean); P.set(X - 1, y, "k"); P.set(X, y, "a"); P.set(X + 1, y, "b"); P.set(X + 2, y, "k"); } };
        const pole = (P, xc, y0, y1) => { for (let y = y0; y <= y1; y++) { P.set(xc - 1, y, "k"); P.set(xc, y, "N"); P.set(xc + 1, y, "n"); P.set(xc + 2, y, "k"); } };
        // the words: fade, the paint gone in places; drip, crude paint run down from the letters' feet
        const text = (P, str, x, y, col, o = {}) => {
            const off = o.off || (() => 0), bx0 = o.bx0 || 0;
            let cx = x;
            for (const ch of str) {
                const gl = FONT[ch] || FONT[" "];
                gl.forEach((row, j) => [...row].forEach((p, i) => {
                    if (p !== "#" || (o.fade && P.rnd() < o.fade)) return;
                    const X = cx + i, Y = y + j + off(cx + (gl[0].length >> 1) - bx0);   // (each letter moved whole, by the drop at its middle: a step through a letter split it)
                    P.set(X, Y, col);
                    if (o.drip && j === 4 && P.rnd() < o.drip) { P.set(X, Y + 1, col); if (P.rnd() < 0.5) P.set(X, Y + 2, col); }
                }));
                cx += gl[0].length + 1;
            }
        };
        // cut away what test says (a bite, a break), and outline what is left along the cut
        const carve = (P, test) => {
            const cut = [];
            for (let y = 0; y < P.H; y++) for (let x = 0; x < P.W; x++) if (P.get(x, y) !== "." && test(x, y)) cut.push([x, y]);
            for (const [x, y] of cut) P.set(x, y, ".");
            for (const [x, y] of cut) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = P.get(x + dx, y + dy); if (c !== "." && c !== "k") P.set(x + dx, y + dy, "k"); }
        };
        const crack = (P, x, y, len, dx = 1) => { for (let i = 0; i < len; i++) { if (P.get(x, y) !== ".") P.set(x, y, "d"); x += P.rnd() < 0.6 ? dx : 0; y += 1; } };
        const nail = (P, x, y) => P.set(x, y, "N");
        // an arrow cut into a board: its shaft, its tip at the end, the wings one back (dir 1 right, -1 left)
        const arrow = (P, x, y, len, dir, col = "d", off = () => 0, bx0 = 0) => {
            for (let i = 0; i < len; i++) { const X = dir > 0 ? x + i : x - i; P.set(X, y + off(X - bx0), col); }
            const W = dir > 0 ? x + len - 2 : x - len + 2; P.set(W, y - 1 + off(W - bx0), col); P.set(W, y + 1 + off(W - bx0), col);
        };

        // ---- the arrow board's kin
        sprites["signTwoWay"] = make(22, 24, 11, P => {
            post(P, 10, 3, 23);
            board(P, 7, 1, 15, 6); arrow(P, 9, 4, 10, 1);
            const off2 = i => (i > 9 ? 1 : 0);
            board(P, 0, 9, 15, 6, { off: off2 }); arrow(P, 12, 12, 10, -1, "d", off2, 0);
            nail(P, 10, 2); nail(P, 10, 10);
            crack(P, 16, 2, 3); carve(P, (x, y) => y >= 13 && y <= 15 && x <= 1 + (y - 13));
        });
        sprites["signCrooked"] = make(17, 22, 23, P => {
            const off = i => Math.round((i - 6) * 0.2);   // (turned about its one nail)
            post(P, 6, 6, 21);
            board(P, 0, 2, 17, 6, { off }); arrow(P, 3, 5, 10, 1, "d", off, 0);
            nail(P, 6, 3); crack(P, 12, 4 + off(12), 3);
        });
        sprites["signLeaning"] = make(20, 21, 37, P => {
            const off = i => Math.round((15 - i) * 0.18);
            post(P, 6, 7, 20, 0.3);
            board(P, 0, 2, 16, 6, { off }); arrow(P, 3, 5, 10, 1, "d", off, 0);
            nail(P, 6, 4 + off(6)); carve(P, (x, y) => x + (y - 2) * 1.2 >= 17 && y <= 5);
        });
        sprites["signSnapped"] = make(18, 20, 41, P => {
            post(P, 6, 7, 19);
            board(P, 0, 2, 16, 6); arrow(P, 3, 5, 10, 1);
            const brk = [11, 10, 12, 11, 10, 11]; carve(P, (x, y) => y >= 2 && y <= 7 && x >= brk[y - 2]);
            for (const [x, y] of [[10, 3], [11, 5], [9, 6]]) if (P.get(x, y) !== ".") P.set(x, y, "a");   // the splintered end
            board(P, 10, 16, 7, 4, { off: i => (i > 3 ? -1 : 0) }); nail(P, 6, 4);   // the piece that broke off, lying at its foot
        });
        sprites["signPlankUp"] = make(8, 20, 53, P => {
            board(P, 0, 0, 8, 20);
            for (let y = 5; y <= 16; y++) P.set(3, y, "d");
            P.set(2, 5, "d"); P.set(4, 5, "d"); P.set(1, 6, "d"); P.set(5, 6, "d"); P.set(3, 4, "d");
            nail(P, 3, 1); nail(P, 3, 18); for (let y = 8; y <= 15; y++) P.set(6, y, "d");
        });
        sprites["signExit"] = make(26, 11, 67, P => {
            board(P, 0, 1, 26, 9, { paint: ["w", "W", "v"], peel: 0.2 });
            carve(P, (x, y) => x > 19 && Math.abs(y - 5) > (25 - x) * 0.75);
            text(P, "EXIT", 3, 3, "x", { fade: 0 }); nail(P, 1, 5); nail(P, 18, 5);
        });

        // ---- danger
        sprites["dangerStop"] = make(24, 24, 71, P => {
            post(P, 11, 10, 23);
            board(P, 0, 0, 24, 11, { paint: ["r", "R", "q"], peel: 0.16 });
            crack(P, 5, 7, 3); text(P, "STOP!", Math.floor((24 - textW("STOP!")) / 2), 3, "W", { fade: 0 });
            carve(P, (x, y) => y < 11 && x - y > 19); nail(P, 11, 1); nail(P, 11, 9);
        });
        sprites["dangerDanger"] = make(30, 22, 83, P => {
            post(P, 15, 10, 21, -0.15);
            const off = i => (i > 22 ? 1 : 0);
            board(P, 0, 1, 30, 10, { paint: ["w", "W", "v"], peel: 0.2, off });
            crack(P, 26, 2, 4, -1); text(P, "DANGER", Math.floor((30 - textW("DANGER")) / 2), 4, "r", { fade: 0, off, bx0: 0 });
            carve(P, (x, y) => y <= 11 && x < 5 && y - x > 6); nail(P, 15, 3); nail(P, 15, 8);
        });
        sprites["dangerKeepOut"] = make(22, 19, 97, P => {
            const off = i => Math.floor(i / 8);
            board(P, 0, 0, 22, 17, { off });
            for (let i = 1; i < 21; i++) P.set(i, 8 + off(i), "d");   // two planks, the seam between
            text(P, "KEEP", Math.floor((22 - textW("KEEP")) / 2), 2, "x", { off, drip: 0.35 });
            text(P, "OUT", Math.floor((22 - textW("OUT")) / 2), 10, "x", { off, drip: 0.35 });
            nail(P, 2, 2); nail(P, 19, 2 + off(19)); nail(P, 2, 13); crack(P, 15, 10, 4);
        });
        sprites["dangerNoEntry"] = make(15, 26, 101, P => {
            pole(P, 6, 12, 25);
            for (let y = 0; y < 14; y++) for (let x = 0; x < 15; x++) {
                const d = Math.hypot(x - 7, y - 6.5);
                if (d > 7) continue;
                const bar = y >= 5 && y <= 7 && x >= 2 && x <= 12;
                P.set(x, y, d > 6.1 ? "k" : bar ? (P.rnd() < 0.15 ? "v" : "W") : P.rnd() < 0.12 ? "u" : P.rnd() < 0.08 ? "n" : y < 3 ? "R" : "r");
            }
            for (const [x, y] of [[3, 2], [4, 3], [11, 10], [10, 11]]) P.set(x, y, "q");   // dented
            for (let y = 14; y < 19; y++) if (P.rnd() < 0.6) P.set(7, y, "u");                // rust run down the pole
            carve(P, (x, y) => y < 3 && x > 10 && x + (2 - y) > 12);                         // a corner bent away
        });
        sprites["dangerBeware"] = make(32, 22, 113, P => {
            post(P, 15, 10, 21, 0.2);
            board(P, 0, 2, 32, 9);
            crack(P, 29, 3, 5, -1); text(P, "BEWARE", Math.floor((32 - textW("BEWARE")) / 2), 4, "x", { fade: 0, drip: 0.3 });
            carve(P, (x, y) => y >= 2 && y <= 3 && x >= 23 && x <= 25); nail(P, 15, 4); nail(P, 15, 8);
        });
        sprites["dangerTurnBack"] = make(20, 18, 127, P => {
            const off = i => (i < 2 ? 1 : 0);   // (its left edge sprung, clear of the words: a step through a letter split it)
            board(P, 0, 0, 20, 17, { off, paint: ["d", "e", "x"], peel: 0.15 });   // an old dark board, the words slapped on in bright red
            for (let i = 1; i < 19; i++) P.set(i, 8 + off(i), "x");
            text(P, "TURN", 2, 2, "R", { off, drip: 0.12 }); text(P, "BACK", 2, 10, "R", { off, drip: 0.45 });
            carve(P, (x, y) => x > 15 && y > 12 && x + y > 29); nail(P, 1, 3); nail(P, 18, 3);
        });
        sprites["dangerSkull"] = make(18, 16, 131, P => {
            board(P, 0, 0, 18, 16, { paint: ["d", "e", "x"], peel: 0.15 });
            for (let i = 0; i < 12; i++) { P.set(3 + i, 3 + i, "w"); P.set(14 - i, 3 + i, "w"); }   // the bones
            for (const [x, y] of [[2, 2], [3, 2], [2, 3], [15, 2], [14, 2], [15, 3], [2, 14], [2, 13], [3, 14], [15, 14], [15, 13], [14, 14]]) P.set(x, y, "W");
            const SK = [".WWWWW.", "WWWWWWW", "W.WWW.W", "WWWWWWW", ".WW.WW.", ".W.W.W."];
            SK.forEach((row, j) => [...row].forEach((c, i) => { if (c === "W") P.set(5 + i, 4 + j, P.rnd() < 0.1 ? "v" : "W"); else P.set(5 + i, 4 + j, "x"); }));
            nail(P, 1, 1); nail(P, 16, 1); crack(P, 12, 9, 5);
        });
        sprites["dangerTriangle"] = make(17, 16, 149, P => {
            for (let y = 0; y < 15; y++) {
                const half = Math.round(y * 8 / 14);
                for (let x = 8 - half; x <= 8 + half; x++) {
                    const edge = x === 8 - half || x === 8 + half || y === 14, band = !edge && (x === 9 - half || x === 7 + half || y === 13);
                    P.set(x, y, edge ? "k" : band ? "x" : P.rnd() < 0.14 ? "u" : P.rnd() < 0.06 ? "n" : y < 6 ? "Y" : "y");
                }
            }
            for (let y = 5; y <= 9; y++) P.set(8, y, "x"); P.set(8, 11, "x");
            carve(P, (x, y) => x > 12 && y > 10 && x + y > 25);
        });
        sprites["dangerCaveIn"] = make(31, 13, 163, P => {
            const off = i => (i > 16 ? 1 : 0);
            board(P, 0, 2, 31, 9, { paint: ["y", "Y", "z"], peel: 0.18, off });
            crack(P, 17, 3, 7); text(P, "CAVE IN", Math.floor((31 - textW("CAVE IN")) / 2), 4, "x", { fade: 0, off, bx0: 0 });
            const RK = ["..kkk..", ".ktttk.", "ktsttsk", "kssssk."];   // a rock come down on it
            RK.forEach((row, j) => [...row].forEach((c, i) => { if (c !== ".") P.set(2 + i, j, c); }));
            nail(P, 28, 4 + 1);
        });
        sprites["dangerShaft"] = make(24, 20, 179, P => {
            const off = i => Math.floor(i / 5);
            board(P, 0, 0, 24, 14, { paint: ["w", "W", "v"], peel: 0.2, off });
            for (let i = 1; i < 23; i++) for (const j of [1, 2, 11, 12]) P.set(i, j + off(i), ((i + j) >> 1) % 2 ? "x" : "y");   // the hazard stripes
            crack(P, 21, 4 + off(21), 4); text(P, "SHAFT", Math.floor((24 - textW("SHAFT")) / 2), 4, "x", { fade: 0, off, bx0: 0 });
            nail(P, 1, 1);   // hung from the one nail left
        });
    }
    // (sprites["cart"]: since 23 Oct 2026 the mine cart Scout rides, made up in js/rat-race-art.js, with its broken kin)
    sprites["stalagmite"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de"}, rows: [
        "...kuk...",
        "..kutuk..",
        "..kutsk..",
        "..kutsk..",
        ".kutstuk.",
        ".kutstsk.",
        ".kutstsk.",
        ".kutsttuk",
        "kutttstsk",
        "kutttstsk",
        "kutttstsk",
        "uttttsttu",
        "uttttstts",
        "ussssssss"
    ] };
    sprites["puddle"] = { pal: {"5":"#1e3a5a","6":"#3a6a94","7":"#7ab0d8","k":"#1a0f08"}, rows: [
        "..................",
        ".6667777776676666.",
        ".6666666666666666."
    ] };
    sprites["columnBroken"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de"}, rows: [
        "...kkvkkkkkk..",
        "..kvvuvvvvvvk.",
        "..kvuuuuuutk..",
        ".kvuuuuuuuuvk.",
        ".kvutuutuuttk.",
        ".kvutuutuuttk.",
        ".kvutuutuuttk.",
        ".kvutuutuuttk.",
        ".kvutuutuuttk.",
        ".kvutuutuuttk.",
        ".kvutuutuuttk.",
        ".kvutuutuuttk.",
        ".kvutuutuuttk.",
        ".kvutuutuuttk.",
        "kkvutuutuuttkk",
        "vvvvvvvvvvvvvv",
        "vuuuuuuuuuuuut",
        "vttttttttttttt"
    ] };
    sprites["statueHead"] = { pal: {"k":"#1a0f08","s":"#3e3e48","t":"#5e5e6a","u":"#868692","v":"#b4b4bc","w":"#d8d8de"}, rows: [
        ".....kkkkk....",
        "....kvvvvvkk..",
        "...kvuuuuuvkk.",
        "..kvuuuuuuuvk.",
        ".kvuuuuuuuuuvk",
        ".kvussuuussutk",
        ".kvuuuutuuuutk",
        ".kvuuuutuuuutk",
        ".kvuuuutuuuutk",
        ".kvuuuuuuuuutk",
        "..kvutttttutk.",
        "...kvuuuuutk..",
        "....kvttttk..."
    ] };
    sprites["cog"] = { pal: {"1":"#6a4410","2":"#a8781e","3":"#e0b040","4":"#fff0a0","k":"#1a0f08"}, rows: [
        ".................",
        "........kkk......",
        "....kk..333......",
        "...kk3kk33k..k...",
        "....333333kk2kk..",
        "....k333332222k..",
        ".k3kk33332222k...",
        ".k33333111211k...",
        ".k333331k111111k.",
        "...k33211111111k.",
        "...k22221111kk1k.",
        "..k222211111k....",
        "..kk2kk111111....",
        "...k..k11kk1kk...",
        "......111..kk....",
        "......kkk........",
        "................."
    ] };
    sprites["cogPair"] = { pal: {"1":"#6a4410","2":"#a8781e","3":"#e0b040","4":"#fff0a0","k":"#1a0f08"}, rows: [
        "....................",
        "........kkk.........",
        "....kk..333.........",
        "...kk3kk33k..k......",
        "....333333kk2kk.....",
        "....k33333222kk.....",
        ".k3kk33332222k3...k.",
        ".k33333111211k3kk22k",
        ".k333331k1kk1k33222.",
        "...k332111k3333122k.",
        "...k222211k3331k1111",
        "..k222211111k2211111",
        "..kk2kk1111122211k.k",
        "...k..k11kkk22kk1...",
        "......111..kk...1k.."
    ] };
    sprites["spring"] = { pal: {"k":"#1a0f08","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8"}, rows: [
        "iiiiiiii",
        "konnnnnk",
        "kmmmmmmk",
        "konnnnnk",
        "kmmmmmmk",
        "konnnnnk",
        "kmmmmmmk",
        "konnnnnk",
        "kmmmmmmk",
        "konnnnnk",
        "kmmmmmmk",
        "iiiiiiii"
    ] };
    sprites["urnGold"] = { pal: {"1":"#6a4410","2":"#a8781e","3":"#e0b040","4":"#fff0a0","5":"#1e3a5a","6":"#3a6a94","7":"#7ab0d8","k":"#1a0f08"}, rows: [
        ".k333333k.",
        "..k3221k..",
        "..k3221k..",
        "..k3221k..",
        ".k322223k.",
        "k32222223k",
        "k32222221k",
        "k32222221k",
        "k11411411k",
        "k55555555k",
        ".k322221k.",
        "..k3221k..",
        "...k31k...",
        "....kk...."
    ] };
    sprites["canopic"] = { pal: {"1":"#6a4410","2":"#a8781e","3":"#e0b040","4":"#fff0a0","5":"#1e3a5a","6":"#3a6a94","7":"#7ab0d8","k":"#1a0f08","l":"#7a3a1e","L":"#a8562c","x":"#d07a42","X":"#eaa064","p":"#6a4a26","q":"#94703e","r":"#c09a5e","R":"#e0c48e"}, rows: [
        "..kkkk..",
        ".k3333k.",
        "k3k33k3k",
        "k333333k",
        "kR3333xk",
        "kRXXXXxk",
        "kRXXXXxk",
        "k555555k",
        "kRXXXXxk",
        "k555555k",
        "kRXXXXxk",
        "kRXXXXxk",
        "kRxxxxxk"
    ] };
    sprites["sandHeap"] = { pal: {"k":"#1a0f08","y":"#e8c860","Y":"#b08a34","p":"#6a4a26","q":"#94703e","r":"#c09a5e","R":"#e0c48e"}, rows: [
        "........................",
        ".........RRRRRR.........",
        "......RRRYyyyyYRRR......",
        "....RRyYyyyyyyyyYyRR....",
        "...RyyyYyyYyyYyYyyyyR...",
        ".RRYyYyyyyyyyyYyyyyyyRR."
    ] };
    sprites["ingots"] = { pal: {"1":"#6a4410","2":"#a8781e","3":"#e0b040","4":"#fff0a0","k":"#1a0f08"}, rows: [
        "....kkkkk.kkkkk...",
        "...k44444k44444k..",
        "...k22222k22222k..",
        ".kkk22222k22222kkk",
        "k44111111111111144",
        "k22222k22222k22222",
        "k22222k22222k22222",
        "111111111111111111"
    ] };
    sprites["anvil"] = { pal: {"k":"#1a0f08","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8"}, rows: [
        ".kooooooooooooook.",
        ".knmmmmmmmmmmmmmnk",
        ".knmmmmmmmmmmmmikn",
        ".kniiimmmmmmiiiikk",
        "..kkkknmmmmikkkk..",
        ".....knmmmmik.....",
        ".....knmmmmik.....",
        "...kkknmmmmikkk...",
        "..knnnmmmmmmnnnk..",
        "..knmmmmmmmmmmik..",
        "..kniiiiiiiiiiik.."
    ] };
    sprites["coal"] = { pal: {"0":"#e05a3a","8":"#5a1410","9":"#a02a1e","k":"#1a0f08","i":"#22222c","m":"#5c5c6e","n":"#9898ac","o":"#c8c8d8"}, rows: [
        "........k.......",
        ".......kmk......",
        ".....kkk0kkk....",
        "....knm0knmik...",
        "..kkkkikkkikkk..",
        "..kmiiknmikkmikk",
        "kkmkkkkiikkkiknm",
        "km0kk..kkk.kkkik"
    ] };
    sprites["leaves"] = { pal: {"0":"#e05a3a","1":"#6a4410","2":"#a8781e","3":"#e0b040","4":"#fff0a0","8":"#5a1410","9":"#a02a1e","k":"#1a0f08","g":"#24461a","G":"#3e6e26","h":"#5e9a34","H":"#8ccc52","j":"#c4ec7a"}, rows: [
        "................",
        "009h...9900...99",
        "hhh..........00.",
        ".hh.003.99990hh."
    ] };
    /* ---- END OF THE SCENERY ---- */
    // (14 Oct 2026) the factory's metal props, weathered (see WEATHERED METAL, in the Steamworks)
    for (const [n, sd] of [["spring", 2], ["crateIron", 4], ["chainHeap", 6], ["keg", 8], ["barrelTall", 10], ["anvil", 12]]) rustedSprite(n, sd);


    /* THE STATION'S CRATE TO PUSH (16 Oct 2026, the owner's: the one Scout
       pushes must not look like the props): the same steel crate with a
       hazard band, yellow and black, across its lid. */
    put("station", "pushCrate", { pal: sprites["crate@station"].pal, rows: sprites["crate@station"].rows.map((r, i) => (i === 1 ? "kyyzzyyzzyyzzyyk" : i === 2 ? "kyzzyyzzyyzzyyzk" : r)) });

    /* ================================================================ THE ZONES' NEW LOOK
       (21 Oct 2026, the owner's: "we need to apply today's updates to all the other zones, where relevant; for
       example, the new style walls etc, need to be implemented for each zone in their own style"; chosen over five
       rounds of mock-ups on a review page.) Every zone's walls built the way the Mine's slate is: the outer corners
       rounded (the back shows past them), an outline, a lit rim down the left, a surface along every top, and a
       flat face with a simple pattern repeating in it; each in the zone's own materials. With them: the back wall
       toned to sit with the new walls, the rubble as fallen slabs of the zone's own rock (the Arcade's as giant
       chrome pinballs), the blast's flying bits, the support timber and the ladders in the zone's own colours.
       The Steamworks keeps its own walls (the owner: "As it is now is still better ... just make sure we add our
       new styling to it"): only their outer corners rounded and outlined.

       Each zone, as picked:
         Stone Quarry      long cream courses as it had, a band of turf along the top, grass and flowers over it
         Ice Caverns       mottled ice (flat patches of three blues, fine diagonal cracks, sparkles), a light
                           dusting of snow along the tops, lying unevenly (its depth wandering, a soft lobe here and
                           there); none on a floor under spikes; the icicles kept
         Dark Depths       obsidian, faint glints, a few spores glowing violet; a violet scalloped edge; green sprigs
         Sunken Station    riveted steel plates, a steel lip with its own rivets
         Heart             great dressed blocks, gold moulding along every top
         Steamworks        its own walls, rounded; the rubble as slabs of its riveted iron plate
         Sandfall Tomb     ancient Egyptian blocks (uneven lengths, fine joints, worn chipped corners, a carved figure
                           here and there: ankh, eye, bird, reeds, cartouche), a soft band of gold sand on top
         Overgrown Ruins   rough stones laid dry, grass along the top
         Neon Arcade       deep purple, a faint grid a tile apart with a pink node lit here and there, a cyan neon
                           strip along the top; the rubble giant chrome pinballs
       (Kept as the mock-ups made them, to the pixel: the same hash, the same patterns.) */
    (function newLook() {
        const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
        const H = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s || 0) * 2246822519) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
        const PW = 256, PH = 256;
        const sm = t => t * t * (3 - 2 * t);
        // smooth noise: along x (the snow's depth), and over the face (the ice's patches)
        const n1d = (x, sc, seed) => { const f = x / sc, i = Math.floor(f), t = sm(f - i); return H(i, 0, seed) * (1 - t) + H(i + 1, 0, seed) * t; };
        const vn = (x, y, sc, seed) => { const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy), u = sm(fx - ix), v = sm(fy - iy), W = 256 / sc; const g = (i, j) => H(((i % W) + W) % W, ((j % W) + W) % W, seed); return g(ix, iy) * (1 - u) * (1 - v) + g(ix + 1, iy) * u * (1 - v) + g(ix, iy + 1) * (1 - u) * v + g(ix + 1, iy + 1) * u * v; };
        /* THE FACES: a pattern 256 pixels square that repeats, each pixel 0 the body, 1 a light mark, 2 a dark mark,
           3 an accent; made once for each zone when its first wall is drawn */
        const PAT = {
            ashlar(X, Y, o) {   // dressed blocks in courses, each course half a block along
                const bw = o.bw || 24, bh = o.bh || 12, row = Math.floor(Y / bh), x = X + (row % 2) * (bw >> 1), lx = ((x % bw) + bw) % bw, ly = Y % bh;
                if (lx === 0 || ly === 0) return 2;
                if (lx === 1 || ly === 1) return 1;
                const b = Math.floor(x / bw);
                if (H(b, row, 7) < 0.25 && H(X, Y, 8) < 0.05) return 2;
                return H(b, row, 9) < 0.3 ? 3 : 0;
            },
            glints(X, Y) {   // obsidian: faint diagonal glints
                const k = ((X - Y) % 17 + 17) % 17, cell = Math.floor((X + Y) / 9);
                if (k === 0 && H(cell, Math.floor(Y / 12), 19) < 0.5) return 1;
                return H(X, Y, 20) < 0.012 ? 3 : 0;
            },
            spots(X, Y) {   // glowing spores here and there, a halo round each
                const cx = Math.floor(X / 11), cy = Math.floor(Y / 11), px = cx * 11 + Math.floor(H(cx, cy, 21) * 9) + 1, py = cy * 11 + Math.floor(H(cx, cy, 22) * 9) + 1, on = H(cx, cy, 23) < 0.35;
                if (on && X === px && Y === py) return 3;
                if (on && Math.abs(X - px) + Math.abs(Y - py) === 1) return 1;
                return H(X, Y, 24) < 0.02 ? 2 : 0;
            },
            plates(X, Y, o) {   // riveted steel panels
                const s = o.ps || 16, lx = ((X % s) + s) % s, ly = ((Y % s) + s) % s;
                if (lx === 0 || ly === 0) return 2;
                if (lx === 1 || ly === 1) return 1;
                if ((lx === 3 || lx === s - 3) && (ly === 3 || ly === s - 3)) return 3;
                if ((lx === 4 || lx === s - 2) && (ly === 4 || ly === s - 2)) return 2;
                return 0;
            },
            stones(X, Y) {   // irregular stones laid dry: a stone's edge dark, its top lit
                const cx = Math.floor(X / 10), cy = Math.floor(Y / 8);
                let d1 = 1e9, d2 = 1e9, best = null;
                for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const gx = cx + i, gy = cy + j, sx = gx * 10 + H(gx, gy, 34) * 10, sy = gy * 8 + H(gx, gy, 35) * 8, d = Math.hypot((X - sx) * 0.8, Y - sy); if (d < d1) { d2 = d1; d1 = d; best = [sx, sy, gx, gy]; } else if (d < d2) d2 = d; }
                if (d2 - d1 < 1.1) return 2;
                if (Y < best[1] - 2 && d2 - d1 < 2.2) return 1;
                return H(best[2], best[3], 36) < 0.3 ? 3 : 0;
            },
            grid(X, Y) {   // the arcade's neon grid: faint lines a tile apart, a node lit here and there
                const lx = ((X % 16) + 16) % 16, ly = ((Y % 16) + 16) % 16;
                if (lx === 0 && ly === 0) return H(Math.floor(X / 16), Math.floor(Y / 16), 45) < 0.3 ? 3 : 1;
                if (lx === 0 || ly === 0) return 1;
                return 0;
            },
            courses(X, Y) {   // the Quarry's long courses of cream stone, a lit line along the top of each, joints far apart
                const hs = [7, 6, 8, 7, 6, 7], cum = [0]; for (const h of hs) cum.push(cum[cum.length - 1] + h);
                const P = cum[cum.length - 1], y = ((Y % P) + P) % P; let row = 0; while (cum[row + 1] <= y) row++;
                const ly = y - cum[row], gy = Math.floor(Y / P) * hs.length + row, span = 40 + Math.floor(H(gy, 0, 50) * 50), off = Math.floor(H(gy, 1, 51) * span), lx = (((X + off) % span) + span) % span;
                if (ly === 0) return 1;
                if (ly === hs[row] - 1) return 2;
                if (lx === 0) return 2;
                if (lx === 1) return 1;
                const st = Math.floor((X + off) / span);
                return H(st, gy, 52) < 0.22 ? 3 : (H(X, Y, 53) < 0.025 ? 2 : 0);
            },
            mottle(X, Y, o) {   // ice: flat patches of three blues, a fine diagonal crack now and then, sparkles
                if (o.sparkle && H(X, Y, 54) < 0.006) return 3;
                if (o.diag) { const k = ((X + Y) % 41 + 41) % 41, cell = Math.floor((X - Y) / 23); if (k === 0 && H(cell, Math.floor((X + Y) / 41), 55) < 0.45) return 1; }
                const v = vn(X, Y, 8, 56) * 0.65 + vn(X, Y, 4, 57) * 0.35;
                return v < 0.4 ? 2 : v > 0.62 ? 1 : 0;
            },
            obsSpore(X, Y, o) {   // obsidian's glints, a few spores glowing
                const sp = PAT.spots(X, Y); if (sp === 3 && H(Math.floor(X / 11), Math.floor(Y / 11), 58) < (o.spores || 0.5)) return 3;
                const g = PAT.glints(X, Y); if (g === 1) return 1;
                return H(X, Y, 59) < (o.specks || 0.01) ? 3 : 0;
            }
        };
        // ancient Egyptian blocks: uneven lengths in tight courses, fine joints, the corners chipped and worn, the
        // stone's grain, a carved figure here and there (cut in: its strokes dark, lit below and right)
        const GLYPH = [
            ["..###..", ".#...#.", ".#...#.", "..###..", "...#...", "#######", "...#...", "...#...", "...#..."],   // ankh
            [".......", "..###..", ".#####.", "##.#.##", ".#####.", "..###..", "...#...", "..#.#..", ".#...#."],   // eye
            ["...##..", "..#..#.", "...##..", "..###..", ".#####.", "#######", "..#.#..", "..#.#..", ".##.##."],   // bird
            ["#.#.#.#", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#######", "...#...", "...#...", "..###.."],   // reeds
            [".#####.", "#.....#", "#.###.#", "#.#.#.#", "#.###.#", "#.....#", ".#####.", ".......", "......."]    // cartouche
        ];
        const rowCuts = new Map();
        function cutsOf(row, o) {
            const key = row + ":" + (o.min || 20);
            if (rowCuts.has(key)) return rowCuts.get(key);
            const c = [0]; let x = 0, i = 0;
            while (x < 256) { const w = (o.min || 20) + Math.floor(H(row, i++, 60) * (o.range || 26)); if (256 - (x + w) < (o.min || 20)) { x = 256; } else x += w; c.push(x); }
            rowCuts.set(key, c); return c;
        }
        PAT.egypt = (X, Y, o) => {
            const bh = o.bh || 16, row = Math.floor(Y / bh), ly = ((Y % bh) + bh) % bh, xx = ((X % 256) + 256) % 256, cuts = cutsOf(row, o);
            let b = 0; while (cuts[b + 1] <= xx) b++;
            const x0 = cuts[b], x1 = cuts[b + 1], lx = xx - x0, w = x1 - x0;
            if (lx === 0 || ly === 0) return 2;
            const cx = Math.min(lx, w - lx), cy = Math.min(ly, bh - ly);
            if (cx + cy < 3 && H(row, b * 4 + (lx < w / 2 ? 0 : 1) + (ly < bh / 2 ? 0 : 2), 61) < (o.chips || 0.5)) return 2;
            if (lx === 1 || ly === 1) return 1;
            if (H(row, b, 62) < (o.glyphs || 0.18) && w >= 14 && bh >= 12) {
                const n = o.scatter && w >= 30 && H(row, b, 65) < 0.35 ? 2 : 1;
                for (let q = 0; q < n; q++) {
                    const G = GLYPH[Math.floor(H(row, b * 3 + q, 63) * GLYPH.length)];
                    const ox = o.scatter ? 2 + Math.floor(H(row, b * 3 + q, 66) * Math.max(1, (n === 2 ? w / 2 : w) - 11)) + (q ? Math.floor(w / 2) : 0) : Math.floor((w - 7) / 2);
                    const oy = o.scatter ? 2 + Math.floor(H(row, b * 3 + q, 67) * Math.max(1, bh - 12)) : Math.floor((bh - 9) / 2);
                    const gx = lx - ox, gy = ly - oy, at = (i, j) => i >= 0 && j >= 0 && i < 7 && j < 9 && G[j][i] === "#";
                    if (at(gx, gy)) return 2;
                    if (at(gx - 1, gy - 1)) return 1;
                }
            }
            return H(X, Y, 64) < 0.05 ? 3 : 0;
        };
        const patCache = new Map();
        function pattern(name, o) {
            const key = name + JSON.stringify(o || {});
            if (patCache.has(key)) return patCache.get(key);
            const p = new Uint8Array(PW * PH), f = PAT[name];
            for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) p[y * PW + x] = f(x, y, o || {});
            patCache.set(key, p); return p;
        }
        /* THE SURFACES along a wall's top: the colour e pixels down from the top (null: the face shows) */
        const TOPS = {
            scallop: (X, e, T) => { const sc = ((X % 6) + 6) % 6, s = 4 + (sc === 0 || sc === 5 ? 0 : 1); if (e < 1) return T[0]; if (e < 2) return T[1]; if (e >= s) return e < s + 1 ? T[3] : null; return T[2]; },
            grass: (X, e, T) => { const t = H(X, 0, 40) < 0.4 ? 1 : 0; if (e < 1) return T[0]; if (e < 2) return t ? T[1] : T[2]; if (e < 3 + t) return T[2]; if (e < 4 + t) return T[3]; return null; },
            plate: (X, e, T) => { if (e < 1) return T[0]; if (e < 2) return T[1]; if (e < 4) return (((X % 8) + 8) % 8 === 3 && e < 3) ? T[0] : T[2]; if (e < 5) return T[3]; return null; },
            gold: (X, e, T) => e < 1 ? T[0] : e < 2 ? T[1] : e < 3 ? T[2] : e < 4 ? T[3] : e < 5 ? T[0] : null,
            neon: (X, e, T) => e < 1 ? T[0] : e < 2 ? T[1] : e < 3 ? T[2] : e < 5 ? T[3] : null,
            // snow lying unevenly: its depth wandering over uneven spans, a soft lobe here and there, a blue fleck in
            // the white, its edge fading into the ice over a pixel (the owner: "less of the same pattern like real snow")
            snowdrift: (X, e, T, o) => {
                const n1 = n1d(X, 11, 90), n2 = n1d(X, 4.3, 91), lobe = n1d(X, 23, 92);
                const d = 4 + Math.round(n1 * (o && o.range || 4) + n2 * 1.6 + (lobe > 0.72 ? (lobe - 0.72) * (o && o.lobes || 14) : 0));
                if (e < 1) return T[0];
                if (e < 2) return T[1];
                if (e < d - 1) return H(X, Math.floor(e), 93) < (o && o.fleck || 0.03) ? T[3] : T[2];
                if (e < d) return T[3];
                if (e < d + 1) return T[4];
                if (e < d + 2) return ((X + Math.floor(e)) & 1) ? T[4] : null;
                return null;
            },
            // soft sand: a warm sandy edge (no dark outline), pale on top, shading down, its underside a gentle wave
            // dithered into the stone
            sandband: (X, e, T) => { const d = 6 + Math.round(Math.sin(X / 9) * 1.1 + Math.sin(X / 3.7) * 0.4); if (e < 1) return T[0]; if (e < 2) return T[1]; if (e < d - 1) return H(X, Math.floor(e), 82) < 0.05 ? T[3] : T[2]; if (e < d) return T[3]; if (e < d + 1) return ((X + Math.floor(e)) & 1) ? T[4] : null; return null; }
        };
        /* THE WALL: a tile at a time into a 16-pixel picture: how far each pixel lies in from the open air (the outer
           corners rounded where two open sides meet), and by that the outline, the lit left rim, the shaded right and
           underside, the surface along the top, and inside them the face */
        function makeWall(W) {
            const pat = pattern(W.face, W.fo), C = W.cols.map(hx), T = W.top.map(hx), out = hx(W.out), side = hx(W.side), sideD = hx(W.sideD || W.out), RC = W.rc === undefined ? 4 : W.rc, top = TOPS[W.topStyle || "scallop"];
            const cv = document.createElement("canvas"); cv.width = 16; cv.height = 16; const cx = cv.getContext("2d"), img = cx.createImageData(16, 16), d = img.data;
            return function (x, a, tx, ty, ppx, ppy, h) {
                const Wl = (dx, dy) => h.wallish(a, tx + dx, ty + dy);
                const u = !Wl(0, -1), dn = !Wl(0, 1), l = !Wl(-1, 0), r = !Wl(1, 0);
                // (a floor under spikes keeps its bare face: no snow or sand under them)
                const bare = W.bareUnderSpikes && a.tiles[ty - 1] && a.tiles[ty - 1][tx] === "^";
                const corners = [[u, l, RC, RC], [u, r, 16 - RC, RC], [dn, l, RC, 16 - RC], [dn, r, 16 - RC, 16 - RC]].filter(c => c[0] && c[1] && RC > 0);
                for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
                    const X = tx * 16 + i, Y = ty * 16 + j, k = (j * 16 + i) * 4;
                    let e = 99, eTop = u ? j : 99, eL = l ? i : 99;
                    if (u) e = Math.min(e, j); if (dn) e = Math.min(e, 15 - j); if (l) e = Math.min(e, i); if (r) e = Math.min(e, 15 - i);
                    for (const [, , ccx, ccy] of corners) {
                        if (!(ccx === RC ? i < RC : i >= 16 - RC) || !(ccy === RC ? j < RC : j >= 16 - RC)) continue;
                        const v = RC - Math.hypot(i + 0.5 - ccx, j + 0.5 - ccy); e = v; if (u && ccy === RC) eTop = Math.min(eTop, v); if (l && ccx === RC) eL = Math.min(eL, v);
                    }
                    if (e < 0) { d[k + 3] = 0; continue; }
                    let c = null;
                    // (snow draped a few pixels down the sides at an outer top corner)
                    if (W.drape && u && !bare && eTop < W.drape && e >= 1 && e < 2.5 && ((l && i < 3) || (r && i > 12))) c = T[eTop < W.drape - 2 ? 2 : 3];
                    if (!c && u && eTop < 15 && !bare) c = top(X, eTop, T, W.topOpt);
                    if (!c) {
                        if (e < 1) c = out;
                        else if (e < 2 && eL < 2) c = side;
                        else if (e < 2) c = sideD;
                        else c = C[pat[(((Y % PH) + PH) % PH) * PW + (((X % PW) + PW) % PW)]];
                    }
                    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
                }
                cx.putImageData(img, 0, 0); x.drawImage(cv, ppx, ppy);
            };
        }
        // a zone's own walls kept, the new styling round them: the outer corners rounded, the outline following them
        function roundedWall(orig, K, RC) {
            const cv = document.createElement("canvas"); cv.width = 16; cv.height = 16; const cx = cv.getContext("2d");
            const col = c => { if (!c || c[0] !== "#") { const t = document.createElement("canvas").getContext("2d"); t.fillStyle = c || "#000"; c = t.fillStyle; } return c.length === 7 ? hx(c) : [0, 0, 0]; };
            let lastA = null, OUT, LIT, DARK;
            return function (x, a, tx, ty, ppx, ppy, h) {
                if (a !== lastA) { lastA = a; const E = (K.edgeFor ? K.edgeFor.call(K, a) : K.edge) || { out: "#000000", lit: "#444444", dark: "#000000" }; OUT = col(E.out); LIT = col(E.lit); DARK = col(E.dark); }
                cx.clearRect(0, 0, 16, 16);
                orig.call(this, cx, a, tx, ty, 0, 0, h);
                const Wl = (dx, dy) => h.wallish(a, tx + dx, ty + dy), u = !Wl(0, -1), dn = !Wl(0, 1), l = !Wl(-1, 0), r = !Wl(1, 0);
                const corners = [[u, l, RC, RC], [u, r, 16 - RC, RC], [dn, l, RC, 16 - RC], [dn, r, 16 - RC, 16 - RC]].filter(c => c[0] && c[1]);
                const im = cx.getImageData(0, 0, 16, 16), d = im.data;
                for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
                    let e = 99, eL = l ? i : 99, eB = dn ? 15 - j : 99, eR = r ? 15 - i : 99;
                    if (l) e = Math.min(e, i); if (r) e = Math.min(e, 15 - i); if (dn) e = Math.min(e, 15 - j); if (u) e = Math.min(e, j);
                    let inCorner = false;
                    for (const [, , ccx, ccy] of corners) { if (!(ccx === RC ? i < RC : i >= 16 - RC) || !(ccy === RC ? j < RC : j >= 16 - RC)) continue; e = RC - Math.hypot(i + 0.5 - ccx, j + 0.5 - ccy); inCorner = true; if (ccx === RC) eL = e; else eR = e; if (ccy !== RC) eB = e; }
                    const k = (j * 16 + i) * 4;
                    if (e < 0) { d[k + 3] = 0; continue; }
                    let c = null;
                    if (e < 1 && (l || r || dn || inCorner)) c = OUT;
                    else if (eL < 2 && l) c = LIT;
                    else if ((eR < 2 && r) || (eB < 2 && dn)) c = DARK;
                    if (c) { d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255; }
                }
                cx.putImageData(im, 0, 0); x.drawImage(cv, ppx, ppy);
            };
        }
        // grass, sprigs and flowers growing up over a top, a blade at a time
        function tuftLip(tu) {
            return function (x, a, tx, ty, px, py) {
                for (let i = 0; i < 16; i++) {
                    if (H(tx * 16 + i, ty, 70) > tu.density) continue;
                    const hgt = 1 + Math.floor(H(tx * 16 + i, ty, 71) * (tu.tall || 3)), lean = H(tx * 16 + i, ty, 72) < 0.5 ? 0 : (H(tx * 16 + i, ty, 73) < 0.5 ? -1 : 1);
                    for (let k = 0; k < hgt; k++) { x.fillStyle = k === hgt - 1 ? tu.cols[2] : k === 0 ? tu.cols[0] : tu.cols[1]; x.fillRect(px + i + (k === hgt - 1 ? lean : 0), py - 1 - k, 1, 1); }
                    if (tu.flowers && H(tx * 16 + i, ty, 74) < tu.flowers) { x.fillStyle = tu.flowerCol || "#f2d24a"; x.fillRect(px + i + lean, py - 1 - hgt, 1, 1); }
                }
            };
        }
        // the back wall, drawn as it was and then toned toward the new walls (by k, toward mix, darkened by dark)
        /* (every zone's back wall here is made from where a pixel is and the map's size alone, nothing else of the
           passage: so each size's is made once and kept; the Ice's and the Station's took two seconds every Play) */
        function tonedBack(orig, B) {
            const mix = hx(B.mix), made = new Map();
            return function (x, a, h) {
                const Wd = a.w * 16, Hd = a.h * 16, key = Wd + "x" + Hd;
                let c = made.get(key);
                if (!c) {
                    c = document.createElement("canvas"); c.width = Wd; c.height = Hd; const cx = c.getContext("2d");
                    orig.call(this, cx, a, h);
                    const im = cx.getImageData(0, 0, Wd, Hd), dd = im.data;
                    for (let i = 0; i < dd.length; i += 4) { const L = dd[i] * 0.3 + dd[i + 1] * 0.55 + dd[i + 2] * 0.15; for (let ch = 0; ch < 3; ch++) dd[i + ch] = (dd[i + ch] + (L * mix[ch] / 128 - dd[i + ch]) * B.k) * B.dark; }
                    cx.putImageData(im, 0, 0);
                    if (made.size >= 3) made.delete(made.keys().next().value);
                    made.set(key, c);
                }
                x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(c, 0, 0); x.restore();
            };
        }
        const NONE = { out: "rgba(0,0,0,0)", lit: "rgba(0,0,0,0)", dark: "rgba(0,0,0,0)" };
        const LOOK = {
            quarry: {"back":{"mix":"#b89c76","k":0.2,"dark":0.96},"shard":["#efe1bf","#b39d72"],"timber":{"d":"#3b2a17","s":"#6e4f2c","m":"#9c7444","l":"#c79b62","q":"#876238"},"tufts":{"cols":["#3c5a1e","#5f8a2c","#8cb84a"],"density":0.55,"tall":5,"flowers":0.06,"flowerCol":"#f2d24a"},"wall":{"face":"courses","cols":["#dcc79c","#efe1bf","#b39d72","#d2bc8f"],"top":["#2a3a14","#8cb84a","#5f8a2c","#3c5a1e"],"topStyle":"grass","out":"#4a3b26","side":"#efe1bf","sideD":"#b39d72","rc":3},"slab":{"body":["#e0cea8","#e2d1ae","#e3d0a8"],"rim":"#f6ead0","rim2":"#e7d7b0","rim3":"#e2cfa6","shade":"#8f8165","deep":"#635a46","out":"#4a3b26","crack":"#b39d72","crackLit":"#efe1bf","gap":"#000000"},"ladder":{"#1a0f08":"#3b2a17","#b88350":"#c79b62","#96633a":"#9c7444","#d9a76b":"#d5b489","#74482a":"#6e4f2c"}},
            ice: {"keepUnder":true,"back":{"mix":"#7fb0d8","k":0.18,"dark":0.96},"shard":["#d8f0ff","#6eb2e0"],"timber":{"d":"#1f2630","s":"#45505e","m":"#66737f","l":"#9aa8b4","q":"#56636f"},"wall":{"face":"mottle","fo":{"diag":true,"sparkle":true},"cols":["#33618f","#4f7fae","#22446a","#e8f6ff"],"out":"#10233a","side":"#5f8fc0","sideD":"#1c3a5c","rc":4,"bareUnderSpikes":true,"drape":12,"topStyle":"snowdrift","top":["#10233a","#ffffff","#eef6fc","#c6dff1","#8fb8d8"],"topOpt":{"range":2,"lobes":9,"fleck":0.06}},"slab":{"body":["#4b749c","#587da3","#3d6c9a"],"rim":"#ffffff","rim2":"#eef6fc","rim3":"#91acc6","shade":"#213f5d","deep":"#172c40","out":"#10233a","crack":"#22446a","crackLit":"#4f7fae","gap":"#000000"},"ladder":{"#1a0f08":"#1f2630","#b88350":"#9aa8b4","#96633a":"#66737f","#d9a76b":"#b3bec7","#74482a":"#45505e"}},
            dark: {"back":{"mix":"#5a4a80","k":0.22,"dark":0.92},"shard":["#4a4256","#262130"],"timber":{"d":"#0c0a10","s":"#2a2232","m":"#3d3346","l":"#5a4d66","q":"#332a3c"},"tufts":{"cols":["#0f3a1e","#1f7a3a","#3fd07a"],"density":0.22,"tall":3},"wall":{"face":"obsSpore","fo":{"spores":0.5,"specks":0.006},"cols":["#17121f","#3a2f52","#0a070f","#8a6ad0"],"top":["#05030a","#8a78c0","#5a4b85","#2d2445"],"topStyle":"scallop","out":"#05030a","side":"#3a2f52","sideD":"#0a070f","rc":4},"slab":{"body":["#231e2a","#2a2531","#231c31"],"rim":"#352c4d","rim2":"#241d36","rim3":"#392f52","shade":"#0f0c14","deep":"#0a080e","out":"#05030a","crack":"#0a070f","crackLit":"#3a2f52","gap":"#000000"},"ladder":{"#1a0f08":"#0c0a10","#b88350":"#5a4d66","#96633a":"#3d3346","#d9a76b":"#837a8c","#74482a":"#2a2232"}},
            station: {"back":{"mix":"#4a6a8a","k":0.2,"dark":0.95},"shard":["#8494a8","#465262"],"timber":{"d":"#10161c","s":"#36424e","m":"#55636f","l":"#8695a3","q":"#46525e"},"wall":{"face":"plates","fo":{"ps":16},"cols":["#2e3e52","#4a6079","#18222e","#8da2b8"],"top":["#0b1118","#9fb4c8","#5d7590","#2a3a4c"],"topStyle":"plate","out":"#0b1118","side":"#4a6079","sideD":"#18222e","rc":2},"slab":{"body":["#475567","#546171","#384a60"],"rim":"#9fb4c8","rim2":"#5d7590","rim3":"#465a71","shade":"#1e2835","deep":"#151c25","out":"#0b1118","crack":"#18222e","crackLit":"#4a6079","gap":"#000000"},"ladder":{"#1a0f08":"#10161c","#b88350":"#8695a3","#96633a":"#55636f","#d9a76b":"#a4b0ba","#74482a":"#36424e"}},
            heart: {"back":{"mix":"#a03040","k":0.15,"dark":0.97},"shard":["#f5ecda","#b9ad94"],"timber":{"d":"#2a1006","s":"#5a2410","m":"#7e3a1c","l":"#e6b93a","q":"#6a2e14"},"wall":{"face":"ashlar","fo":{"bw":32,"bh":16},"cols":["#e2d6bc","#f5ecda","#a8987a","#d8cbb0"],"top":["#3a2a0a","#fff2a0","#e6b93a","#9a6f14"],"topStyle":"gold","out":"#4a3e2a","side":"#f5ecda","sideD":"#a8987a","rc":3},"slab":{"body":["#e5dbc4","#e7ddc8","#e9dec7"],"rim":"#fff2a0","rim2":"#e6b93a","rim3":"#e4c87b","shade":"#938b7a","deep":"#666055","out":"#4a3e2a","crack":"#a8987a","crackLit":"#f5ecda","gap":"#000000"},"ladder":{"#1a0f08":"#2a1006","#b88350":"#e6b93a","#96633a":"#7e3a1c","#d9a76b":"#eccb6b","#74482a":"#5a2410"}},
            factory: {"shard":["#8f8a86","#3a2012"],"timber":{"d":"#0e0d0d","s":"#3a3636","m":"#5d5856","l":"#8f8a86","q":"#4a4646"},"keepWall":{"rc":3},"slab":{"body":["#545252","#605d5d","#484544"],"rim":"#8f8a86","rim2":"#5d5856","rim3":"#4d4948","shade":"#282626","deep":"#1b1a1a","out":"#0e0d0d","crack":"#1e1c1c","crackLit":"#5d5856","gap":"#000000"},"ladder":{"#1a0f08":"#0e0d0d","#b88350":"#8f8a86","#96633a":"#5d5856","#d9a76b":"#aba7a4","#74482a":"#3a3636"}},
            tomb: {"back":{"mix":"#c08a4a","k":0.2,"dark":0.95},"shard":["#e2b070","#8a5a2a"],"timber":{"d":"#2a1608","s":"#5a3214","m":"#8a5224","l":"#c08040","q":"#704020"},"wall":{"face":"egypt","fo":{"bh":16,"min":22,"range":24,"glyphs":0.3,"chips":0.5,"scatter":true},"cols":["#c8904c","#e2b070","#8a5a2a","#b8823f"],"out":"#3e260e","side":"#e2b070","sideD":"#8a5a2a","rc":3,"bareUnderSpikes":true,"top":["#a87638","#fbe3a8","#ecc77e","#d6a95e","#b8873e"],"topStyle":"sandband"},"slab":{"body":["#cf9d61","#d2a46c","#d19b59"],"rim":"#fbe3a8","rim2":"#ecc77e","rim3":"#daac65","shade":"#825e31","deep":"#5a4122","out":"#3e260e","crack":"#8a5a2a","crackLit":"#e2b070","gap":"#000000"},"ladder":{"#1a0f08":"#2a1608","#b88350":"#c08040","#96633a":"#8a5224","#d9a76b":"#d0a070","#74482a":"#5a3214"}},
            ruins: {"back":{"mix":"#6a8a6a","k":0.15,"dark":0.97},"shard":["#9eab98","#4c5a4a"],"timber":{"d":"#1e1a10","s":"#4a4230","m":"#6a5e44","l":"#8e8a5c","q":"#5a5038"},"wall":{"face":"stones","cols":["#8a8c7e","#a8aa9a","#505246","#74806a"],"top":["#1c2a14","#9ed65a","#5f9e36","#2f5a22"],"topStyle":"grass","out":"#22261c","side":"#a8aa9a","sideD":"#505246","rc":5},"slab":{"body":["#989a8d","#9fa195","#959788"],"rim":"#9ed65a","rim2":"#5f9e36","rim3":"#75955a","shade":"#5a5b52","deep":"#3e3f39","out":"#22261c","crack":"#505246","crackLit":"#a8aa9a","gap":"#000000"},"ladder":{"#1a0f08":"#1e1a10","#b88350":"#8e8a5c","#96633a":"#6a5e44","#d9a76b":"#aaa785","#74482a":"#4a4230"}},
            arcade: {"back":{"mix":"#6a3aa0","k":0.2,"dark":0.95},"shard":["#ff3fd2","#4ff0ff"],"timber":{"d":"#0d0618","s":"#3a2a5a","m":"#5a4a8a","l":"#9a8ad0","q":"#4a3a70"},"pinball":["#0a0a12","#2a2c38","#3c3f4c","#7a7f90","#b8bdcc","#e6eaf4","#ffffff"],"wall":{"face":"grid","cols":["#1c0f30","#33204f","#0d0618","#ff3fd2"],"top":["#06020c","#ffffff","#4ff0ff","#1d6a80"],"topStyle":"neon","out":"#06020c","side":"#3a1f5c","sideD":"#0d0618","rc":3},"slab":{"body":["#372c49","#453a55","#24153b"],"rim":"#ffffff","rim2":"#4ff0ff","rim3":"#368098","shade":"#120a1f","deep":"#0d0716","out":"#06020c","crack":"#0d0618","crackLit":"#33204f","gap":"#000000"},"ladder":{"#1a0f08":"#0d0618","#b88350":"#9a8ad0","#96633a":"#5a4a8a","#d9a76b":"#b3a7dc","#74482a":"#3a2a5a"}}
        };
        for (const [key, O] of Object.entries(LOOK)) {
            const T = themes[key]; if (!T) continue;
            const K = Object.assign({}, T);
            if (O.keepWall) T.wall = roundedWall(K.wall, K, O.keepWall.rc || 3);
            else {
                T.wall = makeWall(O.wall);
                T.lip = O.tufts ? tuftLip(O.tufts) : function () {};
                if (!O.keepUnder) T.under = function () {};
                T.moss = false;
            }
            // (the straight edges the game drew round a wall: the wall draws its own, round at the corners)
            T.edge = NONE; T.edgeFor = () => NONE;
            if (O.back && K.back) T.back = tonedBack(K.back, O.back);
            if (O.shard) T.shard = O.shard;
            if (O.timber) T.timber = O.timber;
            if (O.pinball) T.pinballRubble = O.pinball; else if (O.slab) T.slabRubble = O.slab;
            if (O.ladder) T.ladderMap = O.ladder;
        }
    })();

    window.RatZones = { sprites, themes };
})();
