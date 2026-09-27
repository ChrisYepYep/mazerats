/* /.netlify/functions/events — CRUD API for events. Mirrors rooms.js. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, hasAccount, canWrite, UNAUTHORIZED, READ_ONLY } = require("./_auth");
const { packRecords } = require("./_furni-payload");
const { cachedJson } = require("./_cache");
const { SECURITY_HEADERS } = require("./_headers");
const { describe: describeChanges, changedFields } = require("./_changes");
const { checkRecord } = require("./_url");
const { cleanArticle } = require("./article");
const { assignSlugs, settleSlug, idFor, PROJECTION: SLUG_FIELDS } = require("./_slugs");

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
    body: JSON.stringify(data)
});

// The admin form's fixed lists for an event (js/admin.js), held to here as
// well — see the same table in rooms.js for why.
const CHOICES = {
    status: ["upcoming", "past", "archive"],
    hotel: ["", "COM", "ES", "BR"],
    ecSeason: ["", "s1", "s2"]
};

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

const CONFLICT = "Someone else saved this record since you opened it - reload it to see their changes.";

async function handle(event) {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        // Detail to the log, not the public — see rooms.js.
        console.error("events: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const events = db.collection("events");

    if (event.httpMethod === "GET") {
        let all;
        try {
            all = await events.find({}, { projection: { _id: 0 } }).toArray();
        } catch (e) {
            console.error("events: read failed", e);
            return json(503, { error: "The archive could not be read just now." });
        }
        // Every event's address — see the same step in rooms.js.
        const slugs = assignSlugs(all, "event");
        all.forEach(r => { r.slug = slugs.get(r.id) || r.id; });
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
        // which is the same event data at a fraction of the size, cached at
        // the edge. js/api.js unpacks it.
        const params = event.queryStringParameters || {};
        if (params.full === "1") {
            // A live account, not just a signed token — see rooms.js.
            if (!(await hasAccount(event))) return UNAUTHORIZED;
            return cachedJson(event, all, { cache: false });
        }
        all.forEach(r => { delete r.slugAliases; delete r.slugManual; });
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

    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return json(400, { error: "Invalid request body" });
        }
        /* "live" is a status the pages work out from the dates (see
           js/event-status.js), never one that is stored — but the /warren
           form fills its status field by the same rule, so an event saved
           while it was running arrived as "live" and was refused. That was
           every edit to the launch event from 08:00 on launch day. Stored
           as "upcoming", which is what the dates then override anyway. */
        if (body.status === "live") body.status = "upcoming";
        const problem = checkRecord(body, CHOICES);
        if (problem) return json(400, { error: problem });
        /* The stored article is set as innerHTML in every visitor's event
           modal, so it is sanitised HERE, on the way in, and not only where
           article.js fetched it — see cleanArticle for why that was not
           enough. A falsy article is the form clearing it, and is kept. */
        if (body.article) body.article = cleanArticle(body.article);
    }

    if (event.httpMethod === "POST") {
        // A string, because the address is made from it with string methods.
        if (!body.title || typeof body.title !== "string") return json(400, { error: "An event needs at least a title" });

        await ensureUniqueIndex(events, "id");

        const everyEvent = () => events.find({}, { projection: SLUG_FIELDS }).toArray();
        const slugProblem = settleSlug(await everyEvent(), "event", null, body);
        if (slugProblem) return json(400, { error: slugProblem });

        // Attempt-and-retry-on-collision rather than check-then-insert —
        // see the identical comment in rooms.js for why (a findOne() check
        // beforehand can't stop two near-simultaneous requests both seeing
        // "id free" before either insert lands).
        // When this entered the archive, as against when the event itself
        // is scheduled for — see the same field in rooms.js for why the two
        // have to be told apart.
        const createdAt = new Date().toISOString();
        // The settled address, or the nearest free thing — see rooms.js.
        let id = idFor(await everyEvent(), "event", body.slug);
        for (let attempt = 0; ; attempt++) {
            // The server's timestamp wins, as in rooms.js.
            const item = { ...body, createdAt, id };
            delete item._id;
            try {
                await events.insertOne(item);
                const { _id, ...clean } = item;
                return json(201, clean);
            } catch (e) {
                if (e.code === 11000 && attempt < 50) {
                    id = idFor(await everyEvent(), "event", body.slug);
                    continue;
                }
                throw e;
            }
        }
    }

    if (event.httpMethod === "PUT") {
        // A string, not merely truthy — an object would be a query operator
        // in the filter below. See the same check in rooms.js.
        if (!body.id || typeof body.id !== "string") return json(400, { error: "Missing event id" });
        // createdAt is set once, on insert — never by an edit.
        const { _id, createdAt: _ignored, ...update } = body;
        // Never a client-sent change list — see the same line in rooms.js.
        delete update.changes;
        // The version the editor started from; never stored. See rooms.js.
        const hasBase = Object.prototype.hasOwnProperty.call(update, "_baseUpdatedAt");
        const base = hasBase ? stamp(update._baseUpdatedAt) : null;
        delete update._baseUpdatedAt;
        // When this last changed — server-stamped, and after the spread so a
        // stale value in the body cannot wind the clock back. See the same
        // field in rooms.js.
        update.updatedAt = new Date().toISOString();

        // What changed, on the same terms as rooms.js — see the long note
        // there. Read before the write because the write is what destroys the
        // answer, and unable to fail the save.
        let previous = null;
        try {
            previous = await events.findOne({ id: body.id });
        } catch (e) { /* the update below reports a missing record on its own */ }

        // Somebody else saved it since the form opened — refused rather
        // than written over. See the same check in rooms.js.
        if (base !== null && previous && stamp(previous.updatedAt) !== base) {
            return json(409, { error: CONFLICT, conflict: true });
        }

        // Its address — see the same step in rooms.js.
        if (previous) {
            const slugProblem = settleSlug(await events.find({}, { projection: SLUG_FIELDS }).toArray(), "event", previous, update);
            if (slugProblem) return json(400, { error: slugProblem });
        } else {
            // Not settled, so not stored — see the same step in rooms.js.
            delete update.slug;
            delete update.slugAliases;
            delete update.slugManual;
            delete update._slugAuto;
        }

        // A save that changes nothing does not move updatedAt or the change
        // list — see the same block in rooms.js.
        const moved = changedFields(previous, update);
        if (moved && moved.length === 0) {
            delete update.updatedAt;
            delete update.changes;
        } else {
            const changed = describeChanges(previous, update);
            if (changed) update.changes = changed;
        }

        const result = await events.findOneAndUpdate(
            versionFilter(body.id, base),
            { $set: update },
            { returnDocument: "after", projection: { _id: 0 } }
        );
        if (!result) {
            if (base !== null && await events.findOne({ id: body.id }, { projection: { _id: 1 } })) {
                return json(409, { error: CONFLICT, conflict: true });
            }
            return json(404, { error: "Event not found" });
        }
        return json(200, result);
    }

    if (event.httpMethod === "DELETE") {
        const id = (event.queryStringParameters || {}).id;
        if (!id) return json(400, { error: "Missing event id" });
        const result = await events.deleteOne({ id });
        if (result.deletedCount === 0) return json(404, { error: "Event not found" });
        return json(200, { deleted: id });
    }

    return json(405, { error: "Method not allowed" });
}

/* A write that fails at the database — a slow or unreachable cluster, a
   lost connection mid-save — used to throw straight out of the handler,
   which Netlify answers with a bare 502 and an HTML body the admin page
   cannot read, or with Lambda's own error JSON and its stack trace. Caught
   once here, so every route answers with something the form can show. */
exports.handler = async (event) => {
    try {
        return await handle(event);
    } catch (e) {
        console.error("events: request failed", e);
        return json(503, { error: "The archive couldn't be saved just now. Try again in a minute." });
    }
};
