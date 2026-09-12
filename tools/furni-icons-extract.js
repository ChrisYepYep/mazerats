/* Builds the level builder's furni icons out of the Habbo Origins client.
   Writes assets/furni-icons/<className>.png.

   ----------------------------------------------------------------------
   WHY THIS EXISTS

   The builder's furni picker drew its icons straight from FurniIndex, one
   <img> per row pointing at their server. That was fine while the list was
   capped at 24 and untenable the moment the cap came off: the panel's default
   state is an empty query, which now matches 1,101 furni, so every redraw of
   that panel asked another site for a thousand pictures.

   The client has them already. `hh_furni_small.cct` and its neighbours ship
   `<class>_small` — the catalogue thumbnail, the little picture Habbo's own
   catalogue showed. 1,461 of them, averaging 24x27, which is almost exactly
   the 22x22 the picker draws. They cover 1,085 of the picker's 1,101 rows.

   furni-extract.js deliberately leaves these out and should keep doing so:
   they are not room artwork, they are not in parts, and nothing in a room
   ever draws one. They are exactly right for a list of things to choose from.

   ----------------------------------------------------------------------
   MOSTLY ONE ICON PER CLASS, NOT PER COLOURWAY

   The catalogue sells `chair_plasto` in eight colours and the client ships
   ONE thumbnail for it, so all eight rows share an icon. That is a real
   difference from FurniIndex, whose icons are per colourway, and it cannot be
   fixed by tinting: partcolors apply one colour PER PART, and a thumbnail is
   already flattened, so there is no way to tell which pixels are part `a`.
   Tinting the lot with the first colour would be wrong for anything with more
   than one part.

   The colour is in the name — "Deep Moss Chair", "Forest Green Chair" — so
   the row still says which one it is.

   Some classes DO carry a thumbnail per colourway, named with the catalogue's
   star: `waterbowl*5_small`. Those are kept, and the picker prefers an exact
   match over the base class, so those rows get their own picture.

   A STAR IS NOT A FILENAME on Windows, so it is written as `-`. Habbo class
   names are letters, digits and underscores, so nothing collides; anything
   with another awkward character is counted and skipped rather than guessed
   at. js/fallinfurni.js does the same substitution when it builds the src.

   ----------------------------------------------------------------------
   PIXELS

   The same two formats and the same rules as the room artwork, because these
   come out of the same casts: 8-bit palette indices with 0 transparent, or
   32-bit true colour stored as four byte-planes per row with the alpha plane
   first. Where that plane says nothing — uniformly opaque — the background is
   a flat colour keyed off the corners, as in furni-extract.js.

   Palette member 0 is the movie's own (the Mac system palette) and -2 is
   Director's greyscale; both come from furni-extract.js so there is one
   definition of each.

   usage: node tools/furni-icons-extract.js [--out assets/furni-icons]
*/

const fs = require("fs");
const path = require("path");

const { openCast, readMember, unpackBits, readClut } = require("./cct-extract.js");
const { encodePng } = require("./png-encode.js");
const { macPalette, greyscalePalette, CLIENT } = require("./furni-extract.js");

const argv = process.argv.slice(2);
const outArg = argv.indexOf("--out");
const OUT = outArg > -1 ? argv[outArg + 1] : path.join(__dirname, "..", "assets", "furni-icons");

function main() {
    fs.mkdirSync(OUT, { recursive: true });

    const files = fs.readdirSync(CLIENT).filter(f => /^hh_furni.*\.cct$/i.test(f));
    let written = 0, skipped = 0, noPalette = 0, bytes = 0, blank = 0, unnameable = 0;
    const seen = new Set();

    /* The catalogue's star becomes a dash; js/fallinfurni.js matches this. */
    const fileFor = (className) => {
        const safe = className.replace(/\*/g, "-");
        return /^[A-Za-z0-9_.-]+$/.test(safe) ? safe : null;
    };

    for (const file of files) {
        let cast;
        try { cast = openCast(path.join(CLIENT, file)); } catch { continue; }

        const clutCache = new Map();
        const paletteFor = (memberNum) => {
            if (memberNum === null || memberNum === undefined) return null;
            if (memberNum === -2) return greyscalePalette();
            if (memberNum === 0) return macPalette();
            if (memberNum < 0) return null;
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
            let m;
            try { m = readMember(cast.chunk(e)); } catch { continue; }
            if (!m || !m.name || !m.bitmap) continue;
            const named = /^(.+)_small$/.exec(m.name);
            if (!named) continue;
            const className = named[1];
            // The first cast to carry one wins; they do not differ.
            if (seen.has(className)) continue;
            const stem = fileFor(className);
            if (!stem) { unnameable++; continue; }

            const { pitch, w, h, bitDepth, paletteMember } = m.bitmap;
            if (w <= 1 || h <= 1 || w > 200 || h > 200) { skipped++; continue; }
            if (bitDepth !== 8 && bitDepth !== 32) { skipped++; continue; }

            const bitdId = cast.childOf.get(`${e.id}:BITD`);
            if (bitdId === undefined) { skipped++; continue; }
            let bytesIn;
            try {
                const raw = cast.chunk(cast.byId.get(bitdId));
                bytesIn = raw.length === pitch * h ? raw : unpackBits(raw, pitch * h);
            } catch { skipped++; continue; }
            if (!bytesIn || bytesIn.length < pitch * h) { skipped++; continue; }

            const pal = bitDepth === 8 ? paletteFor(paletteMember) : null;
            if (bitDepth === 8 && !pal) { noPalette++; continue; }

            /* 32-bit: trust the alpha plane when it says anything at all, and
               fall back to keying the corner colour when it is uniform. Same
               reasoning as the room artwork — see furni-extract.js. */
            let hasAlpha = false, bg = null;
            if (bitDepth === 32) {
                let anyClear = false, anySolid = false;
                for (let y = 0; y < h && !(anyClear && anySolid); y++) {
                    const row = y * pitch;
                    for (let x = 0; x < w; x++) {
                        if (bytesIn[row + x] < 8) anyClear = true; else anySolid = true;
                        if (anyClear && anySolid) break;
                    }
                }
                const A = (x, y) => bytesIn[y * pitch + x];
                const RGB = (x, y) => [bytesIn[y * pitch + w + x], bytesIn[y * pitch + 2 * w + x], bytesIn[y * pitch + 3 * w + x]];
                const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
                hasAlpha = anyClear && anySolid && corners.some(([x, y]) => A(x, y) < 8);
                if (!hasAlpha) {
                    const seenC = corners.map(([x, y]) => RGB(x, y).join(","));
                    bg = seenC.every(v => v === seenC[0]) ? seenC[0].split(",").map(Number) : [255, 255, 255];
                }
            }

            const rgba = Buffer.alloc(w * h * 4);
            let drawn = 0;
            for (let y = 0; y < h; y++) {
                const row = y * pitch;
                for (let x = 0; x < w; x++) {
                    let r, g, b, a = 255;
                    if (bitDepth === 8) {
                        const v = bytesIn[row + x];
                        if (v === 0) continue;
                        const c = pal[v];
                        if (!c) continue;
                        r = c[0]; g = c[1]; b = c[2];
                    } else {
                        r = bytesIn[row + w + x];
                        g = bytesIn[row + 2 * w + x];
                        b = bytesIn[row + 3 * w + x];
                        if (hasAlpha) {
                            a = bytesIn[row + x];
                            if (a < 8) continue;
                        } else if (bg && r === bg[0] && g === bg[1] && b === bg[2]) continue;
                    }
                    const d = (y * w + x) * 4;
                    rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = a;
                    drawn++;
                }
            }
            if (!drawn) { blank++; continue; }

            const png = encodePng(w, h, rgba);
            fs.writeFileSync(path.join(OUT, `${stem}.png`), png);
            seen.add(className);
            written++; bytes += png.length;
        }
    }

    /* WHAT WAS WRITTEN, so nobody has to find out by asking for it.

       A row's icon is its own colourway's thumbnail if the client ships one,
       otherwise the base class's, otherwise FurniIndex. Probing that chain
       with <img> onerror would mean a 404 for each of the ~417 rows that fall
       through to the second link, every time the panel redraws. The list is
       1,260 names; the builder fetches it once and knows.

       Read by RoomEditor.load, and only there — a player never asks for it. */
    fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify([...seen].sort()));

    console.log(`${written} icons -> ${OUT}`);
    console.log(`  ${(bytes / 1024).toFixed(0)} KB, ${(bytes / written).toFixed(0)} bytes each on average`);
    console.log(`  ${skipped} unusable, ${noPalette} with an unresolvable palette, ${blank} that drew nothing`);
    if (unnameable) console.log(`  ${unnameable} skipped for a class name that is not a filename`);
}

if (require.main === module) main();
