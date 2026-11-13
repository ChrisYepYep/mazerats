/* The Events Gallery's pieces (12 Nov 2026), from the signed-off mock-ups' drawing code in gallery-art/.
   - the Game Hall lobby's sofa, armchair and tables, recoloured: written beside the client's pieces as gh_*.png, their registration points
     in art/regs.json, so furni-parts.js runs them like the Hallway's own sofas (any length, either way round);
   - floor pieces (plinths with what stands on them, the placard both ways, the client's plants, the year plate in brass and steel, both ways): art/wall/g_*.png and
     wall-items.js's floor list;
   - wall pieces (EVENTS banners in eight colours, frames S/M/L in gilt, modern or walnut, the picture light, the egg sconce): art/wall/g_*.png
     and wall-items.js's list, in the "gallery" group. The lights are lit after dark and count as lamps.
   Run again if the art changes: node tools/hallway-editor/make-gallery-art.js. make-ideas-art.js and make-wall-items.js keep what this writes. */
"use strict";
const fs = require("fs"), path = require("path");
const A = require("./gallery-art/art.js"), X = A.X;
const { encodePng } = require("../png-encode.js");
const HALL = path.join(__dirname, "art/hall/hh_room_hallway"), REGS = path.join(__dirname, "art/regs.json"), OUT = path.join(__dirname, "art", "wall"), LIST = path.join(__dirname, "wall-items.js");
/* every pixel either there or not: the renderer reads a part-clear pixel as a tint */
const solid = im => { const d = Buffer.from(im.d); for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0; return d; };
const write = (dir, f, im) => fs.writeFileSync(path.join(dir, f), encodePng(im.w, im.h, solid(im)));
for (const f of fs.readdirSync(OUT)) if (f.startsWith("g_")) fs.rmSync(path.join(OUT, f));

/* ---- the lobby's furniture, as client pieces ---- */
const regs = JSON.parse(fs.readFileSync(REGS, "utf8"));
for (const p of A.LOBBY) { const to = p.src.replace(/^gl_/, "gh_"); write(HALL, to + ".png", p.img); regs.hall[to] = p.reg; }
fs.writeFileSync(REGS, JSON.stringify(regs));

/* ---- floor pieces: the generic floor-piece drawing puts the picture's (ox, oy) at the point a quarter tile in from the tile's top
   corner (a mark_ piece: the tile's middle) ---- */
const FLOOR = {};
const TILE_MID = [0, 4];      // the tile's middle, from that quarter point
function floorPiece(k, art, o = {}) { const f = "g_" + k + ".png"; write(OUT, f, art.img); FLOOR[k] = { f, ox: art.ox, oy: art.oy, w: art.img.w, h: art.img.h, ...o }; return FLOOR[k]; }
const fromMid = r => ({ img: r.img, ox: r.ax, oy: r.ay - TILE_MID[1] });

/* plinths: one piece for each stone, what stands on it an option */
for (const [kind, name] of Object.entries(A.PLINTHS)) {
    const k = "gh_plinth_" + kind, fp = floorPiece(k, fromMid(A.plinthWith(kind, null)), { name, optLabel: "On it", rare0: "none" });
    fp.opts = { none: { name: "Nothing", f: fp.f } };
    for (const [item, it] of Object.entries(A.ITEMS)) { const art = fromMid(A.plinthWith(kind, item)), f = "g_" + k + "_" + item + ".png"; write(OUT, f, art.img); fp.opts[item] = { name: it.name, f, ox: art.ox, oy: art.oy, w: art.img.w, h: art.img.h }; }
}
/* the placard, facing along x (its _r facing along y); pic: where the live layer paints the event's picture, from the tile's middle */
floorPiece("gh_placard", fromMid(A.placard("x")), { name: "Placard", pic: A.placardPicture("x") });
floorPiece("gh_placard_r", fromMid(A.placard("y")), { name: "Placard", pic: A.placardPicture("y") });
/* the client's plants: their own registration points, from the tile's left corner (16 left of and 8 below its top corner) */
for (const [k, p] of Object.entries(A.PLANTS)) { const c = A.clientPlant(k); floorPiece("plant_" + k, { img: c.img, ox: 16 + c.reg[0], oy: c.reg[1] - 4 }, { name: p.name }); }
/* the year plate (14 Nov 2026, his: a shiny metal plate, brass or steel, both in the editor, and turnable): flat, 3 tiles along x by 2 along y
   (its _r: 2 by 3, the year reading up to the right), its top corner on the piece's tile's top corner (a mark_ piece's point is the tile's
   middle, 8 below it); the year an option */
{ const YEARS = []; for (let y = 2024; y <= 2032; y++) YEARS.push(String(y));
  for (const metal of Object.keys(A.METALS)) for (const axis of ["x", "y"]) {
      const k = "mark_year" + (metal === "brass" ? "" : "_" + metal) + (axis === "y" ? "_r" : "");
      const mk = yr => { const s = A.yearPlate(yr, metal, axis); return { img: s.img, ox: s.top[0], oy: s.top[1] + 8 }; };
      const fp = floorPiece(k, mk("2026"), { name: "Year plate, " + A.METALS[metal].name.toLowerCase(), optLabel: "Year", rare0: "2026", flat: true });
      fp.opts = {}; for (const yr of YEARS) { const art = mk(yr), f = "g_" + k + "_" + yr + ".png"; write(OUT, f, art.img); fp.opts[yr] = { name: yr, f, ox: art.ox, oy: art.oy, w: art.img.w, h: art.img.h }; }
  } }

/* ---- wall pieces: drawn for each way the wall runs ("x" down to the right, "y" up to the right), never mirrored, so lettering reads
   and the light falls the same way as the mock-ups'. h: the height of the piece's middle over the floor ---- */
const items = [];
/* the row of the picture's middle in its middle column */
const midRow = im => { const x = im.w >> 1; let y0 = -1, y1 = -1; for (let y = 0; y < im.h; y++) if (im.d[(y * im.w + x) * 4 + 3] >= 128) { if (y0 < 0) y0 = y; y1 = y; } return y0 < 0 ? im.h >> 1 : Math.round((y0 + y1) / 2); };
function wallPiece(id, name, h, ways, o = {}) {
    const def = { id: "g_" + id, name, kind: "gallery", tell: false, h };
    for (const way of ["x", "y"]) {
        const im = ways(way, false), f = "g_" + id + "_" + way + ".png"; write(OUT, f, im);
        const layer = { f, x: -(im.w >> 1), y: -midRow(im), flip: 0 };
        if (o.lit) { const li = ways(way, true), fl = "g_" + id + "_" + way + "_lit.png"; write(OUT, fl, li); layer.litF = fl; }
        def[way] = { w: im.w, h: im.h, layers: [layer] };
    }
    if (o.lit) def.lit = { colour: o.lit, at: [0, 0, h + (o.glowUp || 0)] };
    if (o.frame) def.frame = o.frame;
    items.push(def); return def;
}
for (const [id, name, hex] of A.BANNERS) { const flat = A.banner(A.velOf(hex)); wallPiece("banner_" + id, "EVENTS banner: " + name.toLowerCase(), 104, way => A.onWall(flat, way)); }
for (const [style, F] of Object.entries(A.FRAMES)) for (const size of ["S", "M", "L"]) {
    const [pw, ph] = A.SIZES[size];
    wallPiece("frame_" + style + "_" + size, F.name + " frame, " + { S: "small", M: "medium", L: "large" }[size], 80, way => A.frame(style, size, way), { frame: { style, size, pw, ph, pad: F.pad } });
}
wallPiece("piclight", "Picture light", 116, (way, lit) => X.wall(A.pictureLight(lit), way), { lit: "#ffe4a0", glowUp: -6 });
wallPiece("eggsconce", "Egg wall light", 78, (way, lit) => { const s = A.eggSconce(lit); return way === "x" ? s : X.flipX(s); }, { lit: "#ffd9a0" });

/* ---- the list: the g_ entries replace themselves, everything else stays ---- */
delete require.cache[require.resolve(LIST)];
const was = require(LIST), old = was.filter(i => !String(i.id).startsWith("g_")), oldFloor = {};
for (const [k, v] of Object.entries(was.floor || {})) if (!String(v.f).startsWith("g_")) oldFloor[k] = v;
const list = [...old, ...items], F = { ...oldFloor, ...FLOOR };
fs.writeFileSync(LIST, `/* made by make-wall-items.js, make-ideas-art.js and make-gallery-art.js */\n(function () { const L = ${JSON.stringify(list)}, F = ${JSON.stringify(F)}; if (typeof module !== "undefined") { module.exports = L; L.floor = F; } else { window.WALL_ITEMS = L; window.FLOOR_PIECES = F; } })();\n`);
console.log(items.length, "wall pieces,", Object.keys(FLOOR).length, "floor pieces,", A.LOBBY.length, "lobby sprites");
