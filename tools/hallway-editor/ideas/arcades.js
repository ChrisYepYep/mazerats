/* Arcade cabinets for the Hallway, one per game (8 Nov 2026, the owner's: "strictly only the yellow one ... we'll use that to recolour").
   The yellow cabinet is Habbo Origins' Falling Furni Arcade Cabinet, from the client's own casts (assets/furni/s_falling_furni_arcade_*).
   Each other cabinet is the same picture with the yellow body taken to the game's colour, every shade keeping its own lightness,
   and the Fallin' Furni chairs painted out of its side, since they're that game's own art. The screen glows in the game's colour. */
"use strict";
const L = require("./lib.js");
const GAMES = [
    { id: "ff", name: "Fallin' Furni", path: "/fallinfurni", colour: null, glow: [120, 220, 110] },
    { id: "pura", name: "Pura Panic", path: "/purapanic", colour: [176, 24, 44], glow: [255, 120, 130] },
    { id: "guess", name: "Guess the Maze", path: "/guess", colour: [92, 54, 30], glow: [255, 210, 140] },
    { id: "odd", name: "Odd One Out", path: "/odd", colour: [181, 121, 61], glow: [255, 230, 170] },
    { id: "scout", name: "Scout's Trail", path: "/scout", colour: [63, 122, 58], glow: [170, 255, 150] },
    { id: "quiz", name: "Quiz Night", path: "/quiz", colour: [91, 63, 160], glow: [200, 170, 255] }
];
const toHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; };
const fromHsl = ([h, s, l]) => { if (!s) return [l, l, l].map(v => Math.round(v * 255)); const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)); };
/* the cabinet's body: a warm yellow-orange of any shade */
const isBody = c => { const [h, s, l] = toHsl(c); return h > 25 / 360 && h < 62 / 360 && s > .4 && l > .16; };
/* The small cabinet's side face, as [x, y, nearFloor]: from just inside its left outline to just short of the light edge at its front
   corner, which runs down x 12 beside the screen, steps out under the controls and runs down x 15 below them; from under the bevel along
   its top to just above its bottom outline. nearFloor marks the darker band along the bottom, which is kept. */
const SIDE_RIGHT = y => y <= 30 ? 11 : y <= 33 ? y - 19 : y <= 36 ? 15 : y === 37 ? 16 : 14;
function sideOf(W, H, d) {
    const out = [], op = (x, y) => d[(y * W + x) * 4 + 3] > 128, lowest = [];
    for (let x = 0; x < W; x++) { let ly = -1; for (let y = H - 1; y >= 0; y--) if (op(x, y)) { ly = y; break; } lowest[x] = ly; }
    for (let y = 16; y < H; y++) { let left = -1; for (let x = 0; x < W; x++) if (op(x, y)) { left = x; break; } if (left < 0) continue;
        for (let x = left + 1; x <= SIDE_RIGHT(y); x++) if (op(x, y) && y < lowest[x] - 1) out.push([x, y, y >= lowest[x] - 4]); }
    return out;
}
/* Each game's picture on the side, in the spirit of the Fallin' Furni chairs tumbling down it: a few pixels of the game's own things,
   outlined in black as the chairs are. Letters are colours; "." is nothing; a cell outside the side face is never drawn. */
const K = [0, 0, 0];
const PURA = { r: [222, 52, 46], R: [150, 24, 22], b: [64, 132, 226], B: [32, 74, 156], g: [84, 186, 64], G: [42, 112, 34], y: [246, 206, 48], Y: [176, 128, 10] };
const block = c => [".kkkk.", "k" + c + c + c + c + "k", "k" + c + c + c.toUpperCase() + c.toUpperCase() + "k", "k" + c.toUpperCase().repeat(4) + "k", ".kkkk."];
const ART = {
    /* Pura Panic: the game's seat blocks, one falling with its streaks, three landed */
    pura: { pal: PURA, put: [[5, 18, ["..s.s.", "..s.s.", "......"]], [5, 21, block("y")], [1, 38, block("b")], [6, 40, block("r")], [8, 45, block("g")], [2, 43, block("g").slice(0, 3)]] },
    /* Guess the Maze: a question mark, and the magnifying glass you look at a room through */
    guess: { pal: { w: [238, 226, 196], g: [150, 200, 230], h: [210, 170, 90] }, put: [[3, 19, [".kkkk.", "kwwwwk", "kkkkwk", "..kwwk", "..kwk.", "..kkk.", "..kwk.", "..kkk."]], [1, 31, ["..kkk....", ".kgggk...", "kgwgggk..", "kgggggk..", "kgggggk..", ".kgggk...", "..kkkhk..", ".....khk.", "......khk", ".......k."]]] },
    /* Odd One Out: four rooms on the wall, one of them from another maze */
    odd: { pal: { a: [120, 190, 214], f: [70, 120, 150], o: [232, 120, 64], p: [150, 60, 40] }, shear: true, put: [[1, 20, ["kkkkk", "kaaak", "kfffk", "kkkkk"]], [6, 20, ["kkkkk", "kaaak", "kfffk", "kkkkk"]], [1, 26, ["kkkkk", "kaaak", "kfffk", "kkkkk"]], [6, 26, ["kkkkk", "koook", "kpppk", "kkkkk"]]] }
};
function drawArt(id, W, d, mask, shade) {
    const a = ART[id]; if (!a) return; const inSide = new Set(mask.map(([x, y]) => x + "," + y));
    for (const [X, Y, rows] of a.put) rows.forEach((row, v) => [...row].forEach((ch, u) => {
        if (ch === ".") return; const x = X + u, y = Y + v + (a.shear ? Math.floor(u / 2) : 0); if (!inSide.has(x + "," + y)) return;
        const c = ch === "k" ? K : ch === "s" ? shade : a.pal[ch]; if (!c) return; const p = (y * W + x) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2];
    }));
}
function cabinet(game, big) {
    const pre = big ? "" : "s_", im = L.loadPng(L.R + "assets/furni/" + pre + "falling_furni_arcade_0_2_a.png"), W = im.w, H = im.h, d = Uint8ClampedArray.from(im.rgba);
    /* where the bottom tip of the base is: the foot that stands on the tile's near corner */
    let fy = -1, fx = 0; for (let y = H - 1; y >= 0 && fy < 0; y--) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 128) { fy = y; fx = x; break; }
    if (game.colour && !big) {
        const T = toHsl(game.colour), at = (x, y) => { const p = (y * W + x) * 4; return [d[p], d[p + 1], d[p + 2]]; };
        /* the chairs, the stone and their shadows painted out of the side in its own commonest shade, outlines and all, keeping the darker
           band along its bottom (8 Nov: the first try ran past the side's front edge and ate the left of the screen's bezel) */
        const mask = sideOf(W, H, d), hist = new Map();
        for (const [x, y] of mask) { const c = at(x, y); if (isBody(c)) hist.set(c.join(), (hist.get(c.join()) || 0) + 1); }
        const side = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number), band = [155, 90, 0];
        for (const [x, y, floor] of mask) { const p = (y * W + x) * 4, c = floor ? band : side; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; }
        /* under the red chair the front corner's light edge was hidden: carry it on down */
        { const hp = (40 * W + 15) * 4; for (let y = 48; y < H; y++) { const p = (y * W + 15) * 4; if (d[p + 3] > 128 && d[p] + d[p + 1] + d[p + 2] > 60 && y < fy - 1) for (let k = 0; k < 3; k++) d[p + k] = d[hp + k]; } }
        /* the body to the game's colour, each shade keeping its lightness */
        for (let i = 0; i < W * H; i++) { const p = i * 4; if (d[p + 3] < 128) continue; const c = [d[p], d[p + 1], d[p + 2]]; if (!isBody(c)) continue; const [, s, l] = toHsl(c), n = fromHsl([T[0], Math.min(1, T[1] * (.55 + s * .5)), Math.min(.92, l * (T[2] / .5) * .95)]); d[p] = n[0]; d[p + 1] = n[1]; d[p + 2] = n[2]; }
        /* then the game's own picture, its streaks in the body's darker shade */
        const sp = (mask.find(([, , f]) => f) || mask[0]), shade = at(sp[0], sp[1]);
        drawArt(game.id, W, d, mask, shade);
    }
    /* the screen lit in the game's colour: its dark glass picks up a glow, brighter towards the middle */
    { const G = game.glow, sx0 = Math.round(W * .45), sx1 = Math.round(W * .86), sy0 = Math.round(H * .18), sy1 = Math.round(H * .5);
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { const p = (y * W + x) * 4; if (d[p + 3] < 128) continue; const c = [d[p], d[p + 1], d[p + 2]], [h, s, l] = toHsl(c); if (!(l < .3 && l > .04 && (h > 90 / 360 && h < 200 / 360))) continue; const k = .45; d[p] = Math.round(c[0] + (G[0] * .5 - c[0]) * k); d[p + 1] = Math.round(c[1] + (G[1] * .5 - c[1]) * k); d[p + 2] = Math.round(c[2] + (G[2] * .5 - c[2]) * k); } }
    return { w: W, h: H, rgba: d, foot: [fx, fy] };
}
module.exports = { GAMES, cabinet };
