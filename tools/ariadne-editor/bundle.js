/* Ariadne's Thread: the levels, all in one file for the game (14 Oct 2026).

   The master copy of each passage is its own file in assets/ariadne-levels/
   (mine-1.json and so on), written by the level editor; index.json there
   lists the zones in order, with their passages. The game loads one script,
   js/rat-race-levels.js, so this puts them all in it. The editor's server
   runs it after every save; it can be run by hand too:

       node tools/ariadne-editor/bundle.js

   Also here: format(), how a level file is laid out, one row of the map to
   a line and one object to a line, so a change shows in a diff as the line
   it changed. */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const LEVELS = path.join(ROOT, "assets", "ariadne-levels");
const OUT = path.join(ROOT, "js", "rat-race-levels.js");

// A level as text: its rows, its settings and its objects each on a line of their own.
function format(spec) {
    const out = ["{"];
    const keys = Object.keys(spec);
    keys.forEach((k, i) => {
        const v = spec[k], last = i === keys.length - 1, comma = last ? "" : ",";
        if (Array.isArray(v) && (k === "tiles" || k === "back" || k === "water" || k === "dark" || k === "rails" || k === "objects")) {
            if (!v.length) { out.push(`  ${JSON.stringify(k)}: []${comma}`); return; }
            out.push(`  ${JSON.stringify(k)}: [`);
            v.forEach((row, j) => out.push(`    ${JSON.stringify(row)}${j === v.length - 1 ? "" : ","}`));
            out.push(`  ]${comma}`);
        } else out.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`);
    });
    out.push("}");
    return out.join("\n") + "\n";
}

function readIndex() {
    return JSON.parse(fs.readFileSync(path.join(LEVELS, "index.json"), "utf8"));
}

function build() {
    const index = readIndex();
    const zones = index.zones.map(z => {
        const acts = z.passages.map(id => {
            const spec = JSON.parse(fs.readFileSync(path.join(LEVELS, id + ".json"), "utf8"));
            spec.id = id;
            return spec;
        });
        const zone = { name: z.name, music: z.music, theme: z.theme, acts };
        if (z.secret) zone.secret = true;
        if (z.lab) zone.lab = true;   // (14 Oct 2026) a new zone on trial: in the level select, not in a run
        return zone;
    });
    const head = `/* Ariadne's Thread: every passage, for the game. WRITTEN BY THE LEVEL
   EDITOR (tools/ariadne-editor) from assets/ariadne-levels/*.json each time
   it saves: change those, with the editor, not this. See js/rat-race.js
   (THE LEVELS AS DATA) for what a passage holds. */
`;
    // one passage to a line: the file stays readable at a glance, and small
    const body = zones.map(z => {
        const { acts, ...meta } = z;
        return `        Object.assign(${JSON.stringify(meta)}, { acts: [\n${acts.map(a => "            " + JSON.stringify(a)).join(",\n")}\n        ] })`;
    }).join(",\n");
    const text = `${head}(function () {\n    "use strict";\n    window.RatLevels = {\n        zones: [\n${body}\n        ]\n    };\n})();\n`;
    fs.writeFileSync(OUT, text);
    return { zones: zones.length, passages: zones.reduce((n, z) => n + z.acts.length, 0), bytes: Buffer.byteLength(text) };
}

module.exports = { build, format, readIndex, LEVELS, ROOT };

if (require.main === module) {
    const r = build();
    console.log(`js/rat-race-levels.js: ${r.zones} zones, ${r.passages} passages, ${Math.round(r.bytes / 1024)} KB`);
}
