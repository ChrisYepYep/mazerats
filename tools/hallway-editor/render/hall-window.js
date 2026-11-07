/* A window in the wall: frame in the wall's own wood, a clean board along the bottom, dark inner frame, glazing bars. Any width, bottom and top.
   Drawn once per size with the same small ray-caster the other new pieces were made with, and shared by the drawing and nothing else.
   Its art is for a wall running along y; hw3.js mirrors it for the other. */
"use strict";
const iso = require("../ideas/iso3d.js"), { box, M, render, col } = iso;
const groove = (face, p) => { if (face === "x") return Math.floor(p[1] + 400) % 6 === 0 ? "34180b" : Math.floor(p[1] + 400) % 6 === 3 ? "593422" : "452313"; if (face === "y") return Math.floor(p[0] + 400) % 6 === 0 ? "452313" : "593422"; return null; };
const cache = new Map();
function barsOf(W) { return Math.max(1, Math.round(W / 26)); }
function railsOf(b, top) { return top - b > 90 ? [b + (top - b) * .33, b + (top - b) * .66] : [b + (top - b) * .55]; }
function art(W, bottom, top) {
    const key = W + "," + bottom + "," + top; if (cache.has(key)) return cache.get(key);
    const FR = { top: col("93705a"), y: col("593422"), x: col("452313"), ny: col("34180b"), nx: col("34180b"), edge: col("120704") }, DK = M("593422", "452313", "34180b", "120704"), RL = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704") };
    const ps = [], Hh = top, b = bottom, bars = barsOf(W);
    ps.push(box(-10, 0, -3, 0, b, Hh, { ...FR, y: col("593422") }));
    if (b) ps.push(box(-10, 6, -5, W + 5, b - 3, b + 1, RL)); else ps.push(box(-10, 4, -4, W + 4, 0, 3, RL));
    const y0 = b ? b + 1 : 3;
    ps.push(box(0, 3.5, -4, 1, y0, Hh + 3, { ...FR, tex: groove }), box(0, 3.5, W - 1, W + 4, y0, Hh + 3, { ...FR, tex: groove }));
    ps.push(box(0, 5, -5, W + 5, Hh, Hh + 4, RL));
    ps.push(box(-3, -1, 1, 2, y0, Hh, DK), box(-3, -1, W - 2, W - 1, y0, Hh, DK), box(-3, -1, 1, W - 1, Hh - 2, Hh, DK), box(-3, -1, 1, W - 1, y0, y0 + 2, DK));
    for (let i = 1; i <= bars; i++) { const y = W * i / (bars + 1); ps.push(box(-5, -3, y - 1, y + 1, y0, Hh, FR)); }
    for (const z of railsOf(b, Hh)) ps.push(box(-5, -3, 1, W - 1, z - 1, z + 1, FR));
    const s = render(ps, { wall: { at: 0, inside: (y, z) => y > 0 && y < W && z >= y0 && z < Hh } });
    if (cache.size > 60) cache.clear(); cache.set(key, s); return s;
}
/* the sun comes in at this slant, and through the panes only */
const SUN = [1, .34, -.92];
function litByWindow(W, b, top, wy, wz) { if (wy < 1 || wy > W - 1 || wz < b + 2 || wz > top - 2) return false; const bars = barsOf(W); for (let i = 1; i <= bars; i++) if (Math.abs(wy - W * i / (bars + 1)) < 1.3) return false; for (const z of railsOf(b, top)) if (Math.abs(wz - z) < 1.3) return false; return true; }
/* which part of the grounds each window looks on: centres in the hotel view's picture */
const PLACES = { lawn: [640, 350], road: [480, 400], maze: [560, 430], park: [340, 320] };
module.exports = { art, SUN, litByWindow, PLACES };
