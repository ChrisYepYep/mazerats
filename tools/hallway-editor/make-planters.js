/* The planter variants: the client's own planter (hw_ero1-5), pixel for pixel, with its colours swapped, so they're the same art in other materials.
   Written beside the client's pieces as hwv_<variant><n>_a_0_0_0.png, with their registration points copied in art/regs.json.
   Run again if the colours change: node tools/hallway-editor/make-planters.js */
"use strict";
const fs = require("fs"), path = require("path");
const { readPng } = require("../png-decode.js"), { encodePng } = require("../png-encode.js");
const DIR = path.join(__dirname, "art/hall/hh_room_hallway"), REGS = path.join(__dirname, "art/regs.json");
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
/* the client's colours: the trough, darkest first, then the leaves */
const TROUGH = ["330000", "7e250a", "c36233", "e8b964"], LEAF = ["4e5433", "808d40", "9cab47", "b4c469"];
const swap = (from, to) => from.reduce((m, f, i) => (m[f] = to[i], m), {});
const VARIANTS = {
    stone: { ...swap(TROUGH, ["2e2e32", "66625e", "a09c94", "d8d4c8"]) },
    walnut: { ...swap(TROUGH, ["1e0e06", "4a2610", "7a4a24", "b08850"]) },
    evergreen: { ...swap(LEAF, ["1e3a24", "2f5e34", "3f7c40", "63a054"]) },
    /* flowers among the leaves: only on the lightest leaf pixels, so they sit on top as the leaves' highlights do */
    flower: { flowers: true }
};
const regs = JSON.parse(fs.readFileSync(REGS, "utf8"));
const toHex = (d, i) => [0, 1, 2].map(j => d[i + j].toString(16).padStart(2, "0")).join("");
for (const [name, map] of Object.entries(VARIANTS)) for (let n = 1; n <= 5; n++) {
    const src = `hw_ero${n}_a_0_0_0`, im = readPng(path.join(DIR, src + ".png")), o = Buffer.from(im.rgba);
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
        const i = (y * im.w + x) * 4; if (o[i + 3] < 128) continue;
        const c = toHex(o, i); let to = map[c];
        if (map.flowers && c === "b4c469") { const s = Math.sin((x + n * 37) * 12.9898 + y * 78.233) * 43758.5453, f = s - Math.floor(s); to = f > .55 ? (f > .8 ? "f0d060" : "d0343c") : undefined; }
        if (to) { const v = hex(to); o[i] = v[0]; o[i + 1] = v[1]; o[i + 2] = v[2]; }
    }
    const to = `hwv_${name}${n}_a_0_0_0`;
    fs.writeFileSync(path.join(DIR, to + ".png"), encodePng(im.w, im.h, o));
    regs.hall[to] = regs.hall[src];
}
fs.writeFileSync(REGS, JSON.stringify(regs));
console.log("done");
