/* The rope barrier: two poles, a hanging rope with a clasp at each end, and a wooden card in the middle (or not: p.noCard).
   A placed piece is { k: "rope", x, y, len, rot, noCard? }. It stands on a row of tiles and avatars can't cross them, like any furniture.
   Shared by the drawing (render/hw3.js) and the editor (placing ghost, cutting the Habbo), so the two can't disagree.
   Colours are the globe lamp's own (art/lamps/globe-lamp.png), its foot rounded; h is a step between its l and W, for the clasp. */
(function () {
"use strict";
const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const paint = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rgb(v)]));
const G = paint({ K: "000000", W: "eed09c", h: "c49660", l: "ab7a44", d: "6e4524", s: "54321a", L: "8c5c30", M: "ab7a44", N: "eed09c", O: "6e4524", P: "3a2110" });
const ROPE = paint({ lit: "a8322e", lit2: "8a1f22", mid: "641015", line: "220406" });
const CARD = paint({ K: "26140a", top: "b08248", face: "8e6030", ink: "2e1a0c", str: "2a0a08" });
const SHAFT = ".....KsLsK.....", GLINT = ".....KsMsK.....", HOT = ".....KsNsK.....";
const POLE = [
    "......KKK......",
    ".....KNMLK.....",
    "....KNNMLOK....",
    "....KMMLLOK....",
    "....KLLLOPK....",
    ".....KLOPK.....",
    "....KNMLOPK....",
    ".....KKKKK.....",
    HOT, GLINT, GLINT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, GLINT, HOT, GLINT, SHAFT, SHAFT,
    "...KKMsLsMKK...",
    ".KKMMNsLsMMLKK.",
    "KNNMMMNLMMMMLLK",
    "KNMMMMMMMMMMMLK",
    "KOONMMMMMMMMLPK",
    ".KOOONNMMMLPPK.",
    "..KKOOOOPPPKK..",
    "....KKKKKKK...."
];
const FOOT = POLE.length - 5;      // the stamp's row that stands on the floor: the middle of the disc's top
const ATTACH = FOOT - 6;           // rows up from the floor where the rope clips on: the ring under the ball
const IN = .36;                    // how far in from the run's ends the poles stand, in tiles
const END = 7;                     // columns from a pole's centre that its clasp takes
const CARD_W = 17, CARD_H = 10, CARD_DROP = 3;
const MIN_FOR_CARD = 3;            // on 2 tiles the clasps and the card leave no rope to see

/* at(fx, fy) gives the screen spot on the floor there. Returns { list: [X, Y, colour, tile of the run], feet: [[X, Y, tile]] }, far pole first, in painting order. */
function pixels(p, at) {
    const n = Math.max(2, p.len || 3), along = !!p.rot, spot = d => along ? at(p.x + .5, p.y + d) : at(p.x + d, p.y + .5);
    const a = spot(IN), b = spot(n - IN), list = [], put = (x, y, c, t) => list.push([x, y, c, t]);
    const part = p.part, poles = part !== "rope" && part !== "hanging", cords = part !== "poles" && part !== "hanging";
    const pole = (f, t) => { if (poles) POLE.forEach((row, r) => { for (let i = 0; i < 15; i++) if (row[i] !== ".") put(f[0] + i - 7, f[1] + r - FOOT, G[row[i]], t); }); };
    const dir = b[0] > a[0] ? 1 : -1, wide = Math.abs(b[0] - a[0]), sag = Math.min(11, 3 + n * 1.3);
    const yAt = X => { const t = Math.abs(X - a[0]) / wide; return a[1] + (b[1] - a[1]) * t - ATTACH + sag * 4 * t * (1 - t); };
    pole(a, 0);
    let last = null;
    /* unclipped: it hangs from the near pole */
    if (part === "hanging") for (let k = 0; k < 16; k++) { put(b[0] + 3, b[1] - ATTACH + k, k < 2 ? G.l : k % 4 < 2 ? ROPE.lit : ROPE.mid, n - 1); put(b[0] + 4, b[1] - ATTACH + k, ROPE.line, n - 1); }
    if (cords) for (let k = END; k <= wide - END; k++) {
        const X = a[0] + dir * k, y = Math.round(yAt(X)), from = last === null ? y : Math.min(y, last), to = last === null ? y : Math.max(y, last);
        const t = Math.max(0, Math.min(n - 1, Math.floor(IN + (k / wide) * (n - 2 * IN))));
        put(X, from - 1, ((k + Math.floor(k / 2)) % 4) < 2 ? ROPE.lit : ROPE.lit2, t);
        for (let q = from; q <= to; q++) put(X, q, ROPE.mid, t);
        put(X, to + 1, ROPE.line, t);
        last = y;
    }
    /* A clasp: a ring on the pole, a thin hook, and a short sleeve the rope goes into. The far pole's is painted over its shaft; the near pole is painted after its own, so that hook goes round the back. */
    const clasp = (from, sign, t) => {
        const R = [from[0] + sign * 3, from[1] - ATTACH], Qx = from[0] + sign * END, Q = [Qx, Math.round(yAt(Qx))];
        const L = Math.hypot(Q[0] - R[0], Q[1] - R[1]) || 1, ux = (Q[0] - R[0]) / L, uy = (Q[1] - R[1]) / L;
        const seg = (s0, s1, r, shade) => {
            const x0 = Math.floor(R[0] + ux * s0), x1 = Math.floor(R[0] + ux * s1), y0 = Math.floor(R[1] + uy * s0), y1 = Math.floor(R[1] + uy * s1);
            for (let y = Math.min(y0, y1) - 4; y <= Math.max(y0, y1) + 4; y++) for (let x = Math.min(x0, x1) - 4; x <= Math.max(x0, x1) + 4; x++) {
                const dx = x - R[0], dy = y - R[1], s = Math.max(s0, Math.min(s1, dx * ux + dy * uy)), nx = dx - ux * s, ny = dy - uy * s, d = Math.hypot(nx, ny);
                if (d <= r + .5) put(x, y, shade(d, ny, r), t);
            }
        };
        const sleeveAt = Math.max(0, L - 3);
        seg(0, sleeveAt, 1.2, (d, ny) => d > .85 ? G.K : ny < 0 ? G.h : G.l);
        seg(sleeveAt, L, 2, (d, ny, r) => d > r - .5 ? G.K : ny < -.4 ? G.W : ny < .4 ? G.l : G.d);
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) { const d = Math.hypot(x, y); if (d <= 2.4) put(R[0] + x, R[1] + y, d > 1.4 ? G.K : y < 0 ? G.W : G.l, t); }
        for (let s = 0; s <= L - 2; s += .4) put(Math.round(R[0] + ux * s), Math.round(R[1] + uy * s), s > 1 && s < L - 3 ? G.h : G.l, t);
    };
    if (cords) { clasp(a, dir, 0); clasp(b, -dir, n - 1); }
    if (cords && !p.noCard && n >= MIN_FOR_CARD) {
        /* it hangs flat in the rope's plane, so it slants with it. Two plain ruled lines: two rows apart they'd lock into a checker on the slant. */
        const t = Math.floor(n / 2), slope = (b[1] - a[1]) / (b[0] - a[0]), midX = Math.round((a[0] + b[0]) / 2), left = midX - Math.floor(CARD_W / 2), cy = Math.round(yAt(midX)) + 1;
        const yOf = u => cy + Math.round((u - Math.floor(CARD_W / 2)) * slope);
        for (const u of [3, CARD_W - 4]) { const from = Math.round(yAt(left + u)) + 2, to = yOf(u) + CARD_DROP; for (let y = from; y < to; y++) put(left + u, y, CARD.str, t); }
        for (let u = 0; u < CARD_W; u++) for (let r = 0; r < CARD_H; r++) {
            const sideEdge = u === 0 || u === CARD_W - 1, endEdge = r === 0 || r === CARD_H - 1;
            if (sideEdge && endEdge) continue;
            put(left + u, yOf(u) + CARD_DROP + r, sideEdge || endEdge ? CARD.K : r === 1 ? CARD.top : CARD.face, t);
        }
        for (const r of [3, 6]) for (let u = 2; u <= 14; u++) put(left + u, yOf(u) + CARD_DROP + r, CARD.ink, t);
    }
    pole(b, n - 1);
    return { list, feet: [[a[0], a[1], 0], [b[0], b[1], n - 1]] };
}
const api = { pixels, MIN_FOR_CARD };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.RopeBarrier = api;
})();
