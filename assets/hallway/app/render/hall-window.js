/* A window in the wall: frame in the wall's own wood, a clean board along the bottom, dark inner frame, glazing bars. Any width, bottom and top.
   Drawn once per size with the same small ray-caster the other new pieces were made with, and shared by the drawing and nothing else.
   Its art is for a wall running along y; hw3.js mirrors it for the other. */
(function () {
"use strict";
const iso = typeof window !== "undefined" && window.Iso3d ? window.Iso3d : require("../ideas/iso3d.js"), { box, M, render, col } = iso;
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
/* a window with no view picked (14 Nov 2026, his: "All windows show the same view outside") looks out at the part of the grounds behind
   where it stands: its place on the screen picks the middle of what it shows, so windows side by side show neighbouring parts of one view,
   and windows far apart different ones. Kept inside the picture (720 x 498), right of the hotel itself (its orange front filled the glass), and
   low enough to take in the grounds as well as the skyline.
   sx, sy are the map's own screen position (w.S less the buffer origin w.ox, w.oy), never pixels in the clipped buffer: those moved with the
   render tile, so the editor's and the published tiles showed different views, split down tile seams (14 Nov scan, renderer 1) */
const placeFor = (sx, sy, wide, tall) => {
    const W = 720, H = 498, x0 = Math.max(wide / 2 + 10, 310), x1 = W - wide / 2 - 10, y0 = Math.max(tall / 2, 290), y1 = Math.min(H - tall / 2, 380);      // right of the hotel: skyline, lawn, car park, road, maze
    const span = x1 - x0, x = x0 + (((Math.round(sx * .45) % span) + span) % span), ys = y1 - y0, y = y0 + (((Math.round(sy * .25) % Math.max(1, ys)) + ys) % Math.max(1, ys));
    return [Math.round(x), Math.round(y)];
};
const api = { art, SUN, litByWindow, PLACES, placeFor };
/* in node, and in the page as window.HallWindow: the window snow falls only where the view shows past this frame */
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.HallWindow = api;
})();
