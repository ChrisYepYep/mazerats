/* /.netlify/functions/rooms — CRUD API for maze rooms.
   GET is public (the site needs to read it to render). POST/PUT/DELETE
   require the x-admin-token header to carry a valid session token from
   logging in on the admin page (see auth.js and _auth.js). */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, canWrite, UNAUTHORIZED, READ_ONLY } = require("./_auth");
const { packRecords } = require("./_furni-payload");
const { cachedJson } = require("./_cache");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

function slugify(text) {
    return (text || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "room";
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const rooms = db.collection("rooms");

    if (event.httpMethod === "GET") {
        const all = await rooms.find({}, { projection: { _id: 0 } }).toArray();
        // ?full=1 is the admin page's route: the records exactly as stored,
        // every reviewer field and hidden detection included, because that is
        // what the admin editor works on.
        //
        // It requires a token and is never cached — and it 401s rather than
        // quietly falling back to the public payload, because a cacheable
        // fallback on this URL is a trap: the CDN would store whatever the
        // first caller got and hand that same body to the next one, so one
        // unauthenticated request could leave an admin reading the packed
        // public form for the next minute.
        //
        // Everything else gets the packed public form (see _furni-payload.js),
        // which is the same room data at a fraction of the size, cached at
        // the edge. js/api.js unpacks it.
        const params = event.queryStringParameters || {};
        if (params.full === "1") {
            if (!isAuthorized(event)) return UNAUTHORIZED;
            return cachedJson(event, all, { cache: false });
        }
        return cachedJson(event, await packRecords(all));
    }

    if (!isAuthorized(event)) return UNAUTHORIZED;
    // canWrite, not isAuthorized: a viewer is a real logged-in account and
    // passes isAuthorized quite correctly — it just isn't allowed to change
    // anything. See _auth.js.
    if (!(await canWrite(event))) return READ_ONLY;

    // Parsed once, and guarded: an unparseable body used to throw straight
    // out of the handler, which Netlify turns into a bare 502 with nothing
    // in it for the caller. The other write endpoints on this site have
    // always answered 400 here.
    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }

    if (event.httpMethod === "POST") {
        if (!body.name) return json(400, { error: "A room needs at least a name" });

        await ensureUniqueIndex(rooms, "id");

        // Attempt-and-retry-on-collision rather than check-then-insert —
        // a findOne() check beforehand can't stop two near-simultaneous
        // requests from both seeing "id free" before either insert lands,
        // producing two rooms with the same id. The unique index above
        // makes Mongo itself reject the second insert atomically instead.
        let id = slugify(body.name);
        let suffix = 2;
        for (let attempt = 0; ; attempt++) {
            const room = { ...body, id };
            delete room._id;
            try {
                await rooms.insertOne(room);
                const { _id, ...clean } = room;
                return json(201, clean);
            } catch (e) {
                if (e.code === 11000 && attempt < 50) {
                    id = `${slugify(body.name)}-${suffix++}`;
                    continue;
                }
                throw e;
            }
        }
    }

    if (event.httpMethod === "PUT") {
        if (!body.id) return json(400, { error: "Missing room id" });
        const { _id, ...update } = body;
        const result = await rooms.findOneAndUpdate(
            { id: body.id },
            { $set: update },
            { returnDocument: "after", projection: { _id: 0 } }
        );
        if (!result) return json(404, { error: "Room not found" });
        return json(200, result);
    }

    if (event.httpMethod === "DELETE") {
        const id = (event.queryStringParameters || {}).id;
        if (!id) return json(400, { error: "Missing room id" });
        const result = await rooms.deleteOne({ id });
        if (result.deletedCount === 0) return json(404, { error: "Room not found" });
        return json(200, { deleted: id });
    }

    return json(405, { error: "Method not allowed" });
};
