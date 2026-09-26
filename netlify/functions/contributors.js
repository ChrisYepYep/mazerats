/* /.netlify/functions/contributors — CRUD API for the console modal's
   Contributors page. Mirrors rooms.js/events.js. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, canWrite, UNAUTHORIZED, READ_ONLY } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
    body: JSON.stringify(data)
});

function slugify(text) {
    return (text || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "contributor";
}

// The edit-conflict check, as in rooms.js — see the notes there.
function stamp(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString();
    return v ? String(v) : "";
}

function versionFilter(id, base) {
    if (base === null) return { id };
    if (!base) return { id, updatedAt: { $in: [null, ""] } };
    const at = new Date(base);
    return { id, updatedAt: { $in: isNaN(at.getTime()) ? [base] : [base, at] } };
}

const CONFLICT = "Someone else saved this contributor since you opened it - reload it to see their changes.";

// Same cap as a Habbo name sent with a lead (dead-end-leads.js).
const USERNAME_MAX = 60;

/* The fields a contributor row is made of, and nothing else.

   Whatever the body carried used to be $set straight onto the row, so any
   signed-in writer could park arbitrary keys (or a 5MB string) on a record
   the public console reads. These are exactly what the admin form sends
   (js/admin.js, "console: contributors") and what the console renders
   (js/console.js, contributorHtml). A field that is absent is left alone;
   one that is present and the wrong shape is refused rather than guessed
   at. Returns { fields } or { error }. */
function cleanContributor(body) {
    const out = {};
    const idList = (v, label) => {
        if (!Array.isArray(v) || v.length > 5000 || !v.every(x => typeof x === "string" && x.length <= 200)) {
            return { error: `${label} must be a list of record ids` };
        }
        return { value: Array.from(new Set(v)) };
    };
    if ("username" in body) {
        if (typeof body.username !== "string") return { error: "The username must be text" };
        const name = body.username.trim();
        if (!name || name.length > USERNAME_MAX) return { error: `A username is 1-${USERNAME_MAX} characters` };
        out.username = name;
    }
    if ("types" in body) {
        const t = body.types;
        if (!Array.isArray(t) || t.length > 20 || !t.every(x => typeof x === "string" && x.length <= 60)) {
            return { error: "Contribution types must be a short list of labels" };
        }
        out.types = Array.from(new Set(t));
    }
    for (const [field, label] of [["mazes", "Mazes"], ["events", "Events"]]) {
        if (!(field in body)) continue;
        const r = idList(body[field], label);
        if (r.error) return r;
        out[field] = r.value;
    }
    for (const field of ["extra", "count"]) {
        if (!(field in body)) continue;
        const n = body[field];
        if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: `${field} must be a whole number` };
        out[field] = n;
    }
    return { fields: out };
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("contributors: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const contributors = db.collection("contributors");

    if (event.httpMethod === "GET") {
        try {
            const all = await contributors.find({}, { projection: { _id: 0 } }).toArray();
            return json(200, all);
        } catch (e) {
            console.error("contributors: read failed", e);
            return json(503, { error: "The contributors could not be read just now." });
        }
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

    let fields = {};
    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
        // `null`, a number or an array all parse, and the old code then
        // read .username off them (or spread an array into the row).
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return json(400, { error: "Invalid request body" });
        }
        const cleaned = cleanContributor(body);
        if (cleaned.error) return json(400, { error: cleaned.error });
        fields = cleaned.fields;
    }

    if (event.httpMethod === "POST") {
        if (!fields.username) return json(400, { error: "A contributor needs at least a username" });

        await ensureUniqueIndex(contributors, "id");

        // Attempt-and-retry-on-collision rather than check-then-insert —
        // see the identical comment in rooms.js for why (a findOne() check
        // beforehand can't stop two near-simultaneous requests both seeing
        // "id free" before either insert lands).
        let id = slugify(fields.username);
        let suffix = 2;
        for (let attempt = 0; ; attempt++) {
            const contributor = { ...fields, id };
            try {
                await contributors.insertOne(contributor);
                const { _id, ...clean } = contributor;
                return json(201, clean);
            } catch (e) {
                if (e.code === 11000 && attempt < 50) {
                    id = `${slugify(fields.username)}-${suffix++}`;
                    continue;
                }
                throw e;
            }
        }
    }

    if (event.httpMethod === "PUT") {
        if (typeof body.id !== "string" || !body.id) return json(400, { error: "Missing contributor id" });
        if (!Object.keys(fields).length) return json(400, { error: "Nothing to save" });

        /* SOMEBODY ELSE SAVED IT FIRST — the same check rooms.js makes,
           and here for the same reason: this was last-save-wins, and it is
           not only two admins who write these rows. Accepting a Missing
           Pieces lead with "credit" adds to a contributor's lists
           (dead-end-leads.js), so an admin form opened before that accept
           used to save straight over the credit. The form sends the
           updatedAt it read; if the row has moved on, the save is refused
           and the form stays open. Absent means a caller that does not
           take part, as in rooms.js. */
        const hasBase = Object.prototype.hasOwnProperty.call(body, "_baseUpdatedAt");
        const base = hasBase ? stamp(body._baseUpdatedAt) : null;
        const update = { ...fields, updatedAt: new Date().toISOString() };

        const result = await contributors.findOneAndUpdate(
            versionFilter(body.id, base),
            { $set: update },
            { returnDocument: "after", projection: { _id: 0 } }
        );
        if (!result) {
            if (base !== null && await contributors.findOne({ id: body.id }, { projection: { _id: 1 } })) {
                return json(409, { error: CONFLICT, conflict: true });
            }
            return json(404, { error: "Contributor not found" });
        }
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
