/* /.netlify/functions/rooms — CRUD API for maze rooms.
   GET is public (the site needs to read it to render). POST/PUT/DELETE
   require the x-admin-token header to carry a valid session token from
   logging in on the admin page (see auth.js and _auth.js). */
const { getDb, ensureUniqueIndex } = require("./_db");
const { isAuthorized, hasAccount, canWrite, refuseWrite, UNAUTHORIZED } = require("./_auth");
const { packRecords } = require("./_furni-payload");
const { cachedJson } = require("./_cache");
const { SECURITY_HEADERS } = require("./_headers");
const { describe: describeChanges, changedFields } = require("./_changes");
const { checkRecord } = require("./_url");
const { cleanArticle } = require("./article");
const { assignSlugs, settleSlug, idFor, recheckSlug, loadRetired, retireAddresses, PROJECTION: SLUG_FIELDS } = require("./_slugs");
const { applyFurniPatch, validEntry: validFurniEntry } = require("./_furni-merge");

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

/* ---- furni, patched rather than replaced (see the PUT below) ---- */

/* { image: entry }, or null for no patch, or false for a body that is not
   one. Keys are image references, so any string a picture field could
   hold. Each entry is null (drop the picture's record), { base, draft,
   from? } (the three-way merge — see _furni-merge.js), or a whole record
   from a /warren tab loaded before that shape existed, which is still
   stored as sent: refusing it would lose that tab's edits, and taking it
   costs nothing more than it always did. */
const MAX_FURNI_PATCH = 500;
function cleanFurniPatch(p) {
    if (p === undefined || p === null) return null;
    if (typeof p !== "object" || Array.isArray(p)) return false;
    const keys = Object.keys(p);
    if (!keys.length) return null;
    if (keys.length > MAX_FURNI_PATCH) return false;
    for (const k of keys) {
        if (!k || k.length > 2048 || k === "__proto__" || k === "constructor" || k === "prototype") return false;
        if (!validFurniEntry(p[k])) return false;
    }
    return p;
}

/* The stored furni with the patch merged in, piece by piece: what the
   admin added, removed or hid goes in, and everything a scan wrote while
   the form was open stays. See _furni-merge.js. */
function mergeFurni(stored, patch) {
    return applyFurniPatch(stored, patch);
}

// The furniRev condition for a record read at revision `rev`. A record that
// has never had a furniRev matches as revision 0.
const furniRevFilter = rev => ({ furniRev: rev ? rev : { $in: [0, null] } });

/* The $set for one save: the fields, with updatedAt and the change list
   settled against `before` — the record as the write will find it. `furni`
   is the merged furni when the save carries a patch, so a furni-only save
   still reads as a change and What's New still says "furni".

   A save that changes nothing is still written — the form may have tidied a
   value's representation (a trimmed name, "" for null) and that is worth
   keeping — but it does not move updatedAt and does not touch the change
   list. Otherwise pressing Save on an untouched maze put it at the top of
   What's New as "Updated" that day. changedFields returns null when it
   cannot tell, and that is read as an ordinary save: a missed changelog
   line is the lesser harm.

   A fresh object each call, because the furni path below may have to work
   it out again against a record re-read after a scan got in first. */
function fieldsToSet(before, update, furni) {
    const set = { ...update };
    const judged = furni ? { ...set, furni } : set;
    const moved = changedFields(before, judged);
    if (moved && moved.length === 0) {
        delete set.updatedAt;
        delete set.changes;
    } else {
        const changed = describeChanges(before, judged);
        if (changed) set.changes = changed;
    }
    return set;
}

/* A save that carries furni changes: the fields and the merged furni in ONE
   conditional write.

   They used to be two. The fields went first and moved updatedAt; then the
   furni was merged in a second write under its own furniRev check. When
   that second write failed (a scan holding the maze, a dropped
   connection), the form was told to save again — and the retry carried the
   version it had opened at, which the first write had just moved on, so it
   was refused as somebody else's save and the furni edits were lost. What's
   New said "furni" all the same, because the change list went out with the
   fields.

   Now the one write is conditional on both the version the editor started
   from (versionFilter) AND the furniRev the merge was made against, and
   sets the fields, the merged furni and furniRev + 1 together: it lands
   whole or not at all, so a retry finds the record exactly as the failed
   attempt did. A scan writing the same maze in between moves only furniRev,
   so that alone re-reads, re-merges onto what the scan wrote and tries
   again; a moved version is somebody else's save and is a 409, as ever.

   Image references contain dots, so the per-picture keys cannot be
   addressed with a dotted $set path — hence read-merge-write rather than an
   atomic per-key update.

   Its own try/catch, so a failure here says the save did not happen rather
   than leaving the admin to guess which half landed. (A response lost AFTER
   the write landed is answered by the retry: it gets a 409, and the form
   re-reads the record.)

   Each attempt merges the patch into the furni as THAT attempt read it, and
   the merge is piece by piece (_furni-merge.js): a scan that wrote the maze
   between attempts keeps its new detections, and the admin's own additions,
   removals and Hide/Show land on top of them. */
async function saveWithFurni(rooms, id, base, previous, update, patch, retired) {
    try {
        let doc = previous;
        for (let attempt = 0; attempt < 6; attempt++) {
            // Re-read on a retry, and on the first go too when the read
            // before the slug step failed rather than found nothing.
            if (attempt || !doc) doc = await rooms.findOne({ id });
            if (!doc) return json(404, { error: "Room not found" });
            if (base !== null && stamp(doc.updatedAt) !== base) {
                return json(409, { error: CONFLICT, conflict: true });
            }
            const rev = Number(doc.furniRev) || 0;
            const furni = mergeFurni(doc.furni, patch);
            const set = fieldsToSet(doc, update, furni);
            set.furni = furni;
            set.furniRev = rev + 1;
            const result = await rooms.findOneAndUpdate(
                { ...versionFilter(id, base), ...furniRevFilter(rev) },
                { $set: set },
                { returnDocument: "after", projection: { _id: 0 } }
            );
            if (result) return json(200, (await recheckSlug(rooms, "maze", id, retired)) || result);
        }
        return json(503, { error: "The maze is busy (a furni scan is writing it) and wasn't saved. Save again in a moment." });
    } catch (e) {
        console.error("rooms: furni save failed", e);
        return json(503, { error: "The maze couldn't be saved just now, furni included. Save again to retry." });
    }
}

async function handle(event) {
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
        /* Every maze's address, worked out here so the page and the share
           function can never disagree about it (see _slugs.js). Written
           over the stored slug: a maze saved before addresses existed has
           none stored, and one whose stored slug clashes gets the one the
           share function will actually answer to. */
        /* Around the deleted mazes' addresses too, as share.js and the
           sitemap work them out (see _slugs.js). None when they cannot be
           read: every maze has its address stored, and a stored address
           does not depend on them. */
        const retired = await loadRetired(db, "maze").catch(e => {
            console.error("rooms: retired addresses unreadable", e);
            return [];
        });
        const slugs = assignSlugs(all, "maze", retired);
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
        // which is the same room data at a fraction of the size, cached at
        // the edge. js/api.js unpacks it.
        const params = event.queryStringParameters || {};
        if (params.full === "1") {
            // hasAccount, not isAuthorized: a signed token for an account
            // that has since been deleted, or whose password has been reset,
            // is not a reviewer any more. One indexed lookup, on an admin-only
            // route the public payload below never takes.
            if (!(await hasAccount(event))) return UNAUTHORIZED;
            /* ?full=1&retired=1 (28 Sept 2026): the same records, with the
               deleted mazes' addresses beside them — { records, retired }.
               /warren's Address field needs them to say, before Save, that
               an address typed by hand belonged to a deleted maze (the save
               would be refused), and to show the -2 a new maze following
               a deleted one's name will really get. Asked for, not always
               sent: every other caller of ?full=1 (the dead-ends panel, the
               image clean-up, the tests) reads a bare list, and changing
               that shape under them would break each one. Never on the
               public GET below — which addresses were deleted is nobody
               else's business. An unreadable list comes back empty, as it
               does for the addresses above; the save still checks it. */
            if (params.retired === "1") return cachedJson(event, { records: all, retired }, { cache: false });
            return cachedJson(event, all, { cache: false });
        }
        // Old addresses are the share function's business, not the page's.
        all.forEach(r => { delete r.slugAliases; delete r.slugManual; delete r.furniRev; });
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
        // A string, because the address is made from it with string methods: a
        // name sent as a number or an object was a 500, not a refusal.
        if (!body.name || typeof body.name !== "string") return json(400, { error: "A room needs at least a name" });

        /* NOT the body as sent. A create used to store every field that
           arrived, so the PUT's bookkeeping went in raw: a furniPatch sat on
           the record as a field of its own (its furni never applied), a
           client's furniRev or change list was taken as the server's, and
           an updatedAt from the body put a brand-new maze in What's New as
           "Updated" on whatever day the body named.

           A new maze has no stored furni for a patch to race with, so the
           patch is simply applied to nothing — the admin form sends one when
           the furni editor was used before the first save. */
        const newFurni = cleanFurniPatch(body.furniPatch);
        if (newFurni === false) return json(400, { error: "Invalid furni changes" });
        if (newFurni) body.furni = mergeFurni(body.furni, newFurni);
        delete body.furniPatch;
        delete body.furniRev;
        delete body.changes;
        delete body.updatedAt;
        delete body._baseUpdatedAt;
        /* Nor its id. The id is the server's to choose (idFor, below), and
           settleSlug reads a new record's id off the body to decide which
           record is "this one" — so a create carrying an EXISTING maze's id
           left that maze out of the clash check, and could be given the
           address it was standing at. guides.js never passed it through. */
        delete body.id;

        await ensureUniqueIndex(rooms, "id");

        // Its address: the one typed in the editor, else its name's — never
        // one a deleted maze's links still name (see _slugs.js).
        const everyRoom = () => rooms.find({}, { projection: SLUG_FIELDS }).toArray();
        const retired = await loadRetired(db, "maze");
        const slugProblem = settleSlug(await everyRoom(), "maze", null, body, retired);
        if (slugProblem) return json(400, { error: slugProblem });

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
        /* The id is the settled address, or the nearest thing to it that
           nothing already answers to — see idFor in _slugs.js for the
           maze it once took the address of. A collision (two saves racing)
           re-reads the collection and asks again. */
        let id = idFor(await everyRoom(), "maze", body.slug, retired);
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
                // Another save may have settled the same address a moment
                // ago — see recheckSlug in _slugs.js.
                return json(201, (await recheckSlug(rooms, "maze", id, retired)) || clean);
            } catch (e) {
                if (e.code === 11000 && attempt < 50) {
                    id = idFor(await everyRoom(), "maze", body.slug, retired);
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

        /* FURNI ARRIVES AS A PATCH, never as the whole object.

           A maze's furni is written by two things that do not know about each
           other: this form, and the furni scan (tools/furni-scan-local.js),
           which writes straight to the database and can run for fifteen
           minutes. Each used to write the WHOLE furni object from its own
           copy, so whichever landed second erased the other's work — hand-
           added pieces saved during a scan vanished when the scan reached
           that maze, and a form opened before a scan wiped the scan's results
           the moment it changed anything.

           So the form now sends only the pictures it changed, and they are
           merged into whatever is stored NOW, guarded by furniRev so a scan
           writing the same maze at the same moment makes one of the two
           retry rather than lose. The scan does the same (see saveWithFurni
           above and the scan tool). A whole `furni` or a client's furniRev
           is never taken from a body.

           And within a picture, piece by piece: each changed picture comes
           as { base, draft } — the record as the form opened it and as the
           admin left it — and only the difference is applied to the stored
           record, so a scan that rewrote that very room while the form was
           open keeps what it found ({ image: null } still drops a
           picture's record). See _furni-merge.js. */
        const furniPatch = cleanFurniPatch(update.furniPatch);
        if (furniPatch === false) return json(400, { error: "Invalid furni changes" });
        /* A whole `furni` with no patch is a /warren tab loaded before
           patches existed. It used to be dropped without a word: the save
           answered 200, the editor closed, and every furni change made in
           that tab was gone. Refused instead, as a conflict, so the form
           stays open with its edits and says to reload. The current form
           never sends `furni` (it deletes it from the payload; see
           submitForm in js/admin.js). */
        if (Object.prototype.hasOwnProperty.call(update, "furni") && update.furniPatch === undefined) {
            return json(409, { error: "This page is out of date. Reload /warren to save furni changes.", conflict: true });
        }
        delete update.furniPatch;
        delete update.furni;
        delete update.furniRev;

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

        /* Its address, which follows a new name and keeps the old one as an
           alias (see _slugs.js). Only when the record exists: a PUT for a
           missing id is answered 404 below. */
        let retired = [];
        if (previous) {
            retired = await loadRetired(db, "maze");
            const slugProblem = settleSlug(await rooms.find({}, { projection: SLUG_FIELDS }).toArray(), "maze", previous, update, retired);
            if (slugProblem) return json(400, { error: slugProblem });
        } else {
            /* Not settled, so not stored: a body's own address fields are
               only ever the form echoing the record back, and written raw
               they would bypass every check settleSlug makes. */
            delete update.slug;
            delete update.slugAliases;
            delete update.slugManual;
            delete update._slugAuto;
        }

        if (furniPatch) return saveWithFurni(rooms, body.id, base, previous, update, furniPatch, retired);

        // The version condition is in the filter too, so two saves racing
        // between the read above and this write cannot both pass.
        const result = await rooms.findOneAndUpdate(
            versionFilter(body.id, base),
            { $set: fieldsToSet(previous, update, null) },
            { returnDocument: "after", projection: { _id: 0 } }
        );
        if (!result) {
            if (base !== null && await rooms.findOne({ id: body.id }, { projection: { _id: 1 } })) {
                return json(409, { error: CONFLICT, conflict: true });
            }
            return json(404, { error: "Room not found" });
        }
        return json(200, (await recheckSlug(rooms, "maze", body.id, retired)) || result);
    }

    if (event.httpMethod === "DELETE") {
        const id = (event.queryStringParameters || {}).id;
        // A string: an object would be a query operator in the filter.
        if (!id || typeof id !== "string") return json(400, { error: "Missing room id" });
        /* ITS ADDRESSES STAY RESERVED. Deleting a maze used to free its
           address, its old addresses and its id on the spot, and the next
           maze given the same name took them — so every link somebody had
           shared to the deleted maze opened a different one, with nothing
           to say so. They are written to retired_addresses first (see
           _slugs.js): nothing is ever given them again, and share.js
           answers them 410 Gone.

           Retired BEFORE the delete: see retireAddresses for why that is
           the safe order. The address it is served at is worked out over
           the whole collection, as the API serves it. */
        const all = await rooms.find({}, { projection: SLUG_FIELDS }).toArray();
        const doomed = all.find(r => r && r.id === id);
        if (!doomed) return json(404, { error: "Room not found" });
        const retired = await loadRetired(db, "maze");
        await retireAddresses(db, "maze", doomed, assignSlugs(all, "maze", retired).get(id));
        const result = await rooms.deleteOne({ id });
        if (result.deletedCount === 0) return json(404, { error: "Room not found" });
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
        console.error("rooms: request failed", e);
        return json(503, { error: "The archive couldn't be saved just now. Try again in a minute." });
    }
};

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("rooms", exports.handler);
