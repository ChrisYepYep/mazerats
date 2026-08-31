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
const { isAuthorized, UNAUTHORIZED } = require("./_auth.js");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

exports.handler = async (event) => {
    if (!isAuthorized(event)) return UNAUTHORIZED;
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
        return json(500, { error: err.message });
    }
};
