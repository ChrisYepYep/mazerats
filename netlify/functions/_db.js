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

module.exports = { getDb };
