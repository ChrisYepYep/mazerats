/* speed-measure: the live site's speed on a phone, measured by Google's
   PageSpeed Insights (2 Nov 2026; the Warren's Speed card).

   A SCHEDULED function (netlify.toml: every five minutes), never called
   over HTTP: Netlify runs scheduled functions on the published site only
   and refuses them a URL there. Each wake asks speed-checks.js's runDue,
   which measures the landing page and /home when their weekly slot has
   come round (Mondays from 06:00 UTC) or when an admin has pressed Measure
   now, and otherwise does nothing but one small read. Everything about
   what is stored and why is in speed-checks.js.

   Never from a local run: netlify dev talks to the live database (see the
   project notes), and a local wake would measure and save for real. */
const { getDb } = require("./_db");
const { runDue } = require("./speed-checks");

exports.handler = async () => {
    if (process.env.NETLIFY_DEV === "true") {
        return { statusCode: 200, body: JSON.stringify({ skipped: "not from netlify dev" }) };
    }
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("speed-measure: database connection failed", e);
        return { statusCode: 503, body: JSON.stringify({ error: "database" }) };
    }
    try {
        const done = await runDue(db, Date.now());
        if (done.measured.length) console.log("speed-measure:", done.measured.join("; "));
        return { statusCode: 200, body: JSON.stringify(done) };
    } catch (e) {
        console.error("speed-measure: run failed", e);
        return { statusCode: 500, body: JSON.stringify({ error: "run failed" }) };
    }
};
