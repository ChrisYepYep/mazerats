/* /.netlify/functions/rooms — CRUD API for maze rooms.
   GET is public (the site needs to read it to render). POST/PUT/DELETE
   require the x-admin-token header to carry a valid session token from
   logging in on the admin page (see auth.js and _auth.js). */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, hasAccount, canWrite, UNAUTHORIZED, READ_ONLY } = require("./_auth");
const { packRecords } = require("./_furni-payload");
const { cachedJson } = require("./_cache");
const { SECURITY_HEADERS } = require("./_headers");
const { describe: describeChanges, changedFields } = require("./_changes");
const { checkRecord } = require("./_url");
const { cleanArticle } = require("./article");

const json = (statusCode, data) => ({
    statusCode,
    headers: SECURITY_HEADERS,
    body: JSON.stringify(data)
});

/* The fields the admin form offers as fixed lists (see js/admin.js), held
   to those lists here too. The pages write some of these into class names
   and markup, and the form's <select> was the only thing keeping them tidy —
   which is no guard at all against a request that did not come from the
   form. Blank is allowed where the form offers "Not rated" / "Unknown". */
const DIFFICULTIES = ["", "easy", "medium", "hard", "very-hard", "extreme"];
const STATUSES = ["open", "closed", "collab", "unknown"];
const HOTELS = ["", "COM", "ES", "BR"];
const CHOICES = { difficulty: DIFFICULTIES, status: STATUSES, hotel: HOTELS };

function slugify(text) {
    return (text || "").toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "room";
}

/* ---- the edit-conflict check (PUT with _baseUpdatedAt) ----

   updatedAt as one comparable string. Written by this function as an ISO
   string, but a Date is accepted too, so a record touched by some other
   tool compares by the instant rather than by how it was stored. */
function stamp(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString();
    return v ? String(v) : "";
}

// The record, but only at the version the editor started from. A record
// never edited since updatedAt existed has none, and "" matches that.
function versionFilter(id, base) {
    if (base === null) return { id };
    if (!base) return { id, updatedAt: { $in: [null, ""] } };
    const at = new Date(base);
    return { id, updatedAt: { $in: isNaN(at.getTime()) ? [base] : [base, at] } };
}

const CONFLICT = "Someone else saved this record since you opened it - reload it to see their changes.";

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        // The reason goes to the function log, not to the public: a driver
        // error names hosts and settings nobody outside needs to read.
        console.error("rooms: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const rooms = db.collection("rooms");

    if (event.httpMethod === "GET") {
        let all;
        try {
            all = await rooms.find({}, { projection: { _id: 0 } }).toArray();
        } catch (e) {
            console.error("rooms: read failed", e);
            return json(503, { error: "The archive could not be read just now." });
        }
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
            // hasAccount, not isAuthorized: a signed token for an account
            // that has since been deleted, or whose password has been reset,
            // is not a reviewer any more. One indexed lookup, on an admin-only
            // route the public payload below never takes.
            if (!(await hasAccount(event))) return UNAUTHORIZED;
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
    /* A body that parses is not yet an object. `null`, a number or an array
       are all valid JSON, and the trim just below reads fields off whatever
       arrived — so `null` was an unhandled throw rather than a refusal. Same
       check events.js makes. */
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(400, { error: "Invalid request body" });
    }

    /* Names arrive with whatever whitespace the form was given.

       "andrejs hard maze " sat in the archive with a trailing space for as
       long as it had been catalogued: invisible in the admin field it was
       typed into, and carried into the row heading, the sort order, the
       share link's title and the <title> of its own preview page.

       Trimmed on the way in rather than cleaned up afterwards, so it cannot
       come back the next time somebody pastes a name with a stray space on
       the end. Only the fields where leading or trailing space is always an
       accident — the description and details are prose and are left alone. */
    ["name", "creator", "hotel", "habboLink"].forEach(field => {
        if (typeof body[field] === "string") body[field] = body[field].trim();
    });

    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
        const problem = checkRecord(body, CHOICES);
        if (problem) return json(400, { error: problem });
        /* The admin form only attaches articles to events, but the page's
           renderer does not ask which collection a record came from — so a
           room carrying one gets the same sanitising events.js gives it. */
        if (body.article) body.article = cleanArticle(body.article);
    }

    if (event.httpMethod === "POST") {
        // A string, because slugify below calls string methods on it: a
        // name sent as a number or an object was a 500, not a refusal.
        if (!body.name || typeof body.name !== "string") return json(400, { error: "A room needs at least a name" });

        await ensureUniqueIndex(rooms, "id");

        // Attempt-and-retry-on-collision rather than check-then-insert —
        // a findOne() check beforehand can't stop two near-simultaneous
        // requests from both seeing "id free" before either insert lands,
        // producing two rooms with the same id. The unique index above
        // makes Mongo itself reject the second insert atomically instead.
        /* When this maze entered the archive, as opposed to when the maze
           itself opened in the hotel (which is what "added" holds, and is
           often years earlier). The two are different facts and the site
           now needs both: What's New on the homepage is a list of what has
           just been catalogued, and sorting that by the opening date would
           put a maze built in 2024 and added yesterday below one built last
           week. Stamped by the server rather than sent by the admin form —
           it is a record of when the write happened, and only the server
           knows that. Records written before this field existed simply
           don't have it, and the homepage falls back to their opening date.

           Kept out of the collision retry below so every attempt carries
           the same timestamp. */
        const createdAt = new Date().toISOString();
        let id = slugify(body.name);
        let suffix = 2;
        for (let attempt = 0; ; attempt++) {
            /* createdAt AFTER the body: it is the server's fact, and the
               daily games now read it (existedBefore in netlify/functions/
               _daily.js) to keep a maze out of a day that had already been
               dealt. A body carrying its own could back-date a maze into
               today's pool and re-deal it for everyone mid-game. */
            const room = { ...body, createdAt, id };
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
        /* A string, not merely truthy. An object here goes into the filter
           below as a query — {"id":{"$ne":""}} would match whichever room
           Mongo found first and overwrite it. */
        if (!body.id || typeof body.id !== "string") return json(400, { error: "Missing room id" });
        // createdAt is written once, on insert, and never by an edit — see
        // the POST above for what reads it.
        const { _id, createdAt: _ignored, ...update } = body;

        /* Never a client's change list. The admin form used to send the
           stored one straight back (it spreads the record it read), and
           below, a save describeChanges could not describe kept whatever
           arrived — so the What's New line could be any list a browser
           cared to send. The server works it out or leaves it alone. */
        delete update.changes;

        /* The version the editor started from, for the conflict check
           below. Taken off the update so it is never stored. Absent means a
           caller that does not take part (nothing else writes this route
           today, but the check stays opt-in rather than breaking one). */
        const hasBase = Object.prototype.hasOwnProperty.call(update, "_baseUpdatedAt");
        const base = hasBase ? stamp(update._baseUpdatedAt) : null;
        delete update._baseUpdatedAt;

        /* When this record last changed, stamped here rather than sent by
           the admin form: it is a fact about the write, and only the server
           can be trusted to know it. What's New on the homepage shows it
           beside the archived date, so a maze that gained ten new room
           shots last week says so rather than looking untouched since the
           day it was catalogued.

           After the spread, so a body that happens to carry an older
           updatedAt of its own (a form that read the record, sat open, and
           saved) cannot write the clock backwards. */
        update.updatedAt = new Date().toISOString();

        /* WHAT changed, not just that something did — read before the write,
           because the write is what destroys the answer. $set overwrites the
           record, so the only moment both versions exist is this one.
           What's New prints a line from it (see js/home.js); describe returns
           stable keys rather than sentences so the wording can be rewritten
           without touching stored records.

           One extra read per save, on a path used by one person a few times
           a day. If two saves of the same record overlapped, the later one
           could describe itself against a document the earlier had already
           moved — a slightly wrong list on a changelog line, which is the
           least important thing in this function and not worth a transaction.

           NOTHING HERE CAN FAIL THE SAVE. describe swallows its own errors
           and returns null, this reads the previous document defensively, and
           the field is only set when there is genuinely a list to set. A maze
           that saves without its changelog line is fine; a maze that does not
           save is not. */
        let previous = null;
        try {
            previous = await rooms.findOne({ id: body.id });
        } catch (e) { /* the update below reports a missing record on its own */ }

        /* SOMEBODY ELSE SAVED IT FIRST. Two admins with the same maze open
           used to be last-save-wins: the second Save wrote the whole record
           from a copy read before the first, and the first admin's work
           vanished without a word to either of them. The form now says
           which version it started from; if the stored one has moved on,
           the save is refused and the form stays open with its edits.

           Furni scans write straight to the database without touching
           updatedAt, so a scan never trips this — the form avoids
           overwriting one by not sending furni it did not change. */
        if (base !== null && previous && stamp(previous.updatedAt) !== base) {
            return json(409, { error: CONFLICT, conflict: true });
        }

        /* A save that changes nothing is still written — the form may have
           tidied a value's representation (a trimmed name, "" for null) and
           that is worth keeping — but it does not move updatedAt and does
           not touch the change list. Otherwise pressing Save on an untouched
           maze put it at the top of What's New as "Updated" that day.
           changedFields returns null when it cannot tell, and that is read
           as an ordinary save: a missed changelog line is the lesser harm. */
        const moved = changedFields(previous, update);
        if (moved && moved.length === 0) {
            delete update.updatedAt;
            delete update.changes;
        } else {
            const changed = describeChanges(previous, update);
            if (changed) update.changes = changed;
        }

        // The version condition is in the filter too, so two saves racing
        // between the read above and this write cannot both pass.
        const result = await rooms.findOneAndUpdate(
            versionFilter(body.id, base),
            { $set: update },
            { returnDocument: "after", projection: { _id: 0 } }
        );
        if (!result) {
            if (base !== null && await rooms.findOne({ id: body.id }, { projection: { _id: 1 } })) {
                return json(409, { error: CONFLICT, conflict: true });
            }
            return json(404, { error: "Room not found" });
        }
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
