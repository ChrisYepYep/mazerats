/* Shared by the checks and the final build: crops from the real renders, compositing, saving */
"use strict";
const fs = require("fs"), R = require("path").resolve(__dirname, "../../..").replace(/\\/g, "/") + "/", dec = require(R + "tools/png-decode.js"), { encodePng } = require(R + "tools/png-encode.js");
const maps = {};
function map(name) { if (!maps[name]) { const m = JSON.parse(fs.readFileSync(__dirname + "/" + name + ".json")), im = dec.decodePng(fs.readFileSync(__dirname + "/" + name + ".png")); maps[name] = { m, W: im.width || im.w, d: im.data || im.rgba || im.d }; } return maps[name]; }
/* a crop centred on tile (x, y) of a floor at height z. Returns an image with S(x, y) for tile spots. */
function crop(name, x, y, z, w = 320, h = 200) {
    const src = map(name), cx = Math.round((x - y) * 16) + src.m.ox, cy = Math.round((x + y) * 8) + src.m.oy - z, L = cx - (w >> 1), T = cy - (h >> 1), d = Buffer.alloc(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const a = ((T + j) * src.W + L + i) * 4, q = (j * w + i) * 4; d[q] = src.d[a]; d[q + 1] = src.d[a + 1]; d[q + 2] = src.d[a + 2]; d[q + 3] = 255; }
    return { w, h, d, S: (X, Y) => [Math.round((X - x - (Y - y)) * 16) + (w >> 1), Math.round((X - x + Y - y) * 8) + (h >> 1)], at: { x, y, z } };
}
const clone = c => ({ ...c, d: Buffer.from(c.d) });
/* draw a sprite so its model origin lands at (X, Y) */
function put(c, sp, X, Y, data = sp.rgba) {
    X = Math.round(X); Y = Math.round(Y);
    for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) { const p = (j * sp.w + i) * 4; if (!data[p + 3]) continue; const x = X - sp.ox + i, y = Y - sp.oy + j; if (x < 0 || y < 0 || x >= c.w || y >= c.h) continue; const q = (y * c.w + x) * 4, a = data[p + 3] / 255; for (let k = 0; k < 3; k++) c.d[q + k] = c.d[q + k] * (1 - a) + data[p + k] * a; c.d[q + 3] = 255; }
}
function loadPng(file) { const im = dec.decodePng(fs.readFileSync(file)); return { w: im.width || im.w, h: im.height || im.h, ox: 0, oy: 0, rgba: im.data || im.rgba || im.d }; }
/* several images, each enlarged, side by side into one PNG */
function sheet(file, items, zoom = 3, cols = 2) {
    const gap = 8, cw = Math.max(...items.map(c => c.w)) * zoom, ch = Math.max(...items.map(c => c.h)) * zoom, rows = Math.ceil(items.length / cols), W = cols * (cw + gap) + gap, H = rows * (ch + gap) + gap, O = Buffer.alloc(W * H * 4);
    for (let i = 3; i < O.length; i += 4) { O[i] = 255; O[i - 3] = 24; O[i - 2] = 18; O[i - 1] = 14; }
    items.forEach((c, n) => { const ox = gap + (n % cols) * (cw + gap), oy = gap + Math.floor(n / cols) * (ch + gap); for (let j = 0; j < c.h * zoom; j++) for (let i = 0; i < c.w * zoom; i++) { const a = (Math.floor(j / zoom) * c.w + Math.floor(i / zoom)) * 4, q = ((oy + j) * W + ox + i) * 4; const al = c.d[a + 3] / 255; O[q] = c.d[a] * al + 24 * (1 - al); O[q + 1] = c.d[a + 1] * al + 18 * (1 - al); O[q + 2] = c.d[a + 2] * al + 14 * (1 - al); O[q + 3] = 255; } });
    fs.writeFileSync(file, encodePng(W, H, O));
}
const b64 = c => "data:image/png;base64," + encodePng(c.w, c.h, Buffer.from(c.d || c.rgba)).toString("base64");
module.exports = { R, map, crop, clone, put, loadPng, sheet, b64, encodePng, dec };
