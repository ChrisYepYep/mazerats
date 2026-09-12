/* /.netlify/functions/ff-levels — the Fallin' Furni levels. Like rooms.js and
   events.js, the public GET is open; unlike them, every other route is
   restricted to OWNER accounts rather than to admins (see NOT_OWNER below).

   ----------------------------------------------------------------------
   What a level is

   One round: its room (floor and wallpaper), the furni standing in it, what
   falls from the ceiling, and the rules of the clock. The shape is defined in
   js/room-levels.js and is stored here verbatim — this endpoint does not
   understand the game, it stores and orders levels.

   `order` is the only field this file cares about beyond identity. Levels are
   played in that order, and the difficulty curve is expressed by the levels
   themselves rather than by anything computed here: a later level simply has a
   shorter dropDelayMs and a longer minDropDistance. Keeping the curve in the
   data rather than in code means a builder can break it deliberately — a
   breather round in the middle of a run — without arguing with a formula.

   ----------------------------------------------------------------------
   Why GET is deliberately thin

   The game asks for the levels on load, and a player should download the
   levels and nothing else. Furni artwork is resolved in the browser from the
   catalogue, and level documents carry class names rather than sprite URLs, so
   this payload stays small however large the catalogue grows. */

const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, isOwner, UNAUTHORIZED, forbidden } = require("./_auth");

/* Levels are OWNER-ONLY, which is stricter than the rest of the archive.
   Everywhere else an "admin" may write; here they may not. The level editor
   is the one tool that publishes something players load and run, so the
   circle of people who can change it is deliberately the smallest one.

   This is the real gate. The editor page also checks, but that check is a
   courtesy so the page can say why rather than loading a tool that will refuse
   to save — anyone can put ?edit=1 in an address bar, and nothing they do
   there matters unless it gets past this. */
const NOT_OWNER = forbidden("Only an owner account can change Fallin' Furni levels.");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

function slugify(text) {
    return (text || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "level";
}

/* Stored levels are trusted no more than any other request body. Only the
   fields a level is made of survive; anything else a caller sends is dropped
   rather than written, so the collection cannot be used as free storage and a
   stray _id or updatedAt in the body cannot overwrite the real one. */
function cleanLevel(body) {
    const pick = (o, keys) => {
        const out = {};
        for (const k of keys) if (o && o[k] !== undefined) out[k] = o[k];
        return out;
    };
    return {
        id: String(body.id || "").trim(),
        name: String(body.name || "").trim(),
        order: Number.isFinite(Number(body.order)) ? Number(body.order) : 0,
        published: body.published === true,
        /* The room's SHAPE, one of the Origins models by its letter — see
           js/room-layouts.js. Whitelisted like everything else here, and the
           note below on `zones` is exactly why it has to be added to this list
           and not just to the schema: a field this pick misses is dropped on
           every save, silently, and the level comes back in the wrong room. */
        model: typeof body.model === "string" ? body.model.slice(0, 4) : "a",
        floor: pick(body.floor || {}, ["pattern", "colour"]),
        wall: pick(body.wall || {}, ["pattern", "colour"]),
        start: pick(body.start || {}, ["x", "y"]),
        /* `z` is the decorative height from the editor's Advanced panel and
           `state` the on/off switch; both were authored, sanitised by
           js/room-levels.js and then dropped here, which is the exact failure
           the note below describes happening to `zones`. */
        decor: Array.isArray(body.decor) ? body.decor.slice(0, 200).map(d =>
            pick(d, ["className", "x", "y", "rotation", "state", "z"])) : [],
        /* A zone is an AREA and, separately, the items that rain into it (see
           js/room-levels.js). Whitelisting is what keeps this collection from
           being used as free storage, but it also means a field the schema
           gained and this list never heard of is silently thrown away — which
           is what happened to `zones` while this still read the flat `drops`
           list it replaced. Every save quietly emptied the level. */
        zones: Array.isArray(body.zones) ? body.zones.slice(0, 50).map(z => ({
            ...pick(z, ["id", "name"]),
            area: pick(z.area || {}, ["x", "y", "w", "h"]),
            items: Array.isArray(z.items) ? z.items.slice(0, 50).map(i =>
                pick(i, ["className", "rotation", "count", "role"])) : []
        })) : [],
        rules: pick(body.rules || {}, [
            "seconds", "dropDelayMs", "dropSpeedMs", "minDropDistance", "replayOrder"
        ])
    };
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const levels = db.collection("ff_levels");

    if (event.httpMethod === "GET") {
        const params = event.queryStringParameters || {};
        /* ?all=1 is the admin's route: unpublished levels included, and it
           needs a token. It 401s rather than falling back to the public list —
           a cacheable fallback on this URL would let one unauthenticated
           request poison what an admin reads next. Same reasoning as
           events.js. */
        if (params.all === "1") {
            if (!isAuthorized(event)) return UNAUTHORIZED;
            if (!(await isOwner(event))) return NOT_OWNER;
            const all = await levels.find({}, { projection: { _id: 0 } })
                .sort({ order: 1 }).toArray();
            return json(200, { count: all.length, levels: all });
        }
        const published = await levels.find({ published: true }, { projection: { _id: 0 } })
            .sort({ order: 1 }).toArray();
        return json(200, { count: published.length, levels: published });
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Body is not JSON" }); }

    if (event.httpMethod === "POST") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await isOwner(event))) return NOT_OWNER;

        const level = cleanLevel(body);
        if (!level.name) return json(400, { error: "A level needs a name" });
        if (!level.id) level.id = slugify(level.name);
        level.createdAt = new Date().toISOString();
        level.updatedAt = level.createdAt;

        await ensureUniqueIndex(levels, "id");
        try {
            await levels.insertOne({ ...level });
        } catch (e) {
            // Insert-and-catch rather than check-then-insert: two near
            // simultaneous requests can both pass a findOne.
            if (e && e.code === 11000) return json(409, { error: "A level with that id already exists" });
            throw e;
        }
        return json(201, level);
    }

    if (event.httpMethod === "PUT") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await isOwner(event))) return NOT_OWNER;
        if (!body.id) return json(400, { error: "Missing level id" });

        const update = cleanLevel(body);
        // Server-stamped, and after the clean so a stale value in the body
        // cannot wind the clock back.
        update.updatedAt = new Date().toISOString();
        const result = await levels.findOneAndUpdate(
            { id: update.id },
            { $set: update },
            { returnDocument: "after", projection: { _id: 0 } }
        );
        if (!result) return json(404, { error: "Level not found" });
        return json(200, result);
    }

    if (event.httpMethod === "DELETE") {
        if (!isAuthorized(event)) return UNAUTHORIZED;
        if (!(await isOwner(event))) return NOT_OWNER;
        const id = (event.queryStringParameters || {}).id;
        if (!id) return json(400, { error: "Missing level id" });
        const result = await levels.deleteOne({ id });
        if (result.deletedCount === 0) return json(404, { error: "Level not found" });
        return json(200, { deleted: id });
    }

    return json(405, { error: "Method not allowed" });
};
