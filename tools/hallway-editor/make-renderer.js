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
    ["edge-items.js", "render/edge-items.js"], ["rope-barrier.js", "render/rope-barrier.js"], ["garland.js", "render/garland.js"], ["iso3d.js", "ideas/iso3d.js"], ["hall-window.js", "render/hall-window.js"], ["furni-parts.js", "furni-parts.js"], ["wall-items.js", "wall-items.js"], ["png-decode.js", "../png-decode.js"]
];
/* Pictures kept in art/ that are only working notes (9 Nov scan, build 5): an alignment guide, and the source a generator
   reads (make-ideas-art.js draws the arcade stool from arcade-stool.png). Neither is published nor fetched by the renderer */
const SCRATCH = new Set(["arcade-stool.png"]);
const isScratch = rel => /alignment/i.test(rel.split("/").pop()) || SCRATCH.has(rel);
/* Only what the renderer reads (9 Nov scan, build 3: it was everything in art/, theatre audio and room pictures too, fetched by
   every thread). Found by drawing the whole real map in every light with the file reads logged: render/hw.js's hall/ pieces,
   regs.json and fontdump.html, render/hw2.js's av/ and tele/, render/hw3.js's wall/, render/floor-lamps.js's lamps/. A file
   it reads that isn't here stops the Warren's editor with "No such file", so a new folder the renderer reads goes in here */
const RENDERER_ART = ["hall", "wall", "tele", "av", "lamps", "lift", "signs", "regs.json", "fontdump.html"];      // lift/: his lift corrections; signs/: his sign poles (14 Nov 2026; left out at first, so the browser drew the old arm)
function listArt(dir, base = "") {
    const out = [];
    for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
        const rel = base ? base + "/" + e.name : e.name;
        if (e.isDirectory()) out.push(...listArt(dir, rel)); else if (!isScratch(rel)) out.push(rel);
    }
    return out;
}
function make(outFile) {
    const art = listArt(path.join(HERE, "art")).filter(f => RENDERER_ART.includes(f.split("/")[0]));
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
module.exports = { make, isScratch };
