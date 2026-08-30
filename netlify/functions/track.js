/* /.netlify/functions/track — receives the first-party interaction events
   described in js/track.js and the privacy policy.

   The important thing this function does is what it does NOT write. Netlify
   hands every request the caller's IP in x-nf-client-connection-ip, and the
   policy promises that no address is stored against an interaction record.
   So the address is never read here — not read and discarded, simply never
   touched — and neither is the user agent. What lands in the database is the
   event name, an optional short label, a timestamp, and a random
   session-scoped id that dies with the visitor's tab.

   That is a deliberately thin record. It answers "which mazes get opened"
   and "does anyone use the Events tab", and it cannot answer "what did this
   person do", which is the whole point.

   Public and unauthenticated by necessity, so it is written defensively:
   a hard cap on batch size, short strings only, and no error detail returned
   to a caller who has no business seeing any. */

const { getDb } = require("./_db");

const COLLECTION = "site_events";
const KEEP_DAYS = 60;              // matches the retention the policy states
const MAX_EVENTS_PER_BATCH = 40;
const MAX_NAME = 40;
const MAX_LABEL = 80;

const ok = { statusCode: 204, body: "" };

let ensured = false;
async function ensureIndexes(db) {
    if (ensured) return;
    const col = db.collection(COLLECTION);
    // Mongo prunes these itself, so the 60 days in the policy is enforced by
    // the database rather than by anyone remembering to run a job.
    await col.createIndex({ at: 1 }, { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 }).catch(() => {});
    await col.createIndex({ name: 1, at: -1 }).catch(() => {});
    ensured = true;
}

const clean = (v, max) =>
    typeof v === "string" && v.length
        // Control characters only — labels are ordinary text and must survive.
        ? v.slice(0, max).replace(/[\u0000-\u001f\u007f]/g, "")
        : null;

exports.handler = async (event) => {
    // A beacon is always a POST; anything else is not this endpoint's business.
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };

    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return ok;                 // malformed telemetry is not worth an error
    }

    const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
    if (!events.length) return ok;

    const session = clean(body.session, 24);
    const now = Date.now();

    const rows = events.map(e => {
        const name = clean(e && e.name, MAX_NAME);
        if (!name) return null;
        /* The client's clock is not trusted to set the retention window — a
           wrong one could park a row outside the TTL forever — so the time is
           taken here, and the client's own stamp is used only to keep a
           batch's events in the order they happened. */
        const offset = typeof e.at === "number" && e.at > 0 ? Math.min(0, e.at - now) : 0;
        return {
            at: new Date(now + Math.max(offset, -60 * 60 * 1000)),
            name,
            label: clean(e && e.label, MAX_LABEL),
            session,
        };
    }).filter(Boolean);

    if (!rows.length) return ok;

    try {
        const db = await getDb();
        await ensureIndexes(db);
        await db.collection(COLLECTION).insertMany(rows, { ordered: false });
    } catch (e) {
        // Never tell an anonymous caller anything, and never fail a beacon.
    }
    return ok;
};

module.exports.COLLECTION = COLLECTION;
module.exports.KEEP_DAYS = KEEP_DAYS;
