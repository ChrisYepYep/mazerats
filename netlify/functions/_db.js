/* Shared MongoDB connection helper for Netlify Functions.
   Caches the client across warm serverless invocations instead of
   reconnecting on every request. */
const { MongoClient } = require("mongodb");

let cachedClient = null;

async function getDb() {
    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI environment variable is not set");
    }
    if (!cachedClient) {
        cachedClient = new MongoClient(process.env.MONGODB_URI);
        await cachedClient.connect();
    }
    return cachedClient.db("mazerats");
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

async function ensureUniqueIndex(collection, field) {
    const key = `${collection.collectionName}.${field}`;
    if (ensuredIndexes.has(key)) return;
    await collection.createIndex({ [field]: 1 }, { unique: true });
    ensuredIndexes.add(key);
}

module.exports = { getDb, ensureUniqueIndex };
