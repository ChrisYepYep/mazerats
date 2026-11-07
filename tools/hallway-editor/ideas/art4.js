/* Round four's art: what changed from round three. */
"use strict";
const fs = require("fs"), iso = require("./iso3d.js"), L = require("./lib.js"), A = require("./art.js"), { box, cyl, ball, M, render, col } = iso, R = L.R, H = R + "tools/hallway-editor/";
const W3 = require(H + "render/hw3.js");
const K = "000000", mod = (a, b) => ((a % b) + b) % b, { WOOD, groove, GOLD, slateAt, vol, volW } = A;
const RAIL = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704") };

/* ---- the desk: deep enough to walk behind, shelves on the right-hand wall ---- */
function desk() {
    const W = 96, HT = 96, D = 40, cy1 = W - 16, ps = [];
    ps.push(box(-D - 2, 0, -2, W, -2, 0, { top: col("555"), x: col("2a2a2a"), y: col("2a2a2a"), edge: null, noLine: true, tex(f, p) { return f === "top" ? slateAt(p[0], p[1]) : null; } }));
    const wallTex = (f, p) => { if (f === "x" || f === "y") { const z = p[2]; if (z < 3) return "1e0d06"; if (z < 34) return f === "x" ? (mod(Math.floor(p[1]), 6) === 0 ? "34180b" : mod(Math.floor(p[1]), 6) === 3 ? "593422" : "452313") : (mod(Math.floor(p[0]), 6) === 0 ? "452313" : "593422"); if (z < 36) return "93705a"; return f === "x" ? "4a3324" : "5a4030"; } return null; };
    /* the back wall, and the right-hand wall that carries the shelves */
    ps.push(box(-D - 3, -D, -6, W + 4, 0, HT + D + 8, { ...WOOD, tex: wallTex }));
    ps.push(box(-D, 0, -6, 0, 0, HT + D + 8, { ...WOOD, tex: wallTex }));
    const shelfZ = [40, 54, 68], SH = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704") }, X0 = -D + 2, X1 = -6;
    for (const z of [...shelfZ, 82]) ps.push(box(X0, X1, 0, 6, z - 2, z, SH));
    for (const x of [X0, X0 + 16, X1 - 1]) ps.push(box(x, x + 1.4, 0, 6, 38, 82, SH));
    /* the counter */
    const front = (f, p) => { const z = p[2];
        if (f === "x") { if (z > 25 && z < 27) return "d6ad56"; if (z > 3 && z < 5) return "a67f36"; const u = mod(p[1] - 1, 16); if (u < 1.2) return "d6ad56"; if (z < 6 || z > 24) return "452313"; if (u < 2.4) return "34180b"; if (u > 14.8) return "593422"; if (z < 7 || z > 23) return z < 7 ? "593422" : "34180b"; return mod(Math.floor(p[1]), 6) === 0 ? "34180b" : "452313"; }
        if (f === "y") { if (z > 25 && z < 27) return "f0d28a"; if (z > 3 && z < 5) return "d6ad56"; return mod(Math.floor(p[0] + 40), 6) === 0 ? "452313" : "593422"; } return null; };
    const ctr = [box(-8, 4, 0, cy1, 0, 28, { ...WOOD, tex: front }), box(-10, 6, -1, cy1 + 1, 28, 31, { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704"), tex(f, p) { if (f === "x" || f === "y") return "d6ad56"; if (f === "top" && p[0] > 4) return "c49a48"; return null; } })];
    ps.push(...ctr);
    const pil = { ...WOOD, tex(f, p) { if (f === "x" && mod(p[1], 8) > 3 && mod(p[1], 8) < 5) return "d6ad56"; return null; } };
    ps.push(box(0, 3, -7, -1, 0, HT + 4, pil), box(0, 3, W + 1, W + 7, 0, HT + 4, pil), box(0, 2, 0, W, HT, HT + 4, WOOD));
    ps.push(box(0, 5, -8, W + 8, HT + 4, HT + 7, RAIL));
    const pilN = [box(0, 3, W + 1, W + 7, 0, HT + 4, pil)]; return { sprite: render(ps, { depthEdge: true, wall: { at: 0, inside: (y, z) => y > 0 && y < W && z >= 0 && z < HT } }), counter: render(ctr, { depthEdge: true }), W, D, HT, shelfZ, X0, X1 };
}
/* a little reception bell, drawn by hand: dark outline, dome, top button, wooden foot */
const BELL = [
    "....KK....",
    "...KHHK...",
    "...KGGK...",
    "..KKGDKK..",
    ".KWHGGGDK.",
    ".KHHGGGDK.",
    "KHHGGGGDDK",
    "KHGGGGDDEK",
    "KKKKKKKKKK",
    "KTTTTUUUUK",
    ".KKKKKKKK."
], BELLC = { K: "1a1006", W: "fffbe0", H: "f7e29a", G: "d9b04f", D: "a67f36", E: "7a5416", T: "6e4524", U: "452313" };
function bell() { const w = BELL[0].length, h = BELL.length, rgba = new Uint8ClampedArray(w * h * 4); BELL.forEach((r, j) => { for (let i = 0; i < w; i++) if (r[i] !== ".") { const c = col(BELLC[r[i]]), q = (j * w + i) * 4; rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; rgba[q + 3] = 255; } }); return { w, h, ox: w >> 1, oy: h - 2, rgba }; }
function ledger() { const K2 = col(K), cover = M("8a1f22", "641015", "4a0a0e", K), page = (y0, y1) => ({ top: col("f7f0dc"), y: col("d8cfb6"), x: col("c6bc9f"), edge: K2, noLine: true, tex(f, p) { if (f === "top" && Math.floor(p[0] + 100) % 2 === 0 && p[1] > y0 + 1 && p[1] < y1 - 1) return "9a94a4"; return null; } }); return render([box(-6, 6, -9, 9, 0, 1, cover), box(-5, 5, -8, -.4, 1, 2.4, page(-8, -.4)), box(-5, 5, .4, 8, 1, 2.4, page(.4, 8)), box(-5, 5, -.4, .4, 1, 1.6, M("6a6476", "4a4656", "4a4656", K))], { crease: false }); }
/* a stair-style sign, the map's own code with its arrow left out */
function plaqueOn(c, ax, ay, name, hUp) {
    const src = fs.readFileSync(H + "render/hw3.js", "utf8"), i = src.indexOf("function stairPlaque("), j = src.indexOf("\nfunction ", i + 20) >= 0 ? src.indexOf("\nfunction ", i + 20) : src.length, fnSrc = src.slice(i, j);
    const fn = new Function("hex", "H", "C", "PLAQUE", "plaqueWidth", "ARROW", fnSrc + "\nreturn stairPlaque;")(W3.H.hex, W3.H, W3.H.C, { ...W3.PLAQUE, h: hUp, H: 18, arrowFloor: 16 }, W3.plaqueWidth, []);
    const b = { w: c.w, h: c.h, set(x, y, k) { if (x < 0 || y < 0 || x >= c.w || y >= c.h) return; const q = (y * c.w + x) * 4, v = typeof k === "string" ? col(k) : k; c.d[q] = v[0]; c.d[q + 1] = v[1]; c.d[q + 2] = v[2]; c.d[q + 3] = 255; } };
    fn(b, ax, ay, name, {});
}
/* a single sheet of paper lying on the floor: a little askew, torn edges, faint writing */
function scrap() {
    const w = 44, h = 28, cx = 22, cy = 14, rgba = new Uint8ClampedArray(w * h * 4), mask = new Uint8Array(w * h), th = .34, cs = Math.cos(th), sn = Math.sin(th), N = t => { const s = Math.sin(t * 91.7) * 43758.5; return s - Math.floor(s); };
    const tear = (t, seed) => { const a = Math.floor(t * .9), n = N(a + seed), m = N(a + seed + 1), f = t * .9 - a; return (n + (m - n) * f) * .9 + (N(Math.floor(t * 1.6) + seed * 3) > .86 ? 1.6 : 0); };
    const set = (x, y, c, a = 255) => { const q = (y * w + x) * 4; rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; rgba[q + 3] = a; };
    const pt = (x, y) => { const sx = x - cx + .5, sy = y - cy + .5, u0 = sy + sx / 2, v0 = sy - sx / 2; return [u0 * cs + v0 * sn, -u0 * sn + v0 * cs]; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [u, v] = pt(x, y), a = 11, b = 8; if (u > -a + tear(v, 1) && u < a - tear(v, 2) && v > -b + tear(u, 3) && v < b - tear(u, 4)) mask[y * w + x] = 1; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!mask[y * w + x]) continue; const [u, v] = pt(x, y); let c = [244, 238, 220]; if (Math.abs(v + 1) < .35) c = [226, 218, 196]; if (mod(Math.floor(v + 8), 4) === 0 && Math.abs(u) < 7 && Math.abs(v) < 5 && N(Math.floor(u * .9) + Math.floor(v) * 7) > .18) c = [186, 184, 196]; set(x, y, c); }
    const m = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!mask[y * w + x]) continue; if (!m(x, y + 1) || !m(x + 1, y)) set(x, y, [120, 106, 84]); else if (!m(x, y - 1) || !m(x - 1, y)) set(x, y, [255, 252, 240]); }
    for (let y = h - 2; y >= 0; y--) for (let x = w - 1; x >= 0; x--) if (!mask[(y + 1) * w + x] && mask[y * w + x]) set(x, y + 1, [20, 10, 4], 80);
    return { w, h, ox: cx, oy: cy, rgba };
}
/* a smaller key */
function key() { const B = M("f6e0a0", "c99f4c", "a67f36", K), ps = [], t = 1.6; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; ps.push(box(-6.5 + Math.cos(a) * 3.2 - .7, -6.5 + Math.cos(a) * 3.2 + .7, Math.sin(a) * 3.2 - .7, Math.sin(a) * 3.2 + .7, 0, t, B)); } ps.push(box(-3.2, 7, -.6, .6, 0, t, B), box(4, 5.4, .6, 3, 0, t, B), box(5.8, 7, .6, 3.4, 0, t, B)); return render(ps, { crease: false }); }

/* ---- the Rooms' giant bookcase, its real sprites, swinging out on its left edge so its front stays in view ---- */
function bookFrames(n = 3, count = 14) {
    const P = name => L.loadPng(H + "art/rooms/" + name + ".png"), parts = []; for (let i = 0; i < n; i++) { const k = i === 0 ? 27 : i === n - 1 ? 19 : 26 - ((i - 1) % 7); parts.push([P("shelf" + k), -i * 16 - 16 + (k === 19 ? -2 : 0), i * 8 + 16 - 74]); }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [im, x, y] of parts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + im.w); y0 = Math.min(y0, y); y1 = Math.max(y1, y + im.h); }
    const CW = x1 - x0, CH = y1 - y0, flat = new Uint8ClampedArray(CW * CH * 4); for (let k = n - 1; k >= 0; k--) { const [im, x, y] = parts[n - 1 - k + 0] || parts[k]; }
    for (let i = n - 1; i >= 0; i--) { /* draw far to near: the far (right) one first would be i=0; rooms draws in order of depth */ }
    for (let i = 0; i < n; i++) { const [im, x, y] = parts[i]; for (let j = 0; j < im.h; j++) for (let u = 0; u < im.w; u++) { const p = (j * im.w + u) * 4; if (im.rgba[p + 3] < 128) continue; const q = ((y + j - y0) * CW + x + u - x0) * 4; flat[q] = im.rgba[p]; flat[q + 1] = im.rgba[p + 1]; flat[q + 2] = im.rgba[p + 2]; flat[q + 3] = 255; } }
    /* model-origin of the closed case in "flat": the tile (0,0)'s spot */
    const ox0 = -x0, oy0 = -y0;
    /* the blue book the clue asks for: painted onto the middle shelf of the flat picture */
    const SIDE = 16, MARG = 90, frames = [];
    const base0 = (() => { for (let j = CH - 1; j >= 0; j--) if (flat[(j * CW) * 4 + 3]) return j; return CH - 1; })();
    const paintBook = (img, dx, dy) => { const bx = SIDE + 20, by = bookRow; for (let v = 0; v < 12; v++) for (let u = 0; u < 3; u++) { const X = bx + u + dx, Y = by + v - Math.round((bx + u - SIDE) * .5) + dy; if (X < 0 || Y < 0 || X >= CW || Y >= CH) continue; const q = (Y * CW + X) * 4, c = (v === 0 || v === 11 || u === 2) ? [8, 40, 70] : u === 0 ? [140, 215, 255] : [47, 168, 232]; img[q] = c[0]; img[q + 1] = c[1]; img[q + 2] = c[2]; img[q + 3] = 255; } };
    const bookRow = 40;
    const frameOf = (src, a0) => { const sn = Math.sin(a0), cs = Math.cos(a0), W2 = Math.ceil(CW * 1.5) + MARG, H2 = CH + MARG * 2, out = new Uint8ClampedArray(W2 * H2 * 4), hingeX = 30, D0 = SIDE;
        const col2 = (X, c, shift, dark) => { for (let j = 0; j < CH; j++) { const p = (j * CW + c) * 4; if (!src[p + 3]) continue; const Y = Math.round(j + shift + MARG); if (Y < 0 || Y >= H2) continue; const q = (Y * W2 + X) * 4; out[q] = src[p] * dark; out[q + 1] = src[p + 1] * dark; out[q + 2] = src[p + 2] * dark; out[q + 3] = 255; } };
        const side = cs - sn; /* the side panel: visible until the case has turned past the viewer */
        if (side > .03) { const w = Math.ceil(D0 * side); for (let x = 0; x < w; x++) { const e = x / side, c = Math.min(D0 - 1, Math.floor(e)); col2(hingeX + x, c, e * (cs + sn - 1) / 2, 1 - .12 * (a0 / (Math.PI / 2))); } }
        const fx = hingeX + D0 * side, fw = (CW - D0) * (sn + cs); /* the front */
        for (let x = 0; x <= Math.ceil(fw); x++) { const d = x / (sn + cs), c = Math.min(CW - 1, D0 + Math.floor(d)), tY = D0 * (cs + sn) / 2 + d * (sn - cs) / 2, oY = D0 / 2 - d / 2; col2(Math.round(fx + x), c, tY - oY, 1 - .14 * (a0 / (Math.PI / 2))); }
        /* the free end's edge, so the door has thickness */
        return { w: W2, h: H2, ox: hingeX, oy: MARG + base0, rgba: out }; };
    const withBook = new Uint8ClampedArray(flat); paintBook(withBook, 0, 0);
    for (let f = 0; f <= count; f++) { const t = f / count; frames.push(frameOf(withBook, (t * t * (3 - 2 * t)) * Math.PI / 2 * .85)); }
    const pulls = []; for (let k = 0; k <= 3; k++) { const im = new Uint8ClampedArray(flat); paintBook(im, k, Math.round(k * .5)); pulls.push(frameOf(im, 0)); }
    frames.pulls = pulls;
    return { frames, pulls: frames.pulls, width: CW - SIDE, side: SIDE, n };
}
function passage(W = 48, Hh = 54) { const glow = (f, p) => { const g = Math.max(0, Math.min(1, (p[2] - 6) / 44)) * .6 + .2, v = c => Math.round(c); return [v(62 + g * 170), v(34 + g * 100), v(16 + g * 36)]; }; return render([box(-30, -24, -2, W + 2, 0, Hh + 44, { top: col("3a2010"), x: glow, y: glow, edge: null, noLine: true }), box(-30, 0, -5, 0, 0, Hh + 44, { top: col("2a170a"), y: col("3b2312"), x: col("20110a"), edge: null, noLine: true }), box(-30, 0, 0, W, -3, 0, { top: col("4a3a2a"), y: col("2a2015"), x: col("2a2015"), edge: null, noLine: true, tex(f, p) { return f === "top" ? slateAt(p[0], p[1], .8) : null; } })], { wall: { at: 0, inside: (y, z) => y > 0 && y < W && z < Hh && z >= 0 } }); }

/* ---- framed things, with real sign lettering ---- */
const framed = A.framed;
function hotelItems4() {
    const out = A.hotelItems(), OAKF = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col(K) }, GF = { top: col("f0d28a"), y: col("d6ad56"), x: col("a67f36"), edge: col(K) };
    /* staff of the month, with a little portrait */
    out.staff = framed(86, 60, 50, [["Staff of the Month", 4, "3a2110"], ["Frank", 44, "7a1b16", "vb"]], { face: "e8dcbc", tex(u, v) { const a = u - 32, b = v - 18; if (a >= 0 && a < 16 && b >= 0 && b < 18) { const d = Math.hypot(a - 7.5, b - 6); if (d < 4.6) return d > 3.8 ? "2a170a" : b < 4 ? "3a2110" : "e8b890"; if (b > 10) return Math.abs(a - 7.5) < 6 ? "2f5fa8" : "c9bd9c"; return "c9bd9c"; } return null; } });
    /* the Theatredrome's own crimson and cream gold, from the room's art */
    out.theatre = framed(86, 42, 58, [["Theatredrome", 8, "e8d8a8", "vb"], [">> 2 floors up", 23, "d0c090"]], { face: "701010", frame: GF });
    out.bar = framed(92, 42, 58, [["The Dirty Duck", 8, "ffc25e", "vb"], ["Now on Floor 3", 23, "d9a860"]], { face: "1a0c06", frame: OAKF });
    out.guides = framed(86, 42, 58, [["Hotel Guides", 8, "ffffff", "vb"], ["Ask at Reception", 23, "b8d0f0"]], { face: "24386a", frame: OAKF });
    out.poster = framed(44, 54, 50, [["BEWARE", 7, "7a1b16", "vb"], ["Always", 24, "191919"], ["check trades", 36, "191919"]], { face: "e9d27b" });
    /* a framed photograph of the hotel, from its own art */
    { const back = L.loadPng(R + "assets/img/hotel/uk-back.png"), front = L.loadPng(R + "assets/img/hotel/uk-front.png"), PW = 64, PH = 40, s = 720 / PW, pic = []; for (let v = 0; v < PH; v++) for (let u = 0; u < PW; u++) { let r = 0, g = 0, b = 0, n = 0; for (let j = 0; j < s; j += 2) for (let i = 0; i < s; i += 2) { const p = (Math.floor(v * 498 / PH + j) * 720 + Math.floor(u * s + i)) * 4, a = front.rgba[p + 3] / 255; r += back.rgba[p] * (1 - a) + front.rgba[p] * a; g += back.rgba[p + 1] * (1 - a) + front.rgba[p + 1] * a; b += back.rgba[p + 2] * (1 - a) + front.rgba[p + 2] * a; n++; } pic.push([r / n, g / n, b / n]); }
      out.photo = framed(78, 62, 48, [["The Hotel, 2001", 46, "3a2110"]], { face: "efe5c6", glass: false, tex(u, v) { const a = u - 4, b = v - 3; if (a >= 0 && a < PW && b >= 0 && b < PH) return pic[b * PW + a]; return null; } }); }
    /* the bricked-up doorway, with a dark nailed board and cream letters that fit it */
    { const Hh = 80, W = 62, bricks = (f, p) => { if (f !== "x") return null; const row = Math.floor(p[2] / 5), off = row % 2 ? 4 : 0, j = mod(p[2], 5) < 1 || mod(p[1] + off, 8) < 1; return j ? "4a4036" : ((Math.floor((p[1] + off) / 8) * 5 + row * 3) % 4 ? "7a3f2c" : "6a3526"); }, fr = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col(K) }, s1 = vol("FREE", "vb"), s2 = vol("CREDITS", "vb"), sw = Math.max(volW("CREDITS", "vb"), volW("FREE", "vb")) + 8, y1 = (W + sw) / 2, z1 = 64, zb = 38;
      out.freeDoor = render([box(-1, 1, 3, W - 3, 0, Hh - 3, { top: col("7a3f2c"), y: col("6a3526"), x: col("7a3f2c"), edge: null, tex: bricks }), box(0, 3.5, 0, 3.5, 0, Hh, fr), box(0, 3.5, W - 3.5, W, 0, Hh, fr), box(0, 4.5, -1, W + 1, Hh - 3, Hh + 1, fr), box(1, 3.5, y1 - sw, y1, zb, z1, { top: col("6e4524"), y: col("452313"), x: col("593422"), edge: col(K), tex(f, p) { if (f !== "x") return null; const u = Math.floor(y1 - p[1]), v = Math.floor(z1 - p[2]); if (s1.has((u - Math.round((sw - volW("FREE", "vb")) / 2)) + "," + (v - 3))) return "f4e8c8"; if (s2.has((u - 4) + "," + (v - 14))) return "f4e8c8"; if ((u < 3 || u > sw - 4) && (v === 2 || v === z1 - zb - 3)) return "c9c9c9"; return null; } })]); }
    return out;
}

/* ---- the staff room, with a black line where anything stands in front of anything ---- */
function staffRoom(opt = {}) { return A.staffRoom({ ...opt, depthEdge: true }); }
/* ---- five industrial lights, cleaned up ---- */
function lights() {
    const G = M("dfe5ea", "aab2ba", "7a838c", K), DK = M("565c62", "3c4248", "2a2e32", K), GL = { top: col("fff8d8"), y: col("ffe9a8"), x: col("f4cf74"), edge: col(K), noLine: true }, B = { ramp: ["f4cf74", "ffe9a8", "fff8d8"], edge: col(K) }, out = {}, opt = { depthEdge: true, crease: false };
    { const ps = [box(0, 2, -9, 9, 60, 76, DK), box(1, 4.6, -7, 7, 62, 74, GL), box(4.4, 5.6, -8, 8, 67.4, 68.6, DK), box(4.4, 5.6, -.6, .6, 61, 75, DK)]; out.bulkhead = { name: "Bulkhead", s: render(ps, opt) }; }
    { const ps = [cyl(10, 0, .6, 72, 118, M("2a2e32", "111", "111", K))]; for (let i = 0; i < 12; i++) ps.push(cyl(10, 0, 1.8 + i * .8, 72 - i, 73 - i, { ramp: ["1f3a2a", "2a5a3e", "3a7a54", "5a9a74"], top: col("3a7a54"), edge: col(K), noLine: true })); ps.push(ball(10, 0, 58, 2.4, B)); out.pendant = { name: "Enamel pendant", s: render(ps, opt) }; }
    { out.batten = { name: "Strip light", s: render([box(0, 3, -20, 20, 70, 74, M("c8ccd0", "a8acb0", "8a8e92", K)), box(3, 4.6, -18, 18, 70.6, 73.4, { top: col("ffffff"), y: col("eef8ff"), x: col("dcf0ff"), edge: col(K), noLine: true })], opt) }; }
    { const ps = [box(0, 2, -3, 3, 70, 82, DK), box(2, 11, -.8, .8, 78, 79.6, DK), cyl(11, 0, 2, 75, 79, DK), ball(11, 0, 71.5, 3, B)]; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .6, r = 4.4; ps.push(box(11 + Math.cos(a) * r - .4, 11 + Math.cos(a) * r + .4, Math.sin(a) * r - .4, Math.sin(a) * r + .4, 66, 75, DK)); } ps.push(cyl(11, 0, 4.8, 65.4, 66.4, DK)); out.caged = { name: "Caged bracket", s: render(ps, opt) }; }
    { const ps = [], Y = M("f0c830", "c49a18", "967410", K); for (const [dx, dy] of [[7, 0], [-4, 6], [-4, -6]]) for (let i = 0; i < 12; i++) { const t = i / 12; ps.push(box(16 + dx * (1 - t) - .7, 16 + dx * (1 - t) + .7, 16 + dy * (1 - t) - .7, 16 + dy * (1 - t) + .7, i * 3, i * 3 + 3.2, Y)); } ps.push(cyl(16, 16, .9, 34, 50, DK)); ps.push(box(13, 22, 11, 21, 50, 59, Y), box(22, 23.2, 12, 20, 51, 58, { top: col("fff8d8"), y: col("fff8d8"), x: col("ffffff"), edge: col(K), noLine: true, tex(f, p) { if (f === "x" && (Math.floor(p[1]) % 3 === 0 || Math.floor(p[2]) % 3 === 0)) return "c49a18"; return null; } }), box(13, 23, 15.4, 16.6, 59, 62, DK)); out.work = { name: "Work lamp", s: render(ps, opt), floor: true }; }
    return out;
}
/* ---- the garland: greenery with proper glass baubles hanging from it ---- */
function garland() {
    const ps = [], baubles = [], LEN = 150; for (let i = 0; i < LEN; i += 2.4) { const sw = Math.abs(Math.sin(i / 26 * Math.PI)) * 7, z = 92 - sw; ps.push(ball(1.5, i, z, 2.4, { ramp: ["0f3019", "174a27", "1f5f33", "2b7a44"], edge: col("071a0c"), noLine: true })); }
    const s = render(ps, { crease: false }), C = [["c8352a", "ff8a78", "7a1b16"], ["d6ad56", "fff4c8", "86601f"], ["3a7ad6", "a8d0ff", "1f4a90"]];
    let n = 0; for (let i = 13; i < LEN; i += 26) { const q = [s.ox + 1.5 - i, s.oy + (1.5 + i) / 2 - (92 - 7) + 5], [g, h, d] = C[n++ % 3], gg = col(g), hh = col(h), dd = col(d), kk = [0, 0, 0], st = [".KKK.", "KHGGK", "KGGGK", "KGGDK", ".KKK."]; st.forEach((row, j) => { for (let u = 0; u < 5; u++) { const ch = row[u]; if (ch === ".") continue; const c = ch === "K" ? kk : ch === "H" ? hh : ch === "D" ? dd : gg, x = Math.round(q[0]) - 2 + u, y = Math.round(q[1]) + j, p = (y * s.w + x) * 4; if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue; s.rgba[p] = c[0]; s.rgba[p + 1] = c[1]; s.rgba[p + 2] = c[2]; s.rgba[p + 3] = 255; } }); }
    return s;
}
module.exports = { ledger, desk, bell, plaqueOn, scrap, key, bookFrames, passage, hotelItems4, staffRoom, lights, garland };
