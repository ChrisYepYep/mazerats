/* Where a furni's artwork actually sits on its tile.
   Writes js/furni-offsets.js from the Habbo Origins client's own cast files.

   ----------------------------------------------------------------------
   THE PROBLEM THIS SOLVES

   The game draws furni using FurniIndex's ready-made PNGs, and was placing
   each one by centring it on the south tile and standing it on that tile's
   bottom vertex. That is a guess, and it is only ever right for artwork which
   happens to be centred on its own footprint — a dining chair, near enough.
   Anything drawn off-centre, which is most wall-type pieces, lands wrong: the
   lodge dividers sit a visible few pixels off the grid.

   There is no guessing needed, because the client stores the answer.

   ----------------------------------------------------------------------
   WHAT THE CLIENT STORES, AND HOW IT LINES UP WITH FURNIINDEX

   Each furni is drawn from several bitmap members, one per layer, named

       <class>_<part>_<f1>_<f2>_<f3>_<direction>_<state>

   and each member carries a registration point (regX, regY). A part's
   top-left in the furni's own coordinate space is (-regX, -regY). Lay every
   part of one direction+state out that way and the union of their boxes is
   the whole composed piece.

   The useful discovery is that FurniIndex publishes exactly that composed
   box, uncropped. Three checks, all exact:

       divider_arm3 dir 0   parts 22x95, 27x90, 35x117  ->  52x117
                            FurniIndex furni-gate-lockable-1-s1-r1-lrg.png
                                                        ->  52x117
       chair_polyfon dir 0  parts 32x41, 54x37          ->  54x60
                            FurniIndex furni-dining-chair-1-s1-r1-lrg.png
                                                        ->  54x60
       divider_arm1 dir 0   single part 58x72           ->  58x72
                            FurniIndex corner-plinth     ->  58x72

   So the client's numbers apply directly to the images the game already
   loads, and nothing has to be re-hosted. What we need out of these files is
   not artwork at all — it is one anchor per class, per state, per direction:

       ax, ay   where the furni's origin lands INSIDE the composed image,
                = (-minX, -minY) over the parts of that direction and state.

   The anchor genuinely differs between rotations — chair_polyfon is 54x60
   anchored (-6,46) facing one way and 52x66 anchored (-7,55) facing the
   other — which is the whole reason a single rule could never place both.

   ----------------------------------------------------------------------
   WHAT THIS DELIBERATELY DOES NOT DECIDE

   Where the origin sits ON THE TILE is one constant for every furni in the
   hotel, not per-class data, so it lives with the renderer in js/room-furni.js
   rather than being baked into all 1200 records here. Change it in one place
   and every piece moves together, which is what calibrating it needs.

   usage: node tools/furni-offsets-extract.js [--out js/furni-offsets.js]
*/

const fs = require("fs");
const path = require("path");

const CLIENT = process.env.HABBO_CLIENT ||
    "C:\\Users\\cjboy\\AppData\\Roaming\\Habbo Launcher\\downloads\\shockwave\\350";

const { listCast } = require("./cct-extract.js");

/* Members are named <class>_<part>_<f1>_<f2>_<f3>_<direction>_<state>, and
   the class itself contains underscores, so the tail is matched rather than
   the head. `sd` members are drop shadows and `_small` are the catalogue
   thumbnails — neither is part of the room sprite. */
const MEMBER = /^(.+)_([a-z])_(\d+)_(\d+)_(\d+)_(\d+)_(\d+)$/;

function parseName(name) {
    const m = MEMBER.exec(name);
    if (!m) return null;
    return {
        className: m[1],
        part: m[2],
        direction: Number(m[6]),
        state: Number(m[7])
    };
}

function main() {
    const outArg = process.argv.indexOf("--out");
    const out = outArg > -1 ? process.argv[outArg + 1]
        : path.join(__dirname, "..", "js", "furni-offsets.js");

    const files = fs.readdirSync(CLIENT)
        .filter(f => /^hh_furni.*\.cct$/i.test(f))
        // The 50% sets are the small catalogue art, not what the room draws.
        .filter(f => !/_50\.cct$/i.test(f) && !/_small\.cct$/i.test(f));

    // className -> state -> direction -> {minX,minY,maxX,maxY}
    const boxes = new Map();
    let members = 0, skipped = 0, stubs = 0, unreadable = [];

    for (const file of files) {
        let list;
        try {
            list = listCast(path.join(CLIENT, file));
        } catch (e) {
            // The RIFX casts are uncompressed Director, which the reader in
            // cct-extract.js does not open. Named rather than silently
            // dropped, so a missing furni has an explanation.
            unreadable.push(`${file}: ${e.message}`);
            continue;
        }
        for (const m of list) {
            const p = parseName(m.name);
            if (!p) { skipped++; continue; }

            /* Some layers are a single pixel parked miles from the artwork —
               cabin_keg's second part is 1x1 at reg (-1276, 1688) — placeholders
               for a state that draws nothing. They carry no picture, but they
               do drag the union box across the room and wreck the anchor for
               the whole furni. A one-pixel member is not artwork; drop it. */
            if (m.w <= 1 && m.h <= 1) { stubs++; continue; }
            members++;

            const x0 = -m.regX, y0 = -m.regY;
            const x1 = x0 + m.w, y1 = y0 + m.h;

            if (!boxes.has(p.className)) boxes.set(p.className, new Map());
            const states = boxes.get(p.className);
            if (!states.has(p.state)) states.set(p.state, new Map());
            const dirs = states.get(p.state);

            const b = dirs.get(p.direction);
            if (!b) dirs.set(p.direction, { minX: x0, minY: y0, maxX: x1, maxY: y1 });
            else {
                b.minX = Math.min(b.minX, x0); b.minY = Math.min(b.minY, y0);
                b.maxX = Math.max(b.maxX, x1); b.maxY = Math.max(b.maxY, y1);
            }
        }
    }

    /* Flatten to the shape the renderer wants. Directions are stored by their
       CLIENT number (0, 2, 4, 6) rather than packed into an array, because a
       furni that only has direction 0 and 2 must not have them renumbered to
       0 and 1 — the game asks for a direction, not for the nth one. */
    const data = {};
    let classes = 0, entries = 0;
    for (const [className, states] of [...boxes].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
        const rec = {};
        for (const [state, dirs] of [...states].sort((a, b) => a[0] - b[0])) {
            const byDir = {};
            for (const [dir, b] of [...dirs].sort((a, b) => a[0] - b[0])) {
                byDir[dir] = {
                    w: b.maxX - b.minX,
                    h: b.maxY - b.minY,
                    ax: -b.minX,
                    ay: -b.minY
                };
                entries++;
            }
            rec[state] = byDir;
        }
        data[className] = rec;
        classes++;
    }

    const body = `/* GENERATED by tools/furni-offsets-extract.js — do not hand-edit.

   Where each furni's origin sits inside its own composed sprite, read out of
   the Habbo Origins client. See the tool for how the numbers were derived and
   why they line up with the FurniIndex images the game loads.

     furniOffsets[className][state][direction] = { w, h, ax, ay }

   w,h  the composed sprite's size, which is also FurniIndex's image size —
        useful as a check that the two sources still agree.
   ax,ay  the origin's pixel position INSIDE that sprite.

   Directions are the client's own numbering (0, 2, 4, 6), not an index.

   ${classes} classes, ${entries} sprite variants, from ${files.length} cast files. */
(function () {
    "use strict";
    window.FurniOffsets = ${JSON.stringify(data)};
})();
`;

    fs.writeFileSync(out, body);
    console.log(`read ${members} sprite members (${skipped} non-sprite names skipped, ` +
        `${stubs} one-pixel placeholder members dropped)`);
    if (unreadable.length) {
        console.log(`could not open ${unreadable.length} cast file(s):`);
        for (const u of unreadable) console.log("  " + u);
    }
    console.log(`wrote ${classes} classes / ${entries} variants -> ${out}`);
}

if (require.main === module) main();
