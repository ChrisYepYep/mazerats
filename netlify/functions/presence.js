/* /.netlify/functions/presence — who still has the archive open while the
   site counts down into Maintenance (30 Oct 2026, the owner's: "this
   countdown should be visible in the warren too, displaying the amount of
   current users on the site, so i can see when everyone has been moved to
   the landing page").

   TWO COUNTS, kept in two collections that never mix.

   THE COUNTDOWN'S, only during Maintenance. An open archive page polls the
   settings anyway (js/maintenance-warn.js); once it hears Maintenance it
   shows the two-minute warning and calls here every PING_MS until it is
   moved to the landing page, when it says goodbye. Outside Maintenance a
   countdown ping is turned away, not kept.

   THE LIVE COUNT, all the time (14 Nov 2026, the owner's: a live "Users:
   [number]" in the Warren's Controls). Every public page checks in
   (js/presence-live.js) with { id, live: true }: once a minute while it is
   looked at, every few minutes while it is in the background, and not at
   all after half an hour in the background, or with Do Not Track or Global
   Privacy Control on. So this is a running count of open tabs, never a log
   of visits: nothing says which page, or who.

   WHAT IS KEPT, in both: a random id the page made for this one tab (never
   stored in the browser, gone when the tab is) and the time of its last
   ping. No address, no account, nothing else. Each row is deleted by the
   database a little after its last ping (a TTL index on `expires`), and at
   once on goodbye.

     POST { id }                          countdown: still here (only while in Maintenance)
     POST { id, leaving: true }           countdown: moved to the landing page, or closed
     POST { id, live: true, hidden? }     live count: still here (hidden: in the background)
     POST { id, live: true, leaving: true }  live count: closed
     GET  (Warren session)                { count, kickAt, landingState, now, users, usersCapped }

   HELD TO WHAT A REAL TAB SENDS (14 Nov 2026, the bug scan): a script could
   make thousands of "users", each a database write. A live ping must carry
   this site's Origin (every browser sends one on these), a network may
   start only NEW_PER_NET new tabs a minute on each warm instance (counted
   in memory by the rate limit's daily network code, nothing stored), and
   past LIVE_CAP tabs no new one is taken at all; the Warren then says
   "3000+". A tab already counted always carries on.

   `count` is browser tabs, not people: a visitor with the archive open in
   three tabs is three, which is what the Warren's line says (31 Oct 2026). */
const { getDb } = require("./_db");
const { hasLiveSession, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { SECURITY_HEADERS } = require("./_headers");
const { maintenanceKickAt: kickAtOf } = require("./_maintenance");
const { keyOf } = require("./_ratelimit");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

const COLLECTION = "presence";
const LIVE = "presence_live";
/* How long a live check-in counts for (14 Nov 2026, the bug scan). js/presence-live.js checks in every minute while the tab is looked
   at, so two minutes and a half without a word and it is gone; in the background it checks in every four minutes (a browser can hold
   that back by up to a minute more), so a hidden tab's ping counts for six and a half. Each row's `expires` is when it stops counting
   plus LIVE_MARGIN_MS, so the Warren's count reads the indexed `expires` alone, never a scan of `at`, and the database deletes the row
   just after it stops counting. */
const LIVE_FRESH_MS = 150000, LIVE_HIDDEN_FRESH_MS = 390000, LIVE_MARGIN_MS = 10000;
/* The caps on new tabs (see HELD TO WHAT A REAL TAB SENDS, above). Twenty a minute is any family's or office's tabs and more; past the
   ceiling the count is plainly a flood, and the Warren says "3000+". The total is asked at most every LIVE_TOTAL_MS per instance. */
const NEW_PER_NET = 20, LIVE_CAP = 3000, LIVE_TOTAL_MS = 30000;
/* A goodbye beats a ping still on its way (14 Nov 2026, the bug scan): the ping's write landed after the delete and brought the row
   back for minutes. An id that said goodbye is ignored here for GONE_MS (this instance's memory only; the page makes a new id if it
   comes back from the back-forward cache). */
const GONE_MS = 60000;
const MEMORY_MAX = 5000;
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
/* `required`: the live count's pings must carry an Origin (14 Nov 2026, the bug scan). A browser always sends one on a POST fetch and
   on sendBeacon, so only a script leaves it out. */
function sameOrigin(event, required) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return !required;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try {
        return new URL(origin).host === host;
    } catch (e) {
        return false;
    }
}

let liveIndexed = false;
async function ensureLiveTtl(col) {
    if (liveIndexed) return;
    liveIndexed = true;
    await col.createIndex({ expires: 1 }, { expireAfterSeconds: 0 }).catch(e => { liveIndexed = false; console.error("presence: live TTL index not made", e); });
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

/* This instance's memory for the live count's caps: new tabs per network this minute, ids that said goodbye, and the last total. Each
   map is pruned when it fills, so a flood cannot grow it without end. */
const newByNet = new Map();    // network code -> { minute, n }
const gone = new Map();        // id -> until (ms)
let liveTotal = { n: 0, at: 0 };
function keepSmall(map, stale) {
    if (map.size < MEMORY_MAX) return;
    for (const [k, v] of map) if (stale(v)) map.delete(k);
    if (map.size >= MEMORY_MAX) map.clear();
}
const liveFreshFilter = () => ({ expires: { $gt: new Date(Date.now() + LIVE_MARGIN_MS) } });
// Whether a tab not yet counted may be: under its network's minute and under the ceiling.
async function roomForNew(live, event) {
    const key = keyOf(event);
    if (key) {
        const minute = Math.floor(Date.now() / 60000);
        const seen = newByNet.get(key);
        const n = seen && seen.minute === minute ? seen.n + 1 : 1;
        if (n > NEW_PER_NET) return false;
        keepSmall(newByNet, v => v.minute !== minute);
        newByNet.set(key, { minute, n });
    }
    if (Date.now() - liveTotal.at > LIVE_TOTAL_MS) liveTotal = { n: await live.countDocuments(liveFreshFilter()), at: Date.now() };
    if (liveTotal.n >= LIVE_CAP) return false;
    liveTotal.n++;
    return true;
}
// Either driver shape of an update's answer: did it find the row?
const matched = r => !!r && ((r.matchedCount || 0) > 0 || (r.result && r.result.n > 0));

async function livePing(db, event, body) {
    const live = db.collection(LIVE);
    const now = Date.now();
    if (body.leaving === true) {
        keepSmall(gone, until => until < now);
        gone.set(body.id, now + GONE_MS);
        await live.deleteOne({ _id: body.id });
        return json(200, { ok: true });
    }
    const goneUntil = gone.get(body.id);
    if (goneUntil !== undefined) {
        if (goneUntil > now) return json(200, { ok: false });
        gone.delete(body.id);
    }
    await ensureLiveTtl(live);
    const fresh = body.hidden === true ? LIVE_HIDDEN_FRESH_MS : LIVE_FRESH_MS;
    const set = { $set: { at: new Date(now), expires: new Date(now + fresh + LIVE_MARGIN_MS) } };
    // A tab already counted carries on, one write; only a new one is held to the caps.
    if (matched(await live.updateOne({ _id: body.id }, set))) return json(200, { ok: true });
    if (!(await roomForNew(live, event))) return json(200, { ok: false });
    await live.updateOne({ _id: body.id }, set, { upsert: true });
    return json(200, { ok: true });
}

exports.handler = async (event) => {
    const method = event.httpMethod;
    if (method !== "GET" && method !== "POST") return json(405, { error: "Method not allowed" });
    if (method === "GET") {
        try {
            if (!(await hasLiveSession(event))) return UNAUTHORIZED;
        } catch (e) {
            // 503 to try again, never the 401 that signs the admin page out.
            return AUTH_UNAVAILABLE;
        }
    }

    // A ping is read before the database is asked anything: a bad one costs nothing.
    let body = null;
    if (method === "POST") {
        if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
        try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
        if (!body || typeof body !== "object" || typeof body.id !== "string" || !ID.test(body.id)) {
            return json(400, { error: "Invalid request body" });
        }
        if (!sameOrigin(event, body.live === true)) return json(403, { error: "Forbidden" });
    }

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("presence: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const col = db.collection(COLLECTION);

    try {
        /* The live count's check-ins first (14 Nov 2026, the bug scan): they never need the settings, and reading them first made two
           database calls of every check-in where one will do. */
        if (body && body.live === true) return await livePing(db, event, body);

        const site = await db.collection("settings").findOne({ _id: "site" }, { projection: { landingState: 1, maintenanceAt: 1 } });
        const inMaintenance = !!site && site.landingState === "maintenance";

        if (method === "GET") {
            /* Both counted on the indexed `expires` (14 Nov 2026, the bug scan), not `at`, which has no index: a countdown row stops
               counting FRESH_MS after its ping, which is KEEP_S * 1000 - FRESH_MS before it expires. */
            const count = inMaintenance ? await col.countDocuments({ expires: { $gt: new Date(Date.now() + KEEP_S * 1000 - FRESH_MS) } }) : 0;
            const users = await db.collection(LIVE).countDocuments(liveFreshFilter());
            return json(200, {
                users,
                // Past the ceiling no new tab is taken, so the number is a floor: the Warren says "3000+".
                usersCapped: users >= LIVE_CAP,
                usersCap: LIVE_CAP,
                landingState: (site && site.landingState) || "enter",
                kickAt: inMaintenance ? kickAtOf(site) : "",
                count,
                /* The server's time (31 Oct 2026, the bug scan): the Warren
                   counts down to kickAt by it, not by the admin's own clock,
                   as js/maintenance-warn.js does from a ping's answer. */
                now: new Date().toISOString()
            });
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
        return json(503, { error: "Presence couldn't be read just now." });
    }
};

exports.handler = require("./_errors").withErrorReporting("presence", exports.handler);
