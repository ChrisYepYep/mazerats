/* /.netlify/functions/pura-flags — Pura Panic scores that look out of line,
   for the Warren (3 Nov 2026, the owner's: flag outliers and let him decide,
   rather than slowing the game down for everybody with a higher
   PIECE_MIN_MS).

   GET                      every board row judged, the ones flagged and not
                            yet dealt with (`open`), and the latest
                            decisions (`dealt`). Any Warren account.
   POST {key, action}       owners and admins ("site" scope), each one in
                            the activity log:
          "ok"              looked at, it's fine: the flag stops showing,
                            until that game saves a better score
          "remove"          the score comes off the public board (the row
                            is deleted, a copy kept here so it can go back)
          "undo"            takes a decision back: an "ok" flag shows again;
                            a removed score is put back, unless the player
                            has a better one on the board by now

   ----------------------------------------------------------------------
   WHAT IS JUDGED, AND WITH WHAT

   Every row on the board (pura_scores: one best game a player), with what
   is stored about the game that set it: points, rows, level, pieces, the
   game's own clock (`ms`, the page's word, but never more than the time
   since its token), and, joined by the run id, its pura_games row (the
   clears and chains the server's replay counted). Since 3 Nov 2026 a save
   also stores `wall`, the time between Play and the save on the SERVER's
   clock, which a script cannot shorten; older rows get it from their
   pura_starts row (the start's time) when there is one.

   Three rules, each a plain-English reason:

   CLOCK  The page's game clock runs straight through every clear's flash
          (FLASH_MS) and every level-up banner (BANNER_MS), so a game played
          on the real page can never take less game time than those add up
          to. Less than that, by the page's clock or the server's, is a game
          that never ran the page: a script posting placements.
   PACE   Placements a second over the game, the animations taken out.
          Hard drop is instant, so this is how fast someone decides and
          steers; PACE_PPS a second, sustained over PACE_MIN_PIECES pieces
          or more, is beyond the fastest people at ordinary Tetris (with
          hold, previews and practised finesse), never mind an iso well with
          one preview. The deal's floor (_pura-run.js, PIECE_MIN_MS) lets a
          script go at 8 a second.
   LEAD   A score far out in front of everybody else's: LEAD_TIMES the
          median of the next LEAD_FIELD best, and at least LEAD_MIN. Not
          proof of anything: a legal bot that waits in real time between
          pieces passes the two rules above, and this is the one left that
          notices it. A real marathon trips it too, which is what the "It's
          fine" button is for.

   What it CANNOT see: the timing of each placement. The page sends only
   the game's total time, and pura-deal.js is stateless by design (no
   database), so how regular a game's rhythm was is not stored anywhere;
   neither is anything about how the pieces were steered.

   The numbers below were set on 3 Nov 2026 from the scan's bot (scratchpad
   scan2/b-games/pura-bot.js, reachable placements only) and the live
   board. The bot's curve: level 20 at ~300 pieces and ~1,070 points,
   level 40 at ~620 pieces and ~4,700, level 50 at ~770 and ~7,000, level
   90 at ~1,400 and ~24,400; its 1,500-piece game's clears and banners take
   about 310s to play while the deal floor lets it post them in 180s. The
   best score on the live board then was 1,343 (level 20, 96 rows), and the
   next was 198. */

const crypto = require("crypto");
const { getDb } = require("./_db");
const { hasAccount, roleOf, refuseWrite, WRITE_SCOPES, usernameFromToken, sessionOf, UNAUTHORIZED, AUTH_UNAVAILABLE, isAuthUnavailable } = require("./_auth");
const { record } = require("./_audit");
const { nickedAmong } = require("./_publicid");
const { SECURITY_HEADERS } = require("./_headers");
const { withoutBanned } = require("./_bans");

const SCORES = "pura_scores";
const GAMES = "pura_games";
const STARTS = "pura_starts";
const FLAGS = "pura_flags";

// js/pura-panic.js's own: a clear's flash, and the LEVEL n banner's pause.
const FLASH_MS = 360;
const BANNER_MS = 1500;
/* A save goes as a level-up banner starts (saveProgress), and a game can
   be ended from pause part-way through a clear, so the last banner and a
   clear or two may not have played yet: that much is let off. */
const CLOCK_SLACK_MS = BANNER_MS + 4 * FLASH_MS;
// And only nine-tenths of the animations counted, in case a frame's timing ever shaves them.
const CLOCK_SHARE = 0.9;
// Placements a second, sustained, outside the animations (PACE above).
const PACE_PPS = 3;
// Under this many pieces a burst of quick drops proves nothing.
const PACE_MIN_PIECES = 100;
/* LEAD above. 5,000 is about level 40, some 600 pieces in one sitting
   without topping out: four times the best game on the board when this
   was written. Four times the field's median, so a strong player at the
   top of a strong board is not flagged for being best. */
const LEAD_MIN = 5000;
const LEAD_TIMES = 4;
const LEAD_FIELD = 10;

const MAX_ROWS = 5000;
const DEALT_SHOWN = 50;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

const isGuest = (id) => typeof id === "string" && (id.startsWith("guest:") || id.startsWith("guestrat:"));
const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-GB");
// "4m 05s" / "52s" / "1h 03m", as the Warren writes lengths.
function clock(ms) {
    const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    if (h) return h + "h " + String(m).padStart(2, "0") + "m";
    if (m) return m + "m " + String(r).padStart(2, "0") + "s";
    return r + "s";
}
const median = (ns) => {
    if (!ns.length) return 0;
    const s = [...ns].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/* A row's handle: its game's run id, or for a row saved before rows kept
   one (26 Oct 2026) a hash of who and when, the same each time it is
   worked out. Never the player id itself, which stays on the server. */
function keyOf(row) {
    if (row && typeof row.rid === "string" && /^[0-9a-f]{24}$/.test(row.rid)) return row.rid;
    return crypto.createHash("sha256").update("pura-flag:" + String(row && row.playerId) + ":" + String(row && row.at)).digest("hex").slice(0, 24);
}

/* Whether a board row is better than the score a decision was made on,
   as keepBest (pura-scores.js) ranks them: more points, or the same in
   fewer pieces. A decision from before `pieces` was kept compares points. */
function beats(row, d) {
    const score = Number(row && row.score) || 0, was = Number(d && d.score) || 0;
    if (score !== was) return score > was;
    return d.pieces != null && Number.isFinite(Number(d.pieces)) && (Number(row.pieces) || 0) < Number(d.pieces);
}

/* The least game time the real page could have shown for this game: every
   level-up banner, every clearing piece's flash, and every chain's. The
   clears come from the row (saved since 3 Nov 2026) or its pura_games row;
   without either only the banners count. */
function animationMs(row, game) {
    const level = Math.max(1, Number(row.level) || 1);
    let ms = (level - 1) * BANNER_MS;
    const clears = Array.isArray(row.clears) ? row.clears : game && Array.isArray(game.clears) ? game.clears : null;
    const chains = row.chains != null && Number.isFinite(Number(row.chains)) ? Number(row.chains) : game ? Number(game.chains) || 0 : 0;
    if (clears) ms += (clears.reduce((a, b) => a + (Number(b) || 0), 0) + chains) * FLASH_MS;
    return { ms, clearsKnown: Boolean(clears) };
}

/* One row's reasons, worst first. `wall` is the server's clock from Play
   to the save (or null), `field` the median of the next best scores. */
function judge(row, game, wall, field) {
    const reasons = [];
    const ms = Math.max(0, Number(row.ms) || 0);
    const pieces = Math.max(0, Number(row.pieces) || 0);
    const score = Math.max(0, Number(row.score) || 0);
    const anim = animationMs(row, game);
    const least = anim.ms * CLOCK_SHARE - CLOCK_SLACK_MS;
    const what = anim.clearsKnown ? "its clear animations and level-up banners" : "its level-up banners";

    if (Number.isFinite(wall) && wall < least) {
        reasons.push({ code: "server-clock", text: `Only ${clock(wall)} passed on the server's clock between pressing Play and this save, but ${what} alone take ${clock(anim.ms)} to play. The game can't have been played on the site.` });
    } else if (least > 0 && ms < least) {
        reasons.push({ code: "page-clock", text: `The game's own clock says ${clock(ms)}, but ${what} alone take ${clock(anim.ms)} to play. The real game can't run that fast.` });
    }
    if (!reasons.length && pieces >= PACE_MIN_PIECES) {
        const played = Math.min(ms, Number.isFinite(wall) ? wall : ms) - anim.ms;
        if (played > 0) {
            const pps = pieces / (played / 1000);
            if (pps > PACE_PPS) {
                reasons.push({ code: "pace", text: `${num(pieces)} pieces in ${clock(played)} of play (the animations taken out): ${pps.toFixed(1)} a second, kept up all game. Flagged above ${PACE_PPS} a second, faster than people place pieces.` });
            }
        }
    }
    if (score >= LEAD_MIN && score >= LEAD_TIMES * field) {
        reasons.push({ code: "lead", text: field > 0
            ? `${num(score)} points, ${Math.floor(score / field)} times the typical score near the top of the board (${num(field)}).`
            : `${num(score)} points, with nobody else near the top of the board to compare it with.` });
    }
    return reasons;
}

/* Every board row judged. `rows` newest-best first, as the board sorts.
   Reads the run ids' pura_games and (for rows with no `wall`) pura_starts
   rows in one go each. `fieldOf(i)`, when given, is row i's field median
   instead of the next best among `rows` themselves: a decision judges its
   one row against the board (3 Nov 2026, the bug scan: judged alone, its
   field was 0 and any 5,000 got a "lead" reason). */
async function judgeAll(db, rows, fieldOf) {
    const rids = rows.map(r => r.rid).filter(r => typeof r === "string");
    const needStart = rows.filter(r => r.wall == null || !Number.isFinite(Number(r.wall))).map(r => r.rid).filter(r => typeof r === "string");
    const [games, starts] = await Promise.all([
        rids.length ? db.collection(GAMES).find({ _id: { $in: rids } }, { projection: { clears: 1, chains: 1 } }).toArray() : [],
        needStart.length ? db.collection(STARTS).find({ _id: { $in: needStart } }, { projection: { at: 1 } }).toArray() : []
    ]);
    const gameOf = new Map(games.map(g => [g._id, g]));
    const startOf = new Map(starts.map(s => [s._id, s]));
    const scores = rows.map(r => Number(r.score) || 0);
    return rows.map((row, i) => {
        let wall = null, wallFrom = null;
        if (row.wall != null && Number.isFinite(Number(row.wall))) { wall = Number(row.wall); wallFrom = "saved"; }
        else if (row.rid && startOf.has(row.rid)) {
            const t = new Date(row.at).getTime() - new Date(startOf.get(row.rid).at).getTime();
            if (Number.isFinite(t) && t >= 0) { wall = t; wallFrom = "start"; }
        }
        const field = fieldOf ? fieldOf(i) : median(scores.slice(0, i).concat(scores.slice(i + 1)).slice(0, LEAD_FIELD));
        const reasons = judge(row, gameOf.get(row.rid) || null, wall, field);
        return { row, key: keyOf(row), wall, wallFrom, reasons };
    });
}

/* Names as pura-stats.js shows them: a reader without the "site" scope gets
   "A player with no nickname" for an account not nicknamed now (Discord
   names stay with the accounts that can act on them). */
async function namer(db, event, ids) {
    const seesIds = (WRITE_SCOPES[await roleOf(event)] || []).includes("site");
    let nicked = null;
    if (!seesIds) nicked = await nickedAmong(db, ids.filter(id => id && !isGuest(String(id))));
    return (playerId, name) => (seesIds || !playerId || isGuest(String(playerId)) || (nicked && nicked.has(String(playerId))) ? (name || "Someone") : "A player with no nickname");
}

async function report(db, event) {
    if (!(await hasAccount(event))) return UNAUTHORIZED;
    let rows, decisions;
    try {
        [rows, decisions] = await Promise.all([
            db.collection(SCORES).find({}, { projection: { _id: 0 } }).sort({ score: -1, pieces: 1, at: 1 }).limit(MAX_ROWS).toArray(),
            db.collection(FLAGS).find({}, { projection: { row: 0 } }).sort({ when: -1 }).limit(500).toArray()
        ]);
    } catch (e) {
        console.error("pura-flags: could not read the board", e);
        return json(503, { error: "The Pura Panic scores couldn't be read just now." });
    }
    let judged;
    try { judged = await judgeAll(db, rows); }
    catch (e) {
        console.error("pura-flags: could not judge the board", e);
        return json(503, { error: "The Pura Panic scores couldn't be read just now." });
    }
    const decided = new Map(decisions.map(d => [d._id, d]));
    const flagged = judged.filter(j => j.reasons.length);
    /* An "It's fine" is for the score it was given at (3 Nov 2026, the bug
       scan). One game saves to the board several times under the same run
       id (saves on the way, then its finish), so a decision keyed on the
       run alone let a later, much bigger save from the same game through
       unseen. A row now better than the decided one is open again. */
    const reopened = new Set();
    const open = flagged.filter(j => {
        const d = decided.get(j.key);
        if (!d) return true;
        if (d.status === "ok" && beats(j.row, d)) { reopened.add(j.key); return true; }
        return false;
    });
    const dealt = decisions.slice(0, DEALT_SHOWN);

    const nameOf = await namer(db, event, open.map(j => j.row.playerId).concat(dealt.map(d => d.playerId)));
    // Already off the public board without us: a banned account, or one with no nickname.
    const accounts = open.map(j => j.row).filter(r => !isGuest(r.playerId));
    let kept = accounts;
    try { [kept] = await withoutBanned(db, [accounts], r => r && r.playerId); } catch (e) { /* shown as on the board */ }
    const keptSet = new Set(kept);
    const placeOf = new Map(judged.map((j, i) => [j.key, i + 1]));

    return json(200, {
        open: open.map(j => ({
            key: j.key,
            name: nameOf(j.row.playerId, j.row.name),
            guest: isGuest(j.row.playerId),
            hidden: !isGuest(j.row.playerId) && !keptSet.has(j.row),
            place: placeOf.get(j.key),
            score: Number(j.row.score) || 0,
            rows: Number(j.row.rows) || 0,
            level: Number(j.row.level) || 1,
            pieces: Number(j.row.pieces) || 0,
            ms: Number(j.row.ms) || 0,
            wall: j.wall,
            wallFrom: j.wallFrom,
            at: j.row.at,
            reasons: j.reasons,
            // Marked fine before, at a lower score: what was decided, for the panel to say so.
            fine: reopened.has(j.key) ? (d => ({ score: Number(d.score) || 0, by: d.by || null, when: d.when || null }))(decided.get(j.key)) : null
        })),
        dealt: dealt.map(d => ({
            key: d._id,
            status: d.status,
            name: nameOf(d.playerId, d.name),
            score: Number(d.score) || 0,
            level: Number(d.level) || 1,
            at: d.rowAt || null,
            reasons: Array.isArray(d.reasons) ? d.reasons : [],
            by: d.by || null,
            when: d.when || null,
            // An "ok" whose row is still the player's best: the flag would show again on Undo.
            stillOnBoard: d.status === "ok" ? judged.some(j => j.key === d._id) : false,
            // An "ok" the same game has since beaten: its row is in `open` again.
            flaggedAgain: reopened.has(d._id)
        })),
        counts: { open: open.length, flagged: flagged.length, board: rows.length },
        rules: { PACE_PPS, PACE_MIN_PIECES, LEAD_MIN, LEAD_TIMES, LEAD_FIELD }
    });
}

// The board row a key names, with its own _id (for the delete), or null.
async function rowByKey(db, key) {
    const scores = db.collection(SCORES);
    const byRid = await scores.findOne({ rid: key });
    if (byRid) return byRid;
    // Rows from before the run id was kept: few, and only ever fewer.
    const old = await scores.find({ rid: { $exists: false } }).limit(MAX_ROWS).toArray();
    return old.find(r => keyOf(r) === key) || null;
}

async function audit(event, target) {
    await record(event, "write", {
        username: usernameFromToken(event) || "unknown",
        session: sessionOf(event),
        method: "POST",
        endpoint: "pura-flags",
        target: String(target).slice(0, 200)
    });
}

const MAX_BODY = 2048;

async function act(db, event) {
    if (!(await hasAccount(event))) return UNAUTHORIZED;
    /* The write rule made by hand, as bans.js makes it, so the activity
       log's row can say whose score and what was done (canWrite's own row
       only knows an id). refuseWrite words the refusal. */
    const role = await roleOf(event);
    if (!(WRITE_SCOPES[role] || []).includes("site")) return await refuseWrite(event);
    if (String(event.body || "").length > MAX_BODY) return json(413, { error: "Too large" });
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request body" }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request body" });
    const key = typeof body.key === "string" && /^[0-9a-f]{24}$/.test(body.key) ? body.key : null;
    const action = ["ok", "remove", "undo"].includes(body.action) ? body.action : null;
    if (!key || !action) return json(400, { error: "Which score, and what to do with it?" });
    const who = usernameFromToken(event) || "";
    const flags = db.collection(FLAGS);
    const scores = db.collection(SCORES);

    if (action === "undo") {
        const d = await flags.findOne({ _id: key });
        if (!d) return json(404, { error: "There's nothing to undo for that score." });
        if (d.status === "removed" && d.row) {
            // Back as keepBest (pura-scores.js) would put it: only over a worse row, or none.
            const { _id, ...row } = d.row;
            const filter = { playerId: row.playerId, $or: [{ score: { $lt: Number(row.score) || 0 } }, { score: Number(row.score) || 0, pieces: { $gt: Number(row.pieces) || 0 } }] };
            let back = false;
            try {
                const r = await scores.updateOne(filter, { $set: row }, { upsert: true });
                back = Boolean(r.upsertedCount || r.matchedCount);
            } catch (e) {
                if (!(e && e.code === 11000)) throw e;   // a better row is there: nothing to put back over
            }
            await flags.deleteOne({ _id: key });
            await audit(event, `put back ${d.name || "?"} ${num(d.score)} points${back ? "" : " (a better score was there)"}`);
            return json(200, { done: "undo", back, message: back
                ? "Put back on the board. It shows here again until you mark it fine."
                : "They have a better score on the board now, so this one stays off. The removal is forgotten." });
        }
        await flags.deleteOne({ _id: key });
        await audit(event, `undo fine ${d.name || "?"} ${num(d.score)} points`);
        return json(200, { done: "undo", message: "Undone. If it's still their best, it's flagged again." });
    }

    const row = await rowByKey(db, key);
    if (!row) return json(404, { error: "That score isn't on the board any more. Refresh to see the board as it is now." });
    /* Judged against the board, as the GET judges it: the field is the
       next LEAD_FIELD best scores without this row (3 Nov 2026, the bug
       scan). A row with nothing against it now (the board moved on since
       the Warren read it) is not decided on. */
    const top = await scores.find({}, { projection: { score: 1 } }).sort({ score: -1, pieces: 1, at: 1 }).limit(LEAD_FIELD + 1).toArray();
    const field = median(top.filter(r => String(r._id) !== String(row._id)).slice(0, LEAD_FIELD).map(r => Number(r.score) || 0));
    const [j] = await judgeAll(db, [row], () => field);
    if (!j.reasons.length) return json(409, { error: "That score isn't flagged on the board as it is now, so there's nothing to decide. Refresh to see the board as it is now." });
    const decision = {
        status: action === "ok" ? "ok" : "removed",
        by: who, when: new Date(),
        playerId: row.playerId, name: row.name || null,
        // The score (and pieces) decided on: a better save from the same game is flagged again (report).
        score: Number(row.score) || 0, pieces: Number(row.pieces) || 0, level: Number(row.level) || 1, rowAt: row.at || null,
        reasons: j.reasons.map(r => r.text)
    };

    if (action === "ok") {
        await flags.replaceOne({ _id: key }, decision, { upsert: true });
        await audit(event, `fine ${row.name || "?"} ${num(row.score)} points`);
        return json(200, { done: "ok", message: "Marked as fine. It won't be flagged again unless they set a new best." });
    }

    /* REMOVE. The decision first, with the row in it: pura-scores.js refuses
       a save from a removed run (its own later saves would otherwise put it
       straight back), and the copy is what Undo puts back. Then the row,
       matched on its own _id so a newer best set meanwhile is never the one
       deleted. A failed delete takes the decision back with it. */
    await flags.replaceOne({ _id: key }, { ...decision, row }, { upsert: true });
    try {
        await scores.deleteOne({ _id: row._id });
    } catch (e) {
        await flags.deleteOne({ _id: key }).catch(() => {});
        throw e;
    }
    /* And again by the run id (3 Nov 2026, the bug scan): a save from this
       game that passed pura-scores.js's removal check just before the
       decision was written can land after the delete and put the row back.
       pura-scores.js checks again after its own write too; this is the
       belt to that brace. */
    if (row.rid === key) {
        try { await scores.deleteOne({ rid: key }); }
        catch (e) { console.error("pura-flags: could not re-check a removed run", e); }
    }
    await audit(event, `remove ${row.name || "?"} ${num(row.score)} points from the board`);
    return json(200, { done: "remove", message: "Taken off the board. That game can't be saved to it again; their next game can." });
}

exports.handler = async (event) => {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    let db;
    try {
        db = await getDb();
    } catch (e) {
        console.error("pura-flags: database connection failed", e);
        return json(503, { error: "Database connection failed" });
    }
    try {
        return event.httpMethod === "GET" ? await report(db, event) : await act(db, event);
    } catch (e) {
        if (isAuthUnavailable(e)) return AUTH_UNAVAILABLE;
        throw e;
    }
};

// For the save path (pura-scores.js): a run whose score was taken off the board.
exports.FLAGS = FLAGS;
exports._test = { judge, judgeAll, keyOf, beats, animationMs, clock, FLASH_MS, BANNER_MS, PACE_PPS, PACE_MIN_PIECES, LEAD_MIN, LEAD_TIMES };

exports.handler = require("./_errors").withErrorReporting("pura-flags", exports.handler);
