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
function stamped(s) { const t = SF.stamp(s), m = mirrored(), on = new Set(t.px.map(([x, y]) => (m ? t.w - 1 - x : x) + "," + y)); return { on, w: t.w + 1 }; }
/* the cream paper slip the page stamps the next show's date on, pasted across the foot of the bill. SLIP is its colour and nothing
   else on the poster is: live-leet.js finds the slip in the picture by it */
const SLIP = "f3e7c7", SLIP_RIM = "d9c49a", SLIP_DK = "b49c6e";
/* the poster itself, W by H: a function from (u across, v down) to a colour. slip: [top row, rows] */
function art(W, H, lines, slip) {
    const placed = lines.map(([s, font, tall, v, colour, shadow]) => { const t = font === "stamp" ? stamped(s) : letters(s, font, tall); return { ...t, font, u0: Math.round((W - t.w) / 2) + 1, v0: v, colour, shadow }; });
    return (u, v) => {
        if (u < 0 || v < 0 || u >= W || v >= H) return null;
        /* the gold rule round the edge, a dark line inside it */
        const e = Math.min(u, v, W - 1 - u, H - 1 - v); if (e === 0) return C.edge; if (e === 2) return C.gold; if (e === 3) return C.edge;
        if (slip) {
            const [t0, n] = slip, t1 = t0 + n - 1, l0 = 4, l1 = W - 5;
            if (v >= t0 && v <= t1 && u >= l0 && u <= l1) {
                /* corners clipped, a darker rim top and bottom, a lighter fold down the left */
                if ((v === t0 || v === t1) && (u === l0 || u === l1)) return C.shadow;
                if (v === t0) return SLIP_RIM; if (v === t1) return SLIP_DK; if (u === l1) return SLIP_RIM;
                return SLIP;
            }
            if (v === t1 + 1 && u > l0 && u <= l1 + 1) return C.shadow;
            if (u === l1 + 1 && v > t0 && v <= t1) return C.shadow;
        }
        for (const t of placed) { const x = u - t.u0, y = v - t.v0; if (t.on.has(x + "," + y)) return t.font === "stamp" ? t.colour : y < 2 ? C.goldLt : t.colour; if (t.shadow && t.on.has((x - 1) + "," + (y - 1))) return C.shadow; }
        /* the sunburst, rising from behind the title, and a darker edge to the sheet */
        const cx = W / 2, cy = H * .42, a = Math.atan2(v - cy, u - cx), ray = Math.floor((a + Math.PI) / (Math.PI * 2) * 24) & 1, r = Math.hypot((u - cx) / W, (v - cy) / H);
        if (e === 1) return C.rayDk;
        return r > .52 ? C.rayDk : ray ? C.ray : C.ground;
    };
}
/* a deco rule: a line with a diamond in the middle */
function withRule(f, W, v0, plain) { return (u, v) => { const d = Math.abs(u - (W - 1) / 2); if (!plain && v >= v0 - 2 && v <= v0 + 2 && d + Math.abs(v - v0) <= 2) return d + Math.abs(v - v0) <= 1 ? C.goldLt : C.gold; if (v === v0 && (plain || d > 4) && d < W / 2 - 7) return C.goldDk; return f(u, v); }; }
/* No "live on Twitch" (9 Nov, his): a bill for a show at the Theatredrome, with the next stream's real date and time stamped on its slip */
const PORTRAIT = { W: 56, H: 85 }, LANDSCAPE = { W: 100, H: 58 }, SMALL = PORTRAIT;
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
function stand(alongY) {
    const P = SMALL, tex0 = portrait(SMALL), W = P.W + 6, Hh = P.H + 6, z0 = 8, L = 64, mid = 8, t = 1.2, a0 = (L - W) / 2, a1 = a0 + W, zt = z0 + Hh - 3;
    /* in the run's own frame: s along it, d across it (the poster's facing side is +d) */
    const B = (s0, s1, d0, d1, za, zb, m) => alongY ? box(d0, d1, s0, s1, za, zb, m) : box(s0, s1, d0, d1, za, zb, m);
    const faceTex = (f, p) => alongY ? (f === "x" ? tex0(Math.floor(a1 - 3 - p[1]), Math.floor(zt - p[2])) : null) : (f === "y" ? tex0(Math.floor(p[0] - a0 - 3), Math.floor(zt - p[2])) : null);
    const back = col("2a1a10"), face = { top: col(C.ground), y: alongY ? back : col(C.ground), x: alongY ? col(C.ground) : back, edge: null, noLine: true, tex: faceTex };
    const prims = [B(a0 + 3, a1 - 3, mid - t, mid + t - .2, z0 + 3, z0 + Hh - 3, face),
        B(a0, a0 + 3, mid - t - .4, mid + t + .4, z0, z0 + Hh, FRAME), B(a1 - 3, a1, mid - t - .4, mid + t + .4, z0, z0 + Hh, FRAME), B(a0, a1, mid - t - .4, mid + t + .6, z0 + Hh - 3, z0 + Hh, FRAME), B(a0, a1, mid - t - .4, mid + t + .4, z0, z0 + 3, FRAME)];
    /* the poles run up through the frame's sides, so the stand and its feet stay on its own four tiles (9 Nov, his: a foot out on the next
       tile went under the rug there) */
    for (const s of [a0 + 1.5, a1 - 1.5]) {
        const c = alongY ? [mid, s] : [s, mid];
        prims.push(cyl(c[0], c[1], 1.1, 2, z0 + Hh + 6, POLE), ball(c[0], c[1], z0 + Hh + 7.5, 2, POLE));
        /* the foot: a short bar across the run, so it stands */
        prims.push(B(s - 1.4, s + 1.4, mid - 6, mid + 6, 0, 2, FRAME));
    }
    return render(prims);
}
module.exports = { wall, stand, portrait, landscape, PORTRAIT, LANDSCAPE, BRONZE, SLIP };
