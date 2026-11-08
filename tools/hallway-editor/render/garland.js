/* The Christmas garland along the walls (l.garlands = [{ axis, line, a, b, baubles }], one swag a tile from a to b - 1).
   Shared by the drawing (render/hw3.js bakes it into the Christmas tiles, so walls and furniture in front cover it) and the editor
   (live-xmas.js: the one being laid, and finding a click), so the two can't disagree (9 Nov 2026).

   Each tile is ideas/christmas.js swag() pixel for pixel (i_swag.png), but able to climb: where the wall's top steps up, the wall going
   on up to a raised floor above, the rope rises across the higher tiles (at most 16 a tile, never above the wall) instead of staying level.
   Where along the wall: the middle of tile t is at t + 0.5 on both walls. (It used to be t + 1.5 on a "y" wall: a tile further along than
   the one laid, so it sat a tile to the left and followed the next tile's top, not its own.) */
(function () {
"use strict";
const GK = [10, 8, 8], GH = s => [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
const GN = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }, gsag = (u, w, z0, drop) => z0 - drop * 4 * (u / w) * (1 - u / w);
const BAUB = { red: ["c8352a", "ff8a78", "7a1b16"], gold: ["d6ad56", "fff4c8", "86601f"], blue: ["3a7ad6", "a8d0ff", "1f4a90"], silver: ["c9cdd4", "ffffff", "7a808a"], purple: ["8a3ac8", "d0a0ff", "4e1f7a"], pink: ["e0568c", "ffb0cc", "8a2450"], teal: ["2aa8a0", "a0f0e8", "146a64"] };
const ROW = ["..c..", ".KKK.", "KHGGK", "KGGGK", "KGGDK", ".KKK."];
/* one tile's pixels, relative to the picture's anchor: [x, y, [r, g, b]]. up: how much higher its far end hangs than its near end; back: the
   same for the tile before, which the holly's other half lies over. A level tile gives exactly i_swag.png's pixels. */
const memo = new Map();
/* the holly at a hook, drawn into a tile's pixels (u along, z up; lift: the rope's rise each side). mode "both": a leaf along the rope each
   way, as on every hook; "start" or "end": at the end of a run, one leaf lies back along the rope and the other hangs down off the end, so
   nothing sticks out past it (round a corner, into a doorway) and the rope never stops bare (9 Nov, his: finishing touches) */
function holly(shape0, lift, Z, mode) {
    /* at an end the cluster sits 4 in from it, so its berries and hanging leaf stay on its own wall: an even step, as the wall's slant drops a
       pixel every two along, so every pixel of the cluster keeps its place in the pattern; along the rope's own rise there */
    const du = mode === "start" ? 4 : mode === "end" ? -4 : 0, rise = Math.round(lift(du)), shape = paint => shape0(mark => paint((u, z, col) => mark(u + du, z + rise, col)));
    const leaf = (side, hang) => shape(mark => { for (let i = 0; i < 6; i++) { const wid = Math.round(2 * Math.sin((i + 1) / 7 * Math.PI)) + (i % 3 === 1 ? 1 : 0);
        if (!hang) { for (let j = -wid; j <= wid; j++) mark(side * (i + 1), Z + 1 + j - i * .3 + lift(side * (i + 1)), j === 0 ? GH("6cb05e") : (j > 0 ? GH("3f8a44") : GH("1c5426"))); continue; }
        /* hanging: it falls from the hook nearly straight, its width across, so it stays this side of the end */
        const cu = side * (1 + i * .15), cz = Z - i * 1.1; for (let j = -wid; j <= wid; j++) mark(cu + j, cz, j === 0 ? GH("6cb05e") : (j * side < 0 ? GH("3f8a44") : GH("1c5426"))); } });
    if (mode === "both") { leaf(-1, false); leaf(1, false); } else if (mode === "start") { leaf(1, false); leaf(-1, true); } else { leaf(-1, false); leaf(1, true); }
    shape(mark => { for (const [p, q] of [[0, 0], [2, -1], [-2, -1]]) for (const [e, f] of [[0, 0], [1, 0], [0, 1], [1, 1]]) mark(p + e, Z - 2 + q + f, e === 0 && f === 1 ? GH("ff8a78") : e === 1 && f === 0 ? GH("a81f16") : GH("e0352a")); });
}
const pen = () => { const px = new Map(), wall = (u, z, col) => px.set(Math.round(-u) + "," + Math.round(Math.floor(u / 2) - z), col);
    const shape = paint => { const seen = new Map(), mark = (u, z, col) => seen.set(Math.round(u) + "," + Math.round(z), col); paint(mark); for (const k of seen.keys()) { const [u, z] = k.split(",").map(Number); for (const [p, q] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!seen.has((u + p) + "," + (z + q))) wall(u + p, z + q, GK); } for (const [k, col] of seen) { const [u, z] = k.split(",").map(Number); wall(u, z, col); } };
    const list = () => { const out = []; for (const [k, col] of px) { const [x, y] = k.split(",").map(Number); out.push([x, y, col]); } return out; };
    return { px, wall, shape, list }; };
/* the end of a run: the holly alone, at the far end of its last tile (back: that tile's rise) */
function endCap(back) { const key = "end|" + back; if (memo.has(key)) return memo.get(key); const P = pen(); holly(P.shape, u => u >= 0 ? 0 : back * u / 16, 126, "end"); const out = P.list(); memo.set(key, out); return out; }
function tile(up, back, start) {
    const key = up + "|" + back + (start ? "|s" : ""); if (memo.has(key)) return memo.get(key);
    const px = new Map(), wall = (u, z, col) => px.set(Math.round(-u) + "," + Math.round(Math.floor(u / 2) - z), col);
    const shape = paint => { const seen = new Map(), mark = (u, z, col) => seen.set(Math.round(u) + "," + Math.round(z), col); paint(mark); for (const k of seen.keys()) { const [u, z] = k.split(",").map(Number); for (const [p, q] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!seen.has((u + p) + "," + (z + q))) wall(u + p, z + q, GK); } for (const [k, col] of seen) { const [u, z] = k.split(",").map(Number); wall(u, z, col); } };
    const W = 16, Z = 126, DROP = 3, lift = u => u >= 0 ? up * u / W : back * u / W, rope = u => gsag(u, W, Z, DROP) + lift(u);
    for (let u = 0; u < W; u += .5) { const z = rope(u); for (let d = -2.5; d <= 2.5; d += .5) { const n = GN(Math.round(u * 2), Math.round(d * 2) + 9), edge = Math.abs(d) > 2.2 - n * .8; if (edge && n < .6) continue; const col = d > 1.5 ? GH("6cb05e") : d > .5 ? (n > .5 ? GH("4fa858") : GH("3f8a44")) : d > -1 ? GH("2f7d3a") : GH("1c5426"); wall(u, z + d, col); } wall(u, z - 3, GK); wall(u, z + 3, [16, 34, 18]);
        /* climbing steeply, the needles would come apart into stripes: fill each half-step's rise */
        const z2 = rope(u + .5); for (let s = 1; s < Math.abs(z2 - z) - .5; s++) { const zz = z + Math.sign(z2 - z) * s; for (let d = -2; d <= 2; d += .5) wall(u, zz + d, d > 1.5 ? GH("6cb05e") : d > .5 ? GH("3f8a44") : d > -1 ? GH("2f7d3a") : GH("1c5426")); } }
    /* holly where the tiles meet, each half lying along its own tile's rope; the first tile of a run gets an end's holly */
    holly(shape, lift, Z, start ? "start" : "both");
    const out = []; for (const [k, col] of px) { const [x, y] = k.split(",").map(Number); out.push([x, y, col]); }
    memo.set(key, out); return out;
}
/* where the rope hangs at each join along the run, from each tile's wall top (null: no wall there): never above the wall either side of
   it, and where the top steps, a climb of at most 16 a tile on the higher side, so the garland stays on the wall all the way up */
function joins(tops) {
    const n = tops.length, E = [];
    for (let e = 0; e <= n; e++) { const a = e > 0 ? tops[e - 1] : null, b = e < n ? tops[e] : null; E.push(a === null ? b : b === null ? a : Math.min(a, b)); }
    const CLIMB = 16; for (let e = 0; e <= n; e++) if (E[e] !== null) for (let j = 0; j <= n; j++) if (E[j] !== null) E[e] = Math.min(E[e], E[j] + CLIMB * Math.abs(e - j));
    return E;
}
/* the middle of tile t along the wall, as a map point's two coordinates */
/* how far under the wall's top (or the underside of the floor above) the picture's anchor goes: 3, so the rope's top meets the edge
   in the dip and the holly at each hook tucks just behind it, hung from under the edge (9 Nov, his: they sat a few pixels low) */
const DOWN = 3;
const along = (g, t) => g.axis === "x" ? [t + .5, g.line] : [g.line, t + .5];
/* the whole garland's pixels: tops[i] is tile g.a + i's wall top; screen(x, y, z) is where a map point goes on screen; baubles: the colours
   chosen (map.baubles). Out: [{ t, px: [[X, Y, [r, g, b]], ...] }], a tile at a time, so each can be drawn in its own turn. */
function pixels(g, tops, screen, baubles) {
    const E = joins(tops), use = (baubles || Object.keys(BAUB)).filter(n => BAUB[n]), names = use.length ? use : Object.keys(BAUB), out = []; let n = 0;
    for (let t = g.a; t < g.b; t++) {
        const i = t - g.a; if (tops[i] === null || E[i] === null || E[i + 1] === null) continue;
        /* is this the first tile of a stretch, or the last (the run's ends, and either side of a gap with no wall) */
        const drawn = j => j >= 0 && j < tops.length && tops[j] !== null && E[j] !== null && E[j + 1] !== null, first = !drawn(i - 1), last = !drawn(i + 1);
        const p = along(g, t), s = screen(p[0], p[1], E[i] - DOWN), cx = Math.round(s[0]), cy = Math.round(s[1]);
        const up = Math.round(E[i + 1] - E[i]), back = i > 0 && E[i - 1] !== null ? Math.round(E[i] - E[i - 1]) : 0, flip = g.axis === "x", px = [];
        for (const [x, y, col] of tile(up, first ? 0 : back, first)) px.push([flip ? cx - 8 - x : cx + 8 + x, cy + 124 + y, col]);
        /* the far end of a stretch's last tile: its own holly, where the next tile's hook would be */
        if (last) { const q = along(g, t + 1), s2 = screen(q[0], q[1], E[i + 1] - DOWN), ex = Math.round(s2[0]), ey = Math.round(s2[1]); for (const [x, y, col] of endCap(up)) px.push([flip ? ex - 8 - x : ex + 8 + x, ey + 124 + y, col]); }
        /* a bauble in the dip of each tile's swag, half way up its climb */
        if (g.baubles !== false) { const B = BAUB[names[n++ % names.length]], bx = cx - 2, by = cy + 8 - Math.round(up / 2); ROW.forEach((r, j) => { for (let u = 0; u < 5; u++) { const ch = r[u]; if (ch === ".") continue; px.push([bx + u, by + j, ch === "K" ? [0, 0, 0] : ch === "c" ? GH("d6ad56") : ch === "H" ? GH(B[1]) : ch === "D" ? GH(B[2]) : GH(B[0])]); } }); }
        out.push({ t, mid: [cx, cy + 8 - Math.round(up / 2)], px });
    }
    return out;
}
const api = { tile, joins, pixels, along, BAUB };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.HallwayGarlandArt = api;
})();
