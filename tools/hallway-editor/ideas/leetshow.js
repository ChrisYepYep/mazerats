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
const C = { ground: "4a1028", ray: "561430", rayDk: "3e0c22", edge: "2a0716", gold: "e6c072", goldLt: "fbe6a8", goldDk: "a67f36", shadow: "1a0510", cream: "f1e2c0", purple: "7a4ad0", purpleDk: "4f2c94", purpleLt: "a27ff0", white: "f6f0ff" };

/* lettering: a set of "u,v" pixels, optionally twice as tall */
function letters(s, font, tall) { const on = new Set(); for (const k of A.vol(s, font)) { const [x, y] = k.split(",").map(Number); if (tall) { on.add(x + "," + ((y - 2) * 2)); on.add(x + "," + ((y - 2) * 2 + 1)); } else on.add(x + "," + (y - 2)); } return { on, w: A.volW(s, font) }; }
/* the poster itself, W by H: a function from (u across, v down) to a colour */
function art(W, H, lines, band) {
    const placed = lines.map(([s, font, tall, v, colour, shadow]) => { const t = letters(s, font, tall); return { ...t, u0: Math.round((W - t.w) / 2) + 1, v0: v, colour, shadow }; });
    const bt = band && letters(band[0], band[1], false), bandTop = band ? H - 14 : H;
    return (u, v) => {
        if (u < 0 || v < 0 || u >= W || v >= H) return null;
        /* the gold rule round the edge, a dark line inside it */
        const e = Math.min(u, v, W - 1 - u, H - 1 - v); if (e === 0) return C.edge; if (e === 2) return C.gold; if (e === 3) return C.edge;
        if (band && v >= bandTop && e > 3) {
            /* the purple band along the foot, its lettering centred */
            if (v === bandTop) return C.purpleLt; if (v === H - 5) return C.purpleDk;
            const bu = u - Math.round((W - bt.w) / 2) - 1, bv = v - bandTop - 2; if (bt.on.has(bu + "," + bv)) return C.white; if (bt.on.has((bu - 1) + "," + (bv - 1)) || bt.on.has(bu + "," + (bv - 1))) return C.purpleDk;
            return C.purple;
        }
        for (const t of placed) { const x = u - t.u0, y = v - t.v0; if (t.on.has(x + "," + y)) return y < 2 ? C.goldLt : t.colour; if (t.shadow && t.on.has((x - 1) + "," + (y - 1))) return C.shadow; }
        /* the sunburst, rising from behind the title, and a darker edge to the sheet */
        const cx = W / 2, cy = H * .42, a = Math.atan2(v - cy, u - cx), ray = Math.floor((a + Math.PI) / (Math.PI * 2) * 24) & 1, r = Math.hypot((u - cx) / W, (v - cy) / H);
        if (e === 1) return C.rayDk;
        return r > .52 ? C.rayDk : ray ? C.ray : C.ground;
    };
}
/* a deco rule: a line with a diamond in the middle */
function withRule(f, W, v0, plain) { return (u, v) => { const d = Math.abs(u - (W - 1) / 2); if (!plain && v >= v0 - 2 && v <= v0 + 2 && d + Math.abs(v - v0) <= 2) return d + Math.abs(v - v0) <= 1 ? C.goldLt : C.gold; if (v === v0 && (plain || d > 4) && d < W / 2 - 7) return C.goldDk; return f(u, v); }; }
const PORTRAIT = { W: 50, H: 76 }, LANDSCAPE = { W: 90, H: 48 }, SMALL = { W: 46, H: 76, twitch: "v" };
const portrait = (P = PORTRAIT) => withRule(art(P.W, P.H, [["THE", "v", false, 6, C.gold, true], ["LEET", "vb", true, 15, C.gold, true], ["SHOW", "vb", true, 31, C.gold, true], ["LIVE ON", "v", false, P.H - 23, C.cream, false]], ["TWITCH", P.twitch || "vb"]), P.W, 48);
const landscape = () => withRule(art(LANDSCAPE.W, LANDSCAPE.H, [["THE", "v", false, 5, C.gold, true], ["LEET SHOW", "vb", true, 13, C.gold, true]], ["LIVE ON TWITCH", "v"]), LANDSCAPE.W, 30, true);
/* the poster on the wall in a bronze frame: the wall item's own way of drawing, face "x" (the hallway's framed signs) */
function wall(which) {
    const P = which === "landscape" ? LANDSCAPE : PORTRAIT, tex0 = which === "landscape" ? landscape() : portrait(), W = P.W + 6, Hh = P.H + 6, z0 = which === "landscape" ? 58 : 46, y1 = W - 3, zt = z0 + Hh - 3;
    const face = { top: col(C.ground), y: col(C.ground), x: col(C.ground), edge: null, noLine: true, tex: (f, p) => f === "x" ? tex0(Math.floor(y1 - p[1]), Math.floor(zt - p[2])) : null };
    return render([box(0, 1, 3, W - 3, z0 + 3, z0 + Hh - 3, face), box(0, 2.4, 0, 3, z0, z0 + Hh, FRAME), box(0, 2.4, W - 3, W, z0, z0 + Hh, FRAME), box(0, 3.2, 0, W, z0 + Hh - 3, z0 + Hh, FRAME), box(0, 2.4, 0, W, z0, z0 + 3, FRAME)]);
}
/* the poster stand: the poster in its bronze frame between two thin bronze poles, each on a little foot and topped with a ball.
   It stands across two tiles. alongY: the run goes along y and the poster faces +x; otherwise along x, facing +y. The origin is the far
   corner of the first tile (hw3 draws it from there, as the trophy cabinet). */
function stand(alongY) {
    const P = SMALL, tex0 = portrait(SMALL), W = P.W + 6, Hh = P.H + 6, z0 = 8, L = 32, mid = 8, t = 1.2, a0 = (L - W) / 2, a1 = a0 + W, zt = z0 + Hh - 3;
    /* in the run's own frame: s along it, d across it (the poster's facing side is +d) */
    const B = (s0, s1, d0, d1, za, zb, m) => alongY ? box(d0, d1, s0, s1, za, zb, m) : box(s0, s1, d0, d1, za, zb, m);
    const faceTex = (f, p) => alongY ? (f === "x" ? tex0(Math.floor(a1 - 3 - p[1]), Math.floor(zt - p[2])) : null) : (f === "y" ? tex0(Math.floor(p[0] - a0 - 3), Math.floor(zt - p[2])) : null);
    const back = col("2a1a10"), face = { top: col(C.ground), y: alongY ? back : col(C.ground), x: alongY ? col(C.ground) : back, edge: null, noLine: true, tex: faceTex };
    const prims = [B(a0 + 3, a1 - 3, mid - t, mid + t - .2, z0 + 3, z0 + Hh - 3, face),
        B(a0, a0 + 3, mid - t - .4, mid + t + .4, z0, z0 + Hh, FRAME), B(a1 - 3, a1, mid - t - .4, mid + t + .4, z0, z0 + Hh, FRAME), B(a0, a1, mid - t - .4, mid + t + .6, z0 + Hh - 3, z0 + Hh, FRAME), B(a0, a1, mid - t - .4, mid + t + .4, z0, z0 + 3, FRAME)];
    for (const s of [a0 - 1.6, a1 + 1.6]) {
        const c = alongY ? [mid, s] : [s, mid];
        prims.push(cyl(c[0], c[1], 1.1, 2, z0 + Hh + 6, POLE), ball(c[0], c[1], z0 + Hh + 7.5, 2, POLE));
        /* the foot: a short bar across the run, so it stands */
        prims.push(B(s - 1.4, s + 1.4, mid - 6, mid + 6, 0, 2, FRAME));
        /* a bracket from the pole to the frame, top and bottom */
        for (const z of [z0 + 6, z0 + Hh - 7]) prims.push(B(Math.min(s, s < a0 ? a0 : a1), Math.max(s, s < a0 ? a0 : a1), mid - .6, mid + .6, z, z + 1.4, FRAME));
    }
    return render(prims);
}
module.exports = { wall, stand, portrait, landscape, PORTRAIT, LANDSCAPE, BRONZE };
