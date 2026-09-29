/* /.netlify/functions/daily-scores — leaderboards for Odd One Out.

   GET  ?game=odd&day=YYYY-MM-DD    today's board, and the week, month and
                                    all-time tables
   GET  ?game=odd&deal=1[&day=]     the day's deal to play: the server's
                                    today unless a still-open day is named,
                                    pictures only — see _deal.js — and, for
                                    a signed-in player, their moves so far
   POST {game, day, action: "start"}
                                    starts the signed-in player's clock for
                                    the day's speed bonus — see _speed.js
   POST {game, day, action: "move", round, tile}
                                    one pick, judged against the stored
                                    deal now; recorded for a signed-in
                                    player, only answered for anybody else
   POST {game, day[, moves]}        records the signed-in player's finished
                                    day, scored from the moves recorded —
                                    `moves` is read only for a day played
                                    signed out (see scoreClaim)

   Guess the Maze has had a board since it was built (guess-scores.js); this
   is the same idea for the games beside it.

   IT IS STILL SHAPED FOR SEVERAL, with one left in it. This endpoint was
   written to serve Ratrospect and Odd One Out together, because the two
   differed only in how a day was dealt and how a move was judged —
   everything round that is identical, and two files would have been two of
   each. Ratrospect was dropped and its half went: ratrospectDay,
   scoreRatrospect, readDate, the lives, and its name in GAMES. One Wall was
   added into the same shape and then dropped in its turn, taking its
   generator and scoreOneWall with it.

   Twice now, the join is what made the removal a deletion rather than an
   untangling — which is the argument for keeping it.

   What is left deliberately keeps the join: `game` is still a parameter
   checked against a list, rows are still keyed by it, and the board code
   still knows nothing about which game it is drawing. Collapsing all that
   into a single hardcoded "odd" would save a few lines now and have to be
   undone by the next game to arrive — and the rows already in the
   collection carry a game field either way.

   ----------------------------------------------------------------------
   How much this trusts the page

   The same amount guess-scores.js does, and for the same reasons. The day
   is dealt HERE, once, and stored (_deal.js); the page is handed the
   pictures and nothing that says which is the imposter. Each pick is sent
   the moment it is made, judged against the stored deal then, and — for a
   signed-in player — written down with the time it arrived (_speed.js).
   The day's score is built from those written-down picks and nothing else:
   the finishing request carries no answers that count.

   It used to be the other way round: the page dealt the day from a seed
   anybody could compute, with the answers in it, and sent its picks at the
   end for this file to re-deal and check. That let a hand-written request
   claim the right pick every time, and let the day's speed marks be laid
   down in a burst and the picks chosen afterwards.

   What is still possible is learning the answers first — playing the day
   signed out in a private window, where every pick is answered — and then
   playing it signed in. One submission per player per day is the backstop
   that keeps even that from compounding, and two things keep it from being
   free: a signed-in request may not ask for an unrecorded verdict (see
   "one pick" below), and signed-out verdicts are capped per network per
   day (claimAnonMove in _speed.js). A leaderboard here is a thing to
   enjoy, not a thing to defend. */
const { getDb, ensureUniqueIndex } = require("./_db");
const { playerFrom, publicName } = require("./_player");
const { clientNet } = require("./_net");
const { today, dayIsOpen, dayClosesAt, rangeBounds } = require("./_daily");
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson, BOARD_CDN_CACHE } = require("./_cache");
const speed = require("./_speed");
const deals = require("./_deal");
// No raw Discord id or nicknamed avatar on a public board (29 Sept 2026).
const { publicLists } = require("./_publicid");
/* The ban gate for every POST, and banned accounts off the boards (29 Sept
   2026). _bans.js requires nothing of this file, so there is no cycle. */
const { writeRefusal, withoutBanned } = require("./_bans");

const COLLECTION = "daily_scores";
const BOARD_SIZE = 10;
/* Ten a right pick, so a perfect day is 50, as in Guess the Maze. It was
   100 (a 500 day) until just before launch; the rows scored that way are
   all test days from before launch day, which the launch cut hides from
   every board (see launchCut below), so they were left as they are rather
   than rescored. Must stay in step with POINTS_EACH in js/oddoneout.js —
   tools/check-daily-parity.js compares the two. */
const POINTS_EACH = 10;
const ROUNDS = 5;              // five moves a day

// Still a list, still checked against. See the note at the top of the file
// for why this did not collapse into a constant when it came down to one.
const GAMES = ["odd"];

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": statusCode === 200 ? "public, max-age=30" : "no-store"
    },
    body: JSON.stringify(data)
});

/* For anything that answers about the caller or about a move: never cached,
   anywhere. The deal carries the signed-in player's own moves, and a move's
   verdict is one person's pick — neither may be handed to the next person
   through a shared cache. */
const privateJson = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "private, no-store" },
    body: JSON.stringify(data)
});

let ensured = false;
async function ensureIndexes(col) {
    if (ensured) return;
    // One row per player per day per game — the rule that makes "first
    // submission wins" the database's job rather than a check-then-write.
    //
    // Via ensureUniqueIndex, which THROWS on failure. It was a createIndex
    // with the error swallowed and `ensured` set anyway, so an index that
    // never got built was remembered as built and the rule failed open.
    await ensureUniqueIndex(col, ["game", "day", "playerId"]);
    await col.createIndex({ game: 1, day: 1, points: -1 }).catch(() => {});
    await col.createIndex({ game: 1, playerId: 1 }).catch(() => {});
    ensured = true;
}

/* ---------- judging what the player did ----------

   The day is dealt once and stored — see _deal.js, which has the whole
   story of why re-dealing it here at submission went wrong — so these read
   the stored deal and never the archive. */

/* A day as the server recorded it, pick by pick (movesOf in _speed.js).
   Every round the day was dealt counts, and a round with no recorded pick
   is a round not got, so the grid is always the deal's length. `complete`
   says whether every round has one — a day is only filed once it has. */
function scoreRecorded(dealRounds, moves) {
    const grid = dealRounds.map((_, i) => (moves[i] && moves[i].right ? 1 : 0));
    const solved = grid.filter(Boolean).length;
    return { points: solved * POINTS_EACH, solved, grid, complete: moves.every(Boolean) };
}

/* A day played SIGNED OUT, being filed now the player has signed in.

   Nothing was recorded while they played — there was nobody to record it
   against — so the only account of the day is the picks the page kept. They
   are judged against the stored deal, and filed with no bonus, because no
   clock ever ran for them. That is the "Sign in with Discord to be listed"
   promise kept, and it is the one place a request's picks still count; see
   the POST below for why it is only reached when nothing was recorded. It
   buys nothing that playing the day signed out first and then signed in
   would not, and it earns less: no bonus. */
function scoreClaim(dealRounds, moves) {
    if (!Array.isArray(moves) || moves.length !== dealRounds.length) return null;
    const grid = [];
    for (let i = 0; i < dealRounds.length; i++) {
        const pick = moves[i] && moves[i].tile;
        if (!Number.isInteger(pick) || pick < 0 || pick >= dealRounds[i].tiles.length) return null;
        grid.push(dealRounds[i].tiles[pick].odd ? 1 : 0);
    }
    const solved = grid.filter(Boolean).length;
    return { points: solved * POINTS_EACH, solved, grid, complete: true };
}

/* What the page is told about the moves recorded so far, for a signed-in
   player reopening the day: which tile each round got and whether it was
   right. Never the imposter of a round not yet played. */
const progressView = moves => moves.filter(Boolean).map(m => ({ tile: m.tile, right: Boolean(m.right) }));

/* ---------- the boards ---------- */

/* THE BOARDS START ON LAUNCH DAY.

   Everything played before the site opened — the owner's test runs, the
   friends who were shown it early — is still in the collections, and every
   span reached back over it: the all-time board opened with weeks of
   rehearsal already on it, and a first-day player started behind people who
   had been playing a game nobody else could see. Fallin' Furni's board has
   cut at launch since it was built (sinceLaunch in ff-scores.js); these did
   not.

   The same setting, settings.launchAt, and cut in TWO places: by day, so
   no span reaches back before launch day, and by the INSTANT, on each row's
   `at`, so nothing submitted before the doors opened counts either.

   It used to be by day alone — "the launch day counts whole" — and that was
   wrong in a way only launch day could show. The site opens at 08:00 UTC on
   the 3rd (launchAt), but the games run on UTC days, so the 3rd's puzzle is
   playable from 00:00: eight hours in which the owner's last test runs and
   the early friends' plays were filed under the launch day itself, and
   landed on the first day's board, the week's, the month's and everybody's
   Profile, ahead of every real player. The instant cut is what keeps them
   off. The day cut stays beside it because the spans are asked for by day,
   and so a day before launch still has no board at all.

   `at` is the submission's ISO string, and launchAt is normalised to one
   (new Date(ms).toISOString()), so the comparison is a plain string one in
   the same format on both sides. No launchAt, no cut — clearing it puts the
   history back, as it does for Fallin' Furni.

   Filtered on read, never deleted, for the same reason ff-scores.js gives:
   nothing to undo. Exported so guess-scores.js, player-profile.js and
   player-data.js cut at exactly the same place — boards that disagreed
   about where the season starts would be worse than none cutting at all. */
async function launchCut(db) {
    const doc = await db.collection("settings").findOne({ _id: "site" }, { projection: { launchAt: 1 } });
    const ms = doc && doc.launchAt ? Date.parse(doc.launchAt) : NaN;
    if (isNaN(ms)) return null;
    const at = new Date(ms).toISOString();
    return { day: at.slice(0, 10), at };
}

// The launch DAY alone, for callers written before the instant cut. They
// should add afterLaunch(cut) to their match as well — see launchCut.
async function launchDay(db) {
    const cut = await launchCut(db);
    return cut ? cut.day : null;
}

// The instant half of the cut, as a match fragment to spread into a query.
const afterLaunch = cut => (cut ? { at: { $gte: cut.at } } : {});

// A span's first day, moved up to launch day if it started before it.
// `launch` is the launch day as a string, or a launchCut, or null.
const fromLaunch = (from, launch) => {
    const day = launch && typeof launch === "object" ? launch.day : launch;
    return day && from < day ? day : from;
};

/* A real calendar day, not only the right shape. "2026-13-45" passes the
   pattern, and rangeBounds turned it into an Invalid Date whose
   toISOString() THREW — outside any try, so the caller got Netlify's bare
   502. Round-tripped through Date: a day that does not exist comes back as
   some other day, or as nothing. */
function isRealDay(day) {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const d = new Date(day + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/* rangeBounds is shared from _daily.js now. This file's own copy made "This
   week" the last seven days rolling while Guess the Maze's was the calendar
   week from Monday — two spans under one label, and the combined board
   (below) summed one of each. Both boards print "Since <weekFrom>" under
   the tab, so the copy was already honest about whichever it got; now it
   is the same Monday in every column. */

/* Sorted before grouping so `$last` really is the newest name and avatar —
   see the matching note on board() in guess-scores.js — and tie-broken on
   the player id so level rows keep one order between reads.

   Ranked on rounds right first and the total (base points plus speed
   bonus) second, and `points` in the answer IS that total — the same rule
   and the same shape as board() in guess-scores.js, where the reasoning is
   written out (RIGHT ANSWERS FIRST). */
async function board(col, game, from, to, cut) {
    const rows = await col.aggregate([
        { $match: { game, day: { $gte: from, $lte: to }, ...afterLaunch(cut) } },
        { $sort: { day: 1, at: 1 } },
        {
            $group: {
                _id: "$playerId",
                points: { $sum: "$points" },
                bonus: { $sum: "$bonus" },
                solved: { $sum: "$solved" },
                days: { $sum: 1 },
                name: { $last: "$name" },
                avatar: { $last: "$avatar" }
            }
        },
        { $addFields: { total: speed.TOTAL } },
        { $sort: { solved: -1, total: -1, days: 1, _id: 1 } },
        { $limit: BOARD_SIZE }
    ]).toArray();
    return rows.map(r => ({
        id: r._id, name: r.name, avatar: r.avatar,
        points: r.total, base: r.points, bonus: r.bonus || 0,
        solved: r.solved, days: r.days
    }));
}

/* One day's own board, a row per player: rounds right first, then the
   total, then the faster time (an untimed day after every timed one —
   NO_TIME in _speed.js), then who submitted first, then the id. As
   dayBoard in guess-scores.js. */
async function dayBoard(col, match) {
    return col.aggregate([
        { $match: match },
        { $addFields: { total: speed.TOTAL, msOrder: { $ifNull: ["$ms", speed.NO_TIME] } } },
        { $sort: { solved: -1, total: -1, msOrder: 1, at: 1, playerId: 1 } },
        { $limit: BOARD_SIZE }
    ]).toArray();
}

/* ---------- the combined board ----------

   One row per player, their points summed across every daily game they
   played in the span. Read from both collections — see the note at the call
   site for why there are two — and folded together in memory rather than
   with a $unionWith, so this keeps working on a MongoDB older than 4.4 and
   stays readable next to the aggregation above it.

   Reading more than BOARD_SIZE from each side before folding is the part
   that matters: a player who is eleventh at Guess the Maze and eleventh at
   Odd One Out can be third combined, and taking the top ten of each first
   would lose them. The cap is generous rather than exact — a true answer
   needs every row, and this is a leaderboard, not an audit. */
const COMBINE_DEPTH = 200;

/* Sorted before grouping so `$last` is the newest name, and carrying
   `lastAt` out of the group so fold() can tell which of a player's two rows
   (one per collection) is the more recent — see there.

   The bonus is summed beside the points, and the rounds right beside both,
   and the depth cut is taken in the same order fold() then ranks in —
   rounds right, then the total — so the COMBINE_DEPTH players read from
   each side are the top by the rule the board is drawn by. */
async function playerTotals(col, match) {
    return col.aggregate([
        { $match: match },
        { $sort: { day: 1, at: 1 } },
        {
            $group: {
                _id: { player: "$playerId", game: "$game" },
                points: { $sum: "$points" },
                bonus: { $sum: "$bonus" },
                solved: { $sum: "$solved" },
                days: { $sum: 1 },
                name: { $last: "$name" },
                avatar: { $last: "$avatar" },
                lastAt: { $max: "$at" }
            }
        },
        { $addFields: { total: speed.TOTAL } },
        { $sort: { solved: -1, total: -1, "_id.player": 1 } },
        { $limit: COMBINE_DEPTH }
    ]).toArray();
}

/* The daily_scores half of the combined board is restricted to the games
   that are still played.

   daily_scores still holds every Ratrospect and One Wall row ever
   submitted — deliberately; see daily-games.js — and the combined board
   matched on the day alone, so a month or all-time total quietly included
   points from games that no longer exist. A player who had been good at
   Ratrospect sat above people who had played everything that is actually
   on offer, with a "games" pill counting a game nobody can open. GAMES is
   the list of live games this endpoint serves, so it is the filter. */
const liveGames = match => Object.assign({ game: { $in: GAMES } }, match);

function fold(...lists) {
    const byPlayer = new Map();
    for (const list of lists) {
        for (const r of list) {
            const id = r._id && r._id.player !== undefined ? r._id.player : r._id;
            if (!id) continue;
            const seen = byPlayer.get(id) ||
                { id, points: 0, solved: 0, days: 0, games: new Set(), name: "", avatar: "", at: "", avatarAt: "" };
            // Each game's total — base points and speed bonus — so the
            // combined board adds up the same numbers the game boards show,
            // and each game's rounds right, which rank before them.
            seen.points += speed.totalOf(r);
            seen.solved += r.solved || 0;
            seen.days += r.days || 0;
            // guess_scores rows carry no `game` field of their own — the
            // collection IS the game — so the caller labels them.
            seen.games.add((r._id && r._id.game) || r.game || "guess");
            /* Newest name wins, so a Discord rename shows through rather
               than the board keeping whatever they were first called.

               "Newest" by the rows' own submission times. It used to be
               whichever list was folded last, which is always the Guess the
               Maze one — so a player renamed since their last Guess the
               Maze day kept their old name here however recently they had
               played Odd One Out. ISO strings compare as times. */
            const at = r.lastAt || "";
            if (r.name && at >= seen.at) { seen.name = r.name; seen.at = at; }
            if (r.avatar && at >= seen.avatarAt) { seen.avatar = r.avatar; seen.avatarAt = at; }
            byPlayer.set(id, seen);
        }
    }
    return [...byPlayer.values()]
        .map(r => ({ id: r.id, name: r.name, avatar: r.avatar, points: r.points, solved: r.solved, days: r.days, games: r.games.size }))
        // Rounds right across both games first, then points (see RIGHT
        // ANSWERS FIRST in guess-scores.js); then more games played,
        // because doing both is the thing this board exists to notice; then
        // fewer days; then the id, only so that rows level on everything
        // keep one order.
        .sort((a, b) => b.solved - a.solved || b.points - a.points || b.games - a.games || a.days - b.days ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, BOARD_SIZE);
}

async function combinedBoards(db, event, params) {
    const day = String(params.day || today()).slice(0, 10);
    if (!isRealDay(day)) return json(400, { error: "Bad day" });

    const daily = db.collection(COLLECTION);
    const guess = db.collection("guess_scores");

    try {
        // Inside the try with everything else that can fail — see isRealDay.
        const week = rangeBounds("week", day);
        const month = rangeBounds("month", day);
        const all = rangeBounds("all", day);

        // Every span starts no earlier than launch day, and no row counts
        // that was submitted before the launch instant — see launchCut.
        const launch = await launchCut(db);
        const span = (from, to) => ({ day: { $gte: fromLaunch(from, launch), $lte: to }, ...afterLaunch(launch) });
        // A day before launch has no board at all; asked by span, it is empty.
        const oneDay = span(day, day);

        const [dToday, gToday, dWeek, gWeek, dMonth, gMonth, dAll, gAll] = await Promise.all([
            // daily_scores through liveGames — see there. guess_scores is
            // one game by construction and needs no filter.
            playerTotals(daily, liveGames(oneDay)), playerTotals(guess, oneDay),
            playerTotals(daily, liveGames(span(week.from, week.to))), playerTotals(guess, span(week.from, week.to)),
            playerTotals(daily, liveGames(span(month.from, month.to))), playerTotals(guess, span(month.from, month.to)),
            playerTotals(daily, liveGames(span(all.from, all.to))), playerTotals(guess, span(all.from, all.to))
        ]);

        /* No raw Discord id and no nicknamed player's avatar leaves here
           (29 Sept 2026) — see _publicid.js. fold() still ranks and
           tie-breaks on the raw id, which never leaves this function; only
           the finished lists are swapped over, with one nickname read for
           all four. */
        /* Banned accounts off first (29 Sept 2026; withoutBanned in
           _bans.js), while the ids are still the raw ones. */
        const [bDay, bWeek, bMonth, bAll] = await publicLists(db, await withoutBanned(db, [
            fold(dToday, gToday), fold(dWeek, gWeek), fold(dMonth, gMonth), fold(dAll, gAll)
        ]));

        /* Eight aggregations across two collections is the most
           expensive read on the site, and the answer is the same for
           everybody — so it goes behind the edge for fifteen seconds like
           the per-game board above. See BOARD_CDN_CACHE in _cache.js. */
        return cachedJson(event, {
            date: day,
            weekFrom: week.from,
            monthFrom: month.from,
            combined: true,
            day: bDay,
            week: bWeek,
            month: bMonth,
            allTime: bAll
        }, { cdn: BOARD_CDN_CACHE });
    } catch (e) {
        return json(500, { error: "Could not read the scores" });
    }
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed" });
    }
    const col = db.collection(COLLECTION);
    /* A missing unique index only matters to a WRITE — the boards still read
       correctly without it — so a GET carries on and anything else is
       refused rather than allowed to write a second row for the day. */
    try {
        await ensureIndexes(col);
    } catch (e) {
        console.error("daily-scores: unique index unavailable", e);
        if (event.httpMethod !== "GET") return json(503, { error: "Scores can't be saved just now. Try again in a minute." });
    }

    const params = event.queryStringParameters || {};

    if (event.httpMethod === "GET") {
        const game = String(params.game || "");

        /* ---------- the day across all three games ----------

           A separate board, asked for by name, rather than a fourth span on
           an existing one: it answers a different question. The per-game
           boards ask who is best at one game; this asks who turned up.

           It has to read two collections, and that is not tidiness — it is
           where the rows actually are. `daily_scores` was written to hold
           Ratrospect and Odd One Out together and still holds the rows of
           both, the dropped game included; Guess the Maze came first and has
           `guess_scores` to itself, scored by its own function against its
           own POINTS array. Neither is wrong and merging them would be a
           migration for no benefit, so the combining happens here, at the
           one point that wants both.

           Everything is summed per player across whichever games they
           played, so a player who plays one game is not penalised into
           invisibility — they simply have one game's worth of points
           against someone else's three. `games` says how many of the three
           each row's points came from, so the board can be honest about
           that rather than leaving it to be guessed. */
        if (game === "all") return combinedBoards(db, event, params);

        if (!GAMES.includes(game)) return json(400, { error: "Unknown game" });

        if (params.deal === "1") return dealReply(db, event, game, params);

        const day = String(params.day || today()).slice(0, 10);
        if (!isRealDay(day)) return json(400, { error: "Bad day" });

        // All four spans in one request: they are small, they are read
        // together, and a results panel whose tabs each cost a round trip
        // feels broken in a way four cheap aggregations do not.
        //
        // Inside a try, as guess-scores.js has it: a failed query here was
        // an unhandled rejection, which Netlify answers with its own bare
        // 502 page rather than JSON the results panel knows how to read.
        // rangeBounds too, which can throw on a day it cannot read.
        let week, month, all;
        let todayRows, weekRows, monthRows, allRows;
        try {
            week = rangeBounds("week", day);
            month = rangeBounds("month", day);
            all = rangeBounds("all", day);
            // Every span from launch day on, and every row from the launch
            // instant on — see launchCut. A day before it has no board at all.
            const launch = await launchCut(db);
            const before = Boolean(launch) && day < launch.day;
            [todayRows, weekRows, monthRows, allRows] = await Promise.all([
                before ? [] : dayBoard(col, { game, day, ...afterLaunch(launch) }),
                board(col, game, fromLaunch(week.from, launch), week.to, launch),
                board(col, game, fromLaunch(month.from, launch), month.to, launch),
                board(col, game, fromLaunch(all.from, launch), all.to, launch)
            ]);
            /* `points` is the total, as on every board; `ms` the time taken,
               null when the day was never timed. Then every list through
               publicLists (29 Sept 2026): the public id in place of the
               Discord one, and no avatar for a player with a nickname — see
               _publicid.js. Inside the try, since it reads the players
               collection (and fails closed on its own if that read fails). */
            /* And a banned account's rows left out of all four, before the
               ids are swapped (29 Sept 2026; withoutBanned in _bans.js). */
            [todayRows, weekRows, monthRows, allRows] = await publicLists(db, await withoutBanned(db, [
                todayRows.map(r => ({
                    id: r.playerId, name: r.name, avatar: r.avatar,
                    points: speed.totalOf(r), base: r.points || 0, bonus: r.bonus || 0,
                    ms: Number.isFinite(r.ms) ? r.ms : null,
                    solved: r.solved,
                    grid: Array.isArray(r.grid) ? r.grid : null
                })),
                weekRows, monthRows, allRows
            ]));
        } catch (e) {
            console.error("daily-scores: board read failed", e);
            return json(500, { error: "Could not read the scores" });
        }

        /* Edge-cached for fifteen seconds — see BOARD_CDN_CACHE in
           _cache.js. Nothing caller-specific is read or returned on this
           path, so one answer genuinely serves everybody. */
        return cachedJson(event, {
            date: day,
            weekFrom: week.from,
            monthFrom: month.from,
            // Shaped and made public above, inside the try.
            day: todayRows,
            week: weekRows,
            month: monthRows,
            allTime: allRows
        }, { cdn: BOARD_CDN_CACHE });
    }

    if (event.httpMethod === "POST") {
        // Before anything slow: the time taken is the player's, not the
        // time this function spends reading the day.
        const arrived = Date.now();
        const player = playerFrom(event);

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }
        // `null` parses cleanly and then has nothing to read a field off.
        if (!body || typeof body !== "object") body = {};
        const game = String(body.game || "");
        if (!GAMES.includes(game)) return json(400, { error: "Unknown game" });

        const day = String(body.day || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { error: "Bad day" });
        // Today, or the day that ended in the last few minutes — see
        // dayIsOpen in _daily.js for why the grace period exists. A day that
        // has not happened cannot have been played.
        //
        // With ONE exception, decided further down: a signed-in player's
        // finishing request for a closed day whose moves were all recorded
        // before it closed (see LATE FILING below). Every move and start,
        // and anything signed out, is still held to the open day here.
        const open = dayIsOpen(day);
        if (!open && (body.action !== undefined || !player)) return json(400, { error: "That day is not open" });

        /* BANNED, AND THE REJECTED NICKNAME (29 Sept 2026; see _bans.js).
           Every POST here — a pick, a start, a finished day, signed in or
           out (a signed-out pick is judged by the network's bans) — is
           refused with 403 { error, banned } for a banned account or
           network, and a signed-in player whose nickname the admins have
           rejected is refused with 403 { error, nickRequired: true } until
           they choose another (player-nick.js). Ahead of the deal and every
           write, so a refused request costs one memoised lookup. */
        const refusal = await writeRefusal(db, event, player ? player.id : null, { game: true });
        if (refusal) return refusal;

        /* ---------- one pick ----------

           Sent by the game (Daily.move in js/daily.js) the moment a tile is
           picked, for EVERYBODY — the page no longer knows which tile is the
           imposter, so it has to ask. Judged against the stored deal now.

           Signed in, the pick is also written down, once, in order, and no
           sooner than MIN_MOVE_MS into its round (recordOddPick in
           _speed.js), and the day is later scored from what was written.
           Signed out, it is only answered: nothing is stored, so nothing
           about it can count until a finished day is filed (see
           scoreClaim).

           `anon` WITH A SESSION IS REFUSED. The page used to send `anon`
           for a day it began signed out, and the server answered those
           without recording them whoever was asking — so a signed-in
           player could put `anon: true` on a pick, read whether it was
           right, and then make the recorded pick knowing. A free answer
           check on a timed day, with the bonus still to earn. Now a
           request that carries a valid session is told "signed in" (400)
           and nothing is judged; the page then records the day instead,
           replaying any picks it made signed out first (adoptRecorded in
           js/oddoneout.js). A day played wholly signed out and filed after
           signing in is untouched: that is the finishing POST below
           (scoreClaim), not a move.

           AND SIGNED-OUT VERDICTS ARE CAPPED, per network per day
           (claimAnonMove in _speed.js). The private-window route above is
           still open, deliberately — a signed-out player has to be able to
           play — but it was unmetered, so a script could ask every tile of
           every round. The cap is twenty times a day's picks and then some
           (see ANON_MULTIPLE in _speed.js: a school or a phone network puts
           many players behind one address), which no one address of real
           players reaches; past it the answer is 429 and the page suggests
           signing in. */
        if (body.action === "move") {
            if (String(event.body || "").length > speed.MAX_START_BODY) return privateJson(413, { error: "Too large" });
            const round = speed.markRound(body.round, ROUNDS);
            if (round == null) return privateJson(400, { error: "Bad round" });
            let deal;
            try {
                deal = await deals.dealFor(db, ensureUniqueIndex, game, day);
            } catch (e) {
                console.error("daily-scores: could not read the day's deal", e);
                return privateJson(503, { error: "The day could not be read just now" });
            }
            const dealt = deal.rounds[round];
            const tile = body.tile;
            if (!dealt || !Number.isInteger(tile) || tile < 0 || tile >= dealt.tiles.length) {
                return privateJson(400, { error: "Bad move" });
            }
            if (player && body.anon === true) {
                return privateJson(400, { error: "signed in", reason: "signed-in" });
            }
            if (!player) {
                const allowed = await speed.claimAnonMove(db, game, day, clientNet(event),
                    speed.anonMoveLimit(deal.rounds.length, 1));
                if (!allowed) return privateJson(429, { reason: "anon-limit", error: "Too many picks from this network today" });
                return privateJson(200, { recorded: false, tile, right: Boolean(dealt.tiles[tile].odd) });
            }
            /* `replay: true` is a pick made signed out and sent again now
               the day is recorded (Daily.replay in js/daily.js). Recording
               one marks the day untimed for good, so a replay run against
               a clock another device started earns no bonus for picks made
               long before (recordOddPick in _speed.js; 28 Sept 2026). Only
               `true` counts, like `anon`. */
            const replayed = body.replay === true;
            let outcome;
            try {
                outcome = await speed.recordOddPick(db, ensureUniqueIndex, day, player.id, round, tile, dealt, arrived, replayed);
            } catch (e) {
                console.error("daily-scores: could not record a pick", e);
                return privateJson(503, { error: "The pick could not be recorded just now" });
            }
            if (outcome.error === "too-fast") return privateJson(429, { reason: "too-fast", retryInMs: outcome.retryInMs });
            if (outcome.error === "bad-move") return privateJson(400, { error: "Bad move" });
            if (outcome.error) return privateJson(409, { reason: outcome.error });
            return privateJson(200, { recorded: true, already: Boolean(outcome.already), tile: outcome.tile, right: outcome.right });
        }

        // Anything else with an action is not a request this endpoint takes —
        // including "mark", which a page from before the moves were judged
        // one at a time still sends, and which now means nothing.
        if (body.action !== undefined && body.action !== "start") return json(400, { error: "Unknown action" });

        // Signed out is not an error: the game posts unconditionally and
        // there is simply no name to put on a row.
        if (!player) return json(200, { recorded: false, reason: "signed-out" });

        /* ---------- the day's clock starting ----------

           Sent by the game (Daily.start in js/daily.js) when a signed-in
           player first goes into a round. Recorded once and never moved —
           see _speed.js. Every call after the first writes nothing, so the
           most any number of them can store is one row per player per game
           per open day, which is why this has no rate limit of its own. */
        if (body.action === "start") {
            if (String(event.body || "").length > speed.MAX_START_BODY) return json(413, { error: "Too large" });
            try {
                await speed.recordStart(db, ensureUniqueIndex, game, day, player.id);
            } catch (e) {
                console.error("daily-scores: could not record a start", e);
                return json(503, { started: false });
            }
            return json(200, { started: true });
        }

        /* ---------- the finished day ----------

           A day already on file is answered with THAT row's score, before
           anything in this request is looked at. The reply used to carry
           the points just computed from the request, even for a duplicate —
           which made a second submission a free answer checker: send any
           five picks, read back how many were right, and nothing was written
           to stop you asking again. */
        let filed;
        try {
            filed = await col.findOne({ game, day, playerId: player.id });
        } catch (e) {
            return json(500, { error: "Could not check the day" });
        }
        if (filed) return privateJson(200, alreadyReply(filed));

        /* Scored from the picks RECORDED as they were made (scoreRecorded),
           whenever there are any: then nothing in this request counts at
           all, and a day with rounds still unpicked is not filed yet. Only a
           day with no recorded picks — played signed out, and being filed
           now the player has signed in — reads the request's picks, judged
           against the stored deal and with no bonus (scoreClaim). A day
           cannot be half one and half the other: one recorded pick and the
           request's picks are ignored.

           One game in the switch, and the switch kept: `game` has already
           been checked against GAMES above. See the note at the top of the
           file for why the list survived coming down to one. */
        /* LATE FILING. A day that has closed is still filed when the
           request is only late and the day was not: every round recorded,
           the last of them stamped by this server before the day closed
           (dayClosesAt in _daily.js). The score is built from those stamped
           moves exactly as it would have been at 00:04, so arriving at
           00:06 changes nothing about it except that it now lands — before
           this, a finished day whose POST fell over in the grace was lost
           outright. A day played signed out has no stamps to prove when it
           was played, so a claim is still refused once the day has closed,
           and so is a day with a round unplayed: it can no longer be
           finished, so it is told so (400, final) rather than "unfinished"
           (409, which the page keeps trying). The start row these read
           expires two days on (_speed.js), which bounds how late is late. */
        const closed = () => json(400, { error: "That day is not open" });
        let scored, clock = null, claimed = false;
        try {
            const row = await speed.progressFor(db, game, day, player.id);
            // Checked before the deal is read, so a closed day with nothing
            // recorded can never cause a day to be dealt.
            if (!open && !(speed.lastMarkAt(row) <= dayClosesAt(day))) return closed();
            const deal = await deals.dealFor(db, ensureUniqueIndex, game, day);
            if (!deal.rounds.length) return json(409, { recorded: false, reason: "no-deal" });
            const moves = speed.movesOf(row, deal.rounds.length);
            if (moves.some(Boolean)) {
                scored = scoreRecorded(deal.rounds, moves);
                if (!scored.complete) return open ? privateJson(409, { recorded: false, reason: "unfinished" }) : closed();
                clock = speed.clockOf(row);
            } else {
                if (!open) return closed();
                scored = scoreClaim(deal.rounds, body.moves);
                claimed = true;
            }
        } catch (e) {
            console.error("daily-scores: could not check the day", e);
            return json(500, { error: "Could not check the day" });
        }
        if (!scored) return json(400, { error: "Bad moves" });

        /* The speed bonus, from the start and the marks on file — see
           _speed.js. Only rounds judged right when they were played earn
           any. No clock (a claimed day, or an untimed one) is no bonus
           rather than a day that fails to record. */
        const { bonus, ms, roundSecs } = speed.dayBonus(clock, scored.grid.map(g => g > 0), arrived);

        /* Their nickname if they have one, else their Discord name — read
           from the players row, not the session (publicName in _player.js;
           28 Sept 2026). */
        const shown = await publicName(db, player);

        try {
            await col.insertOne({
                game, day,
                playerId: player.id,
                name: shown,
                avatar: player.avatar,
                // Still the base score; the boards add `bonus` to it. `ms`
                // (the whole day) and `roundSecs` (each round) only when
                // there was a clock to read.
                points: scored.points,
                bonus,
                ...(ms == null ? {} : { ms, roundSecs }),
                solved: scored.solved,
                grid: scored.grid,
                /* How many rounds this day actually had. Usually five, but a
                   day dealt from a thin pool has fewer, and a player may send
                   fewer moves than there were rounds — so the Profile's
                   "rounds played" counted five a day and overstated both.
                   Rows written before this have no field; player-profile.js
                   reads those as five, which is what they almost all were. */
                rounds: scored.grid.length,
                // A day filed from the page's own picks after signing in —
                // see scoreClaim. Only there so the difference can be told.
                ...(claimed ? { claimed: true } : {}),
                at: new Date().toISOString()
            });
        } catch (e) {
            // Duplicate key: a submission raced this one and landed first.
            // The rule working, not a failure — and the answer is the row
            // that stands, not what was just computed (see alreadyReply).
            if (e && e.code === 11000) {
                const first = await col.findOne({ game, day, playerId: player.id }).catch(() => null);
                return privateJson(200, first ? alreadyReply(first) : { recorded: false, reason: "already" });
            }
            return json(500, { error: "Could not record the score" });
        }

        return privateJson(200, { recorded: true, points: scored.points, bonus, solved: scored.solved });
    }

    return json(405, { error: "Method not allowed" });
};

// The answer to a day already on file: the stored row's own figures.
function alreadyReply(row) {
    return { recorded: false, reason: "already", points: row.points || 0, bonus: row.bonus || 0, solved: row.solved || 0 };
}

/* The page's deal for a day: what to play, and nothing that says how.

   The DAY IS THE SERVER'S. Without a `day`, it is the server's today; with
   one, it is served only if dayIsOpen says so — today, or yesterday inside
   the midnight grace, for a player finishing a day begun before midnight.
   A day that has not started is refused, so setting a device's clock
   forward no longer shows tomorrow's pictures (and the seed that deals them
   is secret — see _deal.js — so they cannot be worked out either).

   Public: fetching the deal needs no account, and a signed-out player
   plays exactly the same day. A signed-in player also gets their recorded
   moves (so a reload, or another device, carries on where they are rather
   than offering rounds already played), and whether the day is already
   filed. `now` is the server's clock, which the page uses to correct its
   own (Daily.today in js/daily.js). Never cached — see privateJson. */
async function dealReply(db, event, game, params) {
    const day = params.day ? String(params.day).slice(0, 10) : today();
    if (!isRealDay(day) || !dayIsOpen(day)) {
        return privateJson(404, { error: "That day is not open", today: today(), now: Date.now() });
    }
    let deal;
    try {
        deal = await deals.dealFor(db, ensureUniqueIndex, game, day);
    } catch (e) {
        console.error("daily-scores: could not deal the day", e);
        return privateJson(503, { error: "The day could not be dealt just now" });
    }
    const player = playerFrom(event);
    let progress = null, filed = false, score = null;
    if (player) {
        try {
            const row = await speed.progressFor(db, game, day, player.id);
            progress = progressView(speed.movesOf(row, deal.rounds.length));
            const onFile = await db.collection(COLLECTION).findOne({ game, day, playerId: player.id },
                { projection: { _id: 1, points: 1, bonus: 1, solved: 1 } });
            filed = Boolean(onFile);
            score = filedScore(onFile);
        } catch (e) {
            // The deal is still worth sending; the page plays on from its
            // own copy of the day.
            progress = null;
        }
    }
    return privateJson(200, {
        game, day, today: today(), now: Date.now(),
        // Picture addresses, never the stored references — see _deal.js.
        rounds: deals.publicRounds(game, deal.rounds, day),
        progress, filed, score
    });
}

/* The filed day's own figures, for a results card reopened after the day
   was filed — the base points, the speed bonus and the rounds right, as
   the row stands, so the card shows the same split the board adds up.
   null when nothing is filed. The same shape as alreadyReply, which is
   what the submit answers with. */
function filedScore(row) {
    if (!row) return null;
    return { points: row.points || 0, bonus: row.bonus || 0, solved: row.solved || 0 };
}

/* For guess-scores.js, player-profile.js and player-data.js — see launchCut
   and isRealDay. launchDay is kept for the callers that only cut by day;
   they should add afterLaunch too. */
module.exports.launchDay = launchDay;
module.exports.launchCut = launchCut;
module.exports.afterLaunch = afterLaunch;
module.exports.fromLaunch = fromLaunch;
module.exports.isRealDay = isRealDay;
// For guess-scores.js, so both games' deal replies carry the same shape.
module.exports.filedScore = filedScore;
// For the tests: the pure scoring halves.
module.exports.scoreRecorded = scoreRecorded;
module.exports.scoreClaim = scoreClaim;

/* Failures reported to /warren's Errors tab (28 Sept 2026): see
   withErrorReporting in _errors.js. Last, so it wraps the handler as finally
   defined above; what the handler answers is unchanged. */
exports.handler = require("./_errors").withErrorReporting("daily-scores", exports.handler);
