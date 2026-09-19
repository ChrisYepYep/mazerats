/* Writes the stored copy of Habbo's furnidata.

       node tools/furni-meta-extract.js              # fetch, compare, report
       node tools/furni-meta-extract.js --write      # and commit it to disk

   Reads ~9.6MB of XML from Origins, distils it to the six fields the site
   uses, and writes netlify/functions/_furnidata.json — which is what
   furni-meta.js serves. See the note in netlify/functions/_furnidata.js for
   why the answer is kept rather than fetched: it is the only source that
   knows which furni can be sat on, and Fallin' Furni has no seats without it.

   Reports before it writes, and the report is the point. A furni that has
   stopped being sittable, or a footprint that has changed under a level
   already built on it, is a thing to look at rather than a thing to commit —
   so a plain run prints the difference and touches nothing. Same habit as
   tools/slice-map.js and tools/furni-verify.js.
*/

const fs = require("fs");
const path = require("path");
const { fetchFurnidata } = require("../netlify/functions/_furnidata.js");

const OUT = path.join(__dirname, "..", "netlify", "functions", "_furnidata.json");
const WRITE = process.argv.includes("--write");

function readExisting() {
    try {
        return JSON.parse(fs.readFileSync(OUT, "utf8"));
    } catch (e) {
        return null;
    }
}

/* What changed, in the terms that matter here. A new furni is routine; a
   footprint or a seat flag changing on a class that already exists is not,
   because levels have been built against the old answer. */
function compare(before, after) {
    const oldItems = (before && before.items) || {};
    const newItems = after.items;

    const added = [];
    const removed = [];
    const changed = [];

    for (const k of Object.keys(newItems)) {
        const a = oldItems[k], b = newItems[k];
        if (!a) { added.push(k); continue; }
        const diffs = [];
        if (a.x !== b.x || a.y !== b.y) diffs.push(`${a.x}x${a.y} -> ${b.x}x${b.y}`);
        if (a.sit !== b.sit) diffs.push(`sit ${a.sit} -> ${b.sit}`);
        if (a.stand !== b.stand) diffs.push(`stand ${a.stand} -> ${b.stand}`);
        if (diffs.length) changed.push(`${k}: ${diffs.join(", ")}`);
    }
    for (const k of Object.keys(oldItems)) if (!newItems[k]) removed.push(k);

    return { added, removed, changed };
}

(async () => {
    const before = readExisting();
    process.stderr.write("reading furnidata from Origins… ");
    const after = await fetchFurnidata();
    process.stderr.write("done\n\n");

    let sit = 0, stand = 0, pc = 0, multi = 0;
    for (const v of Object.values(after.items)) {
        if (v.sit) sit++;
        if (v.stand) stand++;
        if (v.pc) pc++;
        if (v.x > 1 || v.y > 1) multi++;
    }

    console.log(`${after.count} floor items`);
    console.log(`  ${sit} sittable · ${stand} standable · ${multi} larger than one tile · ${pc} with partcolors`);

    if (!before) {
        console.log("\nNo stored copy yet — this would be the first.");
    } else {
        const { added, removed, changed } = compare(before, after);
        const age = Math.round((Date.now() - before.fetchedAt) / 86400000);
        console.log(`\nstored copy is ${age} day${age === 1 ? "" : "s"} old, ${before.count} items`);
        console.log(`  + ${added.length} new · - ${removed.length} gone · ~ ${changed.length} changed`);
        if (added.length) console.log("  new:     " + added.slice(0, 8).join(", ") + (added.length > 8 ? ` …and ${added.length - 8} more` : ""));
        if (removed.length) console.log("  gone:    " + removed.slice(0, 8).join(", ") + (removed.length > 8 ? ` …and ${removed.length - 8} more` : ""));
        /* Listed in full rather than truncated. A footprint or a seat flag
           that moved is the one thing on this report worth reading line by
           line, and there are never many. */
        if (changed.length) {
            console.log("  changed:");
            for (const c of changed) console.log("    " + c);
        }
    }

    if (!WRITE) {
        console.log("\nNothing written. Run again with --write to store it.");
        return;
    }

    fs.writeFileSync(OUT, JSON.stringify(after));
    const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
    console.log(`\nwrote ${path.relative(path.join(__dirname, ".."), OUT)} — ${kb}KB`);
})().catch((err) => {
    console.error("\nfailed: " + err.message);
    process.exitCode = 1;
});
