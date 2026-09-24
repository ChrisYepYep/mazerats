/* /.netlify/functions/tags — shared vocabulary of maze tags shown as
   clickable chips in the admin's maze form. GET is public (auto-seeded
   with the default set the first time it's ever called); adding a new tag
   requires an admin session, same as rooms.js/events.js. There's no
   edit/delete here — only adding new tags was asked for. */
const { getDb } = require("./_db");
const { isAuthorized, canWrite, UNAUTHORIZED, READ_ONLY } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
    body: JSON.stringify(data)
});

const DEFAULT_TAGS = ["FURNI MAZE", "ILLUSION", "FLOATING", "FUNCTIONAL", "LONG-FORM"];

// Anything off the wire is text or it is nothing: `(body.x || "").trim()`
// throws outright on an object, turning a crafted request into an unhandled
// 500. Coerced first, then refused by the ordinary checks below.
const text = (v) => (typeof v === "string" ? v : "");

const TAG_MAX_LENGTH = 40;

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("tags: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const tags = db.collection("tags");

    if (event.httpMethod === "GET") {
        try {
            const count = await tags.countDocuments();
            if (count === 0) {
                await tags.insertMany(
                    DEFAULT_TAGS.map((label, i) => ({ label, createdAt: new Date(Date.now() + i).toISOString() }))
                );
            }
            const all = await tags.find({}, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray();
            return json(200, all.map(t => t.label));
        } catch (e) {
            console.error("tags: read failed", e);
            return json(503, { error: "The tag list could not be read just now." });
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

    if (event.httpMethod === "POST") {
        /* A tag is a short word or two on a chip, and it is written into
           markup in the admin page and on the archive. Characters that only
           ever matter to HTML are taken out rather than trusted to be
           escaped at every place that draws one, and the length is capped
           well above any real tag. Collapsing runs of space keeps
           "FURNI  MAZE" from becoming a second FURNI MAZE. */
        const label = text(body.label)
            .replace(/[<>"'`]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, TAG_MAX_LENGTH)
            .trim();
        if (!label) return json(400, { error: "A tag needs a label" });

        const all = await tags.find({}, { projection: { _id: 0 } }).toArray();
        const existing = all.find(t => t.label.toLowerCase() === label.toLowerCase());
        if (existing) return json(200, { label: existing.label });

        await tags.insertOne({ label, createdAt: new Date().toISOString() });
        return json(201, { label });
    }

    return json(405, { error: "Method not allowed" });
};
