/* Makes art/thumbs/*.png for the editor's library, cropped from the real drawing of the map.
   Run again if the art changes: node tools/hallway-editor/make-thumbs.js */
"use strict";
const fs = require("fs"), path = require("path");
const W = require("./render/hw3.js");
const { encodePng } = require("../png-encode.js");
const OUT = path.join(__dirname, "art/thumbs"); fs.mkdirSync(OUT, { recursive: true });
const map = JSON.parse(fs.readFileSync(path.join(__dirname, "map.json"), "utf8"));
const names = W.H.names2();
const shot = (name, x, y, z, size) => {
    const s = size || 64, w = W.build({ map, names, clip: [x, y, z, s, s] }), c = w.at(x, y, z);
    const v = w.b.crop(c[0] - s / 2, c[1] - s / 2, s, s);
    fs.writeFileSync(path.join(OUT, name + ".png"), encodePng(s, s, v.d));
};
shot("floor", 60, 16, 0);
shot("rug", 8, 26, 0, 64);
shot("crest", 104, 16, 0);
shot("door", 31, -6, 36);
shot("sconce", 35, -6, 106);
shot("lift", 3.5, 0, 60, 96);
shot("stair", 17, -3, 50, 96);
shot("turn", 61, -3, 60, 96);
shot("side", 87, -3, 50, 96);
shot("lamp", 36.5, -3.5, 34, 80);
console.log(fs.readdirSync(OUT).join(" "));
