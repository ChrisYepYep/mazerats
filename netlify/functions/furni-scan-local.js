/* Starts a furni scan on the machine running `netlify dev`.

   The scan used to be a Netlify background function. It was deleted, and
   this replaces it, because the two are not really comparable: the hosted
   one was capped at fifteen minutes — about six room images — could never
   finish the archive in one go, and billed for every minute it spent
   failing to. tools/furni-scan-local.js does the whole 562-image archive in
   about fifteen minutes across this machine's cores, for nothing.

   So the button in the admin page now spawns a process HERE. That only
   means anything when "here" is the owner's own PC:

     netlify dev  ->  functions run as local Node processes, and this can
                      spawn the scanner, which has the .env, the database
                      and the sprite cache all sitting next to it.
     deployed     ->  the function runs in AWS. There is no scanner there,
                      no sprite cache, and no way to reach the owner's
                      machine from it. It refuses, and says why.

   NETLIFY_DEV is the check. Not AWS_LAMBDA_FUNCTION_NAME, which is set to
   "handler" locally too because the CLI runs functions in Lambda
   compatibility mode — it looks like a production signal and is not one.

   The child is spawned DETACHED with its streams ignored. A scan outlives
   this request by a quarter of an hour; holding it open would time out long
   before, and inheriting the CLI's stdout would tie the scan's life to a
   terminal that may be closed. Progress reaches the admin the same way it
   always has, through the furni_scans record that furni-scan-status.js
   serves — see the --run-id handling in the tool.
*/

const path = require("path");
const { spawn } = require("child_process");
const { getDb } = require("./_db.js");
const { isOwner, isAuthorized, UNAUTHORIZED, forbidden } = require("./_auth.js");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
});

/* Where the repo is, from the point of view of a function file inside it.
   Derived from __dirname rather than process.cwd(): the CLI's working
   directory is the project root today, but that is a convention of how it
   happens to be launched, and a shortcut that starts it from elsewhere
   would silently break the spawn. */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCANNER = path.join(REPO_ROOT, "tools", "furni-scan-local.js");

exports.handler = async (event) => {
    // Owner-only, as the hosted scan was. A scan replaces the furni recorded
    // against every image it covers, and there is exactly one progress
    // record, so a second scan started by somebody else stamps on the first.
    if (!isAuthorized(event)) return UNAUTHORIZED;
    if (!(await isOwner(event))) return forbidden("Only an owner can run a furni scan.");

    if (process.env.NETLIFY_DEV !== "true") {
        return json(501, {
            error: "Furni scans run on your own machine now, not on the server. " +
                   "Start the local site (the \"Maze Rats Dev Server\" shortcut on the Desktop), " +
                   "open this admin page at localhost:8888, and the scan buttons will work there."
        });
    }

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    const { ids = [], onlyUnscanned = false, runId, collection = "rooms" } = body;
    if (!Array.isArray(ids) || !ids.length) return json(400, { error: "no ids given" });
    // These become command-line arguments to a spawned process. ids are
    // constrained to what an id can contain and the collection to one of two
    // literals — not because spawn() without a shell is injectable, but so a
    // malformed id fails here rather than as a confusing scan of nothing.
    if (!ids.every(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id))) {
        return json(400, { error: "ids must be plain record ids" });
    }

    /* One scan at a time. They share the single furni_scans record, so a
       second run would overwrite the first's progress and leave the admin
       watching a bar that describes neither run. Checked against the record
       rather than a flag in memory, because this function is re-created per
       request and remembers nothing between them. */
    try {
        const db = await getDb();
        const current = await db.collection("furni_scans").findOne({ _id: "current" });
        if (current && !current.finishedAt &&
            Date.now() - new Date(current.updatedAt).getTime() < 5 * 60 * 1000) {
            return json(409, { error: "A scan is already running. Wait for it to finish, or restart the dev server to stop it." });
        }
    } catch { /* if the check itself fails, let the scan proceed */ }

    const args = [SCANNER, "--ids", ids.join(",")];
    if (collection === "events") args.push("--collection", "events");
    if (onlyUnscanned) args.push("--only-unscanned");
    if (runId) args.push("--run-id", String(runId));

    try {
        const child = spawn(process.execPath, args, {
            cwd: REPO_ROOT,
            detached: true,
            stdio: "ignore",
            // The scanner reads .env itself, so nothing secret is passed
            // through here; it only needs to know where to fetch room
            // images from, which the CLI already knows.
            env: { ...process.env, SCAN_SITE_URL: process.env.SCAN_SITE_URL || "https://mazerats.net" }
        });
        // Let the parent exit without waiting on it — the request is done
        // the moment the scan is running.
        child.unref();
        return json(202, { started: true, runId: runId || null, images: null, pid: child.pid });
    } catch (err) {
        return json(500, { error: `Couldn't start the local scan: ${err.message}` });
    }
};
