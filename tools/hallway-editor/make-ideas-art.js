/* The Hallway's new wall pieces and floor pieces, from the signed-off mock-ups' art (ideas/, moved from .claude/mockups/hallway-ideas-src).
   Each piece is drawn twice, onto two different greys, so we learn what each pixel really does: covers the wall, tints it, or lets some of it through.
   That goes in the PNG's alpha: 255 covers, TINT tints (colour / 128 multiplies what's under it), 1 to 101 lets it through (alpha - 1 percent of the colour).
   Output: art/wall/i_*.png and the i_ entries of wall-items.js. Run again if the art changes: node tools/hallway-editor/make-ideas-art.js
   They're only art files afterwards: replace any PNG by hand and the map uses it. i_key.png is there for exactly that. */
"use strict";
const fs = require("fs"), path = require("path");
const A5 = require("./ideas/art5.js"), A4 = require("./ideas/art4.js"), A = require("./ideas/art.js"), L = require("./ideas/lib.js"), R = L.R;
const { encodePng } = require(R + "tools/png-encode.js");
const OUT = path.join(__dirname, "art", "wall"), LIST = path.join(__dirname, "wall-items.js"), TINT = 200;
let mirrored = false; const memo = {}, setM = v => { mirrored = v; A.setMirrorText(v); A5.setSignMirror(v); };

/* run a drawing on grey g; a is where the piece's own origin lands */
function onGrey(draw, g) { const c = { w: 340, h: 340, d: Buffer.alloc(340 * 340 * 4) }; for (let i = 0; i < c.d.length; i += 4) { c.d[i] = g; c.d[i + 1] = g; c.d[i + 2] = g; c.d[i + 3] = 255; } const a = [170, 280]; draw(c, a); return { c, a }; }
function capture(draw, box) {
    const P = onGrey(draw, 128), Q = onGrey(draw, 64), w = P.c.w, h = P.c.h, out = new Uint8ClampedArray(w * h * 4); let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let i = 0; i < w * h; i++) { const q = i * 4, a = [P.c.d[q], P.c.d[q + 1], P.c.d[q + 2]], b = [Q.c.d[q], Q.c.d[q + 1], Q.c.d[q + 2]];
        if (a[0] === 128 && a[1] === 128 && a[2] === 128 && b[0] === 64 && b[1] === 64 && b[2] === 64) continue;
        const near = (u, v, t) => Math.abs(u - v) <= t;
        if ([0, 1, 2].every(k => near(a[k], b[k], 1))) { out[q] = a[0]; out[q + 1] = a[1]; out[q + 2] = a[2]; out[q + 3] = 255; }
        else if ([0, 1, 2].every(k => near(a[k], b[k] * 2, 3))) { out[q] = a[0]; out[q + 1] = a[1]; out[q + 2] = a[2]; out[q + 3] = TINT; }
        else { const m = 1 - ([0, 1, 2].reduce((s, k) => s + (a[k] - b[k]), 0) / 3) / 64, mm = Math.max(.01, Math.min(1, m)); for (let k = 0; k < 3; k++) out[q + k] = (a[k] - 128 * (1 - mm)) / mm; out[q + 3] = Math.round(mm * 100) + 1; }
        const X = i % w, Y = (i / w) | 0; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    if (x1 < 0) throw new Error("nothing drawn");
    if (box) { x0 = box[0]; y0 = box[1]; x1 = box[2]; y1 = box[3]; }
    const W = x1 - x0 + 1, H = y1 - y0 + 1, rgba = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = ((y + y0) * w + x + x0) * 4, o = (y * W + x) * 4; for (let k = 0; k < 4; k++) rgba[o + k] = out[q + k]; }
    return { w: W, h: H, rgba, ox: P.a[0] - x0, oy: P.a[1] - y0, box: [x0, y0, x1, y1] };
}
const write = (name, art) => fs.writeFileSync(path.join(OUT, name), encodePng(art.w, art.h, Buffer.from(art.rgba)));

/* where the piece hangs: h is the height of its middle over the floor, in the wall tool's steps, the picture nudged to make up the difference, so a door still meets the floor */
const LIFT = 6;
function hang(art) { const ym = art.ox - (art.w >> 1), real = art.oy + ym / 2 - (art.h >> 1) + LIFT, h = Math.round(real / 4) * 4; return { h, y: Math.round(h - real) - (art.h >> 1) }; }

/* every piece: its name, group, whether it has lettering, and how to draw it on a wall running as the mock-ups' do. x-running walls get the mirror image, lettering redrawn so it still reads. */
const items = [];
function add(id, name, kind, draw, o = {}) {
    setM(false); const art = capture(draw), f = "i_" + id + ".png"; write(f, art);
    let f2 = f; if (o.text) { setM(true); const m = capture(draw, art.box); f2 = "i_" + id + "_m.png"; write(f2, m); setM(false); }
    const { h, y } = hang(art), layer = (file, flip) => ({ f: file, x: -(art.w >> 1), y: y + (o.drop || 0), flip: flip ? 1 : 0 });
    const def = { id: "i_" + id, name, kind, tell: true, h, x: { w: art.w, h: art.h, layers: [layer(f2, true)] }, y: { w: art.w, h: art.h, layers: [layer(f, false)] } };
    if (o.lit) { const lit = capture(o.lit, art.box), fl = "i_" + id + "_lit.png"; write(fl, lit); let fl2 = fl; if (o.text) { setM(true); const m = capture(o.lit, art.box); fl2 = "i_" + id + "_lit_m.png"; write(fl2, m); setM(false); } def.x.layers[0].litF = fl2; def.y.layers[0].litF = fl; def.lit = o.glow; }
    if (o.locked) def.locked = true;
    if (o.keep) { def.ax = art.ox; def.ay = art.oy; }
    if (o.pivot) { def.out = 2; def.h = 100; def.y.layers[0].x = -art.ox; def.y.layers[0].y = -art.oy; def.x.layers[0].x = art.ox - art.w + 1; def.x.layers[0].y = -art.oy; }
    if (o.xmas) def.xmas = true;
    if (o.snap) def.snapAt = (def.y.layers[0].x + art.ox) / 16;
    items.push(def); return def;
}
const put = (c, s, a) => L.put(c, s, a[0], a[1]);

/* ---- 21: wear and tear ---- */
const setPx = (c, x, y, col, al = 1) => { const q = (y * c.w + x) * 4; for (let k = 0; k < 3; k++) c.d[q + k] = c.d[q + k] * (1 - al) + col[k] * al; };
const crackLines = (c, a, segs) => { const core = [62, 44, 34], deep = [40, 26, 20], lip = [186, 142, 118]; for (const [p, q2, w0] of segs) { const n = Math.max(Math.abs(q2[0] - p[0]), Math.abs(q2[1] - p[1])); for (let i = 0; i <= n; i++) { const x = a[0] + Math.round(p[0] + (q2[0] - p[0]) * i / n), y = a[1] + Math.round(p[1] + (q2[1] - p[1]) * i / n); setPx(c, x, y, w0 > 1 ? deep : core); if (w0 > 1) { setPx(c, x + 1, y, core); setPx(c, x + 2, y, lip, .55); setPx(c, x - 1, y, core, .55); } else setPx(c, x + 1, y, lip, .4); } } };
for (const [k, id, name] of [["small", "peel_small", "Torn paper: small corner"], ["corner", "peel_corner", "Torn paper: bigger corner"], ["sheet", "peel_strip", "Torn paper: hanging strip"], ["tear", "peel_patch", "Torn paper: ripped patch"]]) add(id, name, "tell", (c, a) => A5.peel(c, a, A5.PEELS[k]));
for (const [id, name, shape] of [["ghost_tall", "Picture mark: tall", [{ u: 8, z: 56, w: 26, h: 34, nails: [13] }]], ["ghost_oval", "Picture mark: oval", [{ u: 8, z: 54, w: 24, h: 32, oval: true, nails: [12] }]], ["ghost_wide", "Picture mark: wide", [{ u: 2, z: 60, w: 54, h: 24, nails: [13, 41], wire: true }]], ["ghost_row", "Picture marks: three", [{ u: 0, z: 64, w: 14, h: 18, nails: [7] }, { u: 20, z: 64, w: 14, h: 18, nails: [7] }, { u: 40, z: 64, w: 14, h: 18, nails: [7] }]]]) add(id, name, "tell", (c, a) => A5.ghost(c, a, shape));
add("damp", "Damp from the cornice", "tell", (c, a) => A5.damp(c, a, 0, 146, 62, 70, 1));
add("damp_run", "Damp: one long run", "tell", (c, a) => A5.damp(c, a, 10, 146, 34, 96, 4));
for (const [id, name, b] of [["chip1", "Chewed rail: a nibble", [[8, 7, 3]]], ["chip2", "Chewed rail: two nibbles", [[3, 6, 3], [14, 8, 4]]], ["chip3", "Chewed rail: a chunk", [[4, 16, 5]]]]) add(id, name, "tell", (c, a) => A5.bite(c, a, 8, b), { locked: true });
{ const p = [[12, -106], [11, -102], [13, -98], [12, -94], [15, -90], [14, -86], [16, -82], [14, -78], [17, -74], [16, -70], [18, -66], [17, -62], [19, -58], [18, -54]], segs = []; p.forEach((q, i) => { if (i < p.length - 1) segs.push([q, p[i + 1], i > 2 && i < 10 ? 2 : 1]); }); segs.push([[14, -86], [6, -80], 1], [[6, -80], [3, -74], 1], [[16, -70], [24, -66], 1], [[24, -66], [28, -60], 1], [[13, -98], [20, -102], 1]); add("crack", "Crack", "tell", (c, a) => crackLines(c, a, segs)); }
{ const p = [[26, -60], [24, -66], [27, -71], [25, -77], [28, -83]], segs = []; p.forEach((q, i) => { if (i < p.length - 1) segs.push([q, p[i + 1], i < 2 ? 2 : 1]); }); segs.push([[28, -83], [24, -92], 1], [[24, -92], [25, -100], 1], [[28, -83], [35, -90], 1], [[35, -90], [36, -97], 1], [[27, -71], [19, -74], 1]); add("crack2", "Forking crack", "tell", (c, a) => crackLines(c, a, segs)); }
add("panel", "Loose dado panel", "tell", (c, a) => { for (let u = 0; u < 15; u++) for (let z = 7; z < 41; z++) { const x = a[0] + 6 + u, y = a[1] + Math.round(u * -.5) - z; setPx(c, x, y, [18, 10, 6]); } L.put(c, A.loosePanel(), a[0] + 20, a[1] - 7); }, { locked: true });

/* ---- 27: the old hotel ---- */
const XM = require("./ideas/christmas.js");
const H = () => memo[mirrored] || (memo[mirrored] = A5.hotelItems());
for (const [id, name, k, o] of [["theatre", "Way to the Theatredrome", "theatre", { text: true }], ["bar", "The Dirty Duck", "bar", { text: true }], ["guides", "Hotel Guides", "guides", { text: true }], ["poster", "Poster: beware", "poster", { text: true }], ["photo", "A photo of the hotel (.com)", "photo", {}], ["photo_es", "A photo of the hotel (.es)", "photo_es", {}], ["photo_br", "A photo of the hotel (.com.br)", "photo_br", {}], ["freedoor", "Free Credits, bricked up", "freeDoor", { text: true, locked: true, drop: 6 }]]) add(id, name, "hotel", (c, a) => put(c, H()[k], a), o);
{ const fire = (lit) => (c, a) => { const Ho = H(), s = Ho.fireSign, sp = { ...s.sprite, rgba: new Uint8ClampedArray(s.sprite.rgba) }; if (lit) for (let q = 0; q < sp.rgba.length; q += 4) if (sp.rgba[q + 3] > 128 && sp.rgba[q] === A5.SIGN_GREEN[0] && sp.rgba[q + 1] === A5.SIGN_GREEN[1] && sp.rgba[q + 2] === A5.SIGN_GREEN[2]) { sp.rgba[q] = A5.SIGN_LIT[0]; sp.rgba[q + 1] = A5.SIGN_LIT[1]; sp.rgba[q + 2] = A5.SIGN_LIT[2]; } put(c, Ho.fireExit, a); put(c, sp, a); };
  /* the staff door: the fire exit's door, no window, no sign. In a staff room, walking up to it takes you back out (room-view.js) */
  add("staffdoor", "Staff door (a way out of staff rooms)", "hotel", (c, a) => put(c, H().staffDoor, a), { locked: true, drop: 6 });
  const g = H().fireSign.glow, def = add("fireexit", "Fire exit", "hotel", fire(false), { text: true, lit: fire(true), glow: { colour: "#2ee07c", at: g }, locked: true, drop: 6 }); }
add("ratcase", "A stuffed rat, in a case", "hotel", (c, a) => { const C = H().ratCase; put(c, C.backing, a); put(c, C.plinth, a); L.put(c, C.rat, Math.round(a[0] + 3 - 20), Math.round(a[1] + (3 + 20) / 2 - (C.z0 + 8))); for (let y = 2; y < C.W - 2; y++) for (let z = C.z0 + 2; z < C.z0 + C.Hh - 2; z++) { const X = a[0] + C.D - y, Y = Math.round(a[1] + (C.D + y) / 2 - z), st = ((y + (z - C.z0) * .8) % 40) < 6 ? .22 : .07; setPx(c, X, Y, [224, 242, 255], st); } put(c, C.front, a); });

/* ---- 42: windows. Each mood's view of the grounds, from the hotel view's own art; the window itself is drawn by render/hall-window.js at any size ---- */
{ const back = L.loadPng(R + "assets/img/hotel/uk-back.png"), front = L.loadPng(R + "assets/img/hotel/uk-front.png"), W = 720, Hh = 498, base = new Uint8ClampedArray(W * Hh * 4); for (let i = 0; i < W * Hh * 4; i += 4) { const a = front.rgba[i + 3] / 255; for (let k = 0; k < 3; k++) base[i + k] = back.rgba[i + k] * (1 - a) + front.rgba[i + k] * a; base[i + 3] = 255; }
  const grade = fn => { const o = new Uint8ClampedArray(base); for (let i = 0; i < o.length; i += 4) { const c = fn(o[i], o[i + 1], o[i + 2]); o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; } return { w: W, h: Hh, rgba: o }; };
  write("i_view_day.png", grade((r, g2, b) => [r, g2, b])); write("i_view_dusk.png", grade((r, g2, b) => [Math.min(255, r * .95 + 18), g2 * .68, b * .62])); write("i_view_night.png", grade((r, g2, b) => [r * .2 + 6, g2 * .22 + 8, b * .34 + 22])); write("i_view_dawn.png", grade((r, g2, b) => [r * .78 + 22, g2 * .72 + 12, b * .84 + 26]));
  /* the same views under snow, for Christmas */
  { const isG = (r, g2, b) => g2 > r + 8 && g2 > b + 8, snow = (r, g2, b) => isG(r, g2, b) ? (g2 > 110 ? [236, 240, 246] : [190, 204, 216]) : [r * .86 + 24, g2 * .88 + 24, b * .92 + 24], then = f => (r, g2, b) => { const c = snow(r, g2, b); return f(c[0], c[1], c[2]); };
    write("i_view_snow_day.png", grade(snow)); write("i_view_snow_dusk.png", grade(then((r, g2, b) => [Math.min(255, r * .95 + 18), g2 * .68, b * .62]))); write("i_view_snow_night.png", grade(then((r, g2, b) => [r * .2 + 6, g2 * .22 + 8, b * .34 + 22]))); write("i_view_snow_dawn.png", grade(then((r, g2, b) => [Math.min(255, r * .9 + 10), g2 * .78, b * .86]))); }
  const Wn = 32, Tn = 128, s = require("./render/hall-window.js").art(Wn, 0, Tn), art = { w: s.w, h: s.h, rgba: s.rgba }; write("i_window.png", art); const mid = Tn / 2, yo = -Wn / 4 - 6 - s.oy + mid; items.push({ id: "i_window", name: "Window", kind: "window", tell: true, h: mid, x: { w: s.w, h: s.h, layers: [{ f: "i_window.png", x: -Wn / 2 + s.ox - s.w, y: yo, flip: 1 }] }, y: { w: s.w, h: s.h, layers: [{ f: "i_window.png", x: Wn / 2 - s.ox, y: yo, flip: 0 }] } }); }

/* ---- floor pieces: not wall items, so no list entry; the renderer and editor know them by file ---- */
const FLOOR = {};
function floorPiece(k, draw) { const art = capture(draw), f = "i_" + k + ".png", mark = k.startsWith("mark_"); write(f, art); FLOOR[k] = { f, ox: mark ? art.w >> 1 : art.ox, oy: mark ? art.h >> 1 : art.oy, w: art.w, h: art.h }; }
const GLINT = [186, 206, 220], rareDraw = im => (c, a) => { const Ho = H(), litFrom = () => { /* the lamp under the roof shines down: whatever's solid inside the glass is warmer the nearer it is */ for (let y = a[1] - 64; y < a[1] + 4; y++) for (let x = a[0] - 24; x < a[0] + 24; x++) { const q = (y * c.w + x) * 4, g = c.d[q] === c.d[q + 1] && c.d[q + 1] === c.d[q + 2]; if (g) continue; const dx = x - a[0], up = a[1] + 10 - y, inside = Math.abs(dx) < 11 && up > 18 && up < 58; if (!inside) continue; const k = .45 * Math.max(0, 1 - Math.abs(dx) / 13) * Math.min(1, (up - 18) / 26); c.d[q] = Math.min(255, c.d[q] + 90 * k); c.d[q + 1] = Math.min(255, c.d[q + 1] + 70 * k); c.d[q + 2] = Math.min(255, c.d[q + 2] + 30 * k); } }; put(c, Ho.caseBase, a); put(c, Ho.caseFar, a); L.put(c, { ...im, ox: 0, oy: 0 }, a[0] - (im.w >> 1), a[1] + 12 - 20 - im.h + 2); litFrom(); const G = Ho.caseGlass; for (let j = 0; j < G.h; j++) for (let u = 0; u < G.w; u++) { const p = (j * G.w + u) * 4; if (G.rgba[p + 3] < 128) continue; setPx(c, a[0] - G.ox + u, a[1] - G.oy + j, [G.rgba[p], G.rgba[p + 1], G.rgba[p + 2]], .18); } for (let i = 0; i < 26; i++) for (const [dx, dy] of [[-16 + i * .3, -24 - i], [-12 + i * .3, -24 - i]]) setPx(c, Math.round(a[0] + dx), Math.round(a[1] + 18 + dy), [255, 255, 255], .45); put(c, Ho.caseNear, a); 
  /* bright edges and two streaks on the panes, which the renderer leaves lit: glass reads as glass after dark too */
  const at = (x, y, z) => [a[0] + x - y, a[1] + (x + y) / 2 - z], dot = (x, y, z) => { const q = at(x, y, z), X = Math.round(q[0]), Y = Math.round(q[1]), i = (Y * c.w + X) * 4; c.d[i] = GLINT[0]; c.d[i + 1] = GLINT[1]; c.d[i + 2] = GLINT[2]; };
  for (let z = 22; z < 57; z++) dot(21, 21, z);
  for (let t = 3; t < 20; t++) { dot(21, t, 57); dot(t, 21, 57); }
  for (let i = 0; i < 16; i++) { dot(21, 5 + i * .45, 28 + i * 1.5); dot(21, 7.5 + i * .45, 26 + i * 1.5); dot(7 + i * .45, 21, 28 + i * 1.5); }
};
{ const small = require("./ideas/smallsprites.json"), first = small.find(q => /capsule_silver/.test(q[0])), im0 = L.loadPng(R + "assets/furni/" + first[2]); floorPiece("rarecase", rareDraw(im0)); const box0 = (() => { const art = capture(rareDraw(im0)); return art; })();
  FLOOR.rarecase.opts = {}; for (const q of small) { if (q[3] > 20 || q[4] > 32) continue; const im = L.loadPng(R + "assets/furni/" + q[2]), f = "i_rc_" + q[0].replace(/[^\w]/g, "_") + ".png", art = capture(rareDraw(im), box0.box); write(f, art); FLOOR.rarecase.opts[q[0]] = { f, name: q[1] }; } FLOOR.rarecase.rare0 = first[0]; }
floorPiece("trophy", (c, a) => { const Ho = H(), small = require("./ideas/smallsprites.json").filter(s => /prize/.test(s[0]) && s[4] <= 26); put(c, Ho.cabinet, a); [[5, 12, 36], [5, 28, 36], [5, 20, 10]].forEach(([x, y, z], i) => { const im = L.loadPng(R + "assets/furni/" + small[i % small.length][2]), q = [a[0] + x - y, a[1] + (x + y) / 2 - z], X0 = Math.round(q[0] - (im.w >> 1)), Y0 = Math.round(q[1] - im.h + 2); for (let j = 0; j < im.h; j++) for (let u = 0; u < im.w; u++) { const p = (j * im.w + u) * 4; if (im.rgba[p + 3] < 128) continue; const X = X0 + u, Y = Y0 + j, sx = X - a[0], sy = Y - a[1], fy = 13 - sx, fz = (13 + fy) / 2 - sy; if (fy < 3.5 || fy > 36.5 || fz < 8.5 || fz > 63.5) continue; const qq = (Y * c.w + X) * 4; c.d[qq] = im.rgba[p]; c.d[qq + 1] = im.rgba[p + 1]; c.d[qq + 2] = im.rgba[p + 2]; } }); const G = Ho.cabGlass; for (let j = 0; j < G.h; j++) for (let u = 0; u < G.w; u++) { const p = (j * G.w + u) * 4; if (G.rgba[p + 3] < 128) continue; setPx(c, a[0] - G.ox + u, a[1] - G.oy + j, [G.rgba[p], G.rgba[p + 1], G.rgba[p + 2]], .18); } put(c, Ho.cabDoors, a); });
floorPiece("mark_scuff", (c, a) => { const N = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }; for (let t = 0; t < 1; t += .0024) { const ang = t * Math.PI / 2; for (const [r, st] of [[30, .17], [27, .12], [22, .1]]) { const mx = Math.sin(ang) * r, my = Math.cos(ang) * r, X = Math.round(a[0] + mx + my), Y = Math.round(a[1] + (mx - my) / 2 + 9); if (N(Math.floor(t * 60), r) < .4 || N(X, Y) < .35) continue; setPx(c, X, Y, [214, 196, 160], (N(X * 3, Y) * .5 + .5) * st); } } });
floorPiece("mark_tile", (c, a) => { for (let i = -14; i <= 14; i++) { const X = a[0] + i, base = a[1] + 8 - Math.abs(i) * .55; setPx(c, X, Math.round(base), [46, 30, 18]); setPx(c, X, Math.round(base) - 1, [226, 196, 150], .8); } });
/* ---- 42: Christmas: the tree always lit, real gifts, a garland; they only show under the skin ---- */
{ const tree = L.loadPng(R + "assets/furni/s_tree4_0_0_a.png"), on = L.loadPng(R + "assets/furni/s_tree4_1_0_b.png");
  floorPiece("xmastree", (c, a) => { const X = a[0] - (tree.w >> 1), Y = a[1] - tree.h + 3; for (let j = 0; j < tree.h; j++) for (let i = 0; i < tree.w; i++) { const p = (j * tree.w + i) * 4; if (tree.rgba[p + 3] < 128) continue; const q = ((Y + j) * c.w + X + i) * 4; c.d[q] = tree.rgba[p]; c.d[q + 1] = tree.rgba[p + 1]; c.d[q + 2] = tree.rgba[p + 2]; }
      const X2 = a[0] - (on.w >> 1), Y2 = a[1] - tree.h + 3 + 7; for (let j = 0; j < on.h; j++) for (let i = 0; i < on.w; i++) { const p = (j * on.w + i) * 4; if (on.rgba[p + 3] < 16) continue; const q = ((Y2 + j) * c.w + X2 + i) * 4, al = on.rgba[p + 3] / 255; for (let k = 0; k < 3; k++) c.d[q + k] = Math.min(255, c.d[q + k] + on.rgba[p + k] * al); } });
  /* the giant tree that takes the statue's place at Christmas: needles lit by the mood, lights and star always lit */
  { const T = require("./ideas/bigtree.js").art(); write("i_bigtree.png", T.needles); write("i_bigtree_lights.png", T.lights); FLOOR.bigtree = { f: "i_bigtree.png", lights: "i_bigtree_lights.png", ox: T.ox, oy: T.oy, w: T.w, h: T.h, bulbs: T.bulbs }; }
  /* the giant tree's own kind, a tile across (9 Nov 2026, his pick: scale .5, seed 3): built to its own size, so no trunk shows between its tiers */
  { const T = require("./ideas/bigtree.js").art({ Ht: 64, R: 18, seed: 3, scale: .5 }); write("i_xmasfir.png", T.needles); write("i_xmasfir_lights.png", T.lights); FLOOR.xmasfir = { f: "i_xmasfir.png", lights: "i_xmasfir_lights.png", ox: T.ox, oy: T.oy, w: T.w, h: T.h, bulbs: T.bulbs }; }
  /* the arcade cabinets, one per game (ideas/arcades.js): the Origins cabinet, recoloured */
  { const AR = require("./ideas/arcades.js"); for (const g of AR.GAMES) { const c = AR.cabinet(g, false); floorPiece("arcade_" + g.id, (cv, a) => { const X = a[0] - c.foot[0], Y = a[1] + 12 - c.foot[1]; for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) { const p = (j * c.w + i) * 4; if (c.rgba[p + 3] < 128) continue; const q = ((Y + j) * cv.w + X + i) * 4; for (let k = 0; k < 3; k++) cv.d[q + k] = c.rgba[p + k]; } }); } }
  /* and every Origins present, gift5 to gift11 (9 Nov 2026, his: "all types of presents available that are in habbo origins, small versions") */
  const PRESENTS = { 1: "s_anniv_present_gen1", 2: "s_anniv_present_gen2", 3: "s_anniv_present_gen3", 4: "s_anniv_present_gen4", 5: "s_present_gen", 6: "s_present_gen1", 7: "s_present_gen2", 8: "s_present_gen3", 9: "s_present_gen4", 10: "s_present_gen5", 11: "s_present_gen6" };
  Object.keys(PRESENTS).forEach(n => { const im = L.loadPng(R + "assets/furni/" + PRESENTS[n] + "_0_0_a.png"); floorPiece("gift" + n, (c, a) => { const X = a[0] - (im.w >> 1), Y = a[1] - im.h + 4; for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const p = (j * im.w + i) * 4; if (im.rgba[p + 3] < 128) continue; const q = ((Y + j) * c.w + X + i) * 4; for (let k = 0; k < 3; k++) c.d[q + k] = im.rgba[p + k]; } }); });
  const realFurni = (name, file, lit) => { const im = L.loadPng(R + "assets/furni/" + file), onIm = lit && L.loadPng(R + "assets/furni/" + lit); floorPiece(name, (c, a) => { const X = a[0] - (im.w >> 1), Y = a[1] - im.h + 4; for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const p = (j * im.w + i) * 4; if (im.rgba[p + 3] < 128) continue; const q = ((Y + j) * c.w + X + i) * 4; for (let k = 0; k < 3; k++) c.d[q + k] = im.rgba[p + k]; } if (onIm) { const X2 = a[0] - (onIm.w >> 1), Y2 = Y; for (let j = 0; j < onIm.h; j++) for (let i = 0; i < onIm.w; i++) { const p = (j * onIm.w + i) * 4; if (onIm.rgba[p + 3] < 16) continue; const q = ((Y2 + j) * c.w + X2 + i) * 4, al = onIm.rgba[p + 3] / 255; for (let k = 0; k < 3; k++) c.d[q + k] = Math.min(255, c.d[q + k] + onIm.rgba[p + k] * al); } } }); };
  /* More plants (8 Nov 2026, his: "Create some variations of the Plant furniture item, different plant types, pot styles, that all fit the hallway
     well"): the client's own small plants, each in its own pot, the grey office pots recoloured shade for shade into the hallway's materials */
  { const RAMP = { terracotta: [[70, 30, 18], [120, 56, 32], [166, 84, 48], [198, 112, 66], [226, 148, 98]], brass: [[92, 62, 20], [140, 100, 36], [184, 140, 58], [214, 176, 86], [240, 214, 140]], walnut: [[40, 22, 12], [66, 38, 20], [92, 56, 30], [120, 76, 42], [150, 100, 58]] };
    const potted = (name, file, ramp) => { const im = L.loadPng(R + "assets/furni/" + file), rgba = Buffer.from(im.rgba);
      if (ramp) { const grey = i => { const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return rgba[i + 3] >= 128 && mx > 40 && (mx - mn) / Math.max(1, mx) < .16; };
        /* only the pot: the grey in the lower part of the picture */
        let lo = 255, hi = 0; for (let j = Math.floor(im.h * .55); j < im.h; j++) for (let i = 0; i < im.w; i++) { const p = (j * im.w + i) * 4; if (!grey(p)) continue; const l = rgba[p] * .3 + rgba[p + 1] * .59 + rgba[p + 2] * .11; lo = Math.min(lo, l); hi = Math.max(hi, l); }
        for (let j = Math.floor(im.h * .55); j < im.h; j++) for (let i = 0; i < im.w; i++) { const p = (j * im.w + i) * 4; if (!grey(p)) continue; const l = rgba[p] * .3 + rgba[p + 1] * .59 + rgba[p + 2] * .11, c = RAMP[ramp][Math.min(4, Math.max(0, Math.round((l - lo) / Math.max(1, hi - lo) * 4)))]; rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; } }
      floorPiece(name, (c, a) => { const X = a[0] - (im.w >> 1), Y = a[1] - im.h + 4; for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const p = (j * im.w + i) * 4; if (rgba[p + 3] < 128) continue; const q = ((Y + j) * c.w + X + i) * 4; for (let k = 0; k < 3; k++) c.d[q + k] = rgba[p + k]; } }); };
    potted("plant_palm", "s_plant_yukka_0_0_a.png", "terracotta"); potted("plant_orange", "s_plant_fruittree_0_0_a.png", "brass"); potted("plant_bonsai", "s_plant_bonsai_0_0_a.png", "walnut");
    potted("plant_roses", "s_plant_rose_0_0_a.png", null); potted("plant_cactus", "s_plant_big_cactus_0_0_a.png", "terracotta"); potted("plant_bay", "s_green_officeplant_0_0_a.png", "brass"); potted("plant_sunflower", "s_plant_sunflower_0_0_a.png", null); }
  /* the arcade stool (8 Nov 2026, his art: art/arcade-stool.png, placed by art/arcade-stool-alignment.png). The piece's anchor is a quarter tile
     back from the tile's middle, so the stool's top-left is 9 left and 19 up from it: its middle over the tile's, its feet 4px below the middle */
  { const st = L.loadPng(require("path").join(__dirname, "art", "arcade-stool.png")); floorPiece("barstool", (c, a) => { const X = a[0] - 9, Y = a[1] - 19; for (let j = 0; j < st.h; j++) for (let i = 0; i < st.w; i++) { const p = (j * st.w + i) * 4; if (st.rgba[p + 3] < 128) continue; const q = ((Y + j) * c.w + X + i) * 4; for (let k = 0; k < 3; k++) c.d[q + k] = st.rgba[p + k]; } }); }
  /* the Theatredrome entrance's curtains: his art (9 Nov 2026), art/theatre-curtains.png, copied as it is; hw3.js theatreArt lays it in the tunnel */
  fs.copyFileSync(path.join(__dirname, "art", "theatre-curtains.png"), path.join(OUT, "i_theatre_curtains.png"));
  fs.copyFileSync(path.join(__dirname, "art", "theatre-arch-patch.png"), path.join(OUT, "i_theatre_arch_patch.png"));   // and his shading on the arch's frame
  /* The Leet Show (9 Nov 2026, ideas/leetshow.js): two posters for the wall and a poster stand on bronze poles, one picture for each way it turns */
  { const LS = require("./ideas/leetshow.js"); add("leet_poster", "The Leet Show: poster", "leet", (c, a) => put(c, LS.wall("portrait"), a), { text: true }); add("leet_bill", "The Leet Show: wide bill", "leet", (c, a) => put(c, LS.wall("landscape"), a), { text: true });
    floorPiece("leetstand", (c, a) => put(c, LS.stand(false), a)); floorPiece("leetstand_r", (c, a) => put(c, LS.stand(true), a));
    /* and a narrow one, two tiles: his own art since 9 Nov 2026 (art/leetstand-narrow.png, drawn over the generated one, poles in front on a
       plinth). The other way round (art/leetstand-narrow_r.png) is his flipped, with the face and its lettering from the generated mirror so it
       reads the right way. The anchor is 17 across and 104 down in his (the generated one moved 7 right and 6 up); flipped, 32 across */
    const his = (f, ax) => { const im = L.loadPng(require("path").join(__dirname, "art", f)); return (c, a) => { const X = a[0] - ax, Y = a[1] - 104; for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const p = (j * im.w + i) * 4; if (im.rgba[p + 3] < 128) continue; const q = ((Y + j) * c.w + X + i) * 4; for (let k = 0; k < 3; k++) c.d[q + k] = im.rgba[p + k]; c.d[q + 3] = 255; } }; };
    floorPiece("leetstand2", his("leetstand-narrow.png", 17)); floorPiece("leetstand2_r", his("leetstand-narrow_r.png", 32)); }
  realFurni("xmaslantern", "s_xmas08_lantern_0_0_a.png"); realFurni("xmassmalltree", "s_small_xmastree_0_0_a.png"); realFurni("xmasdrinks", "s_xmas_drinks_0_0_a.png"); realFurni("xmasduck", "s_xmasduck_0_4_a.png");
  floorPiece("snowman", XM.snowman);
  add("bunting", "Christmas bunting", "xmas", XM.bunting, { xmas: true }); { const f = add("festoon", "Festoon lights (old)", "xmas-old", XM.festoon(), { xmas: true, keep: true }); f.bulbs = XM.festoon.bulbs().map(q => [q[0] + f.ax, q[1] + f.ay]); }
  { const sw = add("swag", "Garland", "xmas-swag", XM.swag, { xmas: true, locked: true, keep: true }); /* its rope starts exactly at the tile's edge, so tiles join */ sw.y.layers[0].x = 8 - sw.ax; sw.x.layers[0].x = -8 - (sw.x.w - 1 - sw.ax); } add("wreath", "Wreath", "xmas", XM.wreath, { xmas: true }); add("stockings", "Stockings", "xmas", XM.stockings, { xmas: true }); add("holly", "Holly swag", "xmas", XM.holly, { xmas: true }); add("canes", "Candy canes", "xmas", XM.canes, { xmas: true });
  const g = A5.garland(), def = add("garland", "Christmas garland (old)", "xmas-old", (c, a) => L.put(c, g.s, a[0], a[1]), { keep: true, xmas: true }); def.spots = g.spots.map(q => [q[0] + def.ax - g.s.ox, q[1] + def.ay - g.s.oy]); }
/* the globe table lamp's picture, lit, for the palette and the ghost: the map draws its own */
{ const FLm = require("./render/floor-lamps.js"), list = FLm.pixels("tableglobe", false).list, xs = list.map(q => q[0]), ys = list.map(q => q[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 + 1, hh = Math.max(...ys) - y0 + 1, rgba = new Uint8ClampedArray(w * hh * 4); for (const [x, y, c] of list) { const q = ((y - y0) * w + x - x0) * 4; rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; rgba[q + 3] = 255; } write("i_tablelamp.png", { w, h: hh, rgba }); FLOOR.tablelampArt = { f: "i_tablelamp.png", ox: -x0, oy: -y0, w, h: hh }; }
/* the key, on its own, for Chris to edit: nothing else reads it until the hunts are built */
write("i_key.png", (() => { const k = A5.key(); return k; })());

/* ---- 17: Lost Property: the recess, its shelves and what's on them, the bell and ledger. The sign's its own piece, so it can be dragged about ---- */
{ const small = require("./ideas/smallsprites.json").filter(k => !/mushroom|deepgrove/.test(k[0]) || /pot/.test(k[0]));
  const seen = new Set(), pool = small.filter(k => /duck|CF_|prize|balloon|capsule/.test(k[0])).map(k => [k, L.loadPng(R + "assets/furni/" + k[2])]).filter(([k, im]) => im.w <= 14 && im.h <= 11).filter(([k]) => { const n = k[0].replace(/d+/g, "").split("_").slice(0, 2).join("_"); if (seen.has(n)) return false; seen.add(n); return true; });
  const d = A5.desk();
  add("desk", "Lost Property desk", "hotel", (c, a) => { L.put(c, d.sprite, a[0], a[1]); const at = (x, y, z) => [a[0] + x - y, a[1] + (x + y) / 2 - z]; let n = 0; const cols = [[d.X0 + 1.4, d.X0 + 16], [d.X0 + 17.4, d.X1 - 1]];
      for (const z of d.shelfZ) for (const [x0, x1] of cols) { const [k, im] = pool[n++ % pool.length], xc = (x0 + x1) / 2, q = at(xc, 6.5, z), X0p = Math.round(q[0] - im.w / 2), Y0p = Math.round(q[1] - im.h + 1); for (let j = 0; j < im.h; j++) for (let u = 0; u < im.w; u++) { const o = (j * im.w + u) * 4; if (im.rgba[o + 3] < 128) continue; const X = X0p + u, Y = Y0p + j, mx = X - a[0] + 7, mz = a[1] + (mx + 7) / 2 - Y, wy = a[0] - X, wz = a[1] + wy / 2 - Y; if (mx <= x0 || mx >= x1 || mz <= z - 3 || mz >= z + 11.5 || wz >= d.HT - 1 || wy <= 1) continue; const qq = (Y * c.w + X) * 4; c.d[qq] = im.rgba[o]; c.d[qq + 1] = im.rgba[o + 1]; c.d[qq + 2] = im.rgba[o + 2]; } }
      let q = at(-2, 18, 31); L.put(c, A5.bell(), q[0], q[1]); q = at(-2, 50, 31); L.put(c, A4.ledger(), q[0], q[1]); }, { locked: true, snap: true, drop: 6 });
  add("lpsign", "Lost Property sign", "hotel", (c, a) => A5.signOut(c, a[0], a[1], ["Lost", "Property"]), { text: true, pivot: true });
  /* a sign with his own words: this picture is only the editor's; the map draws the real one from its text (render/hw3.js customSign) */
  add("custsign", "Custom sign", "hotel", (c, a) => A5.signOut(c, a[0], a[1], ["Your", "words"]), { text: true, pivot: true });
  /* what can go missing: small things only */
  const dir = path.join(__dirname, "art", "ideas", "lost"); fs.mkdirSync(dir, { recursive: true }); const items = small.filter(s => s[3] <= 18 && s[4] <= 18 && !/CF_1_|CF_5_/.test(s[0])); for (const s of items) fs.copyFileSync(R + "assets/furni/" + s[2], path.join(dir, s[2]));
  fs.writeFileSync(path.join(__dirname, "art", "ideas", "lost.json"), JSON.stringify(items.map(s => ({ k: s[0], name: s[1], f: s[2], w: s[3], h: s[4] })))); console.log("lost things", items.length);
  /* the server picks what's lost (netlify/functions/hallway-lost.js), from the named ones */
  fs.writeFileSync(path.join(R, "netlify", "functions", "_hallway-lost-things.json"), JSON.stringify(items.filter(s => s[1] && String(s[1]).trim()).map(s => ({ k: s[0], name: s[1] })))); }

/* ---- 18, 20: a scrap of paper, and the notice board ---- */
{ const s = A4.scrap(), dir = path.join(__dirname, "art", "ideas"); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "scrap.png"), encodePng(s.w, s.h, Buffer.from(s.rgba)));
  add("board", "Notice board", "hotel", (c, a) => { const W = 40, Hh = 30, z0 = 56; const P2 = (u, z) => [a[0] - u, a[1] + Math.floor(u / 2) - z]; for (let u = -1; u <= W + 1; u++) for (let z = z0 - 1; z <= z0 + Hh + 1; z++) { const q = P2(u, z), edge = u < 0 || u > W || z < z0 || z > z0 + Hh, fr = u < 2 || u > W - 2 || z < z0 + 2 || z > z0 + Hh - 2, n = (u * 7 + z * 13) % 5, cc = edge ? [18, 7, 4] : fr ? [147, 112, 90] : n === 0 ? [150, 106, 66] : n === 2 ? [176, 132, 88] : [164, 120, 76], i = (q[1] * c.w + q[0]) * 4; c.d[i] = cc[0]; c.d[i + 1] = cc[1]; c.d[i + 2] = cc[2]; c.d[i + 3] = 255; }
      for (const [u0, z0b, w, h, col] of [[5, 68, 11, 13, [244, 238, 220]], [19, 72, 14, 10, [226, 218, 196]], [9, 60, 13, 7, [240, 226, 170]]]) for (let u = u0; u < u0 + w; u++) for (let z = z0b; z < z0b + h; z++) { const q = P2(u, z), i = (q[1] * c.w + q[0]) * 4, line = (z - z0b) % 3 === 1 && u > u0 + 1 && u < u0 + w - 2; c.d[i] = line ? 150 : col[0]; c.d[i + 1] = line ? 140 : col[1]; c.d[i + 2] = line ? 126 : col[2]; } }); }

/* ---- 53: the hole on the skirting, and the rat, frames in a row with what each needs to stand on its feet. The page reads these, nothing is baked ---- */
add("rathole", "Rat hole", "tell", (c, a) => L.put(c, A5.hole("x"), a[0], a[1]), { locked: true, drop: 6 });
{ const r = require("./ideas/old-items2.js").bakeRat(), dirs = ["x", "y", "nx", "ny"], sheet = {}, parts = []; let W = 0, Hh = 0;
  for (const d of dirs) { sheet[d] = r[d].map(s => { let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.rgba[(y * s.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } const w = x1 - x0 + 1, h = y1 - y0 + 1, f = { x: W, w, h, ox: s.ox - x0, oy: s.oy - y0 }; parts.push({ s, x0, y0, w, h, at: W }); W += w + 1; Hh = Math.max(Hh, h); return f; }); }
  const out = new Uint8ClampedArray(W * Hh * 4); for (const q of parts) for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w * 4; x++) out[(y * W + q.at) * 4 + x] = q.s.rgba[((y + q.y0) * q.s.w + q.x0) * 4 + x];
  const dir = path.join(__dirname, "art", "ideas"); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "rat.png"), encodePng(W, Hh, Buffer.from(out))); fs.writeFileSync(path.join(dir, "rat.json"), JSON.stringify(sheet)); }

/* ---- 23: the bookcase door, its frames in a row for the page, and its closed state for the renderer ---- */
{ const F = A5.bookDoor(), pass = A5.passage(F.W, F.H - 2);
  /* a thin band under the top board was see-through, so the wallpaper showed between it and the shelves (his, 8 Nov: "a gap near the top"):
     in each frame of the case, any clear pixel between the case's top and its foot in a column is filled with the case's dark wood */
  for (const q of [...F.frames, ...F.pulls]) for (let x = 0; x < q.w; x++) { let top = -1, bot = -1; for (let y = 0; y < q.h; y++) if (q.rgba[(y * q.w + x) * 4 + 3] >= 128) { if (top < 0) top = y; bot = y; } if (top < 0) continue;
      for (let y = top; y <= bot; y++) { const i = (y * q.w + x) * 4; if (q.rgba[i + 3] >= 128) continue; q.rgba[i] = 51; q.rgba[i + 1] = 0; q.rgba[i + 2] = 0; q.rgba[i + 3] = 255; } }
  const all = [...F.frames, ...F.pulls, pass], trim = q => q; let W = 0, Hh = 0; const put2 = all.map(q => { const at = W; W += q.w + 1; Hh = Math.max(Hh, q.h); return at; }), out = new Uint8ClampedArray(W * Hh * 4);
  all.forEach((q, n) => { for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w * 4; x++) out[(y * W + put2[n]) * 4 + x] = q.rgba[y * q.w * 4 + x]; });
  const dir = path.join(__dirname, "art", "ideas"), meta = (q, n) => ({ x: put2[n], w: q.w, h: q.h, ox: q.ox, oy: q.oy }); fs.writeFileSync(path.join(dir, "book.png"), encodePng(W, Hh, Buffer.from(out))); fs.writeFileSync(path.join(dir, "book.json"), JSON.stringify({ book: F.book, frames: F.frames.map(meta), pulls: F.pulls.map((q, i) => meta(q, F.frames.length + i)), passage: meta(pass, all.length - 1), W: F.W, H: F.H, STEP: F.STEP }));
  const closed = F.pulls[0]; write("i_bookdoor.png", closed); FLOOR.bookdoor = { f: "i_bookdoor.png", ox: closed.ox, oy: closed.oy, w: closed.w, h: closed.h }; }

/* ---- 24: the staff rooms' fittings and lights, one sprite each, kept with the rooms' art: ax and ay say where the anchor tile's left corner falls ---- */
{ const parts = A5.staffRoom({ parts: true }), li = A5.lights(), ROOM = path.join(__dirname, "art", "rooms"), indexFile = path.join(ROOM, "index.json"), index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  const save = (name, q, tx, ty, fx, fy) => { fs.writeFileSync(path.join(ROOM, name + ".png"), encodePng(q.w, q.h, Buffer.from(q.rgba))); index.sprites[name] = { w: q.w, h: q.h, ax: q.ox + (tx - ty) * 16 - 16, ay: q.oy + (tx + ty) * 8 + 8, fx, fy }; };
  /* art coordinates: 16 to a tile, wall along x = 0 */
  save("st_pipes", parts.pipes, 0, 0, 1, 12); save("st_boiler", parts.boiler, 0, 9, 2, 4); save("st_duct", parts.duct, 0, 0, 6, 1); save("st_vent", parts.vent, 0, 2, 1, 2); save("st_ventx", parts.ventx, 2, 0, 2, 1); save("st_fan", parts.fan, 0, 12, 1, 2); save("st_grate", parts.grate, 3, 6, 1, 2); save("st_cabinet", parts.cabinet, 0, 4, 1, 2); save("st_hazard", parts.hazard, 0, 8, 2, 5);
  for (const [k, l] of Object.entries(li)) save("st_light_" + k, l.s, l.floor ? -.5 : k === "pendant" ? -.875 : 0, l.floor ? -.5 : k === "pendant" ? -.5 : -.5, 1, 1);
  fs.writeFileSync(indexFile, JSON.stringify(index)); console.log("staff lights:", Object.entries(li).map(([k, l]) => k + (l.floor ? " (floor)" : "")).join(", ")); }

/* ---- the list: the i_ entries replace themselves, the rest stay as make-wall-items.js made them ---- */
let old = []; try { delete require.cache[require.resolve(LIST)]; old = require(LIST).filter(i => !String(i.id).startsWith("i_")); } catch (e) { throw new Error("wall-items.js: " + e.message); }
const FL = JSON.stringify(FLOOR);
fs.writeFileSync(LIST, `/* made by make-wall-items.js and make-ideas-art.js */\n(function () { const L = ${JSON.stringify([...old, ...items])}, F = ${FL}; if (typeof module !== "undefined") { module.exports = L; L.floor = F; } else { window.WALL_ITEMS = L; window.FLOOR_PIECES = F; } })();\n`);
console.log(items.length, "wall pieces,", Object.keys(FLOOR).length, "floor pieces:", items.map(i => i.id + " " + i.y.w + "x" + i.y.h + " h" + i.h).join(", "));
/* The arcade cabinets as Chris has drawn them (8 Nov 2026): a picture in art/arcades/ takes the place of the one made from ideas/arcades.js,
   at the same size, so it stands where the made one did. A different size is left out, with a warning, as its foot would move. */
{ const own = path.join(__dirname, "art", "arcades"); if (fs.existsSync(own)) for (const f of fs.readdirSync(own)) { if (!/^i_arcade_\w+\.png$/.test(f)) continue;
    const mine = L.loadPng(path.join(own, f)), made = path.join(__dirname, "art", "wall", f); if (!fs.existsSync(made)) continue; const was = L.loadPng(made);
    if (mine.w !== was.w || mine.h !== was.h) { console.warn("art/arcades/" + f + " is " + mine.w + "x" + mine.h + ", not " + was.w + "x" + was.h + ": left out"); continue; }
    fs.copyFileSync(path.join(own, f), made); } }
