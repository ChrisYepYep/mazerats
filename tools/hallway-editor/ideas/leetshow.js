/* The Leet Show posters (9 Nov 2026, his: "poster board items, themed to the theatredrome but fitting the hallway vibe. Some wall item
   versions, and some that are placeable furniture items, like a poster board that is thin supported by two metal poles, the same colour
   as the globe lamps base. The frame of the poster should also be that colour. The posters are advertising The Leet Show").
   Old theatre bills: a deep burgundy ground with a sunburst behind the title, a gold rule round the edge, the title in tall condensed
   gold capitals (the hallway's own Volter lettering, stretched to twice its height), and a band of Twitch purple along the foot.
   Frames and poles are the globe lamp's bronze, its exact colours. make-ideas-art.js writes them: two wall posters and the stand. */
"use strict";
const iso = require("./iso3d.js"), { box, cyl, ball, render, col } = iso, A = require("./art.js");
/* the globe lamp's bronze, darkest to lightest, as in art/lamps/globe-lamp.png */
const BRONZE = ["24130a", "3a210f", "543119", "6e4524", "8c5c30", "ab7a44", "c99a5c", "eed09c"];
const FRAME = { top: col(BRONZE[6]), y: col(BRONZE[5]), x: col(BRONZE[4]), edge: col(BRONZE[0]) };
const POLE = { ramp: [BRONZE[1], BRONZE[3], BRONZE[4], BRONZE[5], BRONZE[6], BRONZE[7]], top: col(BRONZE[6]), edge: col(BRONZE[0]) };
const C = { ground: "4a1028", ray: "561430", rayDk: "3e0c22", edge: "2a0716", gold: "e6c072", goldLt: "fbe6a8", goldDk: "a67f36", shadow: "1a0510", cream: "f1e2c0" };

/* lettering: a set of "u,v" pixels, optionally twice as tall */
function letters(s, font, tall) { const on = new Set(); for (const k of A.vol(s, font)) { const [x, y] = k.split(",").map(Number); if (tall) { on.add(x + "," + ((y - 2) * 2)); on.add(x + "," + ((y - 2) * 2 + 1)); } else on.add(x + "," + (y - 2)); } return { on, w: A.volW(s, font) }; }
/* the date-stamp lettering, the same the page stamps the date with (stamp-font.js); turned round for the mirrored picture of a wall item,
   as Volter is, so it reads the right way once flipped */
const SF = require("../stamp-font.js"), mirrored = () => { const on = A.vol("L", "v"); let lo = 99, hi = -99, bar = null; for (const k of on) { const [x, y] = k.split(",").map(Number); lo = Math.min(lo, x); hi = Math.max(hi, x); if (y === 2) bar = x; } return bar !== null && bar === hi && hi !== lo; };
function stamped(s, tall) { const t = SF.stamp(s), m = mirrored(), on = new Set(), start = new Map(); for (const [x, y, gx] of t.px) { const X = m ? t.w - 1 - x : x; start.set(X, gx); if (tall) { on.add(X + "," + y * 2); on.add(X + "," + (y * 2 + 1)); } else on.add(X + "," + y); } return { on, w: t.w + 1, start }; }
/* the cream paper slip the page stamps the next show's date on, pasted across the foot of the bill. SLIP is its colour and nothing
   else on the poster is: live-leet.js finds the slip in the picture by it */
const SLIP = "f3e7c7", SLIP_RIM = "d9c49a", SLIP_DK = "b49c6e";
/* the poster itself, W by H: a function from (u across, v down) to a colour. slip: [top row, rows, right across]: right across, it's pasted
   over the border from edge to edge, as a theatre's date strip is. o.thin: a border of three, not four (the narrow stand's bill) */
function art(W, H, lines, slip, o = {}) {
    const placed = lines.map(([s, font, tall, v, colour, shadow]) => { const t = font === "stamp" ? stamped(s, tall) : letters(s, font, tall); return { ...t, font, tall, u0: Math.round((W - t.w) / 2) + 1, v0: v, colour, shadow }; });
    /* uc, vc: where on the sheet this pixel's ray met it, unrounded; shear: how far v moves for a step across (half a pixel, one way or the
       other). Given them, the stamp-lettered lines are laid out upright, each letter from its first column, so the slant can't break them */
    return (u, v, uc, vc, shear) => {
        if (u < 0 || v < 0 || u >= W || v >= H) return null;
        /* the gold rule round the edge, a dark line inside it */
        const e = Math.min(u, v, W - 1 - u, H - 1 - v), b = o.thin ? 1 : 0, border = () => e === 0 ? C.edge : e === 2 - b ? C.gold : e === 3 - b ? C.edge : null;
        /* the border first, unless a slip pasted right across lies over it */
        if (!(slip && slip[2] && v >= slip[0] && v <= slip[0] + slip[1])) { const bc = border(); if (bc) return bc; }
        if (slip) {
            const [t0, n, across] = slip, t1 = t0 + n - 1, l0 = across ? 0 : 4, l1 = across ? W - 1 : W - 5;
            if (v >= t0 && v <= t1 && u >= l0 && u <= l1) {
                /* corners clipped, a darker rim top and bottom, a lighter fold down the left */
                if ((v === t0 || v === t1) && (u === l0 || u === l1)) return C.shadow;
                if (v === t0) return SLIP_RIM; if (v === t1) return SLIP_DK; if (u === l1) return SLIP_RIM;
                return SLIP;
            }
            if (v === t1 + 1 && u > l0 && u <= l1 + 1) return C.shadow;
            if (u === l1 + 1 && v > t0 && v <= t1) return C.shadow;
        }
        { const bc = border(); if (bc) return bc; }
        for (const t of placed) { const x = u - t.u0; let y = v - t.v0;
            if (shear && t.font === "stamp" && t.start) { const gx = t.start.has(x) ? t.start.get(x) : t.start.has(x - 1) ? t.start.get(x - 1) : null; if (gx !== null) y = Math.floor(vc - t.v0 + shear * (uc - (t.u0 + gx + .5)) + 1e-6); } /* a shadow column just right of a letter takes that letter's start */ if (t.on.has(x + "," + y)) return t.font === "stamp" && !t.tall ? t.colour : y < 2 ? C.goldLt : t.colour; if (t.shadow && t.on.has((x - 1) + "," + (y - 1))) return C.shadow; }
        /* the sunburst, rising from behind the title, and a darker edge to the sheet */
        const cx = W / 2, cy = H * .42, a = Math.atan2(v - cy, u - cx), ray = Math.floor((a + Math.PI) / (Math.PI * 2) * 24) & 1, r = Math.hypot((u - cx) / W, (v - cy) / H);
        if (e === 1 && !o.thin) return C.rayDk;
        return r > .52 ? C.rayDk : ray ? C.ray : C.ground;
    };
}
/* a deco rule: a line with a diamond in the middle */
function withRule(f, W, v0, plain) { return (u, v, ...more) => { const d = Math.abs(u - (W - 1) / 2); if (!plain && v >= v0 - 2 && v <= v0 + 2 && d + Math.abs(v - v0) <= 2) return d + Math.abs(v - v0) <= 1 ? C.goldLt : C.gold; if (v === v0 && (plain || d > 4) && d < W / 2 - 7) return C.goldDk; return f(u, v, ...more); }; }
/* No "live on Twitch" (9 Nov, his): a bill for a show at the Theatredrome, with the next stream's real date and time stamped on its slip */
const PORTRAIT = { W: 56, H: 85 }, LANDSCAPE = { W: 100, H: 58 }, SMALL = PORTRAIT, NARROW = { W: 29, H: 92 };
/* the narrow stand's bill (9 Nov 2026, his: a 2 by 1 stand, then "the poster is too wide, fit it to the width of the feet"): 25 across, so the
   date stamp's lettering throughout, the title twice as tall; "NEXT" over a slip pasted right across, three short lines (day, date, time) */
const NARROW_LINES = [["THE", false, 4, true], ["LEET", true, 13, true], ["SHOW", true, 29, true], ["NEXT", false, 50, false]];
const narrow = () => withRule(art(NARROW.W, NARROW.H, [], [59, 29, true], { thin: true }), NARROW.W, 46);
const portrait = (P = PORTRAIT) => withRule(art(P.W, P.H, [["THE", "v", false, 6, C.gold, true], ["LEET", "vb", true, 15, C.gold, true], ["SHOW", "vb", true, 31, C.gold, true], ["NEXT SHOW", "stamp", false, 51, C.gold, false]], [60, 20]), P.W, 47);
const landscape = () => withRule(art(LANDSCAPE.W, LANDSCAPE.H, [["THE", "v", false, 5, C.gold, true], ["LEET SHOW", "vb", true, 13, C.gold, true], ["NEXT SHOW", "stamp", false, 32, C.gold, false]], [41, 11]), LANDSCAPE.W, 29, true);
/* the poster on the wall in a bronze frame: the wall item's own way of drawing, face "x" (the hallway's framed signs) */
function wall(which) {
    const P = which === "landscape" ? LANDSCAPE : PORTRAIT, tex0 = which === "landscape" ? landscape() : portrait(), W = P.W + 6, Hh = P.H + 6, z0 = which === "landscape" ? 58 : 46, y1 = W - 3, zt = z0 + Hh - 3;
    const face = { top: col(C.ground), y: col(C.ground), x: col(C.ground), edge: null, noLine: true, tex: (f, p) => f === "x" ? tex0(Math.floor(y1 - p[1]), Math.floor(zt - p[2])) : null };
    return render([box(0, 1, 3, W - 3, z0 + 3, z0 + Hh - 3, face), box(0, 2.4, 0, 3, z0, z0 + Hh, FRAME), box(0, 2.4, W - 3, W, z0, z0 + Hh, FRAME), box(0, 3.2, 0, W, z0 + Hh - 3, z0 + Hh, FRAME), box(0, 2.4, 0, W, z0, z0 + 3, FRAME)]);
}
/* the poster stand: the poster in its bronze frame between two thin bronze poles, each on a little foot and topped with a ball.
   It stands across four tiles. alongY: the run goes along y and the poster faces +x; otherwise along x, facing +y. The origin is the far
   corner of the first tile (hw3 draws it from there, as the trophy cabinet). */
function stand(alongY, thin) {
    /* the narrow one's frame: slim sides that don't stand proud of the face, so its nearer side hides none of the lettering (9 Nov, his) */
    const P = thin ? NARROW : SMALL, tex0 = thin ? narrow() : portrait(SMALL), ft = thin ? 2 : 3, fs = thin ? 1.2 : ft, fd = thin ? -.1 : .4, W = P.W + 2 * fs, Hh = P.H + 2 * ft, z0 = 8, L = thin ? 32 : 64, mid = 8, t = 1.2, a0 = (L - W) / 2, a1 = a0 + W, zt = z0 + Hh - ft;
    /* in the run's own frame: s along it, d across it (the poster's facing side is +d) */
    const B = (s0, s1, d0, d1, za, zb, m) => alongY ? box(d0, d1, s0, s1, za, zb, m) : box(s0, s1, d0, d1, za, zb, m);
    /* where on the sheet a ray met it; on the narrow one a quarter in, as its columns and rows fall exactly on whole numbers and rounding noise
       would otherwise skip or repeat one */
    const nudge = thin ? .25 : 0;
    const faceTex = (f, p) => { if (alongY ? f !== "x" : f !== "y") return null; const uc = (alongY ? a1 - fs - p[1] : p[0] - a0 - fs) + nudge, vc = zt - p[2] + nudge; return tex0(Math.floor(uc), Math.floor(vc), uc, vc, thin ? (alongY ? -.5 : .5) : 0); };
    const back = col("2a1a10"), face = { top: col(C.ground), y: alongY ? back : col(C.ground), x: alongY ? col(C.ground) : back, edge: null, noLine: true, tex: faceTex };
    const prims = [B(a0 + fs, a1 - fs, mid - t, mid + t - .2, z0 + ft, z0 + Hh - ft, face),
        B(a0, a0 + fs, mid - t - .4, mid + t + fd, z0, z0 + Hh, FRAME), B(a1 - fs, a1, mid - t - .4, mid + t + fd, z0, z0 + Hh, FRAME), B(a0, a1, mid - t - .4, mid + t + .6, z0 + Hh - ft, z0 + Hh, FRAME), B(a0, a1, mid - t - .4, mid + t + .4, z0, z0 + ft, FRAME)];
    /* the poles run up through the frame's sides, so the stand and its feet stay on its own four tiles (9 Nov, his: a foot out on the next
       tile went under the rug there) */
    /* the narrow one: the poster is wider than its two tiles, so it's mounted in front of two poles that stand inside them, the feet on its own tiles */
    const poleD = thin ? mid - t - 2.6 : mid, at = thin ? [3, L - 3] : [a0 + 1.5, a1 - 1.5];
    for (const s of at) {
        const c = alongY ? [poleD, s] : [s, poleD];
        prims.push(cyl(c[0], c[1], 1.1, 2, z0 + Hh + 6, POLE), ball(c[0], c[1], z0 + Hh + 7.5, 2, POLE));
        /* the foot: a short bar across the run, so it stands */
        prims.push(thin ? B(s - 1.4, s + 1.4, poleD - 5, poleD + 7, 0, 2, FRAME) : B(s - 1.4, s + 1.4, mid - 6, mid + 6, 0, 2, FRAME));
        /* on the narrow one, an arm from each pole to the frame's back, top and bottom */
        if (thin) for (const z of [z0 + 8, z0 + Hh - 9]) prims.push(B(s - .6, s + .6, poleD, mid - t - .4, z, z + 1.4, FRAME));
    }
    if (!thin) return render(prims);
    /* The narrow bill's lettering, laid onto the finished picture (9 Nov 2026, his: words looked cut off). Sheared by the slant through the
       sheet's texture, 4-wide letters fell apart; here every letter stays upright, from the row the sheet's line starts at in its own first
       column, so only the line steps down, a letter at a time. A second picture, the sheet coloured by where on it each pixel is, says where. */
    const out = render(prims), where = render(prims.map(q => q === prims[0] ? { ...q, mat: { top: [0, 0, 0], x: [0, 0, 0], y: [0, 0, 0], edge: null, noLine: true, tex: (f, p) => { if (alongY ? f !== "x" : f !== "y") return null; const u = Math.floor((alongY ? a1 - fs - p[1] : p[0] - a0 - fs) + nudge), v = Math.floor(zt - p[2] + nudge); return [u + 1, v + 1, 7]; } } } : q));
    const onSheet = new Map(), colOf = new Map();       /* screen pixel -> [u, v]; sheet column u -> its screen column */
    for (let j = 0; j < where.h; j++) for (let i = 0; i < where.w; i++) { const q = (j * where.w + i) * 4; if (where.rgba[q + 3] < 128 || where.rgba[q + 2] !== 7) continue; const u = where.rgba[q] - 1, v = where.rgba[q + 1] - 1; onSheet.set(i + "," + j, [u, v]); if (!colOf.has(u)) colOf.set(u, i); }
    const rowAt = (X, v) => { for (let j = 0; j < where.h; j++) { const k = onSheet.get(X + "," + j); if (k && k[1] === v) return j; } return null; };
    const put = (X, Y, c) => { if (!onSheet.has(X + "," + Y)) return; const q = (Y * out.w + X) * 4; const cc = col(c); out.rgba[q] = cc[0]; out.rgba[q + 1] = cc[1]; out.rgba[q + 2] = cc[2]; };
    for (const [text, tall, v0, shadow] of NARROW_LINES) {
        const t = SF.stamp(text), u0 = Math.round((P.W - (t.w + 1)) / 2) + 1, starts = new Map(), on = new Set();
        for (const [x, y, gx] of t.px) { const rows = tall ? [y * 2, y * 2 + 1] : [y]; for (const yy of rows) { const X0 = colOf.get(u0 + gx); if (X0 === undefined) continue; if (!starts.has(gx)) starts.set(gx, rowAt(X0, v0)); const top = starts.get(gx); if (top === null) continue; on.add((X0 + (x - gx)) + "," + (top + yy) + "," + yy); } }
        const pts = [...on].map(k => k.split(",").map(Number)), lit = new Set(pts.map(([X, Y]) => X + "," + Y));
        if (shadow) for (const [X, Y] of pts) if (!lit.has((X + 1) + "," + (Y + 1))) put(X + 1, Y + 1, C.shadow);
        for (const [X, Y, yy] of pts) put(X, Y, tall && yy < 2 ? C.goldLt : C.gold);
    }
    return out;
}
module.exports = { wall, stand, portrait, landscape, narrow, PORTRAIT, LANDSCAPE, NARROW, BRONZE, SLIP };
