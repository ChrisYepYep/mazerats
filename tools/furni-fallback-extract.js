/* Builds js/furni-fallback.js — which way round a furni sits when the only
   picture of it comes from FurniIndex.

   ----------------------------------------------------------------------
   THE PROBLEM

   js/furni-offsets.js is measured out of the Habbo Origins client, so it only
   covers furni the client ships. 360 of the catalogue's 1,285 classes are not
   in it: the 2025 re-skins (`darkmode_*`, `*_dpolyfon*`), the seasonal sets,
   `club_sofa`. Those are drawn from FurniIndex's own artwork instead, and for
   those the game has to guess two things it is normally told:

     WHERE the picture sits over its tiles      — see js/room-furni.js, which
                                                  now centres it, a rule
                                                  measured against all 2,280
                                                  known rotations
     WHICH WAY the footprint runs               — this file

   The second one is the one you can see. A 2x1 bar desk whose footprint runs
   the wrong way blocks the tiles beside it instead of the tiles under it, so
   two desks placed to make one long bar leave a tile's gap in the middle and
   overlap at the ends. That is what "the alignment is off again" looks like.

   ----------------------------------------------------------------------
   WHY IT CANNOT BE INFERRED

   The obvious rule — rotation 0 is direction 0, rotation 1 is direction 2, so
   swap on the odd ones — is what the game did, and it is wrong here, because
   FurniIndex's r1..r4 are NOT the client's directions in order. Measured
   against the client's own artwork: `foosball`, `china_moongt` and
   `urban_fence` list theirs in the same order the client does, and
   `bardesk_polyfon` lists its two the other way round. There is no rule; the
   order is per furni.

   ----------------------------------------------------------------------
   SO IT IS MEASURED

   Isometric artwork gives its own axis away. A piece whose long side runs
   along +x has a base that DESCENDS to the right; along +y it rises. Fit a
   line to the bottom edge of the silhouette and to the top edge, add the two
   slopes, and the sign is the answer.

   Checked before being trusted: run against the 359 rotations of client furni
   whose footprint is not square — where the right answer is already known —
   this agrees 340 times, disagrees 12 and is too flat to call 7. The dozen it
   gets wrong are football goals and two dividers, none of which is in the set
   this file is for.

   Square footprints are skipped: there is nothing to get wrong.

   usage: node tools/furni-fallback-extract.js [--site http://localhost:8888]
*/

const fs = require("fs");
const path = require("path");
const { readPng } = require("./png-decode.js");

const argv = process.argv.slice(2);
const siteArg = argv.indexOf("--site");
const SITE = siteArg > -1 ? argv[siteArg + 1] : "http://localhost:8888";
const CACHE = path.join(__dirname, ".cache", "furniindex");

const baseClass = (c) => String(c || "").replace(/\*\d+$/, "");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* Least-squares slope of one edge of the silhouette: for each column, the
   first (or last) row that has anything in it. */
function edgeSlope(img, fromBottom) {
    const xs = [], ys = [];
    for (let x = 0; x < img.w; x++) {
        const start = fromBottom ? img.h - 1 : 0;
        const stop = fromBottom ? -1 : img.h;
        const step = fromBottom ? -1 : 1;
        for (let y = start; y !== stop; y += step) {
            if (img.rgba[(y * img.w + x) * 4 + 3] < 8) continue;
            xs.push(x); ys.push(y); break;
        }
    }
    const n = xs.length;
    if (n < 8) return 0;
    const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    return den ? num / den : 0;
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
}

async function grab(url) {
    fs.mkdirSync(CACHE, { recursive: true });
    const file = path.join(CACHE, url.split("/").pop());
    if (!fs.existsSync(file)) {
        const res = await fetch(url);
        if (!res.ok) return null;
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        await sleep(200);          // one at a time, and not fast
    }
    try { return readPng(file); } catch (e) { return null; }
}

async function main() {
    global.window = {};
    require(path.join(__dirname, "..", "js", "furni-offsets.js"));
    require(path.join(__dirname, "..", "js", "furni-library.js"));
    const OFFSETS = global.window.FurniOffsets, LIBRARY = global.window.FurniLibrary;

    const cat = await fetchJson(`${SITE}/.netlify/functions/furni-catalogue?sprites=1`);
    const meta = (await fetchJson(`${SITE}/.netlify/functions/furni-meta`)).items || {};

    const out = {};
    let classes = 0, rotations = 0, flat = 0, unreadable = 0;

    for (const row of cat.items || []) {
        const c = row.className, b = baseClass(c);
        if (LIBRARY[c] || LIBRARY[b] || OFFSETS[c] || OFFSETS[b]) continue;   // client knows this one
        const m = meta[c];
        if (!m || !m.x || !m.y || m.x === m.y) continue;                      // nothing to get wrong

        const states = {};
        let any = false;
        for (let st = 0; st < (row.largeImages || []).length; st++) {
            const list = [];
            for (const url of row.largeImages[st]) {
                const img = await grab(url);
                if (!img) { list.push(null); unreadable++; continue; }
                const slope = edgeSlope(img, true) + edgeSlope(img, false);
                if (Math.abs(slope) < 0.05) { list.push(null); flat++; continue; }
                // Long side along +x, and whether that means the footprint
                // has to be transposed off furnidata's x-by-y.
                const alongX = slope > 0;
                list.push(m.x > m.y ? !alongX : alongX);
                rotations++;
            }
            if (list.some(v => v !== null)) { states[st] = list; any = true; }
        }
        if (any) { out[c] = states; classes++; }
    }

    const js = `/* Which way round a FurniIndex-only furni sits.

   GENERATED by tools/furni-fallback-extract.js — do not hand-edit, re-run it.
   That file explains why this one has to exist and how the answers are
   measured; the short version is that FurniIndex do not list a furni's
   rotations in the client's order, so the game cannot work out from a
   rotation number whether the footprint is turned.

   className -> state -> rotation index -> swap, where swap means the
   footprint is furnidata's y-by-x rather than its x-by-y. Null means the
   artwork was too flat to call, and the caller keeps its own guess. Classes
   the client ships are absent: js/furni-offsets.js already answers for those,
   and squares are absent because there is nothing to answer. */
(function () {
    "use strict";
    window.FurniFallback = ${JSON.stringify(out, null, 4)};
})();
`;
    const dest = path.join(__dirname, "..", "js", "furni-fallback.js");
    fs.writeFileSync(dest, js);
    console.log(`${classes} classes, ${rotations} rotations measured` +
        `${flat ? `, ${flat} too flat to call` : ""}${unreadable ? `, ${unreadable} unreadable` : ""}`);
    console.log(`wrote ${dest}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
