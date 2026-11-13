/* The Events Gallery's pieces, as signed off in the mock-ups (rounds 3–11, 11–12 Nov 2026), moved in from the scratch drawing code.
   The Hallway's own 2:1 projection, a tile = 16 units each way, lit from the left: top lightest, the left face next, the right face darkest.
   Used by make-gallery-art.js, which writes the pictures the editor and renderer use. */
"use strict";
const path = require("path"), fs = require("fs");
const X = require("./px.js"), H = X.hex, SRC = path.join(__dirname, "src") + "/";
const K = H("0e0805");
const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
const ramp = hexes => hexes.map(H);
const P0 = (ox, oy) => (x, y, z) => [ox + x - y, oy + (x + y) / 2 - z];
const outline = (o, c = K) => X.outline(o, c);
const GOLD = ramp(["fff6d8", "fbe3a2", "f0c878", "dca654", "b88234", "8a5a1c", "5c370c"]);

/* ---- little lettering: 7-pixel capitals ---- */
const GL = {
    E: ["#####", ".##.#", ".##..", ".###.", ".##..", ".##.#", "#####"], V: ["##.##", "##.##", "##.##", "##.##", ".#.#.", ".###.", "..#.."],
    N: ["##..#", "###.#", "#.###", "#..##", "#..##", "#..##", "#..##"], T: ["######", "#.##.#", "..##..", "..##..", "..##..", "..##..", ".####."],
    S: [".####", "##..#", "##...", ".###.", "...##", "#..##", "####."], " ": ["...", "...", "...", "...", "...", "...", "..."]
};
function text(o, s, x0, y0, col, shadow, hiCol) { let x = x0; for (const ch of s) { const g = GL[ch] || GL[" "]; for (let y = 0; y < 7; y++) for (let i = 0; i < g[0].length; i++) if (g[y][i] === "#") { if (shadow) X.set(o, x + i + 1, y0 + y + 1, shadow); X.set(o, x + i, y0 + y, hiCol && (y === 0 || g[y - 1][i] !== "#") ? hiCol : col); } x += g[0].length + 1; } return x - x0 - 1; }
const textW = s => [...s].reduce((w, ch) => w + (GL[ch] || GL[" "])[0].length + 1, -1);

/* a flat image on a plane in the room: top-left at world O, each pixel U across and V down */
function plane(o, P, img, O, U, V) {
    for (let j = 0; j < img.h; j++) for (let i = 0; i < img.w; i++) {
        const c = X.get(img, i, j); if (!c || c[3] < 128) continue;
        for (const [di, dj] of [[.15, .15], [.6, .15], [.15, .6], [.6, .6]]) { const w = [O[0] + U[0] * (i + di) + V[0] * (j + dj), O[1] + U[1] * (i + di) + V[1] * (j + dj), O[2] + U[2] * (i + di) + V[2] * (j + dj)], s = P(...w); X.set(o, Math.floor(s[0]), Math.floor(s[1]), c.slice(0, 3)); }
    }
}

/* ---- the Game Hall lobby's furniture: each of its own colours mapped to a new one (cream cushions, deep brown arms, walnut tables) ---- */
const hx = c => c.slice(0, 3).map(v => v.toString(16).padStart(2, "0")).join("");
function recolour(name, map) { const src = X.load(SRC + "lobby/" + name + ".png"), o = X.img(src.w, src.h); for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = X.get(src, x, y); if (!c) continue; const to = map[hx(c)]; X.set(o, x, y, to ? H(to) : c.slice(0, 3), c[3]); } return o; }
const SOFA = { "990033": "efe3c6", "660033": "d6c39c", "330033": "a68f68", "cc9933": "7a5232", "996633": "5a3a22", "663333": "40261a" };
const TABLE = { "996633": "c08a52", "663333": "8a5a34", "330033": "5a361e", "cc9933": "e0b070" };
/* the client's registration points */
const REG = { gl_sofaa_a_0_4_0: [-2, 23], gl_sofab_a_0_4_0: [-2, 25], gl_sofac_a_0_4_0: [-2, 25], gl_chair_a_0_4_0: [-2, 18], gl_table_a_0_6_0: [-7, 20], gl_tablea_a_0_6_0: [0, 19], gl_sofatable_a_0_4_0: [-2, 17] };
const LOBBY = Object.keys(REG).map(n => ({ src: n, img: recolour(n, /sofa[abc]_|chair/.test(n) ? SOFA : TABLE), reg: REG[n] }));

/* ---- shading ---- */
const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dith = (v, x, y) => Math.floor(v) + ((v - Math.floor(v)) * 16 > B4[y & 3][x & 3] + .5 ? 1 : 0);
const rampOf = (base, n = 6, warm = [255, 248, 230], cool = [20, 14, 18]) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return t < .35 ? mix(warm, base, t / .35 * .85 + .15) : mix(base, cool, (t - .35) / .65 * .75); });

/* ---- the turned thing, painted: tex(angle, h) -> a ramp key; light from the upper left, a rim of light on the far right ---- */
function turned(o, P, x, y, z, prof0, ramps, tex0, opt = {}) {
    const SC = opt.scale || 1, prof = prof0.map(([h, r]) => [h * SC, r * (1 + (SC - 1) * .8)]), tex = (a, h, x2, y2) => tex0(a, h / SC, x2, y2);
    const c0 = P(x, y, 0), at = h => { for (let i = 0; i + 1 < prof.length; i++) { const [h0, r0] = prof[i], [h1, r1] = prof[i + 1]; if (h >= h0 && h <= h1) return h1 === h0 ? r1 : r0 + (r1 - r0) * (h - h0) / (h1 - h0); } return null; };
    const top = prof[prof.length - 1][0];
    for (let h = prof[0][0]; h <= top + .01; h += .5) {
        const r = at(Math.min(h, top)); if (!r) continue; const rx = r * Math.SQRT2, ry = r / Math.SQRT2, cy = c0[1] - z - h;
        const dr = (at(Math.min(top, h + .5)) || r) - (at(Math.max(prof[0][0], h - .5)) || r), up = Math.max(-1.2, Math.min(1.2, -dr * 1.6));
        for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++) for (let xx = Math.floor(c0[0] - rx); xx <= Math.ceil(c0[0] + rx); xx++) {
            const u = (xx + .5 - c0[0]) / rx, v = (yy + .5 - cy) / ry; if (u * u + v * v > 1) continue;
            const ang = Math.asin(Math.max(-1, Math.min(1, u))), hh = h + (v > 0 ? -v * ry * .5 : 0);
            const key = tex(ang, hh, xx, yy); if (!key) continue; const R = ramps[key];
            let l = .5 - u * .55 + up * .35 + (v < -.2 && up > .4 ? .3 : 0);
            if (u > .8) l += .22;
            const t = (1 - Math.max(0, Math.min(1.1, l))) * (R.length - 1.3);
            const i = Math.max(0, Math.min(R.length - 1, opt.dither ? dith(t, xx, yy) : Math.round(t)));
            X.set(o, xx, yy, R[i]);
            if (opt.gloss && Math.abs(u + .5) < .07 && hh / SC > opt.gloss[0] && hh / SC < opt.gloss[1]) X.set(o, xx, yy, R[0]);
        }
    }
    const rT = at(top), cyT = c0[1] - z - top;
    if (opt.mouth) { X.ellipse(o, c0[0], cyT, Math.max(.6, rT * Math.SQRT2 - 1), Math.max(.4, rT / Math.SQRT2 - .5), opt.mouth); X.ellipse(o, c0[0] + .6, cyT + .4, Math.max(.4, rT * Math.SQRT2 - 2), Math.max(.3, rT / Math.SQRT2 - 1), mix(opt.mouth, K, .4)); }
    return [c0[0], cyT];
}

/* ---- plinths: anchor = the tile's middle ---- */
function canvas(w = 80, h = 150) { const o = X.img(w, h), ax = w / 2, ay = h - 30; return { o, P: P0(ax, ay - 8), ax, ay }; }
function finish(c) { const out = outline(c.o), bb = X.bounds(out); return { img: X.crop(out, bb.x0, bb.y0, bb.w, bb.h), ax: c.ax + 1 - bb.x0, ay: c.ay + 1 - bb.y0 }; }
const MARBLE = { top: H("fbf8f1"), topEdge: H("ffffff"), L: [H("ece6da"), H("ddd5c6"), H("c9bfac"), H("b0a58f")], R: [H("cfc6b4"), H("bdb3a0"), H("a99e88"), H("8f846e")] };
const BLACK = { top: H("55555e"), topEdge: H("7a7a86"), L: [H("3a3a42"), H("303037"), H("26262c"), H("1c1c21")], R: [H("2a2a30"), H("222227"), H("1a1a1e"), H("131316")] };
function face(o, P, x, y, z, a, b, h, S, opt = {}) {
    const st = .34, set = (p, c) => X.set(o, Math.floor(p[0]), Math.floor(p[1]), c);
    for (let u = 0; u < a; u += st) for (let v = 0; v < h; v += st) set(P(x + u, y + b, z + v), S.L[v > h - (opt.capShadow || 0) ? 2 : 0]);
    for (let u = 0; u < b; u += st) for (let v = 0; v < h; v += st) set(P(x + a, y + u, z + v), S.R[v > h - (opt.capShadow || 0) ? 2 : 0]);
    for (let u = 0; u < a; u += st) for (let v = 0; v < b; v += st) set(P(x + u, y + v, z + h), S.top);
    const l = (p, q, c) => X.line(o, p[0], p[1], q[0], q[1], c);
    l(P(x, y + b, z + h), P(x + a, y + b, z + h), S.topEdge); l(P(x + a, y, z + h), P(x + a, y + b, z + h), S.topEdge);
    l(P(x + a, y + b, z + .3), P(x + a, y + b, z + h - .3), opt.corner || S.L[0]);
}
function panel(o, P, axis, at, line, u0, u1, z0, z1, S) {
    const pt = (u, z) => axis === "x" ? P(u, line, z) : P(line, u, z), F = axis === "x" ? S.L : S.R, st = .34;
    for (let u = u0; u < u1; u += st) for (let z = z0; z < z1; z += st) { const p = pt(u, z); X.set(o, Math.floor(p[0]), Math.floor(p[1]), F[1]); }
    const l = (a, b, c) => { const p = pt(...a), q = pt(...b); X.line(o, p[0], p[1], q[0], q[1], c); };
    l([u0, z1], [u1, z1], F[3]); l([u0, z0], [u0, z1], F[3]);
    l([u0, z0], [u1, z0], F[0] === S.L[0] ? H("ffffff") : S.L[0]); l([u1, z0], [u1, z1], F[0] === S.L[0] ? S.L[0] : S.L[1]);
}
const PTOP = 34;
function column(c) {
    const { o, P } = c, M = { w: rampOf(H("ece6da"), 6) };
    turned(o, P, 8, 8, 0, [[0, 7.6], [2, 7.6], [2.2, 6.8], [3.5, 6.8], [3.8, 5.8], [5, 5.6]], M, () => "w");
    const FL = { w: rampOf(H("ece6da"), 6), f: rampOf(H("cfc6b4"), 6) };
    turned(o, P, 8, 8, 5, [[0, 5.2], [24, 5]], FL, a => (Math.round((a + 3) * 12 / Math.PI * 2) % 2 ? "f" : "w"));
    turned(o, P, 8, 8, 29, [[0, 5.4], [1, 6], [2, 6.6], [2.4, 7.6], [4.6, 7.6]], M, () => "w");
    return PTOP - .4;
}
function plinth(c, kind = "marble") {
    const { o, P } = c;
    if (kind === "column") return column(c);
    const S = kind === "black" ? BLACK : MARBLE;
    face(o, P, 0, 0, 0, 16, 16, 2.5, S); face(o, P, 1, 1, 2.5, 14, 14, 2, S); face(o, P, 1.8, 1.8, 4.5, 12.4, 12.4, .8, S);
    face(o, P, 2.5, 2.5, 5.3, 11, 11, 23.4, S, { capShadow: 1.6 });
    panel(o, P, "x", 0, 13.5, 4.3, 11.7, 8.5, 25, S); panel(o, P, "y", 0, 13.5, 4.3, 11.7, 8.5, 25, S);
    face(o, P, 1.8, 1.8, 28.7, 12.4, 12.4, .8, S); face(o, P, 1, 1, 29.5, 14, 14, 2, S); face(o, P, .4, .4, 31.5, 15.2, 15.2, 2.5, S);
    return PTOP;
}
const PLINTHS = { marble: "Marble plinth", black: "Black plinth", column: "Fluted column" };

/* ---- what stands on a plinth ---- */
const BLUE = rampOf(H("2a4ea0"), 6, [200, 215, 245]), WHITE = rampOf(H("f2f2ee"), 6, [255, 255, 255], [70, 80, 100]);
const ITEMS = {
    meiping: { name: "Blue-and-white vase", draw(c, z) {
        const prof = [[0, 3], [1, 3.2], [3, 3.6], [8, 4.8], [13, 6], [16, 6.2], [18, 5.4], [20, 3.4], [21, 2], [22.5, 1.8], [23, 2.2], [24, 2.2]];
        return turned(c.o, c.P, 8, 8, z, prof, { w: WHITE, b: BLUE }, (a, h) => {
            const ax = a * 6.2;
            if (h < 1.2) return "w";
            if (h < 4) { const m = ((ax % 3) + 3) % 3; return (h > 2 && m < 1.4 && h < 3.6 - Math.abs(m - .7) * 2) || h < 1.8 ? "b" : "w"; }
            if (h > 7 && h < 14.5) { const s = Math.sin(ax * 1.1 + h * .9) + Math.sin(ax * .5 - h * 1.3); return (h < 7.8 || h > 13.7 || Math.abs(s) < .32) ? "b" : "w"; }
            if (h > 16.2 && h < 19.5) { const m = ((ax % 4) + 4) % 4; return h < 16.9 || (Math.abs(m - 2) < (19.5 - h) * .6) ? "b" : "w"; }
            if (h > 21.6) return "b";
            return "w";
        }, { scale: 1.22, gloss: [5, 18], mouth: BLUE[4] });
    } },
    amphora: { name: "Amphora", draw(c, z) {
        const TC = rampOf(H("c46a34"), 6, [255, 210, 160]), BK = rampOf(H("2a1a14"), 6, [140, 100, 80]);
        const prof = [[0, 2.6], [1.2, 2.6], [1.6, 1.8], [3, 2.2], [7, 4.8], [11, 5.6], [14, 5], [17, 3], [19, 2], [21, 2], [22, 2.8], [23, 2.8]];
        const top = turned(c.o, c.P, 8, 8, z, prof, { t: TC, k: BK }, (a, h) => {
            const ax = a * 5.6;
            if (h > 8.6 && h < 12.4) { const tri = Math.abs(((ax * .9) % 2 + 2) % 2 - 1), zz = 9.4 + tri * 2.2; return Math.abs(h - zz) < .5 && h > 9 && h < 12 ? "t" : "k"; }
            if (h > 2.6 && h < 3.1) return "k"; if (h > 15 && h < 15.5) return "k";
            return "t";
        }, { scale: 1.22, gloss: [4, 16], mouth: TC[5] });
        for (const sx of [-1, 1]) for (let t = 0; t <= Math.PI * .9; t += .04) { const hx2 = top[0] + sx * (2.8 + Math.sin(t) * 4), hy = top[1] + 2 + t * 2.9; X.set(c.o, hx2, hy, TC[sx < 0 ? 2 : 4]); }
        return top;
    } },
    celadon: { name: "Celadon vase", draw(c, z) {
        const G1 = rampOf(H("8fb89a"), 6, [235, 250, 235], [20, 40, 30]), G2 = rampOf(H("7aa686"), 6, [225, 245, 228], [16, 36, 26]);
        const prof = [[0, 3.4], [1, 3.4], [2, 3], [4, 4.4], [9, 5.8], [12, 5.4], [15, 3.4], [17, 2.4], [19.5, 2.6], [20.5, 3.4], [21, 3.4]];
        return turned(c.o, c.P, 8, 8, z, prof, { a: G1, b: G2 }, () => "a", { scale: 1.22, gloss: [3, 15], mouth: G1[5] });
    } },
    ginger: { name: "Lidded jar", draw(c, z) {
        const IV = rampOf(H("efe6d2"), 6), RD = rampOf(H("b8283a"), 6, [255, 190, 190]), GR = rampOf(H("4f7a3a"), 6), GD = rampOf(H("d8a648"), 6, [255, 240, 190]);
        const prof = [[0, 3.6], [1, 3.8], [5, 6], [10, 6.4], [14, 5], [16, 3.6], [17, 3.4]];
        const top = turned(c.o, c.P, 8, 8, z, prof, { i: IV, r: RD, g: GR, d: GD }, (a, h) => {
            if (h < 1.4 || (h > 14.6 && h < 15.6)) return "d";
            const ax = a * 6.8, fl = (cx, cy, r) => (ax - cx) ** 2 + ((h - cy) * 1.2) ** 2 < r * r;
            if (fl(-4, 8, 2.1) || fl(3.5, 10, 2.4) || fl(0, 5, 1.6) || fl(-7.5, 11, 1.6) || fl(7.5, 6, 1.6)) return "r";
            if (fl(-2, 6.6, 1.1) || fl(1.6, 8, 1) || fl(-6, 9.4, 1) || fl(5.6, 8.2, 1) || fl(1.5, 12.5, .9)) return "g";
            return "i";
        }, { scale: 1.22, gloss: [3, 13] });
        turned(c.o, c.P, 8, 8, z + 17 * 1.22, [[0, 3.8], [.8, 3.8], [2, 3], [3, 1.6], [3.3, .8], [4.4, 1], [5, .5]], { d: GD }, () => "d");
        return top;
    } },
    lacquer: { name: "Black lacquer vase", draw(c, z) {
        const BK = rampOf(H("26222a"), 6, [140, 130, 150], [5, 4, 6]), GD = rampOf(H("d8a648"), 6, [255, 240, 190]);
        const prof = [[0, 3.6], [1, 3.6], [2, 3.2], [6, 4.6], [14, 4.8], [19, 3.2], [21, 2.4], [22.6, 3], [23, 3]];
        return turned(c.o, c.P, 8, 8, z, prof, { k: BK, g: GD }, (a, h) => {
            if (h < 1 || h > 22) return "g";
            if ((h > 4 && h < 4.6) || (h > 17.6 && h < 18.2)) return "g";
            return "k";
        }, { scale: 1.22, gloss: [3, 20] });
    } },
    cup: { name: "Gold cup", draw(c, z) {
        const GD = rampOf(H("e0aa48"), 7, [255, 246, 210], [50, 28, 6]);
        const prof = [[0, 4], [1, 4], [1.6, 3.2], [2.2, 1.3], [5.5, 1], [6.5, 2], [7.4, 1.1], [8.5, 1.6], [10.5, 3.6], [13.5, 4.8], [15.5, 5.3], [16.5, 5.4]];
        const top = turned(c.o, c.P, 8, 8, z, prof, { g: GD }, () => "g", { gloss: [9, 16], mouth: GD[4] });
        for (const sx of [-1, 1]) for (let t = -Math.PI / 2; t <= Math.PI / 2; t += .04) { const hx2 = top[0] + sx * (6.6 + Math.cos(t) * 3.2), hy = top[1] + 4.5 + Math.sin(t) * 3.8; X.set(c.o, hx2, hy, GD[sx < 0 ? (t < 0 ? 0 : 1) : (t < 0 ? 3 : 4)]); X.set(c.o, hx2 - sx, hy, GD[sx < 0 ? 2 : 5]); }
        turned(c.o, c.P, 8, 8, z, prof, { g: GD }, () => "g", { gloss: [9, 16], mouth: GD[4] });
        return top;
    } }
};
function plinthWith(kind, item) { const c = canvas(), z = plinth(c, kind); if (item && ITEMS[item]) ITEMS[item].draw(c, z); return finish(c); }

/* ---- the placard: the card drawn from straight polygons, on the globe floor lamp's own foot and post. Anchor = the tile's middle.
   pic: the event's picture (small), or none for the plain card the live layer paints over ---- */
const PGD = [H("fff4c8"), H("f0c870"), H("d8a648"), H("b0802c"), H("80561a"), H("4e3410")];
const PWD = [H("8a5e3a"), H("6e4628"), H("5a3a22"), H("3e2616")];
const CARD = { cw: 15, ch: 10, k: .9, tilt: 35, z: 24 };
/* where the card's face is in the world: s across, t down it (s 0..cw, t 0..ch), n behind it */
function cardWorld(axis) {
    const { cw, ch, k, tilt, z } = CARD, back = Math.sin(tilt * Math.PI / 180) * k, up = Math.cos(tilt * Math.PI / 180) * k;
    const U = axis === "x" ? [k, 0, 0] : [0, -k, 0], V = axis === "x" ? [0, back, -up] : [back, 0, -up], N = axis === "x" ? [0, -1.2, 0] : [-1.2, 0, 0];
    const O = axis === "x" ? [8 - cw / 2 * k, 8 - ch * back / 2, z + ch * up] : [8 - ch * back / 2, 8 + cw / 2 * k, z + ch * up];
    return { U, V, N, O, W: (s, t, n = 0) => [O[0] + U[0] * s + V[0] * t + N[0] * n, O[1] + U[1] * s + V[1] * t + N[1] * n, O[2] + U[2] * s + V[2] * t + N[2] * n] };
}
function card(axis, pic) {
    const o = X.img(64, 100), ax = 32, ay = 76, P = P0(ax, ay - 8), { cw, ch } = CARD, cwd = cardWorld(axis), W = cwd.W;
    const S = (s, t, n) => { const p = P(...W(s, t, n)); return [Math.round(p[0]), Math.round(p[1])]; };
    const quad = (a, b, c, d, col) => X.poly(o, [a, b, c, d], col), line = (a, b, col) => X.line(o, a[0], a[1], b[0], b[1], col);
    quad(S(0, 0, 1), S(cw, 0, 1), S(cw, ch, 1), S(0, ch, 1), PWD[3]);
    quad(S(0, 0, 1), S(cw, 0, 1), S(cw, 0, 0), S(0, 0, 0), PGD[3]);
    quad(S(0, 0, 0), S(cw, 0, 0), S(cw, ch, 0), S(0, ch, 0), H("f4ecd8"));
    const pw = pic ? pic.w : 6, ph = pic ? pic.h : 5;
    if (pic) plane(o, P, pic, W(1.6, 1.6), cwd.U, cwd.V);
    else { const blank = X.img(pw, ph, H("6a5a48")); plane(o, P, blank, W(1.6, 1.6), cwd.U, cwd.V); }
    { const r0 = S(1.3, 1.3, 0), r1 = S(1.6 + pw + .2, 1.3, 0), r2 = S(1.6 + pw + .2, 1.6 + ph + .2, 0), r3 = S(1.3, 1.6 + ph + .2, 0); line(r0, r1, PGD[3]); line(r1, r2, PGD[4]); line(r2, r3, PGD[4]); line(r3, r0, PGD[3]); }
    line(S(8.6, 2.2, 0), S(13.4, 2.2, 0), H("8e1a2a")); line(S(8.6, 4.2, 0), S(12.8, 4.2, 0), H("9a8a70")); line(S(8.6, 6.2, 0), S(13.4, 6.2, 0), H("9a8a70")); line(S(1.6, 8.4, 0), S(12.4, 8.4, 0), H("b4a688"));
    line(S(0, 0, 0), S(cw, 0, 0), PGD[1]); line(S(0, 0, 0), S(0, ch, 0), PGD[2]); line(S(cw, 0, 0), S(cw, ch, 0), PGD[3]); line(S(0, ch, 0), S(cw, ch, 0), PGD[4]);
    return { o, ax, ay };
}
const LAMP = (() => { const p = X.load(path.join(__dirname, "..", "art", "lamps", "globe-lamp.png")), b = X.bounds(p); return X.crop(p, b.x0, b.y0, 15, b.h); })();
function placard(axis = "x", pic) {
    const c = card(axis, pic), o = X.img(64, 100), ax = 32, ay = 76;
    const foot = X.crop(LAMP, 0, 19, 15, 10), post = X.crop(LAMP, 0, 13, 15, 1), fx = ax - 7, fy = ay - 5;
    for (let y = fy - 1; y >= ay - 26; y--) X.blit(o, post, fx, y);
    X.blit(o, foot, fx, fy); X.blit(o, c.o, 0, 0);
    const out = outline(o), bb = X.bounds(out); return { img: X.crop(out, bb.x0, bb.y0, bb.w, bb.h), ax: ax + 1 - bb.x0, ay: ay + 1 - bb.y0 };
}
/* where the picture's corners land on screen, relative to the tile's middle: the live layer paints the event's picture there */
function placardPicture(axis) {
    const cwd = cardWorld(axis), P = P0(0, -8), pt = (s, t) => P(...cwd.W(s, t));
    return { w: 6, h: 5, at: [pt(1.6, 1.6), pt(7.6, 1.6), pt(1.6, 6.6)].map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]) };
}

/* ---- the client's own half-scale plants ---- */
const PLANT_REGS = JSON.parse(fs.readFileSync(SRC + "plants/regs.json", "utf8")).members;
const PLANTS = {
    yukka: { name: "Yukka palm", f: "s_plant_yukka_a_0_1_1_0_0" },
    fruittree: { name: "Fruit tree", f: "s_plant_fruittree_a_0_1_1_0_0" },
    bigcactus: { name: "Big cactus", f: "s_plant_big_cactus_a_0_1_1_0_0" },
    minibonsai: { name: "Bonsai, small", f: "s_plant_bonsai_a_0_1_1_0_0" },
    pineapple: { name: "Pineapple plant", f: "s_plant_pineapple_a_0_1_1_0_0" }
};
function clientPlant(k) { const p = PLANTS[k], m = PLANT_REGS.find(q => q.name === p.f); return { img: X.load(SRC + "plants/" + p.f + ".png"), reg: [m.regX, m.regY], name: p.name }; }

/* ---- the EVENTS banner, in any colour: dark lettering on light colours ---- */
const BANNERS = [["crimson", "Crimson", "a8283a"], ["green", "Bottle green", "2e5a44"], ["navy", "Navy", "2a3e6e"], ["gold", "Gold", "c89a3c"], ["black", "Black", "2a2a30"], ["plum", "Plum", "5e2a5a"], ["teal", "Teal", "2a6a6e"], ["cream", "Cream", "e2d4b0"]];
const velOf = hex => { const b = H(hex); return [mix(b, [255, 246, 228], .22), mix(b, [255, 246, 228], .08), b, mix(b, [10, 6, 8], .2), mix(b, [10, 6, 8], .4), mix(b, [10, 6, 8], .62)]; };
function banner(vel, word = "EVENTS") {
    const light = (vel[2][0] * .3 + vel[2][1] * .59 + vel[2][2] * .11) > 120, INK = light ? [H("3a2410"), H("fff4dc"), H("5a3a1c")] : [GOLD[1], vel[vel.length - 1], GOLD[0]];
    const w = 26, h = 94, o = X.img(w + 8, h + 8), mid = 4 + w / 2;
    for (let y = 5; y < h; y++) for (let x = 4; x < w + 4; x++) {
        const notch = h - 11 + Math.abs(x + .5 - mid) * .8; if (y > notch) continue;
        const fold = Math.cos((x - 4) / w * Math.PI * 3) * .5 + .5, sh = (x - 4) / w;
        let c = vel[fold > .75 ? 0 : fold > .35 ? 1 : 2]; if (sh > .8) c = vel[Math.min(vel.length - 1, (fold > .5 ? 2 : 3))];
        if (x === 6 || x === w + 1) c = y < h * .6 ? GOLD[2] : GOLD[3];
        if (y > notch - 2.2) c = (x & 1) ? GOLD[2] : GOLD[4];
        X.set(o, x, y, c);
    }
    for (let x = 0; x < w + 8; x++) { X.set(o, x, 2, GOLD[1]); X.set(o, x, 3, GOLD[3]); X.set(o, x, 4, GOLD[5]); }
    for (const fx of [1, w + 6]) { X.ellipse(o, fx, 3, 2, 2.2, GOLD[2]); X.set(o, fx - 1, 2, GOLD[0]); }
    for (let i = 0; i < 4; i++) { const lx = 6 + i * (w - 6) / 3; X.rect(o, lx, 4, 3, 3, vel[3]); X.set(o, lx, 4, vel[2]); }
    X.ellipse(o, mid - .5, 15, 5, 5, GOLD[4]); X.ellipse(o, mid - .5, 15, 4, 4, GOLD[2]); X.ellipse(o, mid - .5, 15, 2.6, 2.6, light ? H("3a2410") : vel[2]); X.set(o, mid - 2, 14, GOLD[1]); X.set(o, mid + 1, 14, GOLD[1]); X.set(o, mid - .5, 16, GOLD[1]);
    [...word].forEach((ch, i) => text(o, ch, Math.round(mid - textW(ch) / 2), 25 + i * 9.5, INK[0], INK[1], INK[2]));
    return o;
}
/* turned onto a wall: "x" runs down to the right, "y" up to the right */
const onWall = (flat, way) => outline(X.wall(flat, way));
function hangFrame(face, way, edge) {
    const sh = X.wall(face, way), o = X.img(sh.w + 1, sh.h + 1), s = way === "x" ? 1 : -1, fx = way === "x" ? 0 : 1;
    const sil = X.img(sh.w, sh.h); for (let i = 0; i < sh.w * sh.h; i++) if (sh.d[i * 4 + 3]) { sil.d[i * 4] = edge[0]; sil.d[i * 4 + 1] = edge[1]; sil.d[i * 4 + 2] = edge[2]; sil.d[i * 4 + 3] = 255; }
    X.blit(o, sil, fx + s, 1); X.blit(o, sh, fx, 0); return outline(o);
}
function fitPicture(src, w, h) {
    const sa = src.w / src.h, ta = w / h; let cw = src.w, ch = src.h, x0 = 0, y0 = 0;
    if (sa > ta) { cw = Math.round(src.h * ta); x0 = Math.round((src.w - cw) / 2); } else { ch = Math.round(src.w / ta); y0 = Math.round((src.h - ch) / 2); }
    const s = X.shrink(X.crop(src, x0, y0, cw, ch), w, h);
    for (let i = 0; i < w * h; i++) s.d[i * 4 + 3] = 255;
    return s;
}
/* frames: the picture's size inside each, and the moulding's width each side */
const SIZES = { S: [36, 20], M: [48, 26], L: [64, 34] };
const FRAMES = {
    gilt: { name: "Gilt", pad: 6, draw(art) {
        const B = { hi: GOLD[0], b0: GOLD[1], b1: GOLD[2], b2: GOLD[3], b3: GOLD[4], b4: GOLD[5], b5: H("4a2c0a") };
        const w = art.w + 12, h = art.h + 12, o = X.img(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const e = Math.min(x, y, w - 1 - x, h - 1 - y); if (e > 5) continue;
            const lit = (y === e && x >= e && x <= w - 1 - e) || (x === e && y >= e && y <= h - 1 - e);
            let c = e === 0 ? (lit ? B.b1 : B.b3) : e === 1 ? (lit ? B.b0 : B.b2) : e === 2 ? ((x + y) % 4 < 2 ? B.b1 : B.b3) : e === 3 ? (lit ? B.b2 : B.b4) : e === 4 ? B.b4 : B.b5;
            if (e === 2 && ((x + y) % 4 === 0)) c = B.hi;
            X.set(o, x, y, c);
        }
        for (const [cx, cy] of [[2.5, 2.5], [w - 3.5, 2.5], [2.5, h - 3.5], [w - 3.5, h - 3.5]]) { X.ellipse(o, cx, cy, 2.4, 2.4, B.b3); X.set(o, cx - .5, cy - .5, B.hi); X.set(o, cx + .5, cy + .5, B.b1); }
        X.blit(o, art, 6, 6); return { face: o, edge: B.b4 };
    } },
    modern: { name: "Modern", pad: 6, draw(art) {
        const w = art.w + 12, h = art.h + 12, o = X.img(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const e = Math.min(x, y, w - 1 - x, h - 1 - y); X.set(o, x, y, e < 2 ? (y === e || x === e ? H("4a4a52") : H("26262c")) : e === 5 ? H("cfc8b8") : H("f4f0e6")); }
        X.blit(o, art, 6, 6); return { face: o, edge: H("141418") };
    } },
    walnut: { name: "Walnut", pad: 5, draw(art) {
        const WD = ramp(["9a6a42", "7e5434", "664229", "4e311e", "38220f"]);
        const w = art.w + 10, h = art.h + 10, o = X.img(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const e = Math.min(x, y, w - 1 - x, h - 1 - y); if (e > 4) continue; const lit = y === e || x === e; X.set(o, x, y, e === 4 ? GOLD[2] : e === 3 ? WD[4] : lit ? WD[e === 0 ? 1 : 0] : WD[e === 0 ? 3 : 2]); if (e === 1 && (x * 5 + y * 3) % 11 === 0) X.set(o, x, y, WD[3]); }
        X.blit(o, art, 5, 5); return { face: o, edge: WD[4] };
    } }
};
/* an empty frame: a dark mount where the picture goes, which the live layer paints the event's picture into */
const MOUNT = H("3a3028");
function frame(style, size, way, art) { const [pw, ph] = SIZES[size], pic = art ? fitPicture(art, pw, ph) : X.img(pw, ph, MOUNT), f = FRAMES[style].draw(pic); return hangFrame(f.face, way, f.edge); }

/* ---- the brass picture light: plate, arm, a long shade, its underside glowing ---- */
const PB = { hi: H("fff6d8"), b0: H("fbe3a2"), b1: H("f0c878"), b2: H("dca654"), b4: H("8a5a1c") };
function pictureLight(lit) {
    const w = 40, h = 12, o = X.img(w, h), cx = w / 2;
    X.rect(o, cx - 3, 0, 6, 4, K); X.rect(o, cx - 2, 1, 4, 2, PB.b2); X.set(o, cx - 2, 1, PB.hi);
    X.rect(o, cx - 1, 4, 2, 3, PB.b4); X.set(o, cx - 1, 4, PB.b1);
    for (let x = 4; x < w - 4; x++) { X.set(o, x, 6, K); X.set(o, x, 7, PB.b0); X.set(o, x, 8, PB.b2); X.set(o, x, 9, PB.b4); X.set(o, x, 10, lit ? H("fffbe8") : H("c8b890")); X.set(o, x, 11, K); }
    for (const x of [3, w - 4]) for (let y = 6; y < 12; y++) X.set(o, x, y, K);
    return o;
}
/* ---- the Game Hall's egg sconce, as drawn for a wall running down to the right; lit, its glass brighter ---- */
function eggSconce(lit) {
    const s = X.load(SRC + "egg-sconce.png"); if (!lit) return s;
    const o = X.img(s.w, s.h); for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const c = X.get(s, x, y); if (!c) continue; const L = c[0] * .3 + c[1] * .59 + c[2] * .11; X.set(o, x, y, L > 150 ? mix(c, [255, 250, 230], .55) : c.slice(0, 3), c[3]); }
    return o;
}

/* ---- the year carved into a 3 x 2 tile slab of the floor's own stone (3 along the text, floor x): a groove two in from the edge with
   small cut diamonds at its corners, the figures cut isometrically. Anchor: the slab's middle ---- */
const ISO = { "0": [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]], "1": [[[1, 1], [2, 0], [2, 6]], [[1, 6], [3, 6]]], "2": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
    "3": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]], [[1, 3], [3, 3]]], "4": [[[3, 6], [3, 0], [0, 4], [4, 4]]], "5": [[[4, 0], [0, 0], [0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
    "6": [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]], "7": [[[0, 0], [4, 0], [4, 1], [1, 6]]], "8": [[[1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0]], [[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
    "9": [[[4, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5]]] };
/* axis "y" (14 Nov 2026, his: "Year slab: should be rotatable"): the same slab turned a quarter, 2 along x by 3 along y, the year reading up to the right */
function yearSlab(year = "2026", stone = "c2ae86", axis = "x") {
    const turned = axis === "y", NA = 48, NB = 32, FA = turned ? NB : NA, FB = turned ? NA : NB, S0 = H(stone), t = X.img(FA, FB);
    const sh = k => mix(S0, K, k), li = k => mix(S0, [255, 250, 235], k);
    for (let b = 0; b < FB; b++) for (let a = 0; a < FA; a++) {
        let col = S0; if (a === 0 || b === 0) col = li(.18); else if (a === FA - 1 || b === FB - 1) col = sh(.14);
        const e = Math.min(a, b, FA - 1 - a, FB - 1 - b), corner = Math.min(a, FA - 1 - a) < 5 && Math.min(b, FB - 1 - b) < 5;
        if (e === 2 && !corner) col = (a === 2 || b === 2) ? sh(.36) : li(.2);
        if (e === 3 && !corner) col = (a === 3 || b === 3) ? li(.18) : sh(.3);
        for (const [cx, cy] of [[3, 3], [FA - 4, 3], [3, FB - 4], [FA - 4, FB - 4]]) { const d = Math.abs(a - cx) + Math.abs(b - cy); if (d === 2) col = (a < cx || b < cy) ? sh(.36) : li(.22); else if (d < 2) col = sh(.12); }
        X.set(t, a, b, col);
    }
    const iso = X.floor(t), P = (a, b) => { const A = turned ? b : a, B = turned ? NA - 1 - a : b; return [A - B + FB, Math.floor((A + B) / 2)]; };
    const XM = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 5 }, YM = { 0: 0, 1: 1, 2: 3, 3: 4, 4: 5, 5: 7, 6: 8 }, ADV = 8, W = (year.length - 1) * ADV + 5, a0 = Math.round(NA / 2 - W / 2), b0 = Math.round(NB / 2 - 4);
    const cut = new Set(), seg = (p, q) => { let [x0, y0] = p; const [x1, y1] = q, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { cut.add(x0 + "," + y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } };
    [...year].forEach((ch, i) => { const ax = a0 + i * ADV; for (const ln of ISO[ch] || []) for (let k = 0; k + 1 < ln.length; k++) seg(P(ax + XM[ln[k][0]], b0 + YM[ln[k][1]]), P(ax + XM[ln[k + 1][0]], b0 + YM[ln[k + 1][1]])); });
    for (const k of cut) { const [px, py] = k.split(",").map(Number); if (!cut.has(px + "," + (py + 1))) X.set(iso, px, py + 1, li(.3)); }
    for (const k of cut) { const [px, py] = k.split(",").map(Number); X.set(iso, px, py, sh(.48)); }
    /* the slab's top corner sits at (FB, 0) in the picture */
    return { img: iso, top: [FB, 0] };
}
/* ---- the year as a metal plate (14 Nov 2026, his, from mock-up sheet 27): the carved slab's shapes kept as cuts, turned to brass (the globe
   floor lamp's foot and the Leet Show narrow stand's poles) or steel. No lit lips inside, only the rim's top edges; the shine is the Hallway
   floor tiles' own: every screen column one of three tones ---- */
const METALS = {
    brass: { name: "Brass", deep: "24130a", cut: "3a2110", groove: "54321a", low: "6e4524", face: ["9c6a38", "ab7a44", "bd8a50"], rim: "eed09c" },
    steel: { name: "Steel", deep: "1e2228", cut: "323840", groove: "4a525c", low: "66707a", face: ["96a0aa", "a4aeb8", "b6bec8"], rim: "eef2f6" },
};
function yearPlate(year, metal = "brass", axis = "x") {
    const s = yearSlab(year, "c2ae86", axis), im = s.img, M = METALS[metal], o = X.img(im.w, im.h);
    const solidAt = (x, y) => { const c = X.get(im, x, y); return !!c && c[3] >= 128; };
    const colTone = x => { let h = (x * 374761393 + 7 * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296; return r < .3 ? 0 : r < .7 ? 1 : 2; };
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
        const c = X.get(im, x, y); if (!c || c[3] < 128) continue;
        const L = c[0] * .3 + c[1] * .59 + c[2] * .11;
        const top = !solidAt(x, y - 1) || (!solidAt(x - 1, y) && !solidAt(x, y - 2)), edge = top || !solidAt(x, y + 1) || !solidAt(x - 1, y) || !solidAt(x + 1, y);
        const h = L < 100 ? M.deep : L < 130 ? M.cut : L < 160 ? M.groove : edge ? (top ? M.rim : M.low) : M.face[colTone(x)];
        X.set(o, x, y, H(h));
    }
    return { img: o, top: s.top };
}

module.exports = { X, H, LOBBY, REG, PLINTHS, ITEMS, plinthWith, placard, placardPicture, PLANTS, clientPlant, BANNERS, velOf, banner, onWall, SIZES, FRAMES, frame, fitPicture, pictureLight, eggSconce, yearSlab, yearPlate, METALS };
