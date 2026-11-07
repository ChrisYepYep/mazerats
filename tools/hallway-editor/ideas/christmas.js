/* The Christmas decorations drawn for the Hallway, in pixels on the wall's own 2:1 slant: u along the wall, z up it. Black outlines, a light from the left, colours off the map's tree and baubles. */
"use strict";
const hex = s => [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
const K = [10, 8, 8];
function canvas(c, a) {
    const set = (X, Y, col) => { X = Math.round(X); Y = Math.round(Y); if (X < 0 || Y < 0 || X >= c.w || Y >= c.h) return; const q = (Y * c.w + X) * 4; c.d[q] = col[0]; c.d[q + 1] = col[1]; c.d[q + 2] = col[2]; };
    const wall = (u, z, col) => set(a[0] - u, a[1] + Math.floor(u / 2) - z, col);
    /* a shape on the wall, then a black line round it */
    const shape = paint => { const seen = new Map(), mark = (u, z, col) => seen.set(Math.round(u) + "," + Math.round(z), col); paint(mark); for (const k of seen.keys()) { const [u, z] = k.split(",").map(Number); for (const [p, q] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!seen.has((u + p) + "," + (z + q))) wall(u + p, z + q, K); } for (const [k, col] of seen) { const [u, z] = k.split(",").map(Number); wall(u, z, col); } };
    return { set, wall, shape };
}
const N = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
const sag = (u, w, z0, drop) => z0 - drop * 4 * (u / w) * (1 - u / w);

/* bunting: pennants on a sagging cord, each with a lit edge and a shaded one */
function bunting(c, a) {
    const { wall, shape } = canvas(c, a), W = 72, Z = 112, DROP = 8, CL = [["c8352a", "e65a48", "8a1f16"], ["2f7d3a", "4fa858", "1c5426"], ["d6ad56", "f2d68c", "96742c"], ["ece6d6", "fffaf0", "b4ac98"]];
    for (let n = 0; n < 8; n++) { const u0 = 1 + n * 9, top = sag(u0 + 3.5, W, Z, DROP), C = CL[n % CL.length].map(hex); shape(mark => { for (let r = 0; r < 9; r++) { const half = 3.5 * (1 - r / 9); for (let u = -half; u <= half; u += .5) { const col = u < -half + 1 ? C[1] : u > half - 1 ? C[2] : C[0]; mark(u0 + 3.5 + u, top - 1 - r, col); } } }); }
    for (let u = 0; u <= W; u += .5) { const z = sag(u, W, Z, DROP); wall(u, z, hex("2a1a10")); wall(u, z + 1, hex("6a4a30")); }
    for (const u of [0, W]) { wall(u, Z, K); wall(u, Z + 1, hex("c49660")); wall(u, Z - 1, K); }
}
/* festoon lights: a dark cable, a socket and a warm glass bulb every so often */
const FW = 96, FZ = 116, FDROP = 12, FBULBS = Array.from({ length: 8 }, (_, n) => 6 + n * 12);
const festoon = () => (c, a) => {
    const { wall, set } = canvas(c, a);
    /* the flex stands a little off the wall, so it casts a soft shadow a few pixels down */
    for (let u = 0; u <= FW; u += .5) { const z = sag(u, FW, FZ, FDROP); wall(u, z - 3, [0, 0, 0].map((v, i) => v)); }
    for (let u = 0; u <= FW; u += .5) { const z = sag(u, FW, FZ, FDROP); wall(u, z, hex("15120f")); wall(u, z + 1, hex("4a4038")); }
    /* each socket hangs from the flex: a dark collar, lit on its left */
    for (const u0 of FBULBS) { const z0 = sag(u0, FW, FZ, FDROP), X = a[0] - u0, Y = a[1] + Math.floor(u0 / 2) - z0; for (const [dx, dy, col] of [[0, 1, "15120f"], [-1, 2, "6a5c50"], [0, 2, "3a322c"], [1, 2, "15120f"], [-1, 3, "4a4038"], [0, 3, "2a241f"], [1, 3, "15120f"]]) set(X + dx, Y + dy, hex(col)); }
    for (const u of [0, FW]) { wall(u, FZ, K); wall(u, FZ + 1, hex("c49660")); wall(u, FZ - 1, K); }
};
/* where each bulb hangs, in the same pixels as the art: [x, y] from the art's own origin */
festoon.bulbs = () => FBULBS.map(u0 => { const z0 = sag(u0, FW, FZ, FDROP); return [-u0, Math.floor(u0 / 2) - z0 + 4]; });
/* a wreath: dense needles in three greens, berries, a red bow */
function wreath(c, a) {
    const { shape } = canvas(c, a), cx = 16, cz = 92, R = 13, r0 = 6;
    shape(mark => {
        for (let u = -R - 2; u <= R + 2; u++) for (let z = -R - 2; z <= R + 2; z++) { const d = Math.hypot(u, z) + (N(u, z) - .5) * 2.4; if (d > R || d < r0) continue; const n = N(z, u), lightSide = u - z < 0, col = n > .86 ? hex("6cb05e") : n > .5 ? (lightSide ? hex("3f8a44") : hex("2f7d3a")) : (lightSide ? hex("2a6a30") : hex("1c5426")); mark(cx + u, cz + z, col); }
        for (let i = 0; i < 9; i++) { const th = i * 2.4 + .4, rr = (R + r0) / 2 + (N(i, 3) - .5) * 3; const u = Math.cos(th) * rr, z = Math.sin(th) * rr; mark(cx + u, cz + z, hex("e0352a")); mark(cx + u + 1, cz + z, hex("a81f16")); mark(cx + u, cz + z + 1, hex("ff8a78")); }
        const B = hex("c8352a"), Bl = hex("e65a48"), Bd = hex("8a1f16"), bz = cz - R + 1;
        for (let i = 0; i < 6; i++) for (let j = -i / 2 - 1; j <= i / 2 + 1; j++) { mark(cx - 2 - i, bz + j, i > 3 ? Bl : B); mark(cx + 2 + i, bz + j, i > 3 ? Bd : B); }
        for (let u = -2; u <= 2; u++) for (let z = -2; z <= 2; z++) mark(cx + u, bz + z, u < 0 ? Bl : B);
        for (let i = 0; i < 9; i++) { mark(cx - 3 - i * .45, bz - 3 - i, i % 2 ? B : Bd); mark(cx - 2 - i * .45, bz - 3 - i, B); mark(cx + 3 + i * .45, bz - 3 - i, Bd); mark(cx + 2 + i * .45, bz - 3 - i, B); }
    });
}
/* three stockings on nails: cuffs, a heel and toe, a stripe */
function stockings(c, a) {
    const { shape, wall } = canvas(c, a), CL = [["c8352a", "e65a48", "8a1f16"], ["2f7d3a", "4fa858", "1c5426"], ["3a6ab0", "6a9ad8", "244678"]];
    CL.forEach((cc, n) => { const u0 = 4 + n * 16, z0 = 92, C = cc.map(hex), W2 = hex("f6f2e8"), S2 = hex("c8c2b0");
        shape(mark => { for (let z = 0; z < 16; z++) for (let u = 0; u < 8; u++) mark(u0 + u, z0 - z, u < 2 ? C[1] : u > 5 ? C[2] : (z > 5 && z < 8 ? W2 : C[0])); for (let z = 16; z < 22; z++) for (let u = -5 + (z - 16 < 2 ? 2 : 0); u < 8; u++) mark(u0 + u, z0 - z, z > 19 ? C[2] : u < -2 ? W2 : (u > 5 ? C[2] : C[0])); for (let z = -4; z < 1; z++) for (let u = -1; u < 9; u++) mark(u0 + u, z0 - z, z === -4 || u === 8 ? S2 : W2); });
        wall(u0 + 4, z0 + 7, K); wall(u0 + 4, z0 + 6, hex("d6ad56")); });
}
/* holly along a stretch of wall: spiky leaves in pairs, berries where they meet */
function holly(c, a) {
    const { shape, wall } = canvas(c, a), W = 64, Z = 118;
    for (let u = 0; u <= W; u += .5) { const z = sag(u, W, Z, 8); wall(u, z, hex("3a2410")); }
    for (let n = 0; n < 5; n++) { const u0 = 7 + n * 12.5, z0 = sag(u0, W, Z, 8);
        for (const side of [-1, 1]) shape(mark => { for (let i = 0; i < 9; i++) { const wid = Math.round(2.6 * Math.sin((i + 1) / 10 * Math.PI)) + (i % 3 === 1 ? 1 : 0); for (let j = -wid; j <= wid; j++) mark(u0 + side * (i + 1), z0 - 1 + j - i * .25, j === 0 ? hex("6cb05e") : (j > 0 ? hex("3f8a44") : hex("1c5426"))); } });
        shape(mark => { for (const [p, q] of [[0, 0], [2, -1], [-2, -1]]) for (const [e, f] of [[0, 0], [1, 0], [0, 1], [1, 1]]) mark(u0 + p + e, z0 + q + f, e === 0 && f === 1 ? hex("ff8a78") : e === 1 && f === 0 ? hex("a81f16") : hex("e0352a")); }); }
}
/* two candy canes, crossed, tied with a sprig */
function canes(c, a) {
    const { shape } = canvas(c, a), cane = (u0, flip) => shape(mark => { const stripe = t => Math.floor(t / 3) % 2 ? hex("f6f2e8") : hex("d0352a"), dark = t => Math.floor(t / 3) % 2 ? hex("c8c2b0") : hex("8a1f16"), put = (u, z, t) => { mark(u0 + u * flip, z, stripe(t)); mark(u0 + u * flip + 1, z, dark(t)); mark(u0 + u * flip - 1, z, stripe(t)); }; for (let i = 0; i < 26; i++) put(i * .3 * -1, 72 + i, i); for (let th = 0; th <= Math.PI; th += .12) put(-7.8 + (-Math.cos(th) * 4.5) - 4.5 + 4.5 * 0, 98 + Math.sin(th) * 5, 26 + th * 5); });
    cane(12, 1); cane(4, -1);
    shape(mark => { for (let u = 2; u <= 12; u++) for (let z = 80; z <= 83; z++) mark(u, z, z > 81 ? hex("e65a48") : hex("c8352a")); });
}
/* a snowman, three shaded balls with a scarf, a hat and a carrot */
function snowman(c, a) {
    const { set } = canvas(c, a), ball = (cx, cy, r) => { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const d = Math.hypot(x, y); if (d > r + .6) continue; if (d > r - .4) { set(cx + x, cy + y, K); continue; } const lit = (-x * .6 - y * .8) / r, col = lit > .55 ? [255, 255, 255] : lit > .05 ? [240, 244, 250] : lit > -.45 ? [208, 218, 232] : [170, 184, 206]; set(cx + x, cy + y, col); } };
    const X = a[0], Y = a[1];
    for (let x = -11; x <= 11; x++) for (let y = -3; y <= 3; y++) if (Math.hypot(x, y * 3) < 11) set(X + x, Y + 1 + y, [150, 164, 186]);
    ball(X, Y - 8, 9); ball(X, Y - 21, 7); ball(X, Y - 31, 5);
    for (let x = -6; x <= 6; x++) { set(X + x, Y - 26, K); set(X + x, Y - 25, hex("c8352a")); set(X + x, Y - 24, hex("8a1f16")); }
    for (let y = -24; y < -17; y++) { set(X + 4, Y + y, hex("c8352a")); set(X + 5, Y + y, hex("8a1f16")); set(X + 3, Y + y, K); set(X + 6, Y + y, K); }
    for (const y of [-21, -17, -12, -7]) { set(X, Y + y, K); set(X + 1, Y + y, K); }
    set(X - 2, Y - 32, K); set(X + 2, Y - 32, K); for (let i = 0; i < 5; i++) { set(X + 1 + i, Y - 30 + Math.floor(i / 3), hex("e8842a")); set(X + 1 + i, Y - 29 + Math.floor(i / 3), K); } for (const [x, y] of [[-2, -28], [0, -27], [2, -27]]) set(X + x, Y + y, K);
    for (let x = -7; x <= 7; x++) { set(X + x, Y - 36, K); set(X + x, Y - 35, hex("2a2630")); } for (let x = -4; x <= 4; x++) for (let y = -44; y < -36; y++) set(X + x, Y + y, x === -4 || x === 4 || y === -44 ? K : y > -39 ? hex("c8352a") : x < -1 ? hex("4a4452") : hex("2a2630"));
}
function swag(c, a) {
    const { wall, shape } = canvas(c, a), W = 16, Z = 126, DROP = 3;
    /* the rope: needles in three greens round a sagging line, and a darker underside, no line at the tile's ends so the next tile carries on */
    for (let u = 0; u < W; u += .5) { const z = sag(u, W, Z, DROP); for (let d = -2.5; d <= 2.5; d += .5) { const n = N(Math.round(u * 2), Math.round(d * 2) + 9), edge = Math.abs(d) > 2.2 - n * .8; if (edge && n < .6) continue; const col = d > 1.5 ? hex("6cb05e") : d > .5 ? (n > .5 ? hex("4fa858") : hex("3f8a44")) : d > -1 ? hex("2f7d3a") : hex("1c5426"); wall(u, z + d, col); } wall(u, sag(u, W, Z, DROP) - 3, K); wall(u, sag(u, W, Z, DROP) + 3, [16, 34, 18]); }
    /* holly where the tiles meet: spiky leaves both ways, three berries */
    for (const side of [-1, 1]) shape(mark => { for (let i = 0; i < 6; i++) { const wid = Math.round(2 * Math.sin((i + 1) / 7 * Math.PI)) + (i % 3 === 1 ? 1 : 0); for (let j = -wid; j <= wid; j++) mark(side * (i + 1), Z + 1 + j - i * .3, j === 0 ? hex("6cb05e") : (j > 0 ? hex("3f8a44") : hex("1c5426"))); } });
    shape(mark => { for (const [p, q] of [[0, 0], [2, -1], [-2, -1]]) for (const [e, f] of [[0, 0], [1, 0], [0, 1], [1, 1]]) mark(p + e, Z - 2 + q + f, e === 0 && f === 1 ? hex("ff8a78") : e === 1 && f === 0 ? hex("a81f16") : hex("e0352a")); });
}
module.exports = { swag, bunting, festoon, wreath, stockings, holly, canes, snowman };
