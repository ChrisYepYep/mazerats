/* Builds the game's furni library out of the Habbo Origins client.
   Writes assets/furni/*.png and js/furni-library.js.

   ----------------------------------------------------------------------
   WHY THIS EXISTS

   Fallin' Furni used FurniIndex's ready-made PNGs for artwork while taking
   geometry from the client, and the seam between the two is where every
   alignment bug in this game has come from. FurniIndex publish one image per
   bitmap the client draws, in their own order; the client thinks in
   DIRECTIONS. Nothing states how one maps onto the other, so the game had to
   guess, and a wrong guess puts a mirrored anchor on an unmirrored picture.

   Composing the sprites here removes the guess. Direction, anchor, footprint
   and pixels all come out of the same pass, so they cannot disagree.

   ----------------------------------------------------------------------
   HOW A FURNI IS PUT TOGETHER, ALL OF IT VERIFIED AGAINST THE REAL ARTWORK

   Members are named <class>_<part>_<f1>_<xdim>_<ydim>_<direction>_<state>.
   Each carries a registration point, and a part's top-left in the furni's own
   coordinate space is (-regX, -regY). Lay the parts of one direction and state
   out that way, union their boxes, and that is the whole sprite.

     LAYER ORDER is the part letter, ascending. divider_arm3 has parts a, b
     and c: a+b+c reproduces the published gate with 4,430 pixels identical,
     no wrong colours and no difference in coverage. Reversing the order
     misplaces 588 pixels, so this is not a coincidence.

     COLOUR comes from each member's own CLUT, read in FILE order — see the
     note on readClut in cct-extract.js. Read backwards, every colour is
     wrong; forwards, chair_polyfon matches the published chair exactly.

     INDEX 0 IS TRANSPARENT throughout these casts.

   ----------------------------------------------------------------------
   WHAT IS DELIBERATELY LEFT OUT

   `_sd` members are drop shadows the client composites separately, and
   one-pixel members are placeholders for states that draw nothing — they
   carry no picture but would drag the union box across the room.

   COLOUR VARIANTS ("chair_polyfon*2") share one set of bitmaps and differ by
   palette. The variants are not generated here; a starred class falls back to
   its base artwork, which is what the game did before. Doing them properly
   means reading each class's .props member, and that is its own job.

   usage: node tools/furni-extract.js [--out assets/furni] [--limit N]
*/

const fs = require("fs");
const path = require("path");

const { openCast, readMember, unpackBits, readClut } = require("./cct-extract.js");
const { encodePng } = require("./png-encode.js");

const CLIENT = process.env.HABBO_CLIENT ||
    "C:\\Users\\cjboy\\AppData\\Roaming\\Habbo Launcher\\downloads\\shockwave\\350";

const MEMBER = /^(.+)_([a-z])_(\d+)_(\d+)_(\d+)_(\d+)_(\d+)$/;

function parseName(name) {
    const m = MEMBER.exec(name);
    if (!m) return null;
    return {
        className: m[1], part: m[2],
        xdim: Number(m[4]), ydim: Number(m[5]),
        direction: Number(m[6]), state: Number(m[7])
    };
}

function main() {
    const argv = process.argv.slice(2);
    const outArg = argv.indexOf("--out");
    const OUT = outArg > -1 ? argv[outArg + 1] : path.join(__dirname, "..", "assets", "furni");
    const limArg = argv.indexOf("--limit");
    const LIMIT = limArg > -1 ? Number(argv[limArg + 1]) : Infinity;

    fs.mkdirSync(OUT, { recursive: true });

    const files = fs.readdirSync(CLIENT)
        .filter(f => /^hh_furni.*\.cct$/i.test(f))
        .filter(f => !/_50\.cct$/i.test(f) && !/_small\.cct$/i.test(f));

    const library = {};
    let sprites = 0, stubs = 0, skipped = 0, bytes = 0, trueColour = 0, noPalette = 0, unreadable = [];

    for (const file of files) {
        let cast;
        try { cast = openCast(path.join(CLIENT, file)); }
        catch (e) { unreadable.push(`${file}: ${e.message}`); continue; }

        // Index this cast's members once, then group them into sprites.
        const groups = new Map();   // class|state|dir -> [{part, ...}]
        const clutCache = new Map();

        const paletteFor = (memberNum) => {
            if (memberNum === null || memberNum === undefined || memberNum < 0) return null;
            if (clutCache.has(memberNum)) return clutCache.get(memberNum);
            let pal = null;
            const owner = cast.castTable[memberNum - 1];
            if (owner !== undefined) {
                const cid = cast.childOf.get(`${owner}:CLUT`);
                if (cid !== undefined) {
                    try { pal = readClut(cast.chunk(cast.byId.get(cid)), { reverse: false }); }
                    catch { pal = null; }
                }
            }
            clutCache.set(memberNum, pal);
            return pal;
        };

        for (const e of cast.res.filter(x => x.tag === "CASt")) {
            const m = readMember(cast.chunk(e));
            if (!m || !m.name || !m.bitmap) continue;
            const p = parseName(m.name);
            if (!p) { skipped++; continue; }
            const { w, h } = m.bitmap;
            if (w <= 1 && h <= 1) { stubs++; continue; }
            if (w <= 0 || h <= 0) { stubs++; continue; }

            const key = `${p.className}|${p.state}|${p.direction}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ id: e.id, meta: p, bmp: m.bitmap });
        }

        for (const [key, parts] of groups) {
            if (sprites >= LIMIT) break;
            const [className, state, dir] = key.split("|");

            // Alphabetical: the order the client draws them in.
            parts.sort((a, b) => a.meta.part < b.meta.part ? -1 : 1);

            // Decode every layer first — a layer that will not decode must not
            // leave a half-drawn sprite behind.
            const layers = [];
            let bad = false;
            for (const part of parts) {
                const { pitch, w, h, paletteMember, regX, regY, bitDepth } = part.bmp;
                const bitdId = cast.childOf.get(`${part.id}:BITD`);
                if (bitdId === undefined) { bad = true; break; }
                let bytes;
                try {
                    const raw = cast.chunk(cast.byId.get(bitdId));
                    bytes = raw.length === pitch * h ? raw : unpackBits(raw, pitch * h);
                } catch { bad = true; break; }
                if (!bytes || bytes.length < pitch * h) { bad = true; break; }
                if (bitDepth !== 8 && bitDepth !== 32) { bad = true; break; }
                const pal = bitDepth === 8 ? paletteFor(paletteMember) : null;
                /* An 8-bit layer whose palette will not resolve has no colours
                   at all, and inventing them produces a flat magenta furni —
                   worse than not shipping it, because the game would use it.
                   Dropping the sprite leaves no library entry, and the renderer
                   falls back to its old artwork for that class alone. 66 of
                   1,318 classes end up here: they name a built-in palette the
                   .cct files do not contain, and the built-ins could not be
                   recovered from the artwork because the furni using them are
                   themselves recolours. */
                if (bitDepth === 8 && !pal) { bad = true; noPalette++; break; }
                layers.push({ pitch, w, h, regX, regY, bytes, bitDepth, pal });
                if (bitDepth === 32) trueColour++;
            }
            if (bad || !layers.length) { skipped++; continue; }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const l of layers) {
                minX = Math.min(minX, -l.regX); minY = Math.min(minY, -l.regY);
                maxX = Math.max(maxX, -l.regX + l.w); maxY = Math.max(maxY, -l.regY + l.h);
            }
            const W = maxX - minX, H = maxY - minY;
            // A sprite wider than the room is a broken record, not a furni.
            if (W <= 0 || H <= 0 || W > 1200 || H > 1200) { skipped++; continue; }

            /* Two bitmap formats, both verified pixel-exact against the same
               furni as FurniIndex publish it:

               8-BIT   palette indices, index 0 transparent.

               32-BIT  true colour, and each ROW is stored as four byte-planes
                       — all the alpha bytes, then all red, then green, then
                       blue — not as interleaved pixels. The alpha plane is not
                       what makes a furni transparent: these members are drawn
                       with Director's ink 36, "background transparent" (it is
                       right there in the class's .props), and the background
                       is white. So pure white is the hole. */
            const rgba = Buffer.alloc(W * H * 4);
            for (const l of layers) {
                const ox = -l.regX - minX, oy = -l.regY - minY;
                for (let y = 0; y < l.h; y++) {
                    const row = y * l.pitch;
                    for (let x = 0; x < l.w; x++) {
                        let r, g, b;
                        if (l.bitDepth === 8) {
                            const v = l.bytes[row + x];
                            if (v === 0) continue;
                            const c = l.pal[v];
                            if (!c) continue;
                            r = c[0]; g = c[1]; b = c[2];
                        } else {
                            r = l.bytes[row + l.w + x];
                            g = l.bytes[row + 2 * l.w + x];
                            b = l.bytes[row + 3 * l.w + x];
                            if (r === 255 && g === 255 && b === 255) continue;
                        }
                        const d = ((y + oy) * W + (x + ox)) * 4;
                        rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = 255;
                    }
                }
            }

            const png = encodePng(W, H, rgba);
            const fileName = `${className}_${state}_${dir}.png`;
            fs.writeFileSync(path.join(OUT, fileName), png);
            bytes += png.length;
            sprites++;

            const rec = library[className] || (library[className] = {
                x: parts[0].meta.xdim, y: parts[0].meta.ydim, s: {}
            });
            const st = rec.s[state] || (rec.s[state] = {});
            st[dir] = { w: W, h: H, ax: -minX, ay: -minY };
        }
    }

    const classes = Object.keys(library).length;
    const js = `/* GENERATED by tools/furni-extract.js — do not hand-edit.

   The game's furni, composed from the Habbo Origins client itself. See the
   tool for how a sprite is put together and how each step was checked against
   the real artwork.

     FurniLibrary[className] = {
        x, y   footprint in tiles at direction 0, as the client's own member
               names give it
        s      { state: { direction: { w, h, ax, ay } } }
     }

   ax,ay is where the furni's origin sits INSIDE its sprite. The origin is the
   west vertex of the piece's own tile — see js/room-furni.js, which also owns
   the rule for what a mirrored direction does to that anchor.

   Artwork is assets/furni/<className>_<state>_<direction>.png.

   ${classes} classes, ${sprites} sprites. */
(function () {
    "use strict";
    window.FurniLibrary = ${JSON.stringify(library)};
})();
`;
    const jsPath = path.join(__dirname, "..", "js", "furni-library.js");
    fs.writeFileSync(jsPath, js);

    console.log(`composed ${sprites} sprites across ${classes} classes`);
    console.log(`  ${trueColour} layers were 32-bit true colour, the rest palette-indexed`);
    console.log(`  ${stubs} one-pixel placeholders and ${skipped} unusable members skipped`);
    console.log(`  ${noPalette} sprites dropped for an unresolvable palette (the game keeps its old art for those)`);
    if (unreadable.length) {
        console.log(`  could not open ${unreadable.length} cast file(s):`);
        for (const u of unreadable) console.log(`    ${u}`);
    }
    console.log(`  artwork ${(bytes / 1048576).toFixed(1)} MB -> ${OUT}`);
    console.log(`  index ${(js.length / 1024).toFixed(0)} KB -> ${jsPath}`);
}

if (require.main === module) main();
