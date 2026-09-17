/* Puts a backup of the Fallin' Furni levels back.

   A backup nobody can restore is not a backup, and the one thing that writes
   levels — tools/ff-levels-build.js — writes what it GENERATES rather than
   what was there before. So this is the other direction: a file of level
   documents, exactly as they came out of the database, written back over
   whatever is in it now.

   Make the file first, with a find over `ff_levels`, or keep the one the
   curve work left in backups/. Restoring a file that did not come from this
   collection is how a level gets a shape nothing can play, so every document
   is checked for an id and a rules block before anything is written.

   ----------------------------------------------------------------------
   WHOLE DOCUMENTS OR JUST THE RULES

   --rules puts back nothing but the clock and the drop rates, which is what
   a retune wants undone — the rooms may well have been drawn in since the
   backup was taken, and restoring those too would throw that away. Without
   it, the whole document goes back as it was, including the room.

   Levels in the database that are not in the file are LEFT ALONE either way.
   This restores; it does not delete.

   usage:
     node tools/ff-levels-restore.js backups/ff-levels-2026-09-17.json
     node tools/ff-levels-restore.js <file> --rules      clocks and rates only
     node tools/ff-levels-restore.js <file> --write      commit it
*/

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const FILE = argv.find(a => !a.startsWith("--"));
const WRITE = argv.includes("--write");
const RULES_ONLY = argv.includes("--rules");

if (!FILE) {
    console.error("usage: node tools/ff-levels-restore.js <backup.json> [--rules] [--write]");
    process.exit(1);
}

(async () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve(FILE), "utf8"));
    const levels = (Array.isArray(raw) ? raw : raw.levels || []).filter(Boolean);

    const bad = levels.filter(l => !l.id || !l.rules || typeof l.rules.seconds !== "number");
    if (!levels.length || bad.length) {
        console.error(`${FILE} does not look like a level backup` +
            (bad.length ? `: ${bad.length} of ${levels.length} documents have no id or no rules` : ": no levels in it"));
        process.exit(1);
    }

    require("./_env.js").loadEnv(["MONGODB_URI"]);
    const { getDb } = require("../netlify/functions/_db.js");
    const db = await getDb();
    const col = db.collection("ff_levels");

    console.log(`${FILE}: ${levels.length} levels, restoring ${RULES_ONLY ? "rules only" : "whole documents"}\n`);

    let changed = 0, same = 0, missing = 0;
    const plan = [];
    for (const l of levels.sort((a, b) => (a.order || 0) - (b.order || 0))) {
        const now = await col.findOne({ id: l.id });
        if (!now) { console.log(`  ${String(l.order).padStart(2)}. ${l.id} — not in the database, skipped`); missing++; continue; }
        /* `_id` is Mongo's and `updatedAt` is this write's; neither belongs in
           a $set taken from a file. Restoring an _id is an error rather than
           a no-op, so it is dropped rather than left to be refused. */
        const { _id, updatedAt, ...doc } = l;
        const set = RULES_ONLY ? { rules: doc.rules } : doc;
        const differs = JSON.stringify(set) !== JSON.stringify(
            RULES_ONLY ? { rules: now.rules } : (({ _id: x, updatedAt: y, ...rest }) => rest)(now));
        if (!differs) { same++; continue; }
        const was = now.rules || {}, back = doc.rules || {};
        console.log(`  ${String(l.order).padStart(2)}. ${String(l.name || l.id).padEnd(24)}` +
            ` ${was.seconds}s -> ${back.seconds}s` +
            (was.dropDelayMs !== back.dropDelayMs ? `  drop ${was.dropDelayMs} -> ${back.dropDelayMs}` : "") +
            (!RULES_ONLY ? "  (whole document)" : ""));
        plan.push({ id: l.id, set });
        changed++;
    }

    console.log(`\n${changed} to restore, ${same} already as the backup has them` +
        (missing ? `, ${missing} not in the database` : ""));
    if (!WRITE) { console.log("nothing written — pass --write to commit"); process.exit(0); }

    const at = new Date().toISOString();
    for (const p of plan) await col.updateOne({ id: p.id }, { $set: { ...p.set, updatedAt: at } });
    console.log(`${plan.length} levels restored`);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
