/* /.netlify/functions/hallway-lost — Lost Property's clock and its weekly board
   (8 Nov 2026, the owner's: "Apply a 15 minute time limit to finding each
   furni ... this needs a scoring system", with a leaderboard).

   GET                      this week's board: the top 20, and your own row if
                            you're signed in. { week, from, to, rows: [...], me }
   POST {act: "start", k}   hustle has asked you to find thing k: the clock
                            starts now, on the server's own time. One search
                            open per player; a new one replaces it.
   POST {act: "hint"}       you asked hustle for a clue during the search.
   POST {act: "found", k}   you picked k up: the points are worked out here.

   THE POINTS ARE WORKED OUT HERE, NOT SENT. The page only says when a
   search starts and when the thing was picked up; how long it took comes
   from this function's own clock, and the clues asked for are counted here
   too. 100 for finding it at all, up to 900 more for speed (all of it at
   once, none at the 15-minute limit), and 150 for each of the three clues
   you didn't need: 1430 at most, since nothing counts as quicker than MIN_SECS.

   What the page can't prove is WHERE it found the thing, so two floors keep
   a made-up find from paying: nothing found in under MIN_SECS counts as
   faster than that, and only the first DAY_CAP finds a day go on the board.

   One row per player per week in `hallway_lost`, their points for the week,
   finds and best single find. The board is for players signed in with a
   nickname, as the daily games are (writeRefusal's `daily`), banned players
   off (withoutBanned), no Discord ids or avatars out (publicLists). */
const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
const { writeRefusal, withoutBanned } = require("./_bans");
const { publicLists } = require("./_publicid");

const COLLECTION = "hallway_lost";
const LIMIT_SECS = 15 * 60;
const GRACE_SECS = 20;          // the page's clock and this one can differ by a few seconds
const MIN_SECS = 20;
const DAY_CAP = 20;
const TOP = 20;
const MAX_BODY = 2048;
const ID = /^[\w .:'-]{1,60}$/;

const json = (statusCode, data) => ({ statusCode, headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" }, body: JSON.stringify(data) });

function sameOrigin(event) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return true;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try { return new URL(origin).host === host; } catch (e) { return false; }
}

/* The week a time falls in: Monday to Sunday, UTC, named by its Monday. */
function weekOf(ms) {
    const d = new Date(ms), day = (d.getUTCDay() + 6) % 7, mon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
    const iso = t => new Date(t).toISOString().slice(0, 10);
    return { week: iso(mon), from: iso(mon), to: iso(mon + 6 * 864e5) };
}

/* The points for a find taking `secs`, with `hints` clues asked for. */
function pointsFor(secs, hints) {
    const s = Math.max(MIN_SECS, secs);
    if (s > LIMIT_SECS + GRACE_SECS) return 0;
    const speed = Math.max(0, 1 - Math.min(s, LIMIT_SECS) / LIMIT_SECS);
    return Math.round((100 + 900 * speed) / 10) * 10 + 150 * Math.max(0, 3 - Math.max(0, hints | 0));
}

async function board(db, wk, playerId) {
    const col = db.collection(COLLECTION);
    const raw = await col.find({ week: wk.week, points: { $gt: 0 } }, { projection: { _id: 0, playerId: 1, name: 1, points: 1, finds: 1, best: 1 } }).sort({ points: -1, best: -1, at: 1 }).limit(TOP + 15).toArray();
    const rows = raw.map(r => ({ id: r.playerId, name: r.name || "", points: r.points, finds: r.finds || 0, best: r.best || 0 }));
    const [kept] = await withoutBanned(db, [rows]);
    const top = kept.slice(0, TOP);
    let me = null;
    if (playerId) {
        const mine = await col.findOne({ playerId, week: wk.week }, { projection: { _id: 0, points: 1, finds: 1, best: 1 } });
        if (mine && mine.points > 0) {
            const above = await col.countDocuments({ week: wk.week, points: { $gt: mine.points } });
            me = { points: mine.points, finds: mine.finds || 0, best: mine.best || 0, rank: above + 1 };
        }
    }
    const [pub] = await publicLists(db, [top.map((r, i) => ({ ...r, rank: i + 1 }))]);
    return { ...wk, rows: pub, me };
}

async function handler(event) {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (event.httpMethod === "POST") {
        if (!sameOrigin(event)) return json(403, { error: "Not from this site" });
        if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
    }
    let db;
    try { db = await getDb(); } catch (e) { console.error("hallway-lost: database connection failed", e); return json(503, { error: "Database connection failed" }); }
    const player = playerFrom(event), now = Date.now(), wk = weekOf(now);

    if (event.httpMethod === "GET") {
        try { return json(200, await board(db, wk, player ? String(player.id) : null)); } catch (e) { console.error("hallway-lost: board read failed", e); return json(500, { error: "Couldn't read the board" }); }
    }

    if (!player) return json(401, { error: "Not signed in" });
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });
    const act = body.act, k = typeof body.k === "string" && ID.test(body.k) ? body.k : null;
    if (!["start", "hint", "found"].includes(act) || (act !== "hint" && !k)) return json(400, { error: "Invalid request" });
    /* signed in, a live session, a nickname and not banned: the daily games' gate */
    const refusal = await writeRefusal(db, event, player.id, { game: true, daily: true });
    if (refusal) return refusal;

    const id = String(player.id), opens = db.collection(COLLECTION + "_open"), col = db.collection(COLLECTION);
    try {
        await ensureUniqueIndex(opens, ["playerId"]);
        await ensureUniqueIndex(col, ["playerId", "week"]);
    } catch (e) { console.error("hallway-lost: unique index unavailable", e); return json(503, { error: "Couldn't save just now" }); }

    try {
        if (act === "start") {
            await opens.updateOne({ playerId: id }, { $set: { playerId: id, k, t0: now, hints: 0 } }, { upsert: true });
            return json(200, { t0: now, limit: LIMIT_SECS });
        }
        if (act === "hint") {
            await opens.updateOne({ playerId: id }, { $inc: { hints: 1 } });
            return json(200, { ok: true });
        }
        /* found: only the search that's open, and only once */
        const open = await opens.findOneAndDelete({ playerId: id, k });
        const o = open && (open.value !== undefined ? open.value : open);
        if (!o || !o.t0) return json(409, { error: "No search open for that" });
        const secs = Math.round((now - o.t0) / 1000), points = pointsFor(secs, o.hints);
        if (!points) return json(200, { points: 0, secs, late: true, week: wk.week });
        const row = await db.collection("players").findOne({ id }, { projection: { _id: 0, nick: 1 } });
        const today = new Date(now).toISOString().slice(0, 10), was = await col.findOne({ playerId: id, week: wk.week }, { projection: { _id: 0, day: 1, dayFinds: 1 } });
        const dayFinds = was && was.day === today ? (was.dayFinds || 0) : 0;
        if (dayFinds >= DAY_CAP) return json(200, { points, secs, capped: true, week: wk.week });
        await col.updateOne({ playerId: id, week: wk.week }, {
            $inc: { points, finds: 1 }, $max: { best: points },
            $set: { name: (row && row.nick) || "", day: today, dayFinds: dayFinds + 1, at: new Date(now).toISOString() }
        }, { upsert: true });
        return json(200, { points, secs, week: wk.week });
    } catch (e) {
        console.error("hallway-lost: write failed", e);
        return json(500, { error: "Couldn't save that" });
    }
}

exports.handler = handler;
exports._for = { pointsFor, weekOf, LIMIT_SECS };
exports.handler = require("./_errors").withErrorReporting("hallway-lost", exports.handler);
