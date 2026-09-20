/* Shared MongoDB connection helper for Netlify Functions.
   Caches the client across warm serverless invocations instead of
   reconnecting on every request. */
const { MongoClient } = require("mongodb");

/* ---- HOW MANY CONNECTIONS THIS IS ALLOWED TO OPEN, and why it matters.

   The Node driver defaults to maxPoolSize: 100. That is a sensible number
   for one long-lived server and the wrong number entirely for a serverless
   function, because there is not one of these — Netlify runs as many
   instances as the traffic needs, each with its own client and its own
   pool. Twenty concurrent instances at the default is two thousand
   connections asked of a cluster whose plan allows five hundred, and what
   happens then is not a slow site: it is connections being refused, which
   surfaces as the archive failing to load for everybody at once.

   The ceiling is low because the work is small. A function invocation
   handles ONE request and almost every request here is a single query, so
   the pool is idle the moment it has answered. Five leaves room for the
   handful of handlers that do two or three queries in parallel (the
   sitemap, daily-scores) without ever being the reason a cluster runs out.

   This is the setting that decides whether a launch-day crowd is served or
   turned away, and it had never been set. */
const MAX_POOL = 5;

/* And how long to wait before admitting the cluster is not answering.

   The driver's default is thirty seconds, which is longer than a function
   is allowed to run — so a cluster that is unreachable produced a timeout
   at the platform's hand rather than an error this code could return, and
   the caller saw a dead request instead of a handled failure. Five seconds
   is comfortably longer than a healthy connect and comfortably shorter
   than every client timeout on the front end (js/api.js allows 6s, then
   12s, before falling back to the bundled archive). */
const SERVER_SELECTION_MS = 5000;

/* The PROMISE is cached, not the client, and that is not a detail.

   Caching the client meant two things went wrong under exactly the
   conditions a busy launch produces. Two invocations arriving in the same
   warm instance before the first connect resolved both saw a client that
   existed and neither waited for it. And worse: if connect() REJECTED, the
   dead client stayed in the variable for the life of that instance, so a
   single transient Atlas hiccup left one warm instance failing every
   request it was handed afterwards, with nothing to clear it but a cold
   start.

   Caching the promise fixes both. Concurrent callers await the same
   connect, and a rejection clears the cache so the next request tries
   again rather than inheriting the failure. */
let clientPromise = null;

async function getDb() {
    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI environment variable is not set");
    }
    if (!clientPromise) {
        const client = new MongoClient(process.env.MONGODB_URI, {
            maxPoolSize: MAX_POOL,
            serverSelectionTimeoutMS: SERVER_SELECTION_MS
        });
        clientPromise = client.connect().catch(err => {
            clientPromise = null;      // let the next request try again
            throw err;
        });
    }
    const client = await clientPromise;
    return client.db("mazerats");
}

// Memoized the same way cachedClient above is — createIndex is cheap/no-op
// once an identical index already exists, but there's no reason to pay
// even that round-trip on every single request when a warm invocation can
// just remember it already checked. Used by rooms.js/events.js/
// contributors.js so their id-uniqueness is enforced atomically by Mongo
// itself (insert-and-catch-the-duplicate-key-error) instead of a
// check-then-insert race where two near-simultaneous requests can both
// pass a findOne() check before either insert lands, producing two
// documents with the same id.
const ensuredIndexes = new Set();

/* `field` is one field name, or an array of them for a compound key.

   The array form is what ff-scores.js's tournament board needs: its rows
   are unique per (tournament, player) rather than per player, because the
   same person has a row in every meet. A unique index on playerId alone
   would be wrong there — it would let the second tournament overwrite the
   first — and no index at all would leave the upsert open to the same
   check-then-insert race described above, which is precisely the race a
   launch-day crowd is most likely to find.

   The memo key joins the fields, so ["tid","playerId"] and ["playerId"]
   on the same collection are remembered as different indexes. */
async function ensureUniqueIndex(collection, field) {
    const fields = Array.isArray(field) ? field : [field];
    const key = `${collection.collectionName}.${fields.join("+")}`;
    if (ensuredIndexes.has(key)) return;
    const spec = {};
    for (const f of fields) spec[f] = 1;
    await collection.createIndex(spec, { unique: true });
    ensuredIndexes.add(key);
}

/* A plain index, for a SORT rather than for uniqueness.

   `spec` is the full key document, so the direction of each field can be
   given — which matters, because an index only serves a sort whose fields
   and directions it matches in order.

   Memoised and swallowed on failure, unlike the unique one above, and the
   difference is deliberate. A missing unique index is a correctness
   problem and should be noticed; a missing sort index only means the
   query is slower, and taking a leaderboard down because an index could
   not be built is the wrong trade. */
async function ensureIndex(collection, spec) {
    const key = `${collection.collectionName}.sort:${JSON.stringify(spec)}`;
    if (ensuredIndexes.has(key)) return;
    ensuredIndexes.add(key);       // set first: one attempt per warm instance
    try {
        await collection.createIndex(spec);
    } catch (e) { /* the query still works, just unaided */ }
}

module.exports = { getDb, ensureUniqueIndex, ensureIndex };
