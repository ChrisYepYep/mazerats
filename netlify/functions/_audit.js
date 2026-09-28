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

   Writing can never fail a request. An audit log that can break a save is
   worse than no audit log, so every call swallows its own errors — and
   callers wait for it only briefly (see AUDIT_WAIT_MS), never indefinitely. */

const { getDb } = require("./_db.js");

const COLLECTION = "admin_activity";
const KEEP_DAYS = 90;

/* createIndex is a no-op once the index exists, but there is no reason to pay
   the round-trip on every warm invocation either.

   The PROMISE is memoised, and record() does not wait for it. The flag this
   used to be was set only once all the builds had answered, so every record
   written before then — and every one on a cold instance — sat behind five
   createIndex round trips, which was fine while nothing waited on a record
   and is not now that sign-ins and saves do (see record below). One build
   per instance, run beside the writes rather than in front of them; a
   failed one is simply retried by the next cold start. */
let ensuring = null;
function ensureIndexes(db) {
    if (!ensuring) ensuring = buildIndexes(db).catch(() => {});
    return ensuring;
}

async function buildIndexes(db) {
    const col = db.collection(COLLECTION);
    // Mongo drops these on its own once `at` is older than the window, so the
    // log prunes itself and nobody has to remember to.
    await col.createIndex({ at: 1 }, { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 }).catch(() => {});
    await col.createIndex({ username: 1, at: -1 }).catch(() => {});
    /* The two the login throttle counts on (see loginThrottle in auth.js).
       Both carry `type` first because it only ever asks about one kind of
       record — the failures — and there is no reason to walk a login's worth
       of successes and heartbeats to find them. */
    await col.createIndex({ type: 1, ip: 1, at: -1 }).catch(() => {});
    await col.createIndex({ type: 1, username: 1, at: -1 }).catch(() => {});
    // The throttle now counts by subscriber (`net`, see _net.js), not by ip.
    await col.createIndex({ type: 1, net: 1, at: -1 }).catch(() => {});
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
/* A backstop on the one field a stranger can fill: a failed login logs the
   username that was TRIED, and nothing bounded it (auth.js now cuts it too;
   this makes sure no future caller forgets). */
const USERNAME_MAX = 60;

/* How long a request waits for its audit row, at most.

   The writes used to be fire-and-forget: started, never awaited. On Netlify
   that is not "in the background" — the instance is frozen the moment the
   handler returns, and a write still in flight is frozen with it, to finish
   on some later invocation or not at all. So the log quietly missed sign-ins
   and saves, which is the one thing an audit log may not do. Now every
   caller awaits, but only for this long: a healthy insert lands in a few
   tens of milliseconds, and a database having a bad moment costs a save at
   most this much rather than taking it down, which is still the rule. */
const AUDIT_WAIT_MS = 300;

function record(event, type, fields = {}) {
    const write = writeRecord(event, type, fields);
    let timer;
    const cap = new Promise(resolve => { timer = setTimeout(resolve, AUDIT_WAIT_MS); });
    return Promise.race([write, cap]).finally(() => clearTimeout(timer));
}

async function writeRecord(event, type, fields) {
    if (typeof fields.username === "string" && fields.username.length > USERNAME_MAX) {
        fields = { ...fields, username: fields.username.slice(0, USERNAME_MAX) };
    }
    try {
        const db = await getDb();
        ensureIndexes(db);           // not awaited — see ensureIndexes
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
