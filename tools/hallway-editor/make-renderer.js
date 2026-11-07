/* Makes the renderer run in a browser, for the editor in the Warren: renderer-worker.js, which is the very same
   drawing code as the local editor's (render/hw*.js and the rest), wrapped in small stand-ins for the few things of
   Node's that it touches. Nothing is translated or redrawn by hand, so what it draws is what the local editor draws.

   The stand-ins: a Buffer that's a Uint8Array with the few extras the code uses, and a file system that's the art,
   fetched and unpacked before any of the drawing code starts, since all of that code reads its files without waiting. */
"use strict";
const fs = require("fs"), path = require("path");
const HERE = __dirname;
/* what's bundled, and where each thinks it lives */
const MODULES = [
    ["hw.js", "render/hw.js"], ["hw2.js", "render/hw2.js"], ["hw3.js", "render/hw3.js"], ["floor-lamps.js", "render/floor-lamps.js"],
    ["edge-items.js", "render/edge-items.js"], ["rope-barrier.js", "render/rope-barrier.js"], ["iso3d.js", "ideas/iso3d.js"], ["hall-window.js", "render/hall-window.js"], ["furni-parts.js", "furni-parts.js"], ["wall-items.js", "wall-items.js"], ["png-decode.js", "../png-decode.js"]
];
function listArt(dir, base = "") {
    const out = [];
    for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
        const rel = base ? base + "/" + e.name : e.name;
        if (e.isDirectory()) out.push(...listArt(dir, rel)); else out.push(rel);
    }
    return out;
}
function make(outFile) {
    const art = listArt(path.join(HERE, "art"));
    /* The browser asks for every one of these by address, and one it can't get stops the whole editor: netlify dev won't serve a # in a name */
    const awkward = art.filter(f => !/^[\w ./()-]+$/.test(f)); if (awkward.length) throw new Error("Art with a name a web server may not serve: " + awkward.join(", "));
    let js = `/* Made by tools/hallway-editor/make-renderer.js. Don't edit it here. */\n"use strict";\nconst ART_FILES = ${JSON.stringify(art)};\n`;
    js += fs.readFileSync(path.join(HERE, "renderer-shims.js"), "utf8") + "\n";
    for (const [name, file] of MODULES) {
        const dir = path.posix.dirname("/site/tools/hallway-editor/" + file);
        const src = fs.readFileSync(path.join(HERE, file), "utf8").replace(/^﻿/, "");
        js += `MODULES[${JSON.stringify(name)}] = { dir: ${JSON.stringify(path.posix.normalize(dir))}, run: function (module, exports, require, __dirname) {\n${src}\n} };\n`;
    }
    js += fs.readFileSync(path.join(HERE, "renderer-jobs.js"), "utf8") + "\n";
    fs.writeFileSync(outFile, js);
}
if (require.main === module) make(process.argv[2] || path.join(HERE, "renderer-worker.js"));
module.exports = { make };
