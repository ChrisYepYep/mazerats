/* Pura Panic's run tokens and its dealer, shared by pura-scores.js (the
   start, the board, continuing) and pura-deal.js (the pieces as the game
   goes). 31 Oct 2026, the bug scan; the owner's yes.

   ----------------------------------------------------------------------
   WHY THE PAGE NO LONGER HAS THE SEED

   A game's pieces come from a seven-bag shuffled by a seed. The start used
   to hand that seed to the page (and the run token carried it, signed but
   readable), so a script could deal the whole game to itself, search every
   placement ahead of time, and post a game no hand could play: 406,192
   points in 6,000 pieces in the scan's harness, against about 35 by level
   4 for a person.

   Now the seed never leaves the server. It is not even stored: it is an
   HMAC of the run id under SESSION_SECRET (seedOf), so the token carries
   only the run id and the server can always work it out again. The page
   is dealt WINDOW pieces at a time (pura-deal.js), each time sending the
   placements so far, and is never told a piece more than WINDOW past the
   last placement the server has checked. The pieces are the engine's own
   bag (Engine.kinds), so what turns up, fillers and all, is exactly what
   it always was.

   ----------------------------------------------------------------------
   CHECKED ONCE, AS IT GOES

   Every deal replays the placements so far (cheap: about 8ms for 1,500
   pieces) and checks each NEW one could have been steered there with the
   page's own controls (Engine.reachable, about a quarter of a millisecond
   a piece). What has been checked is said in a STAMP handed back with the
   pieces: how many placements, signed with a hash of them, so the next
   deal, the saves at each level and the finished game only search the
   pieces after it. The stamp is also the proof of what was dealt: a log
   longer than the stamp's count plus WINDOW holds pieces the server never
   dealt, and is refused. Stateless: the log is the state.

   ----------------------------------------------------------------------
   OLD TOKENS

   A page loaded before this went out holds a token with the seed in it
   (`seed` in its claims; `legacy` below). Those are still taken for the
   rest of their own three hours, so a game being played at the deploy is
   not lost; they cannot be continued (that would mint a fresh one), and
   their placements are reach-checked in full, up to LEGACY_REACH_MAX of
   them. None are issued any more, so three hours after the deploy there
   are none left that verify, and the `legacy` branches can go. */
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Engine = require("../../js/pura-engine.js");

const RUN_AUDIENCE = "mazerats-purarun";
const RUN_LIFE_S = 3 * 60 * 60;
/* Three seconds, not Fallin' Furni's fifteen (30 Oct 2026, the bug scan).
   That game starts its clock as it sends the start request, so its slack
   has to cover the request; this one cannot deal a piece before the reply
   brings the first ones, so an honest game's time is always under the time
   since the token was stamped, and the slack is only for two servers'
   clocks. Fifteen let a script post a 120-piece game the moment it had the
   seed, with no wait at all. */
const RUN_TOLERANCE_MS = 3 * 1000;
const PIECE_MIN_MS = 120;
// A three-hour game at the floor's pace, and the body that carries it.
const MAX_PIECES = Math.floor(RUN_LIFE_S * 1000 / PIECE_MIN_MS);
const MAX_BODY = 400 * 1024;

/* How far ahead of the last checked placement the page is dealt: the piece
   in play, the one in the Next box, and enough behind them that the page
   can ask again well before it runs out (it asks with four still to come,
   pura-panic.js DEALT) and so a request every five or six pieces. */
const WINDOW = 10;
// The reach search's size limit for one piece (it gives the benefit of the doubt past it).
const REACH_MAX = 20000;
const LEGACY_REACH_MAX = 2000;

function secret() { return process.env.SESSION_SECRET || ""; }

// The run's seed, worked out from its id, never stored or sent.
function seedOf(rid) {
    return crypto.createHmac("sha256", secret()).update("mazerats-pura-seed:" + String(rid)).digest().readUInt32BE(0);
}

// The first n pieces of a run.
const dealOf = (claims, n) => Engine.kinds(claims.seed, Math.max(0, Math.min(n, MAX_PIECES + WINDOW)));

/* A new run's token, and its first WINDOW pieces. The token names the run,
   its start and (signed in) the account: no seed. */
function signRun(player, now) {
    if (!process.env.SESSION_SECRET) return null;
    const claims = { rid: crypto.randomBytes(12).toString("hex"), t: now };
    if (player) claims.sub = player.id;
    const token = jwt.sign(claims, secret(), { audience: RUN_AUDIENCE, expiresIn: RUN_LIFE_S, algorithm: "HS256" });
    return { token, rid: claims.rid, deal: Engine.kinds(seedOf(claims.rid), WINDOW) };
}

// The same run again, for CONTINUING (pura-scores.js): same id and start, fresh three hours.
function resignRun(c) {
    const claims = { rid: c.rid, t: c.t, resumed: true };
    if (c.sub) claims.sub = c.sub;
    return jwt.sign(claims, secret(), { audience: RUN_AUDIENCE, expiresIn: RUN_LIFE_S, algorithm: "HS256" });
}

/* A run token's claims, with `seed` (worked out, or an old token's own)
   and `legacy` set; null when it is not one, has run out, or names
   another account than the one signed in. `ignoreExpiration` for
   CONTINUING, which has its own day. */
function readRun(token, player, opts) {
    if (!token || typeof token !== "string" || !process.env.SESSION_SECRET) return null;
    try {
        const c = jwt.verify(token, secret(), { audience: RUN_AUDIENCE, algorithms: ["HS256"], ignoreExpiration: Boolean(opts && opts.ignoreExpiration) });
        if (!c || typeof c.rid !== "string" || !/^[0-9a-f]{24}$/.test(c.rid)) return null;
        if (!Number.isFinite(c.t)) return null;
        if (c.seed !== undefined && !Number.isInteger(c.seed)) return null;
        if (c.sub && player && String(c.sub) !== String(player.id)) return null;
        c.legacy = c.seed !== undefined;
        if (!c.legacy) c.seed = seedOf(c.rid);
        return c;
    } catch (e) {
        return null;
    }
}

/* THE STAMP: "n.mac", n placements of this run checked, the mac over the
   run id, n and a hash of those placements. */
function stampMac(rid, log, n) {
    const h = crypto.createHash("sha256").update(JSON.stringify(log.slice(0, n))).digest("base64url");
    return crypto.createHmac("sha256", secret()).update(`mazerats-pura-stamp:${rid}:${n}:${h}`).digest("base64url").slice(0, 27);
}
const stampFor = (rid, log) => log.length + "." + stampMac(rid, log, log.length);

// How many of this log's placements a stamp says were checked: 0 for none, or one that does not fit it.
function stamped(stamp, rid, log) {
    const m = /^(\d{1,6})\.([A-Za-z0-9_-]{27})$/.exec(typeof stamp === "string" ? stamp : "");
    if (!m) return 0;
    const n = Number(m[1]);
    if (!(n > 0 && n <= log.length)) return 0;
    const want = Buffer.from(stampMac(rid, log, n));
    const got = Buffer.from(m[2]);
    return want.length === got.length && crypto.timingSafeEqual(want, got) ? n : 0;
}

/* Every check a run's placements pass, at a deal, a save or the finish:
   { result, checked } or { error }. The replay as ever, and each placement
   after the stamp's searched for a way there. */
function checkLog(claims, log, stamp) {
    const from = claims.legacy ? 0 : stamped(stamp, claims.rid, log);
    if (!claims.legacy && log.length > from + WINDOW) return { error: "Those pieces were never dealt" };
    if (claims.legacy && log.length > LEGACY_REACH_MAX) return { error: "That game is too long to check" };
    const result = Engine.replay(claims.seed, log, MAX_PIECES, { reachFrom: from, reachMax: REACH_MAX });
    if (!result.ok) return { error: result.error };
    return { result };
}

module.exports = {
    RUN_AUDIENCE, RUN_LIFE_S, RUN_TOLERANCE_MS, PIECE_MIN_MS, MAX_PIECES, MAX_BODY, WINDOW,
    seedOf, dealOf, signRun, resignRun, readRun, stampFor, stamped, checkLog
};
