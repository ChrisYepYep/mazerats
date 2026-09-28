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

   IT ALSO SETS THE FLAG on records that already have a slug stored but no
   slugManual — the ones saved after slugs existed but before the flag did.
   Without it, "was this address typed?" is guessed from the shape of the
   address on every save (isAutomatic in _slugs.js), and a hand-typed
   "halloween-2024" on a maze called "Halloween" reads as automatic and
   follows the next rename. The same guess made ONCE here, and stored, at
   least stops it being made again on every save — and the dry run lists
   each one, so a wrong guess can be seen and corrected in /warren before
   anything is written. Their slug is not touched.

   Dry run by default — prints what it would store and changes nothing:
       node tools/backfill-slugs.js
   Then, to write:
       node tools/backfill-slugs.js --write

   Safe to run again: a record that already has a slug stored keeps it, a
   record that already has a flag keeps that, and each write is conditional
   on the record still being as it was read. */

require("./_env.js").loadEnv(["MONGODB_URI"]);

const { getDb } = require("../netlify/functions/_db.js");
/* isAutomatic accepts a name's address with its accents folded AND without
   (see _slugs.js), so an address worked out before folding existed is
   still flagged "follows the name" here, as it was when it was made. */
const { assignSlugs, isAutomatic, loadRetired, PROJECTION } = require("../netlify/functions/_slugs.js");

const WRITE = process.argv.includes("--write");
const COLLECTIONS = [["rooms", "maze"], ["events", "event"], ["guides", "guide"]];

(async () => {
    const db = await getDb();
    let pending = 0, written = 0;
    for (const [name, kind] of COLLECTIONS) {
        const coll = db.collection(name);
        const all = await coll.find({}, { projection: PROJECTION }).toArray();
        // With the deleted records' addresses, as the site works them out —
        // otherwise this could store an address the site does not serve.
        const slugs = assignSlugs(all, kind, await loadRetired(db, kind));
        const prefix = kind === "guide" ? "guides" : kind;
        const missing = all.filter(r => r.id && !r.slug);
        console.log(`\n${name}: ${all.length} records, ${missing.length} without a stored address`);
        for (const r of missing) {
            const slug = slugs.get(r.id);
            const note = slug === r.id ? "" : `   (id ${r.id})`;
            console.log(`  /${prefix}/${slug}${note}`);
            pending++;
            if (!WRITE) continue;
            const res = await coll.updateOne(
                { id: r.id, $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] },
                { $set: { slug, slugManual: false } }
            );
            if (res.modifiedCount === 1) written++;
        }

        // A stored address with no flag: the flag the shape of it implies.
        const unflagged = all.filter(r => r.id && r.slug && typeof r.slugManual !== "boolean");
        console.log(`${name}: ${unflagged.length} with an address but no slugManual`);
        for (const r of unflagged) {
            const title = (kind === "maze" ? r.name : r.title) || "";
            const manual = !isAutomatic(r.slug, title);
            console.log(`  /${prefix}/${r.slug}   ${manual ? "typed (stays put)" : "follows the name"}   "${title}"`);
            pending++;
            if (!WRITE) continue;
            const res = await coll.updateOne(
                { id: r.id, slug: r.slug, slugManual: { $nin: [true, false] } },
                { $set: { slugManual: manual } }
            );
            if (res.modifiedCount === 1) written++;
        }
    }
    console.log(WRITE
        ? `\nStored ${written} of ${pending} changes.`
        : `\nDry run: ${pending} changes would be stored. Run again with --write to store them.`);
    process.exit(0);
})().catch(err => {
    console.error(err);
    process.exit(1);
});
