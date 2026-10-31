/* /.netlify/functions/presence — who still has the archive open while the
   site counts down into Maintenance (30 Oct 2026, the owner's: "this
   countdown should be visible in the warren too, displaying the amount of
   current users on the site, so i can see when everyone has been moved to
   the landing page").

   Only during the countdown. An open archive page polls the settings
   anyway (js/maintenance-warn.js); once it hears Maintenance it shows the
   two-minute warning and calls here every PING_MS until it is moved to the
   landing page, when it says goodbye. Outside Maintenance nothing calls
   here, and a ping that arrives anyway is turned away, so this can never
   become a running visitor log.

   WHAT IS KEPT: a random id the page made for this one tab (never stored
   in the browser, gone when the tab is) and the time of its last ping.
   No address, no account, nothing else. Each row is deleted by the
   database KEEP_S after its last ping (a TTL index on `expires`), and at once
   on goodbye.

     POST { id }                  still here (only while in Maintenance)
     POST { id, leaving: true }   moved to the landing page, or closed
     GET  (Warren session)        { count, kickAt, landingState, now }

   `count` is browser tabs, not people: a visitor with the archive open in
   three tabs is three, which is what the Warren's line says (31 Oct 2026). */
const { getDb } = require("./_db");
const { isAuthorized, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { maintenanceKickAt: kickAtOf } = require("./_maintenance");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

const COLLECTION = "presence";
// js/maintenance-warn.js pings this often; a tab not heard from in
// FRESH_MS is counted as gone, and its row is deleted after KEEP_S.
const PING_MS = 10000;
/* Seventy seconds (30 Oct 2026, the bug scan): a browser slows the timers
   of a tab hidden for a while to about once a minute, so at 25 seconds a
   background tab dropped out of the count while still open. A tab that is
   closed or moved says goodbye at once, so this only delays a vanished one. */
const FRESH_MS = 70000;
/* Deleted by `expires`, KEEP_S after the last ping (30 Oct 2026). The TTL
   index was on `at` with 120 seconds, but Mongo's TTL sweep only runs once
   a minute, so a row could outlive the privacy policy's "deleted within two
   minutes" by most of a minute; and an index already made with other
   options (tried from netlify dev, which writes to the live database)
   cannot be changed by createIndex, which refuses and was silently caught.
   A field of its own with expireAfterSeconds 0 says exactly when, and a
   failed attempt is tried again on the next ping. */
const KEEP_S = 75;    // past FRESH_MS, so a row is never gone while counted
const ID = /^[a-z0-9]{12,32}$/;

/* HELD TO WHAT A REAL TAB SENDS (30 Oct 2026, the bug scan): anybody could
   post made-up ids through the whole of Maintenance and swell the Warren's
   "still on the site" count. A ping must come from this site, be small, and
   a NEW id is only taken until LATE_MS after the kick (a tab that late is
   moved on its next tick); an id already counted may go on pinging. */
const MAX_BODY = 256;
const LATE_MS = 60000;
function sameOrigin(event) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return true;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try {
        return new URL(origin).host === host;
    } catch (e) {
        return false;
    }
}

let indexed = false;
async function ensureTtl(col) {
    if (indexed) return;
    indexed = true;
    await col.createIndex({ expires: 1 }, { expireAfterSeconds: 0 }).catch(e => {
        indexed = false;
        console.error("presence: TTL index not made", e);
    });
}

exports.handler = async (event) => {
    const method = event.httpMethod;
    if (method !== "GET" && method !== "POST") return json(405, { error: "Method not allowed" });
    if (method === "GET" && !isAuthorized(event)) return UNAUTHORIZED;

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("presence: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const col = db.collection(COLLECTION);

    try {
        const site = await db.collection("settings").findOne({ _id: "site" }, { projection: { landingState: 1, maintenanceAt: 1 } });
        const inMaintenance = !!site && site.landingState === "maintenance";

        if (method === "GET") {
            const count = inMaintenance ? await col.countDocuments({ at: { $gt: new Date(Date.now() - FRESH_MS) } }) : 0;
            return json(200, {
                landingState: (site && site.landingState) || "enter",
                kickAt: inMaintenance ? kickAtOf(site) : "",
                count,
                /* The server's time (31 Oct 2026, the bug scan): the Warren
                   counts down to kickAt by it, not by the admin's own clock,
                   as js/maintenance-warn.js does from a ping's answer. */
                now: new Date().toISOString()
            });
        }

        if (!sameOrigin(event)) return json(403, { error: "Forbidden" });
        if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
        let body;
        try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
        if (!body || typeof body !== "object" || typeof body.id !== "string" || !ID.test(body.id)) {
            return json(400, { error: "Invalid request body" });
        }
        if (body.leaving === true) {
            await col.deleteOne({ _id: body.id });
            return json(200, { ok: true });
        }
        // Outside Maintenance a ping is not wanted, and not kept.
        if (!inMaintenance) return json(200, { ok: false, landingState: (site && site.landingState) || "enter" });
        await ensureTtl(col);
        const now = Date.now();
        const kick = Date.parse(kickAtOf(site));
        if (Number.isFinite(kick) && now > kick + LATE_MS && !(await col.findOne({ _id: body.id }, { projection: { _id: 1 } }))) {
            return json(200, { ok: true, kickAt: kickAtOf(site), now: new Date().toISOString() });
        }
        await col.updateOne({ _id: body.id }, { $set: { at: new Date(now), expires: new Date(now + KEEP_S * 1000) } }, { upsert: true });
        // The server's time, for js/maintenance-warn.js to count by.
        return json(200, { ok: true, kickAt: kickAtOf(site), now: new Date().toISOString() });
    } catch (e) {
        console.error("presence: failed", e);
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        return json(503, { error: "Presence could not be read just now." });
    }
};

exports.handler = require("./_errors").withErrorReporting("presence", exports.handler);
