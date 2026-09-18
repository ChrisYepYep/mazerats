/* Puts one worked example of a secret passage into the atlas.

   A secret is a word and a list of rooms and trails that word brings onto
   the map. Everything it names is subtracted from the public payload by
   netlify/functions/wizard.js, so those rooms are not merely undrawn — they
   are not in the JSON the page downloads at all, and no amount of reading
   the page finds them. The endpoint hands them over in exchange for the
   code and nothing else.

   This exists because the feature is easier to understand once there is one
   of them to look at, and because the first one is the awkward one: you have
   to know which room ids to hold back before you can see what holding them
   back does.

   The code it writes is DISSENDIUM and the passage is the one-eyed witch's,
   which is the obvious candidate — R062, R063 and R064 on the connection
   sheet are already a chain of secret rooms behind a statue, and C064 to
   C067 are already marked "Hidden tele". So this only tells the map to keep
   quiet about something that was already meant to be found rather than
   given.

     node tools/seed-secret.js             # say what it would do, write nothing
     node tools/seed-secret.js --write     # actually write it

   Re-running is safe: the secret is matched by its id and updated, so the
   code and the room list are reset to what is below and nothing is
   duplicated. To take it off again, delete it from the admin's Secret
   passages panel — which puts its rooms straight back on the public map,
   because that is all a secret ever does.

   IT IS WRITTEN SWITCHED OFF. A secret with `enabled: false` holds nothing
   back and cannot be unlocked, so running this cannot make part of the map
   disappear behind a code nobody has been told. Turn it on in the admin when
   you actually want the puzzle live. */

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");

/* The rooms this passage holds back, by their id on the connection sheet.

   Hold back the DEAD END, not the junction. R061 (Gunhilda of Gorsemoor) is
   the statue itself and stays on the public map: it is an ordinary
   third-floor room that people walked past, and removing it would leave a
   visible hole in the corridor. What comes off is what is behind it. */
const SECRET = {
    id: "one-eyed-witch",
    name: "The One-Eyed Witch Passage",
    code: "dissendium",
    hint: "A statue on the third floor is not as solid as she looks.",
    message: "Gunhilda's hump slides aside, and the stair down is exactly as narrow as the stories say.",
    rooms: ["r062", "r063", "r064"],
    // Filled in below from the trails that actually run between those rooms,
    // because trail ids are generated (trail-<base36>) and cannot be written
    // out by hand here.
    paths: [],
    focusX: null,
    focusY: null,
    focusZoom: null,
    enabled: false,
    order: 1
};

(async () => {
    require("./_env.js").loadEnv(["MONGODB_URI"]);
    const { getDb } = require("../netlify/functions/_db.js");
    const db = await getDb();
    const wizard = db.collection("wizard");

    const rooms = await wizard.find({ kind: "room" }, { projection: { _id: 0, id: 1, name: 1 } }).toArray();
    const byId = new Map(rooms.map(r => [r.id, r]));

    const missing = SECRET.rooms.filter(id => !byId.has(id));
    if (missing.length) {
        console.error(`\nThese rooms are not on the map: ${missing.join(", ")}`);
        console.error("Nothing written. Check the ids against the Rooms list in the admin.\n");
        process.exit(1);
    }

    /* Every trail with BOTH ends inside the set. A trail with one end outside
       it is left alone on purpose — the public GET already drops any trail
       that runs into a held-back room, so it will vanish from the map for
       the right reason without this having to name it, and naming it would
       mean the trail stayed missing if the secret were later switched off
       for only some of its rooms. */
    const held = new Set(SECRET.rooms);
    const trails = await wizard.find({ kind: "path" }, { projection: { _id: 0, id: 1, from: 1, to: 1 } }).toArray();
    SECRET.paths = trails.filter(t => held.has(t.from) && held.has(t.to)).map(t => t.id);

    console.log(`\n  ${SECRET.name}`);
    console.log(`  opens to:  ${SECRET.code}`);
    console.log(`  hint:      ${SECRET.hint}`);
    console.log(`  holds back ${SECRET.rooms.length} rooms:`);
    for (const id of SECRET.rooms) console.log(`      ${id}  ${byId.get(id).name}`);
    console.log(`  and ${SECRET.paths.length} trails between them`);
    console.log(`  enabled:   ${SECRET.enabled} (holds nothing back until this is true)`);

    if (!WRITE) {
        console.log("\n  Nothing written. Run again with --write to commit it.\n");
        process.exit(0);
    }

    await wizard.updateOne(
        { kind: "reveal", id: SECRET.id },
        { $set: { ...SECRET, kind: "reveal", updatedAt: new Date().toISOString() },
            $setOnInsert: { createdAt: new Date().toISOString() } },
        { upsert: true }
    );
    console.log("\n  Written, switched off.");
    console.log("  Turn it on in the admin: Atlas → Secret passages → Edit → On → Save.\n");
    process.exit(0);
})().catch(err => {
    console.error("\n" + (err && err.stack || err) + "\n");
    process.exit(1);
});
