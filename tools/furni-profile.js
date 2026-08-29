/* Where does a furni scan's time actually go?

   A scan measured 145 seconds per room image, which is 22 hours for the
   553 images on the site. Before trying to make that faster it is worth
   knowing what it is spending the time ON — the guess was PNG decoding,
   and a guess is a poor basis for a rewrite.

   Splits one image's scan into the two halves that matter:

     prep  - decoding each sprite and listing its solid pixels. Depends
             only on the sprite, yet scanRoom redoes it for every image.
     match - testing prepared sprites against this particular room. Genuinely
             per-image work.

   Run: node tools/furni-profile.js
*/

const fs = require("fs");
const path = require("path");

// No dotenv in this project, and one variable parser is not worth a
// dependency. Same file the Netlify CLI reads.
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { decodePng } = require("../netlify/functions/_png.js");
const { scanRoom } = require("../netlify/functions/_furni-match.js");
const { getCatalogue } = require("../netlify/functions/furni-catalogue.js");
const { blobStore } = require("../netlify/functions/_blobs.js");
const { getDb } = require("../netlify/functions/_db.js");

const CACHE = path.join(__dirname, ".cache", "sprites");
const SITE = process.env.SCAN_SITE_URL || "https://mazerats.net";

const secs = ms => (ms / 1000).toFixed(1) + "s";

/* Sprites come from the Netlify Blobs cache the scans already filled, then
   get mirrored to disk so later runs cost nothing and no network. */
async function loadSprites(catalogue) {
    fs.mkdirSync(CACHE, { recursive: true });
    const store = blobStore("furni-sprites");
    const wanted = [];
    catalogue.items.forEach((item, itemIndex) => {
        (item.largeImages || []).forEach((state, si) => state.forEach((url, ri) => {
            if (url) wanted.push({ key: itemIndex, url, blobKey: `${itemIndex}_${si}_${ri}.png` });
        }));
    });

    const sprites = [];
    let fromDisk = 0, fromBlobs = 0, missing = 0;
    for (let i = 0; i < wanted.length; i += 16) {
        await Promise.all(wanted.slice(i, i + 16).map(async s => {
            const file = path.join(CACHE, s.blobKey);
            let buffer = null;
            if (fs.existsSync(file)) {
                buffer = fs.readFileSync(file);
                fromDisk++;
            } else {
                const ab = await store.get(s.blobKey, { type: "arrayBuffer" }).catch(() => null);
                if (ab) {
                    buffer = Buffer.from(ab);
                    fs.writeFileSync(file, buffer);
                    fromBlobs++;
                } else {
                    missing++;
                    return;
                }
            }
            sprites.push({ key: s.key, url: s.url, buffer });
        }));
        if (i % 800 === 0) process.stdout.write(`\r  sprites ${sprites.length}/${wanted.length}`);
    }
    process.stdout.write(`\r  sprites ${sprites.length}/${wanted.length}  (disk ${fromDisk}, blobs ${fromBlobs}, missing ${missing})\n`);
    return sprites;
}

/* Exactly the per-sprite work scanRoom does before it looks at the room:
   decode, list solid pixels, one representative pixel per colour. Timed
   here on its own precisely because scanRoom repeats it per image. */
function prepSprites(sprites) {
    let usable = 0, solidTotal = 0;
    for (const sprite of sprites) {
        let sp;
        try { sp = decodePng(sprite.buffer); } catch { continue; }
        const SW = sp.width, SH = sp.height, SD = sp.data;
        const solid = [];
        for (let y = 0; y < SH; y++) {
            for (let x = 0; x < SW; x++) {
                const o = (y * SW + x) * 4;
                if (SD[o + 3] > 250) solid.push([x, y, SD[o], SD[o + 1], SD[o + 2]]);
            }
        }
        if (solid.length < 150) continue;
        const perColour = new Map();
        for (const p of solid) {
            const k = (p[2] << 16) | (p[3] << 8) | p[4];
            if (!perColour.has(k)) perColour.set(k, p);
        }
        usable++;
        solidTotal += solid.length;
    }
    return { usable, solidTotal };
}

(async () => {
    console.log("Furni scan profile\n");

    let t = Date.now();
    const catalogue = await getCatalogue();
    console.log(`catalogue: ${catalogue.items.length} furni in ${secs(Date.now() - t)}`);

    t = Date.now();
    const sprites = await loadSprites(catalogue);
    console.log(`sprite fetch: ${sprites.length} in ${secs(Date.now() - t)}\n`);

    // A real room image, taken from a maze that has already been scanned so
    // the result can be checked against a known-good one.
    const db = await getDb();
    const room = await db.collection("rooms").findOne({ name: /Old School Maze/i });
    const image = Object.keys(room.furni || {})[0] || (room.gallery || [])[0].image;
    const url = /^https?:/i.test(image) ? image : SITE + image;
    t = Date.now();
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());
    console.log(`room image: ${(buffer.length / 1024).toFixed(0)}KB in ${secs(Date.now() - t)}`);
    const known = (room.furni[image] || {}).items;
    console.log(`  (this image previously found ${known ? known.length : "?"} furni)\n`);

    t = Date.now();
    const prep = prepSprites(sprites);
    const prepMs = Date.now() - t;
    console.log(`PREP  : ${secs(prepMs)}  — ${prep.usable} usable sprites, ${prep.solidTotal.toLocaleString()} solid pixels`);

    t = Date.now();
    const result = scanRoom(buffer, sprites);
    const wholeMs = Date.now() - t;
    console.log(`WHOLE : ${secs(wholeMs)}  — scanRoom as it runs today, found ${result.hits.length} furni`);
    console.log(`MATCH : ${secs(wholeMs - prepMs)}  — the part that genuinely depends on this room\n`);

    const share = Math.round((prepMs / wholeMs) * 100);
    console.log(`Prep is ${share}% of one image's scan, and it is repeated for every image.`);
    console.log(`Hoisting it out would take a 6-image run from ${secs(wholeMs * 6)} to about ${secs(prepMs + (wholeMs - prepMs) * 6)}.`);
    const perImage = (wholeMs - prepMs) / 1000;
    console.log(`\n553 images, prep once, one core : ${((prepMs / 1000 + perImage * 553) / 3600).toFixed(1)}h`);
    for (const n of [8, 16, 20]) {
        console.log(`553 images, prep once, ${n} workers : ${((prepMs / 1000 + (perImage * 553) / n) / 60).toFixed(0)} min`);
    }
    process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
