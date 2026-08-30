/* Generates the two overlay sprites the photo frame uses to say it can be
   handled — corner brackets and a magnifier badge.
   Run with: node tools/photo-affordances.js

   Kept as a script rather than hand-drawn binaries because both are exact
   geometry against a known box: the frame's photo window is 159x115 at
   offset 8,19 inside assets/img/stickies-photos/photo-frame.png, and the
   brackets have to land on its corners to the pixel. Re-run it if the window
   ever changes size.

   Both are drawn only in colours photo-frame.png already uses — #ffffff and
   #000000 — so nothing new enters the frame's six-colour palette. The white
   carries a black keyline because these sit over photographs, which can be
   any brightness at all. */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---------- minimal RGBA PNG encoder ----------
function crc32(buf) {
    let table = crc32.table;
    if (!table) {
        table = crc32.table = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, data) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const raw = Buffer.alloc(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0;
        data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

// ---------- drawing ----------
const canvas = (w, h) => ({ w, h, d: Buffer.alloc(w * h * 4) });
function put(c, x, y, rgba) {
    if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
    const o = (y * c.w + x) * 4;
    c.d[o] = rgba[0]; c.d[o + 1] = rgba[1]; c.d[o + 2] = rgba[2]; c.d[o + 3] = rgba[3];
}
const WHITE = [255, 255, 255, 255];
const KEY = [0, 0, 0, 130];      // keyline: dark but not solid, so it reads as a shadow

/* Corner brackets, sized to the photo window exactly. Each is an L of two
   8px arms with a keyline on its inner side — the mark that says "this is a
   viewport and what is inside it moves". */
const BOX_W = 159, BOX_H = 115, ARM = 8, INSET = 2;
function brackets() {
    const c = canvas(BOX_W, BOX_H);
    const corners = [
        [INSET, INSET, 1, 1],
        [BOX_W - 1 - INSET, INSET, -1, 1],
        [INSET, BOX_H - 1 - INSET, 1, -1],
        [BOX_W - 1 - INSET, BOX_H - 1 - INSET, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
        for (let i = 0; i < ARM; i++) {
            put(c, cx + dx * i, cy + dy, KEY);
            put(c, cx + dx, cy + dy * i, KEY);
        }
        for (let i = 0; i < ARM; i++) {
            put(c, cx + dx * i, cy, WHITE);
            put(c, cx, cy + dy * i, WHITE);
        }
    }
    return c;
}

/* A magnifier badge for the window's bottom-right: there is more here than
   fits. Drawn a touch larger than looks right in isolation, because at
   1:1 on a busy photograph a smaller one disappears. */
const MAG = [
    "..KKKK....",
    ".KWWWWK...",
    "KWWKKWWK..",
    "KWKKKKWK..",
    "KWKKKKWK..",
    "KWWKKWWK..",
    ".KWWWWKK..",
    "..KKKKWK..",
    "......KWK.",
    ".......KWK",
    "........KK",
];
function magnifier() {
    const c = canvas(MAG[0].length, MAG.length);
    const tone = { K: [0, 0, 0, 210], W: WHITE };
    MAG.forEach((row, y) => [...row].forEach((ch, x) => {
        if (tone[ch]) put(c, x, y, tone[ch]);
    }));
    return c;
}

const OUT = path.join(__dirname, "..", "assets", "img", "stickies-photos");
for (const [name, c] of [["photo-brackets", brackets()], ["photo-magnifier", magnifier()]]) {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, encodePng(c.w, c.h, c.d));
    console.log("wrote " + name + ".png  " + c.w + "x" + c.h);
}
