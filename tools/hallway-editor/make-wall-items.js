/* The wall items: the real hallway's own pictures, read from the client's hallway cast, and new paintings made to hang with them.
   The new ones are painted flat in code with limited colours and ordered dither, like the client's, then slanted 2:1 onto the wall.
   Run again if the art changes: node tools/hallway-editor/make-wall-items.js */
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../.."), { openCast, readMember, unpackBits, readClut } = require(ROOT + "/tools/cct-extract.js"), { encodePng } = require(ROOT + "/tools/png-encode.js");
const CAST = "C:/Users/cjboy/Documents/Offline Client/hh_room_hallway.cct", OUT = path.join(__dirname, "art", "wall");
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

/* ---- from the client ---- */
const cast = openCast(CAST), clut = id => readClut(cast.chunk(cast.byId.get(cast.childOf.get(id + ":CLUT"))));
const PAL1 = clut(625), PAL2 = clut(676);
function member(name, pal) {
    for (const e of cast.res.filter(x => x.tag === "CASt")) {
        const m = readMember(cast.chunk(e)); if (!m || m.name !== name) continue;
        const b = m.bitmap, raw = cast.chunk(cast.byId.get(cast.childOf.get(e.id + ":BITD"))), idx = raw.length === b.pitch * b.h ? raw : unpackBits(raw, b.pitch * b.h), rgba = Buffer.alloc(b.w * b.h * 4);
        for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const v = idx[y * b.pitch + x], o = (y * b.w + x) * 4; if (!v) continue; const c = pal[v]; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; }
        return { w: b.w, h: b.h, rgba };
    }
    throw new Error("no " + name);
}

/* ---- painting kit ---- */
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(r => r.map(v => (v + .5) / 16 - .5));
class Canvas {
    constructor(w, h) { this.w = w; this.h = h; this.d = new Float32Array(w * h * 3); }
    px(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const q = (y * this.w + x) * 3; this.d[q] = c[0]; this.d[q + 1] = c[1]; this.d[q + 2] = c[2]; }
    /* a fill from a function of (x, y) */
    fill(fn, x0 = 0, y0 = 0, x1 = this.w, y1 = this.h) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const c = fn(x, y); if (c) this.px(x, y, c); } }
    ell(cx, cy, rx, ry, c) { this.fill((x, y) => (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1 ? (typeof c === "function" ? c(x, y) : c) : null)); }
    rect(x0, y0, w, h, c) { this.fill(() => c, x0, y0, x0 + w, y0 + h); }
    poly(pts, c) { this.fill((x, y) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [a, b] = pts[i], [e, f] = pts[j]; if ((b > y + .5) !== (f > y + .5) && x + .5 < (e - a) * (y + .5 - b) / (f - b) + a) inside = !inside; } return inside ? (typeof c === "function" ? c(x, y) : c) : null; }); }
    line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) this.px(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); }
    /* down to its colours, with the client's ordered dither */
    quantise(pal, amount = 34) {
        const P = pal.map(hex), o = [];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            const q = (y * this.w + x) * 3, t = BAYER[y & 3][x & 3] * amount; let best = P[0], bd = 1e12;
            for (const c of P) { const dr = this.d[q] + t - c[0], dg = this.d[q + 1] + t - c[1], db = this.d[q + 2] + t - c[2], dd = dr * dr * .3 + dg * dg * .59 + db * db * .11; if (dd < bd) { bd = dd; best = c; } }
            o.push(best);
        }
        return { w: this.w, h: this.h, at: (x, y) => o[y * this.w + x] };
    }
}
const mix = (a, b, t) => { t = Math.max(0, Math.min(1, t)); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
const noise = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
const soft = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), f = t => t * t * (3 - 2 * t), u = f(x - xi), v = f(y - yi); return (noise(xi, yi) * (1 - u) + noise(xi + 1, yi) * u) * (1 - v) + (noise(xi, yi + 1) * (1 - u) + noise(xi + 1, yi + 1) * u) * v; };
const fbm = (x, y) => soft(x, y) * .55 + soft(x * 2.1, y * 2.1) * .3 + soft(x * 4.3, y * 4.3) * .15;

/* the three frames, each from a real one: rings from the outside in */
const FRAMES = {
    /* the stormy seas frame, with its carved bosses */
    carved: { rings: ["000000", "975624", "975624", "67390d", "000000"], carve: ["975624", "67390d"], boss: "975624", bossDark: "331804" },
    /* the glass panel's stepped wood */
    stepped: { rings: ["2d2010", "b39a7b", "9c774b", "644b2d", "2d2010"] },
    /* the little gilt frames */
    gilt: { rings: ["000000", "dc823a", "000000"], dots: ["f2ce62", "dc823a"] },
};
/* frame + picture, flat, then slanted down to the right as an x wall sees it */
function hang(pic, frameName) {
    const F = FRAMES[frameName], n = F.rings.length, boss = F.boss ? 1 : 0, W = pic.w + n * 2 + boss * 2, H = pic.h + n * 2 + boss * 2, flat = new Array(W * H).fill(null);
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) flat[y * W + x] = hex(c); };
    for (let r = 0; r < n; r++) {
        const x0 = boss + r, y0 = boss + r, x1 = W - 1 - boss - r, y1 = H - 1 - boss - r;
        const col = i => { if (F.dots && r === 1) return F.dots[(i >> 1) & 1]; if (F.carve && r === 2) return F.carve[(i >> 1) & 1]; return F.rings[r]; };
        for (let x = x0; x <= x1; x++) { set(x, y0, col(x)); set(x, y1, col(x)); }
        for (let y = y0; y <= y1; y++) { set(x0, y, col(y)); set(x1, y, col(y)); }
    }
    for (let y = 0; y < pic.h; y++) for (let x = 0; x < pic.w; x++) flat[(y + boss + n) * W + x + boss + n] = pic.at(x, y);
    if (F.boss) for (const [cx, cy] of [[3, 3], [W - 4, 3], [3, H - 4], [W - 4, H - 4]]) {
        for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { const d = x * x + y * y; if (d <= 10) set(cx + x, cy + y, d > 5 ? "000000" : d === 0 ? "c98a4a" : (x + y) > 0 ? F.bossDark : F.boss); }
    }
    const oh = H + (W >> 1) + 1, rgba = Buffer.alloc(W * oh * 4);
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) { const c = flat[y * W + x]; if (!c) continue; const q = ((y + (x >> 1)) * W + x) * 4; rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; rgba[q + 3] = 255; }
    return { w: W, h: oh, rgba };
}

/* ---- the paintings ---- */
const SCENES = [];
const scene = (id, name, frame, w, h, pal, draw, amount) => SCENES.push({ id, name, frame, w, h, pal, draw, amount });

scene("calm_seas", "Calm seas at sunset", "carved", 44, 26, ["1b2a3a", "2f4a5c", "54707c", "8a8f86", "c9a77a", "e2b064", "d9703f", "9c3f33", "5e2a33", "000000", "f4e0a6"], c => {
    const sea = 16;
    c.fill((x, y) => mix(hex("5e2a33"), mix(hex("d9703f"), hex("f0c070"), (y - 8) / 8), y / 9), 0, 0, 44, sea);
    c.ell(30, sea, 6, 6, hex("f4e0a6"));
    c.fill((x, y) => { const t = (y - sea) / 10, g = Math.abs(x - 30) < 3 + t * 5 && soft(x * .9, y * 2.2) > .42; return g ? hex("e2b064") : mix(hex("54707c"), hex("1b2a3a"), t + (soft(x * .35, y * 1.7) - .5) * .7); }, 0, sea, 44, 26);
    /* a far headland, and a ship in silhouette */
    c.fill((x, y) => (y > sea - 1 - 3 * Math.max(0, 1 - x / 13) - fbm(x * .3, 3) * 1.5 ? hex("5e2a33") : null), 0, 11, 15, sea);
    const K = hex("000000");
    c.poly([[10, 18], [22, 18], [20, 21], [12, 21]], K); c.rect(15, 7, 1, 11, K); c.rect(19, 9, 1, 9, K);
    c.poly([[11, 9], [15, 8], [15, 16], [11, 16]], hex("c9a77a")); c.poly([[16, 8], [19, 10], [19, 16], [16, 16]], hex("c9a77a"));
}, 22);

scene("moonlit_maze", "Moonlit maze", "carved", 44, 26, ["0d1626", "1a2a44", "33486a", "6f83a0", "f0ecd0", "0e2a1c", "1c4630", "2f6a44", "4f8d5d", "1a1d1c"], c => {
    const hz = 11;
    c.fill((x, y) => mix(hex("0d1626"), hex("33486a"), y / hz), 0, 0, 44, hz);
    c.ell(34, 5, 3.5, 3.5, hex("f0ecd0")); for (const [x, y] of [[5, 2], [11, 5], [18, 2], [24, 6], [41, 8], [28, 1]]) c.px(x, y, hex("f0ecd0"));
    c.fill((x, y) => (y > hz - 2.5 - fbm(x * .18, 1) * 3 ? hex("0e2a1c") : null), 0, 6, 44, hz);
    /* a maze seen from up on a hill, its walls lit on top */
    /* a maze from up on a hill: hedge rows with moonlit tops, each row a little deeper as it comes nearer */
    const M = ["###########", "#...#.....#", "#.#.#.###.#", "#.#...#...#", "#.#####.#.#", "#.......#.#", "#####.###.#"], rows = [2, 2, 2, 2, 2, 3, 2];
    c.fill(() => hex("0e2a1c"), 0, hz, 44, 26);
    let top = hz + 1;
    M.forEach((r, j) => {
        const h = rows[j];
        for (let y = top; y < top + h && y < 26; y++) for (let x = 0; x < 44; x++) {
            const skew = (x - 22) * (1 - (y - hz) / 40) + 22, i = Math.floor((skew - 0) / 4); const on = r[i] === "#", edge = i < 0 || i > 10;
            c.px(x, y, edge ? hex("0e2a1c") : on ? (y === top ? hex("4f8d5d") : hex("1c4630")) : (j > 0 && M[j - 1][i] === "#" && y === top ? hex("1c4630") : hex("33486a")));
        }
        top += h;
    });
}, 16);

scene("gentleman_rat", "The founder", "carved", 26, 34, ["1a1010", "33201a", "553226", "7a5a44", "9a9088", "c8c0b4", "e8a0a0", "7a1f1f", "b03030", "000000", "e8d8a0", "2a1810"], c => {
    c.fill((x, y) => mix(hex("553226"), hex("1a1010"), Math.hypot(x - 13, y - 13) / 19));
    /* the coat */
    c.poly([[2, 34], [5, 24], [10, 21], [17, 21], [22, 25], [24, 34]], (x, y) => mix(hex("b03030"), hex("7a1f1f"), (x - 6) / 14));
    c.poly([[10, 21], [13, 27], [17, 21]], hex("e8d8a0")); c.poly([[12, 23], [13, 25], [15, 23]], hex("000000"));
    c.rect(13, 28, 1, 1, hex("e8d8a0")); c.rect(13, 31, 1, 1, hex("e8d8a0"));
    /* ears, behind */
    c.ell(7, 8, 4, 4.5, hex("7a5a44")); c.ell(7, 8, 2.4, 2.9, hex("e8a0a0"));
    c.ell(19, 7, 4, 4.5, hex("7a5a44")); c.ell(19, 7, 2.4, 2.9, hex("e8a0a0"));
    /* the head, three quarters on, snout down to the right */
    c.ell(13, 13, 7, 7, (x, y) => mix(hex("c8c0b4"), hex("7a5a44"), (x * .4 + y * .6 - 8) / 10));
    c.poly([[9, 15], [18, 12], [21, 17], [20, 20], [14, 21]], (x, y) => mix(hex("c8c0b4"), hex("9a9088"), (y - 12) / 9));
    c.ell(20.2, 18, 1.5, 1.3, hex("e8a0a0"));
    c.ell(11, 11, 1.4, 1.6, hex("000000")); c.ell(17, 10.5, 1.3, 1.5, hex("000000")); c.px(10, 10, hex("e8d8a0")); c.px(16, 10, hex("e8d8a0"));
    /* whiskers */
    c.line(17, 18, 11, 19, hex("1a1010")); c.line(17, 19, 12, 21, hex("1a1010")); c.line(21, 19, 25, 21, hex("c8c0b4"));
}, 14);

scene("golden_key", "The golden key", "stepped", 26, 34, ["241014", "3e1a1e", "5e2a2c", "7c3c38", "5a3a10", "9a6a1c", "dca63a", "f6e08a", "000000"], c => {
    c.fill((x, y) => mix(hex("5e2a2c"), hex("241014"), Math.hypot(x - 13, y - 14) / 20 + (fbm(x * .4, y * .4) - .5) * .4));
    const G = (x, y) => mix(hex("f6e08a"), hex("dca63a"), (x + y - 12) / 30);
    /* bow, stem and bit, standing upright */
    c.ell(13, 9, 7.5, 7.5, hex("5a3a10")); c.ell(13, 9, 6.5, 6.5, G); c.ell(13, 9, 3.4, 3.4, hex("5a3a10")); c.ell(13, 9, 2.6, 2.6, hex("3e1a1e"));
    c.rect(12, 15, 3, 15, G); c.rect(11, 17, 5, 1, hex("dca63a"));
    c.rect(15, 22, 6, 3, G); c.rect(15, 26, 5, 3, G); c.rect(18, 25, 2, 1, hex("9a6a1c")); c.rect(17, 22, 1, 3, hex("5a3a10")); c.rect(17, 26, 1, 3, hex("5a3a10"));
    c.fill((x, y) => (x === 14 && y > 15 && y < 30 ? hex("5a3a10") : null));
    c.px(9, 5, hex("f6e08a")); c.px(10, 4, hex("f6e08a"));
}, 16);

scene("maze_plan", "Plan of the maze", "stepped", 34, 26, ["e8d8ac", "d0b880", "b09660", "8a6a3c", "5a3a1c", "2a1810", "a02020"], c => {
    c.fill((x, y) => mix(hex("e8d8ac"), hex("b09660"), Math.max(Math.abs(x - 17) / 17, Math.abs(y - 13) / 13) ** 3 + (fbm(x * .3, y * .3) - .5) * .35));
    const L = hex("2a1810"), M = ["11111110111111111", "10000010000000001", "10111010111111101", "10100010100000101", "10101110101110101", "10100000101000101", "10111111101011101", "10000000001000001", "11111101111111111"];
    M.forEach((r, j) => [...r].forEach((v, i) => { if (v === "1") { c.px(1 + i * 2 - 0, 4 + j * 2, L); if (r[i + 1] === "1") c.px(2 + i * 2, 4 + j * 2, L); if (M[j + 1] && M[j + 1][i] === "1") c.px(1 + i * 2, 5 + j * 2, L); } }));
    /* the X, and the way in */
    const R = hex("a02020"); c.line(14, 12, 18, 16, R); c.line(18, 12, 14, 16, R);
    c.rect(4, 1, 26, 1, hex("5a3a1c"));
}, 12);

scene("autumn_wood", "Autumn wood", "gilt", 30, 22, ["f0d890", "e0a050", "c86a2a", "9c3f20", "6a2a1a", "3a1c14", "6a7a3a", "3e4a22", "20180f"], c => {
    c.fill((x, y) => mix(hex("f0d890"), hex("e0a050"), y / 15), 0, 0, 30, 16);
    c.fill((x, y) => mix(hex("6a7a3a"), hex("3e4a22"), (y - 15) / 7 + (soft(x * .3, y) - .5) * .6), 0, 15, 30, 22);
    for (const [x, b, w] of [[5, 17, 6], [24, 18, 7], [14, 16, 5]]) {
        c.rect(x, b - 8, 2, 9, hex("20180f"));
        c.ell(x + 1, b - 11, w, 7, (X, Y) => { const n = fbm(X * .55, Y * .55); return n > .62 ? hex("e0a050") : n > .46 ? hex("c86a2a") : n > .36 ? hex("9c3f20") : hex("6a2a1a"); });
    }
    /* the path going away */
    c.poly([[12, 22], [19, 22], [16, 15], [15, 15]], hex("c86a2a"));
}, 14);

scene("still_life", "Flowers in a blue jug", "gilt", 22, 28, ["1e1a22", "322a34", "4a3e44", "2f5d80", "6a9cbc", "c8e0ea", "b02a30", "e06060", "f2ce62", "3e6a3a", "1f3a20"], c => {
    c.fill((x, y) => mix(hex("4a3e44"), hex("1e1a22"), Math.hypot(x - 11, y - 11) / 17));
    c.rect(0, 23, 22, 5, hex("322a34"));
    for (const [x0, y0, x1, y1] of [[11, 18, 6, 9], [11, 18, 11, 6], [11, 18, 16, 8], [11, 18, 4, 13], [11, 18, 18, 13]]) c.line(x0, y0, x1, y1, hex("3e6a3a"));
    c.ell(14, 12, 2, 1.2, hex("3e6a3a")); c.ell(7, 13, 2, 1.2, hex("1f3a20"));
    for (const [x, y, k] of [[6, 8, "b02a30"], [11, 5, "e06060"], [16, 7, "f2ce62"], [4, 13, "f2ce62"], [18, 13, "b02a30"]]) { c.ell(x, y, 2.6, 2.6, hex(k)); c.px(x, y, hex(k === "f2ce62" ? "b02a30" : "f2ce62")); }
    c.poly([[8, 17], [14, 17], [15, 20], [14, 25], [8, 25], [7, 20]], (x, y) => mix(hex("6a9cbc"), hex("2f5d80"), (x - 7) / 8));
    c.px(9, 19, hex("c8e0ea")); c.px(9, 20, hex("c8e0ea")); c.rect(7, 25, 8, 1, hex("1e1a22"));
}, 10);

scene("old_mountains", "Mountains at dawn", "stepped", 40, 22, ["6a7fa0", "9fb0c0", "e0c8b0", "f0a890", "ffffff", "4a5a70", "2e3c50", "1c3a2c", "2c5a40"], c => {
    c.fill((x, y) => mix(hex("6a7fa0"), hex("f0a890"), y / 13));
    const ridge = (x, base, amp, f) => base - amp * Math.abs(Math.sin(x * f) + Math.sin(x * f * 2.3 + 1) * .4);
    c.fill((x, y) => { const r = ridge(x, 16, 11, .13); if (y < r) return null; return y < r + 3 ? hex("ffffff") : x % 7 < 3 + (y % 2) ? hex("4a5a70") : hex("6a7fa0"); });
    c.fill((x, y) => (y > ridge(x + 13, 19, 6, .2) ? hex("2e3c50") : null));
    c.fill((x, y) => (y > 18 + Math.sin(x * .4) * 1.2 ? mix(hex("2c5a40"), hex("1c3a2c"), (y - 18) / 4) : null));
}, 12);

/* little gilt trio from the real one, with pictures where the client's are blank */
function giltTrio(real) {
    const pics = [ // landscape, silhouette, flower
        (x, y) => (y < 6 ? hex("9fc0d8") : y < 7 ? hex("f0d890") : hex("4a7a44")),
    ];
    const o = { w: real.w, h: real.h, rgba: Buffer.from(real.rgba) };
    const isBlank = q => { const r = o.rgba[q], g = o.rgba[q + 1], b = o.rgba[q + 2]; return o.rgba[q + 3] >= 128 && r === g && g === b && r > 100; };
    /* each frame's blank, found as its own run of columns */
    let spans = [], inS = false, start = 0;
    for (let x = 0; x < o.w; x++) { let any = false; for (let y = 0; y < o.h; y++) if (isBlank((y * o.w + x) * 4)) { any = true; break; } if (any && !inS) { inS = true; start = x; } if (!any && inS) { inS = false; spans.push([start, x]); } }
    spans.forEach(([a, b], n) => {
        for (let x = a; x < b; x++) {
            let top = -1; for (let y = 0; y < o.h; y++) if (isBlank((y * o.w + x) * 4)) { top = y; break; }
            for (let y = top; y < o.h; y++) {
                const q = (y * o.w + x) * 4; if (!isBlank(q)) continue;
                const u = x - a, v = y - top, w = b - a; let c;
                if (n === 0) c = v < 5 ? (noise(u, v) > .8 ? hex("e8eef0") : hex("9fc0d8")) : v < 6 ? hex("f0d890") : v < 10 ? hex("4a7a44") : hex("2c5a30");
                else if (n === 1) { const d = Math.hypot(u - (w - 1) / 2, (v - 4) * .9), body = Math.hypot((u - (w - 1) / 2) / 3.6, (v - 12) / 4.5) < 1; c = d < 2.6 || body ? hex("241414") : hex("d8c090"); }
                else { const d = Math.hypot(u - (w - 1) / 2, v - 4); c = d < 1 ? hex("f2ce62") : d < 3 ? hex("b02a30") : (u === (w >> 1) && v > 6) ? hex("3e6a3a") : hex("e8e0c8"); }
                o.rgba[q] = c[0]; o.rgba[q + 1] = c[1]; o.rgba[q + 2] = c[2];
            }
        }
    });
    return o;
}

/* ---- out ---- */
fs.mkdirSync(OUT, { recursive: true }); for (const f of fs.readdirSync(OUT)) if (!f.startsWith("i_")) fs.rmSync(path.join(OUT, f));   // i_* are make-ideas-art.js's
const items = [];
const centred = (f, w, h, flip) => ({ w, h, layers: [{ f, x: -(w >> 1), y: -(h >> 1), flip: flip ? 1 : 0 }] });
function add(id, name, kind, art) {
    const f = id + ".png"; fs.writeFileSync(path.join(OUT, f), encodePng(art.w, art.h, art.rgba));
    items.push({ id, name, kind, x: centred(f, art.w, art.h, false), y: centred(f, art.w, art.h, true), _art: art });
}
const pntg = member("hw_pntg_a_0_0_0", PAL1);
add("h_painting1", "Stormy seas", "painting", member("hw_painting1_a_0_4_0", PAL1));
add("h_painting2", "Glass panel", "painting", member("hw_painting2_a_0_4_0", PAL2));
add("h_pntg", "Little gilt frames", "painting", pntg);
for (const s of SCENES) {
    const c = new Canvas(s.w, s.h); s.draw(c);
    add("p_" + s.id, s.name, "custom", hang(c.quantise(s.pal, s.amount), s.frame));
}
add("p_gilt_trio", "Little gilt pictures", "custom", giltTrio(pntg));
let kept = [], keptFloor = {}; try { const was = require(path.join(__dirname, "wall-items.js")); kept = was.filter(i => String(i.id).startsWith("i_")); keptFloor = was.floor || {}; } catch (e) { /* first run */ }
const list = [...items.map(({ _art, ...i }) => i), ...kept];
fs.writeFileSync(path.join(__dirname, "wall-items.js"), `/* made by make-wall-items.js and make-ideas-art.js */\n(function () { const L = ${JSON.stringify(list)}, F = ${JSON.stringify(keptFloor)}; if (typeof module !== "undefined") { module.exports = L; L.floor = F; } else { window.WALL_ITEMS = L; window.FLOOR_PIECES = F; } })();\n`);
console.log(items.length, "items:", items.map(i => i.name + " " + i._art.w + "x" + i._art.h).join(", "));
/* a contact sheet, on the wall's colours, when asked */
if (process.argv[2]) {
    const S = 4, cols = 4, cw = 72 * S, ch = 84 * S, rows = Math.ceil(items.length / cols), TW = cw * cols, TH = ch * rows, o = Buffer.alloc(TW * TH * 4);
    for (let i = 0; i < TW * TH; i++) { const x = i % TW, st = ((x / S | 0) % 32) < 16; o[i * 4] = st ? 0x4a : 0x7e; o[i * 4 + 1] = st ? 0x52 : 0x58; o[i * 4 + 2] = st ? 0x52 : 0x4c; o[i * 4 + 3] = 255; }
    items.forEach((it, n) => { const a = it._art, ox = (n % cols) * cw + ((cw - a.w * S) >> 1), oy = (n / cols | 0) * ch + ((ch - a.h * S) >> 1); for (let y = 0; y < a.h * S; y++) for (let x = 0; x < a.w * S; x++) { const s = ((y / S | 0) * a.w + (x / S | 0)) * 4; if (a.rgba[s + 3] < 128) continue; const p = ((oy + y) * TW + ox + x) * 4; o[p] = a.rgba[s]; o[p + 1] = a.rgba[s + 1]; o[p + 2] = a.rgba[s + 2]; } });
    fs.writeFileSync(process.argv[2], encodePng(TW, TH, o));
}
