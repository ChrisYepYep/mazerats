/* The site-wide rate limit (4 Oct 2026, the owner's: Netlify offers this
   site no rate limiting of its own, so it is done here).

   EVERY FUNCTION, ONE PLACE. Each function's handler is already wrapped by
   withErrorReporting (_errors.js), and that wrapper asks checkRateLimit
   before it runs the handler — so a new function is limited the day it is
   added, without anybody remembering to. site-errors.js is the one function
   not wrapped; it keeps its own caps (see THE CAPS in _errors.js).

   WHAT IS COUNTED: requests per NETWORK per clock minute, by the caller's
   subscriber (clientNet in _net.js, so a whole IPv6 /64 is one caller and
   cannot dodge the count by changing address). Never the address itself:
   the key is an HMAC of the network and the day, so the counters say
   nothing about who anybody is and cannot be joined to anything kept
   elsewhere, and each one is deleted by the database two minutes after its
   minute began (a TTL index on `at`).

   FOUR BUDGETS, each counted separately, so a burst of pictures cannot use
   up a visitor's searches or saves:
     media    pictures and other things a page loads many of at once — maze
              pictures, Habbo avatars and outlines, room figures, the furni
              catalogue, the visit counter — counted in each instance's
              memory alone, never in the database (see checkRateLimit);
     search   the player search (profiles.js ?q=), which runs as somebody
              types: plenty for a person, nothing like enough for a script
              reading the player list;
     write    anything that changes something (POST, PUT, PATCH, DELETE);
     read     every other GET.
   Function-specific caps (the sign-in throttle, contact and Missing Pieces
   caps, the daily games' own limits, …) still apply on top of these; this
   is the floor under all of them, not a replacement.

   WHO IS LEFT ALONE: a request carrying a valid Warren token (an admin's
   bulk work — scans, uploads, imports — is not a flood), a request Netlify
   gave no address for (nothing to count it by; a shared "unknown" bucket
   would let strangers limit each other), and CORS preflights.

   ONE ROUND TRIP. A counter document per (budget, network, minute), bumped
   and read back in one atomic findOneAndUpdate, so a parallel burst cannot
   all see room together. And a network found over its budget is
   remembered by this warm instance until the minute turns, so a flood
   costs the database nothing more once it has been caught.

   FAILS OPEN. A limiter that cannot reach the database, or takes longer
   than WAIT_MS to answer, lets the request through: a counter hiccup must
   never take the site down, which is the thing a limiter is for.

   REFUSALS ARE TALLIED per function per hour (`refused:<fn>:<hour>`, kept
   eight days) for the Warren's Errors tab, which shows how many requests
   the limit turned away in the last 24 hours and from which functions.

   Off under `netlify dev` and in the command-line tools, as error
   recording is: local dev talks to the production database. The tests use
   _setDbForTests. */
const crypto = require("crypto");
const { getDb } = require("./_db");
const { clientNet } = require("./_net");
const { SECURITY_HEADERS } = require("./_headers");

const COLLECTION = "rate_limits";

// Requests per network per minute, by budget.
const LIMITS = { media: 600, search: 40, write: 60, read: 240 };

/* The functions a page asks for many times over: one request a picture.
   A first visit to the archive after a deploy (when the edge has nothing
   cached yet) can load a few hundred maze pictures in its first minute. */
const MEDIA = new Set([
    "image", "deal-image", "habbo", "habbo-outline", "room-figure",
    "furni-catalogue", "furni-meta", "furni-shown", "track"
]);

/* NOT LIMITED AT ALL (4 Oct 2026, the bug scan), each because a refusal
   does more harm than the flood it would stop:
     settings      the gate on every page reads it, and took a refusal as
                   "unreachable" — a busy network was shown Maintenance on
                   an open site. Edge-cached and cheap.
     discord-auth  sign-in. A refused callback strands the visitor on a JSON
                   page with Discord's one-use code spent, and a refused
                   `me` shows them signed out for the visit.
     share         the maze, event and guide pages and their link previews:
                   a refusal is JSON to a person and nothing to Discord's
                   unfurler, which asks from a handful of shared addresses.
     sitemap       search engines. */
const EXEMPT = new Set(["settings", "discord-auth", "share", "sitemap"]);

const WAIT_MS = 400;
const MINUTE_MS = 60 * 1000;
const REFUSED_KEEP_S = 8 * 24 * 60 * 60;
const FROM_TOOL = Boolean(require.main && /[\\/]tools[\\/][^\\/]+$/.test(require.main.filename || ""));

let testDb = null;

function budgetOf(name, event) {
    /* Before the method (4 Oct 2026, the bug scan): the visit counter is
       POST only, so it fell to "write" and an office of open tabs spent the
       network's saves and game moves on analytics. */
    if (name === "track") return "media";
    const method = String((event && event.httpMethod) || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return "write";
    if (MEDIA.has(name)) return "media";
    const q = (event && event.queryStringParameters) || {};
    if (name === "profiles" && typeof q.q === "string") return "search";
    return "read";
}

// The network, as a code that changes every day and names nobody.
function keyOf(event) {
    const net = clientNet(event);
    if (!net) return null;
    const day = new Date().toISOString().slice(0, 10);
    return crypto.createHmac("sha256", process.env.SESSION_SECRET || "maze-rats-limits")
        .update(`limits|${day}|${net}`).digest("base64").replace(/[+/=]/g, "").slice(0, 20);
}

let indexed = null;
function ensureIndexes(db) {
    if (!indexed) {
        const col = db.collection(COLLECTION);
        indexed = Promise.all([
            // A minute's counter lives two minutes; an hour's tally eight days.
            col.createIndex({ at: 1 }, { expireAfterSeconds: 2 * MINUTE_MS / 1000 }),
            col.createIndex({ hourAt: 1 }, { expireAfterSeconds: REFUSED_KEEP_S })
        ]).catch(() => { indexed = null; });
    }
    return indexed;
}

const rowOf = (res) => (res && res.value !== undefined ? res.value : res);   // either driver shape

/* Networks this warm instance already knows are over, until their minute
   ends: id -> minute (ms). Pruned as it is read, and capped, so a flood from
   many networks cannot grow it without end. */
const caught = new Map();
// The picture budget's counts, by the same id (see checkRateLimit).
const localCounts = new Map();
const CAUGHT_MAX = 5000;

function isAdmin(event) {
    try {
        return require("./_auth").isAuthorized(event);
    } catch (e) {
        return false;
    }
}

function off() {
    return !testDb && (process.env.NETLIFY_DEV === "true" || FROM_TOOL);
}

function settle(promise, ms) {
    let timer;
    const cap = new Promise(resolve => { timer = setTimeout(() => resolve(undefined), ms); });
    return Promise.race([promise.catch(() => undefined), cap]).finally(() => clearTimeout(timer));
}

function refusal(budget, retryInMs) {
    const seconds = Math.max(1, Math.ceil(retryInMs / 1000));
    return {
        statusCode: 429,
        headers: {
            ...SECURITY_HEADERS,
            // Never kept at the edge: a cached refusal would refuse everybody.
            "Cache-Control": "no-store",
            "Netlify-CDN-Cache-Control": "no-store",
            "Retry-After": String(seconds)
        },
        body: JSON.stringify({
            error: "Too many requests just now. Wait a moment and try again.",
            reason: "rate-limit",
            budget,
            retryInMs
        })
    };
}

async function tallyRefusal(db, name) {
    const hour = new Date(Math.floor(Date.now() / 3600000) * 3600000);
    await db.collection(COLLECTION).updateOne(
        { _id: `refused:${name}:${hour.toISOString()}` },
        { $inc: { n: 1 }, $setOnInsert: { fn: name, hourAt: hour } },
        { upsert: true }
    );
}

async function count(db, id, minute) {
    const bump = () => db.collection(COLLECTION).findOneAndUpdate(
        { _id: id },
        { $inc: { n: 1 }, $setOnInsert: { at: new Date(minute) } },
        { upsert: true, returnDocument: "after", projection: { n: 1 } }
    );
    let doc;
    try {
        doc = rowOf(await bump());
    } catch (e) {
        // Two first bumps of a minute racing: the counter exists by now.
        if (!e || e.code !== 11000) throw e;
        doc = rowOf(await bump());
    }
    return doc && typeof doc.n === "number" ? doc.n : 0;
}

/* null to go ahead, or the 429 response to answer with. Never throws. */
async function checkRateLimit(name, event) {
    try {
        if (off()) return null;
        if (EXEMPT.has(name)) return null;
        const method = String((event && event.httpMethod) || "GET").toUpperCase();
        if (method === "OPTIONS") return null;
        const key = keyOf(event);
        if (!key) return null;
        if (isAdmin(event)) return null;

        const budget = budgetOf(name, event);
        const now = Date.now();
        const minute = Math.floor(now / MINUTE_MS) * MINUTE_MS;
        const retryInMs = minute + MINUTE_MS - now;
        const id = `${budget}:${key}:${minute}`;

        const known = caught.get(id);
        if (known !== undefined) {
            if (known === minute) return refusal(budget, retryInMs);
            caught.delete(id);
        }

        /* PICTURES ARE COUNTED HERE ALONE, never in the database (4 Oct
           2026, the bug scan). Most of these functions never touch it — the
           image function says so in as many words — and counting a picture
           there opened a database connection on every warm instance a page
           of a few hundred pictures spread across, and a write per picture.
           In memory the count is this instance's share of the network's
           minute, which is enough to stop one script hammering one instance
           and costs nothing; a picture refusal is not tallied for the tab. */
        if (budget === "media") {
            const n = (localCounts.get(id) || 0) + 1;
            if (localCounts.size >= CAUGHT_MAX) {
                for (const k of localCounts.keys()) if (!k.endsWith(`:${minute}`)) localCounts.delete(k);
                if (localCounts.size >= CAUGHT_MAX) localCounts.clear();
            }
            localCounts.set(id, n);
            return n <= LIMITS.media ? null : refusal(budget, retryInMs);
        }

        const verdict = await settle((async () => {
            const db = testDb || await getDb();
            ensureIndexes(db);
            const n = await count(db, id, minute);
            if (n <= LIMITS[budget]) return null;
            // The first refusal of the minute is tallied; the rest are caught here.
            if (caught.size >= CAUGHT_MAX) {
                for (const [k, m] of caught) if (m !== minute) caught.delete(k);
                if (caught.size >= CAUGHT_MAX) caught.clear();
            }
            caught.set(id, minute);
            await tallyRefusal(db, name).catch(() => {});
            return refusal(budget, retryInMs);
        })(), WAIT_MS);
        return verdict || null;
    } catch (e) {
        return null;
    }
}

/* For the Errors tab: requests refused in the last 24 hours, in all and by
   function. Counts the first refusal of each network's minute on each warm
   instance, so it is a floor, not an exact count of every refused request. */
async function refusedSince(db, since) {
    /* From the start of the hour `since` falls in (4 Oct 2026, the bug
       scan): the tallies are by the hour, and a bare `since` left out the
       oldest one, so "24h" counted 23 to 24. */
    const from = new Date(Math.floor(since.getTime() / 3600000) * 3600000);
    const rows = await db.collection(COLLECTION)
        .find({ hourAt: { $gte: from }, fn: { $exists: true } }, { projection: { _id: 0, fn: 1, n: 1 } })
        .toArray();
    const byFn = {};
    let total = 0;
    for (const r of rows) {
        const n = Number(r.n) || 0;
        total += n;
        byFn[r.fn] = (byFn[r.fn] || 0) + n;
    }
    return { last24h: total, byFn };
}

function _setDbForTests(db) {
    testDb = db;
    indexed = null;
    caught.clear();
    localCounts.clear();
}

module.exports = { checkRateLimit, refusedSince, budgetOf, LIMITS, MEDIA, COLLECTION, _setDbForTests };
