/* /.netlify/functions/picks — Maze of the Week, the foundations.

   NOT SHOWN ANYWHERE YET. This is the storage and the rules, so that the
   feature can be built on top later without a data model being invented in
   a hurry: a hand-picked maze (or event) for each week, with a written
   citation saying why, scheduled ahead and published on its week.

   One document per week, in `picks`:

     { kind: "week", weekOf: "YYYY-MM-DD" (a MONDAY, UTC), type, recordId,
       citation, published, by, createdAt, updatedAt }

   `kind` is there from the start because a weekly pick is unlikely to be
   the only kind — a yearly awards post, or a pick of the day on a featured
   day, would be rows here with a different kind rather than a second
   collection. (kind, weekOf) is unique, so a week cannot have two.

   WEEKS ARE MONDAY TO SUNDAY, UTC — the same week the daily games' "This
   week" boards use (see netlify/functions/_daily.js), so the site has one
   idea of what a week is.

     GET                public. Published picks whose week has started,
                        newest first: { current, past[] }. A pick scheduled
                        for next Monday is invisible until then.
     GET ?full=1        any admin account. Everything, drafts and
                        scheduled weeks included, uncached.
     PUT {weekOf, type, id, citation, published}
                        canWrite. Creates or replaces that week's pick.
     DELETE ?weekOf=    canWrite. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { hasAccount, canWrite, usernameFromToken, UNAUTHORIZED, READ_ONLY } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson } = require("./_cache");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

const text = (v) => (typeof v === "string" ? v : "");

const KIND = "week";
const CITATION_MAX = 1200;
const HISTORY = 104;               // two years of weeks is plenty for a public page
const COLLECTION_OF = { maze: "rooms", event: "events" };

// The Monday (UTC) of the week `date` falls in, as YYYY-MM-DD.
function mondayOf(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const back = (d.getUTCDay() + 6) % 7;      // Sunday is 6 days after Monday
    d.setUTCDate(d.getUTCDate() - back);
    return d.toISOString().slice(0, 10);
}

function isMonday(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
    const d = new Date(`${ymd}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd && d.getUTCDay() === 1;
}

function publicPick(p) {
    return { weekOf: p.weekOf, type: p.type, id: p.recordId, citation: p.citation || "" };
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("picks: database connection failed", e);
        return json(503, { error: "The archive's database is not answering. Try again in a minute." });
    }
    const picks = db.collection("picks");
    const q = event.queryStringParameters || {};

    try {
        if (event.httpMethod === "GET") {
            if (q.full === "1") {
                if (!(await hasAccount(event))) return UNAUTHORIZED;
                const all = await picks.find({ kind: KIND }, { projection: { _id: 0 } }).sort({ weekOf: -1 }).toArray();
                return json(200, { thisWeek: mondayOf(new Date()), picks: all });
            }
            const thisWeek = mondayOf(new Date());
            const shown = await picks
                .find({ kind: KIND, published: true, weekOf: { $lte: thisWeek } }, { projection: { _id: 0 } })
                .sort({ weekOf: -1 })
                .limit(HISTORY)
                .toArray();
            const current = shown.length && shown[0].weekOf === thisWeek ? publicPick(shown[0]) : null;
            const past = (current ? shown.slice(1) : shown).map(publicPick);
            return cachedJson(event, { thisWeek, current, past });
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
            // `null` parses, and reading a field off it throws.
            if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });
            const weekOf = text(body.weekOf);
            const type = text(body.type);
            const recordId = text(body.id).trim();
            const citation = text(body.citation).trim();
            if (!isMonday(weekOf)) return json(400, { error: "weekOf must be a Monday, as YYYY-MM-DD" });
            // An own key only: "constructor" or "toString" found something on
            // the prototype, passed, and became a collection name.
            if (!Object.prototype.hasOwnProperty.call(COLLECTION_OF, type) || !recordId) return json(400, { error: "Pick a maze or an event" });
            if (citation.length > CITATION_MAX) return json(400, { error: `Keep the citation under ${CITATION_MAX} characters` });

            const exists = await db.collection(COLLECTION_OF[type]).countDocuments({ id: recordId }, { limit: 1 });
            if (!exists) return json(404, { error: "No such record in the archive" });

            await ensureUniqueIndex(picks, ["kind", "weekOf"]);
            const now = new Date().toISOString();
            await picks.updateOne(
                { kind: KIND, weekOf },
                {
                    $set: { kind: KIND, weekOf, type, recordId, citation, published: body.published === true, by: usernameFromToken(event), updatedAt: now },
                    $setOnInsert: { createdAt: now }
                },
                { upsert: true }
            );
            return json(200, await picks.findOne({ kind: KIND, weekOf }, { projection: { _id: 0 } }));
        }

        if (event.httpMethod === "DELETE") {
            const weekOf = text(q.weekOf);
            if (!isMonday(weekOf)) return json(400, { error: "weekOf must be a Monday" });
            const result = await picks.deleteOne({ kind: KIND, weekOf });
            return json(200, { deleted: result.deletedCount > 0 });
        }

        return json(405, { error: "Method not allowed" });
    } catch (e) {
        console.error("picks: request failed", e);
        return json(500, { error: "Something went wrong with the picks." });
    }
};

// Exposed for tests.
exports.mondayOf = mondayOf;
exports.isMonday = isMonday;
