/* /.netlify/functions/advent — the advent calendar's doors, kept against the
   account (26 Oct 2026, the owner's: "Door opening will be tracked per
   account, and the calendar will only be openable by users who are signed in
   with discord").

   GET   { year, opened: [day, ...] } for the signed-in player's calendar
   POST  { day } opens that door, and answers the same

   One document per player per Advent, in `advent_doors`:
       { playerId, year, opened: [3, 1, 2], at: { "3": iso, ... }, updatedAt }
   `opened` in the order the doors were opened, `at` when each was.

   A DOOR OPENS ON ITS DAY. Door N from the first moment it is N December
   anywhere in the world (UTC+14), so a visitor's own midnight is never
   early; the page holds them to their own calendar (js/skin-xmas-advent.js).
   A door missed stays openable for the rest of the season. Nothing is
   checked about which doors came before: missing a day is allowed.

   Signed in, with a live session, and not banned: the same gate every
   player write goes through (writeRefusal in _bans.js). A banned player can
   still read which doors they opened. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom, sessionRevoked } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
const { writeRefusal } = require("./_bans");

const COLLECTION = "advent_doors";
const DOORS = 24;
const EARLIEST_ZONE_MS = 14 * 60 * 60 * 1000;     // UTC+14, the first midnight on Earth
const MAX_BODY = 1024;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

/* The request came from this site: player-data.js's check, for the same
   reason (the cookie is SameSite=Lax; this is the belt to its braces). */
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

/* Which Advent it is: the year of the December just gone or coming. The
   first week of January still counts as last year's, so a door opened late
   on New Year's Eve somewhere west of UTC lands in the right calendar. */
function adventYear(now) {
    return new Date(now - 7 * 24 * 60 * 60 * 1000).getUTCFullYear();
}
// When door `day` of `year` opens: its date's first midnight anywhere.
const opensAt = (year, day) => Date.UTC(year, 11, day) - EARLIEST_ZONE_MS;

const view = (year, doc) => ({
    year,
    opened: Array.isArray(doc && doc.opened) ? doc.opened.filter((d) => Number.isInteger(d) && d >= 1 && d <= DOORS) : []
});

async function handler(event) {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (event.httpMethod === "POST") {
        if (!sameOrigin(event)) return json(403, { error: "Not from this site" });
        if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
    }

    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("advent: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    /* The session, and that it has not been ended (signed out everywhere,
       forgotten): livePlayerFrom's check, made here so that a players read
       that FAILS is told apart from a session that has ended. livePlayerFrom
       answers null for both, and a 401 is what sends the page to "Sign in
       with Discord" — a database blink must not sign anybody out (see
       sessionRevoked in _player.js). It is a 503 the page offers to retry. */
    const player = playerFrom(event);
    if (!player) return json(401, { error: "Not signed in" });
    let row;
    try {
        row = await db.collection("players").findOne({ id: String(player.id) }, { projection: { _id: 0, sv: 1, svStrict: 1 } });
    } catch (e) {
        console.error("advent: could not read the players row", e);
        return json(503, { error: "Your calendar could not be reached just now" });
    }
    if (sessionRevoked(player, row)) return json(401, { error: "Not signed in" });

    const col = db.collection(COLLECTION);
    const now = Date.now();
    const year = adventYear(now);

    if (event.httpMethod === "GET") {
        try {
            const doc = await col.findOne({ playerId: player.id, year }, { projection: { _id: 0, opened: 1 } });
            return json(200, view(year, doc));
        } catch (e) {
            console.error("advent: read failed", e);
            return json(500, { error: "Could not read your calendar" });
        }
    }

    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        return json(400, { error: "Invalid request body" });
    }
    const day = body && body.day;
    if (!Number.isInteger(day) || day < 1 || day > DOORS) return json(400, { error: "No such door" });
    if (now < opensAt(year, day)) return json(403, { error: "Not yet", notYet: true, opensAt: new Date(opensAt(year, day)).toISOString() });

    const refusal = await writeRefusal(db, event, player.id);
    if (refusal) return refusal;

    /* One write, kept to the first opening: the filter only matches a
       calendar without this door, so opening it twice changes nothing. A
       calendar that has it already makes the upsert try to insert a second
       document, which the unique index refuses — that refusal is the
       "already open" answer, not a fault.
       EXCEPT WHEN TWO TABS RACE the first doors of a calendar (27 Oct 2026,
       the overnight scan): both match nothing, both try to insert, and the
       one refused had its door in no document at all, answered as if it
       were open. The server does not retry an upsert whose filter is not
       all equalities (the $ne here), so it is retried once by hand, as a
       plain update: the calendar exists by then, so it pushes the door if
       it is missing and matches nothing if it is there. */
    try {
        await ensureUniqueIndex(col, ["playerId", "year"]);
    } catch (e) {
        console.error("advent: unique index unavailable", e);
        return json(503, { error: "Could not open the door just now" });
    }
    const filter = { playerId: player.id, year, opened: { $ne: day } };
    const update = { $push: { opened: day }, $set: { [`at.${day}`]: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() } };
    try {
        try {
            await col.updateOne(filter, update, { upsert: true });
        } catch (e) {
            if (!(e && e.code === 11000)) throw e;
            await col.updateOne(filter, update);
        }
    } catch (e) {
        console.error("advent: open failed", e);
        return json(500, { error: "Could not open the door" });
    }
    try {
        const doc = await col.findOne({ playerId: player.id, year }, { projection: { _id: 0, opened: 1 } });
        return json(200, view(year, doc));
    } catch (e) {
        console.error("advent: read after opening failed", e);
        return json(500, { error: "Could not read your calendar" });
    }
}

exports.handler = handler;
exports._for = { adventYear, opensAt };

/* Failures reported to /warren's Errors tab, and the site-wide rate limit:
   see withErrorReporting in _errors.js. */
exports.handler = require("./_errors").withErrorReporting("advent", exports.handler);
