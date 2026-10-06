/* /.netlify/functions/pura-scores — the Pura Panic leaderboard.

   GET                    the top 25, and the caller's own best if signed in
   POST ?action=start     a signed run token carrying the game's SEED
   POST {run, log, ms}    a finished game: `run` that token, `log` where
                          every piece came to rest ([rot, x, y, lane] each)

   ----------------------------------------------------------------------
   THE SCORE IS WORKED OUT HERE, NOT SENT

   Pura Panic is deterministic. The pieces come from a seven-bag shuffled by
   a seed, and the seed is in the run token, signed here when Play was
   pressed — so the page cannot choose an easy sequence. The submission is
   the list of where each piece ended up, and the server REPLAYS it through
   the very rules file the page plays with (js/pura-engine.js): every piece
   has to be somewhere it can be and resting there, and the score is
   whatever those placements actually clear. A number typed into a request
   has nothing to attach to.

   What a replay cannot prove is that a hand steered each piece there; see
   `replay` in the engine for why that limit is acceptable. On top, the
   same wall-clock check Fallin' Furni makes (no more game time than has
   passed since the token) and a floor of PIECE_MIN_MS a piece, which no
   human sustains under.

   ----------------------------------------------------------------------
   OPEN OR IN MAINTENANCE

   settings.puraPanicState, "maintenance" until the owner says otherwise
   (see settings.js). In maintenance an admin still plays it, but no token
   is issued, so nothing reaches the board — the same rule Fallin' Furni's
   closed states follow, for the same reason: a test is not a result.

   ONE ROW PER PLAYER, their best: highest score, then fewest pieces (the
   tidier game), then earliest. The board is for players signed in WITH A
   NICKNAME, as the daily games are (writeRefusal's `daily`). */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getDb, ensureUniqueIndex, ensureIndex } = require("./_db");
const { playerFrom, publicName } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
const { writeRefusal, withoutBanned } = require("./_bans");
const { habboHeads } = require("./_publicid");
const Engine = require("../../js/pura-engine.js");

const COLLECTION = "pura_scores";
const RUN_TOKENS = "pura_run_tokens";
const TOP = 25;
const BOARD_READ = TOP * 2;

const RUN_AUDIENCE = "mazerats-purarun";
const RUN_LIFE_S = 3 * 60 * 60;
const RUN_TOLERANCE_MS = 15 * 1000;
const PIECE_MIN_MS = 120;
// A three-hour game at the floor's pace, and the body that carries it.
const MAX_PIECES = Math.floor(RUN_LIFE_S * 1000 / PIECE_MIN_MS);
const MAX_BODY = 400 * 1024;

const DEFAULT_STATE = "maintenance";

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

async function isOpen(db) {
    const doc = await db.collection("settings").findOne({ _id: "site" }, { projection: { puraPanicState: 1 } });
    return ((doc && doc.puraPanicState) || DEFAULT_STATE) === "live";
}

/* Where a score stands on the board as players see it: one more than the
   rows ahead of it, less any the board hides (banned players, see
   _bans.js), so "you're 3rd" matches the third row shown. */
async function placeOf(db, scores, best) {
    const ahead = await scores.find(
        { $or: [{ score: { $gt: best.score } }, { score: best.score, pieces: { $lt: best.pieces } }] },
        { projection: { _id: 0, playerId: 1 } }
    ).toArray();
    const [shown] = await withoutBanned(db, [ahead], r => r && r.playerId);
    return 1 + shown.length;
}

function signRun(player, now) {
    if (!process.env.SESSION_SECRET) return null;
    const seed = crypto.randomBytes(4).readUInt32BE(0);
    const claims = { rid: crypto.randomBytes(12).toString("hex"), t: now, seed };
    if (player) claims.sub = player.id;
    return {
        seed,
        token: jwt.sign(claims, process.env.SESSION_SECRET, {
            audience: RUN_AUDIENCE, expiresIn: RUN_LIFE_S, algorithm: "HS256"
        })
    };
}

function readRun(token, player) {
    if (!token || typeof token !== "string" || !process.env.SESSION_SECRET) return null;
    try {
        const c = jwt.verify(token, process.env.SESSION_SECRET, { audience: RUN_AUDIENCE, algorithms: ["HS256"] });
        if (!c || typeof c.rid !== "string" || !/^[0-9a-f]{24}$/.test(c.rid)) return null;
        if (!Number.isFinite(c.t) || !Number.isInteger(c.seed)) return null;
        if (c.sub && player && String(c.sub) !== String(player.id)) return null;
        return c;
    } catch (e) {
        return null;
    }
}

// One token, one entry: the unique _id is the lock (see ff-scores.js).
let tokensIndexed = false;
async function spendRun(db, claims, player) {
    const col = db.collection(RUN_TOKENS);
    if (!tokensIndexed) {
        tokensIndexed = true;
        try { await col.createIndex({ at: 1 }, { expireAfterSeconds: RUN_LIFE_S + 3600 }); }
        catch (e) { /* the unique _id is the part that matters */ }
    }
    try {
        await col.insertOne({ _id: claims.rid, at: new Date(), playerId: player.id });
        return true;
    } catch (e) {
        if (e && e.code === 11000) return false;
        throw e;
    }
}

const clean = (row, heads) => ({
    name: row.name,
    avatar: (heads && heads.get(String(row.playerId))) || null,
    score: Number(row.score) || 0,
    rows: Number(row.rows) || 0,
    level: Number(row.level) || 1,
    at: row.at
});

/* Better = more points, or the same points in fewer pieces. In the update's
   own filter, so two submissions racing cannot land a worse one last (the
   reasoning is keepBest's in ff-scores.js). */
async function keepBest(col, playerId, row) {
    const filter = {
        playerId,
        $or: [{ score: { $lt: row.score } }, { score: row.score, pieces: { $gt: row.pieces } }]
    };
    try {
        const r = await col.updateOne(filter, { $set: row }, { upsert: true });
        return Boolean(r.upsertedCount || r.matchedCount);
    } catch (e) {
        if (e && e.code === 11000) {
            const r = await col.updateOne(filter, { $set: row });
            return Boolean(r.matchedCount);
        }
        throw e;
    }
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("pura-scores: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    const scores = db.collection(COLLECTION);
    const player = playerFrom(event);

    if (event.httpMethod === "GET") {
        try {
            await ensureIndex(scores, { score: -1, pieces: 1, at: 1 });
            const open = await isOpen(db);
            const top = (await withoutBanned(db, [await scores
                .find({}, { projection: { _id: 0 } })
                .sort({ score: -1, pieces: 1, at: 1 })
                .limit(BOARD_READ)
                .toArray()], r => r && r.playerId))[0].slice(0, TOP);
            const heads = await habboHeads(db, [...top.map(r => r && r.playerId), player && player.id]);
            const out = { open, top: top.map(r => clean(r, heads)) };
            if (player) {
                const mine = await scores.findOne({ playerId: player.id }, { projection: { _id: 0 } });
                out.you = mine ? clean(mine, heads) : null;
                if (mine) {
                    out.you.place = await placeOf(db, scores, mine);
                }
            }
            return json(200, out);
        } catch (e) {
            console.error("pura-scores: could not read the board", e);
            return json(503, { error: "The leaderboard could not be read just now." });
        }
    }

    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    /* THE START: a token and its seed, nothing written. Answered signed out
       too — the seed is what the game is dealt from either way — but not
       while the game is in maintenance: then the page deals its own seed
       and says scores are not being kept. */
    if ((event.queryStringParameters || {}).action === "start") {
        let open;
        try { open = await isOpen(db); }
        catch (e) { return json(503, { error: "The leaderboard could not be reached just now." }); }
        if (!open) return json(200, { token: null, reason: "maintenance" });
        const run = signRun(player, Date.now());
        if (!run) return json(200, { token: null, reason: "unavailable" });
        return json(200, run);
    }

    // Signed in with a nickname, not banned — as the daily games ask.
    const refusal = await writeRefusal(db, event, player ? player.id : null, { game: true, daily: true });
    if (refusal) return refusal;
    if (!player) return json(200, { recorded: false, reason: "signed-out" });

    if ((event.body || "").length > MAX_BODY) return json(413, { error: "That game is too long to send" });
    let body;
    try { body = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Body is not JSON" }); }
    if (!body || typeof body !== "object") return json(400, { error: "Body is not JSON" });

    if (!body.run) return json(200, { recorded: false, reason: "no-run-token" });
    const claims = readRun(body.run, player);
    if (!claims) return json(200, { recorded: false, reason: "stale-run" });
    // Shut since the game started: its token was issued while live, but the
    // board takes nothing in maintenance.
    if (!(await isOpen(db).catch(() => false))) return json(200, { recorded: false, reason: "maintenance" });

    const ms = Math.max(0, Math.round(Number(body.ms) || 0));
    if (ms > Date.now() - claims.t + RUN_TOLERANCE_MS) {
        return json(400, { error: "That game is longer than the time since it started" });
    }
    const log = body.log;
    if (!Array.isArray(log) || !log.length) return json(200, { recorded: false, reason: "no-pieces" });
    if (log.length > MAX_PIECES) return json(400, { error: "Too many pieces" });
    if (ms < log.length * PIECE_MIN_MS) {
        return json(400, { error: "Those pieces came down faster than anybody plays" });
    }

    const result = Engine.replay(claims.seed, log, MAX_PIECES);
    if (!result.ok) return json(400, { error: result.error });
    // The page says what it scored; a page and a server that disagree is a bug worth hearing about.
    if (body.score !== undefined && Number(body.score) !== result.score) {
        console.warn("pura-scores: the page and the replay disagree", body.score, result.score);
    }
    if (!result.score) return json(200, { recorded: false, reason: "no-score", score: 0 });

    try {
        await ensureUniqueIndex(scores, "playerId");
        if (!(await spendRun(db, claims, player))) return json(200, { recorded: false, reason: "already-submitted" });
    } catch (e) {
        console.error("pura-scores: could not spend a run token", e);
        return json(503, { error: "The leaderboard could not be updated just now." });
    }

    const row = {
        playerId: player.id,
        name: await publicName(db, player),
        score: result.score,
        rows: result.bands,
        level: result.level,
        pieces: result.pieces,
        ms,
        at: new Date().toISOString()
    };
    let better;
    try {
        better = await keepBest(scores, player.id, row);
    } catch (e) {
        console.error("pura-scores: could not record a game", e);
        // Nothing recorded, so the token is handed back for the page's retry.
        try { await db.collection(RUN_TOKENS).deleteOne({ _id: claims.rid }); } catch (e2) { /* one game lost, never two entries */ }
        return json(503, { error: "The leaderboard could not be updated just now." });
    }
    const best = better ? row : (await scores.findOne({ playerId: player.id }).catch(() => null)) || row;
    let place = null;
    try {
        place = await placeOf(db, scores, best);
    } catch (e) { /* the place is a nicety */ }
    return json(200, {
        recorded: better,
        reason: better ? null : "not-your-best",
        score: result.score,
        best: clean(best),
        place
    });
};

exports.handler = require("./_errors").withErrorReporting("pura-scores", exports.handler);
