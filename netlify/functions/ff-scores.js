/* /.netlify/functions/ff-scores — the Fallin' Furni leaderboard.

   GET             the table, and the caller's own best if they are signed in
   POST {levels, ms}   records a finished run for the signed-in player

   Identity is the Discord session from _player.js, the same one the daily
   games use. Signing in is what puts a name on the board; the game itself is
   playable without it.

   ----------------------------------------------------------------------
   How much this trusts the page, and what it can actually check

   The round runs entirely in the browser — the clock, the drops and the
   sitting are all client-side — so a submitted result cannot be reproduced
   here the way guess-scores.js re-derives its five rooms. Being honest about
   that: a crafted request can claim a good run.

   What the server does know is the LEVELS, because it serves them. And a
   level cannot be finished before its last piece has landed:

       (drops - 1) * dropDelayMs + dropSpeedMs

   Summed over the levels claimed, that is a hard floor on any honest time.
   A run claiming to have cleared four levels faster than the furni could
   physically fall is refused. Claiming more levels than exist is refused.
   That kills the casual "edit the number" attempt, which is the realistic
   threat for a small archive's leaderboard; it does not stop somebody
   determined to write a plausible request, and pretending otherwise would be
   worse than saying so.

   One row per player, holding their BEST run — further first, then faster.
   A worse run never overwrites a better one, so the table cannot be walked
   backwards by replaying badly. */

const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom } = require("./_player");

const COLLECTION = "ff_scores";
const LEVELS = "ff_levels";
const TOP = 25;

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

/* The earliest a level can possibly be completed: the last piece has to have
   landed before it can be sat on. Mirrors the schedule in js/room-drop.js. */
function floorMsFor(level) {
    const rules = level.rules || {};
    const delay = Number(rules.dropDelayMs) || 0;
    const fall = Number(rules.dropSpeedMs) || 0;
    let drops = 0;
    for (const z of level.zones || []) {
        for (const it of z.items || []) drops += Number(it.count) || 0;
    }
    if (drops <= 0) return 0;
    return (drops - 1) * delay + fall;
}

const clean = (row) => ({
    name: row.name,
    avatar: row.avatar || null,
    habbo: row.habbo || null,
    levels: row.levels,
    ms: row.ms,
    at: row.at
});

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const scores = db.collection(COLLECTION);
    const player = playerFrom(event);

    if (event.httpMethod === "GET") {
        // Further first, then faster, then whoever got there earliest.
        const top = await scores
            .find({}, { projection: { _id: 0 } })
            .sort({ levels: -1, ms: 1, at: 1 })
            .limit(TOP)
            .toArray();

        const out = { count: top.length, top: top.map(clean) };
        if (player) {
            const mine = await scores.findOne({ playerId: player.id }, { projection: { _id: 0 } });
            out.you = mine ? clean(mine) : null;
            out.signedIn = { name: player.name || player.username, id: player.id };
        }
        return json(200, out);
    }

    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    /* Not signed in is not an error — the game is playable either way, and
       the page needs to be able to say "sign in to be on the board" rather
       than treat a guest run as a failure. */
    if (!player) return json(200, { recorded: false, reason: "signed-out" });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Body is not JSON" }); }

    const levels = Math.max(0, Math.round(Number(body.levels) || 0));
    const ms = Math.max(0, Math.round(Number(body.ms) || 0));
    if (!levels) return json(200, { recorded: false, reason: "no-levels-cleared" });

    const published = await db.collection(LEVELS)
        .find({ published: true }, { projection: { _id: 0 } })
        .sort({ order: 1 })
        .toArray();

    if (levels > published.length) {
        return json(400, { error: "More levels than exist" });
    }

    const floor = published.slice(0, levels).reduce((n, lv) => n + floorMsFor(lv), 0);
    if (ms < floor) {
        return json(400, { error: "That run is faster than the furni can fall" });
    }

    await ensureUniqueIndex(scores, "playerId");

    const row = {
        playerId: player.id,
        name: player.name || player.username || "Someone",
        avatar: player.avatar || null,
        habbo: typeof body.habbo === "string" ? body.habbo.slice(0, 32) : null,
        levels, ms,
        at: new Date().toISOString()
    };

    const previous = await scores.findOne({ playerId: player.id });
    const better = !previous
        || levels > previous.levels
        || (levels === previous.levels && ms < previous.ms);

    if (better) {
        await scores.updateOne({ playerId: player.id }, { $set: row }, { upsert: true });
    }
    return json(200, {
        recorded: better,
        reason: better ? null : "not-your-best",
        best: clean(better ? row : previous)
    });
};
