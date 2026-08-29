/* Progress of the running furni scan.

   The scan is a background function, which by definition can't report back
   to whoever started it — so it writes its progress to a single record as it
   works (see furni-scan-background.js) and the admin polls this to draw the
   bar. Deliberately tiny and cheap: it gets called every couple of seconds
   for as long as a scan is running.
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
