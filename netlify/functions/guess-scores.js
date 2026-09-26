/* /.netlify/functions/guess-scores — the daily game's leaderboards.

   GET  ?day=YYYY-MM-DD           today's top scorers and the all-time table
   POST {day, rounds}             records the signed-in player's finished day
   POST {day, action: "start"}    starts the signed-in player's clock for the
                                  day's speed bonus — see _speed.js
   POST {day, action: "mark", round}
                                  marks the end of one round, for the same
                                  bonus — see _speed.js

   ----------------------------------------------------------------------
   How much this trusts the page

   Not much, and it is worth being precise about where the line falls,
   because a leaderboard invites exactly the kind of person who will look.

   The day's five rooms are DERIVED here, from the same seeded shuffle
   js/guess.js runs, over the same archive out of the same database. So the
   server knows what the answers were without being told. Each round's
   claimed answer is checked against that, and a round whose answer does not
   match the real maze scores nothing no matter what the page said. Points
   are then computed from POINTS below rather than read from the request —
   the client never sends a score at all.

   What that does NOT stop is a crafted request claiming the right answer on
   the first view for all five. Closing that needs the server to hand out
   the rounds and time them, which means the game's pictures and crops
   moving server-side — a much larger change, and the wrong shape for a
   thing whose whole appeal is that it is a static page with a seed. So:
   casual inflation is impossible, deliberate forgery by someone willing to
   write the request is not, and one submission per player per day is the
   backstop that keeps even that from compounding.

   Only the first submission for a day counts, and it is written with an
   upsert that will not overwrite an existing row — replaying the same day
   with a better story cannot improve it. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
/* Only dayIsOpen. This game keeps its own todayIso, seededRandom and scoring
   — it was written before _daily.js existed and its day is dealt from its own
   POINTS array — but "is this day still accepting scores" is a rule about the
   clock rather than about the game, and both games want the same answer. */
const { dayIsOpen, daySeed, isHallway, existedBefore, rangeBounds } = require("./_daily");
/* Where the boards start, and what counts as a day, from daily-scores.js so
   the two games and the combined board cut at the same place. See launchDay
   and isRealDay there. */
const { launchDay, fromLaunch, isRealDay } = require("./daily-scores");
const speed = require("./_speed");

const COLLECTION = "guess_scores";
const ROUNDS = 5;
/* Must stay in step with POINTS in js/guess.js — the page shows the number,
   this decides it. Three entries since the round became multiple choice:
   five names and three guesses, so a round cannot be won on a fourth view
   because there is no fourth view. The length is load-bearing beyond the
   scoring — scoreRounds below rejects a claimed `tries` outside it, so a day
   submitted by an older page, or a crafted one claiming four, scores that
   round nothing rather than reading past the end of this array.

   Ten a round, so a perfect day is 50. It was 100/60/30 (a 500 day) until
   just before launch; the rows scored that way are all test days from
   before launch day, which the launch cut already hides from every board
   (see launchDay in daily-scores.js), so they were left as they are rather
   than rescored. */
const POINTS = [10, 6, 3];
const BOARD_SIZE = 10;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, // A board that changes as people finish their day, cached briefly so
        // a burst of results does not become a burst of aggregations.
        "Cache-Control": statusCode === 200 ? "public, max-age=30" : "no-store"
    },
    body: JSON.stringify(data)
});

let ensured = false;
async function ensureIndexes(col) {
    if (ensured) return;
    // One row per player per day. This is the rule that makes "first
    // submission wins" enforceable by the database rather than by a
    // check-then-write race.
    //
    // Via ensureUniqueIndex, which THROWS on failure. It was a createIndex
    // with the error swallowed and `ensured` set anyway, so an index that
    // never got built was remembered as built and the rule failed open —
    // a second submission for the same day simply inserted a second row.
    await ensureUniqueIndex(col, ["day", "playerId"]);
    await col.createIndex({ day: 1, points: -1 }).catch(() => {});
    await col.createIndex({ playerId: 1 }).catch(() => {});
    ensured = true;
}

// ---------- the same day the page sees ----------

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* The local seedFrom is gone: the one caller now asks _daily.daySeed for
   its seed instead, so that a featured day is salted here exactly as it is
   in the browser. A spare copy of the hash left sitting beside it is a
   thing somebody would reach for again and, by doing so, silently opt this
   endpoint back out of the salt. */

const normalise = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* The five maze names for a day, worked out exactly as the page works them
   out. Cached on the warm container, because it costs a full read of the
   archive — but for MINUTES, not for the life of the container.

   It used to be kept for as long as the container stayed warm, which could
   be hours. So a picture added to a maze at noon split the day in two: page
   loads after the edit dealt a new five (the shuffle runs over every
   picture, so one new picture moves everything), while this container
   went on scoring against the morning's five and rejected every correct
   answer from the afternoon's players — and a cold container elsewhere,
   reading the archive fresh, did the reverse to the morning's.

   Nothing on this side can make a mid-day gallery edit harmless: the page
   and the server both deal from whatever the archive holds, and a gallery
   entry carries no timestamp that would let either of them ignore a new
   one (see existedBefore in _daily.js, which handles whole new MAZES).
   What the short life does is stop this cache being the thing that keeps
   the two sides disagreeing: within a few minutes of an edit the server is
   scoring the same deal new page loads are dealing, which is about the
   same lag as the edge cache on /rooms itself (s-maxage=60 in _cache.js).
   Morning players who finish after that are still scored against the new
   deal — the honest limit of a game dealt from a live archive, and the
   reason gallery edits are best made outside the day's busy hours. */
const ANSWER_TTL_MS = 3 * 60 * 1000;
const answerCache = { day: "", names: null, at: 0 };

async function answersFor(day) {
    if (answerCache.day === day && answerCache.names && Date.now() - answerCache.at < ANSWER_TTL_MS) {
        return answerCache.names;
    }

    const db = await getDb();
    /* tags comes back for isHallway below, and createdAt for existedBefore;
       neither is part of the answer. Worth saying because a projection is a
       list of what this function needs, and these are needed by filters. */
    const rooms = await db.collection("rooms")
        .find({}, { projection: { id: 1, name: 1, tags: 1, gallery: 1, createdAt: 1 } })
        .toArray();

    const pool = [];
    rooms.forEach(room => {
        if (!room.name || !room.id) return;
        // Exactly as js/guess.js builds its pool — a room dropped there and
        // kept here would deal one set of five and score another.
        if (isHallway(room)) return;
        // Only mazes catalogued before the day began — see existedBefore.
        if (!existedBefore(room, day)) return;
        (room.gallery || []).forEach(g => {
            if (g && g.image) pool.push({ maze: room, image: g.image });
        });
    });

    /* Ordered before the shuffle, exactly as js/guess.js orders it — see
       poolOrder there for why. Both sides read the same rooms out of the
       same collection, but neither asks Mongo for an order, and the
       shuffle's output depends entirely on the order it is handed. Sorting
       both on the same fixed key is what lets this function derive the same
       five rooms the player was shown without either side coordinating.

       Plain string comparison, not localeCompare: Node and the browser can
       disagree about collation, and that disagreement would show up as
       correct answers being rejected. */
    pool.sort((a, b) => {
        if (a.maze.id !== b.maze.id) return a.maze.id < b.maze.id ? -1 : 1;
        if (a.image !== b.image) return a.image < b.image ? -1 : 1;
        return 0;
    });

    /* THROUGH _daily.daySeed, not the bare day, so a featured day is
       salted here exactly as it is in js/daily.js. Without this the page
       deals one set of five and this checks another — see the header of
       netlify/functions/_daily.js. */
    const rand = seededRandom(daySeed(day, "guess"));
    const shuffled = pool
        .map(p => ({ p, k: rand() }))
        .sort((a, b) => a.k - b.k)
        .map(o => o.p);

    const chosen = [];
    const used = new Set();
    for (const item of shuffled) {
        if (chosen.length >= ROUNDS) break;
        if (used.has(item.maze.id)) continue;
        used.add(item.maze.id);
        chosen.push(item);
    }
    for (const item of shuffled) {
        if (chosen.length >= ROUNDS) break;
        if (!chosen.includes(item)) chosen.push(item);
    }

    answerCache.day = day;
    answerCache.names = chosen.map(c => c.maze.name);
    answerCache.at = Date.now();
    return answerCache.names;
}

/* Scores a submitted day against the real answers. Every round is checked
   on its own, so a request that is honest about four rounds and invents the
   fifth keeps the four. */
function scoreRounds(rounds, answers) {
    let points = 0, solved = 0;
    /* The per-round outcome as the SERVER decided it, not as the page
       claimed it. Stored alongside the score so a day's board can show
       everyone's grid beside their name — which is the whole of the
       head-to-head, and it works because a grid names no mazes: it says
       how a round went and nothing about what was in it.

       0 is "not solved". 1-4 is the view it was named on. */
    const grid = new Array(ROUNDS).fill(0);
    for (let i = 0; i < ROUNDS; i++) {
        const r = rounds[i];
        if (!r || !r.won) continue;
        const tries = Number(r.tries);
        if (!Number.isInteger(tries) || tries < 1 || tries > POINTS.length) continue;
        if (!answers[i] || normalise(r.answer) !== normalise(answers[i])) continue;
        points += POINTS[tries - 1];
        solved += 1;
        grid[i] = tries;
    }
    return { points, solved, grid };
}

// ---------- the ranges a board can cover ----------

/* rangeBounds now lives in _daily.js and is shared with daily-scores.js.
   This file's copy was already the calendar week from Monday; Odd One
   Out's was a rolling seven days, so the same "This week" tab covered two
   different spans in two columns side by side. See the note there. */

/* RIGHT ANSWERS FIRST, ON EVERY DAILY BOARD. Rounds answered correctly
   decide the order, and the total (points plus speed bonus) only orders
   players level on those. The bonus can be worth far more than a round (up
   to 37 a round against 10 — see _speed.js), so ranked on the total alone
   a fast day with four right would sit above a slower day with all five;
   ranked this way, speed separates players who got the same number right
   and never lifts anybody over someone who got more right. The same order
   is kept by the day board below, by board() and the combined board in
   daily-scores.js, by the Profile's places (player-profile.js), and by
   Daily.ranks in js/daily.js, which only numbers two rows as a tie when
   both their rounds right and their total match.

   One board over a span of days. Grouped per player so a month's board is
   a total rather than a list of days, and ordered by rounds right, then
   points, with fewer days winning ties — someone who scored the same in
   less play was better at it.

   SORTED BEFORE IT IS GROUPED, which is what makes `$last` mean newest.
   $group takes documents in whatever order they arrive, and without a sort
   that is Mongo's natural order — close to insertion order most of the
   time and promised by nothing — so "newest row wins the name" was really
   "some row wins the name". Day then submission time, oldest first, so the
   last one into each group is the player's most recent.

   And a final tiebreak on the player id after rounds, points and days, so
   two players level on all three come back in the same order on every read
   rather than swapping places between refreshes. The page numbers them as
   a tie either way (Daily.ranks); this only keeps the order still.

   POINTS ARE THE TOTAL — base points plus the speed bonus (see _speed.js).
   The two are summed separately and added after the group, because $sum
   reads a missing field as nothing, so a row from before the bonus simply
   adds none. What goes out as `points` is the total, since that is the
   number a board shows and Daily.ranks ties on; `base` and `bonus` go
   beside it for anything that wants the split. No time on a span's rows:
   a month of times added up says nothing a reader could use, and days that
   were never timed would count as instant. */
async function board(col, from, to, limit) {
    const rows = await col.aggregate([
        { $match: { day: { $gte: from, $lte: to } } },
        { $sort: { day: 1, at: 1 } },
        { $group: {
            _id: "$playerId",
            points: { $sum: "$points" },
            bonus: { $sum: "$bonus" },
            solved: { $sum: "$solved" },
            days: { $sum: 1 },
            // Newest row wins the name, so a Discord rename shows through
            // rather than the board keeping whatever they were first called.
            name: { $last: "$name" },
            avatar: { $last: "$avatar" }
        } },
        { $addFields: { total: speed.TOTAL } },
        { $sort: { solved: -1, total: -1, days: 1, _id: 1 } },
        { $limit: limit }
    ]).toArray();
    return rows.map(r => ({
        id: r._id, name: r.name, avatar: r.avatar,
        points: r.total, base: r.points, bonus: r.bonus || 0,
        solved: r.solved, days: r.days
    }));
}

/* One day's board: a row per player rather than a total, because it
   carries each player's grid and time.

   Ordered by rounds right, then total (see RIGHT ANSWERS FIRST above),
   then the faster time, then who submitted first, then the id so two
   identical rows cannot swap. An aggregation rather than a find, because
   the total is a sum and the time needs a fallback: a day with no time on
   file (an old row, or a day never started signed in) sorts after every
   timed one at the same total — see NO_TIME in _speed.js. */
async function dayBoard(col, match, limit) {
    return col.aggregate([
        { $match: match },
        { $addFields: { total: speed.TOTAL, msOrder: { $ifNull: ["$ms", speed.NO_TIME] } } },
        { $sort: { solved: -1, total: -1, msOrder: 1, at: 1, playerId: 1 } },
        { $limit: limit }
    ]).toArray();
}

/* A day's row as the page gets it. `points` is the total, as on every
   board; `ms` is the time taken, for the small figure beside it, and null
   when there is none to show. */
function dayRow(r) {
    return {
        id: r.playerId, name: r.name, avatar: r.avatar,
        points: speed.totalOf(r), base: r.points || 0, bonus: r.bonus || 0,
        ms: Number.isFinite(r.ms) ? r.ms : null,
        solved: r.solved,
        // Older rows predate the grid being stored; an empty one
        // simply renders as no grid rather than as a wrong one.
        grid: Array.isArray(r.grid) ? r.grid : null
    };
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed" });
    }
    const col = db.collection(COLLECTION);
    /* A missing unique index only matters to a WRITE — the board still reads
       correctly without it — so a GET carries on and anything else is
       refused rather than allowed to write a second row for the day. */
    try {
        await ensureIndexes(col);
    } catch (e) {
        console.error("guess-scores: unique index unavailable", e);
        if (event.httpMethod !== "GET") return json(503, { error: "Scores can't be saved just now. Try again in a minute." });
    }

    // ---------- read the boards ----------
    if (event.httpMethod === "GET") {
        const day = ((event.queryStringParameters || {}).day || todayIso()).slice(0, 10);
        // A real calendar day, not only the right shape — see isRealDay.
        if (!isRealDay(day)) return json(400, { error: "Bad day" });

        try {
            const week = rangeBounds("week", day);
            const month = rangeBounds("month", day);
            const all = rangeBounds("all", day);
            // Every span from launch day on; a day before it has no board.
            const launch = await launchDay(db);
            const before = Boolean(launch) && day < launch;

            /* All four boards in one request rather than one per tab. They
               are small, they are read together, and a results panel whose
               tabs each cost a round trip feels broken in a way that four
               cheap aggregations do not. */
            const [todayRows, weekRows, monthRows, allRows] = await Promise.all([
                // The day's own board keeps its per-player rows rather than
                // being grouped, because it carries the grid for the
                // head-to-head and there is nothing to sum over one day.
                before ? [] : dayBoard(col, { day }, BOARD_SIZE),
                board(col, fromLaunch(week.from, launch), week.to, BOARD_SIZE),
                board(col, fromLaunch(month.from, launch), month.to, BOARD_SIZE),
                board(col, fromLaunch(all.from, launch), all.to, BOARD_SIZE)
            ]);

            // "date" is the day these are FOR; "day" is the board itself.
            // Named for how the page reads them, not for how they are stored.
            return json(200, {
                date: day,
                weekFrom: week.from,
                monthFrom: month.from,
                day: todayRows.map(dayRow),
                week: weekRows,
                month: monthRows,
                allTime: allRows
            });
        } catch (e) {
            return json(500, { error: "Could not read the scoreboard" });
        }
    }

    // ---------- record a finished day ----------
    if (event.httpMethod === "POST") {
        /* The moment the request arrived, taken before anything slow — the
           archive read in answersFor can take a second or two, and that is
           the server's time, not the player's. */
        const arrived = Date.now();
        const player = playerFrom(event);
        // Not an error worth shouting about: the page submits optimistically
        // and simply is not listed when signed out.
        if (!player) return json(401, { error: "Not signed in" });

        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }

        const day = String(body.day || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { error: "Bad day" });
        // Today, or the day that ended in the last few minutes — see
        // dayIsOpen in _daily.js for why the grace period exists. A day that
        // has not happened cannot have been played.
        if (!dayIsOpen(day)) return json(400, { error: "That day is not open" });

        /* ---------- the day's clock starting ----------

           Sent by the page when a signed-in player first goes into a room.
           Recorded once and never moved (see _speed.js); every later call
           is a no-op, so it needs no rate limit of its own — the most any
           number of calls can ever write is one row per player per open
           day. The answer says nothing about the time, because nothing in
           the game shows one. */
        if (body.action === "start") {
            if (String(event.body || "").length > speed.MAX_START_BODY) return json(413, { error: "Too large" });
            try {
                await speed.recordStart(db, ensureUniqueIndex, "guess", day, player.id);
            } catch (e) {
                console.error("guess-scores: could not record a start", e);
                return json(503, { started: false });
            }
            return json(200, { started: true });
        }

        /* ---------- a round ending ----------

           Sent by the page the moment a room is named or its guesses run
           out. Written once, never moved, and only in order — each round
           needs the one before it marked, and round 0 needs the start; see
           recordMark in _speed.js. Like the start, the most any number of
           calls can write is one mark per round, so no rate limit of its
           own. The answer names no time. */
        if (body.action === "mark") {
            if (String(event.body || "").length > speed.MAX_START_BODY) return json(413, { error: "Too large" });
            const round = speed.markRound(body.round, ROUNDS);
            if (round == null) return json(400, { error: "Bad round" });
            let outcome;
            try {
                outcome = await speed.recordMark(db, "guess", day, player.id, round);
            } catch (e) {
                console.error("guess-scores: could not record a mark", e);
                return json(503, { marked: false });
            }
            if (outcome === "marked") return json(200, { marked: true });
            if (outcome === "already") return json(200, { marked: false, reason: "already" });
            return json(409, { marked: false, reason: outcome });
        }

        if (!Array.isArray(body.rounds) || body.rounds.length !== ROUNDS) {
            return json(400, { error: "Bad rounds" });
        }

        let answers;
        try {
            answers = await answersFor(day);
        } catch (e) {
            return json(500, { error: "Could not check the day" });
        }

        const { points, solved, grid } = scoreRounds(body.rounds, answers);

        /* The speed bonus, from the start and the round marks on file —
           see _speed.js. Only the rounds scored right just above earn any;
           a round with no mark earns none. No start on file is no bonus,
           and so is a clock that cannot be read just now: a day that fails
           to record over a lookup would be worse than a day recorded
           without its extra points. */
        let clock = null;
        try {
            clock = await speed.clockFor(db, "guess", day, player.id);
        } catch (e) {
            console.error("guess-scores: could not read the day's clock", e);
        }
        const { bonus, ms, roundSecs } = speed.dayBonus(clock, grid.map(g => g > 0), arrived);

        try {
            await col.insertOne({
                day,
                playerId: player.id,
                name: player.name,
                avatar: player.avatar,
                // `points` is still the base score, as it always was; the
                // boards add `bonus` to it. `ms` (the whole day) and
                // `roundSecs` (each round) only when there was a clock.
                points,
                bonus,
                ...(ms == null ? {} : { ms, roundSecs }),
                solved,
                grid,
                at: new Date().toISOString()
            });
        } catch (e) {
            // Duplicate key: this player already recorded this day. That is
            // the rule working, not a failure — tell them plainly and leave
            // the first score standing.
            if (e && e.code === 11000) return json(200, { recorded: false, reason: "already", points });
            return json(500, { error: "Could not record the score" });
        }

        return json(200, { recorded: true, points, solved });
    }

    return { statusCode: 405, body: "" };
};
