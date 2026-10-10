/* /.netlify/functions/guess-scores — the daily game's leaderboards.

   GET  ?day=YYYY-MM-DD           today's top scorers and the all-time table
   GET  ?deal=1[&day=]            the day's deal to play: the server's today
                                  unless a still-open day is named — the five
                                  pictures and their five names each, and
                                  nothing that says which name is right (see
                                  _deal.js); for a signed-in player, their
                                  guesses so far too
   POST {day, action: "start"}    starts the signed-in player's clock for the
                                  day's speed bonus — see _speed.js
   POST {day, action: "move", round, guess}
                                  one guess, judged against the stored deal
                                  now, recorded and COUNTED
   POST {day}                     records the signed-in player's finished
                                  day, scored from the guesses recorded

   Every POST is a signed-in player's with a nickname, as in
   daily-scores.js; the signed-out half of each (unrecorded verdicts, the
   opening room handed out, scoreClaim) was unreachable behind that and
   was taken out (10 Oct 2026).

   ----------------------------------------------------------------------
   How much this trusts the page

   Not much, and it is worth being precise about where the line falls,
   because a leaderboard invites exactly the kind of person who will look.

   The day is dealt HERE, once, and stored (_deal.js). The page is sent the
   five pictures and the five names offered for each, and is only told
   which name was right when a round is over. Each guess is sent as it is
   made and judged against the stored deal then; for a signed-in player it
   is written down with the time it arrived, and the SERVER counts the
   guesses a round took (_speed.js). The day's score is built from those
   records and from nothing in the finishing request.

   It used to be the other way round: the page dealt the day from a public
   seed, with every answer in it, and reported at the end what each round's
   answer was and how many tries it took. So a crafted request could claim
   the right answer on the first view for all five — ten points a round for
   writing "1" — and the speed marks could be laid down in a burst and the
   answers chosen afterwards.

   What used to be possible was learning the answers first by playing the
   day signed out, and then playing it signed in; signed out nothing is
   answered now (10 Oct 2026). Only the first submission for a day counts,
   and a second is answered with the first's score — so nothing can be
   compounded, or used to check answers. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom, livePlayerFrom, publicName } = require("./_player");
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson, BOARD_CDN_CACHE } = require("./_cache");
/* dayIsOpen and rangeBounds are rules about the clock and the calendar
   rather than about the game, and both games want the same answers. The
   deal itself is _deal.js's. */
const { dayIsOpen, dayClosesAt, rangeBounds } = require("./_daily");
/* Where the boards start, and what counts as a day, from daily-scores.js so
   the two games and the combined board cut at the same place. See launchCut
   and isRealDay there. */
const { launchCut, afterLaunch, fromLaunch, isRealDay, boardDay, filedScore,
    practiceOf, practiceReply, pastPractice, boardReply, freshFor, plainBoard, nonCanonical, nickedOnly } = require("./daily-scores");
const speed = require("./_speed");
const deals = require("./_deal");
// No raw Discord id or nicknamed avatar on a public board (29 Sept 2026).
const { publicLists } = require("./_publicid");
// The ban gate and the boards' ban filter (29 Sept 2026).
const { writeRefusal, withoutBanned } = require("./_bans");

const COLLECTION = "guess_scores";
const ROUNDS = 5;
/* Must stay in step with POINTS in js/guess.js — the page shows the number,
   this decides it. Three entries since the round became multiple choice:
   five names and three guesses, so a round cannot be won on a fourth view
   because there is no fourth view. The length is load-bearing beyond the
   scoring: it is TRIES, the number of guesses the server lets a round take
   before it is over (recordGuess in _speed.js), so a round can never be
   counted past the end of this array. tools/check-daily-parity.js checks
   the page's copy against this one.

   Ten a round, so a perfect day is 50. It was 100/60/30 (a 500 day) until
   just before launch; the rows scored that way are all test days from
   before launch day, which the launch cut already hides from every board
   (see launchCut in daily-scores.js), so they were left as they are rather
   than rescored. */
const POINTS = [10, 6, 3];
const TRIES = POINTS.length;
const BOARD_SIZE = 10;
// Spare rows past the top ten, cut back after the banned and the nickless
// are taken out — see BOARD_READ in daily-scores.js (3 Oct 2026).
const BOARD_READ = BOARD_SIZE + 40;

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, // A board that changes as people finish their day, cached briefly so
        // a burst of results does not become a burst of aggregations.
        "Cache-Control": statusCode === 200 ? "public, max-age=30" : "no-store"
    },
    body: JSON.stringify(data)
});

/* Never cached, anywhere: a deal carrying one player's guesses, or one
   guess's verdict, must not be handed to the next person by a cache. */
const privateJson = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "private, no-store" },
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

/* The answer cache that lived here (answersFor) is gone with the re-deal it
   was coping with. The day's five are dealt once and stored by _deal.js,
   so a picture added at noon changes tomorrow and not the afternoon — the
   split day that cache could only shorten to a few minutes cannot happen. */

/* A day's outcome, from what the server recorded round by round (movesOf in
   _speed.js). The grid is stored alongside the score so a day's board can
   show everyone's grid beside their name — which is the whole of the
   head-to-head, and it works because a grid names no mazes: it says how a
   round went and nothing about what was in it.

   0 is "not solved"; 1-3 is the view it was named on, which is the count of
   guesses the SERVER received for it, never a number the page reported.
   `complete` says whether every round is over — a day is only filed once
   it is. */
function scoreRecorded(moves) {
    let points = 0, solved = 0;
    const grid = moves.map(m => {
        if (!m || !m.won) return 0;
        const tries = m.guesses.length;
        if (tries < 1 || tries > POINTS.length) return 0;
        points += POINTS[tries - 1];
        solved += 1;
        return tries;
    });
    return { points, solved, grid, complete: moves.every(m => m && m.done) };
}

/* scoreClaim lived here: a day played signed out, filed from the guesses
   the page sent once the player had signed in. Taken out with signed-out
   play (10 Oct 2026), as in daily-scores.js, where a signed-in player
   with nothing recorded could also be filed on guesses of their choosing.
   A day with nothing recorded is unfinished. */

// What the page is told about a finished round: the maze it was, so the
// round can name it and link to it. Never sent for a round still open.
const answerOf = r => ({ id: r.id, name: r.name, slug: r.slug || null, creator: r.creator || "" });

/* A signed-in player's recorded guesses, for the page reopening the day:
   each round's guesses and whether it is over, and the answer for the
   rounds that are. */
function progressView(dealRounds, moves) {
    return moves.filter(Boolean).map((m, i) => ({
        guesses: m.guesses.map(name => ({ name, correct: name === dealRounds[i].name })),
        done: Boolean(m.done),
        won: Boolean(m.won),
        answer: m.done ? answerOf(dealRounds[i]) : null
    }));
}

// ---------- the ranges a board can cover ----------

/* rangeBounds now lives in _daily.js and is shared with daily-scores.js.
   This file's copy was already the calendar week from Monday; Odd One
   Out's was a rolling seven days, so the same "This week" tab covered two
   different spans in two columns side by side. See the note there. */

/* RIGHT ANSWERS FIRST, ON EVERY DAILY BOARD. Rounds answered correctly
   decide the order, and the total (points plus speed bonus) only orders
   players level on those. The bonus can be worth far more than a round (up
   to 36 a round against 10 — see _speed.js), so ranked on the total alone
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
async function board(col, from, to, limit, cut, only = {}) {
    const rows = await col.aggregate([
        // afterLaunch: nothing submitted before the launch instant — see
        // launchCut in daily-scores.js.
        { $match: { day: { $gte: from, $lte: to }, ...afterLaunch(cut), ...only } },
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
        const params = event.queryStringParameters || {};
        // One address per board — see nonCanonical in daily-scores.js.
        const odd = nonCanonical(event, params, ["game"]);
        if (odd) return odd;
        if (params.deal === "1") return dealReply(db, event, params);

        const day = (params.day || todayIso()).slice(0, 10);
        // A real calendar day, not only the right shape — see isRealDay —
        // and one a board could hold (boardDay, 2 Oct 2026: every real day
        // was its own edge cache key).
        if (!boardDay(day)) return json(400, { error: "Bad day" });

        // The player's own read after a submit, or sent to the cached board
        // — see BOARD_VARY in daily-scores.js (1 Oct 2026).
        let fresh = false;
        if (params.mine !== undefined) {
            try { fresh = await freshFor(db, event, COLLECTION, { day }); } catch (e) { fresh = false; }
            if (!fresh) return plainBoard(event, params);
        }

        let launch = null;
        try {
            const week = rangeBounds("week", day);
            const month = rangeBounds("month", day);
            const all = rangeBounds("all", day);
            // Every span from launch day on, and every row from the launch
            // instant on (launchCut); a day before it has no board.
            launch = await launchCut(db);
            // Nicknamed players only, before the cut: see nickedOnly in daily-scores.js.
            const only = await nickedOnly(db);
            const before = Boolean(launch) && day < launch.day;

            /* All four boards in one request rather than one per tab. They
               are small, they are read together, and a results panel whose
               tabs each cost a round trip feels broken in a way that four
               cheap aggregations do not. */
            const [todayRows, weekRows, monthRows, allRows] = await Promise.all([
                // The day's own board keeps its per-player rows rather than
                // being grouped, because it carries the grid for the
                // head-to-head and there is nothing to sum over one day.
                before ? [] : dayBoard(col, { day, ...afterLaunch(launch), ...only }, BOARD_READ),
                board(col, fromLaunch(week.from, launch), week.to, BOARD_READ, launch, only),
                board(col, fromLaunch(month.from, launch), month.to, BOARD_READ, launch, only),
                board(col, fromLaunch(all.from, launch), all.to, BOARD_READ, launch, only)
            ]);

            /* The public id in place of the Discord one on every row, and
               no avatar for a player with a nickname (29 Sept 2026) — one
               nickname read for all four lists. See _publicid.js. */
            // Banned accounts' rows off first, while the ids are still the
            // raw ones (29 Sept 2026; withoutBanned in _bans.js).
            const [bDay, bWeek, bMonth, bAll] = await publicLists(db,
                (await withoutBanned(db, [todayRows.map(dayRow), weekRows, monthRows, allRows])).map(l => l.slice(0, BOARD_SIZE)));

            // "date" is the day these are FOR; "day" is the board itself.
            // Named for how the page reads them, not for how they are stored.
            /* Through cachedJson and BOARD_CDN_CACHE, as Odd One Out's board
               and the combined one are (30 Sept 2026). This was the one
               board still going out "public, max-age=30", so the BROWSER
               kept it for half a minute: the Leaderboards window reopened
               straight after a day was filed showed the board from before
               it, for Guess the Maze only. The browser now revalidates and
               the edge holds it fifteen seconds, like the others. */
            // The spans' first days clipped to launch day, as the queries
            // are, so launch week says "Since 3 October" (30 Sept 2026).
            return boardReply(cachedJson(event, {
                date: day,
                weekFrom: fromLaunch(week.from, launch),
                monthFrom: fromLaunch(month.from, launch),
                day: bDay,
                week: bWeek,
                month: bMonth,
                allTime: bAll
            }, { cdn: BOARD_CDN_CACHE }), fresh);
        } catch (e) {
            console.error("guess-scores: board read failed", e);
            return json(500, { error: "Could not read the scoreboard" });
        }
    }

    // ---------- record a finished day ----------
    if (event.httpMethod === "POST") {
        /* The moment the request arrived, taken before anything slow — a
           database read can take a second or two, and that is the server's
           time, not the player's. */
        const arrived = Date.now();
        const player = playerFrom(event);

        // Refused before the parse — see MAX_FINISH_BODY in _speed.js.
        if (String(event.body || "").length > speed.MAX_FINISH_BODY) return privateJson(413, { error: "Too large" });
        let body;
        try {
            body = JSON.parse(event.body || "{}");
        } catch (e) {
            return json(400, { error: "Invalid request body" });
        }
        // `null` parses cleanly and then has nothing to read a field off.
        if (!body || typeof body !== "object") return json(400, { error: "Invalid request body" });

        const day = String(body.day || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { error: "Bad day" });
        // Today, or the day that ended in the last few minutes — see
        // dayIsOpen in _daily.js for why the grace period exists. A day that
        // has not happened cannot have been played.
        //
        // Except a finishing request for a closed day whose guesses were
        // all recorded before it closed — see LATE FILING below, and the
        // same rule in daily-scores.js.
        const open = dayIsOpen(day);
        if (!open && body.action !== undefined) return json(400, { error: "That day is not open" });

        /* BANNED, AND THE REJECTED NICKNAME (29 Sept 2026; see _bans.js and
           the same gate in daily-scores.js). Every POST — a guess, a start,
           a finished day — is 403 { error, banned } for a banned account or
           network, and 403 { error, nickRequired: true } for a player whose
           nickname the admins have rejected, until they choose another. */
        // And signed in with a nickname, or not at all (4 Oct 2026, the owner's;
        // see THE DAILY GAMES ARE FOR PLAYERS WITH A NICKNAME in _bans.js).
        // So past this line there is always a `player` (10 Oct 2026).
        const refusal = await writeRefusal(db, event, player ? player.id : null, { game: true, daily: true });
        if (refusal) return refusal;

        // Practice time, as in daily-scores.js (PRACTICE BEFORE LAUNCH in
        // _speed.js; 30 Sept 2026).
        const practice = await practiceOf(db, day, arrived);

        /* ---------- one guess ----------

           Sent by the page the moment a name is pressed: the page no longer
           knows which of the five is right, so it has to ask. Judged against
           the stored deal now, and written down and COUNTED — once per name,
           three at most, in order, the round's first no sooner than
           MIN_MOVE_MS into it (recordGuess in _speed.js) — and the day is
           later scored from those records. The answer is only told once the
           round is over.

           NO UNRECORDED VERDICTS (10 Oct 2026). A signed-out guess used to
           be answered and not stored, with the page saying when it was its
           last (`final`) to be told the maze — the cheapest answer check on
           the site, fenced by refusing `anon` from a signed-in request and
           by a per-network cap. All of that went with signed-out play: a
           guess is a signed-in player's, and recorded. An `anon`, `final`
           or `replay` a page from before still sends is ignored. */
        if (body.action === "move") {
            if (String(event.body || "").length > speed.MAX_START_BODY) return privateJson(413, { error: "Too large" });
            const round = speed.markRound(body.round, ROUNDS);
            if (round == null) return privateJson(400, { error: "Bad round" });
            let deal;
            try {
                deal = await deals.dealFor(db, ensureUniqueIndex, "guess", day);
            } catch (e) {
                console.error("guess-scores: could not read the day's deal", e);
                return privateJson(503, { error: "The day could not be read just now" });
            }
            const dealt = deal.rounds[round];
            const guess = typeof body.guess === "string" ? body.guess : "";
            const offered = dealt && speed.optionFor(dealt.options, guess);
            if (!offered) return privateJson(400, { error: "Bad move" });

            let outcome;
            try {
                // A guess on a practice run the cut has passed: set aside,
                // and the day starts afresh — see the same step in
                // daily-scores.js.
                if (practice.cut && !practice.now) {
                    const row = await speed.progressFor(db, "guess", day, player.id);
                    if (pastPractice(practice, row)) {
                        await speed.dropPractice(db, "guess", day, player.id, row);
                        return privateJson(409, { reason: "practice-over" });
                    }
                }
                outcome = await speed.recordGuess(db, ensureUniqueIndex, day, player.id, round, offered, dealt, TRIES, arrived);
            } catch (e) {
                console.error("guess-scores: could not record a guess", e);
                return privateJson(503, { error: "The guess could not be recorded just now" });
            }
            if (outcome.error === "too-fast") return privateJson(429, { reason: "too-fast", retryInMs: outcome.retryInMs });
            if (outcome.error === "bad-move") return privateJson(400, { error: "Bad move" });
            if (outcome.error) return privateJson(outcome.error === "busy" ? 503 : 409, { reason: outcome.error });
            return privateJson(200, {
                recorded: true,
                already: Boolean(outcome.already),
                repeat: Boolean(outcome.repeat),
                guesses: outcome.guesses.map(name => ({ name, correct: name === dealt.name })),
                done: outcome.done,
                won: outcome.won,
                answer: outcome.done ? answerOf(dealt) : null,
                next: outcome.done ? deals.nextRound("guess", deal.rounds, round, day) : null,
                // Practice time, so a day dealt before the cut and played
                // after it is not carded as practice — see the same reply
                // in daily-scores.js (1 Oct 2026).
                ...(practice.now ? { practiceUntil: practice.cut.at } : {})
            });
        }

        // "mark" — sent by a page from before guesses were judged one at a
        // time — and anything else unknown is refused rather than ignored.
        if (body.action !== undefined && body.action !== "start") return json(400, { error: "Unknown action" });

        /* The start's reply carries room 1's picture and names (`next`),
           which the deal reply no longer hands out before the day has
           started — ONE ROUND AT A TIME in _deal.js (30 Sept 2026). (Handed
           to a signed-out start too, unrecorded, until 10 Oct 2026.) */
        const openingRound = async () => {
            try {
                const deal = await deals.dealFor(db, ensureUniqueIndex, "guess", day);
                return deals.nextRound("guess", deal.rounds, -1, day);
            } catch (e) {
                console.error("guess-scores: could not read the day's deal for its first room", e);
                return null;
            }
        };

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
                // A practice run from before the cut is set aside first.
                if (practice.cut && !practice.now) {
                    const row = await speed.progressFor(db, "guess", day, player.id);
                    if (pastPractice(practice, row)) await speed.dropPractice(db, "guess", day, player.id, row);
                    // The page's `practised: true` is no longer read — see
                    // the same step in daily-scores.js (10 Oct 2026).
                }
                await speed.recordStart(db, ensureUniqueIndex, "guess", day, player.id);
            } catch (e) {
                console.error("guess-scores: could not record a start", e);
                return json(503, { started: false });
            }
            return privateJson(200, { started: true, next: await openingRound() });
        }

        /* ---------- the finished day ----------

           A day already on file is answered with THAT row's score, before
           anything in this request is read. The reply used to carry the
           points just computed from the request even for a duplicate, which
           made a second submission a free answer checker. */
        let filed;
        try {
            filed = await col.findOne({ day, playerId: player.id });
            // Filed before the cut by an older server: gives way to the
            // real day (see daily-scores.js).
            if (filed && pastPractice(practice, filed)) {
                await speed.notePractised(db, "guess", day, player.id, "filed");
                await col.deleteOne({ _id: filed._id, at: filed.at });
                filed = null;
            }
        } catch (e) {
            return json(500, { error: "Could not check the day" });
        }
        if (filed) return privateJson(200, alreadyReply(filed));

        /* Scored from the guesses RECORDED as they were made, and nothing
           in this request counts: a day with a room still open — or nothing
           recorded at all — is not filed yet. (A day with nothing recorded
           used to read the request's own guesses, scoreClaim, for a day
           played signed out; gone 10 Oct 2026.) */
        /* LATE FILING, as in daily-scores.js, where the reasoning is: a
           closed day is still filed if every room was recorded and the last
           guess was stamped before the day closed (dayClosesAt in
           _daily.js), because the score is built from those stamps and not
           from when this request arrived. A day with a room still open is
           refused once closed — finally (400), not as "unfinished". */
        const closed = () => json(400, { error: "That day is not open" });
        let scored, clock = null, practiceRun = practice.now, practised = false;
        try {
            let row = await speed.progressFor(db, "guess", day, player.id);
            // Before the deal, so a closed day with nothing recorded never
            // causes one to be dealt.
            if (!open && !(speed.lastMarkAt(row) <= dayClosesAt(day))) return closed();
            const deal = await deals.dealFor(db, ensureUniqueIndex, "guess", day);
            if (!deal.rounds.length) return json(409, { recorded: false, reason: "no-deal" });
            /* Finished after the cut, but begun before it: still practice —
               only when every room of the practice row is over. One with a
               room still open is a run left behind, and is set aside — see
               the same step in daily-scores.js (1 Oct 2026; no longer filed
               as a claim after it, 10 Oct 2026). */
            if (pastPractice(practice, row)) {
                if (speed.movesOf(row, deal.rounds.length).every(m => m && m.done)) practiceRun = true;
                else { await speed.dropPractice(db, "guess", day, player.id, row); row = null; }
            }
            scored = scoreRecorded(speed.movesOf(row, deal.rounds.length));
            if (!scored.complete) return open ? privateJson(409, { recorded: false, reason: "unfinished" }) : closed();
            clock = speed.clockOf(row);
            // Practised before the cut: filed with no clock, so no bonus —
            // see the same step in daily-scores.js (1 Oct 2026).
            if (!practiceRun && practice.cut && !practice.now) {
                practised = await speed.practisedOn(db, "guess", day, player.id);
                if (practised) clock = null;
            }
        } catch (e) {
            console.error("guess-scores: could not check the day", e);
            return json(500, { error: "Could not check the day" });
        }
        const { points, solved, grid } = scored;

        /* The speed bonus, from the start and the marks on file — see
           _speed.js. Only rooms named right when they were played earn any;
           a round with no mark earns none. No clock — an untimed day, or one
           practised first — is no bonus rather than a day that fails to record. */
        const { bonus, ms, roundSecs } = speed.dayBonus(clock, grid.map(g => g > 0), arrived);

        // A practice run: answered, not filed (see daily-scores.js).
        if (practiceRun) return privateJson(200, practiceReply(scored, bonus, practice.cut));

        /* The name the board shows: their nickname if they have chosen one,
           read from the players row rather than the session (publicName in
           _player.js; 28 Sept 2026), else their Discord name. */
        const shown = await publicName(db, player);

        try {
            await col.insertOne({
                day,
                playerId: player.id,
                name: shown,
                avatar: player.avatar,
                // `points` is still the base score, as it always was; the
                // boards add `bonus` to it. `ms` (the whole day) and
                // `roundSecs` (each round) only when there was a clock.
                points,
                bonus,
                ...(ms == null ? {} : { ms, roundSecs }),
                solved,
                grid,
                // (`claimed: true` went with scoreClaim, 10 Oct 2026.)
                ...(practised ? { practised: true } : {}),
                at: new Date().toISOString()
            });
        } catch (e) {
            // Duplicate key: a submission raced this one and landed first.
            // The rule working, not a failure — and the answer is the row
            // that stands, not what was just computed (see alreadyReply).
            if (e && e.code === 11000) {
                const first = await col.findOne({ day, playerId: player.id }).catch(() => null);
                return privateJson(200, first ? alreadyReply(first) : { recorded: false, reason: "already" });
            }
            return json(500, { error: "Could not record the score" });
        }

        return privateJson(200, { recorded: true, points, bonus, solved, ...(practised ? { practised: true } : {}) });
    }

    return json(405, { error: "Method not allowed" });
};

// The answer to a day already on file: the stored row's own figures.
function alreadyReply(row) {
    return { recorded: false, reason: "already", points: row.points || 0, bonus: row.bonus || 0, solved: row.solved || 0,
        ...(row.practised ? { practised: true } : {}) };
}

/* The page's deal for a day — the five pictures, their five names each, and
   where to cut — and, for a signed-in player, their guesses so far and
   whether the day is filed. The day is the server's: its today, or a named
   day only while dayIsOpen still takes it, so a device clock set forward
   gets nothing. Public, and never cached. See dealReply in daily-scores.js,
   which is the same thing for Odd One Out. */
async function dealReply(db, event, params) {
    const day = params.day ? String(params.day).slice(0, 10) : todayIso();
    if (!isRealDay(day) || !dayIsOpen(day)) {
        return privateJson(404, { error: "That day is not open", today: todayIso(), now: Date.now() });
    }
    let deal;
    try {
        deal = await deals.dealFor(db, ensureUniqueIndex, "guess", day);
    } catch (e) {
        console.error("guess-scores: could not deal the day", e);
        return privateJson(503, { error: "The day could not be dealt just now" });
    }
    // Not a session ended everywhere (4 Oct 2026, the bug scan): see livePlayerFrom.
    const player = await livePlayerFrom(db, event);
    const practice = await practiceOf(db, day, Date.now());
    let progress = null, filed = false, score = null, practiceOver = false;
    // Only the rooms this player has reached, and none signed out or
    // before the start — ONE ROUND AT A TIME in _deal.js.
    let reached = 0;
    if (player) {
        try {
            let row = await speed.progressFor(db, "guess", day, player.id);
            // A practice run the cut has passed is offered afresh, as in
            // dealReply in daily-scores.js.
            if (pastPractice(practice, row)) { row = null; practiceOver = true; }
            progress = progressView(deal.rounds, speed.movesOf(row, deal.rounds.length));
            let onFile = await db.collection(COLLECTION).findOne({ day, playerId: player.id },
                { projection: { _id: 1, points: 1, bonus: 1, solved: 1, at: 1, practised: 1 } });
            if (pastPractice(practice, onFile)) onFile = null;
            filed = Boolean(onFile);
            // The filed day's base, bonus and rounds right, for the results
            // card on a reload — see filedScore in daily-scores.js.
            score = filedScore(onFile);
            reached = deals.reachedOf("guess", row, deal.rounds.length, filed);
        } catch (e) {
            progress = null;
        }
    }
    return privateJson(200, {
        day, today: todayIso(), now: Date.now(),
        // Picture addresses, never the stored references — see _deal.js.
        rounds: deals.publicRounds("guess", deal.rounds, day, reached),
        progress, filed, score,
        // Practice time, and a practice run set aside — see dealReply in
        // daily-scores.js.
        ...(practice.now ? { practiceUntil: practice.cut.at } : {}),
        ...(practiceOver ? { practiceOver: true } : {})
    });
}

// For the tests: the pure scoring (scoreClaim went with signed-out play).
module.exports.scoreRecorded = scoreRecorded;

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("guess-scores", exports.handler);
