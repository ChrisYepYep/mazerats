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

const crypto = require("crypto");
const { getDb } = require("./_db");
// subscriberOf lived here first; _net.js shares it with every other limiter.
const { clientIp, subscriberOf } = require("./_net");

const COLLECTION = "site_events";

/* ---- A CAP PER ADDRESS, without putting the address on anything.

   This was an open door: a public POST, forty rows a call, no limit, so one
   loop could write as many rows as it liked into a collection kept for 60
   days. The ordinary cure (contact.js) is to count the caller's own recent
   rows by IP — which is precisely what this function has promised never to
   store against an interaction record.

   So the counting happens somewhere else and in a form that is not the
   address. Each batch writes one row to its own collection holding an
   HMAC of the address, keyed with the server's secret and TODAY'S DATE, so
   it cannot be reversed with a list of addresses and cannot be matched
   across days; nothing links it to the events; and Mongo deletes it once
   the window has passed. That is the "short-term IP logging for spam
   prevention" the privacy policy already describes, and nothing more.

   Insert, then count, as in contact.js, so a parallel burst cannot all fit
   under the cap together. Over the cap the batch is DROPPED, not refused:
   a beacon has nobody to read an error. The limiter row is not taken back,
   so an address that keeps hammering stays over the line until it stops.

   THE NUMBERS, and why they came down. This used to allow 300 batches of
   40 rows per address per ten minutes — 72,000 rows an hour from one
   address, kept for 60 days, and keyed on the EXACT address, so anybody on
   IPv6 (whose provider hands out a /64, i.e. more addresses than there are
   atoms to spare) could rotate through fresh keys forever and never meet
   the cap at all. Three changes:

   · An IPv6 address is counted by its /64, which is the unit one
     subscriber is actually given; an IPv4 address is still itself.
   · A batch is at most MAX_EVENTS_PER_BATCH rows, which is what the client
     ever sends (MAX_BUFFER in js/track.js), and 60 batches per ten minutes
     per address: one busy tab flushes every few seconds only while
     somebody is clicking, and a school or an office behind one address
     still fits — and if it does not, the cost is some dropped telemetry,
     which is the cheapest thing this site has to lose.
   · A GLOBAL ceiling on rows per minute (see overGlobal below), because no
     per-address rule survives an attacker with enough addresses. Over it,
     every batch is dropped until the minute turns. That can starve real
     telemetry during an attack, and that is the right way round: the
     numbers are a nicety, the database is not. */
const LIMITS = "site_events_limits";
const LIMIT_BATCHES = 60;
const LIMIT_WINDOW_MS = 10 * 60 * 1000;
const GLOBAL_ROWS_PER_MIN = 1500;

/* AND A CEILING PER DAY. The per-minute one alone still let a patient
   flood through: 1,500 rows a minute is 2.16 million a day, every one of them
   kept for 60 days — enough to fill a small cluster by itself without ever
   tripping the minute cap. A real launch day is a few thousand visits of a
   few dozen clicks each, so thirty thousand rows is room for a very good day
   while holding the worst case to 1.8 million rows over the whole retention
   window. Over it, the day's remaining telemetry is dropped, which is the
   same trade the minute cap makes: the numbers are a nicety. */
/* Raised to 150,000 for launch (29 Sept 2026): thirty thousand was the
   comment above's "very good day", but a few thousand visits of a few dozen
   clicks each is 75-100k rows, so launch day would have gone quiet by lunch.
   150k a day is still at most 9 million rows over the 60 days kept. */
const GLOBAL_ROWS_PER_DAY = 150000;
// The day counters' own expiry, on their own field: the TTL index on `at`
// sweeps after the ten-minute limiter window, which would reset a day's
// count ten minutes into it.
const DAY_COUNTER_KEEP_S = 2 * 24 * 60 * 60;

/* The names js/track.js actually sends, and nothing else. Anything was
   accepted before, so the event list was whatever a stranger typed into it:
   the activity page's "by name" breakdown could be filled with junk names
   (one group each), and a script could spend the whole day's allowance on
   rows nobody would ever read. Read from the call sites — js/track.js's own
   "page", the one Track.event("search") in js/home.js, and every data-track
   / dataset.track in js/home.js. A new data-track needs adding here, or its
   clicks are dropped quietly. */
const EVENT_NAMES = new Set([
    "page", "search", "tab", "whats-new", "timeline",
    "maze-open", "event-open", "photo-open",
    "furni-open", "furni-browse", "furni-also-list",
    "walked-toggle", "saved-toggle", "share-copy",
    /* The daily games (30 Sept 2026): opened, finished, result copied,
       each labelled with the game ("odd", "guess") and nothing else —
       sent by Daily.track in js/daily.js, not by a data-track. */
    "daily-open", "daily-finish", "daily-share"
]);

function limiterKey(event) {
    // Netlify's own value only — see clientIp in _net.js.
    const ip = clientIp(event);
    if (!ip) return null;
    const day = new Date().toISOString().slice(0, 10);
    return crypto.createHmac("sha256", process.env.SESSION_SECRET || "maze-rats-track")
        .update(`${day}|${subscriberOf(ip)}`).digest("base64").slice(0, 22);
}

// True when this batch is over the cap and should be dropped.
async function overLimit(db, event) {
    const k = limiterKey(event);
    if (!k) return false;
    const col = db.collection(LIMITS);
    await col.insertOne({ k, at: new Date() });
    const n = await col.countDocuments({ k, at: { $gte: new Date(Date.now() - LIMIT_WINDOW_MS) } },
        { limit: LIMIT_BATCHES + 1 });
    return n > LIMIT_BATCHES;
}

/* One counter document per minute, bumped by the rows each batch brings
   and read back in the same atomic step, so a parallel burst cannot all
   see room together (the insert-then-count idea again, in one round trip).
   Counted by rows, not batches, and on the server's clock — the rows' own
   `at` can be backdated by up to an hour (see the handler), so counting
   site_events by `at` would let a sender hide its rows from the count.
   Keyed by the minute alone: nothing about any caller is on it. The TTL
   index on `at` sweeps old minutes with the per-address rows. */
/* The first bump of a minute (or a day) is an upsert, and two of those
   racing can have the second refused with E11000 — which, thrown out to the
   handler's catch, dropped that batch whole. By then the counter exists, so
   the same bump once more is an ordinary update (1 Oct 2026; bumpHourly in
   _errors.js does the same). Every minute's first second on launch day is
   exactly when two batches arrive together. */
async function bump(db, id, rows, onInsert) {
    const run = () => db.collection(LIMITS).findOneAndUpdate(
        { _id: id },
        { $inc: { n: rows }, $setOnInsert: onInsert },
        { upsert: true, returnDocument: "after" }
    );
    let doc;
    try {
        doc = await run();
    } catch (e) {
        if (!e || e.code !== 11000) throw e;
        doc = await run();
    }
    // Either driver shape: the document, or { value }.
    return doc && doc.value !== undefined ? doc.value : doc;
}

async function overGlobal(db, rows) {
    const minute = new Date(Math.floor(Date.now() / 60000) * 60000);
    const doc = await bump(db, `global:${minute.toISOString()}`, rows, { at: minute });
    if (Boolean(doc) && doc.n > GLOBAL_ROWS_PER_MIN) return true;
    /* The day's counter, the same way. Bumped only by batches the minute
       let through, so a burst refused above does not also eat into the day.
       `dayAt`, not `at` — see DAY_COUNTER_KEEP_S. */
    const day = new Date(Math.floor(Date.now() / 86400000) * 86400000);
    const daily = await bump(db, `global-day:${day.toISOString().slice(0, 10)}`, rows, { dayAt: day });
    return Boolean(daily) && daily.n > GLOBAL_ROWS_PER_DAY;
}
const KEEP_DAYS = 60;              // matches the retention the policy states
const MAX_EVENTS_PER_BATCH = 20;
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
    // The limiter's rows live only as long as the window they are counted in.
    const limits = db.collection(LIMITS);
    await limits.createIndex({ at: 1 }, { expireAfterSeconds: LIMIT_WINDOW_MS / 1000 }).catch(() => {});
    await limits.createIndex({ k: 1, at: 1 }).catch(() => {});
    await limits.createIndex({ dayAt: 1 }, { expireAfterSeconds: DAY_COUNTER_KEEP_S }).catch(() => {});
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

    // "null" parses too, and reading .events off it threw out of the handler.
    if (!body || typeof body !== "object") return ok;
    const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
    if (!events.length) return ok;

    const session = clean(body.session, 24);
    const now = Date.now();

    const rows = events.map(e => {
        const name = clean(e && e.name, MAX_NAME);
        // Only names the site sends — see EVENT_NAMES.
        if (!name || !EVENT_NAMES.has(name)) return null;
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
        // Per address first, so a sender already over its own cap does not
        // also spend the global allowance everybody else shares.
        if (await overLimit(db, event)) return ok;
        if (await overGlobal(db, rows.length)) return ok;
        await db.collection(COLLECTION).insertMany(rows, { ordered: false });
    } catch (e) {
        // Never tell an anonymous caller anything, and never fail a beacon.
    }
    return ok;
};

module.exports.COLLECTION = COLLECTION;
module.exports.KEEP_DAYS = KEEP_DAYS;

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("track", exports.handler);
