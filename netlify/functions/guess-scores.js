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
                                  now; recorded and COUNTED for a signed-in
                                  player, only answered for anybody else
   POST {day[, rounds]}           records the signed-in player's finished
                                  day, scored from the guesses recorded —
                                  `rounds` is read only for a day played
                                  signed out (see scoreClaim)

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

   What is still possible is learning the answers first by playing the day
   signed out, and then playing it signed in. Only the first submission for
   a day counts, and a second is answered with the first's score — so even
   that cannot be compounded, or used to check answers. */
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
    practiceOf, practiceReply, pastPractice, boardReply, freshFor, plainBoard } = require("./daily-scores");
const { clientNet } = require("./_net");
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

/* A day played SIGNED OUT, being filed now the player has signed in: the
   "Sign in with Discord to be listed" promise.

   Nothing was recorded while they played, so the page's own record of the
   guesses is all there is. Each round's guesses are judged against the
   stored deal in the order made, up to TRIES, and must be names that round
   offered; the round is won on the first right one. Filed with no bonus —
   no clock ran — and only when nothing at all was recorded for the day (see
   the POST). It buys nothing playing the day signed out first and then
   signed in would not, and earns less. */
function scoreClaim(dealRounds, rounds) {
    if (!Array.isArray(rounds) || rounds.length !== dealRounds.length) return null;
    const moves = [];
    for (let i = 0; i < dealRounds.length; i++) {
        const sent = rounds[i] && Array.isArray(rounds[i].guesses) ? rounds[i].guesses.slice(0, TRIES) : null;
        if (!sent) return null;
        const guesses = [];
        let won = false;
        for (const g of sent) {
            // The option the page meant, judged as itself — see normalise
            // in _speed.js for why the loose reading only finds it.
            const opt = typeof g === "string" ? speed.optionFor(dealRounds[i].options, g) : undefined;
            if (!opt) return null;
            guesses.push(opt);
            if (opt === dealRounds[i].name) { won = true; break; }
        }
        moves.push({ guesses, won, done: won || guesses.length >= TRIES });
    }
    /* Only a FINISHED day is a claim. Five empty guess lists passed every
       check above — each is an array, and no name in it is one the round
       did not offer — and were filed as a finished day scoring nothing:
       a row that took the player's one submission for the day, so the day
       they then actually played signed in was answered "already", 0 points.
       scoreRecorded says whether every room is over; a claim that is not
       is no claim. Odd One Out's scoreClaim needs a pick per round for the
       same reason. */
    const scored = scoreRecorded(moves);
    // `moves`, as judged, for recordClaimed in _speed.js (1 Oct 2026).
    return scored.complete ? { ...scored, moves: moves.map(m => ({ ...m, tries: m.guesses.length })) } : null;
}

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
async function board(col, from, to, limit, cut) {
    const rows = await col.aggregate([
        // afterLaunch: nothing submitted before the launch instant — see
        // launchCut in daily-scores.js.
        { $match: { day: { $gte: from, $lte: to }, ...afterLaunch(cut) } },
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
            const before = Boolean(launch) && day < launch.day;

            /* All four boards in one request rather than one per tab. They
               are small, they are read together, and a results panel whose
               tabs each cost a round trip feels broken in a way that four
               cheap aggregations do not. */
            const [todayRows, weekRows, monthRows, allRows] = await Promise.all([
                // The day's own board keeps its per-player rows rather than
                // being grouped, because it carries the grid for the
                // head-to-head and there is nothing to sum over one day.
                before ? [] : dayBoard(col, { day, ...afterLaunch(launch) }, BOARD_READ),
                board(col, fromLaunch(week.from, launch), week.to, BOARD_READ, launch),
                board(col, fromLaunch(month.from, launch), month.to, BOARD_READ, launch),
                board(col, fromLaunch(all.from, launch), all.to, BOARD_READ, launch)
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
        // Except a signed-in player's finishing request for a closed day
        // whose guesses were all recorded before it closed — see LATE
        // FILING below, and the same rule in daily-scores.js.
        const open = dayIsOpen(day);
        if (!open && (body.action !== undefined || !player)) return json(400, { error: "That day is not open" });

        /* BANNED, AND THE REJECTED NICKNAME (29 Sept 2026; see _bans.js and
           the same gate in daily-scores.js). Every POST — a guess, a start,
           a finished day, signed out included (judged by the network) — is
           403 { error, banned } for a banned account or network, and 403
           { error, nickRequired: true } for a signed-in player whose
           nickname the admins have rejected, until they choose another. */
        // And signed in with a nickname, or not at all (4 Oct 2026, the owner's;
        // see THE DAILY GAMES ARE FOR PLAYERS WITH A NICKNAME in _bans.js).
        const refusal = await writeRefusal(db, event, player ? player.id : null, { game: true, daily: true });
        if (refusal) return refusal;

        // Practice time, as in daily-scores.js (PRACTICE BEFORE LAUNCH in
        // _speed.js; 30 Sept 2026) — signed out too, so the answers can say
        // `practice` (NO SPEED BONUS AFTER PRACTICE; 1 Oct 2026).
        const practice = await practiceOf(db, day, arrived);
        const practiceMark = practice.now ? { practice: practice.cut.at } : {};

        /* ---------- one guess ----------

           Sent by the page the moment a name is pressed, by EVERYBODY: the
           page no longer knows which of the five is right, so it has to ask.
           Judged against the stored deal now.

           Signed in, the guess is also written down and COUNTED — once per
           name, three at most, in order, the round's first no sooner than
           MIN_MOVE_MS into it (recordGuess in _speed.js) — and the day is
           later scored from those records. The answer is only told once the
           round is over.

           Signed out, nothing is stored and the server cannot know how many
           guesses the round has had, so the page says when it has spent its
           last (`final`), and the answer comes back then or on the right
           name. Nothing about it counts until a finished day is filed (see
           scoreClaim).

           That made it the cheapest answer check on the site: ONE request
           with `final: true` names the maze, no guessing needed. Two things
           now stand in front of it, as in daily-scores.js, where the
           reasoning is written out in full:

             - `anon` from a request carrying a valid session is refused
               (400 "signed in"). It used to be answered unrecorded, so a
               signed-in player could ask for a round's answer that way and
               then guess it, recorded, on the first view. The page records
               the day instead, replaying any guesses it made signed out
               first (adoptRecorded in js/guess.js).
             - signed-out guesses are capped per network per day
               (claimAnonMove in _speed.js), at twenty times a day's most
               guesses and then some — room for a whole school or phone
               network behind one address, and still a ceiling on a script
               asking every round.

           NEITHER STOPS ONE PERSON (3 Oct 2026, corrected). Leaving the
           cookie off sidesteps the first, and five `final` requests are
           nowhere near the second, so somebody can still learn a day's
           answers signed out and then play it signed in for the full speed
           bonus. Nothing request-shaped can close that: every signed-out
           verdict says whether a name is right, so trying the options in
           turn finds the answer whatever `final` does — `final` only makes
           it cheaper. Docking the bonus from a network that had answers
           shown would also dock every honest player behind a school's or a
           phone network's one address. So it stays the accepted
           private-window route daily-scores.js describes; these two are
           fences against scripts, not against a person. */
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

            if (player && body.anon === true) {
                return privateJson(400, { error: "signed in", reason: "signed-in" });
            }
            if (!player) {
                const allowed = await speed.claimAnonMove(db, "guess", day, clientNet(event),
                    speed.anonMoveLimit(deal.rounds.length, TRIES));
                if (!allowed) return privateJson(429, { reason: "anon-limit", error: "Too many guesses from this network today" });
                const correct = offered === dealt.name;
                const over = correct || body.final === true;
                return privateJson(200, {
                    recorded: false, correct,
                    answer: over ? answerOf(dealt) : null,
                    // The next room, once this one is over — see ONE ROUND
                    // AT A TIME in _deal.js (30 Sept 2026).
                    next: over ? deals.nextRound("guess", deal.rounds, round, day) : null,
                    ...practiceMark
                });
            }
            /* `replay: true` is a guess made signed out and sent again now
               the day is recorded (Daily.replay in js/daily.js). Recording
               one marks the day untimed for good, so a replay run against
               a clock another device started earns no bonus for guesses
               made long before (recordGuess in _speed.js; 28 Sept 2026).
               Only `true` counts, like `anon`. */
            const replayed = body.replay === true;
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
                outcome = await speed.recordGuess(db, ensureUniqueIndex, day, player.id, round, offered, dealt, TRIES, arrived, replayed);
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
           started — ONE ROUND AT A TIME in _deal.js (30 Sept 2026). Signed
           out as well, unrecorded, as in daily-scores.js. */
        const openingRound = async () => {
            try {
                const deal = await deals.dealFor(db, ensureUniqueIndex, "guess", day);
                return deals.nextRound("guess", deal.rounds, -1, day);
            } catch (e) {
                console.error("guess-scores: could not read the day's deal for its first room", e);
                return null;
            }
        };
        if (!player && body.action === "start") {
            if (String(event.body || "").length > speed.MAX_START_BODY) return json(413, { error: "Too large" });
            return privateJson(200, { started: false, reason: "signed-out", next: await openingRound(), ...practiceMark });
        }

        // Not an error worth shouting about: the page submits optimistically
        // and simply is not listed when signed out.
        if (!player) return json(401, { error: "Not signed in" });

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
                    // A run played signed out before the cut, which only
                    // this page knows of — see the same step in
                    // daily-scores.js (1 Oct 2026).
                    if (body.practised === true) await speed.notePractised(db, "guess", day, player.id, "page");
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

        /* Scored from the guesses RECORDED as they were made whenever there
           are any, and then nothing in this request counts and a day with a
           room still open is not filed yet. Only a day with nothing recorded
           — played signed out, filed now the player has signed in — reads the
           request's guesses, judged against the stored deal, with no bonus
           (scoreClaim). */
        /* LATE FILING, as in daily-scores.js, where the reasoning is: a
           closed day is still filed if every room was recorded and the last
           guess was stamped before the day closed (dayClosesAt in
           _daily.js), because the score is built from those stamps and not
           from when this request arrived. A claim (a day played signed out)
           has no stamps and is refused once closed, and so is a day with a
           room still open — finally (400), not as "unfinished". */
        const closed = () => json(400, { error: "That day is not open" });
        let scored, clock = null, claimed = false, practiceRun = practice.now, practised = false;
        try {
            let row = await speed.progressFor(db, "guess", day, player.id);
            // Before the deal, so a closed day with nothing recorded never
            // causes one to be dealt.
            if (!open && !(speed.lastMarkAt(row) <= dayClosesAt(day))) return closed();
            const deal = await deals.dealFor(db, ensureUniqueIndex, "guess", day);
            if (!deal.rounds.length) return json(409, { recorded: false, reason: "no-deal" });
            /* Finished after the cut, but begun before it: still practice —
               only when every room of the practice row is over. One with a
               room still open is a run left behind, and this request a
               different one (the real day, claimed): set aside and filed as
               a claim — see the same step in daily-scores.js (1 Oct 2026). */
            if (pastPractice(practice, row)) {
                if (speed.movesOf(row, deal.rounds.length).every(m => m && m.done)) practiceRun = true;
                else { await speed.dropPractice(db, "guess", day, player.id, row); row = null; }
            }
            const moves = speed.movesOf(row, deal.rounds.length);
            if (moves.some(Boolean)) {
                scored = scoreRecorded(moves);
                if (!scored.complete) return open ? privateJson(409, { recorded: false, reason: "unfinished" }) : closed();
                clock = speed.clockOf(row);
            } else {
                if (!open) return closed();
                scored = scoreClaim(deal.rounds, body.rounds);
                claimed = true;
            }
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
        if (!scored) return json(400, { error: "Bad rounds" });
        const { points, solved, grid } = scored;

        /* The speed bonus, from the start and the marks on file — see
           _speed.js. Only rooms named right when they were played earn any;
           a round with no mark earns none. No clock — a claimed day, an
           untimed one — is no bonus rather than a day that fails to record. */
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
                // Filed from the page's own guesses after signing in — see
                // scoreClaim. Only there so the difference can be told.
                ...(claimed ? { claimed: true } : {}),
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

        // A claimed day's guesses written down as its moves, so the
        // account's other devices see it played — see the same step in
        // daily-scores.js (1 Oct 2026). Only logged if it fails.
        if (claimed) {
            try { await speed.recordClaimed(db, ensureUniqueIndex, "guess", day, player.id, scored.moves); } catch (e) {
                console.warn("guess-scores: could not write a claimed day's guesses", e && e.message);
            }
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

// For the tests: the pure scoring halves.
module.exports.scoreRecorded = scoreRecorded;
module.exports.scoreClaim = scoreClaim;

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("guess-scores", exports.handler);
