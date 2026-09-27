/* The speed bonus on the daily games, and the clock it is measured by.

   A perfect day of Guess the Maze or Odd One Out is 50, and plenty of
   people get a perfect day — so the top of a day's board was a row of
   identical 50s, ordered by whoever happened to submit first. The bonus is
   what separates them: extra points for each round got right quickly.

   ----------------------------------------------------------------------
   WHO KEEPS THE TIME

   The server, never the page. When a signed-in player opens a day's game,
   the game says so (a POST with action "start" to its own scores endpoint),
   and the moment that arrives is written here. Then each MOVE — the tile
   picked, each name guessed — is sent as it is made (action "move"), judged
   here against the day's stored deal (_deal.js) at that moment, and written
   beside the start with the time it arrived. A round's end (its "mark") is
   the move that finished it. Every one of those times is read off the
   server's own clock. The page never sends a time, so there is no number in
   any request to edit.

   THE MOVE CARRIES THE PICK, and that is the fix for the hole the old shape
   had. A mark used to carry nothing but a round number, and the picks came
   later in the day's submission — so a script could mark all five rounds a
   few milliseconds apart, earn the full 185, and choose its answers
   afterwards, at leisure, from a page that had the answers in it anyway.
   Now there is no mark without a pick, the pick is judged when it lands,
   and what is judged is what is scored: the day's score is built from the
   rows written here and nothing in the submission counts. A move faster
   than MIN_MOVE_MS after its round began is refused (and the page simply
   sends it again once that has passed), so the fastest a round can ever be
   is a human's fastest, not a script's.

   FIRST WRITE WINS. One row per (game, day, player), under a unique index,
   written with $setOnInsert — so reopening the game, reloading, or opening
   it on a second device changes nothing: the clock started the first time
   and stays started. That is also what stops the obvious dodge of looking
   at the rooms, closing the window and "starting" again once you know the
   answers.

   The moves follow the same rule, and one more. A move is written with a
   conditional update that only matches while the round is still open and
   nothing has changed under it since it was read, so the FIRST recorded
   move per round wins: a reload, a second tab or a second device cannot
   re-pick a round, and cannot re-roll one either, because the deal does not
   change. And a round's first move is only taken once the round before it
   is over (round 0 needs the start), so the rounds can only ever be played
   in order: a request cannot finish round 4 first, or finish round 2 early
   and round 1 after it, to squeeze one round's time into another.

   Signed out, nothing is recorded, because there is nobody to record it
   against; the move is judged and the verdict sent back, and that is all.
   A day whose first signed-in move arrives with no start on file (the start
   request failed, say) is written as untimed, `noClock`, and earns no bonus
   — a clock that never started cannot say how fast anybody was. A round
   with no mark earns nothing either, rather than a guess at how long it
   took.

   This is exactly as trustworthy as the rest of the scoring (see the notes
   at the top of guess-scores.js and daily-scores.js): the pictures are
   public, and a player who plays the day signed out in a private window
   first knows the answers when they play it signed in. What it no longer
   allows is knowing them from the page, or choosing them after the clock
   has stopped.

   ----------------------------------------------------------------------
   HOW BIG IT IS

   Per round, and only for a round got RIGHT — as the server judged it when
   the move arrived, not as the page claimed. A wrong answer earns no bonus
   however fast it was, so guessing quickly is never worth more than
   thinking.

   A round's time is its mark minus the mark before it (round 0: its mark
   minus the start), counted in whole seconds, rounded down. The bonus is
   one point for every second left of ROUND_BONUS_SECONDS, plus one:

     round bonus = max(0, 37 - seconds)       if the round was right

       0s 37   5s 32   20s 17   36s 1   37s 0

   The day's bonus is the sum over its rounds — 185 at most over five.

   ----------------------------------------------------------------------
   THE TIME ON THE BOARD

   `ms` on a row is still the day's whole time, for the small figure on the
   Today board and the tie-break between equal totals: the last round's
   mark minus the start, or — if the last round was never marked — the
   submission minus the start. `roundSecs` beside it keeps each round's
   whole seconds (null for a round with no mark), for anything that wants
   to show them later.

   PAUSES COUNT: the clock is wall time between the marks, so a game left
   open while the kettle boils is a slow round. There is no honest way for
   the server to know what the player was doing in between, and a pause
   button would be a thing to exploit.

   The one number below is the one to tune. */
const COLLECTION = "daily_starts";

// Thirty-six seconds a round: the three minutes a whole day is given,
// shared over its five rounds. A right answer inside it earns a point for
// every second left of it, plus one — so 36 seconds is still worth 1.
const ROUND_BONUS_SECONDS = 36;

/* Sorts a row with no time after every row with one. Mongo sorts a missing
   field BEFORE any number, so "fastest first" on the raw field would put
   every untimed day — old rows, days with no start — at the top of their
   points. Used as the $ifNull fallback in the boards' sort. */
const NO_TIME = Number.MAX_SAFE_INTEGER;

/* A row's total, as an aggregation expression: the base points plus the
   bonus, with an old row's missing bonus read as nothing. The boards rank
   on this; `points` itself keeps meaning the base score. */
const TOTAL = { $add: [{ $ifNull: ["$points", 0] }, { $ifNull: ["$bonus", 0] }] };

// The same sum for a row already in hand.
const totalOf = row => (Number(row && row.points) || 0) + (Number(row && row.bonus) || 0);

/* A right round's bonus, in whole points, from how long it took. A time
   that is not a time earns nothing. Whole seconds, rounded down, so 4.9s is
   still 4 and worth 33 — and every score on the site stays a whole
   number. */
function roundBonusFor(ms) {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return 0;
    const seconds = Math.floor(ms / 1000);
    return Math.max(0, ROUND_BONUS_SECONDS + 1 - seconds);
}

// Where a round's mark lives on the start row: marks.r0, marks.r1 ... A map
// rather than an array, so writing one round can never pad or shift another.
// The round's moves live beside it under the same key: moves.r0, moves.r1.
const markKey = round => "r" + round;

/* The least time a round's first move may follow the round's beginning (the
   start, for round 0; the end of the round before, for the rest). About the
   quickest a person can look at four pictures, or one, and press something —
   and far slower than a script, which is the point: marking five rounds a
   few milliseconds apart was worth the whole 185. A move that arrives
   sooner is refused with how long is left, and the page sends it again
   once that has passed, so a genuinely quick player loses nothing but the
   difference. */
const MIN_MOVE_MS = 1200;

/* One unique index, and a TTL so the collection cleans up after itself: a
   start is only ever read on the day it was written (a day stops taking
   scores five minutes after it ends — dayIsOpen in _daily.js), so two days
   is past any use. The unique index goes through ensureUniqueIndex, which
   throws, because first-write-wins is a correctness rule; the TTL is only
   housekeeping and its failure is swallowed, as in ff-runs.js. */
let ttlTried = false;
async function ensureIndexes(col, ensureUniqueIndex) {
    await ensureUniqueIndex(col, ["game", "day", "playerId"]);
    if (!ttlTried) {
        ttlTried = true;
        await col.createIndex({ at: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 }).catch(() => {});
    }
}

/* Records the first start, and never moves it. Upsert with $setOnInsert:
   the row is written if absent and left exactly as it is if present. Two
   first opens racing each other can both try the insert; the loser gets
   the unique index's duplicate-key error, which here means "already
   started" — the rule working, not a failure. */
async function recordStart(db, ensureUniqueIndex, game, day, playerId) {
    const col = db.collection(COLLECTION);
    await ensureIndexes(col, ensureUniqueIndex);
    try {
        await col.updateOne(
            { game, day, playerId },
            { $setOnInsert: { game, day, playerId, at: new Date() } },
            { upsert: true }
        );
    } catch (e) {
        if (!(e && e.code === 11000)) throw e;
    }
}

/* The round a move request names, or null if it is not one of the game's
   0..rounds-1. A number only: "", null and true would all pass as 0 or 1
   through Number(), and none of them is a round. */
function markRound(value, rounds) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < rounds ? value : null;
}

/* The player's row for the day, EARLIEST first, so even a duplicate that
   slipped in while the unique index was missing could not start the clock
   later. null if there is none. */
async function progressFor(db, game, day, playerId) {
    const rows = await db.collection(COLLECTION)
        .find({ game, day, playerId }, { projection: { _id: 0 } })
        .sort({ at: 1 }).limit(1).toArray();
    return rows[0] || null;
}

const timeOf = v => (v == null ? NaN : new Date(v).getTime());

/* The day's start and marks, from a row as progressFor reads it, or null if
   there is no clock to read — no row, or an untimed one (see noClock at
   rowForMove). Pure. */
function clockOf(row) {
    if (!row || row.noClock) return null;
    const at = timeOf(row.at);
    if (!Number.isFinite(at)) return null;
    const marks = {};
    const raw = row.marks || {};
    for (const k of Object.keys(raw)) {
        const t = timeOf(raw[k]);
        if (Number.isFinite(t)) marks[k] = t;
    }
    return { at, marks };
}

async function clockFor(db, game, day, playerId) {
    return clockOf(await progressFor(db, game, day, playerId));
}

/* The moves recorded for each round, from a row, as an array the length of
   the day: the stored move, or null for a round with none. Pure. The day's
   score is built from this and from nothing else. */
function movesOf(row, rounds) {
    const moves = (row && row.moves) || {};
    return Array.from({ length: rounds }, (_, i) => moves[markKey(i)] || null);
}

/* When round `round` began, in ms: the start for round 0, the round
   before's mark for the rest. NaN if it has not. */
function roundBeganAt(row, round) {
    return round === 0 ? timeOf(row.at) : timeOf(row.marks && row.marks[markKey(round - 1)]);
}

/* The row a move goes on, making an untimed one if a signed-in player's
   first move arrives with no start on file.

   That happens when the start request failed (a dropped connection as the
   first pictures came up), and refusing the move would leave the player
   unable to play the day signed in at all. Written with `noClock`, which
   clockOf reads as no clock: the day is scored, and earns no bonus, exactly
   as a day with no start always has. Only for round 0 — a later round with
   no row means the row was taken away (an administrator's reset), and the
   page should not be carrying on from where it was. $setOnInsert, so a
   start that lands at the same moment keeps its own time and no flag. */
async function rowForMove(col, ensureUniqueIndex, game, day, playerId, round) {
    let row = await col.findOne({ game, day, playerId });
    if (row || round !== 0) return row;
    await ensureIndexes(col, ensureUniqueIndex);
    try {
        await col.updateOne(
            { game, day, playerId },
            { $setOnInsert: { game, day, playerId, at: new Date(), noClock: true } },
            { upsert: true }
        );
    } catch (e) {
        if (!(e && e.code === 11000)) throw e;
    }
    return col.findOne({ game, day, playerId });
}

/* Whether the round may take its FIRST move yet: the round before must be
   over, and MIN_MOVE_MS must have passed since this one began. An untimed
   row's round 0 has no real beginning to measure from, so it is only held
   to the order. Returns null when the move may go ahead. */
function gateFor(row, round, now) {
    if (round > 0 && !(row.marks && row.marks[markKey(round - 1)])) return { error: "out-of-order" };
    if (round === 0 && row.noClock) return null;
    const began = roundBeganAt(row, round);
    if (!Number.isFinite(began)) return { error: "out-of-order" };
    const wait = began + MIN_MOVE_MS - now;
    return wait > 0 ? { error: "too-fast", retryInMs: Math.ceil(wait) } : null;
}

/* Records an Odd One Out pick: judged against the stored deal now, written
   once, never moved. `round` is the stored deal's round (the caller checks
   the number) and `tile` the index picked in it.

   The answer is one of:
     { moved: true, tile, right }     written now
     { already: true, tile, right }   the round was picked before — by a
                                      reload, another tab, another device —
                                      and THAT pick stands and is returned,
                                      so the page can show what counts
     { error: "no-start" | "out-of-order" | "too-fast" | "bad-move", ... }

   The write's filter carries every rule at once — this round not picked,
   not marked, the round before marked — so two picks racing for one round
   cannot both land, and whichever lands first is the one that counts. */
async function recordOddPick(db, ensureUniqueIndex, day, playerId, round, tile, dealRound, now) {
    const game = "odd";
    const col = db.collection(COLLECTION);
    if (!dealRound || !Number.isInteger(tile) || tile < 0 || tile >= dealRound.tiles.length) return { error: "bad-move" };
    const key = markKey(round);
    const row = await rowForMove(col, ensureUniqueIndex, game, day, playerId, round);
    if (!row) return { error: "no-start" };
    const stored = row.moves && row.moves[key];
    if (stored) return { already: true, tile: stored.tile, right: Boolean(stored.right) };
    const gate = gateFor(row, round, now);
    if (gate) return gate;

    const right = Boolean(dealRound.tiles[tile].odd);
    const at = new Date(now);
    const filter = { game, day, playerId, ["moves." + key]: { $exists: false }, ["marks." + key]: { $exists: false } };
    if (round > 0) filter["marks." + markKey(round - 1)] = { $exists: true };
    const res = await col.updateOne(filter, { $set: { ["moves." + key]: { tile, right, at }, ["marks." + key]: at } });
    if (res && res.matchedCount) return { moved: true, tile, right };
    // Lost a race: whatever landed first is the answer.
    const again = await col.findOne({ game, day, playerId });
    const won = again && again.moves && again.moves[key];
    if (won) return { already: true, tile: won.tile, right: Boolean(won.right) };
    return { error: "out-of-order" };
}

const normalise = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* Records one Guess the Maze guess: judged against the stored deal now and
   appended to the round's guesses, which the SERVER counts — `tries` used
   to be a number the page reported, and claiming one try was worth ten
   points a round. The round ends on the right name or on the `tries`th
   guess, and its mark is the moment that guess arrived.

   The answer is the round as it now stands, { guesses, done, won, tries },
   with `moved`, `already` (the round was over before this guess — the
   stored round is what counts) or `repeat` (a name already tried this
   round, which costs nothing and changes nothing); or an error as for
   recordOddPick. `name` must be one of the five offered — anything else is
   a bad move, not a wrong guess.

   Written with the round's guesses AS READ in the filter, so a guess from a
   second tab landing in between makes this one miss; it then reads again
   and has another go, a few times at most. */
async function recordGuess(db, ensureUniqueIndex, day, playerId, round, name, dealRound, tries, now) {
    const game = "guess";
    const col = db.collection(COLLECTION);
    if (!dealRound || typeof name !== "string") return { error: "bad-move" };
    const offered = dealRound.options.find(o => normalise(o) === normalise(name) && normalise(o));
    if (!offered) return { error: "bad-move" };
    const key = markKey(round);
    const view = (m, flag) => Object.assign({ [flag]: true }, {
        guesses: m.guesses.slice(), done: Boolean(m.done), won: Boolean(m.won), tries: m.guesses.length
    });

    for (let attempt = 0; attempt < 4; attempt++) {
        const row = await rowForMove(col, ensureUniqueIndex, game, day, playerId, round);
        if (!row) return { error: "no-start" };
        const cur = (row.moves && row.moves[key]) || null;
        if (cur && cur.done) return view(cur, "already");
        if (cur && cur.guesses.some(g => normalise(g) === normalise(offered))) return view(cur, "repeat");
        if (!cur) {
            const gate = gateFor(row, round, now);
            if (gate) return gate;
        }

        const won = normalise(offered) === normalise(dealRound.name);
        const guesses = (cur ? cur.guesses : []).concat(offered);
        const done = won || guesses.length >= tries;
        const at = new Date(now);
        const next = { guesses, done, won, tries: guesses.length, at: cur ? cur.at : at };
        const filter = {
            game, day, playerId,
            ["moves." + key + ".guesses"]: cur ? cur.guesses : { $exists: false },
            ["marks." + key]: { $exists: false }
        };
        if (round > 0) filter["marks." + markKey(round - 1)] = { $exists: true };
        const set = { ["moves." + key]: next };
        if (done) set["marks." + key] = at;
        const res = await col.updateOne(filter, { $set: set });
        if (res && res.matchedCount) return view(next, "moved");
    }
    return { error: "busy" };
}

/* A player's day taken away, for an administrator's reset (daily-games.js):
   the start, every mark and every move, so the day given back really does
   start again rather than finding its rounds already played. */
async function forgetDay(db, game, day, playerId) {
    const res = await db.collection(COLLECTION).deleteMany({ game, day, playerId });
    return (res && res.deletedCount) || 0;
}

/* The bonus, the day's time and each round's seconds, from a clock (as
   clockFor reads it) and which rounds the SERVER scored right. Pure, so
   the whole rule can be tested without a database.

   A round's time is measured from the mark before it, so a round with no
   mark ends the reading: nothing after it has a start to measure from
   (and the marks are only ever written in order, so there is nothing
   after it anyway). A mark stamped before the one it follows (clocks on
   two servers disagreeing by a moment) reads as zero rather than
   negative. */
function dayBonus(clock, right, now) {
    const rounds = right.length;
    if (!clock) return { bonus: 0, ms: null, roundSecs: null };
    const roundSecs = new Array(rounds).fill(null);
    let bonus = 0, prev = clock.at, last = null;
    for (let i = 0; i < rounds; i++) {
        const t = clock.marks[markKey(i)];
        if (!Number.isFinite(t)) break;
        const ms = Math.max(0, t - prev);
        roundSecs[i] = Math.floor(ms / 1000);
        if (right[i]) bonus += roundBonusFor(ms);
        prev = t;
        last = i;
    }
    const end = last === rounds - 1 ? prev : (now === undefined ? Date.now() : now);
    return { bonus, ms: Math.max(0, end - clock.at), roundSecs };
}

/* The start and move requests' bodies are a game name, a day, a word, a
   round number and a tile or one maze's name. Anything much bigger than
   that is not one, and is refused before it is parsed — the same
   shape-and-size rule the other endpoints that take a POST from the page
   keep. */
const MAX_START_BODY = 512;

module.exports = {
    COLLECTION, ROUND_BONUS_SECONDS, NO_TIME, TOTAL, MAX_START_BODY, MIN_MOVE_MS,
    totalOf, roundBonusFor, markRound, recordStart, progressFor, clockOf, clockFor, movesOf,
    recordOddPick, recordGuess, forgetDay, dayBonus, normalise
};
