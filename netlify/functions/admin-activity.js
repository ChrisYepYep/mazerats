/* /.netlify/functions/admin-activity — the admin activity log, for owners.

   Owner-only, and enforced here rather than only hidden in the page: this
   answers who signed in, from what address, and what they changed, which is
   exactly the sort of thing a standard admin should not be able to read
   about their colleagues.

   Scope, and why it stops where it does: this covers ADMIN accounts only. It
   does not, and should not, log what visitors click. The site's own privacy
   policy states that its analytics run "without tracking individual users",
   collect no personal data and set no cookies — bespoke click tracking would
   contradict that in writing, and Umami already answers the aggregate
   traffic question. Admin accounts are a different case: a handful of named,
   authenticated people with write access to a live site, where an audit
   trail is ordinary practice.

   Returns two views of the same records, because they answer different
   questions: SESSIONS (who was in, when, for how long, how much they did)
   and EVENTS (the raw log, newest first). */

const { getDb } = require("./_db");
const { isAuthorized, isOwner, UNAUTHORIZED, forbidden } = require("./_auth");
const { COLLECTION, KEEP_DAYS } = require("./_audit");
const { COLLECTION: SITE_EVENTS, KEEP_DAYS: SITE_KEEP_DAYS } = require("./track");

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
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
    if (!(await isOwner(event))) return forbidden("Only an owner can read the activity log.");

    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }

    const asked = ((event.queryStringParameters || {}).range || "7d");
    const range = RANGES[asked] ? asked : "7d";
    const since = RANGES[range]();
    const window = since ? { at: { $gte: since } } : {};

    const rows = await db.collection(COLLECTION)
        .find(window, { projection: { _id: 0 } })
        .sort({ at: -1 })
        .limit(MAX_EVENTS)
        .toArray();

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

    const failures = rows.filter(r => r.type === "login-failed").length;

    /* What visitors use, aggregated. Deliberately only ever counted, never
       listed: the rows carry no address and no account, and the session id
       dies with the tab, so there is nothing to look up a person by even
       here. "Sessions" is a count of distinct ids, which is closer to
       "visits" than to "people" — someone returning tomorrow is a new one. */
    const site = await db.collection(SITE_EVENTS).aggregate([
        { $match: window },
        {
            $facet: {
                totals: [{ $group: { _id: null, events: { $sum: 1 }, sessions: { $addToSet: "$session" } } }],
                byName: [{ $group: { _id: "$name", n: { $sum: 1 } } }, { $sort: { n: -1 } }],
                topMazes: [
                    { $match: { name: "maze-open", label: { $ne: null } } },
                    { $group: { _id: "$label", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 },
                ],
                topFurni: [
                    { $match: { name: "furni-open", label: { $ne: null } } },
                    { $group: { _id: "$label", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 },
                ],
                byDay: [
                    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, n: { $sum: 1 } } },
                    { $sort: { _id: -1 } }, { $limit: 14 },
                ],
            },
        },
    ]).toArray().catch(() => []);

    const f = site[0] || {};
    const totals = (f.totals || [])[0] || { events: 0, sessions: [] };
    const visitors = {
        keepDays: SITE_KEEP_DAYS,
        events: totals.events,
        sessions: (totals.sessions || []).filter(Boolean).length,
        byName: (f.byName || []).map(r => ({ name: r._id, n: r.n })),
        topMazes: (f.topMazes || []).map(r => ({ label: r._id, n: r.n })),
        topFurni: (f.topFurni || []).map(r => ({ label: r._id, n: r.n })),
        byDay: (f.byDay || []).map(r => ({ day: r._id, n: r.n })).reverse(),
    };

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
        truncated: rows.length === MAX_EVENTS,
    });
};
