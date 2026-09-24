/* /.netlify/functions/dead-ends — which records are marked as dead ends.

   See js/dead-ends.js for what a dead end is. Every one is marked by hand
   from /warren: which pieces of a record are wanted, and a line saying what
   exactly. Nothing is inferred — a record with no flag here is complete as
   far as the public site is concerned.

   One document per record, in `dead_ends`, keyed by "<type>:<id>":

     { key, type, recordId, pieces[], note, markedBy, markedAt, updatedAt }

   Kept apart from the rooms and events collections on purpose. A save from
   the maze form sends the whole record and $sets it (see rooms.js), so a
   flag living on the record would have to be threaded through every form
   that can save one, or be wiped by the first save that forgot it. Here it
   cannot be touched by anything but this file.

     GET                 public. Every flag, plus how many leads are waiting
                         on each record ("someone is on the trail"). Cached
                         at the edge like the archive itself.
     GET ?full=1         any signed-in admin account. The same, uncached, with
                         who marked what.
     PUT {type, id, pieces, note}
                         canWrite. Creates or replaces a record's flag. A flag
                         with no pieces is deleted rather than stored empty —
                         a note on its own asks for nothing a visitor can
                         answer.
     DELETE ?type=&id=   canWrite. The record is no longer a dead end. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { hasAccount, canWrite, usernameFromToken, UNAUTHORIZED, READ_ONLY } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson } = require("./_cache");
const DeadEnds = require("../../js/dead-ends.js");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

const text = (v) => (typeof v === "string" ? v : "");

// Which collection each kind of record lives in.
const COLLECTION_OF = { maze: "rooms", event: "events" };

/* A list of piece keys off the wire: strings only, known for this type of
   record only, each once. Anything else is dropped rather than refused — the
   admin form only ever offers real pieces, so something unknown here is a
   stale form after a piece was renamed, and dropping it is kinder than
   failing the whole save over it. */
function cleanPieces(type, list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const k of list) {
        if (typeof k === "string" && DeadEnds.isPiece(type, k) && out.indexOf(k) === -1) out.push(k);
    }
    return out;
}

// What a visitor may see of a flag: the ask, never who made it.
function publicFlag(f) {
    return {
        type: f.type,
        id: f.recordId,
        pieces: f.pieces || [],
        note: f.note || "",
        markedAt: f.markedAt || null
    };
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("dead-ends: database connection failed", e);
        return json(503, { error: "The archive's database is not answering. Try again in a minute." });
    }
    const flags = db.collection("dead_ends");
    const q = event.queryStringParameters || {};

    try {
        if (event.httpMethod === "GET") {
            const full = q.full === "1";
            if (full && !(await hasAccount(event))) return UNAUTHORIZED;

            const [all, waiting] = await Promise.all([
                flags.find({}, { projection: { _id: 0 } }).toArray(),
                /* How many leads are still waiting on each record. Only the
                   count is public — a lead's words and pictures are private
                   until an admin has accepted them. */
                db.collection("dead_end_leads").aggregate([
                    // Not the ones about mazes the archive does not have yet:
                    // there is no record on the site for them to count against.
                    { $match: { status: "new", type: { $ne: "new" } } },
                    { $group: { _id: { type: "$type", id: "$recordId" }, n: { $sum: 1 } } }
                ]).toArray()
            ]);

            const trail = waiting.map(w => ({ type: w._id.type, id: w._id.id, leads: w.n }));
            const data = {
                flags: full ? all.map(f => ({ ...publicFlag(f), markedBy: f.markedBy || null, updatedAt: f.updatedAt || null })) : all.map(publicFlag),
                trail
            };
            // The admin copy is never cached: it is read straight after a save.
            return cachedJson(event, data, { cache: !full });
        }

        if (!(await canWrite(event))) {
            return (await hasAccount(event)) ? READ_ONLY : UNAUTHORIZED;
        }

        if (event.httpMethod === "PUT") {
            let body;
            try {
                body = JSON.parse(event.body || "{}");
            } catch (e) {
                return json(400, { error: "Invalid request body" });
            }

            const type = text(body.type);
            const recordId = text(body.id).trim();
            if (!COLLECTION_OF[type]) return json(400, { error: "type must be maze or event" });
            if (!recordId || recordId.length > 200) return json(400, { error: "Missing record id" });

            const note = text(body.note).trim();
            if (note.length > DeadEnds.NOTE_MAX) {
                return json(400, { error: `Keep the note under ${DeadEnds.NOTE_MAX} characters` });
            }
            const pieces = cleanPieces(type, body.pieces);

            // "Something else" means nothing without a line saying what.
            if (pieces.indexOf("other") !== -1 && !note) {
                return json(400, { error: "Say what \"something else\" is in the note" });
            }

            /* The record has to exist. A flag on an id that is not in the
               archive would sit on the public list pointing at nothing, and
               the Dead Ends page would have no name to show for it. */
            const exists = await db.collection(COLLECTION_OF[type])
                .countDocuments({ id: recordId }, { limit: 1 });
            if (!exists) return json(404, { error: "No such record in the archive" });

            const key = `${type}:${recordId}`;

            // Nothing marked: that is no flag at all, whatever the note says.
            if (!pieces.length) {
                await flags.deleteOne({ key });
                return json(200, { key, cleared: true });
            }

            await ensureUniqueIndex(flags, "key");
            const now = new Date().toISOString();
            await flags.updateOne(
                { key },
                {
                    $set: { key, type, recordId, pieces, note, updatedAt: now, updatedBy: usernameFromToken(event) },
                    // From the first version of this, which also stored the
                    // page's guesses an admin had dismissed. Nothing reads it.
                    $unset: { dismissed: "" },
                    /* markedAt is when it first became a dead end, and stays
                       put through later edits — "on the list since" should
                       not reset every time somebody fixes a typo in the note. */
                    $setOnInsert: { markedAt: now, markedBy: usernameFromToken(event) }
                },
                { upsert: true }
            );
            const saved = await flags.findOne({ key }, { projection: { _id: 0 } });
            return json(200, { ...publicFlag(saved), markedBy: saved.markedBy || null, updatedAt: saved.updatedAt });
        }

        if (event.httpMethod === "DELETE") {
            const type = text(q.type);
            const recordId = text(q.id).trim();
            if (!COLLECTION_OF[type] || !recordId) return json(400, { error: "Missing type or id" });
            const result = await flags.deleteOne({ key: `${type}:${recordId}` });
            return json(200, { cleared: result.deletedCount > 0 });
        }

        return json(405, { error: "Method not allowed" });
    } catch (e) {
        console.error("dead-ends: request failed", e);
        return json(500, { error: "Something went wrong reading the dead ends." });
    }
};
