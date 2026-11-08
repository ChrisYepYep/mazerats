/* Round five's art. Pixel-placed where it's small, ray-cast where it's big, every colour taken from something already on the map. */
"use strict";
const fs = require("fs"), iso = require("./iso3d.js"), L = require("./lib.js"), A = require("./art.js"), A4 = require("./art4.js"), { box, cyl, ball, M, render, col } = iso, R = L.R, H = R + "tools/hallway-editor/";
const W3 = require(H + "render/hw3.js");
const K = "000000", mod = (a, b) => ((a % b) + b) % b;
const { slateAt, vol, volW } = A;
const hash2 = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
/* wood grain: long streaks of three close tones, an occasional darker line */
const grain = (along, across, tones, dark) => { const row = Math.floor(across), seg = Math.floor((along + hash2(row, 7) % 23) / 13), h = hash2(row, seg); if (h % 17 === 0) return dark; return tones[h % tones.length]; };
const stamp = (rows, pal, ox, oy) => { const h = rows.length, w = rows[0].length, rgba = new Uint8ClampedArray(w * h * 4); rows.forEach((r, j) => { for (let i = 0; i < w; i++) if (r[i] !== ".") { const c = col(pal[r[i]]), q = (j * w + i) * 4; rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; rgba[q + 3] = 255; } }); return { w, h, ox: ox === undefined ? w >> 1 : ox, oy: oy === undefined ? h - 1 : oy, rgba }; };

/* the globe lamp's own bronze */
const BZ = { W: "eed09c", h: "c49660", l: "ab7a44", L: "8c5c30", d: "6e4524", s: "54321a", P: "3a2110" };
/* the wainscot exactly as it is on a normal wall, row by row, measured off the map */
const dado = (u, z) => { if (z < 3) return "34180b"; if (z < 4) return "452313"; if (z < 5) return K; if (z < 32) return mod(Math.floor(u), 4) === 3 ? "593422" : "452313"; if (z < 34) return "34180b"; if (z < 35) return K; if (z < 36) return "593422"; if (z < 37) return "34180b"; if (z < 38) return "634235"; return null; };
const lift = (hex, k) => col(hex).map(v => Math.min(255, Math.round(v * k)));

/* ---- 17: the desk ---- */
function desk() {
    const W = 96, HT = 96, D = 40, cy1 = W - 16, ps = [];
    ps.push(box(-D - 2, 0, -2, W, -.05, 0, { top: col("555"), x: col("555"), y: col("555"), edge: null, noLine: true, tex(f, p) { return f === "top" ? slateAt(p[0], p[1]) : null; } }));
    const upper = (f) => f === "x" ? "45342d" : "5a4438";
    const wallTex = (f, p) => { if (f === "x") return dado(p[1], p[2]) || upper(f); if (f === "y") { const d = dado(p[0], p[2]); return d ? lift(d, 1.28) : upper(f); } return null; };
    ps.push(box(-D - 3, -D, -6, W + 4, 0, HT + D + 8, { top: col("7f5947"), x: col("452313"), y: col("593422"), edge: col("120704"), tex: wallTex }));
    ps.push(box(-D, 0, -6, 0, 0, HT + D + 8, { top: col("7f5947"), x: col("452313"), y: col("593422"), edge: col("120704"), tex: wallTex }));
    const shelfZ = [42, 56, 70], SH = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704"), tex(f, p) { if (f === "top") return grain(p[0] + 40, p[1], ["93705a", "8d6a54", "997660"], "7f5947"); return null; } }, X0 = -D + 2, X1 = -6;
    for (const z of [...shelfZ, 84]) ps.push(box(X0, X1, 0, 7, z - 2, z, SH));
    for (const x of [X0, X0 + 16, X1 - 1]) ps.push(box(x, x + 1.4, 0, 7, 40, 84, SH));
    /* the counter: recessed panels, bronze beading and studs, a kick plate */
    const panelW = 16, front = (f, p) => { const z = p[2];
        if (f === "x") { const y = Math.floor(p[1]); if (z < 2) return BZ.d; if (z < 3) return BZ.l; if (z < 4) return BZ.P; if (z >= 25) return z < 26 ? BZ.P : z < 27 ? BZ.h : BZ.d;
            const u = mod(y - 1, panelW), iz = Math.floor(z);
            /* the bronze upright between panels, with a stud top and bottom */
            if (u === 0 || u === 1) { if (iz === 6 || iz === 22) return u === 0 ? BZ.W : BZ.h; return u === 0 ? BZ.l : BZ.d; }
            if (u === 2 || u === panelW - 1) return "34180b";
            /* the sunk panel: shadow at its top and one side, light on the others */
            if (iz === 22 || iz === 23) return iz === 23 ? "34180b" : "2b1408"; if (iz === 6) return "593422"; if (iz === 5 || iz === 24) return "452313";
            if (u === 3) return "2b1408"; if (u === panelW - 2) return "593422";
            /* a thin bronze line round the middle of each panel */
            if ((iz === 8 || iz === 20) && u > 4 && u < panelW - 3) return BZ.L; if ((u === 5 || u === panelW - 4) && iz >= 8 && iz <= 20) return BZ.L;
            return grain(z, y, ["452313", "4a2717", "3f2010"], "34180b"); }
        if (f === "y") { if (z < 2) return BZ.l; if (z < 3) return BZ.h; if (z < 4) return BZ.d; if (z >= 25) return z < 26 ? BZ.d : z < 27 ? BZ.W : BZ.l; const x = Math.floor(p[0] + 40); if (z > 6 && z < 22 && mod(x, 12) === 2) return BZ.L; return grain(z, x, ["593422", "5f3a27", "53301f"], "452313"); } return null; };
    const WOOD = { top: col("7f5947"), y: col("593422"), x: col("452313"), ny: col("34180b"), nx: col("34180b"), edge: col("120704") };
    const cap = { top: col("93705a"), y: col("c49660"), x: col("ab7a44"), edge: col("120704"), tex(f, p) { const z = p[2]; if (f === "x") return z > 30 ? BZ.W : z > 29 ? BZ.h : z < 28.6 ? BZ.d : BZ.l; if (f === "y") return z > 30 ? BZ.W : z < 28.6 ? BZ.l : BZ.h; if (f === "top") { if (p[0] > 4.5) return BZ.h; if (p[0] > 3.5) return BZ.L; return grain(p[1], p[0] + 40, ["93705a", "8d6a54", "997660"], "7f5947"); } return null; } };
    const ctr = [box(-8, 4, 0, cy1, 0, 28, { ...WOOD, tex: front }), box(-10, 6, -1, cy1 + 1, 28, 31, cap)];
    ps.push(...ctr);
    /* the surround: posts with bronze bases and capitals, a beaded lintel */
    const post = { ...WOOD, tex(f, p) { const z = p[2]; if (f === "x" || f === "y") { if (z < 4) return z < 2 ? BZ.d : BZ.h; if (z > HT - 2) return z > HT ? BZ.h : BZ.d; if (f === "x") { const u = Math.floor(mod(p[1], 8)); if (u === 3) return BZ.l; if (u === 4) return BZ.d; return grain(z, p[1], ["452313", "4a2717", "3f2010"], "34180b"); } return grain(z, p[0] + 9, ["593422", "5f3a27", "53301f"], "452313"); } return null; } };
    ps.push(box(0, 3, -7, -1, 0, HT + 4, post), box(0, 3, W + 1, W + 7, 0, HT + 4, post));
    ps.push(box(0, 2, 0, W, HT, HT + 4, { ...WOOD, tex(f, p) { if (f === "x") { const z = Math.floor(p[2]); if (z === HT) return BZ.d; if (z === HT + 1 && mod(Math.floor(p[1]), 6) === 0) return BZ.W; if (z === HT + 1) return BZ.l; return grain(p[1], z, ["452313", "4a2717", "3f2010"], "34180b"); } return null; } }));
    ps.push(box(0, 5, -8, W + 8, HT + 4, HT + 7, { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704"), tex(f, p) { if (f === "top") return grain(p[1], p[0] + 9, ["93705a", "8d6a54", "997660"], "7f5947"); if (f === "x") return grain(p[1], p[2], ["5f3f2e", "654434", "593a29"], "4c3224"); return null; } }));
    return { sprite: render(ps, { depthEdge: true, wall: { at: 0, inside: (y, z) => y > 0 && y < W && z >= 0 && z < HT } }), counter: render(ctr, { depthEdge: true }), W, D, HT, shelfZ, X0, X1 };
}
/* the bell: a separate knob on a thin neck, then the dome */
function bell() { return stamp([
    "...KKK...",
    "..KWHGK..",
    "..KHGDK..",
    "...KGK...",
    "..KKDKK..",
    ".KWHGGDK.",
    ".KHHGGDK.",
    "KHHGGGGDK",
    "KHGGGGDEK",
    "KKKKKKKKK",
    "KTTTTUUUK",
    ".KKKKKKK."
], { K: "1a1006", W: "fffbe0", H: "f7e29a", G: "d9b04f", D: "a67f36", E: "7a5416", T: "6e4524", U: "452313" }, 4, 10); }
/* the sign: the map's own stair sign, turned to stand straight out from this wall, on its arm and chains */
let signMirror = false; const setSignMirror = v => { signMirror = v; };
function signOut(c, ax, ay, lines) {
    const P = W3.PLAQUE, src = fs.readFileSync(H + "render/hw3.js", "utf8"), i = src.indexOf("function stairPlaque("), k = src.indexOf("    const ink = hex(", i);
    const Hd = lines.length > 1 ? 30 : 18, Wmax = Math.max(...lines.map(s => W3.H.textW(s, "vb"))), Wd = Math.max(50, Wmax + 2 * (P.frame + P.pad));
    const fn = new Function("hex", "H", "C", "PLAQUE", "plaqueWidth", "ARROW", src.slice(i, k) + "}\nreturn stairPlaque;")(W3.H.hex, W3.H, W3.H.C, { ...P, H: Hd }, () => Wd, []);
    const set = (x, y, v) => { if (x < 0 || y < 0 || x >= c.w || y >= c.h) return; const q = (y * c.w + x) * 4, t = typeof v === "string" ? col(v) : v; c.d[q] = t[0]; c.d[q + 1] = t[1]; c.d[q + 2] = t[2]; c.d[q + 3] = 255; };
    fn({ w: c.w, h: c.h, set: (x, y, v) => set(2 * ax - x, y, v) }, ax, ay, lines.join(" "), {});
    const L0 = ax - P.off - Wd, B = ay - P.h + Math.floor((Wd + P.off) / 2), put = (v, t, cc) => { const s = signMirror ? v : Wd - 1 - v; set(2 * ax - (L0 + s), B - Math.floor(s / 2) - t, cc); };
    const ink = col("f6cf80"), cut = col("170703");
    lines.forEach((word, n) => { const tw = W3.H.textW(word, "vb"); let U = (Wd - tw) >> 1; const floor = lines.length > 1 ? (n === 0 ? 17 : 4) : P.textFloor - 2; for (const ch of word) { const g = W3.H.VOL.vb[ch] || W3.H.VOL.vb[" "]; for (const [dt, cc] of [[-1, cut], [0, ink]]) g.rows.forEach((r, j) => { for (let q = 0; q < r.length; q++) if (r[q] === "1") put(U + q, floor + 10 - j + dt, cc); }); U += g.w; } });
}

/* ---- 18: the key, placed pixel by pixel: ring with a hole, collar, shank, two-tooth bit ---- */
function key() { return stamp([
    "..KKKK..............",
    ".KHWWHK.............",
    "KHGKKGDK............",
    "KGK..KDK............",
    "KGDKKDEKK...........",
    ".KDGGDKWHK..........",
    "..KKKKKHDEKK........",
    "......KKKWHGKK......",
    ".........KKGHGKK....",
    "...........KKGHGKK..",
    "............KHGGGDK.",
    "............KGGDDK..",
    ".............KKKK..."
], { K: "1a1006", W: "fff4c8", H: "f0d28a", G: "d6ad56", D: "a67f36", E: "6e4c16" }, 10, 7); }

/* ---- 21: small tells ---- */
const N1 = t => { const s = Math.sin(t * 91.7) * 43758.5; return s - Math.floor(s); };
const wallPx = (c, a, u, z) => { const x = a[0] + u, y = a[1] - z - (u >> 1); return [x, y, (y * c.w + x) * 4]; };
const setW = (c, a, u, z, rgb, al = 1) => { const [, , q] = wallPx(c, a, u, z); for (let k = 0; k < 3; k++) c.d[q + k] = c.d[q + k] * (1 - al) + rgb[k] * al; };
const mulW = (c, a, u, z, k0) => { const [, , q] = wallPx(c, a, u, z); const k = Array.isArray(k0) ? k0 : [k0, k0, k0]; for (let i = 0; i < 3; i++) c.d[q + i] = Math.max(0, Math.min(255, c.d[q + i] * k[i])); };
const inPoly = (poly, x, y) => { let r = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a, b] = poly[i], [p, q] = poly[j]; if ((b > y) !== (q > y) && x < (p - a) * (y - b) / (q - b) + a) r = !r; } return r; };
/* the Rooms' stone, as it sits behind the paper */
const stoneAt = (u, up) => { const row = Math.floor(up / 9), j = mod(up, 9), uu = u + (row % 2 ? 9 : 0), n = Math.floor(uu / 18), i = mod(uu, 18), t = (hash2(n, row) % 9) - 4; if (j >= 8 || i < 1) return [86, 101, 94]; if (j >= 7 || i < 2) return [41, 50, 47]; const d = j < 1 && hash2(n + 3, row) % 3 === 0 ? 5 : 0; return [62 + t - d, 75 + t - d, 71 + t - d]; };
/* a smooth noise field, for edges and stains that look like nothing a person drew */
const vnoise = (x, y) => { const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, s = t => t * t * (3 - 2 * t), h = (a, b) => (hash2(a + 400, b + 900) % 1000) / 1000, a0 = h(X, Y), b0 = h(X + 1, Y), c0 = h(X, Y + 1), d0 = h(X + 1, Y + 1), u = s(fx), v = s(fy); return a0 + (b0 - a0) * u + (c0 - a0) * v + (a0 - b0 - c0 + d0) * u * v; };
const fbm = (x, y) => vnoise(x, y) * .55 + vnoise(x * 2.1 + 9, y * 2.1 + 3) * .3 + vnoise(x * 4.3 + 5, y * 4.3 + 11) * .15;
/* break a clean outline into a torn one */
const rough = (poly, amp, seed, passes = 4) => { let pts = poly.map(p => [...p]); for (let n = 0; n < passes; n++) { const o = [], k = amp * Math.pow(.55, n); pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dz = q[1] - p[1], L0 = Math.hypot(dx, dz) || 1, off = (N1(seed + n * 31 + i * 7.3) - .5) * 2 * k; o.push(p, [(p[0] + q[0]) / 2 - dz / L0 * off, (p[1] + q[1]) / 2 + dx / L0 * off]); }); pts = o; } return pts; };
/* paper torn away from a shape, stone behind, a torn pale rim, and (if given) the flap curling forward with its shadow */
const PAPER = { hi: [226, 214, 190], mid: [204, 190, 164], lo: [166, 150, 124], dark: [120, 104, 84], line: [30, 18, 10] };
const fineEdge = (poly, amp, seed) => rough(poly, amp, seed, 5);
function peel(c, a, spec) {
    const hole = fineEdge(spec.hole, spec.amp === undefined ? 1.6 : spec.amp, spec.seed || 3), xs = hole.map(p => p[0]), zs = hole.map(p => p[1]), u0 = Math.floor(Math.min(...xs)) - 2, u1 = Math.ceil(Math.max(...xs)) + 2, z0 = Math.floor(Math.min(...zs)) - 2, z1 = Math.ceil(Math.max(...zs)) + 2, cache = new Map(), In = (u, z) => { const k = u + "," + z; if (!cache.has(k)) cache.set(k, inPoly(hole, u + .5, z + .5)); return cache.get(k); };
    /* the bare wall, shaded just under the paper above and beside it */
    for (let z = z0; z <= z1; z++) for (let u = u0; u <= u1; u++) if (In(u, z)) { const s = stoneAt(u + 500, z + 18), sh = !In(u, z + 1) ? .5 : !In(u, z + 2) ? .68 : !In(u, z + 3) ? .85 : !In(u - 1, z) ? .62 : !In(u - 2, z) ? .84 : 1; setW(c, a, u, z, s.map(v => v * sh)); }
    /* the rip: one thin line of paper's pale core, muted, thick only here and there */
    for (let z = z0; z <= z1; z++) for (let u = u0; u <= u1; u++) { if (In(u, z)) continue; const n1 = In(u + 1, z) || In(u - 1, z) || In(u, z + 1) || In(u, z - 1); if (!n1) continue; const w = fbm(u * .3 + 5, z * .3 + 2); setW(c, a, u, z, w > .56 ? PAPER.hi : PAPER.mid); if (w > .62) { for (const [p, q] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!In(u + p, z + q)) setW(c, a, u + p, z + q, PAPER.lo, .55); } }
    /* a few scraps of paper still stuck to the wall */
    for (const [su, sz, w0, h0] of spec.scraps || []) for (let z = 0; z < h0; z++) for (let u = 0; u < w0; u++) if (fbm((su + u) * .5, (sz + z) * .5) > .46) { setW(c, a, su + u, sz + z, u === 0 || z === 0 ? PAPER.lo : PAPER.mid, .8); }
    /* the flap: the paper's back, one broad curved piece, darkest at the fold, its free edge just turning up */
    if (!spec.flap) return;
    const f = fineEdge(spec.flap, .5, (spec.seed || 3) + 40), fx = f.map(p => p[0]), fz = f.map(p => p[1]), a0 = Math.floor(Math.min(...fx)) - 1, a1 = Math.ceil(Math.max(...fx)) + 1, b0 = Math.floor(Math.min(...fz)) - 1, b1 = Math.ceil(Math.max(...fz)) + 1, c2 = new Map(), Inf = (u, z) => { const k = u + "," + z; if (!c2.has(k)) c2.set(k, inPoly(f, u + .5, z + .5)); return c2.get(k); };
    const [p0, p1] = spec.fold, L0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), reach = Math.max(1, ...f.map(q => Math.abs((q[0] - p0[0]) * (p1[1] - p0[1]) - (q[1] - p0[1]) * (p1[0] - p0[0])) / L0));
    /* its shadow, soft and offset down and to the right */
    for (let z = b0 - 4; z <= b1; z++) for (let u = a0; u <= a1 + 4; u++) if (!Inf(u, z)) { if (Inf(u - 1, z + 1)) mulW(c, a, u, z, .58); else if (Inf(u - 2, z + 2)) mulW(c, a, u, z, .72); else if (Inf(u - 3, z + 3)) mulW(c, a, u, z, .86); }
    for (let z = b0; z <= b1; z++) for (let u = a0; u <= a1; u++) { if (!Inf(u, z)) continue; const d = Math.abs((u + .5 - p0[0]) * (p1[1] - p0[1]) - (z + .5 - p0[1]) * (p1[0] - p0[0])) / L0, t = d / reach, n = (fbm(u * .25, z * .25) - .5) * .16, v = t + n; let col = v < .14 ? PAPER.dark : v < .34 ? PAPER.lo : v < .78 ? PAPER.mid : PAPER.hi; setW(c, a, u, z, col); }
    for (let z = b0 - 1; z <= b1 + 1; z++) for (let u = a0 - 1; u <= a1 + 1; u++) if (!Inf(u, z) && (Inf(u + 1, z) || Inf(u - 1, z) || Inf(u, z + 1) || Inf(u, z - 1))) setW(c, a, u, z, PAPER.line);
}
const PEELS = {
    /* a page-corner: the paper's come away along a diagonal and folded forward */
    small: { hole: [[0, 64], [12, 64], [0, 52]], fold: [[12, 64], [0, 52]], flap: [[12, 64], [9, 59], [8, 55], [4, 54], [0, 52], [6, 58]], amp: .6, seed: 3 },
    corner: { hole: [[0, 104], [28, 104], [0, 74]], fold: [[28, 104], [0, 74]], flap: [[28, 104], [25, 95], [23, 86], [17, 82], [9, 80], [0, 74], [14, 89]], amp: 1, seed: 8 },
    /* a strip torn from the top, hanging forward on itself */
    sheet: { hole: [[6, 128], [34, 128], [36, 110], [33, 92], [5, 92], [3, 112]], fold: [[5, 92], [33, 92]], flap: [[5, 92], [33, 92], [36, 78], [33, 62], [28, 66], [22, 72], [15, 78], [9, 85]], amp: 1.6, seed: 12 },
    /* a patch ripped off, with nothing left hanging */
    tear: { hole: [[6, 94], [18, 100], [30, 97], [44, 100], [52, 88], [47, 74], [51, 62], [36, 54], [24, 58], [12, 52], [3, 64], [9, 80]], amp: 2.4, seed: 21 }
};
function ghost(c, a, shape) {
    const nail = (u, z) => { for (const [du, dz, cc] of [[0, 1, [20, 14, 10]], [1, 1, [20, 14, 10]], [-1, 0, [20, 14, 10]], [0, 0, [226, 226, 232]], [1, 0, [150, 150, 158]], [2, 0, [20, 14, 10]], [0, -1, [20, 14, 10]], [1, -1, [20, 14, 10]]]) setW(c, a, u + du, z + dz, cc); };
    for (const s of shape) { const { u, z, w, h, oval } = s, In = (x, y) => oval ? (((x - w / 2 + .5) / (w / 2)) ** 2 + ((y - h / 2 + .5) / (h / 2)) ** 2) <= 1 : x >= 0 && y >= 0 && x < w && y < h;
        for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) { if (In(x, y)) { const edge = !In(x - 1, y) || !In(x + 1, y) || !In(x, y - 1) || !In(x, y + 1), top = !In(x, y + 1); mulW(c, a, u + x, z + y, top ? .78 : edge ? .94 : 1.15); } else if (y === -1 && In(x, 0)) mulW(c, a, u + x, z + y, .86); }
        for (const n of s.nails || []) nail(u + n, z + h + 3); if (s.wire) { const mid = w >> 1; for (let i = 1; i < mid; i++) mulW(c, a, u + i, z + h + Math.round(i * 3 / mid), .88), mulW(c, a, u + w - 1 - i, z + h + Math.round(i * 3 / mid), .88); } }
}
/* damp coming down from the cornice: pale tide marks, long soft runs, a brown line at the edge */
function damp(c, a, u0, zTop, wide, depth, seed) {
    const field = (u, v) => { const x = u / wide - .5, fall = 1 - v / depth - Math.pow(Math.abs(x) * 2, 2.6) * .7; return fall + (vnoise((u + seed * 13) * .07, v * .035 + seed) * .7 + vnoise((u + seed) * .17, v * .09 + 5) * .3 - .5) * .75; };
    const L = [.06, .2, .36, .56], B = [[.96, .93, .89], [.92, .88, .82], [.88, .83, .76], [.83, .78, .7]];
    for (let v = 0; v <= depth; v++) for (let u = -6; u < wide + 6; u++) { const f = field(u, v); if (f < L[0]) continue; let n = 0; while (n < 3 && f >= L[n + 1]) n++; const tide = field(u, v + 1) < L[0] || field(u - 1, v) < L[0] || field(u + 1, v) < L[0] || field(u, v - 1) < L[0]; mulW(c, a, u0 + u, zTop - v, tide ? [.86, .8, .72] : B[n]); }
}
/* a bite out of the rail: raw wood, a dark line under it; scallops are tooth marks */
function bite(c, a, u0, bites) {
    /* a chewed notch through the rail: scalloped by teeth, bare wood inside, its own shadow under the lip above */
    for (const [off, w, dp] of bites) { const teeth = Math.max(1, Math.round(w / 4)); for (let i = 0; i < w; i++) { const t = (i + .5) / w, tw = t * teeth, sc = Math.sqrt(Math.max(0, 1 - 4 * (tw - Math.floor(tw) - .5) ** 2)), env = Math.pow(Math.sin(Math.PI * t), .5), d = Math.round(env * (dp - 1 + sc)); if (d <= 0) continue; const u = u0 + off + i; for (let v = 0; v <= d; v++) { const z = 37 - v; setW(c, a, u, z, v === d ? [18, 9, 5] : v === 0 ? [58, 38, 24] : mod(u * 2 + v, 5) === 0 ? [122, 88, 60] : [150, 112, 78]); } } }
}

/* ---- 23: the bookcase door, thinner, turned properly in 3D ---- */
let bookAt = null;
function bookDoor() {
    const P = name => L.loadPng(H + "art/rooms/" + name + ".png"), n = 3, parts = []; for (let i = 0; i < n; i++) { const k = i === 0 ? 27 : i === n - 1 ? 19 : 26 - ((i - 1) % 7); parts.push([P("shelf" + k), -i * 16 - 16 + (k === 19 ? -2 : 0), i * 8 + 16 - 74]); }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [im, x, y] of parts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + im.w); y0 = Math.min(y0, y); y1 = Math.max(y1, y + im.h); }
    const CW = x1 - x0, CH = y1 - y0, flat = new Uint8ClampedArray(CW * CH * 4);
    for (const [im, x, y] of parts) for (let j = 0; j < im.h; j++) for (let u = 0; u < im.w; u++) { const p = (j * im.w + u) * 4; if (im.rgba[p + 3] < 128) continue; const q = ((y + j - y0) * CW + x + u - x0) * 4; for (let k = 0; k < 4; k++) flat[q + k] = im.rgba[p + k]; }
    const SIDE = 16, Wd = CW - SIDE, T = 6, base = c => { for (let j = CH - 1; j >= 0; j--) if (flat[(j * CW + c) * 4 + 3]) return j; return 0; }, firstOf = c => { for (let j = 0; j < CH; j++) if (flat[(j * CW + c) * 4 + 3]) return j; return 0; };
    const Hh = base(CW - 1) - firstOf(CW - 1) + 1;
    const BD = 20, BW = 4, BTOP = base(SIDE + BD) - 30 + 1, BH = 13;
    /* in the flat picture, just the dark slot it lives in */
    const slot = new Uint8ClampedArray(flat); for (let v = 0; v < BH; v++) for (let u = -1; u < BW + 1; u++) { const X = SIDE + BD + u, Y = 30 - (u >> 1) + v, q = (Y * CW + X) * 4; slot[q] = 6; slot[q + 1] = 5; slot[q + 2] = 6; slot[q + 3] = 255; }
    const ox = Wd + 24, oy = Hh + 24, Cw = Wd * 2 + 70, Ch = Hh + Wd + 70;
    const frameOf = (src, a0, pull = 0) => {
        const out = new Uint8ClampedArray(Cw * Ch * 4), door = new Uint8Array(Cw * Ch), sn = Math.sin(a0), cs = Math.cos(a0), u = [sn, -cs], nn = [cs, sn];
        /* it hangs from the back corner, right against the wall: nothing opens up on that side as it turns */ const Bk = d => [0 + d * u[0], Wd + d * u[1]], F = d => { const b = Bk(d); return [b[0] + nn[0] * T, b[1] + nn[1] * T]; }, S = (p, z = 0) => [ox + p[0] - p[1], oy + (p[0] + p[1]) / 2 - z];
        const put = (x, y, r, g, b) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= Cw || y >= Ch) return; const q = (y * Cw + x) * 4; out[q] = r; out[q + 1] = g; out[q + 2] = b; out[q + 3] = 255; door[y * Cw + x] = 1; };
        const polyFill = (poly, fn) => { const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) if (inPoly(poly, x + .5, y + .5)) fn(x, y); };
        /* its shadow along the floor, heavier as it comes round */
        if (a0 > .03) { const k = Math.min(1, a0 / .6), o = [3 + 5 * sn, 3 + 5 * sn], q = [S(F(0)), S(F(Wd)), S([F(Wd)[0] + o[0], F(Wd)[1] + o[1]]), S([F(0)[0] + o[0], F(0)[1] + o[1]])]; polyFill(q, (x, y) => { if (x < 0 || y < 0 || x >= Cw || y >= Ch) return; const p = (y * Cw + x) * 4; out[p] = 12; out[p + 1] = 6; out[p + 2] = 2; out[p + 3] = 70 * k; }); }
        /* the end of the door: the Rooms' own side panel, squeezed to the new thickness */
        const endAt = a0 < Math.PI / 4 ? 0 : Wd, A0 = S(F(endAt)), A1 = S(Bk(endAt)), steps = Math.max(1, Math.ceil(Math.abs(A1[0] - A0[0])));
        if (Math.abs(A1[0] - A0[0]) >= .5) for (let i = 0; i <= steps; i++) { const t = i / steps, X = A0[0] + (A1[0] - A0[0]) * t, Yb = A0[1] + (A1[1] - A0[1]) * t, c = Math.floor((1 - t) * (SIDE - 1)), b0 = base(c); for (let r = 0; r < Hh; r++) { const p = ((b0 - Hh + 1 + r) * CW + c) * 4; if (b0 - Hh + 1 + r < 0 || !src[p + 3]) { const g = 70; put(X, Yb - Hh + 1 + r, g, g * .7, g * .45); continue; } const sh = endAt ? .8 : 1; put(X, Yb - Hh + 1 + r, src[p] * sh, src[p + 1] * sh, src[p + 2] * sh); } }
        /* the front */
        const X0 = S(F(0))[0], X1 = S(F(Wd))[0], k0 = 1 + .16 * Math.min(1, a0 / 1.2);
        for (let X = Math.round(X0); X <= Math.round(X1); X++) { const d = Math.min(Wd - 1e-3, Math.max(0, (X - X0) / (sn + cs))), c = SIDE + Math.floor(d), b0 = base(c), Yb = S(F(d))[1]; for (let r = 0; r < Hh; r++) { const sy = b0 - Hh + 1 + r; if (sy < 0) continue; const p = (sy * CW + c) * 4; if (!src[p + 3]) continue; put(X, Yb - Hh + 1 + r, Math.min(255, src[p] * k0), Math.min(255, src[p + 1] * k0), Math.min(255, src[p + 2] * k0)); } }
        /* the top */
        const tq = [S(F(0), Hh), S(F(Wd), Hh), S(Bk(Wd), Hh), S(Bk(0), Hh)]; polyFill(tq, (x, y) => { const m = mod(x + y * 2, 9); if (m === 0) put(x, y, 104, 74, 46); else put(x, y, 126, 92, 58); });
        /* the book: side, top, then spine, all from the same three directions as the door */
        { const K0 = [4, 14, 26], P0 = d => { const f = F(d); return [f[0] + nn[0] * pull, f[1] + nn[1] * pull]; }, Q0 = d => F(d), z1 = BTOP, z0 = BTOP - BH, tone = (arr, k = 1) => arr.map(v => Math.min(255, v * k));
          const fill = (poly, col) => polyFill(poly, (x, y) => put(x, y, col[0], col[1], col[2]));
          if (pull > 0) { const sideD = sn - cs > 0 ? BD + BW : BD; fill([S(Q0(sideD), z1), S(P0(sideD), z1), S(P0(sideD), z0), S(Q0(sideD), z0)], sn - cs > 0 ? [24, 28, 38] : [32, 37, 50]); fill([S(Q0(BD), z1), S(Q0(BD + BW), z1), S(P0(BD + BW), z1), S(P0(BD), z1)], [196, 184, 150]); const A1 = S(Q0(sideD), z1), A2 = S(P0(sideD), z1), B1 = S(Q0(sideD), z0), B2 = S(P0(sideD), z0); for (let e = 0; e <= 12; e++) { const t = e / 12; put(A1[0] + (A2[0] - A1[0]) * t, A1[1] + (A2[1] - A1[1]) * t, K0[0], K0[1], K0[2]); put(B1[0] + (B2[0] - B1[0]) * t, B1[1] + (B2[1] - B1[1]) * t, K0[0], K0[1], K0[2]); } }
          /* the spine: a column at a time */
          const Sa = S(P0(BD), z1), Sb = S(P0(BD + BW), z1), n0 = Math.round(Sa[0]), n1 = Math.round(Sb[0]); for (let X = n0; X <= n1; X++) { const t = n1 === n0 ? 0 : (X - n0) / (n1 - n0), Yt = Sa[1] + (Sb[1] - Sa[1]) * t; for (let v = 0; v <= BH; v++) { const edge = v === 0 || v === BH || X === n1, band = v === 3 || v === 10, cc = edge ? K0 : band ? (t < .3 ? [122, 98, 52] : [92, 72, 36]) : t < .3 ? [58, 66, 86] : t < .6 ? [44, 50, 66] : [34, 38, 52]; put(X, Yt + v, cc[0], cc[1], cc[2]); }
            /* where it is, for the page to know a click on it: it can't be found by its colour any more */
            if (pull === 0) bookAt = { x0: n0, x1: n1, y0: Math.floor(Math.min(Sa[1], Sb[1])), y1: Math.ceil(Math.max(Sa[1], Sb[1]) + BH) }; } }
        /* a black line round the whole door, like every sprite */
        const edge = []; for (let y = 1; y < Ch - 1; y++) for (let x = 1; x < Cw - 1; x++) if (door[y * Cw + x] && (!door[y * Cw + x - 1] || !door[y * Cw + x + 1] || !door[(y - 1) * Cw + x] || !door[(y + 1) * Cw + x])) edge.push((y * Cw + x) * 4);
        for (const q of edge) { out[q] = 0; out[q + 1] = 0; out[q + 2] = 0; out[q + 3] = 255; }
        return { w: Cw, h: Ch, ox, oy, rgba: out };
    };
    
    const frames = [], STEP = 3; for (let d = 0; d <= 84; d += STEP) frames.push(frameOf(slot, d * Math.PI / 180, 7));
    const pulls = []; for (let k = 0; k <= 7; k++) pulls.push(frameOf(slot, 0, k));
    const closed = pulls[0], book = bookAt && { x0: bookAt.x0 - closed.ox, x1: bookAt.x1 - closed.ox, y0: bookAt.y0 - closed.oy, y1: bookAt.y1 - closed.oy };
    return { frames, pulls, W: Wd, H: Hh, STEP, book };
}
/* the way behind it: Rooms stone, slate underfoot, a lantern lighting the far wall */
function passage(Wd, Hh) {
    const glow = (u, z, x) => { const d = Math.hypot(u - Wd / 2, (z - 44) * 1.1, (x + 42) * .8), k = Math.max(.42, Math.min(1.35, 1.75 - d / 34)); return k; };
    const st = (u, z, x) => { const s = stoneAt(Math.floor(u + 500), Math.floor(z)), k = glow(u, z, x); return [s[0] * k * 1.5, s[1] * k * 1.2, s[2] * k * .9]; };
    const lamp = (u, z) => { const d = Math.hypot(u - Wd / 2, z - 44); return d < 2.4 ? [255, 244, 200] : d < 3.6 ? [40, 26, 14] : null; };
    return render([
        box(-48, -42, -2, Wd + 2, 0, Hh + 4, { top: col("3a2010"), x: (f, p) => lamp(p[1], p[2]) || st(p[1], p[2], -42), y: col("2a170a"), edge: null, noLine: true }),
        box(-48, 0, -5, 0, 0, Hh + 4, { top: col("2a170a"), y: (f, p) => st(p[0] + 90, p[2], p[0]), x: col("20110a"), edge: null, noLine: true }),
        box(-48, 0, 0, Wd, -3, 0, { top: (f, p) => { const k = glow(p[1], 8, p[0]) * .9 + .1; return slateAt(p[0], p[1]).map((v, i) => v * k * [1.25, 1.05, .8][i]); }, y: col("2a2015"), x: col("2a2015"), edge: null, noLine: true })
    ], { wall: { at: 0, inside: (y, z) => y > 0 && y < Wd && z < Hh && z >= 0 } });
}

/* ---- 24: the staff room, much more going on ---- */
const STEEL = ["dfe5ea", "aab2ba", "7a838c", "4c545c", "1a1e22"], COPPER = ["f2b47c", "c9824a", "96582c", "6a3a1a", "2a1608"], IRON = ["8e8a80", "6a665e", "4c4942", "33312c", "16140f"];
function pipeY(x, z, r, y0, y1, c) { const tone = v => v > .72 ? c[0] : v > .42 ? c[1] : v > .15 ? c[2] : c[3]; return box(x - r, x + r, y0, y1, z - r, z + r, { top: col(c[1]), x: col(c[2]), y: col(c[1]), ny: col(c[2]), edge: col(c[4]), tex(f, p) { if (f === "x") return tone((p[2] - (z - r)) / (2 * r)); if (f === "top") return tone(1 - (p[0] - (x - r)) / (2 * r) * .55); return null; } }); }
const riser = (x, y, r, z0, z1, c) => cyl(x, y, r, z0, z1, { ramp: [c[3], c[2], c[1], c[0]], top: col(c[1]), edge: col(c[4]) });
const joint = (x, y, z, r, c) => box(x - r, x + r, y - r, y + r, z - r, z + r, { top: col(c[0]), y: col(c[1]), x: col(c[2]), edge: col(c[4]) });
function staffRoom(opt = {}) {
    const LX = 96, LY = 224, WH = 112, ps = [], marks = [], mark = k => marks.push([k, ps.length]);
    const stone = (u, z, k) => { const row = Math.floor(z / 8), off = row % 2 ? 12 : 0, a = mod(u + off, 24); if (mod(z, 8) < 1 || a < 1) return [38 * k, 36 * k, 34 * k]; const n = mod(Math.floor((u + off) / 24) * 7 + row * 3, 5), t = [78, 84, 74, 88, 70][n], chip = 0; return [(t + chip) * k, (t + chip) * .97 * k, (t + chip) * .92 * k]; };
    const wallTex = (u, z, k) => { if (z < 4) return [24 * k, 22 * k, 21 * k]; if (z < 8) return [46 * k, 42 * k, 40 * k]; if (z < 9) return [24, 20, 18]; if (z < 40) { const pl = mod(u, 32), iz = Math.floor(z); if (pl < 1) return [26 * k, 30 * k, 30 * k]; if (pl < 2) return [84 * k, 96 * k, 94 * k]; if ((pl < 4 || pl > 29) && (iz === 13 || iz === 23 || iz === 33)) return [172 * k, 176 * k, 170 * k]; if ((pl < 4 || pl > 29) && (iz === 12 || iz === 22 || iz === 32)) return [28 * k, 30 * k, 30 * k]; return [64 * k, 76 * k, 74 * k]; } if (z < 42) return [34, 30, 28]; if (z < 43) return [104 * k, 100 * k, 94 * k]; if (z >= WH - 2) return [120 * k, 116 * k, 108 * k]; return stone(u, z, k); };
    ps.push(box(-6, 0, -6, LY, 0, WH, { top: col("78746c"), x: (f, p) => wallTex(p[1] + 6, p[2], 1), y: col("3a3834"), edge: null, noLine: true, tex: null }));
    ps.push(box(0, LX, -6, 0, 0, WH, { top: col("78746c"), y: (f, p) => wallTex(p[0], p[2], .74), x: col("3a3834"), edge: null, noLine: true }));
    /* the floor: slate, a yellow-and-black warning edge round the plant, and a drain */
    const floorTop = (f, p) => { const x = p[0], y = p[1]; if (x < 28 && y > 130 && y < 202) { if (x > 22 || y < 136 || y > 196) return mod(Math.floor((x + y) / 4), 2) ? [226, 186, 42] : [28, 26, 22]; } return slateAt(x, y); };
    ps.push(box(0, LX, 0, LY, -8, 0, { top: floorTop, x: col("262626"), y: col("3a3a3a"), edge: null, noLine: true }));
    mark("pipes"); /* a steel main and a copper line, on clamps, with valves and a pressure gauge along the way */
    ps.push(pipeY(5, 94, 2.5, 0, 180, STEEL), joint(5, 2, 94, 4, STEEL), joint(5, 180, 94, 3.5, STEEL), riser(5, 180, 2.5, 46, 94, STEEL));
    ps.push(pipeY(5, 84, 2.5, 0, 150, COPPER), joint(5, 2, 84, 4, COPPER), joint(5, 150, 84, 3.5, COPPER), riser(5, 150, 2.5, 46, 84, COPPER));
    for (let y = 16; y < 150; y += 32) { ps.push(box(0, 8.4, y, y + 2, 79, 99, { top: col("6a665e"), y: col("4c4942"), x: col("3e3b36"), edge: col("16140f"), tex(f, p) { if (f === "x" && (Math.floor(p[2]) === 81 || Math.floor(p[2]) === 96)) return "a8a498"; return null; } })); }
    ps.push(box(0, 8, 176, 178, 89, 99, M("4c4942", "3e3b36", "2c2a26", "16140f")));
    /* flanges and a band of colour on each pipe */
    for (const y of [40, 104]) ps.push(joint(5, y, 94, 3.3, STEEL));
    for (const y of [56, 120]) ps.push(joint(5, y, 84, 3.3, COPPER));
    for (let y = 70; y < 76; y += 1) ps.push(box(2.3, 7.7, y, y + 1, 91.3, 96.7, y < 72 ? M("e66a4a", "c8352a", "8a1f16", "2a0604") : y < 74 ? M("f7f2e4", "dcd6c8", "aaa496", "2a2a2a") : M("e66a4a", "c8352a", "8a1f16", "2a0604")));
    /* a red valve wheel on the copper, a gauge on the steel */
    ps.push(joint(5, 88, 84, 3.6, COPPER), cyl(11, 88, 1, 80, 88, M("7a838c", "4c545c", "33312c", K)));
    { const RW = M("ff7a60", "c8352a", "8a1f16", "2a0604"); for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; ps.push(box(9.5, 12.5, 88 + Math.cos(a) * 5 - .7, 88 + Math.cos(a) * 5 + .7, 84 + Math.sin(a) * 5 - .7, 84 + Math.sin(a) * 5 + .7, RW)); } ps.push(box(10, 12, 84, 92, 83.4, 84.6, RW), box(10, 12, 87.4, 88.6, 80, 88, RW)); }
    ps.push(joint(5, 128, 94, 3.3, STEEL), box(4, 6, 127, 129, 97, 101, M("aab2ba", "7a838c", "4c545c", K)), box(1.5, 7.5, 124, 132, 101, 109, { top: col("aab2ba"), y: col("7a838c"), x: col("4c545c"), edge: col(K), tex(f, p) { if (f !== "x") return null; const d = Math.hypot(p[1] - 128, p[2] - 105); if (d > 3.6) return "2a2e32"; if (Math.abs((p[1] - 128) + (p[2] - 105)) < .7 && p[2] > 105) return "b22a1e"; return "f4f2e6"; } }));
    mark("boiler"); /* the boiler: riveted plates, two gauges, an inspection hatch, a burner door, a name plate, its pipes and a drain */
    const rivet = (u, z, step0, step1) => mod(u, step0) < 1 && mod(z, step1) < 1;
    const steelTex = (f, p) => {
        if (f === "x") { const u = p[1], z = p[2];
            for (const [gu, gz] of [[170, 36], [182, 36]]) { const d = Math.hypot(u - gu, z - gz); if (d < 4.6) return d > 3.6 ? "1c2024" : Math.abs((u - gu) - (z - gz)) < .7 && z > gz ? "b22a1e" : d < .7 ? "1c2024" : "f4f2e6"; if (d < 5.6) return "c0c6cc"; }
            if (u > 146 && u < 164 && z > 22 && z < 40) { if (u < 147 || u > 163 || z < 23 || z > 39) return "1a1e22"; if (u < 148 || z > 38) return "aab2ba"; if (mod(z, 4) < 1) return "2a2e32"; return mod(z, 4) < 2 ? "8d959d" : "5a6268"; }
            if (u > 146 && u < 164 && z > 6 && z < 20) { if (u < 147 || u > 163 || z < 7 || z > 19) return "1a1e22"; const d = Math.hypot(u - 155, z - 13); if (d < 4) return d < 2.2 ? "ffb060" : "c8352a"; if (u > 160 && z > 11 && z < 15) return "dfe5ea"; return "5a6268"; }
            if (u > 168 && u < 186 && z > 16 && z < 24) { if (u < 169 || u > 185 || z < 17 || z > 23) return "1a1e22"; return mod(Math.floor(u) + Math.floor(z) * 3, 5) ? "c49660" : "8c5c30"; }
            if (mod(u, 28) < 1) return "3c4248"; if (mod(u, 28) < 2) return "aab2ba"; if (mod(z - 2, 16) < 1) return "4c545c"; if (mod(z - 2, 16) < 2) return "98a0a8";
            if (rivet(u + 2, z - 5, 7, 16) || rivet(u + 2, z + 1, 7, 16)) return "dfe5ea";
            return null; }
        if (f === "y") { const x = p[0], z = p[2]; if (x > 3 && x < 13 && z > 22 && z < 40) { if (x < 4 || x > 12 || z < 23 || z > 39) return "1a1e22"; return mod(z, 3) < 1 ? "2a2e32" : "a8b0b8"; } if (mod(z - 2, 16) < 1) return "5a6268"; if (mod(x, 7) < 1 && mod(z - 5, 16) < 1) return "dfe5ea"; return null; }
        if (f === "top") { const x = p[0], y = p[1]; if (x > 3 && x < 13 && y > 170 && y < 186) { if (x < 4 || x > 12 || y < 171 || y > 185) return "2a2e32"; return mod(Math.floor(y), 3) === 0 ? "7a838c" : "aab2ba"; } if (mod(y, 28) < 1) return "5a6268"; return null; }
        return null; };
    ps.push(box(0, 16, 140, 192, 0, 46, { top: col("9aa2aa"), y: col("7a838c"), x: col("6a727a"), edge: col("16181a"), tex: steelTex }));
    ps.push(box(0, 18, 138, 194, 0, 4, { top: col("565c62"), y: col("3e3b36"), x: col("2c2a26"), edge: col("16140f"), tex(f, p) { if (f === "x" && mod(p[1], 8) < 1.2 && p[2] > 1 && p[2] < 3) return "aab2ba"; return null; } }));
    /* a drain cock on the front, a stub of pipe on the side, the burner's handle */
    ps.push(box(16, 19, 150, 152, 4, 7, M("c9824a", "96582c", "6a3a1a", K)), box(18, 21, 149, 153, 3, 5, M("ff7a60", "c8352a", "8a1f16", K)), box(16, 18, 160, 163, 12, 14, M("dfe5ea", "aab2ba", "7a838c", K)));
    ps.push(cyl(8, 192, 2.4, 22, 28, M("aab2ba", "7a838c", "4c545c", K)));
    mark("duct"); /* the duct: seams and rivets, flanges, hangers */
    const galv = (f, p) => { if (f === "y") { const m = mod(p[0], 16); if (m < 1) return "5a6268"; if (m < 2) return "cdd4da"; if ((Math.floor(p[2]) === 98 || Math.floor(p[2]) === 108) && mod(p[0], 4) < 1) return "e8edf0"; return null; } if (f === "x") { const m = mod(p[1], 16); if (m < 1) return "5a6268"; if (m < 2) return "aab2ba"; return null; } if (f === "top") return mod(p[0], 16) < 1 ? "8d959d" : null; return null; };
    ps.push(box(0, 72, 0, 14, 96, 110, { top: col("b4bcc4"), y: col("98a0a8"), x: col("7a838c"), edge: col("1a1e22"), tex: galv }));
    ps.push(box(72, 84, -2, 16, 92, 112, { top: col("b4bcc4"), y: col("98a0a8"), x: col("7a838c"), edge: col("1a1e22"), tex(f, p) { if (f === "y" && (Math.floor(p[2]) === 94 || Math.floor(p[2]) === 110) && mod(p[0], 3) < 1) return "e8edf0"; if (f === "x" && mod(p[2], 3) < 1 && p[1] > 0 && p[1] < 14 && p[2] > 94 && p[2] < 110) return "23272b"; return null; } }));
    for (const x of [24, 56]) ps.push(box(x, x + 1.6, 14, 15.2, 90, 112, M("6a665e", "4c4942", "33312c", K)));
    mark("vent"); /* vents: a frame, screws and real louvres */
    const louvre = (axis, a, b, z0, z1) => (f, p) => { if (f !== axis) return null; const c = axis === "x" ? p[1] : p[0], z = p[2]; if (c < a + 1.5 || c > b - 1.5 || z < z0 + 1.5 || z > z1 - 1.5) return ((Math.abs(c - a - .8) < .8 || Math.abs(c - b + .8) < .8) && (Math.abs(z - z0 - .8) < .8 || Math.abs(z - z1 + .8) < .8)) ? "1a1e22" : "b4bcc4"; return mod(z, 3) < 1 ? "14171a" : mod(z, 3) < 2 ? "aab2ba" : "6a727a"; };
    ps.push(box(0, 2, 40, 64, 52, 68, { top: col("b4bcc4"), y: col("7a838c"), x: col("8d959d"), edge: col("1a1e22"), tex: louvre("x", 40, 64, 52, 68) }));
        mark("ventx"); ps.push(box(30, 56, 0, 2, 50, 66, { top: col("b4bcc4"), y: col("8d959d"), x: col("7a838c"), edge: col("1a1e22"), tex: louvre("y", 30, 56, 50, 66) }));
    mark("fan"); /* the fan unit: a cage over real blades, corner bolts, a rating plate, slats down its side, a cable in */
    const fanTex = (f, p) => {
        if (f === "x") { const u = p[1] - 202, v = p[2] - 62, d = Math.hypot(u, v); if (d < 12.5) { if (d > 11.5) return "14171a"; if (d > 10.6) return "c0c6cc"; const on = Math.abs(u) < .6 || Math.abs(v) < .6 || Math.abs(u - v) < .7 || Math.abs(u + v) < .7; if (mod(d, 3) < 1 || (on && d > 2)) return "b4bcc4"; if (d < 2.4) return "dfe5ea"; const th = Math.atan2(v, u); return mod(th * 5 / (Math.PI * 2) + d * .05, 1) < .5 ? "5a6268" : "23272b"; } if (Math.abs(Math.abs(u) - 12) < 1 && Math.abs(Math.abs(v) - 14) < 1) return "dfe5ea"; if (p[1] > 190 && p[1] < 196 && p[2] > 48 && p[2] < 52) return "e8d8a8"; return null; }
        if (f === "y") { if (p[2] > 50 && p[2] < 74 && p[0] > 2 && p[0] < 10) return mod(p[2], 3) < 1 ? "14171a" : "98a0a8"; return null; }
        if (f === "top") return mod(Math.floor(p[0]) + Math.floor(p[1]), 6) === 0 ? "98a0a8" : null;
        return null; };
    ps.push(box(0, 12, 188, 216, 46, 78, { top: col("b4bcc4"), y: col("8d959d"), x: col("8d959d"), edge: col("1a1e22"), tex: fanTex }));
    ps.push(cyl(3, 214, 1.4, 78, 90, M("6a665e", "4c4942", "33312c", K)));
    mark("grate"); /* a floor grate, properly framed */
    ps.push(box(50, 66, 96, 128, -.2, .2, { top: (f, p) => { if (p[0] < 51 || p[0] > 65 || p[1] < 97 || p[1] > 127) return [120, 124, 128]; return mod(p[0], 3) < 1 || mod(p[1], 3) < 1 ? [24, 24, 24] : [96, 100, 104]; }, x: col("222"), y: col("222"), edge: col("111111") }));
    mark("cabinet"); /* the electrical cabinet: two doors, top slats, a warning triangle, a label, handles, hinges, cables at the foot */
    const cab = (f, p) => { if (f === "x") { const y = p[1], z = p[2];
            const u = y - 84, zz = z - 50; if (Math.abs(u) <= 6 - zz * .5 && zz >= 0 && zz < 11) return (Math.abs(u) <= 4.4 - zz * .5 && zz >= 1.2 && zz < 8.4) ? (Math.abs(u) < .8 && ((zz > 3.4 && zz < 7.4) || (zz > 1.6 && zz < 2.8)) ? "111111" : "f0c830") : "111111";
            if (z > 65 && z < 70 && y > 64 && y < 88) return mod(z, 2) < 1 ? "14171a" : "98a0a8";
            if (Math.abs(y - 76) < .6) return "1a1e22"; if (Math.abs(y - 75) < .5) return "a8b0b8";
            if (y > 63 && y < 73 && z > 50 && z < 58) { if (y < 64 || y > 72 || z < 51 || z > 57) return "1a1e22"; return mod(Math.floor(z), 2) ? "f4f2e6" : "aaa89a"; }
            if ((y < 61.6 || y > 90.4) && (Math.abs(z - 20) < 3 || Math.abs(z - 56) < 3)) return "c0c6cc";
            if (mod(y - 60, 2) < 1 && (z < 10 || z > 70) ) return "5a6268";
            return null; } return null; };
    ps.push(box(0, 7, 60, 92, 8, 72, { top: col("8d959d"), y: col("5a6268"), x: col("6c7480"), edge: col("16181a"), tex: cab }));
    ps.push(box(7, 8.4, 72, 74, 34, 44, M("dfe5ea", "aab2ba", "7a838c", K)), box(7, 8.4, 78, 80, 34, 44, M("dfe5ea", "aab2ba", "7a838c", K)), box(7, 8, 72.5, 73.5, 28, 30, M("2a2e32", "111", "111", K)));
    for (const [y, c] of [[66, "c8352a"], [71, "3a7ad6"], [84, "f0c830"]]) ps.push(cyl(3, y, 1, 0, 8, M(c, c, c, K)));
    /* conduit from the cabinet up to the duct */
    ps.push(riser(4, 72, 1.3, 72, 96, IRON), riser(4, 84, 1.3, 72, 80, IRON));
    if (opt.parts) { const out = {}; marks.forEach(([k, a], i) => { const b = i + 1 < marks.length ? marks[i + 1][1] : ps.length; out[k] = render(ps.slice(a, b), { crease: false, light: opt.light, depthEdge: true }); }); out.hazard = render([box(0, 28, 130, 202, -.1, .1, { top: floorTop, x: col("262626"), y: col("3a3a3a"), edge: null, noLine: true })], { crease: false, depthEdge: false }); return out; }
    return { sprite: render(ps, { crease: false, light: opt.light, depthEdge: true }), LX, LY, WH };
}
/* ---- the lights ---- */
function lights() {
    const DK = M("565c62", "3c4248", "2a2e32", K), GL = { top: col("fff8d8"), y: col("ffe9a8"), x: col("f4cf74"), edge: col(K), noLine: true }, B = { ramp: ["f4cf74", "ffe9a8", "fff8d8"], edge: col(K) }, out = {}, opt = { depthEdge: true, crease: false };
    /* the first bulkhead back: a glowing panel behind four ribs and a crossbar, tidied so every rib is the same */
    { const RIB = M("70767c", "4c5258", "2a2e32", K), ps = [box(0, 2, -10, 10, 61, 77, { top: col("70767c"), y: col("4c5258"), x: col("3c4248"), edge: col(K), tex(f, p) { if (f === "x" && (Math.abs(Math.abs(p[1]) - 8.8) < .7) && (Math.abs(p[2] - 62.6) < .7 || Math.abs(p[2] - 75.4) < .7)) return "dfe5ea"; return null; } }), box(1, 5, -8, 8, 63, 75, GL)]; for (const y of [-6, -2, 2, 6]) { ps.push(box(4.6, 6, y - .75, y + .75, 62.6, 75.4, RIB)); ps.push(box(2, 6, y - .75, y + .75, 75, 76.4, RIB), box(2, 6, y - .75, y + .75, 61.6, 63, RIB)); } ps.push(box(4.6, 6, -8.8, 8.8, 68.2, 69.8, RIB)); for (const y of [-8.4, 8.4]) ps.push(box(2, 6, y - .7, y + .7, 68.2, 69.8, RIB)); out.bulkhead = { name: "Bulkhead", s: render(ps, opt) }; }
    { const Ghi = { ramp: ["1f3a2a", "2a5a3e", "3a7a54", "5a9a74"], top: col("3a7a54"), edge: col(K), noLine: true }, ps = [cyl(10, 0, .6, 76, 118, M("2a2e32", "111", "111", K)), cyl(10, 0, 1.8, 73, 77, M("aab2ba", "7a838c", "4c545c", K))]; for (let i = 0; i < 12; i++) ps.push(cyl(10, 0, 1.8 + i * .8, 72 - i, 73 - i, Ghi)); ps.push(cyl(10, 0, 11, 60.4, 61, M("dfe5ea", "dfe5ea", "aab2ba", K))); ps.push(ball(10, 0, 58.4, 2.4, B)); out.pendant = { name: "Enamel pendant", s: render(ps, opt) }; }
    { const body = M("dfe3e7", "a8acb0", "8a8e92", K); out.batten = { name: "Strip light", s: render([box(0, 3, -21, 21, 70, 74, body), box(0, 4, -21, -19, 69.4, 74.6, M("7a838c", "4c545c", "3c4248", K)), box(0, 4, 19, 21, 69.4, 74.6, M("7a838c", "4c545c", "3c4248", K)), box(3, 4.6, -19, 19, 70.6, 73.4, { top: col("ffffff"), y: col("eef8ff"), x: col("dcf0ff"), edge: col(K), noLine: true }), cyl(1.4, -14, .9, 74, 82, M("565c62", "3c4248", "2a2e32", K))], opt) }; }
    /* the caged lamp, drawn by hand: wall plate, gooseneck, lamp cap, bulb, wire guard */
    { const s = stamp([
        ".KKKK.................",
        "KSMMDK................",
        "KMoMDKKKKKKKK.........",
        "KMMMDKSMMMMMMKK.......",
        "KMMMDKKKKKKDMMDK......",
        "KMoMDK.....KKDMDK.....",
        "KDDDDK.......KMDK.....",
        ".KKKK.......KKKKKK....",
        "...........KSMMMDDK...",
        "...........KKKKKKKK...",
        "..........KW.KKK.dK...",
        ".........KdKYWWYKKdK..",
        ".........KKYWWWWYKKK..",
        ".........KdYWWWWYKdK..",
        ".........KdKYWWYKKdK..",
        ".........KKKYYYYKKKK..",
        ".........KdKKYYKKKdK..",
        "..........KdK..KKdK...",
        "...........KKKKKKK....",
        "............dddd......",
        "............KKKK......"
      ], { K: "0c0d0f", S: "dfe5ea", M: "8d959d", D: "4c545c", o: "2a2e32", W: "fffdf0", Y: "ffe08a", d: "565c62" }, 2, 19 + 58); out.caged = { name: "Caged bracket", s }; }
    { const ps = [], Y = M("f0c830", "c49a18", "967410", K); for (const [dx, dy] of [[7, 0], [-4, 6], [-4, -6]]) for (let i = 0; i < 12; i++) { const t = i / 12; ps.push(box(16 + dx * (1 - t) - .7, 16 + dx * (1 - t) + .7, 16 + dy * (1 - t) - .7, 16 + dy * (1 - t) + .7, i * 3, i * 3 + 3.2, Y)); } ps.push(cyl(16, 16, .9, 34, 50, M("565c62", "3c4248", "2a2e32", K))); ps.push(box(13, 22, 11, 21, 50, 59, { top: col("f0c830"), y: col("c49a18"), x: col("967410"), edge: col(K), tex(f, p) { if (f === "y" && mod(p[2], 2.5) < 1 && p[0] > 14 && p[0] < 21) return "6e5408"; return null; } }), box(22, 23.2, 12, 20, 51, 58, { top: col("fff8d8"), y: col("fff8d8"), x: col("ffffff"), edge: col(K), noLine: true, tex(f, p) { if (f === "x" && (Math.floor(p[1]) % 3 === 0 || Math.floor(p[2]) % 3 === 0)) return "967410"; return null; } }), box(14, 21, 15.4, 16.6, 59, 62.5, M("565c62", "3c4248", "2a2e32", K))); out.work = { name: "Work lamp", s: render(ps, opt), floor: true }; }
    return out;
}

/* ---- 27 ---- */
/* the running man, hand placed: 24 by 11, white on green, flat to the wall, its own black edge. Lit by the caller. */
/* the door, on the face; the runner is drawn after the slant, as straight limbs, so they can't kink */
const FIRE = [".................oooooo..",".................o....o..",".................o....o..",".................o....o..",".................o....o..",".................o....o..",".................o....o..",".................o....o..",".................o....o..",".................o....o..",".................oooooo.."];
const RUNNER = { head: [10.2, 1.2, 1.4], t: 1, limbs: [[[8.6, 3.2], [6.6, 6.6]], [[8.4, 3.4], [13, 5]], [[8.4, 3.4], [3.4, 5.2]], [[6.6, 6.6], [10.2, 7.6], [9.8, 10]], [[6.6, 6.6], [4.4, 9], [.8, 9]]] };
function paintRunner(s, D, y1, zTop) { const px = new Set(), mark = (u, v, r) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const X = Math.round(u) + dx, Y = Math.round(v - u / 2) + dy; if (Math.hypot(X - u, Y - (v - u / 2)) <= r) px.add(X + "," + Y); } };
    for (const seg of RUNNER.limbs) for (let i = 0; i < seg.length - 1; i++) { const p = seg[i], q = seg[i + 1], n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 3); for (let k = 0; k <= n; k++) mark(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n, RUNNER.t / 2 + .2); } mark(RUNNER.head[0], RUNNER.head[1], RUNNER.head[2]);
    const U0 = 3; for (const p of px) { const [X, Y] = p.split(",").map(Number), sx = s.ox + D - y1 + U0 + X, sy = Math.round(s.oy + (D + y1 - U0) / 2 - zTop + 1 + Y), q = (sy * s.w + sx) * 4; if (q >= 0 && q < s.rgba.length && s.rgba[q + 3] > 128 && s.rgba[q] === SIGN_GREEN[0] && s.rgba[q + 1] === SIGN_GREEN[1] && s.rgba[q + 2] === SIGN_GREEN[2]) { s.rgba[q] = 255; s.rgba[q + 1] = 255; s.rgba[q + 2] = 255; } } }
/* W wide on the wall, H tall, D out from it: dark housing, a green front that's the only part that lights */
const SIGN_GREEN = [18, 150, 80], SIGN_LIT = [46, 224, 124], SIGN_WHITE = [255, 255, 255];
function fireSign(cy, z0) { const set = vol("EXIT", "vb"), pts = [...set].map(s => s.split(",").map(Number)), bx0 = Math.min(...pts.map(p => p[0])), bx1 = Math.max(...pts.map(p => p[0])), by0 = Math.min(...pts.map(p => p[1])), by1 = Math.max(...pts.map(p => p[1])), TW = bx1 - bx0 + 1, TH = by1 - by0 + 1, W = TW + 8, Hh = TH + 6, D = 4, y0 = Math.round(cy - W / 2), y1 = y0 + W, z1 = z0 + Hh, HS = { top: col("8d959d"), y: col("3c4248"), x: col("2a2e32"), edge: col(K) };
    const face = (f, p) => { if (f !== "x") return null; const u = Math.floor(y1 - .001 - p[1]), v = Math.floor(z1 - .001 - p[2]); if (u < 1 || v < 1 || u >= W - 1 || v >= Hh - 1) return "1c2024"; return set.has((u - 4 + bx0) + "," + (v - 3 + by0)) ? SIGN_WHITE : SIGN_GREEN; };
    return { sprite: render([box(0, D, y0, y1, z0, z1, { ...HS, tex: face }), box(0, 2, y0 + 5, y0 + 8, z1, z1 + 2, HS), box(0, 2, y1 - 8, y1 - 5, z1, z1 + 2, HS)], { crease: false }), glow: [D, y0 + W / 2, z0 + Hh / 2], W, Hh }; }
function hotelItems() {
    const out = A4.hotelItems4(), OAK = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col(K) };
    delete out.staff;
    /* the photograph: an old sepia print in a cream mount, dark frame with bronze in it, small plate. One for each hotel's own view. */
    const photo = (hotel, x0, y0) => { const back = L.loadPng(R + "assets/img/hotel/" + hotel + "-back.png"), front = L.loadPng(R + "assets/img/hotel/" + hotel + "-front.png"), PW = 36, PH = 50, s = 6, stops = ["1e1208", "3c2614", "624126", "8a6640", "b49468", "dcc49c", "f2e6c8"].map(col);
      const px = (X, Y) => { const p = (Y * 720 + X) * 4, al = front.rgba[p + 3] / 255; return [0, 1, 2].map(k => back.rgba[p + k] * (1 - al) + front.rgba[p + k] * al); };
      const lum = []; for (let v = 0; v < PH; v++) for (let u = 0; u < PW; u++) { let t = 0; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { const c = px(x0 + u * s + i, y0 + v * s + j); t += c[0] * .3 + c[1] * .59 + c[2] * .11; } lum.push(t / (s * s)); }
      const min = Math.min(...lum), max = Math.max(...lum), tone = l => { const t = Math.pow((l - min) / (max - min), .85) * (stops.length - 1), i0 = Math.min(stops.length - 2, Math.floor(t)), f = t - i0; return stops[i0].map((v, k) => Math.round(v + (stops[i0 + 1][k] - v) * f)); };
      const W = 58, Hh = 72, z0 = 42, fr = { top: col("5a3a24"), y: col("3e2413"), x: col("2c180c"), edge: col(K) }, y1 = W - 3, zt = z0 + Hh - 3, plate = (f, p) => { if (f !== "x") return null; const u = Math.floor(y1 - p[1]), v = Math.floor(zt - p[2]); if (v >= 58 && v < 62 && u >= W / 2 - 11 && u < W / 2 + 3) return v === 58 ? "eed09c" : v === 61 ? "6e4524" : "ab7a44"; return "ece0c4"; };
      const s0 = render([box(0, 1, 3, W - 3, z0 + 3, z0 + Hh - 3, { top: col("ece0c4"), y: col("ece0c4"), x: col("ece0c4"), edge: null, noLine: true, tex: plate }), box(0, 2.6, 0, 3, z0, z0 + Hh, fr), box(0, 2.6, W - 3, W, z0, z0 + Hh, fr), box(0, 3.2, 0, W, z0 + Hh - 3, z0 + Hh, { ...fr, tex(f, p) { if (f === "x" && Math.floor(p[2]) === z0 + Hh - 3) return "ab7a44"; return null; } }), box(0, 2.6, 0, W, z0, z0 + 3, { ...fr, tex(f, p) { if (f === "x" && Math.floor(p[2]) === z0 + 2) return "ab7a44"; return null; } })]);
      /* one picture pixel to one screen pixel, stepping up the wall exactly as the wall does */
      const put = (X, Y, c) => { const q = (Y * s0.w + X) * 4; if (X < 0 || Y < 0 || X >= s0.w || Y >= s0.h) return; s0.rgba[q] = c[0]; s0.rgba[q + 1] = c[1]; s0.rgba[q + 2] = c[2]; s0.rgba[q + 3] = 255; };
      const uLeft = 11, vTop = 7, X0 = s0.ox + 1 - (y1 - uLeft), Y0 = s0.oy + Math.floor((1 + y1 - uLeft) / 2) - zt + vTop; for (let v = -1; v <= PH; v++) for (let u = -1; u <= PW; u++) { const c = u < 0 || v < 0 || u >= PW || v >= PH ? col("6a5a42") : tone(lum[v * PW + u]); put(X0 + u, Y0 + v - ((u + 1) >> 1), c); }
      return s0; };
    out.photo = photo("uk", 6, 170); out.photo_es = photo("es", 6, 170); out.photo_br = photo("br", 6, 170);
    /* a fire exit: a dark grey steel door as wide as the sign over it, a black outline round it and its little window, a push bar */
    /* and the staff door (8 Nov 2026, his: "a similar style to our fire exit but with no window or sign"): the same door without its window */
    for (const WIN of [true, false]) { const Hh = 66, W = 32, GR = { top: col("6a6e72"), y: col("3c3f43"), x: col("4a4d51"), edge: col(K) }, wy0 = W / 2 - 6, wy1 = W / 2 + 6;
      const door = (f, p) => { if (f !== "x") return null; const y = Math.floor(p[1]), z = Math.floor(p[2]); if (WIN && y >= wy0 && y < wy1 && z >= 38 && z < 54) { if (y === wy0 || y === wy1 - 1 || z === 38 || z === 53) return K; if (y === wy0 + 1 || z === 52) return "1c2024"; if (mod(y + z, 5) === 0) return "6e8c98"; return mod(y - z + 60, 14) < 3 ? "c8e0ea" : "8fb0bc"; } if (z < 6) return mod(y, 8) === 0 ? "2a2c30" : "606468"; if (z === 6) return K; return null; };
      const ps = [box(0, 1.5, 3, W - 3, 0, Hh - 3, { ...GR, tex: door }), box(0, 3.5, 0, 3, 0, Hh, OAK), box(0, 3.5, W - 3, W, 0, Hh, OAK), box(0, 4.5, -1, W + 1, Hh - 3, Hh + 1, OAK)];
      ps.push(box(3, 5, 6, W - 6, 27, 29.4, M("dfe3e7", "aab2ba", "6a727a", K)), box(1.5, 3.2, 6, 8.4, 25, 31, M("8d959d", "565c62", "3c4248", K)), box(1.5, 3.2, W - 8.4, W - 6, 25, 31, M("8d959d", "565c62", "3c4248", K)));
      for (const z of [10, 52]) ps.push(box(1.5, 2.6, 3, 4.6, z, z + 5, M("aab2ba", "7a838c", "4c545c", K)));
      if (WIN) { out.fireExit = render(ps, { depthEdge: true }); out.fireSign = fireSign(W / 2, Hh + 6); } else out.staffDoor = render(ps, { depthEdge: true }); }
    /* the stuffed rat's case: a shallow case with a baize back, the rat on a plinth with a bronze plate, glass over it all */
    { const W = 40, Hh = 30, z0 = 64, D = 9, F = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col(K) }, r0 = require("./old-items2.js").bakeRat().y[0], r = { ...r0, rgba: new Uint8ClampedArray(r0.rgba) };
      { const P = { g: "8b8b98", b: "6d6d7a", c: "53535e", i: "3c3c45", E: "050405", W: "f4f4fa", l: "a4a4b0" }, X = 12, set = (i, y, ch) => { const q = (y * r.w + X + i) * 4, v = col(P[ch]); r.rgba[q] = v[0]; r.rgba[q + 1] = v[1]; r.rgba[q + 2] = v[2]; r.rgba[q + 3] = 255; };
        /* the pink behind the eye becomes fur */
        [[7, 16, "g"], [8, 16, "b"], [7, 17, "b"], [8, 17, "b"], [9, 17, "c"], [8, 18, "c"], [9, 18, "i"]].forEach(q => set(...q));
        /* a two-by-two bead, one pixel of light in it */
        [[5, 17, "g"], [6, 17, "g"], [4, 18, "l"], [5, 18, "E"], [6, 18, "E"], [7, 18, "b"], [4, 19, "l"], [5, 19, "E"], [6, 19, "W"], [7, 19, "c"]].forEach(q => set(...q)); }
      const backing = render([box(-1, 1, 3, W - 3, z0 + 3, z0 + Hh - 3, { top: col("2a5a36"), y: col("1f4a2c"), x: col("23502f"), edge: null, tex(f, p) { if (f === "x" && mod(Math.floor(p[1]) + Math.floor(p[2]), 4) === 0) return "1f4a2c"; return null; } }), box(0, D, 0, 3, z0, z0 + Hh, F), box(0, D, 0, W, z0, z0 + 3, { ...F, top: col("c49660") })]);
      const plinth = render([box(1, 6, 9, 31, z0 + 3, z0 + 8, { top: col("7a4a2c"), y: col("5a3320"), x: col("432514"), edge: col(K), tex(f, p) { if (f !== "x") return null; const y = Math.floor(p[1]), z = Math.floor(p[2]); if (y >= 16 && y < 24 && z >= z0 + 4 && z < z0 + 7) return z === z0 + 6 ? "eed09c" : z === z0 + 4 ? "6e4524" : "ab7a44"; return null; } })]);
      const front = render([box(0, D, W - 3, W, z0, z0 + Hh, F), box(0, D, 0, W, z0 + Hh - 3, z0 + Hh, F), box(D - 1, D + 1, 0, 2, z0, z0 + Hh, F), box(D - 1, D + 1, W - 2, W, z0, z0 + Hh, F), box(D - 1, D + 1, 0, W, z0, z0 + 2, { ...F, top: col("c49660") }), box(D - 1, D + 1, 0, W, z0 + Hh - 2, z0 + Hh, F)]);
      out.ratCase = { backing, plinth, rat: r, front, W, Hh, z0, D };
    }
    return out;
}

/* ---- 42 ---- */
function hallWindow(W, bottom = 0, top = 78) {
    const FR = { top: col("93705a"), y: col("593422"), x: col("452313"), ny: col("34180b"), nx: col("34180b"), edge: col("120704") }, DK = M("593422", "452313", "34180b", "120704"), RL = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704") };
    const ps = [], Hh = top, b = bottom, bars = Math.max(1, Math.round(W / 26));
    ps.push(box(-10, 0, -3, 0, b, Hh, { ...FR, y: col("593422") }));
    /* the bottom: a single clean board across the opening and under the posts */
    if (b) ps.push(box(-10, 6, -5, W + 5, b - 3, b + 1, RL)); else ps.push(box(-10, 4, -4, W + 4, 0, 3, RL));
    const y0 = b ? b + 1 : 3;
    ps.push(box(0, 3.5, -4, 1, y0, Hh + 3, { ...FR, tex: A.groove }), box(0, 3.5, W - 1, W + 4, y0, Hh + 3, { ...FR, tex: A.groove }));
    ps.push(box(0, 5, -5, W + 5, Hh, Hh + 4, RL));
    /* the inner frame, dark wood all round */
    ps.push(box(-3, -1, 1, 2, y0, Hh, DK), box(-3, -1, W - 2, W - 1, y0, Hh, DK), box(-3, -1, 1, W - 1, Hh - 2, Hh, DK), box(-3, -1, 1, W - 1, y0, y0 + 2, DK));
    for (let i = 1; i <= bars; i++) { const y = W * i / (bars + 1); ps.push(box(-5, -3, y - 1, y + 1, y0, Hh, FR)); }
    const rails = Hh - b > 90 ? [b + (Hh - b) * .33, b + (Hh - b) * .66] : [b + (Hh - b) * .55];
    for (const z of rails) ps.push(box(-5, -3, 1, W - 1, z - 1, z + 1, FR));
    return { sprite: render(ps, { wall: { at: 0, inside: (y, z) => y > 0 && y < W && z >= y0 && z < Hh } }), W, b, Hh, bars, rails };
}
/* the garland: baubles hanging from the strand itself on a short cap, in more colours */
function garland() {
    const ps = [], LEN = 150, zAt = i => 92 - Math.abs(Math.sin(i / 26 * Math.PI)) * 7; for (let i = 0; i < LEN; i += 2.4) ps.push(ball(1.5, i, zAt(i), 2.4, { ramp: ["0f3019", "174a27", "1f5f33", "2b7a44"], edge: col("071a0c"), noLine: true }));
    const s = render(ps, { crease: false }), spots = []; for (let i = 6.5; i < LEN; i += 13) spots.push([Math.round(s.ox + 1.5 - i), Math.round(s.oy + (1.5 + i) / 2 - zAt(i) + 1)]);
    return { s, spots };
}

/* ---- 53: the hole, one clean arch on the 2:1 line of the skirting ---- */
function hole(axis) {
    const W = 11, Hh = 9, c = (W - 1) / 2, w = W + 2, h = Hh + 10, rgba = new Uint8ClampedArray(w * h * 4), set = (x, y, hex) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const v = col(hex), q = (y * w + x) * 4; rgba[q] = v[0]; rgba[q + 1] = v[1]; rgba[q + 2] = v[2]; rgba[q + 3] = 255; };
    const rise = u => axis === "x" ? -(u >> 1) : -((W - 1 - u) >> 1), Bot = Hh + 7;
    const top = u => Math.round(Hh * Math.sqrt(Math.max(0, 1 - ((u - c) / (c + .4)) ** 2)));
    for (let u = 0; u < W; u++) { const t = top(u), X = u + 1, Y0 = Bot + rise(u); for (let v = 0; v <= t; v++) { let hx = "0a0604"; if (axis === "x" ? u === W - 1 || u === W - 2 : u < 2) hx = "1c0f07"; if (v === 0) hx = "1a0e06"; set(X, Y0 - v, v === t ? K : hx); } set(X, Y0 - t - 1, "120704"); }
    return { w, h, ox: 1 + (W >> 1), oy: Bot + rise(W >> 1), rgba };
}

module.exports = { setSignMirror, stoneAt, fbm, FIRE, SIGN_GREEN, SIGN_LIT, SIGN_WHITE, desk, bell, signOut, key, peel, PEELS, ghost, damp, bite, bookDoor, passage, staffRoom, lights, hotelItems, hallWindow, garland, hole, setW, mulW, stamp, BZ };
