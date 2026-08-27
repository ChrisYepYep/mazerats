/* /.netlify/functions/rooms — CRUD API for maze rooms.
   GET is public (the site needs to read it to render). POST/PUT/DELETE
   require the x-admin-token header to carry a valid session token from
   logging in on the admin page (see auth.js and _auth.js). */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, UNAUTHORIZED } = require("./_auth");

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
        return json(200, all);
    }

    if (!isAuthorized(event)) return UNAUTHORIZED;

    if (event.httpMethod === "POST") {
        const body = JSON.parse(event.body || "{}");
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
        const body = JSON.parse(event.body || "{}");
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
