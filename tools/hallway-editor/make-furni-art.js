/* The whole sofa, table and planter for the library's thumbnails, and the floor lamp for its placing
   ghost (it's drawn by code, so it has no sprite of its own).
   Run again if the art changes: node tools/hallway-editor/make-furni-art.js */
"use strict";
const path = require("path");
const W = require("./render/hw3.js");
const Parts = require("./furni-parts.js");
const H = W.H, REG = require("./art/regs.json").hall;
const OUT = path.join(__dirname, "art");

/* the drawing only writes colour, never see-through: start on a colour nothing here uses, and clear that after */
function blank(w, h) { const b = new W.Buf(w, h); for (let i = 0; i < b.d.length; i += 4) { b.d[i] = 255; b.d[i + 1] = 0; b.d[i + 2] = 255; b.d[i + 3] = 255; } return b; }
function finish(b, file) { for (let i = 0; i < b.d.length; i += 4) if (b.d[i] === 255 && b.d[i + 1] === 0 && b.d[i + 2] === 255) b.d[i + 3] = 0; b.save(path.join(OUT, file)); }

function thumb(name, k, len) {
    const b = blank(96, 96), ox = 48 - (len - 1) * 8, oy = 58 - (len - 1) * 4;
    for (const q of Parts.parts({ k, x: 0, y: 0, len })) for (const n of q.names) {
        const im = H.piece(n), r = REG[n] || [0, 0], lx = ox + q.x * 16 - 16, ly = oy + q.x * 8 + 8;
        b.blit(im, q.flip ? lx + 32 + r[0] - im.w : lx - r[0], ly - r[1], { flip: q.flip });
    }
    finish(b, "thumbs/" + name + ".png");
}
/* the rope barrier is drawn by code too */
{
    const b = blank(96, 96), S = (x, y) => [Math.round((x - y) * 16) + 24, Math.round((x + y) * 8) + 58];
    for (const [X, Y, c] of require("./render/rope-barrier.js").pixels({ x: 0, y: 0, len: 3 }, S).list) b.set(X, Y, c);
    finish(b, "thumbs/rope.png");
}
thumb("sofa", "sofa", 3);
thumb("table", "table", 3);
thumb("planter", "ero", 3);
for (const v of ["stone", "walnut", "evergreen", "flower"]) thumb("planter-" + v, "ero_" + v, 3);

/* the lamp, standing with the middle of its tile at (40, 96) */
const b = blank(80, 112);const w = { b, S: (x, y) => [40 + (x - y) * 16, 96 + (x + y - 1) * 8], sprites: [], lamps: [], z: 0 };
/* one ghost per design, and the library's picture from the first */
for (const [i, style] of Object.keys(W.LAMP_STYLES).entries()) {
    const c = blank(80, 112); w.b = c; w.sprites = []; W.floorLamp(w, 0, 0, style); w.sprites.forEach(s => s.draw());
    if (!i) { const big = new W.Buf(80, 80); big.d.fill(0); const c2 = blank(80, 112); w.b = c2; w.sprites = []; W.floorLamp(w, 0, 0, style); w.sprites.forEach(s => s.draw()); for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) { const q = ((y >> 1) * 1 + 46) * 80 + (x >> 1) + 20, p = (y * 80 + x) * 4; const m = c2.d[q * 4] === 255 && c2.d[q * 4 + 1] === 0 && c2.d[q * 4 + 2] === 255; for (let k = 0; k < 3; k++) big.d[p + k] = c2.d[q * 4 + k]; big.d[p + 3] = m ? 0 : 255; } big.save(path.join(OUT, "thumbs", "lamp.png")); }
    finish(c, "lamp-" + style + ".png");
}
/* the wall light, for its ghost and the library: the wall point it hangs from is at (20, 25) */
for (const [name, mapY] of [["sconce-x", false], ["sconce-y", true]]) {
    const b2 = blank(40, 40);
    H.lamp({ b: b2, lampH: 0, lamps: [], WX: (x, y, u, h) => [20 + u, 25 + Math.floor(u / 2) - h], WY: (x, y, u, h) => [20 + u, 25 - Math.floor(u / 2) - h] }, 0, 0, { mapY });
    finish(b2, name + ".png");
    if (!mapY) { const big = new W.Buf(64, 64); big.d.fill(0); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const q = ((y >> 1) + 6) * 40 + (x >> 1) + 0; const p = (y * 64 + x) * 4, q4 = q * 4; if (q4 + 3 < b2.d.length) for (let k = 0; k < 4; k++) big.d[p + k] = b2.d[q4 + k]; } big.save(path.join(OUT, "thumbs", "sconce.png")); }
}
console.log("done");
/* the floor edges, for the library */
const EdgeItems = require("./render/edge-items.js");
for (const s of Object.keys(EdgeItems.STYLES)) {
    const b3 = blank(96, 96), at = (fx, fy) => [14 + (fx - fy) * 16, 38 + (fx + fy) * 8];
    for (const [X, Y, c] of EdgeItems.pixels({ s, axis: "x", line: 0, dir: 1, a: 0, b: 4 }, at, () => 0)) b3.set(X, Y, c);
    finish(b3, "edge-" + s + ".png");
}
/* the small globe light, for its ghost and the library: the wall point it hangs from is at (20, 25) */
for (const [name, mapY] of [["sconce-globe-x", false], ["sconce-globe-y", true]]) {
    const b4 = blank(40, 40), at = (u, h) => [20 + u, 25 + (mapY ? -1 : 1) * Math.floor(u / 2) - h];
    W.smallGlobe({ b: b4 }, at, mapY ? 1 : -1, {});
    finish(b4, name + ".png");
}
for (const [name, out] of [["sconce-globe-back-l", -1], ["sconce-globe-back-r", 1]]) {
    const b5 = blank(40, 40), at = (u, h) => [20 + u, 25 + (out < 0 ? 1 : -1) * Math.floor(u / 2) - h];
    W.smallGlobe({ b: b5 }, at, out, { back: true });
    finish(b5, name + ".png");
}
