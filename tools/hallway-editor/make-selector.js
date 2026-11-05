/* Makes art/tile-selector.png from the client's own hollow tile cursor, recoloured.
   Run once: node tools/hallway-editor/make-selector.js */
"use strict";
const fs = require("fs"), path = require("path");
const { readPng } = require("../png-decode.js"), { encodePng } = require("../png-encode.js");
const BROWN = [0x4a, 0x24, 0x10];
const im = readPng(path.join(__dirname, "art/hall/hh_room_hallway/hiliter_pub.png"));
const o = Buffer.from(im.rgba);
for (let i = 0; i < o.length; i += 4) { if (o[i + 3] > 128) { o[i] = BROWN[0]; o[i + 1] = BROWN[1]; o[i + 2] = BROWN[2]; o[i + 3] = 255; } else o[i + 3] = 0; }
fs.writeFileSync(path.join(__dirname, "art/tile-selector.png"), encodePng(im.w, im.h, o));
console.log("tile-selector.png", im.w, im.h);
