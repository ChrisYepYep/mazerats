/* The admin activity log: who signed in, when, from where, and what they
   changed.

   Deliberately scoped to ADMIN accounts and nothing else. Visitors are not
   touched by any of this — see the note in admin-activity.js about why that
   line is drawn where it is.

   Every record carries the session it belongs to, taken from the JWT's own
   `iat` (issued-at) claim. That needs no new state anywhere: a token is
   minted once per login, so username + iat identifies a session for as long
   as it lives, and the difference between a session's first and last record
   is how long that person was working.

   Writing is fire-and-forget. An audit log that can break a save is worse
   than no audit log, so every call swallows its own errors and nothing waits
   on it. */

const { getDb } = require("./_db.js");

const COLLECTION = "admin_activity";
const KEEP_DAYS = 90;

// createIndex is a no-op once the index exists, but there is no reason to pay
// the round-trip on every warm invocation either.
let ensured = false;
async function ensureIndexes(db) {
    if (ensured) return;
    const col = db.collection(COLLECTION);
    // Mongo drops these on its own once `at` is older than the window, so the
    // log prunes itself and nobody has to remember to.
    await col.createIndex({ at: 1 }, { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 }).catch(() => {});
    await col.createIndex({ username: 1, at: -1 }).catch(() => {});
    ensured = true;
}

function clientIp(event) {
    const h = event.headers || {};
    return h["x-nf-client-connection-ip"] || h["client-ip"] || null;
}

function agentOf(event) {
    const ua = (event.headers || {})["user-agent"] || "";
    return ua.slice(0, 180);            // enough to tell a browser apart, not a fingerprint
}

/* type: "login" | "login-failed" | "session" | "write"
   Anything not given is simply left off the record. */
async function record(event, type, fields = {}) {
    try {
        const db = await getDb();
        await ensureIndexes(db);
        await db.collection(COLLECTION).insertOne({
            at: new Date(),
            type,
            ip: clientIp(event),
            agent: agentOf(event),
            ...fields,
        });
    } catch (e) {
        // Never let logging take a request down with it.
    }
}

/* A write attempt, logged from the one place every mutating endpoint already
   passes through (canWrite in _auth.js). Records the attempt rather than the
   outcome, which is the honest thing for an audit trail: what someone tried
   is as interesting as what succeeded. */
function recordWrite(event, username, session) {
    const path = (event.path || "").replace("/.netlify/functions/", "");
    const target = (event.queryStringParameters && (event.queryStringParameters.id ||
        event.queryStringParameters.username || event.queryStringParameters.ip)) || null;
    return record(event, "write", {
        username,
        session,
        method: event.httpMethod,
        endpoint: path,
        target,
    });
}

module.exports = { record, recordWrite, COLLECTION, KEEP_DAYS };
