/* Round three's art, in the hallway's projection. Separate renders get their own black outline, like the client's sprites. */
"use strict";
const fs = require("fs"), iso = require("./iso3d.js"), L = require("./lib.js"), { box, cyl, ball, M, render, col } = iso, R = L.R;
const H = require(R + "tools/hallway-editor/render/hw3.js").H;
const K = "000000";
/* the wall's own wood: the colours actually on the wainscot */
const WOOD = { top: col("7f5947"), y: col("593422"), x: col("452313"), ny: col("34180b"), nx: col("34180b"), edge: col("120704") };
const groove = (face, p) => { if (face === "x") return Math.floor(p[1] + 400) % 6 === 0 ? "34180b" : Math.floor(p[1] + 400) % 6 === 3 ? "593422" : "452313"; if (face === "y") return Math.floor(p[0] + 400) % 6 === 0 ? "452313" : "593422"; return null; };
const WOODG = { ...WOOD, tex: groove };
const RAIL = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704") };
const GOLD = M("f0d28a", "d6ad56", "a67f36", "3a2606"), GOLDB = { ramp: ["6e4c16", "a67f36", "d6ad56", "f0d28a", "fff4c8"], top: col("f0d28a"), edge: col(K) };
/* the Rooms' slate floor, sampled just as the rooms do it */
const slate = L.loadPng(R + "tools/hallway-editor/art/rooms/slate.png");
const mod = (a, b) => ((a % b) + b) % b;
const slateAt = (x, y, k = 1) => { const a = mod(x / 16, 2), b = mod(y / 16, 2), X = mod(Math.floor((a - b) * 16) + 32, 64), Y = mod(Math.floor((a + b) * 8) + 16, 32), p = (Y * 64 + X) * 4; return [slate.rgba[p] * k, slate.rgba[p + 1] * k, slate.rgba[p + 2] * k]; };

/* the real sign lettering: a set of "u,v" pixels */
let MIRROR = false; const setMirrorText = v => { MIRROR = v; };
function vol(s, font = "v") { const on = new Set(); let x = 0; for (const ch of s) { const g = H.VOL[font][ch] || H.VOL[font][" "]; g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") on.add((x + i - 1) + "," + (j - 2)); }); x += g.w; } if (!MIRROR) return on; const out = new Set(); for (const p of on) { const [u, v] = p.split(",").map(Number); out.add((x - 2 - u) + "," + v); } return out; }
const volW = (s, font = "v") => { let w = 0; for (const ch of s) w += (H.VOL[font][ch] || H.VOL[font][" "]).w; return w; };

/* ---- 17: the desk ---- */
function desk() {
    const W = 96, HT = 88, D = 16, gap = 16, cy1 = W - gap, ps = [];
    /* the recess floor is the Rooms' slate, right to the front */
    ps.push(box(-D - 2, 0, 0, W, -2, 0, { top: col("555"), x: col("2a2a2a"), y: col("2a2a2a"), edge: null, noLine: true, tex(f, p) { return f === "top" ? slateAt(p[0], p[1]) : null; } }));
    /* far reveal and back wall, in the wall's own wood and a plain plaster above */
    ps.push(box(-D, 0, -6, 0, 0, HT, { ...WOOD, y: col("452313") }));
    const backTex = (f, p) => { if (f !== "x") return null; if (p[2] < 34) return groove(f, p); if (p[2] < 36) return "93705a"; return p[2] > HT - 10 ? "3e2a1c" : "4a3324"; };
    ps.push(box(-D - 3, -D, -6, W + 4, 0, HT + 2, { ...WOOD, tex: backTex }));
    /* shelves flat on that back wall, running along it */
    const shelfZ = [40, 54, 68], cols = 6, cw = (W - 8) / cols;
    for (const z of shelfZ) ps.push(box(-D, -D + 5, 2, W - 2, z - 2, z, { top: col("93705a"), y: col("593422"), x: col("5f3f2e"), edge: col("120704") }));
    for (let i = 0; i <= cols; i++) { const y = 4 + i * cw; ps.push(box(-D, -D + 5, y - .8, y + .8, 38, HT - 8, { top: col("93705a"), y: col("593422"), x: col("5f3f2e"), edge: col("120704") })); }
    /* the counter, built in, with gold trim on its front */
    const front = (f, p) => { const z = p[2];
        if (f === "x") { if (z > 25 && z < 27) return "d6ad56"; if (z > 3 && z < 5) return "a67f36"; const u = mod(p[1] - 1, 16); if (u < 1.2) return "d6ad56"; if (z < 6 || z > 24) return "452313"; if (u < 2.4) return "34180b"; if (u > 14.8) return "593422"; if (z < 7 || z > 23) return z < 7 ? "593422" : "34180b"; return mod(Math.floor(p[1]), 6) === 0 ? "34180b" : "452313"; }
        if (f === "y") { if (z > 25 && z < 27) return "f0d28a"; if (z > 3 && z < 5) return "d6ad56"; return mod(Math.floor(p[0] + 40), 6) === 0 ? "452313" : "593422"; }
        return null; };
    ps.push(box(-8, 4, 0, cy1, 0, 28, { ...WOOD, tex: front }));
    ps.push(box(-10, 6, -1, cy1 + 1, 28, 31, { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704"), tex(f, p) { if (f === "x") return "d6ad56"; if (f === "y") return "d6ad56"; if (f === "top" && p[0] > 4) return "c49a48"; return null; } }));
    /* the surround */
    const pil = { ...WOOD, tex(f, p) { if (f === "x" && mod(p[1], 8) > 3 && mod(p[1], 8) < 5) return "d6ad56"; return null; } };
    ps.push(box(0, 3, -7, -1, 0, HT + 4, pil), box(0, 3, W + 1, W + 7, 0, HT + 4, pil), box(0, 2, 0, W, HT, HT + 4, WOOD));
    ps.push(box(0, 5, -8, W + 8, HT + 4, HT + 7, { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704") }));
    const t = "Lost Property", set = vol(t, "vb"), tw = volW(t, "vb"), SW = tw + 14, sy1 = W / 2 + SW / 2, z1 = HT + 26;
    ps.push(box(0, 3, sy1 - SW, sy1, HT + 7, z1, { top: col("d6ad56"), y: col("a67f36"), x: col("3b1c0c"), edge: col("120704"), tex(f, p) { if (f !== "x") return null; const u = Math.floor(sy1 - p[1]), v = Math.floor(z1 - p[2]); if (u < 1 || v < 1 || u >= SW - 1 || v >= z1 - HT - 8) return "d6ad56"; if (set.has((u - 7) + "," + (v - 5))) return "f0d28a"; return null; } }));
    const sprite = render(ps, { wall: { at: 0, inside: (y, z) => y > 0 && y < W && z >= 0 && z < HT } });
    return { sprite, W, D, shelfZ, cols, cw, gap };
}
function bell() { /* a reception bell: wood base, brass dome, button; its own black outline */
    const B = { ramp: ["7a5416", "a67f36", "d6ad56", "f0d28a", "fff4c8"], top: col("f0d28a"), edge: col(K) };
    return render([cyl(0, 0, 6.5, 0, 2, { ramp: ["2c1408", "4a2a14", "6a4020"], top: col("7f5947"), edge: col(K) }), cyl(0, 0, 5.5, 2, 3, B), ball(0, 0, 4, 5.5, B), cyl(0, 0, 1, 8, 10.5, B), ball(0, 0, 11, 1.6, { ramp: ["6e4c16", "d6ad56", "fff4c8"], edge: col(K) })], { crease: false });
}
function ledger() { /* an open ledger: red cover, two curved stacks of pages, ruled lines, a ribbon */
    const cover = M("8a1f22", "641015", "4a0a0e", K), page = (y0, y1) => ({ top: col("f7f0dc"), y: col("d8cfb6"), x: col("c6bc9f"), edge: col(K), tex(f, p) { if (f === "top") { const u = Math.floor(p[0] + 100); if (u % 3 === 0 && p[1] > y0 + 1.5 && p[1] < y1 - 1.5 && (Math.floor(p[1]) + Math.floor(u / 3) * 5) % 9 !== 0) return "6a6476"; } if (f === "x") return Math.floor(p[2] * 2) % 2 ? "d8cfb6" : "b5ab8e"; return null; } });
    return render([box(-9, 9, -13, 13, 0, 1.2, cover), box(-8, 8, -12, -.4, 1.2, 3.4, page(-12, -.4)), box(-8, 8, .4, 12, 1.2, 3.4, page(.4, 12)), box(-8, 8, -.4, .4, 1.2, 2.2, M("6a6476", "4a4656", "4a4656", K)), box(4, 11, -1, 0, 1.2, 3.6, M("c8352a", "a01d16", "8a1f16", K))], { crease: false });
}

/* ---- the key, lying on the floor: a proper bow, shank and bit, with thickness ---- */
function key(s = 1) {
    const B = M("f6e0a0", "c99f4c", "a67f36", K), ps = [], t = 2.6;
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; ps.push(box(-11 + Math.cos(a) * 5.5 - 1.1, -11 + Math.cos(a) * 5.5 + 1.1, Math.sin(a) * 5.5 - 1.1, Math.sin(a) * 5.5 + 1.1, 0, t, B)); }
    ps.push(box(-5.5, 13, -1, 1, 0, t, B), box(-7, -5, -2, 2, 0, t, B));   /* the shank, and a collar by the bow */
    ps.push(box(7, 9.5, 1, 5, 0, t, B), box(10.5, 13, 1, 6, 0, t, B));     /* the bit */
    return render(ps, { crease: false });
}

/* ---- the bookcase: the Area bookcase's look, kept tall, swinging on its far edge ---- */
function areaCase(k, pull = 0) {
    const W = 32, Hh = 62, Dp = 12, a = k * Math.PI / 2 * .92, rot = { rot: -a, px: 0, py: 0 }, ps = [];
    const stip = (f, p) => f === "top" ? ((Math.floor(p[0]) + Math.floor(p[1])) % 2 ? "d9caa4" : "c6b58c") : null;
    const FR = { top: col("d9caa4"), x: col("8f7c5a"), y: col("b09c76"), nx: col("6e5f44"), ny: col("7c6c4e"), edge: col(K), tex: stip };
    const IN = { top: col("7a6a4c"), x: col("54462f"), y: col("6a5a40"), nx: col("54462f"), ny: col("54462f"), edge: col("1a1408") };
    const LEG = { top: col("4a3a24"), x: col("33280f"), y: col("4a3a24"), nx: col("33280f"), ny: col("33280f"), edge: col(K) };
    for (const [x, y] of [[0, 1], [Dp - 3, 1], [0, W - 4], [Dp - 3, W - 4]]) ps.push(box(x, x + 3, y, y + 3, 0, 6, LEG, rot));
    ps.push(box(0, 1.5, 0, W, 6, Hh, { ...IN, nx: col("6e5f44"), tex(f, p) { if (f === "nx" || f === "ny") return Math.floor(p[1] + 40) % 8 === 0 ? "54462f" : "7c6c4e"; return null; } }, rot));
    ps.push(box(0, Dp, 0, 2.5, 6, Hh, FR, rot), box(0, Dp, W - 2.5, W, 6, Hh, FR, rot), box(0, Dp + .5, 0, W, Hh - 3, Hh, FR, rot), box(0, Dp + .5, 0, W, 6, 9, FR, rot));
    const shelves = [22, 37, 50]; for (const z of shelves) ps.push(box(0, Dp - .5, 2.5, W - 2.5, z - 2, z, { ...FR, tex: null, top: col("a8956e") }, rot));
    /* books: the Area's coloured spines on the top shelf, fewer below, and the blue one that moves */
    const cols = ["3a6ea5", "c47a2c", "8fb0c0", "c9a23f", "3f6f3a", "a03128", "dcdcd2", "6a3f8f", "28557e"];
    const row = (z, n0, n1, seed) => { let y = n0, n = seed; while (y < n1) { const w = 2.2 + (n * 5) % 2 * .8, h = 9 + (n * 7) % 3, blue = z === 37 && y > 12 && y < 15.5, pl = blue ? pull : 0, c = iso.col(blue ? "2fa8e8" : cols[n % cols.length]); ps.push(box(1.5, Dp - 3 + pl, y, y + w, z, z + h, { top: c.map(v => Math.min(255, v * 1.2)), x: c, y: c.map(v => v * .8), nx: c.map(v => v * .6), ny: c.map(v => v * .7), edge: col("0a0604") }, rot)); y += w + .3; n++; } };
    row(50, 3, W - 8, 1); row(37, 6, 22, 4); row(22, 14, W - 4, 7);
    /* the way through: lit from the far end */
    const glow = (f, p) => { const g = Math.max(0, Math.min(1, (p[2] - 6) / 44)) * .6 + .2, v = c => Math.round(c); return [v(62 + g * 170), v(34 + g * 100), v(16 + g * 36)]; };
    ps.push(box(-36, -30, -2, W + 2, 0, Hh + 4, { top: col("3a2010"), x: glow, y: glow, edge: null, noLine: true }));
    ps.push(box(-36, 0, -5, 0, 0, Hh + 4, { top: col("2a170a"), y: col("3b2312"), x: col("20110a"), edge: null, noLine: true }));
    ps.push(box(-36, 0, 0, W, -3, 0, { top: col("4a3a2a"), y: col("2a2015"), x: col("2a2015"), edge: null, noLine: true, tex(f, p) { return f === "top" ? slateAt(p[0], p[1], .8) : null; } }));
    return render(ps, { wall: { at: 0, inside: (y, z) => y > 0 && y < W && z < Hh + 4 && z >= 0 } });
}

/* ---- framed things: real sign lettering, a proper frame, glass ---- */
function framed(W0, Hh, z0, lines, o = {}) {
    const W = Math.max(W0, ...lines.map(([s, , , font]) => volW(s, font || "v") + 14));
    const y1 = W - 3, zt = z0 + Hh - 3, f = iso.col(o.face || "efe5c6");
    const prep = lines.map(([s, v, c, font]) => [vol(s, font || "v"), Math.round((W - 6 - volW(s, font || "v")) / 2), v, c]);
    const tex = (face, p) => { if (face !== "x") return null; const u = Math.floor(y1 - p[1]), v = Math.floor(zt - p[2]); for (const [set, u0, v0, c] of prep) if (set.has((u - u0) + "," + (v - v0))) return c; if (o.tex) { const t = o.tex(u, v); if (t) return t; } /* a streak of glass */ if (o.glass !== false && ((u - v * .9 + 400) % 46) < 2.5) return f.map(a => Math.min(255, a + 26)); return null; };
    const fr = o.frame || { top: col("f0d28a"), y: col("d6ad56"), x: col("a67f36"), edge: col(K) }, slip = { top: col("7f5947"), y: col("593422"), x: col("452313"), edge: col("120704") };
    return render([box(0, 1, 3, W - 3, z0 + 3, z0 + Hh - 3, { top: f, y: f, x: f, edge: null, noLine: true, tex }), box(0, 2.4, 0, 3, z0, z0 + Hh, fr), box(0, 2.4, W - 3, W, z0, z0 + Hh, fr), box(0, 3.2, 0, W, z0 + Hh - 3, z0 + Hh, fr), box(0, 2.4, 0, W, z0, z0 + 3, fr)]);
}
function hotelItems() {
    const out = {}, OAKF = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col(K) };
    out.bobba = framed(70, 44, 58, [["BOBBA", 12, "7a1b16", "vb"], ["Est. 2001", 26, "6e5a33"]]);
    out.theatre = framed(86, 40, 60, [["Theatredrome", 8, "ffffff", "vb"], [">> 2 floors up", 22, "ffd86a"]], { face: "24386a", frame: OAKF });
    out.bar = framed(90, 40, 60, [["The Dirty Duck", 8, "ffc25e", "vb"], ["Closed 2005", 22, "b8843f"]], { face: "1a0c06", frame: OAKF });
    out.back5 = framed(70, 38, 62, [["Back in 5", 7, "7a1b16", "vb"], ["since 2003", 21, "6e5a33"]], { frame: OAKF });
    out.poster = framed(44, 54, 50, [["BEWARE", 7, "7a1b16", "vb"], ["Always", 24, "191919"], ["check trades", 36, "191919"]], { face: "e9d27b" });
    out.map = framed(78, 56, 52, [["Hotel Plan", 6, "3a2110", "vb"]], { face: "d9c9a0", tex(u, v) { const a = u - 6, b = v - 19; if (a < 0 || b < 0 || a >= 60 || b >= 26) return null; const cx = a % 20, cy = b % 13, room = Math.floor(a / 20) + Math.floor(b / 13) * 3; if (cx === 19 || cy === 12) return null; if ((room === 1 || room === 3) && (Math.abs(cx - cy * 19 / 12) < 1 || Math.abs(19 - cx - cy * 19 / 12) < 1)) return "a01d16"; return room === 1 || room === 3 ? "b9a678" : "9f8e62"; } });
    /* the bricked-up doorway, in a proper oak frame with a hand-painted sign */
    { const Hh = 80, W = 60, bricks = (f, p) => { if (f !== "x") return null; const row = Math.floor(p[2] / 5), off = row % 2 ? 4 : 0, j = mod(p[2], 5) < 1 || mod(p[1] + off, 8) < 1; return j ? "4a4036" : ((Math.floor((p[1] + off) / 8) * 5 + row * 3) % 4 ? "7a3f2c" : "6a3526"); };
      const fr = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col(K) }, sign = vol("FREE", "vb"), sign2 = vol("CREDITS"), sw = 52, y1 = (W + sw) / 2, z1 = 62;
      out.freeDoor = render([box(-1, 1, 3, W - 3, 0, Hh - 3, { top: col("7a3f2c"), y: col("6a3526"), x: col("7a3f2c"), edge: null, tex: bricks }), box(0, 3.5, 0, 3.5, 0, Hh, fr), box(0, 3.5, W - 3.5, W, 0, Hh, fr), box(0, 4.5, -1, W + 1, Hh - 3, Hh + 1, fr), box(1, 3.5, y1 - sw, y1, 40, z1, { top: col("e8dcbc"), y: col("c9bd9c"), x: col("e8dcbc"), edge: col(K), tex(f, p) { if (f !== "x") return null; const u = Math.floor(y1 - p[1]), v = Math.floor(z1 - p[2]); if (sign.has((u - 14) + "," + (v - 4))) return "a01d16"; if (sign2.has((u - 6) + "," + (v - 14))) return "a01d16"; return null; } })]); }
    /* the cleaning bot's cupboard: a dented steel door in an oak frame */
    { const Hh = 76, W = 50, set = vol("BOT", "vb"), set2 = vol("ONLY", "vb"), fr = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col(K) };
      out.botDoor = render([box(0, 1.5, 3, W - 3, 0, Hh - 3, { top: col("aab4bf"), y: col("6c7988"), x: col("8693a1"), edge: null, tex(f, p) { if (f !== "x") return null; const u = Math.floor(W - 6 - p[1]), v = Math.floor(Hh - 12 - p[2]); if (set.has((u - 5) + "," + (v - 2)) || set2.has((u - 3) + "," + (v - 13))) return "ffd86a"; if ((Math.floor(p[2]) === 30 || Math.floor(p[2]) === 6)) return "5a6878"; return Math.floor(p[2]) === 31 ? "b6c0ca" : null; } }), box(0, 3.5, 0, 3.5, 0, Hh, fr), box(0, 3.5, W - 3.5, W, 0, Hh, fr), box(0, 4.5, -1, W + 1, Hh - 3, Hh + 1, fr), box(1.5, 3.5, 6, 8, 32, 38, GOLD)]); }
    /* the rare's case: a walnut plinth with a gold plate, thick glass with its far edges showing */
    { const grain = (f, p) => { const along = f === "x" ? p[1] : p[0], z = p[2], w = Math.sin(along * .55 + z * .2) * .9, g = ((z * 1.7 + w) % 3 + 3) % 3, top = f === "top"; if (top) { const gg = ((p[1] * 1.3 + Math.sin(p[0] * .5)) % 3 + 3) % 3; return gg < .7 ? "5e3820" : gg > 2.4 ? "8a5a36" : null; } if (g < .55) return f === "x" ? "331c0e" : "44261a"; if (g > 2.5) return f === "x" ? "4f2e1a" : "6a4028"; return null; };
      const WAL = { top: col("7a4a2c"), y: col("5a3320"), x: col("432514"), edge: col(K), tex: grain }, gt = { top: col("7e5032"), y: col("603822"), x: col("4a2a18"), edge: col(K), tex: grain };
      out.caseBase = render([box(-2, 26, -2, 26, 0, 3, WAL), box(0, 24, 0, 24, 3, 18, { ...WAL, tex(f, p) { const z = p[2]; if (z < 5 || z > 16) return null; const a = f === "x" ? p[1] : p[0]; if (a < 2.5 || a > 21.5) return null; if (z < 6 || a < 3.5) return f === "x" ? "33200f" : "432514"; if (f === "x" && z > 8 && z < 13 && a > 8 && a < 16) return z > 11.5 || a < 9 ? "fff0c0" : "d6ad56"; return null; } }), box(-1.5, 25.5, -1.5, 25.5, 18, 20, gt)]);
      out.caseFar = render([box(2, 3.2, 2, 3.2, 20, 58, gt), box(20.8, 22, 2, 3.2, 20, 58, gt), box(2, 3.2, 20.8, 22, 20, 58, gt)], { crease: false });
      const glass = { top: col("dff2ff"), y: col("bfe4f8"), x: col("a8d4ee"), edge: null, noLine: true };
      out.caseGlass = render([box(2, 22, 2, 22, 20, 58, glass)], { crease: false });
      out.caseNear = render([box(20.8, 22, 20.8, 22, 20, 58, gt), box(1, 23, 1, 23, 58, 60, gt), box(10, 14, 10, 14, 55.5, 58, { top: col("fff3c8"), y: col("fff3c8"), x: col("f6e2a8"), edge: col(K) })], { crease: false }); }
    /* an old mahogany trophy cabinet: pediment, moulded cornice, glazed doors, turned feet, green baize */
    { const W = 40, Hh = 72, D = 13, MAH = { top: col("8a4f2c"), y: col("6a3a1e"), x: col("4f2a14"), edge: col(K), tex(f, p) { const a = f === "x" ? p[1] : p[0]; if (f === "x" || f === "y") { if (mod(a * 1.3 + p[2] * .2, 7) < .9) return f === "x" ? "442310" : "5a3018"; } return null; } }, BAIZE = { top: col("2a5a36"), y: col("1f4a2c"), x: col("1f4a2c"), edge: null, noLine: true }, F = { top: col("9a5f38"), y: col("7a4526"), x: col("5e3218"), edge: col(K) };
      const ps = [box(-1, 1, 2, W - 2, 8, Hh - 8, BAIZE), box(0, D, 0, 3, 8, Hh - 8, MAH), box(0, D, W - 3, W, 8, Hh - 8, MAH), box(0, D, 0, W, 4, 8, MAH), box(0, D + 2, -1, W + 1, Hh - 8, Hh - 5, F), box(0, D + 3, -2, W + 2, Hh - 5, Hh - 3, M("b8784c", "8a5230", "6a3a1e", K))];
      /* a swan-neck pediment, stepped */
      for (let i = 0; i < 4; i++) ps.push(box(0, 8, 4 + i * 3, W - 4 - i * 3, Hh - 3 + i * 2.5, Hh - 3 + (i + 1) * 2.5, F));
      ps.push(box(0, D - 1, 3, W - 3, 34, 36, F));
      for (const [x, y] of [[1, 1], [D - 3, 1], [1, W - 3], [D - 3, W - 3]]) ps.push(cyl(x + 1, y + 1, 2, 0, 4, { ramp: ["33180a", "5e3218", "9a5f38"], top: col("5e3218"), edge: col(K) }));
      out.cabinet = render(ps);
      const dF = { top: col("9a5f38"), y: col("7a4526"), x: col("5e3218"), edge: col(K) };
      out.cabDoors = render([box(D, D + 1.2, 3, 5, 8, Hh - 8, dF), box(D, D + 1.2, W / 2 - 1, W / 2 + 1, 8, Hh - 8, dF), box(D, D + 1.2, W - 5, W - 3, 8, Hh - 8, dF), box(D, D + 1.2, 3, W - 3, 8, 10, dF), box(D, D + 1.2, 3, W - 3, Hh - 10, Hh - 8, dF), box(D, D + 1.2, 3, W - 3, 33, 36, dF), box(D + 1, D + 2, W / 2 - 3, W / 2 - 1.5, 36, 42, GOLD)]);
      out.cabGlass = render([box(D, D + .4, 3, W - 3, 8, Hh - 8, { top: col("dff2ff"), y: col("dff2ff"), x: col("cfeaff"), edge: null, noLine: true })], { crease: false }); }
    /* a framed shelf of ducks: a shallow oak box on the wall */
    { const W = 80, Hh = 26, z0 = 62, F = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col(K) };
      out.duckBox = render([box(-1, 1, 3, W - 3, z0 + 3, z0 + Hh - 3, { top: col("3a2416"), y: col("2a180b"), x: col("3a2416"), edge: null }), box(0, 7, 0, 3, z0, z0 + Hh, F), box(0, 7, W - 3, W, z0, z0 + Hh, F), box(0, 7, 0, W, z0 + Hh - 3, z0 + Hh, F), box(0, 7.5, -1, W + 1, z0, z0 + 3, { ...F, top: col("c49a48") })]); }
    return out;
}

/* ---- round pipes with proper joints ---- */
const shade4 = (c) => (f, p, tz, ax) => null;
function pipeY(x, z, r, y0, y1, c) { const tone = v => v > .72 ? c[0] : v > .42 ? c[1] : v > .15 ? c[2] : c[3]; return [box(x - r, x + r, y0, y1, z - r, z + r, { top: col(c[1]), x: col(c[2]), y: col(c[1]), ny: col(c[2]), edge: col(c[4]), tex(f, p) { if (f === "x") return tone((p[2] - (z - r)) / (2 * r)); if (f === "top") return tone(1 - (p[0] - (x - r)) / (2 * r) * .55); return null; } })]; }
function pipeX(y, z, r, x0, x1, c) { const tone = v => v > .72 ? c[0] : v > .42 ? c[1] : v > .15 ? c[2] : c[3]; return [box(x0, x1, y - r, y + r, z - r, z + r, { top: col(c[1]), y: col(c[1]), x: col(c[2]), edge: col(c[4]), tex(f, p) { if (f === "y") return tone((p[2] - (z - r)) / (2 * r)); if (f === "top") return tone(1 - (p[1] - (y - r)) / (2 * r) * .55); return null; } })]; }
const riser = (x, y, r, z0, z1, c) => [cyl(x, y, r, z0, z1, { ramp: [c[3], c[2], c[1], c[0]], top: col(c[1]), edge: col(c[4]) })];
const joint = (x, y, z, r, c) => [box(x - r, x + r, y - r, y + r, z - r, z + r, { top: col(c[0]), y: col(c[1]), x: col(c[2]), edge: col(c[4]) })];
const STEEL = ["dfe5ea", "aab2ba", "7a838c", "4c545c", "1a1e22"], COPPER = ["f2b47c", "c9824a", "96582c", "6a3a1a", "2a1608"], IRON = ["8e8a80", "6a665e", "4c4942", "33312c", "16140f"];

/* ---- the staff corridor, a whole room built in one go so floor, walls and pipes all belong together ---- */
function staffRoom(opt = {}) {
    const LX = 96, LY = 224, WH = 112, ps = [];
    /* the walls: the Rooms' stone, lower half painted, a dark skirting, riveted plates */
    const stone = (u, z, k) => { const row = Math.floor(z / 8), off = row % 2 ? 12 : 0, a = mod(u + off, 24); if (mod(z, 8) < 1 || a < 1) return [38 * k, 36 * k, 34 * k]; const n = (Math.floor((u + off) / 24) * 7 + row * 3) % 5; const t = [78, 84, 74, 88, 70][n]; return [t * k, t * .97 * k, t * .92 * k]; };
    const wallTex = (u, z, k) => { if (z < 4) return [20 * k + 4, 18 * k + 4, 17 * k + 4]; if (z < 8) return [46 * k, 42 * k, 40 * k]; if (z < 9) return [24, 20, 18]; if (z < 40) { const pl = mod(u, 32); if (pl < 1) return [26 * k, 30 * k, 30 * k]; if ((pl < 3 || pl > 30) && (mod(z - 9, 10) < 1.2)) return [150 * k, 156 * k, 150 * k]; return [64 * k, 76 * k, 74 * k]; } if (z < 42) return [34, 30, 28]; if (z < 43) return [104 * k, 100 * k, 94 * k]; if (z >= WH - 2) return [120 * k, 116 * k, 108 * k]; return stone(u, z, k); };
    ps.push(box(-6, 0, -6, LY, 0, WH, { top: col("78746c"), x: (f, p) => wallTex(p[1] + 6, p[2], 1), y: col("3a3834"), edge: null, noLine: true, tex: null }));
    ps.push(box(0, LX, -6, 0, 0, WH, { top: col("78746c"), y: (f, p) => wallTex(p[0], p[2], .74), x: col("3a3834"), edge: null, noLine: true }));
    /* the floor */
    ps.push(box(0, LX, 0, LY, -8, 0, { top: (f, p) => slateAt(p[0], p[1]), x: col("262626"), y: col("3a3a3a"), edge: null, noLine: true }));
    /* ---- pipes that go somewhere ----
       A steel main comes out of the end wall, runs along the back wall, drops into the boiler. Copper leaves the boiler, climbs, runs back and goes through the end wall. */
    ps.push(...pipeY(5, 94, 2.5, 0, 180, STEEL), ...joint(5, 2, 94, 4, STEEL), ...joint(5, 180, 94, 3.5, STEEL), ...riser(5, 180, 2.5, 46, 94, STEEL));
    ps.push(...pipeY(5, 84, 2.5, 0, 150, COPPER), ...joint(5, 2, 84, 4, COPPER), ...joint(5, 150, 84, 3.5, COPPER), ...riser(5, 150, 2.5, 46, 84, COPPER));
    for (let y = 16; y < 150; y += 32) ps.push(box(0, 8, y, y + 2, 79, 99, M("4c4942", "3e3b36", "2c2a26", "16140f")));
    ps.push(box(0, 8, 176, 178, 89, 99, M("4c4942", "3e3b36", "2c2a26", "16140f")));
    /* the boiler the pipes feed, with a gauge and a hatch */
    const steelTex = (f, p) => { if (f === "x") { const u = p[1], z = p[2]; if (Math.hypot(u - 166, z - 34) < 6.5) return Math.hypot(u - 166, z - 34) > 5.3 ? "2a2e32" : (Math.abs((u - 166) + (z - 34)) < .9 && z > 34 ? "b22a1e" : "f4f2e6"); if (u > 144 && u < 158 && z > 8 && z < 26) return (z < 9 || z > 25 || u < 145 || u > 157) ? "2a2e32" : mod(z, 4) < 1 ? "4c545c" : "6a727a"; if (mod(u, 28) < 1) return "4c545c"; if (mod(z - 2, 16) < 1) return "5a6268"; } return null; };
    ps.push(box(0, 16, 140, 192, 0, 46, { top: col("8d959d"), y: col("7a838c"), x: col("6a727a"), edge: col("16181a"), tex: steelTex }));
    ps.push(box(0, 18, 138, 194, 0, 4, M("4c4942", "3e3b36", "2c2a26", "16140f")));
    /* a square duct along the top of the end wall and into a vent box; louvred vents; a fan unit */
    const galv = (f, p) => { if (f === "y") return mod(p[0], 16) < 1 ? "6a727a" : null; if (f === "x") return mod(p[1], 16) < 1 ? "6a727a" : null; return null; };
    ps.push(box(0, 72, 0, 14, 96, 110, { top: col("b4bcc4"), y: col("98a0a8"), x: col("7a838c"), edge: col("1a1e22"), tex: galv }));
    ps.push(box(72, 84, -2, 16, 92, 112, { top: col("b4bcc4"), y: col("98a0a8"), x: col("7a838c"), edge: col("1a1e22") }));
    const louvre = (axis) => (f, p) => { if (f !== axis) return null; return mod(p[2], 3) < 1 ? "1c2024" : mod(p[2], 3) < 2 ? "8d959d" : "6a727a"; };
    ps.push(box(0, 2, 40, 64, 52, 68, { top: col("b4bcc4"), y: col("7a838c"), x: col("8d959d"), edge: col("1a1e22"), tex: louvre("x") }));
    ps.push(box(0, 2, 96, 120, 52, 68, { top: col("b4bcc4"), y: col("7a838c"), x: col("8d959d"), edge: col("1a1e22"), tex: louvre("x") }));
    ps.push(box(30, 56, 0, 2, 50, 66, { top: col("b4bcc4"), y: col("8d959d"), x: col("7a838c"), edge: col("1a1e22"), tex: louvre("y") }));
    /* an air unit on the back wall: a box with a round fan behind a grille, and its cable tray */
    const fanTex = (f, p) => { if (f !== "x") return null; const u = p[1] - 202, v = p[2] - 62, d = Math.hypot(u, v); if (d < 12) { if (d > 11) return "1c2024"; if (Math.abs(u) < .7 || Math.abs(v) < .7) return "8d959d"; return mod(d, 3) < 1 ? "8d959d" : "23272b"; } return null; };
    ps.push(box(0, 12, 188, 216, 46, 78, { top: col("b4bcc4"), y: col("8d959d"), x: col("8d959d"), edge: col("1a1e22"), tex: fanTex }));
    /* a floor grate */
    ps.push(box(50, 66, 96, 128, -.2, .2, { top: (f, p) => mod(p[0], 3) < 1 || mod(p[1], 3) < 1 ? [30, 30, 30] : [90, 94, 96], x: col("222"), y: col("222"), edge: col("111111") }));
    /* an electrical cabinet with a warning triangle */
    const warn = (f, p) => { if (f !== "x") return null; const u = p[1] - 76, z = p[2] - 50; if (Math.abs(u) <= 8 - z * .62 && z >= 0 && z < 13) return (Math.abs(u) <= 6 - z * .62 && z >= 1.4 && z < 10) ? (Math.abs(u) < 1 && ((z > 4 && z < 9) || (z > 2 && z < 3.4)) ? "111111" : "f0c830") : "111111"; return null; };
    ps.push(box(0, 7, 60, 92, 8, 72, { top: col("8d959d"), y: col("5a6268"), x: col("6c7480"), edge: col("16181a"), tex: warn }));
    ps.push(box(7, 8, 88, 90, 36, 44, GOLD));
    /* conduit from the cabinet up to the duct */
    ps.push(...riser(4, 72, 1.3, 72, 96, IRON), ...riser(4, 84, 1.3, 72, 80, IRON));
    /* a dark panel of stained wall where the old pipe was */
    return { sprite: render(ps, { crease: false, light: opt.light, depthEdge: opt.depthEdge }), LX, LY, WH };
}

/* ---- five industrial lights ---- */
function lights() {
    const G = M("dfe5ea", "aab2ba", "7a838c", K), DK = M("565c62", "3c4248", "2a2e32", K), GL = { top: col("fff8d8"), y: col("ffe9a8"), x: col("f4cf74"), edge: col(K), noLine: true };
    const out = {};
    /* 1: bulkhead, an oval cage on the wall */
    { const ps = [box(0, 2, -9, 9, 62, 76, DK), box(1, 6, -6, 6, 64, 74, GL)]; for (const y of [-6, -2, 2, 6]) ps.push(box(5, 7.2, y - .6, y + .6, 62, 76, DK)); ps.push(box(5, 7.2, -8, 8, 68.5, 69.5, DK)); out.bulkhead = { name: "Bulkhead", s: render(ps), glow: [3, 0, 69] }; }
    /* 2: enamel pendant, hanging, with a wide green shade */
    { const ps = [cyl(10, 0, .7, 64, 118, M("222", "111", "111", K))]; for (let i = 0; i < 6; i++) ps.push(cyl(10, 0, 2 + i * 1.5, 70 - i * 2, 72.2 - i * 2, { ramp: ["1f3a2a", "2a5a3e", "3a7a54", "5a9a74"], top: col("3a7a54"), edge: i === 5 ? col(K) : null, noLine: true })); ps.push(ball(10, 0, 58, 2.6, { ramp: ["f4cf74", "ffe9a8", "fff8d8"], edge: null })); out.pendant = { name: "Enamel pendant", s: render(ps, { crease: false }), glow: [10, 0, 54] }; }
    /* 3: a fluorescent batten along the wall */
    { out.batten = { name: "Strip light", s: render([box(0, 3, -20, 20, 70, 74, M("c8ccd0", "a8acb0", "8a8e92", K)), box(3, 5, -18, 18, 70.5, 73.5, { top: col("ffffff"), y: col("eef8ff"), x: col("dcf0ff"), edge: col("2a2e32"), noLine: true })]), glow: [4, 0, 86] }; }
    /* 4: a caged bulb on a bracket arm */
    { const ps = [box(0, 2, -3, 3, 70, 82, DK), box(2, 12, -1, 1, 78, 80, DK), cyl(12, 0, 2.2, 75, 80, DK), ball(12, 0, 71, 3.4, { ramp: ["f4cf74", "ffe9a8", "fff8d8"], edge: col("2a2e32") })]; for (let a = 0; a < 6; a++) { const r = 5; ps.push(box(12 + Math.cos(a) * r - .5, 12 + Math.cos(a) * r + .5, Math.sin(a) * r - .5, Math.sin(a) * r + .5, 65, 75, M("565c62", "3c4248", "2a2e32", K))); } ps.push(cyl(12, 0, 5.4, 65, 66, DK)); out.caged = { name: "Caged bracket", s: render(ps, { crease: false }), glow: [12, 0, 71] }; }
    /* 5: a work lamp on a tripod, standing on the floor */
    { const ps = []; for (const [dx, dy] of [[7, 0], [-4, 6], [-4, -6]]) for (let i = 0; i < 12; i++) { const t = i / 12; ps.push(box(16 + dx * (1 - t) - .8, 16 + dx * (1 - t) + .8, 16 + dy * (1 - t) - .8, 16 + dy * (1 - t) + .8, i * 3, i * 3 + 3.2, M("f0c830", "c49a18", "967410", K))); } ps.push(cyl(16, 16, 1, 34, 52, M("565c62", "3c4248", "2a2e32", K))); ps.push(box(13, 22, 11, 21, 50, 59, M("f0c830", "c49a18", "967410", K)), box(22, 23, 12, 20, 51, 58, { top: col("fff8d8"), y: col("fff8d8"), x: col("ffffff"), edge: col(K), noLine: true, tex(f, p) { if (f === "x" && (Math.floor(p[1]) % 3 === 0 || Math.floor(p[2]) % 3 === 0)) return "c49a18"; return null; } }), box(13, 23, 15.5, 16.5, 59, 62, M("565c62", "3c4248", "2a2e32", K))); out.work = { name: "Work lamp", s: render(ps, { crease: false }), glow: [25, 16, 56], floor: true }; }
    return out;
}

/* ---- windows: wall-coloured frame, a width, and a bottom and top you can drag ---- */
function hallWindow(W, bottom = 0, top = 78) {
    const FR = { top: col("93705a"), y: col("593422"), x: col("452313"), ny: col("34180b"), nx: col("34180b"), edge: col("120704") }, G2 = M("e8c77a", "c49a48", "86601f", "2c1c06");
    const ps = [], Hh = top, b = bottom, bars = Math.max(1, Math.round(W / 26));
    ps.push(box(-10, 0, -3, 0, b, Hh, { ...FR, y: col("593422") }));                                              /* the wall's depth, on the far side */
    ps.push(box(-10, 5, -1, W + 1, b - (b ? 2 : 0) - 1, b + 2, { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704") }));   /* the sill */
    ps.push(box(0, 3.5, -4, 1, b, Hh + 3, { ...FR, tex: groove }), box(0, 3.5, W - 1, W + 4, b, Hh + 3, { ...FR, tex: groove }));
    ps.push(box(0, 5, -5, W + 5, Hh, Hh + 4, { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704") }));
    ps.push(box(-3, -1, 1, 2, b + 2, Hh, G2), box(-3, -1, W - 2, W - 1, b + 2, Hh, G2), box(-3, -1, 1, W - 1, Hh - 2, Hh, G2), box(-3, -1, 1, W - 1, b + 2, b + 4, G2));
    for (let i = 1; i <= bars; i++) { const y = W * i / (bars + 1); ps.push(box(-5, -3, y - 1, y + 1, b + 2, Hh, FR)); }
    const rails = Hh - b > 90 ? [b + (Hh - b) * .33, b + (Hh - b) * .66] : [b + (Hh - b) * .55];
    for (const z of rails) ps.push(box(-5, -3, 1, W - 1, z - 1, z + 1, FR));
    return { sprite: render(ps, { wall: { at: 0, inside: (y, z) => y > 0 && y < W && z >= b && z < Hh } }), W, b, Hh, bars, rails };
}
/* a little loose dado panel: one board swung out a touch on its left */
function loosePanel() { const WD = { top: col("7f5947"), y: col("593422"), x: col("452313"), nx: col("34180b"), ny: col("34180b"), edge: col("120704"), tex: groove }; return render([box(0, 1.6, 0, 14, 6, 41, WD, { rot: .07, px: 0, py: 14 })], { wall: { at: -1, inside: () => false } }); }

module.exports = { setMirrorText, desk, bell, ledger, key, areaCase, framed, hotelItems, staffRoom, lights, hallWindow, loosePanel, vol, volW, slateAt, WOOD, groove, GOLD };
