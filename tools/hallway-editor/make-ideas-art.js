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
let mirrored = false; const memo = {}, setM = v => { mirrored = v; A.setMirrorText(v); };

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
const H = () => memo[mirrored] || (memo[mirrored] = A5.hotelItems());
for (const [id, name, k, o] of [["theatre", "Way to the Theatredrome", "theatre", { text: true }], ["bar", "The Dirty Duck", "bar", { text: true }], ["guides", "Hotel Guides", "guides", { text: true }], ["poster", "Poster: beware", "poster", { text: true }], ["photo", "A photo of the hotel (.com)", "photo", {}], ["photo_es", "A photo of the hotel (.es)", "photo_es", {}], ["photo_br", "A photo of the hotel (.com.br)", "photo_br", {}], ["freedoor", "Free Credits, bricked up", "freeDoor", { text: true, locked: true }]]) add(id, name, "hotel", (c, a) => put(c, H()[k], a), o);
{ const fire = (lit) => (c, a) => { const Ho = H(), s = Ho.fireSign, sp = { ...s.sprite, rgba: new Uint8ClampedArray(s.sprite.rgba) }; if (lit) for (let q = 0; q < sp.rgba.length; q += 4) if (sp.rgba[q + 3] > 128 && sp.rgba[q] === A5.SIGN_GREEN[0] && sp.rgba[q + 1] === A5.SIGN_GREEN[1] && sp.rgba[q + 2] === A5.SIGN_GREEN[2]) { sp.rgba[q] = A5.SIGN_LIT[0]; sp.rgba[q + 1] = A5.SIGN_LIT[1]; sp.rgba[q + 2] = A5.SIGN_LIT[2]; } put(c, Ho.fireExit, a); put(c, sp, a); };
  const g = H().fireSign.glow, def = add("fireexit", "Fire exit", "hotel", fire(false), { text: true, lit: fire(true), glow: { colour: "#2ee07c", at: g }, locked: true }); }
add("ratcase", "A stuffed rat, in a case", "hotel", (c, a) => { const C = H().ratCase; put(c, C.backing, a); put(c, C.plinth, a); L.put(c, C.rat, Math.round(a[0] + 3 - 20), Math.round(a[1] + (3 + 20) / 2 - (C.z0 + 8))); for (let y = 2; y < C.W - 2; y++) for (let z = C.z0 + 2; z < C.z0 + C.Hh - 2; z++) { const X = a[0] + C.D - y, Y = Math.round(a[1] + (C.D + y) / 2 - z), st = ((y + (z - C.z0) * .8) % 40) < 6 ? .22 : .07; setPx(c, X, Y, [224, 242, 255], st); } put(c, C.front, a); });

/* ---- 42: windows. Each mood's view of the grounds, from the hotel view's own art; the window itself is drawn by render/hall-window.js at any size ---- */
{ const back = L.loadPng(R + "assets/img/hotel/uk-back.png"), front = L.loadPng(R + "assets/img/hotel/uk-front.png"), W = 720, Hh = 498, base = new Uint8ClampedArray(W * Hh * 4); for (let i = 0; i < W * Hh * 4; i += 4) { const a = front.rgba[i + 3] / 255; for (let k = 0; k < 3; k++) base[i + k] = back.rgba[i + k] * (1 - a) + front.rgba[i + k] * a; base[i + 3] = 255; }
  const grade = fn => { const o = new Uint8ClampedArray(base); for (let i = 0; i < o.length; i += 4) { const c = fn(o[i], o[i + 1], o[i + 2]); o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; } return { w: W, h: Hh, rgba: o }; };
  write("i_view_day.png", grade((r, g2, b) => [r, g2, b])); write("i_view_dusk.png", grade((r, g2, b) => [Math.min(255, r * .95 + 18), g2 * .68, b * .62])); write("i_view_night.png", grade((r, g2, b) => [r * .2 + 6, g2 * .22 + 8, b * .34 + 22])); write("i_view_dawn.png", grade((r, g2, b) => [r * .78 + 22, g2 * .72 + 12, b * .84 + 26]));
  const Wn = 32, Tn = 128, s = require("./render/hall-window.js").art(Wn, 0, Tn), art = { w: s.w, h: s.h, rgba: s.rgba }; write("i_window.png", art); const mid = Tn / 2, yo = -Wn / 4 - 6 - s.oy + mid; items.push({ id: "i_window", name: "Window", kind: "window", tell: true, h: mid, x: { w: s.w, h: s.h, layers: [{ f: "i_window.png", x: -Wn / 2 + s.ox - s.w, y: yo, flip: 1 }] }, y: { w: s.w, h: s.h, layers: [{ f: "i_window.png", x: Wn / 2 - s.ox, y: yo, flip: 0 }] } }); }

/* ---- floor pieces: not wall items, so no list entry; the renderer and editor know them by file ---- */
const FLOOR = {};
function floorPiece(k, draw) { const art = capture(draw), f = "i_" + k + ".png", mark = k.startsWith("mark_"); write(f, art); FLOOR[k] = { f, ox: mark ? art.w >> 1 : art.ox, oy: mark ? art.h >> 1 : art.oy, w: art.w, h: art.h }; }
floorPiece("rarecase", (c, a) => { const Ho = H(), rare = require("./ideas/smallsprites.json").find(s => /capsule_silver/.test(s[0])), im = L.loadPng(R + "assets/furni/" + rare[2]); put(c, Ho.caseBase, a); put(c, Ho.caseFar, a); L.put(c, { ...im, ox: 0, oy: 0 }, a[0] - (im.w >> 1), a[1] + 12 - 20 - im.h + 2); const G = Ho.caseGlass; for (let j = 0; j < G.h; j++) for (let u = 0; u < G.w; u++) { const p = (j * G.w + u) * 4; if (G.rgba[p + 3] < 128) continue; setPx(c, a[0] - G.ox + u, a[1] - G.oy + j, [G.rgba[p], G.rgba[p + 1], G.rgba[p + 2]], .18); } for (let i = 0; i < 26; i++) for (const [dx, dy] of [[-16 + i * .3, -24 - i], [-12 + i * .3, -24 - i]]) setPx(c, Math.round(a[0] + dx), Math.round(a[1] + 18 + dy), [255, 255, 255], .45); put(c, Ho.caseNear, a); });
floorPiece("trophy", (c, a) => { const Ho = H(), small = require("./ideas/smallsprites.json").filter(s => /prize/.test(s[0]) && s[4] <= 26); put(c, Ho.cabinet, a); [[5, 12, 36], [5, 28, 36], [5, 20, 10]].forEach(([x, y, z], i) => { const im = L.loadPng(R + "assets/furni/" + small[i % small.length][2]), q = [a[0] + x - y, a[1] + (x + y) / 2 - z], X0 = Math.round(q[0] - (im.w >> 1)), Y0 = Math.round(q[1] - im.h + 2); for (let j = 0; j < im.h; j++) for (let u = 0; u < im.w; u++) { const p = (j * im.w + u) * 4; if (im.rgba[p + 3] < 128) continue; const X = X0 + u, Y = Y0 + j, sx = X - a[0], sy = Y - a[1], fy = 13 - sx, fz = (13 + fy) / 2 - sy; if (fy < 3.5 || fy > 36.5 || fz < 8.5 || fz > 63.5) continue; const qq = (Y * c.w + X) * 4; c.d[qq] = im.rgba[p]; c.d[qq + 1] = im.rgba[p + 1]; c.d[qq + 2] = im.rgba[p + 2]; } }); const G = Ho.cabGlass; for (let j = 0; j < G.h; j++) for (let u = 0; u < G.w; u++) { const p = (j * G.w + u) * 4; if (G.rgba[p + 3] < 128) continue; setPx(c, a[0] - G.ox + u, a[1] - G.oy + j, [G.rgba[p], G.rgba[p + 1], G.rgba[p + 2]], .18); } put(c, Ho.cabDoors, a); });
floorPiece("mark_scuff", (c, a) => { const N = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }; for (let t = 0; t < 1; t += .0024) { const ang = t * Math.PI / 2; for (const [r, st] of [[30, .17], [27, .12], [22, .1]]) { const mx = Math.sin(ang) * r, my = Math.cos(ang) * r, X = Math.round(a[0] + mx + my), Y = Math.round(a[1] + (mx - my) / 2 + 9); if (N(Math.floor(t * 60), r) < .4 || N(X, Y) < .35) continue; setPx(c, X, Y, [214, 196, 160], (N(X * 3, Y) * .5 + .5) * st); } } });
floorPiece("mark_tile", (c, a) => { for (let i = -14; i <= 14; i++) { const X = a[0] + i, base = a[1] + 8 - Math.abs(i) * .55; setPx(c, X, Math.round(base), [46, 30, 18]); setPx(c, X, Math.round(base) - 1, [226, 196, 150], .8); } });
/* the key, on its own, for Chris to edit: nothing else reads it until the hunts are built */
write("i_key.png", (() => { const k = A5.key(); return k; })());

/* ---- 53: the hole on the skirting, and the rat, frames in a row with what each needs to stand on its feet. The page reads these, nothing is baked ---- */
add("rathole", "Rat hole", "tell", (c, a) => L.put(c, A5.hole("x"), a[0], a[1]), { locked: true, drop: 12 });
{ const r = require("./ideas/old-items2.js").bakeRat(), dirs = ["x", "y", "nx", "ny"], sheet = {}, parts = []; let W = 0, Hh = 0;
  for (const d of dirs) { sheet[d] = r[d].map(s => { let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.rgba[(y * s.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } const w = x1 - x0 + 1, h = y1 - y0 + 1, f = { x: W, w, h, ox: s.ox - x0, oy: s.oy - y0 }; parts.push({ s, x0, y0, w, h, at: W }); W += w + 1; Hh = Math.max(Hh, h); return f; }); }
  const out = new Uint8ClampedArray(W * Hh * 4); for (const q of parts) for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w * 4; x++) out[(y * W + q.at) * 4 + x] = q.s.rgba[((y + q.y0) * q.s.w + q.x0) * 4 + x];
  const dir = path.join(__dirname, "art", "ideas"); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "rat.png"), encodePng(W, Hh, Buffer.from(out))); fs.writeFileSync(path.join(dir, "rat.json"), JSON.stringify(sheet)); }

/* ---- the list: the i_ entries replace themselves, the rest stay as make-wall-items.js made them ---- */
let old = []; try { delete require.cache[require.resolve(LIST)]; old = require(LIST).filter(i => !String(i.id).startsWith("i_")); } catch (e) { throw new Error("wall-items.js: " + e.message); }
const FL = JSON.stringify(FLOOR);
fs.writeFileSync(LIST, `/* made by make-wall-items.js and make-ideas-art.js */\n(function () { const L = ${JSON.stringify([...old, ...items])}, F = ${FL}; if (typeof module !== "undefined") { module.exports = L; L.floor = F; } else { window.WALL_ITEMS = L; window.FLOOR_PIECES = F; } })();\n`);
console.log(items.length, "wall pieces,", Object.keys(FLOOR).length, "floor pieces:", items.map(i => i.id + " " + i.y.w + "x" + i.y.h + " h" + i.h).join(", "));
