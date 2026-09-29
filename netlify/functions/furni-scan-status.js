/* Progress of the running furni scan.

   The scan runs as a separate process on the owner's own machine
   (tools/furni-scan-local.js, started by furni-scan-local.js), so there is
   no request left open for it to answer through. It writes its progress to
   a single record as it works, and the admin polls this to draw the bar —
   which is how a browser can show a progress bar for work happening in a
   process it has no connection to. Deliberately tiny and cheap: it gets
   called every couple of seconds for as long as a scan is running.
*/

const { getDb } = require("./_db.js");
const { hasAccount, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth.js");
const { SECURITY_HEADERS } = require("./_headers");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

exports.handler = async (event) => {
    /* A live account, not just a signed token (see hasAccount in _auth.js).
       One more indexed findOne beside the one this already makes, on a poll
       that only runs while a scan does. */
    /* The guard THROWS when it cannot reach the database to ask, rather
       than answering "no account" — see isAuthUnavailable in _auth.js. That
       is a 503 here, never a 401: the admin page reads a 401 from this poll
       as the session having ended, and would sign the owner out over a
       database blip in the middle of a scan. */
    try {
        if (!(await hasAccount(event))) return UNAUTHORIZED;
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        throw e;
    }
    try {
        const db = await getDb();
        const doc = await db.collection("furni_scans").findOne({ _id: "current" });
        if (!doc) return json(200, { running: false });
        const { _id, ...progress } = doc;
        return json(200, {
            // "Running" means started and not yet finished. A crashed run
            // would otherwise look like it was still going forever, so a
            // stale heartbeat counts as finished too.
            running: !progress.finishedAt &&
                     Date.now() - new Date(progress.updatedAt).getTime() < 5 * 60 * 1000,
            ...progress
        });
    } catch (err) {
        // The reason to the log; a driver error is nobody else's business.
        console.error("furni-scan-status: read failed", err);
        return json(500, { error: "Could not read the scan progress" });
    }
};

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("furni-scan-status", exports.handler);
