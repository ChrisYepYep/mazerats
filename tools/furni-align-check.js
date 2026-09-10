/* Checks every furni's anchor, in every rotation, against its footprint.

   The anchors in js/furni-offsets.js are read out of the client and trusted;
   what is NOT given is the arithmetic this game wraps around them — which tile
   the origin belongs to, and what happens to an anchor when a piece is drawn
   mirrored. That arithmetic is where the mistakes have been, and eyeballing
   one divider at a time is how they got missed.

   So: measure. Relative to its origin — the west vertex of the piece's own
   tile (x, y) — a w-by-h piece covers

       x  from -32(h - 1) to 32(w + 1)
       y  from -16 to 16(w + h) - 16

   and the sprite covers x from -ax, y from -ay, for its own width and height.
   Three numbers fall out:

       leftInset    gap between the footprint's left corner and the artwork
       rightInset   the same on the right
       baseGap      how far the artwork's bottom edge sits above the
                    footprint's bottom corner

   Habbo's furni artwork is drawn centred over its tiles, so leftInset and
   rightInset should very nearly match. A piece where they differ by a lot is
   hanging off one side, and a large negative baseGap is a piece sunk through
   the floor. Neither is subtle once counted rather than looked at.

   usage: node tools/furni-align-check.js [--meta <furni-meta.json>] [--all]
*/

const fs = require("fs");
const path = require("path");

// The offsets file is browser-shaped; give it a window to attach to.
global.window = {};
require(path.join(__dirname, "..", "js", "furni-offsets.js"));
const OFFSETS = global.window.FurniOffsets;

const argv = process.argv.slice(2);
const metaArg = argv.indexOf("--meta");
const META_FILE = metaArg > -1 ? argv[metaArg + 1] : null;
const SHOW_ALL = argv.includes("--all");

const baseClass = (c) => String(c || "").replace(/\*\d+$/, "");

function table(className) {
    return OFFSETS[className] || OFFSETS[baseClass(className)] || null;
}

/* The same cycle js/room-furni.js walks: the drawn directions in order, then
   back through them mirrored. Kept in step by hand — if one changes, so must
   the other, and this file failing loudly is the point. */
const MIRROR_OF = (d) => (6 - d + 8) % 8;

// Must stay identical to RoomFurni.variants: drawn directions ascending, then
// back down mirrored, with the swap taken from the direction each entry ends
// up facing. This file exists to catch that order being wrong.
function cycleFor(className, state) {
    const t = table(className);
    if (!t) return null;
    const byState = t[state] || t[0] || t[Object.keys(t)[0]];
    if (!byState) return null;
    const drawn = Object.keys(byState).map(Number).sort((a, b) => a - b);
    if (!drawn.length) return null;
    const entry = (dir, mirror) => {
        const facing = mirror ? MIRROR_OF(dir) : dir;
        return { dir, mirror, facing, swap: facing === 2 || facing === 6 };
    };
    const cycle = drawn.map(d => entry(d, false));
    for (let i = drawn.length - 1; i >= 0; i--) cycle.push(entry(drawn[i], true));
    return { byState, cycle };
}

function anchorFor(className, rotation, w, h) {
    const v = cycleFor(className, 0);
    if (!v) return null;
    const pick = v.cycle[rotation % v.cycle.length];
    const box = v.byState[pick.dir];
    if (!box) return null;
    if (!pick.mirror) return { ax: box.ax, ay: box.ay, box, mirror: false };
    return { ax: box.w - box.ax - 64, ay: box.ay, box, mirror: true };
}

function main() {
    let meta = {};
    if (META_FILE && fs.existsSync(META_FILE)) {
        const raw = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
        meta = raw.items || raw;
    }

    const rows = [];
    let checked = 0, noMeta = 0;

    for (const className of Object.keys(OFFSETS)) {
        const m = meta[className];
        // Without furnidata there is no footprint, and no footprint means
        // nothing to check the anchor against.
        if (!m) { noMeta++; continue; }
        const v = cycleFor(className, 0);
        if (!v) continue;

        for (let r = 0; r < v.cycle.length; r++) {
            // The footprint swaps by DIRECTION, as RoomFurni.footprint does.
            const swap = v.cycle[r].swap;
            const w = swap ? m.y : m.x;
            const h = swap ? m.x : m.y;
            const a = anchorFor(className, r, w, h);
            if (!a) continue;

            const left = -a.ax + 32 * (h - 1);
            const right = 32 * (w + 1) - (-a.ax + a.box.w);
            const baseGap = (16 * (w + h) - 16) - (-a.ay + a.box.h);

            checked++;
            rows.push({
                className, r, w, h, mirror: a.mirror,
                left, right, skew: left - right, baseGap
            });
        }
    }

    const skews = rows.map(x => Math.abs(x.skew)).sort((a, b) => a - b);
    const pct = (p) => skews[Math.min(skews.length - 1, Math.floor(skews.length * p))];

    console.log(`checked ${checked} rotations across ${new Set(rows.map(r => r.className)).size} furni`);
    console.log(`(${noMeta} classes skipped: no furnidata record, so no footprint to check against)`);
    console.log(`\nleft-vs-right skew, in pixels:`);
    console.log(`  median ${pct(0.5)}   90th ${pct(0.9)}   99th ${pct(0.99)}   worst ${skews[skews.length - 1]}`);

    const bad = rows.filter(x => Math.abs(x.skew) > 16);
    console.log(`\n${bad.length} rotation(s) skewed by more than half a tile:`);
    for (const b of (SHOW_ALL ? bad : bad.slice(0, 25))) {
        console.log(`  ${b.className.padEnd(30)} rot ${b.r} ${b.w}x${b.h}` +
            `${b.mirror ? " mirrored" : "         "} left ${String(b.left).padStart(5)}` +
            ` right ${String(b.right).padStart(5)} skew ${String(b.skew).padStart(5)}`);
    }
    if (!SHOW_ALL && bad.length > 25) console.log(`  ... and ${bad.length - 25} more (--all to list)`);

    /* A mirrored rotation should be the mirror image of its partner: same
       insets, swapped. If the reflection arithmetic is wrong this is where it
       shows, because the two stop agreeing. */
    console.log(`\nmirror consistency — a mirrored rotation should have its partner's insets, swapped:`);
    let pairs = 0, mismatched = 0;
    const byKey = new Map(rows.map(x => [x.className + "|" + x.r, x]));
    for (const x of rows) {
        if (!x.mirror) continue;
        const v = cycleFor(x.className, 0);
        const mine = v.cycle[x.r];
        const pi = v.cycle.findIndex(c => !c.mirror && c.dir === mine.dir);
        const partner = pi < 0 ? null : byKey.get(x.className + "|" + pi);
        if (!partner) continue;
        pairs++;
        if (x.left !== partner.right || x.right !== partner.left || x.baseGap !== partner.baseGap) {
            mismatched++;
            if (mismatched <= 10) {
                console.log(`  ${x.className.padEnd(28)} rot ${x.r} (${x.left},${x.right},base ${x.baseGap})` +
                    ` vs rot ${pi} (${partner.left},${partner.right},base ${partner.baseGap})`);
            }
        }
    }
    console.log(`  ${pairs - mismatched} of ${pairs} mirrored rotations agree with their partner`);
}

if (require.main === module) main();
