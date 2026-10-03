/* /.netlify/functions/contributors — CRUD API for the console modal's
   Contributors page. Mirrors rooms.js/events.js. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, hasAccount, canWrite, refuseWrite, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson } = require("./_cache");

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

/* ONE CONTRIBUTOR PER NAME (30 Sept 2026). Nothing stopped a second
   "Markeh" being added beside "markeh", and the console then listed the
   same person twice with their credits split between the two — while a
   credited Missing Pieces lead (dead-end-leads.js) finds its contributor by
   name case-insensitively and only ever adds to the first it meets. So a
   new contributor, or a rename, is refused when another row already has
   that name, ignoring case and spaces at either end — the same rule the
   credit uses. `duplicate: true` lets the form tell this 409 from the
   stale-row one. Checked, not indexed: two admins adding the same name in
   the same second could still both land, which is rare enough to leave. */
const DUPLICATE = "There is already a contributor called that.";

async function nameTaken(contributors, name, exceptId) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const q = { username: { $regex: `^\\s*${escaped}\\s*$`, $options: "i" } };
    if (exceptId) q.id = { $ne: exceptId };
    return !!(await contributors.findOne(q, { projection: { _id: 1 } }));
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
            /* ?full=1 only for an admin account (3 Oct 2026), as dead-ends.js
               and picks.js gate theirs: anybody could ask for it, and it
               skipped the edge and read the whole collection every time.
               Without one it is sent to the plain address, which the edge
               answers. Redirected rather than answered here, because a
               cached copy filed under ?full=1 is what an admin's own ?full=1
               would then be handed — the edge does not look at the token. */
            const full = (event.queryStringParameters || {}).full === "1";
            if (full && !(await hasAccount(event))) {
                return { statusCode: 302, headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store", Location: "/.netlify/functions/contributors" }, body: "" };
            }
            const all = await contributors.find({}, { projection: { _id: 0 } }).toArray();
            /* Through the edge, as rooms and events are (2 Oct 2026). This
               went to Mongo on every open of the console's Contributors page
               — the same answer for everybody, with no cache header at all.
               The Warren asks with ?full=1 (getContributors in js/api.js),
               which stays uncached exactly as before, so an admin reading
               the list straight after a save reads the truth. Keyed on
               `full` alone, so a random parameter is not a way past it. */
            if (full) return json(200, all);
            return cachedJson(event, all, { vary: "full" });
        } catch (e) {
            console.error("contributors: read failed", e);
            // A token whose account could not be looked up: retry, not 401.
            if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
            return json(503, { error: "The contributors could not be read just now." });
        }
    }

    /* The write half inside one try, as the GET above is: the inserts and
       updates had nothing around them (the insert loop even rethrows on
       purpose), so a database that dropped mid-save answered with Lambda's
       stack trace — and canWrite now throws when the account lookup cannot
       be made (lookUpRole in _auth.js), which has to reach the admin page
       as a 503, not the 401 that signs it out. */
    try {
        return await write(event, contributors);
    } catch (e) {
        console.error("contributors: write failed", e);
        /* Only the tagged lookup failure is an outage to retry; anything
           else is a fault, and answering it as "unavailable" hid it. */
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        return json(500, { error: "The contributor could not be saved." });
    }
};

async function write(event, contributors) {
    if (!isAuthorized(event)) return UNAUTHORIZED;
    // canWrite, not isAuthorized: a viewer is a real logged-in account and
    // passes isAuthorized quite correctly — it just isn't allowed to change
    // anything. See _auth.js. refuseWrite words the refusal, and answers a
    // deleted account's token with the 401 it has earned.
    if (!(await canWrite(event))) return await refuseWrite(event);

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
        if (await nameTaken(contributors, fields.username)) return json(409, { error: DUPLICATE, duplicate: true });

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
        /* A rename onto somebody else's name. Only a real rename is
           checked: a save that keeps the row's own name (in any case) goes
           through, so a pair of same-named rows from before this rule can
           still be edited — and one of them renamed — rather than both
           being locked. */
        if (fields.username) {
            const current = await contributors.findOne({ id: body.id }, { projection: { _id: 0, username: 1 } });
            const same = current && String(current.username || "").trim().toLowerCase() === fields.username.toLowerCase();
            if (!same && await nameTaken(contributors, fields.username, body.id)) {
                return json(409, { error: DUPLICATE, duplicate: true });
            }
        }

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
}

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("contributors", exports.handler);
