/* /.netlify/functions/daily-scores — leaderboards for Odd One Out.

   GET  ?game=odd&day=YYYY-MM-DD    today's board, and the week, month and
                                    all-time tables
   POST {game, day, moves}          records the signed-in player's finished
                                    day

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

   The same amount guess-scores.js does, and for the same reasons. The day's
   rooms, intruders and answers are DERIVED here, from the same seeded
   shuffle the browser runs over the same archive out of the same database.
   The page sends what it DID — which tile was picked — and never a score.
   Points are computed here.

   What that does not stop is somebody writing a request by hand claiming
   the right move every time. Closing that needs the server to hand out the
   puzzle and time the answers, which is a much larger thing and the wrong
   shape for a game whose whole appeal is a static page and a seed. So:
   casual inflation is impossible, deliberate forgery by someone willing to
   write the request is not, and one submission per player per day is the
   backstop that stops even that compounding.

   The pictures are public archive data, so a determined player could work
   out a perfect day offline. That is true of Guess the Maze too. A
   leaderboard here is a thing to enjoy, not a thing to defend. */
const { getDb } = require("./_db");
const { playerFrom } = require("./_player");
const { today, dayIsOpen, seedFrom, shuffle, daySeed, isHallway } = require("./_daily");
const { SECURITY_HEADERS } = require("./_headers");
const { cachedJson, BOARD_CDN_CACHE } = require("./_cache");

const COLLECTION = "daily_scores";
const BOARD_SIZE = 10;
const POINTS_EACH = 100;
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

let ensured = false;
async function ensureIndexes(col) {
    if (ensured) return;
    // One row per player per day per game — the rule that makes "first
    // submission wins" the database's job rather than a check-then-write.
    await col.createIndex({ game: 1, day: 1, playerId: 1 }, { unique: true }).catch(() => {});
    await col.createIndex({ game: 1, day: 1, points: -1 }).catch(() => {});
    await col.createIndex({ game: 1, playerId: 1 }).catch(() => {});
    ensured = true;
}

/* ---------- dealing the day, exactly as the page deals it ---------- */

async function oddDay(day) {
    const db = await getDb();
    const rooms = await db.collection("rooms")
        .find({}, { projection: { id: 1, name: 1, tags: 1, gallery: 1 } }).toArray();

    const pool = rooms
        // Exactly as js/oddoneout.js builds its pool. A room dropped there
        // and kept here would deal one set of rounds and score another.
        .filter(room => room && room.id && room.name && !isHallway(room))
        .map(room => ({
            id: room.id,
            name: room.name,
            tags: (room.tags || []).map(t => String(t).toLowerCase()),
            shots: (room.gallery || []).map(g => g && g.image).filter(Boolean)
        }))
        .filter(maze => maze.shots.length >= 3)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const shares = (a, b) => a.tags.some(t => t && b.tags.includes(t));
    const rounds = [];
    const usedHome = new Set();
    for (const home of shuffle(pool, daySeed(day, "odd"))) {
        if (rounds.length >= ROUNDS) break;
        if (usedHome.has(home.id)) continue;

        const seed = daySeed(day, "odd", home.id);
        const others = pool.filter(m => m.id !== home.id && m.shots.length);
        const related = others.filter(m => shares(home, m));
        const imposter = shuffle(related.length ? related : others, seed)[0];
        if (!imposter) continue;

        const mine = shuffle(home.shots, seed).slice(0, 3);
        if (mine.length < 3) continue;
        const theirs = shuffle(imposter.shots, seed)[0];

        const tiles = shuffle(
            mine.map(image => ({ image, odd: false })).concat([{ image: theirs, odd: true }]),
            daySeed(day, "odd:tiles", home.id)
        );

        usedHome.add(home.id);
        rounds.push({ home: home.name, imposter: imposter.name, tiles });
    }
    return rounds;
}

/* ---------- judging what the player did ---------- */

// Odd One Out: five independent rounds, one pick each.
function scoreOdd(rounds, moves) {
    if (!rounds.length) return null;
    let points = 0;
    const grid = [];
    for (let i = 0; i < moves.length; i++) {
        if (i >= rounds.length) break;
        const pick = Number(moves[i] && moves[i].tile);
        if (!Number.isInteger(pick) || pick < 0 || pick > 3) return null;
        const tile = rounds[i].tiles[pick];
        const right = Boolean(tile && tile.odd);
        grid.push(right ? 1 : 0);
        if (right) points += POINTS_EACH;
    }
    return { points, solved: grid.filter(Boolean).length, grid };
}

/* ---------- the boards ---------- */

function rangeBounds(kind, todayStr) {
    const iso = d => d.toISOString().slice(0, 10);
    if (kind === "week") {
        const start = new Date(todayStr + "T00:00:00Z");
        start.setUTCDate(start.getUTCDate() - 6);
        return { from: iso(start), to: todayStr };
    }
    if (kind === "month") return { from: todayStr.slice(0, 8) + "01", to: todayStr };
    return { from: "0000-01-01", to: "9999-12-31" };
}

async function board(col, game, from, to) {
    const rows = await col.aggregate([
        { $match: { game, day: { $gte: from, $lte: to } } },
        {
            $group: {
                _id: "$playerId",
                points: { $sum: "$points" },
                solved: { $sum: "$solved" },
                days: { $sum: 1 },
                name: { $last: "$name" },
                avatar: { $last: "$avatar" }
            }
        },
        { $sort: { points: -1, days: 1 } },
        { $limit: BOARD_SIZE }
    ]).toArray();
    return rows.map(r => ({ id: r._id, name: r.name, avatar: r.avatar, points: r.points, solved: r.solved, days: r.days }));
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

async function playerTotals(col, match) {
    return col.aggregate([
        { $match: match },
        {
            $group: {
                _id: { player: "$playerId", game: "$game" },
                points: { $sum: "$points" },
                days: { $sum: 1 },
                name: { $last: "$name" },
                avatar: { $last: "$avatar" }
            }
        },
        { $sort: { points: -1 } },
        { $limit: COMBINE_DEPTH }
    ]).toArray();
}

function fold(...lists) {
    const byPlayer = new Map();
    for (const list of lists) {
        for (const r of list) {
            const id = r._id && r._id.player !== undefined ? r._id.player : r._id;
            if (!id) continue;
            const seen = byPlayer.get(id) || { id, points: 0, days: 0, games: new Set(), name: "", avatar: "" };
            seen.points += r.points || 0;
            seen.days += r.days || 0;
            // guess_scores rows carry no `game` field of their own — the
            // collection IS the game — so the caller labels them.
            seen.games.add((r._id && r._id.game) || r.game || "guess");
            // Newest name wins, so a Discord rename shows through rather
            // than the board keeping whatever they were first called.
            if (r.name) seen.name = r.name;
            if (r.avatar) seen.avatar = r.avatar;
            byPlayer.set(id, seen);
        }
    }
    return [...byPlayer.values()]
        .map(r => ({ id: r.id, name: r.name, avatar: r.avatar, points: r.points, days: r.days, games: r.games.size }))
        // Points first; then more games played, because doing all three is
        // the thing this board exists to notice.
        .sort((a, b) => b.points - a.points || b.games - a.games || a.days - b.days)
        .slice(0, BOARD_SIZE);
}

async function combinedBoards(db, event, params) {
    const day = String(params.day || today()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { error: "Bad day" });

    const daily = db.collection(COLLECTION);
    const guess = db.collection("guess_scores");
    const week = rangeBounds("week", day);
    const month = rangeBounds("month", day);
    const all = rangeBounds("all", day);

    const span = (from, to) => ({ day: { $gte: from, $lte: to } });

    try {
        const [dToday, gToday, dWeek, gWeek, dMonth, gMonth, dAll, gAll] = await Promise.all([
            playerTotals(daily, { day }), playerTotals(guess, { day }),
            playerTotals(daily, span(week.from, week.to)), playerTotals(guess, span(week.from, week.to)),
            playerTotals(daily, span(month.from, month.to)), playerTotals(guess, span(month.from, month.to)),
            playerTotals(daily, span(all.from, all.to)), playerTotals(guess, span(all.from, all.to))
        ]);

        /* Eight aggregations across two collections is the most
           expensive read on the site, and the answer is the same for
           everybody — so it goes behind the edge for fifteen seconds like
           the per-game board above. See BOARD_CDN_CACHE in _cache.js. */
        return cachedJson(event, {
            date: day,
            weekFrom: week.from,
            monthFrom: month.from,
            combined: true,
            day: fold(dToday, gToday),
            week: fold(dWeek, gWeek),
            month: fold(dMonth, gMonth),
            allTime: fold(dAll, gAll)
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
    await ensureIndexes(col);

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
        const day = String(params.day || today()).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { error: "Bad day" });

        const week = rangeBounds("week", day);
        const month = rangeBounds("month", day);
        const all = rangeBounds("all", day);

        // All four spans in one request: they are small, they are read
        // together, and a results panel whose tabs each cost a round trip
        // feels broken in a way four cheap aggregations do not.
        const [todayRows, weekRows, monthRows, allRows] = await Promise.all([
            col.find({ game, day }, { projection: { _id: 0, playerId: 1, name: 1, avatar: 1, points: 1, solved: 1, grid: 1 } })
                .sort({ points: -1, at: 1 }).limit(BOARD_SIZE).toArray(),
            board(col, game, week.from, week.to),
            board(col, game, month.from, month.to),
            board(col, game, all.from, all.to)
        ]);

        /* Edge-cached for fifteen seconds — see BOARD_CDN_CACHE in
           _cache.js. Nothing caller-specific is read or returned on this
           path, so one answer genuinely serves everybody. */
        return cachedJson(event, {
            date: day,
            weekFrom: week.from,
            monthFrom: month.from,
            day: todayRows.map(r => ({
                id: r.playerId, name: r.name, avatar: r.avatar,
                points: r.points, solved: r.solved,
                grid: Array.isArray(r.grid) ? r.grid : null
            })),
            week: weekRows,
            month: monthRows,
            allTime: allRows
        }, { cdn: BOARD_CDN_CACHE });
    }

    if (event.httpMethod === "POST") {
        const player = playerFrom(event);
        // Signed out is not an error: the game posts unconditionally and
        // there is simply no name to put on a row.
        if (!player) return json(200, { recorded: false, reason: "signed-out" });

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }
        const game = String(body.game || "");
        if (!GAMES.includes(game)) return json(400, { error: "Unknown game" });

        const day = String(body.day || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { error: "Bad day" });
        // Today, or the day that ended in the last few minutes — see
        // dayIsOpen in _daily.js for why the grace period exists. A day that
        // has not happened cannot have been played.
        if (!dayIsOpen(day)) return json(400, { error: "That day is not open" });

        const moves = Array.isArray(body.moves) ? body.moves.slice(0, ROUNDS) : null;
        if (!moves || !moves.length) return json(400, { error: "Bad moves" });

        /* One game in the switch, and the switch kept: `game` has already
           been checked against GAMES above, so anything reaching here is a
           name this endpoint serves. With one entry it is a lookup that
           happens to have a single answer, which is the honest shape for a
           list that has twice now been expected to grow again. */
        let scored;
        try {
            scored = scoreOdd(await oddDay(day), moves);
        } catch (e) {
            return json(500, { error: "Could not check the day" });
        }
        if (!scored) return json(400, { error: "Bad moves" });

        try {
            await col.insertOne({
                game, day,
                playerId: player.id,
                name: player.name,
                avatar: player.avatar,
                points: scored.points,
                solved: scored.solved,
                grid: scored.grid,
                at: new Date().toISOString()
            });
        } catch (e) {
            // Duplicate key: already recorded today. The rule working, not a
            // failure — the first score stands.
            if (e && e.code === 11000) return json(200, { recorded: false, reason: "already", points: scored.points });
            return json(500, { error: "Could not record the score" });
        }

        return json(200, { recorded: true, points: scored.points, solved: scored.solved });
    }

    return json(405, { error: "Method not allowed" });
};
