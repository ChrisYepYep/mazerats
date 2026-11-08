/* Arcade cabinets for the Hallway, one per game (8 Nov 2026, the owner's: "strictly only the yellow one ... we'll use that to recolour").
   The yellow cabinet is Habbo Origins' Falling Furni Arcade Cabinet, from the client's own casts (assets/furni/s_falling_furni_arcade_*).
   Each other cabinet is the same picture with the yellow body taken to the game's colour, every shade keeping its own lightness,
   and the Fallin' Furni chairs painted out of its side, since they're that game's own art. The screen glows in the game's colour. */
"use strict";
const L = require("./lib.js");
const GAMES = [
    { id: "ff", name: "Fallin' Furni", path: "/fallinfurni", colour: null, glow: [120, 220, 110] },
    { id: "pura", name: "Pura Panic", path: "/purapanic", colour: [176, 24, 44], glow: [255, 120, 130] },
    { id: "guess", name: "Guess the Maze", path: "/guess", colour: [122, 74, 40], glow: [255, 210, 140] },
    { id: "odd", name: "Odd One Out", path: "/odd", colour: [181, 121, 61], glow: [255, 230, 170] },
    { id: "scout", name: "Scout's Trail", path: "/scout", colour: [63, 122, 58], glow: [170, 255, 150] },
    { id: "quiz", name: "Quiz Night", path: "/quiz", colour: [91, 63, 160], glow: [200, 170, 255] }
];
const toHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; };
const fromHsl = ([h, s, l]) => { if (!s) return [l, l, l].map(v => Math.round(v * 255)); const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)); };
/* the cabinet's body: a warm yellow-orange of any shade */
const isBody = c => { const [h, s, l] = toHsl(c); return h > 25 / 360 && h < 62 / 360 && s > .4 && l > .16; };
function cabinet(game, big) {
    const pre = big ? "" : "s_", im = L.loadPng(L.R + "assets/furni/" + pre + "falling_furni_arcade_0_2_a.png"), W = im.w, H = im.h, d = Uint8ClampedArray.from(im.rgba);
    /* where the bottom tip of the base is: the foot that stands on the tile's near corner */
    let fy = -1, fx = 0; for (let y = H - 1; y >= 0 && fy < 0; y--) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 128) { fy = y; fx = x; break; }
    if (game.colour) {
        const T = toHsl(game.colour), at = (x, y) => { const p = (y * W + x) * 4; return [d[p], d[p + 1], d[p + 2]]; };
        /* the side's own colour: the commonest body shade on the left face */
        const hist = new Map(); for (let y = Math.round(H * .3); y < H; y++) for (let x = 0; x < fx; x++) { const p = (y * W + x) * 4; if (d[p + 3] < 128) continue; const c = at(x, y); if (!isBody(c)) continue; const k = c.join(); hist.set(k, (hist.get(k) || 0) + 1); }
        const side = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
        /* the chairs and the stone on the side: everything inside the side face that isn't the body is painted over in the side's colour,
           their outlines too. The face runs from the cabinet's left outline to just short of its front corner, above its own bottom edge */
        const top = Math.round(H * .36), lowest = []; for (let x = 0; x < W; x++) { let ly = -1; for (let y = H - 1; y >= 0; y--) if (d[(y * W + x) * 4 + 3] > 128) { ly = y; break; } lowest[x] = ly; }
        for (let y = top; y < H; y++) { let left = -1; for (let x = 0; x < fx; x++) if (d[(y * W + x) * 4 + 3] > 128) { left = x; break; } if (left < 0) continue;
            for (let x = left + 1; x < fx; x++) { const p = (y * W + x) * 4; if (d[p + 3] < 128 || y >= lowest[x] - 1) continue; const c = at(x, y), lum = c[0] * .3 + c[1] * .59 + c[2] * .11; if (x < fx - 1 || (!isBody(c) && lum >= 40)) { d[p] = side[0]; d[p + 1] = side[1]; d[p + 2] = side[2]; } } }
        /* the body to the game's colour, each shade keeping its lightness */
        for (let i = 0; i < W * H; i++) { const p = i * 4; if (d[p + 3] < 128) continue; const c = [d[p], d[p + 1], d[p + 2]]; if (!isBody(c)) continue; const [, s, l] = toHsl(c), n = fromHsl([T[0], Math.min(1, T[1] * (.55 + s * .5)), Math.min(.92, l * (T[2] / .5) * .95)]); d[p] = n[0]; d[p + 1] = n[1]; d[p + 2] = n[2]; }
    }
    /* the screen lit in the game's colour: its dark glass picks up a glow, brighter towards the middle */
    { const G = game.glow, sx0 = Math.round(W * .45), sx1 = Math.round(W * .86), sy0 = Math.round(H * .18), sy1 = Math.round(H * .5);
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { const p = (y * W + x) * 4; if (d[p + 3] < 128) continue; const c = [d[p], d[p + 1], d[p + 2]], [h, s, l] = toHsl(c); if (!(l < .3 && l > .04 && (h > 90 / 360 && h < 200 / 360))) continue; const k = .45; d[p] = Math.round(c[0] + (G[0] * .5 - c[0]) * k); d[p + 1] = Math.round(c[1] + (G[1] * .5 - c[1]) * k); d[p + 2] = Math.round(c[2] + (G[2] * .5 - c[2]) * k); } }
    return { w: W, h: H, rgba: d, foot: [fx, fy] };
}
module.exports = { GAMES, cabinet };
