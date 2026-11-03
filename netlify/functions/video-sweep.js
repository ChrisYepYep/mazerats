/* video-sweep: the articles' video uploads that were never finished, or
   finished and never used (2 Nov 2026, the owner's: "abandoned partial
   uploads get cleaned up later too").

   A SCHEDULED function (netlify.toml: hourly), never called over HTTP:
   Netlify runs scheduled functions on the published site only and refuses
   them a URL there. Each wake walks the pending marks (sweep in _videos.js):
   an upload stopped part way goes once it is two hours old, a finished one
   no article names once it is two days old, and one an article does name
   loses its mark and is left alone from then on. Usually there is nothing
   to look at and the run is one small list.

   Never from a local run: netlify dev talks to the live database and the
   live store (see the project notes). */
const { getDb } = require("./_db");
const V = require("./_videos");

exports.handler = async () => {
    if (process.env.NETLIFY_DEV === "true") {
        return { statusCode: 200, body: JSON.stringify({ skipped: "not from netlify dev" }) };
    }
    try {
        const inUse = async key => require("./upload").isInUse(await getDb(), key);
        const done = await V.sweep(V.videoStore(), inUse, { limit: 50 });
        if (done.removed.length || done.claimed.length) console.log("video-sweep:", JSON.stringify(done));
        return { statusCode: 200, body: JSON.stringify(done) };
    } catch (e) {
        console.error("video-sweep: run failed", e);
        return { statusCode: 500, body: JSON.stringify({ error: "run failed" }) };
    }
};
