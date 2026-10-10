/* /.netlify/functions/pura-scores — the Pura Panic leaderboard.

   GET                    the top 25, and the caller's own best if signed in
   GET ?name=X&hotel=COM  whether a Habbo name belongs to a signed-up player
                          ({ taken }), for the signed-out name prompt
   GET ?guest=X&hotel=COM the board, with a signed-out Habbo's own row
   GET ?rat=N             the board, with Guest Rat N's own row
   POST ?action=start     a signed run token carrying the game's SEED
   POST {run, log, ms}    a finished game: `run` that token, `log` where
                          every piece came to rest ([rot, x, y, lane] each)
   POST ?action=claim     {habbo, hotel}: a motto code for a signed-out
                          player to prove the Habbo is theirs (see GUESTS)
   POST ?action=verify    {claim}: their motto read fresh from Origins; the
                          code in it hands back a token naming that Habbo
   POST ?action=continue  {run}: a game left part-way, picked up again —
                          ONCE (see CONTINUING)
   POST ?action=played    the same for a game that is not for the board
                          (signed out, no nickname, no rows): kept for the
                          Warren's figures only — see THE GAME LOG

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
   NICKNAME, as the daily games are (writeRefusal's `daily`) — and for
   signed-out players, as a Habbo or as a Guest Rat (6 Oct 2026, the
   owner's: "that's the whole point of them adding their username").

   GUESTS, two kinds, both on the one board with everybody else:

   - A HABBO, PROVED (the owner's: the motto code, once). The name typed
     at Play is looked up on Origins on the hotel picked (lookupOriginsName
     in habbo.js): not a Habbo, refused ("name-unknown"); a signed-up
     player's (nameTaken: their nickname, or the Habbo linked to their
     account on that hotel), refused ("name-taken"). Then a code, as
     habbo-verify.js gives signed-in players — MR- and five letters, for
     half an hour, carried in a signed CLAIM rather than stored, since there
     is no account to keep it on — goes in their Origins motto; "verify"
     reads the motto FRESH (fetchOriginsProfile, never the cache), at most
     once every CHECK_GAP_MS a code, and the code in it hands back a signed
     HABBO token naming that Habbo, kept by the browser for good. Only that
     token puts a Habbo on the board: a bare name never does. Taken is
     asked again at every score, in case somebody has signed up with it
     since. The row is keyed "guest:HOTEL:" + nameKey(name) and shows the
     Habbo's own spelling and head (the figure rides in the token).
   - A GUEST RAT, for "Play as a Guest": "Guest Rat 1", "Guest Rat 2"… A
     number is given out (an atomic counter) only when that browser's first
     score reaches the board, so the numbers are not used up by people who
     never clear a row, and handed back signed (RAT_AUDIENCE): the page
     keeps the token and sends it with every game, so nobody else can play
     as that Guest Rat. Keyed "guestrat:N".

   Network bans still apply to both (writeRefusal with no account).

   ----------------------------------------------------------------------
   THE GAME LOG (6 Oct 2026, the owner's: "make sure I can see cool data",
   the game being in beta)

   pura_starts    one row per Play pressed while live: when, and who if
                  signed in. Starts against finished games is how many
                  games were walked out of without an ending.
   pura_games     one row per FINISHED game, signed in or not, scored or
                  not, keyed by its run id so a game is only ever counted
                  once — replayed like a scored game, so every figure in it
                  is the rules' own and not the page's say-so: score, rows,
                  level, pieces, length, how it ended (topped out, or
                  ended from the pause screen), clears by size and chains;
                  and three things only the page knows, taken as said:
                  a touchscreen, lights off, the music muted.

   Both are kept for KEEP_DAYS and read by pura-stats.js for the Warren.
   Neither write ever stands between a player and their game or score:
   a failure is logged and the game goes on. */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getDb, ensureUniqueIndex, ensureIndex } = require("./_db");
const { playerFrom, publicName, nameKey } = require("./_player");
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

const STARTS = "pura_starts";
const GAMES = "pura_games";
const KEEP_DAYS = 180;

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
    return 1 + (await shown(db, ahead)).length;
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

/* CONTINUING (7 Oct 2026, the owner's). A game left part-way — the tab
   closed, the browser shut — already stands on the board at the last level
   it reached (the saves at each new level, A SAVE ON THE WAY). The page
   keeps the game (its token, seed and placements) and, on the player's
   return, offers to pick it up where it stopped. "continue" re-issues the
   game's token, the same game (rid, seed, start time) with a fresh three
   hours and `resumed` set, so a continued game can never be continued
   again (the owner's: "once per game, they cannot keep leaving and coming
   back"). Refused when the game was finished (its token spent), when it
   started more than RESUME_WINDOW_MS ago, or when it was continued before
   — here, as well as in the claims, by a row per continue (pura_continues),
   so the old token cannot be continued twice either. The start time stays
   the first one, so the clock check still holds: game time can never be
   more than the time since the game began. */
const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

async function continueRun(db, event, player) {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Body is not JSON" }); }
    let c = null;
    try {
        c = jwt.verify(String(body.run || ""), process.env.SESSION_SECRET || "", { audience: RUN_AUDIENCE, algorithms: ["HS256"], ignoreExpiration: true });
    } catch (e) { c = null; }
    if (!c || typeof c.rid !== "string" || !/^[0-9a-f]{24}$/.test(c.rid) || !Number.isInteger(c.seed) || !Number.isFinite(c.t)) {
        return json(200, { token: null, reason: "unknown" });
    }
    if (c.sub && (!player || String(c.sub) !== String(player.id))) return json(200, { token: null, reason: "someone-else" });
    if (c.resumed) return json(200, { token: null, reason: "already-continued" });
    if (Date.now() - c.t > RESUME_WINDOW_MS) return json(200, { token: null, reason: "too-old" });
    if (!(await isOpen(db).catch(() => false))) return json(200, { token: null, reason: "maintenance" });
    try {
        if (await db.collection(RUN_TOKENS).findOne({ _id: c.rid })) return json(200, { token: null, reason: "finished" });
        /* Finished is also its log row (10 Oct 2026): the spent token above
           ages out after four hours, inside the day a game can be picked
           up in, and a game finished off the board (THE GAME LOG's
           "played") never spends one at all. */
        if (await db.collection(GAMES).findOne({ _id: c.rid, final: true }, { projection: { _id: 1 } })) return json(200, { token: null, reason: "finished" });
        const once = db.collection("pura_continues");
        await once.createIndex({ at: 1 }, { expireAfterSeconds: RESUME_WINDOW_MS / 1000 + RUN_LIFE_S + 3600 }).catch(() => {});
        await once.insertOne({ _id: c.rid, at: new Date() });
    } catch (e) {
        if (e && e.code === 11000) return json(200, { token: null, reason: "already-continued" });
        console.error("pura-scores: could not continue a game", e);
        return json(503, { error: "That game can't be picked up just now." });
    }
    const claims = { rid: c.rid, t: c.t, seed: c.seed, resumed: true };
    if (c.sub) claims.sub = c.sub;
    const token = jwt.sign(claims, process.env.SESSION_SECRET, { audience: RUN_AUDIENCE, expiresIn: RUN_LIFE_S, algorithm: "HS256" });
    return json(200, { token, seed: c.seed });
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
/* A name in the characters a Habbo name may have, the rule room-figure.js
   and ff-runs.js apply (no spaces, nothing that could be markup); anything
   else is no name at all. Then looked up on Origins (see GUESTS). */
const HABBO_NAME = /^[A-Za-z0-9_\-=?!@:.,]{1,32}$/;
const habboName = (v) => {
    const s = String(v === undefined || v === null ? "" : v).trim();
    return HABBO_NAME.test(s) ? s : null;
};
// A guest's board key (see GUESTS above): "guest:HOTEL:name" or "guestrat:N".
const HOTELS = ["COM", "ES", "BR"];
const hotelOf = (v) => {
    const s = typeof v === "string" ? v.trim().toUpperCase() : "";
    return HOTELS.includes(s) ? s : "COM";
};
/* Keyed by the Habbo's own name, lower-cased (10 Oct 2026). It was
   nameKey(name), letters and digits only — so "Bob" and ".Bob.", two
   different Habbos, shared one row, each score landing under the other's
   name, and every punctuation-only name shared "guest:COM:". Rows from
   before are still under that key (legacyGuestId): read as the Habbo's
   when the name matches, and moved to the new key at its next score. */
const guestId = (name, hotel) => "guest:" + hotelOf(hotel) + ":" + String(name).toLowerCase();
const legacyGuestId = (name, hotel) => "guest:" + hotelOf(hotel) + ":" + nameKey(name);
const sameName = (name) => new RegExp("^" + String(name).replace(/[.*+?^${}()|[\]\\-]/g, "\\$&") + "$", "i");
// A guest Habbo's row, under its key or the old one with the same name.
const guestRowFilter = (name, hotel) => {
    const key = guestId(name, hotel), legacy = legacyGuestId(name, hotel);
    return key === legacy ? { playerId: key } : { $or: [{ playerId: key }, { playerId: legacy, name: sameName(name) }] };
};
const ratId = (n) => "guestrat:" + n;
const isGuest = (id) => typeof id === "string" && (id.startsWith("guest:") || id.startsWith("guestrat:"));

/* The motto proof (see GUESTS). Codes as habbo-verify.js makes them. */
const CLAIM_AUDIENCE = "mazerats-pura-claim";
const HABBO_AUDIENCE = "mazerats-pura-habbo";
const CLAIM_LIFE_S = 30 * 60;
const CHECK_GAP_MS = 30 * 1000;
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
    const bytes = crypto.randomBytes(5);
    let out = "MR-";
    for (let i = 0; i < 5; i++) out += CODE_LETTERS[bytes[i] % CODE_LETTERS.length];
    return out;
}
function readToken(token, audience) {
    if (!token || typeof token !== "string" || !process.env.SESSION_SECRET) return null;
    try { return jwt.verify(token, process.env.SESSION_SECRET, { audience, algorithms: ["HS256"] }); }
    catch (e) { return null; }
}
const signToken = (claims, audience, life) => process.env.SESSION_SECRET
    ? jwt.sign(claims, process.env.SESSION_SECRET, { audience, algorithm: "HS256", ...(life ? { expiresIn: life } : {}) })
    : null;

// As habbo-verify.js and player-nick.js: a POST naming another site is refused.
function sameOrigin(event) {
    const h = event.headers || {};
    const origin = h.origin || h.Origin;
    if (!origin) return true;
    const host = h["x-forwarded-host"] || h.host || h.Host || "";
    try { return new URL(origin).host === host; } catch (e) { return false; }
}

async function claimHabbo(db, body) {
    const habbo = habboName(body.habbo);
    if (!habbo) return json(400, { error: "That isn't a Habbo username." });
    const hotel = hotelOf(body.hotel);
    if (await nameTaken(db, habbo, hotel)) return json(200, { refused: "name-taken" });
    let found = null;
    try {
        const { lookupOriginsName } = require("./habbo");
        found = await lookupOriginsName(db, hotel, habbo);
    } catch (e) { /* below */ }
    if (!found) return json(503, { error: "Habbo Origins isn't answering just now. Try again in a moment." });
    if (!found.found) return json(200, { refused: "name-unknown" });
    const name = (found.profile && found.profile.name) || habbo;
    const code = newCode();
    const claim = signToken({ name, hotel, code }, CLAIM_AUDIENCE, CLAIM_LIFE_S);
    if (!claim) return json(503, { error: "That can't be done just now." });
    return json(200, { code, name, hotel, claim });
}

async function verifyHabbo(db, body) {
    const c = readToken(body.claim, CLAIM_AUDIENCE);
    /* Named for the real button (10 Oct 2026): the page goes back to
       Who's Playing on this answer, whose Next gives a new code. */
    if (!c || !c.name || !c.code) return json(409, { error: "That code has run out. Press Next for a new one." });
    // At most one look a code every CHECK_GAP_MS (habbo-verify.js's rule).
    const checks = db.collection("pura_claims");
    /* Keyed by a hash of the code, never the code (10 Oct 2026): the
       privacy policy says the motto code is not stored by us, and the
       gap only needs to know the same code again. */
    const codeId = crypto.createHash("sha256").update(String(c.code)).digest("hex");
    try {
        await checks.createIndex({ at: 1 }, { expireAfterSeconds: CLAIM_LIFE_S + 600 }).catch(() => {});
        const prior = await checks.findOneAndUpdate({ _id: codeId }, { $set: { at: new Date() } }, { upsert: true, returnDocument: "before" });
        const was = prior && prior.ok !== undefined && prior.value !== undefined ? prior.value : prior;
        const last = was && was.at ? new Date(was.at).getTime() : 0;
        if (last && Date.now() - last < CHECK_GAP_MS) {
            await checks.updateOne({ _id: codeId }, { $set: { at: new Date(last) } });
            const wait = CHECK_GAP_MS - (Date.now() - last);
            return json(429, { error: "Give it a moment, then check again.", wait });
        }
    } catch (e) { /* the gap is a courtesy to Origins; the check goes on */ }
    if (await nameTaken(db, c.name, c.hotel)) return json(200, { refused: "name-taken" });
    let result;
    try {
        const { fetchOriginsProfile, ORIGINS_HOSTS } = require("./habbo");
        result = await fetchOriginsProfile(ORIGINS_HOSTS[c.hotel] || ORIGINS_HOSTS.COM, c.name);
    } catch (e) {
        return json(503, { error: "Habbo Origins isn't answering just now. Try again in a moment." });
    }
    const motto = result && result.found && result.profile ? String(result.profile.motto || "") : "";
    if (!motto.toUpperCase().includes(c.code)) return json(200, { verified: false, wait: CHECK_GAP_MS });
    let figure = null;
    try { figure = result.profile.avatar ? new URL(result.profile.avatar).searchParams.get("figure") : null; } catch (e) { /* none */ }
    const token = signToken({ name: c.name, hotel: c.hotel, figure: figure || null }, HABBO_AUDIENCE, 0);
    if (!token) return json(503, { error: "That can't be done just now." });
    try { await checks.deleteOne({ _id: codeId }); } catch (e) { /* ages out */ }
    return json(200, { verified: true, name: c.name, hotel: c.hotel, token });
}

// A Guest Rat's number, handed back signed so it cannot be borrowed.
const RAT_AUDIENCE = "mazerats-pura-guestrat";
function signRat(n) {
    if (!process.env.SESSION_SECRET) return null;
    return jwt.sign({ n }, process.env.SESSION_SECRET, { audience: RAT_AUDIENCE, algorithm: "HS256" });
}
function readRat(token) {
    if (!token || typeof token !== "string" || !process.env.SESSION_SECRET) return null;
    try {
        const c = jwt.verify(token, process.env.SESSION_SECRET, { audience: RAT_AUDIENCE, algorithms: ["HS256"] });
        return c && Number.isInteger(c.n) && c.n > 0 ? c.n : null;
    } catch (e) {
        return null;
    }
}
async function nextRat(db) {
    const r = await db.collection("counters").findOneAndUpdate(
        { _id: "pura_guest_rat" }, { $inc: { n: 1 } }, { upsert: true, returnDocument: "after" });
    const doc = r && r.ok !== undefined && r.value !== undefined ? r.value : r;
    return doc && Number.isInteger(doc.n) ? doc.n : null;
}
/* ONE GAME, ONE GUEST RAT (10 Oct 2026). A number was given to every
   unnamed submission, and a game sends several (A SAVE ON THE WAY): two
   saves racing, or a save whose answer never reached a closing tab and
   then the finish, each took a number and left a row, so one browser's one
   game stood on the board as "Guest Rat 5" and "Guest Rat 6" — and a
   script could mint rows endlessly from a single token. Now the number
   is the run's: the first submission of a game takes one and every later
   one of the same game gets the same back. Kept as long as the token can
   be continued. */
const RUN_RATS = "pura_run_rats";
async function ratForRun(db, rid) {
    const col = db.collection(RUN_RATS);
    const had = await col.findOne({ _id: rid });
    if (had && Number.isInteger(had.n)) return had.n;
    const n = await nextRat(db);
    if (!n) return null;
    await col.createIndex({ at: 1 }, { expireAfterSeconds: RESUME_WINDOW_MS / 1000 + RUN_LIFE_S + 3600 }).catch(() => {});
    try {
        await col.insertOne({ _id: rid, n, at: new Date() });
        return n;
    } catch (e) {
        // A save of the same game got there first: its number (this one goes unused).
        if (!(e && e.code === 11000)) throw e;
        const won = await col.findOne({ _id: rid });
        return won && Number.isInteger(won.n) ? won.n : null;
    }
}

// A Habbo head, as _publicid.js draws them (its OUTLINE_V).
const headOf = (figure) => figure ? `/.netlify/functions/habbo-outline?figure=${encodeURIComponent(figure)}&kind=head&v=2` : null;

/* Who a signed-out game is from, from what the page sent:
     { kind: "habbo", id, name, hotel, figure }  a Habbo, proved by motto
     { kind: "rat", n, token }                   a Guest Rat (n null: not yet numbered)
     { refuse: "name-taken" }
     null                                        nobody named */
async function guestOf(db, body) {
    const h = body.habboToken ? readToken(body.habboToken, HABBO_AUDIENCE) : null;
    if (h && habboName(h.name)) {
        const hotel = hotelOf(h.hotel);
        if (await nameTaken(db, h.name, hotel)) return { refuse: "name-taken" };
        return { kind: "habbo", id: guestId(h.name, hotel), name: h.name, hotel, figure: typeof h.figure === "string" ? h.figure : null };
    }
    if (body.rat) {
        const n = readRat(body.rat);
        if (n) return { kind: "rat", n, token: body.rat };
    }
    if (body.guest === true) return { kind: "rat", n: null, token: null };
    return null;
}

/* The board's own filter: accounts through withoutBanned (banned players
   and players with no nickname off), guests kept as they are. Order kept. */
async function shown(db, rows) {
    const accounts = rows.filter(r => r && !isGuest(r.playerId));
    const [kept] = await withoutBanned(db, [accounts], r => r && r.playerId);
    const ok = new Set(kept);
    return rows.filter(r => r && (isGuest(r.playerId) || ok.has(r)));
}

/* A NAME ALREADY SOMEBODY'S (6 Oct 2026, the owner's): a signed-out
   player may not play as a signed-up player. Taken is a nickname that reads
   the same (nameKey, the rule nicknames are unique by), or the Habbo linked
   to an account on that hotel. Fails OPEN: an unreadable answer lets
   the name through rather than stopping a game over our own trouble. */
async function nameTaken(db, habbo, hotel) {
    const key = nameKey(habbo);
    const h = hotelOf(hotel);
    // A name with no letters or digits reads as no nickname, but can still
    // be a linked Habbo's (10 Oct 2026: it used to skip both checks).
    const either = [{ "habbo.name": sameName(habbo), "habbo.hotel": { $in: h === "COM" ? ["COM", null] : [h] } }];
    if (key) either.unshift({ nickKey: key });
    try {
        const row = await db.collection("players").findOne(
            { $or: either },
            { projection: { _id: 0, id: 1 } });
        return Boolean(row);
    } catch (e) {
        console.error("pura-scores: could not check a name", e);
        return false;
    }
}

let logIndexed = false;
async function logIndexes(db) {
    if (logIndexed) return;
    logIndexed = true;
    for (const c of [STARTS, GAMES]) {
        try { await db.collection(c).createIndex({ at: 1 }, { expireAfterSeconds: KEEP_DAYS * 86400 }); }
        catch (e) { /* kept a little longer than meant, at worst */ }
    }
}

// A Play pressed while live. Never in the way of the game.
async function logStart(db, claims, player) {
    try {
        await logIndexes(db);
        await db.collection(STARTS).insertOne({ _id: claims.rid, at: new Date(), playerId: player ? player.id : null });
    } catch (e) {
        if (!(e && e.code === 11000)) console.error("pura-scores: could not log a start", e);
    }
}

/* A finished game, replayed. Once per run id: a second report of the same
   game (the page retrying) is a duplicate key and quietly nothing. */
/* A SAVE ON THE WAY (7 Oct 2026, the owner's): a game still being played
   sends where it has got to at each new level, and when its tab is hidden,
   so a browser closed hard (a phone's above all) still leaves its score on
   the board. A save goes through every check a finished game does and
   keeps the best like one (keepBest), but does NOT spend the run token —
   the finished game still can — and its log row says "closed" until the
   finished game overwrites it. A save that arrives after the finish (a tab
   hidden just after End game) never overwrites the finished row. */
async function logGame(db, claims, player, result, ms, body, guest) {
    const b = body || {};
    const g = guest && guest.kind ? guest : null;
    const checkpoint = b.checkpoint === true;
    try {
        await logIndexes(db);
        const doc = {
            at: new Date(),
            playerId: player ? player.id : null,
            name: player ? await publicName(db, player).catch(() => null) : null,
            score: result.score,
            rows: result.bands,
            level: result.level,
            pieces: result.pieces,
            ms,
            ended: result.over ? "topout" : checkpoint ? "closed" : "quit",
            // Picked up again after being left (CONTINUING).
            resumed: claims.resumed === true,
            clears: result.clears || [0, 0, 0, 0],
            chains: result.chains || 0,
            /* Signed out (see GUESTS): the Habbo they played as, checked,
               with its hotel; or their Guest Rat number once they have one. */
            habbo: g && g.kind === "habbo" ? g.name : null,
            hotel: g && g.kind === "habbo" ? g.hotel : null,
            rat: g && g.kind === "rat" ? g.n : null,
            touch: b.touch === true,
            dark: b.dark === true,
            muted: b.muted === true
        };
        if (checkpoint) {
            // Upserted unless the finished game is on file (then a duplicate key, quietly nothing).
            await db.collection(GAMES).updateOne({ _id: claims.rid, final: { $ne: true } }, { $set: doc }, { upsert: true });
        } else {
            await db.collection(GAMES).replaceOne({ _id: claims.rid }, { ...doc, final: true }, { upsert: true });
        }
    } catch (e) {
        if (!(e && e.code === 11000)) console.error("pura-scores: could not log a game", e);
    }
}

/* The checks every finished game passes before anything is believed of it,
   scored or not: the token, the clock, and the replay. A string is a
   reason to refuse; otherwise { claims, ms, result }. */
function checkGame(body, player) {
    if (!body.run) return { refuse: json(200, { recorded: false, reason: "no-run-token" }) };
    const claims = readRun(body.run, player);
    if (!claims) return { refuse: json(200, { recorded: false, reason: "stale-run" }) };
    const ms = Math.max(0, Math.round(Number(body.ms) || 0));
    if (ms > Date.now() - claims.t + RUN_TOLERANCE_MS) {
        return { refuse: json(400, { error: "That game is longer than the time since it started" }) };
    }
    const log = body.log;
    if (!Array.isArray(log) || !log.length) return { refuse: json(200, { recorded: false, reason: "no-pieces" }) };
    if (log.length > MAX_PIECES) return { refuse: json(400, { error: "Too many pieces" }) };
    if (ms < log.length * PIECE_MIN_MS) {
        return { refuse: json(400, { error: "Those pieces came down faster than anybody plays" }) };
    }
    const result = Engine.replay(claims.seed, log, MAX_PIECES);
    if (!result.ok) return { refuse: json(400, { error: result.error }) };
    return { claims, ms, result };
}

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
    avatar: (heads && heads.get(String(row.playerId))) || headOf(row.figure) || null,
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

    if (event.httpMethod === "GET" && (event.queryStringParameters || {}).name !== undefined) {
        const q = event.queryStringParameters;
        const habbo = habboName(q.name);
        if (!habbo) return json(400, { error: "That isn't a Habbo name." });
        return json(200, { taken: await nameTaken(db, habbo, q.hotel) });
    }

    if (event.httpMethod === "GET") {
        try {
            await ensureIndex(scores, { score: -1, pieces: 1, at: 1 });
            const open = await isOpen(db);
            const top = (await shown(db, await scores
                .find({}, { projection: { _id: 0 } })
                .sort({ score: -1, pieces: 1, at: 1 })
                .limit(BOARD_READ)
                .toArray())).slice(0, TOP);
            const heads = await habboHeads(db, [...top.map(r => r && r.playerId), player && player.id]);
            const out = { open, top: top.map(r => clean(r, heads)) };
            const qs = event.queryStringParameters || {};
            const guest = player ? null : habboName(qs.guest);
            const rat = player ? null : parseInt(qs.rat, 10);
            const meId = player ? player.id : guest ? guestId(guest, qs.hotel) : rat > 0 ? ratId(rat) : null;
            if (meId) {
                const mine = await scores.findOne(!player && guest ? guestRowFilter(guest, qs.hotel) : { playerId: meId }, { projection: { _id: 0 } });
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

    // The motto proof (GUESTS): signed out only, from this site only.
    const act = (event.queryStringParameters || {}).action;
    if (act === "claim" || act === "verify") {
        if (!sameOrigin(event)) return json(403, { error: "Forbidden" });
        if (player) return json(409, { error: "You're signed in already." });
        const refused = await writeRefusal(db, event, null, { game: true });
        if (refused) return refused;
        let body;
        try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Body is not JSON" }); }
        if (!body || typeof body !== "object") return json(400, { error: "Body is not JSON" });
        return act === "claim" ? claimHabbo(db, body) : verifyHabbo(db, body);
    }

    /* THE START: a token and its seed, nothing written. Answered signed out
       too — the seed is what the game is dealt from either way — but not
       while the game is in maintenance: then the page deals its own seed
       and says scores are not being kept. */
    if ((event.queryStringParameters || {}).action === "continue") {
        if (!sameOrigin(event)) return json(403, { error: "Forbidden" });
        const refused = await writeRefusal(db, event, player ? player.id : null, { game: true });
        if (refused) return refused;
        return continueRun(db, event, player);
    }

    if ((event.queryStringParameters || {}).action === "start") {
        let open;
        try { open = await isOpen(db); }
        catch (e) { return json(503, { error: "The leaderboard could not be reached just now." }); }
        if (!open) return json(200, { token: null, reason: "maintenance" });
        /* Banned, no game (10 Oct 2026, the bug scan; the owner's yes). A
           banned network or account was handed a run token and logged a
           pura_starts row, and only found out at the first save. The same
           refusal `continue` gives: the ban (and a rejected nickname, or a
           revoked session) — never the daily games' sign-in and nickname
           gate, as guests still play. The page shows Account's ban window. */
        const refused = await writeRefusal(db, event, player ? player.id : null, { game: true });
        if (refused) return refused;
        const run = signRun(player, Date.now());
        if (!run) return json(200, { token: null, reason: "unavailable" });
        await logStart(db, jwt.decode(run.token), player);
        return json(200, run);
    }

    /* A GAME NOT FOR THE BOARD: signed out, no nickname, or no rows. Logged
       for the Warren (THE GAME LOG) after the same checks a scored game
       passes, and nothing more. Live only, as the token it carries was. */
    if ((event.queryStringParameters || {}).action === "played") {
        if ((event.body || "").length > MAX_BODY) return json(413, { error: "That game is too long to send" });
        let body;
        try { body = JSON.parse(event.body || "{}"); }
        catch { return json(400, { error: "Body is not JSON" }); }
        if (!body || typeof body !== "object") return json(400, { error: "Body is not JSON" });
        const checked = checkGame(body, player);
        if (checked.refuse) return checked.refuse;
        const g = player ? null : await guestOf(db, body);
        await logGame(db, checked.claims, player, checked.result, checked.ms, body, g && !g.refuse ? g : null);
        return json(200, { logged: true });
    }

    // Signed in with a nickname, not banned — as the daily games ask; or a
    // guest, under a name (GUESTS above), from a network that is not banned.
    const refusal = await writeRefusal(db, event, player ? player.id : null, player ? { game: true, daily: true } : { game: true });
    if (refusal) return refusal;

    if ((event.body || "").length > MAX_BODY) return json(413, { error: "That game is too long to send" });
    let body;
    try { body = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Body is not JSON" }); }
    if (!body || typeof body !== "object") return json(400, { error: "Body is not JSON" });

    if (!player && !body.habboToken && !body.rat && body.guest !== true) {
        return json(200, { recorded: false, reason: "signed-out" });
    }
    const checked = checkGame(body, player);
    if (checked.refuse) return checked.refuse;
    const { claims, ms, result } = checked;
    // Shut since the game started: its token was issued while live, but the
    // board takes nothing in maintenance.
    if (!(await isOpen(db).catch(() => false))) return json(200, { recorded: false, reason: "maintenance" });
    const guest = player ? null : await guestOf(db, body);
    if (guest && guest.refuse) {
        await logGame(db, claims, null, result, ms, body, null);
        return json(200, { recorded: false, reason: guest.refuse });
    }
    if (!player && !guest) return json(200, { recorded: false, reason: "signed-out" });
    await logGame(db, claims, player, result, ms, body, guest);
    // The page says what it scored; a page and a server that disagree is a bug worth hearing about.
    if (body.score !== undefined && Number(body.score) !== result.score) {
        console.warn("pura-scores: the page and the replay disagree", body.score, result.score);
    }
    if (!result.score) return json(200, { recorded: false, reason: "no-score", score: 0 });

    let who = player || (guest.kind === "habbo" ? { id: guest.id } : guest.n ? { id: ratId(guest.n) } : { id: "guestrat:new" });
    /* Only a finished game spends the token, so only a finished game hands
       it back when the write fails (10 Oct 2026): a checkpoint failing used
       to delete the lock its own game's finish had taken, letting the
       finish be filed twice. */
    const spends = body.checkpoint !== true;
    const unspend = async () => {
        if (!spends) return;
        try { await db.collection(RUN_TOKENS).deleteOne({ _id: claims.rid }); } catch (e2) { /* one game lost, never two entries */ }
    };
    try {
        await ensureUniqueIndex(scores, "playerId");
        if (spends && !(await spendRun(db, claims, who))) return json(200, { recorded: false, reason: "already-submitted" });
    } catch (e) {
        console.error("pura-scores: could not spend a run token", e);
        return json(503, { error: "The leaderboard could not be updated just now." });
    }

    // A Habbo's row from before the key changed (guestId), moved over.
    if (guest && guest.kind === "habbo" && legacyGuestId(guest.name, guest.hotel) !== guest.id) {
        try {
            await scores.updateOne({ playerId: legacyGuestId(guest.name, guest.hotel), name: sameName(guest.name) }, { $set: { playerId: guest.id } });
        } catch (e) { /* 11000: the new key has a row already; the old one stays put */ }
    }

    // A Guest Rat's first score: their number, now (see GUESTS).
    let newRat = null;
    if (guest && guest.kind === "rat" && !guest.n) {
        let n = null;
        try { n = await ratForRun(db, claims.rid); } catch (e) { console.error("pura-scores: could not number a Guest Rat", e); }
        const token = n ? signRat(n) : null;
        if (!n || !token) {
            await unspend();
            return json(503, { error: "The leaderboard could not be updated just now." });
        }
        guest.n = n;
        newRat = { n, token };
        who = { id: ratId(n) };
        try { await db.collection(GAMES).updateOne({ _id: claims.rid }, { $set: { rat: n } }); } catch (e) { /* the log only */ }
    }

    const row = {
        playerId: who.id,
        name: player ? await publicName(db, player) : guest.kind === "habbo" ? guest.name : "Guest Rat " + guest.n,
        ...(guest && guest.kind === "habbo" ? { hotel: guest.hotel, figure: guest.figure } : {}),
        score: result.score,
        rows: result.bands,
        level: result.level,
        pieces: result.pieces,
        ms,
        at: new Date().toISOString()
    };
    let better;
    try {
        better = await keepBest(scores, who.id, row);
    } catch (e) {
        console.error("pura-scores: could not record a game", e);
        // Nothing recorded, so the token is handed back for the page's retry.
        await unspend();
        return json(503, { error: "The leaderboard could not be updated just now." });
    }
    const best = better ? row : (await scores.findOne({ playerId: who.id }).catch(() => null)) || row;
    let place = null;
    try {
        place = await placeOf(db, scores, best);
    } catch (e) { /* the place is a nicety */ }
    return json(200, {
        recorded: better,
        reason: better ? null : "not-your-best",
        score: result.score,
        best: clean(best),
        place,
        ...(newRat ? { rat: newRat } : {})
    });
};

exports.handler = require("./_errors").withErrorReporting("pura-scores", exports.handler);
