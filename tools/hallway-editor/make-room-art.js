/* The art for the maze rooms, cut from the client's own files into art/rooms/, with art/rooms/index.json saying how each
   piece sits on its tile. Run it when a piece changes or a maze is added: node tools/hallway-editor/make-room-art.js

     the bookcases     hh_room_library's are one-tile strips, so they come in any length
     the oak table     hh_furni Glukko's 2x2 in oak, its broken near leg replaced by a copy of a good one
     the books         the Glukko green book in several colours, and the brown one for the ledger
     stone, glass, rug out of the Library's painting
     the font          for the maze's name beside its room */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const HERE = __dirname, ROOT = path.resolve(HERE, "../..").replace(/\\/g, "/") + "/", OUT = path.join(HERE, "art", "rooms");
const { readPng } = require(ROOT + "tools/png-decode.js");
const { encodePng } = require(ROOT + "tools/png-encode.js");
const W = require("./render/hw3.js");

const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(ROOT + "js/furni-library.js", "utf8"), ctx);
const LIB = ctx.window.FurniLibrary;
const png = f => { const i = readPng(f); return { w: i.w, h: i.h, d: i.rgba }; };
const lib = n => png(ROOT + "assets/rooms/library/" + n + ".png");
const part = (cls, s, k) => png(ROOT + "assets/furni/" + cls + "_" + s + "_" + k + ".png");
const blank = (w, h) => ({ w, h, d: Buffer.alloc(w * h * 4) });
function over(to, im, x0, y0, tint) {
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
        const p = (y * im.w + x) * 4; if (!im.d[p + 3]) continue;
        const X = x0 + x, Y = y0 + y; if (X < 0 || Y < 0 || X >= to.w || Y >= to.h) continue;
        let c = [im.d[p], im.d[p + 1], im.d[p + 2], im.d[p + 3]]; if (tint) c = tint(c); if (!c[3]) continue;
        const q = (Y * to.w + X) * 4; to.d[q] = c[0]; to.d[q + 1] = c[1]; to.d[q + 2] = c[2]; to.d[q + 3] = c[3];
    }
}
const save = (name, im) => fs.writeFileSync(path.join(OUT, name + ".png"), encodePng(im.w, im.h, im.d));
function furni(cls, dir, o) {
    const e = LIB[cls], st = Object.keys(e.s)[0], d = dir === undefined ? Object.keys(e.s[st])[0] : dir, box = e.s[st][d], im = blank(box.w, box.h);
    for (const p of box.p) over(im, part(cls, p.f || st + "_" + d, p.k), p.ox, p.oy, o && o.tint);
    return { im, ax: box.ax, ay: box.ay };
}
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(ROOT + "assets/fonts/VolterGoldfish.woff2", path.join(OUT, "VolterGoldfish.woff2"));
const index = { sprites: {}, shelf: {}, books: [] };
const sprite = (name, f, fx, fy) => { save(name, f.im); index.sprites[name] = { w: f.im.w, h: f.im.h, ax: f.ax, ay: f.ay, fx, fy }; };

/* bookcases */
for (const i of [1, 2, 3, 4, 5, 6, 19, 20, 21, 22, 23, 24, 25, 26, 27]) save("shelf" + i, lib("shelfmask" + i));

/* the table: the client's near leg (part b) decodes to noise, so it's a copy of the left leg */
{
    const toOak = c => { const l = c[0] * .3 + c[1] * .59 + c[2] * .11; return [Math.min(255, l * 1.5), Math.min(255, l * 1.08), Math.min(255, l * .66), c[3]]; };
    const box = LIB.s_glukko_table.s[0][0], im = blank(box.w, box.h), a = part("s_glukko_table", "0_0", "a"), pa = box.p[0];
    over(im, a, pa.ox, pa.oy, toOak);
    let lx1 = 0; for (let x = 0; x < a.w && lx1 === 0; x++) { let any = false; for (let y = 0; y < a.h; y++) if (a.d[(y * a.w + x) * 4 + 3]) any = true; if (!any && x > 2) lx1 = x; }
    let h0 = a.h, h1 = 0; for (let x = 0; x < lx1; x++) for (let y = 0; y < a.h; y++) if (a.d[(y * a.w + x) * 4 + 3]) { h0 = Math.min(h0, y); h1 = Math.max(h1, y); }
    const leg = blank(lx1, h1 - h0 + 1); for (let y = h0; y <= h1; y++) a.d.copy(leg.d, (y - h0) * leg.w * 4, y * a.w * 4, y * a.w * 4 + lx1 * 4);
    const b = box.p.find(p => p.k === "b"); over(im, leg, b.ox - 1, b.oy + b.h - leg.h - 1, toOak);
    for (const p of box.p) if (p.k !== "a" && p.k !== "b") over(im, part("s_glukko_table", "0_0", p.k), p.ox, p.oy, toOak);
    sprite("table", { im, ax: box.ax, ay: box.ay }, 2, 2);
}
/* the books: only the green cover changes */
const COLOURS = { green: null, oxblood: [150, 34, 34], navy: [44, 62, 128], plum: [104, 46, 112], ochre: [186, 134, 44], black: [70, 66, 74], teal: [36, 112, 110] };
for (const name in COLOURS) {
    const t = COLOURS[name];
    const tint = c => { if (!t) return c; const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); if (!(c[1] >= c[0] * .92 && c[1] > c[2] * 1.3 && mx - mn > 18)) return c; const l = (c[0] * .3 + c[1] * .59 + c[2] * .11) / 92; return [Math.min(255, t[0] * l), Math.min(255, t[1] * l), Math.min(255, t[2] * l), c[3]]; };
    sprite("book-" + name, furni("s_glukko_book3", undefined, { tint }), 1, 1); index.books.push(name);
}
sprite("ledger", furni("s_glukko_book2"), 1, 1);
/* other furniture */
sprite("globe", furni("s_exe_globe"), 1, 1);
sprite("chair4", furni("s_glukko_chair", 4), 1, 1);
sprite("chair6", furni("s_glukko_chair", 6), 1, 1);
sprite("stool", furni("s_glukko_stool"), 1, 1);
sprite("crate", furni("s_glukko_crate"), 1, 1);
sprite("barrel", furni("s_glukko_barrel"), 1, 1);
sprite("cupboard", furni("s_glukko_cupboard"), 2, 1);
sprite("candelabra", furni("s_gothiccandelabra"), 1, 1);
/* the Library's lamp and rug */
save("lamp", lib("lamp_a_0_0_0")); save("lampglow", lib("lamp_b_0_0_0"));
const BG = lib("library_backround");
{
    const rx = 53, ry = 27, cx = 464, cy = 147, im = blank(rx * 2 + 1, ry * 2 + 1);
    for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) { const s = ((cy + j) * BG.w + cx + i) * 4, t = ((j + ry) * im.w + i + rx) * 4; BG.d.copy(im.d, t, s, s + 4); }
    save("rug-round", im);
    /* a patch of the slate floor, sampled by the page */
    const sl = blank(64, 32); for (let y = 0; y < 32; y++) BG.d.copy(sl.d, y * 64 * 4, ((215 + y - 16) * BG.w + 340 - 32) * 4, ((215 + y - 16) * BG.w + 340 + 32) * 4);
    save("slate", sl);
}
/* the stained glass, shortened to fit the wall: for the left wall as drawn, mirrored for the right */
{
    const LM = lib("left_mask"), X0 = 33, X1 = 55, TALL = 74, tops = {}; let y0 = 1e9;
    const glassy = (r, g, b) => g > r + 12 || b > r + 12;
    for (let x = X0; x < X1; x++) for (let y = 0; y < LM.h; y++) { const p = (y * LM.w + x) * 4; if (LM.d[p + 3] && glassy(LM.d[p], LM.d[p + 1], LM.d[p + 2])) { tops[x] = y; y0 = Math.min(y0, y); break; } }
    const xs = Object.keys(tops).map(Number), w = xs[xs.length - 1] - xs[0] + 1, im = blank(w, TALL + w + 8);
    for (const x of xs) { const end = y0 + TALL - Math.floor((x - xs[0]) / 2); for (let y = tops[x] - 2; y < end + 3; y++) { if (y < 0) continue; const p = (y * LM.w + x) * 4; if (!LM.d[p + 3]) continue; const q = ((y - y0 + 2) * w + x - xs[0]) * 4; if (y >= end) { im.d[q] = 96; im.d[q + 1] = 92; im.d[q + 2] = 84; } else { im.d[q] = LM.d[p]; im.d[q + 1] = LM.d[p + 1]; im.d[q + 2] = LM.d[p + 2]; } im.d[q + 3] = 255; } }
    save("window-l", im);
    const m = blank(im.w, im.h); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) im.d.copy(m.d, (y * m.w + m.w - 1 - x) * 4, (y * im.w + x) * 4, (y * im.w + x) * 4 + 4);
    save("window-r", m);
    index.window = { w: im.w, h: im.h };
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
console.log("room art:", Object.keys(index.sprites).length, "pieces");
