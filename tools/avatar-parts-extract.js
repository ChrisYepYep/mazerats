/* Avatar parts the imaging service will not draw, pulled out of the Origins
   client so the game can draw them itself.

   ----------------------------------------------------------------------
   Why any of this is needed

   habbo.com's imaging service runs on the MODERN hotel's figure data, and it
   renders an Origins eye accessory for head directions 0, 1, 3, 5 and 6 while
   silently dropping it at 2 and 4. (7 is the back of the head, where there is
   no face and correctly no glasses.) So a habbo in sunglasses loses them for
   two headings out of eight, and no request parameter brings them back.

   Turning the head to a direction that works is a workaround, not a fix — the
   head should be able to face wherever the body is going. So the two missing
   directions are composited from the client's own part bitmaps.

   ----------------------------------------------------------------------
   Where the parts go on the figure, which is measured and not guessed

   Diffing the service's own output against the same figure with the `ea`
   component removed gives the exact box it draws the glasses in. Doing that
   for every direction it DOES render gives a rule that fits all of them with
   no error at all — in the 64x110 figure (the service returns 128x220, which
   is double):

       topLeft = ( -regX , 100 - regY )

   where regX/regY are the part bitmap's own registration point out of the
   cast. Checked against directions 0, 1, 3, 5 and 6: every predicted box
   matches the observed one exactly, and all five agree the figure's origin
   sits at (0, 100).

   MIRRORING is confirmed the same way. The cast stores directions 0..3 only;
   4, 5 and 6 are the mirror images of 2, 1 and 0 about the north-south axis,
   and a mirrored part lands at x' = 64 - x - width. Against the service:
   head 1 sits at x=26 and head 5 at x=19, and 64-26-19 = 19; head 0 at x=37
   and head 6 at x=16, and 64-37-11 = 16. Both exact. Direction 4 is therefore
   direction 2 mirrored, which is the other half of the fix. */

const fs = require("fs");
const path = require("path");
const { openCast, readMember, unpackBits } = require("./cct-extract.js");
const { encodePng } = require("./png-encode.js");

const CLIENT = "C:/Users/cjboy/AppData/Roaming/Habbo Launcher/downloads/shockwave/350/";

/* Only the directions the service drops need shipping. Direction 4 is not
   listed because it is direction 2 flipped, done at runtime. */
const WANTED_DIRECTIONS = [2];

function figureColours(xml, paletteId) {
    const block = xml.split(`<palette id="${paletteId}"`)[1];
    if (!block) return {};
    const end = block.indexOf("</palette>");
    const body = end === -1 ? block : block.slice(0, end);
    const out = {};
    for (const m of body.matchAll(/<color id="(\d+)"[^>]*>([0-9A-Fa-f]{6})</g)) {
        out[m[1]] = "#" + m[2].toLowerCase();
    }
    return out;
}

/* figuredata maps a SET id (what appears in a figure string) to the PART id
   the bitmaps are named after — <set id="1401"> contains <part id="1">. */
function setToPart(xml, type) {
    const block = xml.match(new RegExp(`<settype type="${type}"[\\s\\S]*?</settype>`));
    if (!block) return {};
    const out = {};
    for (const s of block[0].matchAll(/<set id="(\d+)"[^>]*>([\s\S]*?)<\/set>/g)) {
        const p = s[2].match(new RegExp(`<part id="(\\d+)" type="${type}"`));
        if (p) out[s[1]] = Number(p[1]);
    }
    return out;
}

function extractType(type, castFile, outDir) {
    const cast = openCast(CLIENT + castFile);
    const members = [];
    for (const e of cast.res.filter(x => x.tag === "CASt")) {
        const m = readMember(cast.chunk(e));
        if (m && m.name && m.bitmap) members.push({ id: e.id, ...m });
    }
    const byName = new Map(members.map(m => [m.name, m]));

    const parts = {};
    for (const m of members) {
        const hit = m.name.match(new RegExp(`^h_std_${type}_(\\d+)_(\\d)_0$`));
        if (!hit) continue;
        const partId = Number(hit[1]), dir = Number(hit[2]);
        if (!WANTED_DIRECTIONS.includes(dir)) continue;

        const bid = cast.childOf.get(`${m.id}:BITD`);
        const raw = cast.chunk(cast.byId.get(bid));
        const { pitch, w, h, regX, regY } = m.bitmap;
        if (!raw.length || w <= 0 || h <= 0) continue;
        const idx = raw.length === pitch * h ? raw : unpackBits(raw, pitch * h);

        // Index map, same convention as the room stencils: index in RGB,
        // alpha 0 where the pixel is a hole.
        const rgba = Buffer.alloc(w * h * 4);
        const inks = new Set();
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const v = idx[y * pitch + x];
                if (!v) continue;
                inks.add(v);
                const o = (y * w + x) * 4;
                rgba[o] = rgba[o + 1] = rgba[o + 2] = v;
                rgba[o + 3] = 255;
            }
        }
        const file = `${type}-${partId}-${dir}`;
        fs.writeFileSync(path.join(outDir, file + ".png"), encodePng(w, h, rgba));
        (parts[partId] = parts[partId] || {})[dir] = {
            file, w, h, regX, regY, inks: [...inks].sort((a, b) => a - b)
        };
    }
    return parts;
}

if (require.main === module) {
    const outDir = path.join(__dirname, "..", "assets", "avatar");
    fs.mkdirSync(outDir, { recursive: true });

    const xml = fs.readFileSync(CLIENT + "figuredata.xml", "utf8");
    const parts = extractType("ea", "hh_human_acc_eye.cct", outDir);
    const sets = setToPart(xml, "ea");
    const colours = figureColours(xml, 3);

    const js = `/* Avatar parts the imaging service drops, and where they go.

   GENERATED by tools/avatar-parts-extract.js — do not hand-edit.

   \`sets\` maps a figure-string set id (ea-1401-…) to the part id its bitmaps
   are named after. \`parts\` gives each part's size and registration point;
   the placement rule is topLeft = (-regX, 100 - regY) in the 64x110 figure,
   established by diffing the service's own renders. \`colours\` is figuredata
   palette 3, for the colour id in the figure string. */
(function () {
    "use strict";
    window.AvatarParts = ${JSON.stringify({ sets, parts, colours }, null, 4)};
})();
`;
    const outFile = path.join(__dirname, "..", "js", "avatar-parts.js");
    fs.writeFileSync(outFile, js);

    console.log(`ea sets: ${Object.keys(sets).length}  parts: ${Object.keys(parts).length}  palette-3 colours: ${Object.keys(colours).length}`);
    for (const [pid, dirs] of Object.entries(parts)) {
        for (const [d, p] of Object.entries(dirs)) {
            console.log(`  part ${pid} dir ${d}: ${p.w}x${p.h} reg (${p.regX},${p.regY}) -> topLeft (${-p.regX}, ${100 - p.regY})  inks ${p.inks.join(",")}`);
        }
    }
    console.log(`wrote ${outFile}`);
}
