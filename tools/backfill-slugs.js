/* One-time: store every maze's, event's and guide's current address.

   Records saved before clean addresses existed have no `slug` stored, and
   get one worked out from their name every time it is asked for (assignSlugs
   in netlify/functions/_slugs.js). A worked-out address can MOVE when a
   different record changes: two mazes called "Foo" are foo and foo-2, and
   renaming or deleting the first hands the second the plain foo — with
   nothing recorded of foo-2, so every link to it breaks. Storing each
   record's address as it is today pins them all, and from then on only a
   save of that record can move its own address (keeping the old one as an
   alias).

   It writes exactly what the site already serves: the slug assignSlugs
   gives each record now, so no address changes by running this. The
   `slugManual: false` it sets says "follows the name", which is true of
   every record that has never had an address typed for it.

   Dry run by default — prints what it would store and changes nothing:
       node tools/backfill-slugs.js
   Then, to write:
       node tools/backfill-slugs.js --write

   Safe to run again: a record that already has a slug stored is left alone,
   and each write is conditional on the record still having none. */

require("./_env.js").loadEnv(["MONGODB_URI"]);

const { getDb } = require("../netlify/functions/_db.js");
const { assignSlugs, PROJECTION } = require("../netlify/functions/_slugs.js");

const WRITE = process.argv.includes("--write");
const COLLECTIONS = [["rooms", "maze"], ["events", "event"], ["guides", "guide"]];

(async () => {
    const db = await getDb();
    let pending = 0, written = 0;
    for (const [name, kind] of COLLECTIONS) {
        const coll = db.collection(name);
        const all = await coll.find({}, { projection: PROJECTION }).toArray();
        const slugs = assignSlugs(all, kind);
        const missing = all.filter(r => r.id && !r.slug);
        console.log(`\n${name}: ${all.length} records, ${missing.length} without a stored address`);
        for (const r of missing) {
            const slug = slugs.get(r.id);
            const note = slug === r.id ? "" : `   (id ${r.id})`;
            console.log(`  /${kind === "guide" ? "guides" : kind}/${slug}${note}`);
            pending++;
            if (!WRITE) continue;
            const res = await coll.updateOne(
                { id: r.id, $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] },
                { $set: { slug, slugManual: false } }
            );
            if (res.modifiedCount === 1) written++;
        }
    }
    console.log(WRITE
        ? `\nStored ${written} of ${pending} addresses.`
        : `\nDry run: ${pending} addresses would be stored. Run again with --write to store them.`);
    process.exit(0);
})().catch(err => {
    console.error(err);
    process.exit(1);
});
