/* /.netlify/functions/events — CRUD API for events. Mirrors rooms.js. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, hasAccount, canWrite, refuseWrite, UNAUTHORIZED } = require("./_auth");
const { packRecords } = require("./_furni-payload");
const { cachedJson } = require("./_cache");
const { SECURITY_HEADERS } = require("./_headers");
const { describe: describeChanges, changedFields, canon } = require("./_changes");
const { checkRecord } = require("./_url");
const { cleanArticle } = require("./article");
const { assignSlugs, settleSlug, idFor, recheckSlug, loadRetired, retireAddresses, PROJECTION: SLUG_FIELDS } = require("./_slugs");

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

/* SPOTLIGHT (30 Sept 2026, the owner's): an event on the landing page's
   spotlight — see spotlightFieldsHtml in js/admin.js and showSpotlight in
   js/welcome.js. Five fields, each checked and put in its one shape here,
   in place on the body, so what is stored is always something the page can
   read: `spotlight` a boolean, `spotlightFrom` / `spotlightUntil` a UTC
   instant or "", the end after the start, `spotlightCaption` plain text of
   80 characters at most, `spotlightColour` "#rrggbb" or "". A body that
   leaves them out (an older editor, the bulk tools) leaves them alone. */
const SPOTLIGHT_CAPTION_MAX = 80;
const SPOTLIGHT_FIELDS = ["spotlight", "spotlightFrom", "spotlightUntil", "spotlightCaption", "spotlightColour"];
/* An instant, spelled as one (30 Sept 2026): a date, a time, and a zone.
   Date.parse alone took "2026", "Oct 3" and a zoneless "2026-10-03T08:00",
   and read the last two in the SERVER's own zone — UTC on Netlify, but an
   hour out under `netlify dev` on a machine in BST. The form always sends
   "…T08:00:00Z" (pairIso in js/admin.js), which this passes. */
const SPOTLIGHT_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
function checkSpotlight(body) {
    const has = k => Object.prototype.hasOwnProperty.call(body, k);
    if (has("spotlight")) body.spotlight = body.spotlight === true || body.spotlight === "1" || body.spotlight === 1;
    for (const k of ["spotlightFrom", "spotlightUntil"]) {
        if (!has(k)) continue;
        const v = body[k];
        if (v === null || v === "") { body[k] = ""; continue; }
        if (typeof v !== "string" || !SPOTLIGHT_INSTANT.test(v.trim()) || isNaN(Date.parse(v.trim()))) {
            return "A spotlight date isn't a date the site can read.";
        }
        body[k] = new Date(v.trim()).toISOString();
    }
    if (body.spotlightFrom && body.spotlightUntil && body.spotlightUntil <= body.spotlightFrom) {
        return "The spotlight's end must be after its start.";
    }
    if (has("spotlightCaption")) {
        const c = typeof body.spotlightCaption === "string" ? body.spotlightCaption.replace(/\s+/g, " ").trim() : "";
        if (c.length > SPOTLIGHT_CAPTION_MAX) return `The spotlight caption is too long. Please keep it to ${SPOTLIGHT_CAPTION_MAX} characters or fewer.`;
        body.spotlightCaption = c;
    }
    if (has("spotlightColour")) {
        const c = typeof body.spotlightColour === "string" ? body.spotlightColour.trim().toLowerCase() : "";
        if (c && !/^#[0-9a-f]{6}$/.test(c)) return "The spotlight caption colour should be a colour like #ebe8ff.";
        body.spotlightColour = c;
    }
    return "";
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

const CONFLICT = "Someone else saved this record since you opened it - reload it to see their changes.";

/* A deleted event takes its credits with it (30 Sept 2026) — rooms.js's
   uncreditRecord, for events[]: the id comes out of every contributor who
   lists it and their stored count is worked out again, each row written
   only if it is as it was read. Best-effort, after the delete. */
async function uncreditRecord(db, id) {
    try {
        const contributors = db.collection("contributors");
        const holders = await contributors.find({ events: id }, { projection: { _id: 0, id: 1 } }).toArray();
        for (const { id: cid } of holders) {
            for (let attempt = 0; attempt < 5; attempt++) {
                const row = await contributors.findOne({ id: cid }, { projection: { _id: 0 } });
                if (!row || !Array.isArray(row.events) || !row.events.includes(id)) break;
                const mazes = Array.isArray(row.mazes) ? row.mazes : [];
                const extra = Number.isInteger(row.extra) ? row.extra
                    : Math.max(0, (Number(row.count) || 0) - mazes.length - row.events.length);
                const events = row.events.filter(x => x !== id);
                const was = row.updatedAt == null ? null : row.updatedAt;
                const res = await contributors.updateOne(
                    { id: cid, updatedAt: was },
                    { $set: { events, extra, count: mazes.length + events.length + extra, updatedAt: new Date().toISOString() } }
                );
                if (res.matchedCount) break;
            }
        }
    } catch (e) {
        console.error(`events: could not take event ${id} off the contributors`, e);
    }
}

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
        // Every event's address — see the same step in rooms.js, retired
        // addresses and all.
        const retired = await loadRetired(db, "event").catch(e => {
            console.error("events: retired addresses unreadable", e);
            return [];
        });
        const slugs = assignSlugs(all, "event", retired);
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
            // With the deleted events' addresses when asked (&retired=1,
            // 28 Sept 2026) — see the same step in rooms.js for why it is
            // asked for rather than always sent.
            if (params.retired === "1") return cachedJson(event, { records: all, retired }, { cache: false });
            return cachedJson(event, all, { cache: false });
        }
        // spotlightAt too: the editor's version stamp (see PUT), nothing a page reads.
        all.forEach(r => { delete r.slugAliases; delete r.slugManual; delete r.spotlightAt; });
        return cachedJson(event, await packRecords(all));
    }

    if (!isAuthorized(event)) return UNAUTHORIZED;
    // canWrite, not isAuthorized: a viewer is a real logged-in account and
    // passes isAuthorized quite correctly — it just isn't allowed to change
    // anything. See _auth.js.
    // refuseWrite: a signed token for an account that has since been
    // deleted, or whose password was reset, is signed OUT (401), not told it
    // is view-only — see _auth.js.
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
        /* The title trimmed and, on an edit that carries one, held to what
           a create is (30 Sept 2026) — rooms.js does both for a maze's
           name. A pasted trailing space went into the row heading, the
           sort and the share title; a blank one emptied all three. */
        if (typeof body.title === "string") body.title = body.title.trim();
        if (event.httpMethod === "PUT" && Object.prototype.hasOwnProperty.call(body, "title") &&
            (typeof body.title !== "string" || !body.title)) {
            return json(400, { error: "An event needs at least a title" });
        }
        const problem = checkRecord(body, CHOICES);
        if (problem) return json(400, { error: problem });
        const spotProblem = checkSpotlight(body);
        if (spotProblem) return json(400, { error: spotProblem });
        /* The stored article is set as innerHTML in every visitor's event
           modal, so it is sanitised HERE, on the way in, and not only where
           article.js fetched it — see cleanArticle for why that was not
           enough. A falsy article is the form clearing it, and is kept. */
        if (body.article) body.article = cleanArticle(body.article);
    }

    if (event.httpMethod === "POST") {
        // A string, because the address is made from it with string methods.
        if (!body.title || typeof body.title !== "string") return json(400, { error: "An event needs at least a title" });

        /* Not the body as sent — see the same step in rooms.js. An event has
           no furni editor (the /warren form offers it on mazes only), so a
           patch is dropped here as the PUT below drops it, rather than
           stored as a field of its own. */
        delete body.furniPatch;
        delete body.furniRev;
        delete body.changes;
        delete body.updatedAt;
        delete body._baseUpdatedAt;
        // The server's, as on an edit (see spotlightAt under PUT).
        delete body.spotlightAt;
        // The id is the server's to choose; one sent with the body skipped
        // the address clash check for that record. See rooms.js.
        delete body.id;

        await ensureUniqueIndex(events, "id");

        const everyEvent = () => events.find({}, { projection: SLUG_FIELDS }).toArray();
        // A deleted event's addresses stay its own — see _slugs.js.
        const retired = await loadRetired(db, "event");
        const slugProblem = settleSlug(await everyEvent(), "event", null, body, retired);
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
        let id = idFor(await everyEvent(), "event", body.slug, retired);
        for (let attempt = 0; ; attempt++) {
            // The server's timestamp wins, as in rooms.js.
            const item = { ...body, createdAt, id };
            delete item._id;
            try {
                await events.insertOne(item);
                const { _id, ...clean } = item;
                // The same address settled twice at once — see rooms.js.
                return json(201, (await recheckSlug(events, "event", id, retired)) || clean);
            } catch (e) {
                if (e.code === 11000 && attempt < 50) {
                    id = idFor(await everyEvent(), "event", body.slug, retired);
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
        /* Nor furni in any form. rooms.js takes furni only as a patch it
           merges under furniRev; this route never had that step, so a body
           carrying furniPatch stored it as a field of its own, and a whole
           `furni` or a furniRev went in raw. Events carry no furni (the
           /warren editor is mazes only), so all three are simply dropped. */
        delete update.furniPatch;
        delete update.furni;
        delete update.furniRev;
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

        /* The spotlight's end after its start as it will be STORED (30 Sept
           2026): checkSpotlight can only compare the two when a body sends
           both, and a body sending one met the stored other unchecked. */
        if (previous) {
            const has = k => Object.prototype.hasOwnProperty.call(update, k);
            const from = has("spotlightFrom") ? update.spotlightFrom : previous.spotlightFrom;
            const until = has("spotlightUntil") ? update.spotlightUntil : previous.spotlightUntil;
            if ((has("spotlightFrom") || has("spotlightUntil")) && typeof from === "string" && typeof until === "string" &&
                from && until && until <= from) {
                return json(400, { error: "The spotlight's end must be after its start." });
            }
        }

        /* The spotlight's own version (30 Sept 2026). A save that moves
           only the spotlight leaves updatedAt alone — _changes.js ignores
           the five fields so What's New does not call it an edit — and so
           the check above could not see it: an editor opened before someone
           unticked the spotlight saved its stale tick straight back over
           it. spotlightAt is stamped whenever a spotlight field actually
           changes, reaches the /warren form in the record (submitForm sends
           it back through `...existing`), and an editor's save carrying
           spotlight values that differ from the stored ones is refused when
           its copy of the stamp is not the stored one. Server-owned: a
           client never sets it. */
        const sentSpotlightAt = stamp(update.spotlightAt);
        delete update.spotlightAt;
        if (previous) {
            // An unset tick is an untick: an event from before the spotlight
            // is not "changed" by its first save writing spotlight: false.
            const norm = (k, v) => k === "spotlight" ? String(v === true) : canon(v);
            const spotMoved = SPOTLIGHT_FIELDS.some(k => Object.prototype.hasOwnProperty.call(update, k) &&
                norm(k, previous[k]) !== norm(k, update[k]));
            if (spotMoved) {
                if (base !== null && stamp(previous.spotlightAt) !== sentSpotlightAt) {
                    return json(409, { error: CONFLICT, conflict: true });
                }
                update.spotlightAt = new Date().toISOString();
            }
        }

        // Its address — see the same step in rooms.js.
        let retired = [];
        if (previous) {
            retired = await loadRetired(db, "event");
            const slugProblem = settleSlug(await events.find({}, { projection: SLUG_FIELDS }).toArray(), "event", previous, update, retired);
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
        return json(200, (await recheckSlug(events, "event", body.id, retired)) || result);
    }

    if (event.httpMethod === "DELETE") {
        const id = (event.queryStringParameters || {}).id;
        // A string: an object would be a query operator in the filter.
        if (!id || typeof id !== "string") return json(400, { error: "Missing event id" });
        // Its addresses stay reserved, so a link to it answers 410 rather
        // than opening whichever event takes the name next — see rooms.js.
        const all = await events.find({}, { projection: SLUG_FIELDS }).toArray();
        const doomed = all.find(r => r && r.id === id);
        if (!doomed) return json(404, { error: "Event not found" });
        const retired = await loadRetired(db, "event");
        await retireAddresses(db, "event", doomed, assignSlugs(all, "event", retired).get(id));
        const result = await events.deleteOne({ id });
        if (result.deletedCount === 0) return json(404, { error: "Event not found" });
        // Its Missing Pieces flag goes with it — see clearDeadEndFlag in
        // rooms.js (30 Sept 2026). Best-effort: the event is gone either way.
        try {
            await db.collection("dead_ends").deleteOne({ key: `event:${id}` });
        } catch (e) {
            console.error(`events: could not clear the dead-end flag for event:${id}`, e);
        }
        // And its credits — see uncreditRecord (30 Sept 2026).
        await uncreditRecord(db, id);
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

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("events", exports.handler);
