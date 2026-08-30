/* /.netlify/functions/contributors — CRUD API for the console modal's
   Contributors page. Mirrors rooms.js/events.js. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, canWrite, UNAUTHORIZED, READ_ONLY } = require("./_auth");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

function slugify(text) {
    return (text || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "contributor";
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const contributors = db.collection("contributors");

    if (event.httpMethod === "GET") {
        const all = await contributors.find({}, { projection: { _id: 0 } }).toArray();
        return json(200, all);
    }

    if (!isAuthorized(event)) return UNAUTHORIZED;
    // canWrite, not isAuthorized: a viewer is a real logged-in account and
    // passes isAuthorized quite correctly — it just isn't allowed to change
    // anything. See _auth.js.
    if (!(await canWrite(event))) return READ_ONLY;

    if (event.httpMethod === "POST") {
        const body = JSON.parse(event.body || "{}");
        if (!body.username) return json(400, { error: "A contributor needs at least a username" });

        await ensureUniqueIndex(contributors, "id");

        // Attempt-and-retry-on-collision rather than check-then-insert —
        // see the identical comment in rooms.js for why (a findOne() check
        // beforehand can't stop two near-simultaneous requests both seeing
        // "id free" before either insert lands).
        let id = slugify(body.username);
        let suffix = 2;
        for (let attempt = 0; ; attempt++) {
            const contributor = { ...body, id };
            delete contributor._id;
            try {
                await contributors.insertOne(contributor);
                const { _id, ...clean } = contributor;
                return json(201, clean);
            } catch (e) {
                if (e.code === 11000 && attempt < 50) {
                    id = `${slugify(body.username)}-${suffix++}`;
                    continue;
                }
                throw e;
            }
        }
    }

    if (event.httpMethod === "PUT") {
        const body = JSON.parse(event.body || "{}");
        if (!body.id) return json(400, { error: "Missing contributor id" });
        const { _id, ...update } = body;
        const result = await contributors.findOneAndUpdate(
            { id: body.id },
            { $set: update },
            { returnDocument: "after", projection: { _id: 0 } }
        );
        if (!result) return json(404, { error: "Contributor not found" });
        return json(200, result);
    }

    if (event.httpMethod === "DELETE") {
        const id = (event.queryStringParameters || {}).id;
        if (!id) return json(400, { error: "Missing contributor id" });
        const result = await contributors.deleteOne({ id });
        if (result.deletedCount === 0) return json(404, { error: "Contributor not found" });
        return json(200, { deleted: id });
    }

    return json(405, { error: "Method not allowed" });
};
