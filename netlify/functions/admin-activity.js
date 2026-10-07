/* /.netlify/functions/admin-activity — the admin activity log, for owners.

   Owner-only, and enforced here rather than only hidden in the page: this
   answers who signed in, from what address, and what they changed, which is
   exactly the sort of thing a standard admin should not be able to read
   about their colleagues.

   Two halves. ADMINS: sign-ins and changes by the admin accounts, a
   handful of named, authenticated people with write access to a live site,
   where an audit trail is ordinary practice. VISITORS: what the site's
   visitors use, from the first-party interaction records (js/track.js) —
   counted only, never listed, with no address or account on them and a
   session id that dies with the tab, as the privacy policy says; the
   figures are worked out in _visitor-stats.js.

   Returns two views of the same records, because they answer different
   questions: SESSIONS (who was in, when, for how long, how much they did)
   and EVENTS (the raw log, newest first). */

const { getDb } = require("./_db");
const { isAuthorized, roleOf, UNAUTHORIZED, forbidden, AUTH_UNAVAILABLE } = require("./_auth");
const { COLLECTION, KEEP_DAYS } = require("./_audit");
const { COLLECTION: SITE_EVENTS, KEEP_DAYS: SITE_KEEP_DAYS } = require("./track");
const { SECURITY_HEADERS } = require("./_headers");
const { visitorStats } = require("./_visitor-stats");

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data),
});

const MAX_EVENTS = 400;

/* The windows the panel can ask for. Everything is worked out in UTC, which
   is what the records are stamped in and what the rest of this site already
   shows dates in — a "today" that shifted with the reader's timezone would
   quietly disagree with every other date on the page.

   Retention caps what "all" can mean: the admin log keeps 90 days and the
   visitor log 60, so the longest window is however much of that survives. */
const RANGES = {
    "24h":   () => new Date(Date.now() - 24 * 60 * 60 * 1000),
    "today": () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; },
    "week":  () => {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        // ISO weeks start on Monday; getUTCDay() calls Sunday 0.
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        return d;
    },
    "7d":    () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    "30d":   () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    "all":   () => null,
};

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
    if (!isAuthorized(event)) return UNAUTHORIZED;
    /* isOwner throws when the account lookup cannot be made (lookUpRole in
       _auth.js). A 503 to retry — this used to come back as the 403, which
       told an owner they were not one. */
    let role;
    try {
        role = await roleOf(event);
    } catch (e) {
        return AUTH_UNAVAILABLE;
    }
    /* No role is no account (1 Oct 2026, night scan): a token for an account
       since deleted, or minted before its password last changed. That is a
       signed-out session, and the page signs out on a 401 — the 403 below
       told it "not an owner" and left the dead session sitting there, as
       refuseWrite in _auth.js explains for the write endpoints. */
    if (role === null) return UNAUTHORIZED;
    if (role !== "owner") return forbidden("Only an owner can read the activity log.");

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("admin-activity: database connection failed", e);
        return json(500, { error: "Database connection failed" });
    }

    const asked = ((event.queryStringParameters || {}).range || "7d");
    // An own key only: `?range=constructor` found Object's constructor on
    // the prototype, called it, and the window became `{ at: { $gte: {} } }`.
    const range = Object.prototype.hasOwnProperty.call(RANGES, asked) ? asked : "7d";
    const since = RANGES[range]();
    const window = since ? { at: { $gte: since } } : {};

    /* FAILED SIGN-INS ARE READ SEPARATELY, and only as many as are worth
       listing.

       This was one query for the newest MAX_EVENTS rows of every kind. A
       failed login is the one row a stranger can write — as fast as the
       throttle lets them, from as many addresses as they have — so a
       night's guessing filled all four hundred places, and the sign-ins,
       sessions and saves the page exists to show fell off the end: an
       attacker could push their own successful login out of sight by
       failing enough first. Now the admins' own rows get their MAX_EVENTS
       to themselves, the failures are COUNTED in full, summarised by
       address and by name, and only the newest MAX_FAILED_LISTED of them
       are listed among the events.

       In a try, so a failed read is JSON the panel can show rather than an
       unhandled rejection and Netlify's bare 502. */
    const FAILED = "login-failed";
    const MAX_FAILED_LISTED = 50;
    const activity = db.collection(COLLECTION);
    let rows, failedRows, failedCount, failedBy;
    try {
        [rows, failedRows, failedCount, failedBy] = await Promise.all([
            activity.find({ ...window, type: { $ne: FAILED } }, { projection: { _id: 0, net: 0 } })
                .sort({ at: -1 }).limit(MAX_EVENTS).toArray(),
            activity.find({ ...window, type: FAILED }, { projection: { _id: 0, net: 0 } })
                .sort({ at: -1 }).limit(MAX_FAILED_LISTED).toArray(),
            activity.countDocuments({ ...window, type: FAILED }),
            activity.aggregate([
                { $match: { ...window, type: FAILED } },
                {
                    $facet: {
                        byIp: [{ $group: { _id: "$ip", n: { $sum: 1 }, last: { $max: "$at" } } }, { $sort: { n: -1 } }, { $limit: 10 }],
                        byName: [{ $group: { _id: "$username", n: { $sum: 1 }, last: { $max: "$at" } } }, { $sort: { n: -1 } }, { $limit: 10 }],
                    },
                },
            ]).toArray(),
        ]);
    } catch (e) {
        console.error("admin-activity: read failed", e);
        return json(500, { error: "Could not read the activity log" });
    }
    const truncated = rows.length === MAX_EVENTS || failedCount > failedRows.length;
    const summary = (failedBy && failedBy[0]) || {};
    const failedLogins = {
        total: failedCount,
        byIp: (summary.byIp || []).map(r => ({ ip: r._id, n: r.n, last: r.last })),
        byName: (summary.byName || []).map(r => ({ username: r._id, n: r.n, last: r.last })),
    };
    // One list for the page, newest first, as it has always been.
    rows = rows.concat(failedRows).sort((a, b) => new Date(b.at) - new Date(a.at));

    /* Group into sessions. A session is one username plus one JWT issued-at,
       so it survives page reloads and ends when the token does. Records with
       no session (a failed login never got a token) are left out of this view
       but still appear in the raw events below. */
    const sessions = new Map();
    for (const r of rows) {
        if (!r.session || !r.username) continue;
        const key = r.username + "#" + r.session;
        let s = sessions.get(key);
        if (!s) {
            s = {
                username: r.username,
                session: r.session,
                startedAt: r.at,
                lastAt: r.at,
                writes: 0,
                ip: r.ip || null,
                agent: r.agent || null,
            };
            sessions.set(key, s);
        }
        // rows arrive newest-first, so the earliest seen becomes the start
        if (r.at < s.startedAt) s.startedAt = r.at;
        if (r.at > s.lastAt) s.lastAt = r.at;
        if (r.type === "write") s.writes++;
        if (!s.ip && r.ip) s.ip = r.ip;
    }

    const sessionList = [...sessions.values()]
        .map(s => ({
            ...s,
            // The heartbeat only fires on a page load, so this is "how long
            // the admin was demonstrably active", not wall-clock presence.
            activeSeconds: Math.max(0, Math.round((new Date(s.lastAt) - new Date(s.startedAt)) / 1000)),
        }))
        .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

    // Counted in full now (see above), not out of whatever fitted in the list.
    const failures = failedCount;

    /* What visitors do (rebuilt 7 Oct 2026; see _visitor-stats.js for every
       figure and why each is what it is). Counted, never listed: no address,
       no account, and a session id that dies with the tab. A failed read
       is an empty section with a note, never the whole page lost. */
    let visitors;
    try {
        visitors = await visitorStats(db, SITE_EVENTS, since, SITE_KEEP_DAYS);
    } catch (e) {
        console.error("admin-activity: could not read the visitor log", e);
        visitors = { keepDays: SITE_KEEP_DAYS, error: "The visitor figures could not be read just now." };
    }

    return json(200, {
        range,
        since: since ? since.toISOString() : null,
        visitors,
        keepDays: KEEP_DAYS,
        counts: {
            events: rows.length,
            sessions: sessionList.length,
            logins: rows.filter(r => r.type === "login").length,
            failedLogins: failures,
            writes: rows.filter(r => r.type === "write").length,
        },
        sessions: sessionList,
        events: rows,
        // Per address and per name — see the reads above; the Admins tab draws it.
        failedLogins,
        truncated,
    });
};

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("admin-activity", exports.handler);
