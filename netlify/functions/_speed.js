/* The speed bonus on the daily games, and the clock it is measured by.

   A perfect day of Guess the Maze or Odd One Out is 50, and plenty of
   people get a perfect day — so the top of a day's board was a row of
   identical 50s, ordered by whoever happened to submit first. The bonus is
   what separates them: extra points for each round got right quickly.

   ----------------------------------------------------------------------
   WHO KEEPS THE TIME

   The server, never the page. When a signed-in player opens a day's game,
   the game says so (a POST with action "start" to its own scores endpoint),
   and the moment that arrives is written here. Then, as each round ends —
   the room named or its guesses spent, the pick made — the game says that
   too (action "mark", with the round's number), and that moment is written
   beside the start. Every one of those times is read off the server's own
   clock. The page never sends a time, so there is no number in any request
   to edit.

   FIRST WRITE WINS. One row per (game, day, player), under a unique index,
   written with $setOnInsert — so reopening the game, reloading, or opening
   it on a second device changes nothing: the clock started the first time
   and stays started. That is also what stops the obvious dodge of looking
   at the rooms, closing the window and "starting" again once you know the
   answers.

   The marks follow the same rule, and one more. A round's mark is written
   with a conditional update that only matches while that round has no
   mark yet, so once written it can never be moved. And it is only taken
   when the round before it already has one (round 0 needs the start), so
   the marks can only ever be laid down in order: a request cannot mark
   round 4 first, or mark round 2 early and round 1 after it, to squeeze
   one round's time into another.

   Signed out, nothing is recorded, because there is nobody to record it
   against. A day submitted with no start on file gets no bonus at all —
   which covers a day played signed out and then signed in for, and is
   also the fair answer: a clock that never started cannot say how fast
   anybody was. A round with no mark earns nothing either, rather than a
   guess at how long it took.

   This is exactly as trustworthy as the rest of the scoring (see the notes
   at the top of guess-scores.js and daily-scores.js): the pictures are
   public and a day can be worked out in private before it is ever opened
   signed in.

   ----------------------------------------------------------------------
   HOW BIG IT IS

   Per round, and only for a round got RIGHT — as the server scored it at
   submission, not as the page claimed. A wrong answer earns no bonus
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
const markKey = round => "r" + round;

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

/* Records the end of one round, and never moves it. One update whose filter
   carries both rules — this round not marked yet, the round before it
   marked already — so the check and the write are a single atomic step and
   two marks racing for the same round cannot both land. No upsert: a mark
   needs the start's row to go on, so a day never started gets none.

   The answer says which it was. "marked" wrote it; "already" is the rule
   working, like a second start; "out-of-order" and "no-start" are a mark
   that was refused. A round number outside the game's 0..rounds-1 is the
   caller's to refuse before this is called — see markRound. */
async function recordMark(db, game, day, playerId, round) {
    const col = db.collection(COLLECTION);
    const key = "marks." + markKey(round);
    const filter = { game, day, playerId, [key]: { $exists: false } };
    if (round > 0) filter["marks." + markKey(round - 1)] = { $exists: true };
    const res = await col.updateOne(filter, { $set: { [key]: new Date() } });
    if (res && res.matchedCount) return "marked";
    // Nothing matched: work out why, for the answer. Nothing is written here.
    const row = await col.findOne({ game, day, playerId });
    if (!row) return "no-start";
    if (row.marks && row.marks[markKey(round)]) return "already";
    return "out-of-order";
}

/* The round a mark request names, or null if it is not one of the game's
   0..rounds-1. A number only: "", null and true would all pass as 0 or 1
   through Number(), and none of them is a round. */
function markRound(value, rounds) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < rounds ? value : null;
}

/* The day's start and marks as recorded, or null if it was never started
   signed in. The EARLIEST row is read rather than any row, so even a
   duplicate that slipped in while the unique index was missing could not
   start the clock later. */
async function clockFor(db, game, day, playerId) {
    const rows = await db.collection(COLLECTION)
        .find({ game, day, playerId }, { projection: { _id: 0, at: 1, marks: 1 } })
        .sort({ at: 1 }).limit(1).toArray();
    const at = rows[0] && rows[0].at ? new Date(rows[0].at).getTime() : NaN;
    if (!Number.isFinite(at)) return null;
    const marks = {};
    const raw = (rows[0] && rows[0].marks) || {};
    for (const k of Object.keys(raw)) {
        const t = new Date(raw[k]).getTime();
        if (Number.isFinite(t)) marks[k] = t;
    }
    return { at, marks };
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

/* The start and mark requests' bodies are a game name, a day, a word and
   perhaps a round number. Anything much bigger than that is not one, and
   is refused before it is parsed — the same shape-and-size rule the other
   endpoints that take a POST from the page keep. */
const MAX_START_BODY = 512;

module.exports = {
    COLLECTION, ROUND_BONUS_SECONDS, NO_TIME, TOTAL, MAX_START_BODY,
    totalOf, roundBonusFor, markRound, recordStart, recordMark, clockFor, dayBonus
};
