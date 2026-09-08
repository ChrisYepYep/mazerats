/* /.netlify/functions/daily-scores — leaderboards for Ratrospect and Odd
   One Out.

   GET  ?game=ratrospect&day=YYYY-MM-DD    today's board, and the week,
                                           month and all-time tables
   POST {game, day, moves}                 records the signed-in player's
                                           finished day

   Guess the Maze has had a board since it was built (guess-scores.js); this
   is the same idea for the other two, in one endpoint because the two games
   differ only in how a day is dealt and how a move is judged. Everything
   round that — the collection, the spans, the one-row-per-player-per-day
   rule, what a board looks like — is identical, and two files would have
   been two of each.

   ----------------------------------------------------------------------
   How much this trusts the page

   The same amount guess-scores.js does, and for the same reasons. The day's
   cards, rooms, intruders and answers are DERIVED here, from the same
   seeded shuffle the browser runs over the same archive out of the same
   database. The page sends what it DID — which gap a card went into, which
   tile was picked — and never a score. Points are computed here.

   What that does not stop is somebody writing a request by hand claiming
   the right move every time. Closing that needs the server to hand out the
   puzzle and time the answers, which is a much larger thing and the wrong
   shape for a game whose whole appeal is a static page and a seed. So:
   casual inflation is impossible, deliberate forgery by someone willing to
   write the request is not, and one submission per player per day is the
   backstop that stops even that compounding.

   Both games' dates and pictures are public archive data, so a determined
   player could work out a perfect day offline in either. That is true of
   Guess the Maze too. A leaderboard here is a thing to enjoy, not a thing
   to defend. */
const { getDb } = require("./_db");
const { playerFrom } = require("./_player");
const { today, seedFrom, shuffle } = require("./_daily");

const COLLECTION = "daily_scores";
const BOARD_SIZE = 10;
const POINTS_EACH = 100;
const ROUNDS = 5;              // both games: five moves a day
const LIVES = 3;               // Ratrospect only

const GAMES = ["ratrospect", "odd"];

const json = (statusCode, data) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Cache-Control": statusCode === 200 ? "public, max-age=30" : "no-store"
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

function readDate(value) {
    const text = String(value).trim();
    const monthOnly = /^\d{4}-\d{2}$/.test(text);
    const at = Date.parse(monthOnly ? text + "-01T12:00:00Z"
        : /^\d{4}-\d{2}-\d{2}$/.test(text) ? text + "T12:00:00Z" : text);
    if (isNaN(at)) return null;
    return { at, month: new Date(at).toISOString().slice(0, 7) };
}

// See pictureOf in js/ratrospect.js: an entrance is an object in this
// archive, not a string, and a card that assumes otherwise shows nothing.
function pictureOf(record) {
    const pick = v => (typeof v === "string" ? v.trim()
        : v && typeof v === "object" && typeof v.image === "string" ? v.image.trim() : "");
    const gallery = Array.isArray(record.gallery) ? record.gallery : [];
    return pick(record.thumb) || pick(record.entrance) || pick(gallery[0]) || "";
}

async function ratrospectDay(day) {
    const db = await getDb();
    const [rooms, events] = await Promise.all([
        db.collection("rooms").find({}, { projection: { id: 1, name: 1, added: 1, thumb: 1, entrance: 1, gallery: 1 } }).toArray(),
        db.collection("events").find({}, { projection: { id: 1, title: 1, date: 1 } }).toArray()
    ]);

    const pool = [];
    rooms.forEach(room => {
        if (!room || !room.name || !room.added) return;
        const when = readDate(room.added);
        if (when) pool.push({ id: "maze:" + room.id, at: when.at, month: when.month, title: room.name });
    });
    events.forEach(ev => {
        if (!ev || !ev.title || !ev.date) return;
        const when = readDate(ev.date);
        if (when) pool.push({ id: "event:" + ev.id, at: when.at, month: when.month, title: ev.title });
    });
    // The same fixed order the page sorts into before shuffling.
    pool.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const shuffled = shuffle(pool, seedFrom("ratrospect:" + day));
    const cards = [];
    const months = new Set();
    for (const card of shuffled) {
        if (cards.length >= ROUNDS + 1) break;
        if (months.has(card.month)) continue;
        months.add(card.month);
        cards.push(card);
    }
    return cards;
}

async function oddDay(day) {
    const db = await getDb();
    const rooms = await db.collection("rooms")
        .find({}, { projection: { id: 1, name: 1, tags: 1, gallery: 1 } }).toArray();

    const pool = rooms
        .filter(room => room && room.id && room.name)
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
    for (const home of shuffle(pool, seedFrom("odd:" + day))) {
        if (rounds.length >= ROUNDS) break;
        if (usedHome.has(home.id)) continue;

        const seed = seedFrom("odd:" + day + ":" + home.id);
        const others = pool.filter(m => m.id !== home.id && m.shots.length);
        const related = others.filter(m => shares(home, m));
        const imposter = shuffle(related.length ? related : others, seed)[0];
        if (!imposter) continue;

        const mine = shuffle(home.shots, seed).slice(0, 3);
        if (mine.length < 3) continue;
        const theirs = shuffle(imposter.shots, seed)[0];

        const tiles = shuffle(
            mine.map(image => ({ image, odd: false })).concat([{ image: theirs, odd: true }]),
            seedFrom("odd:tiles:" + day + ":" + home.id)
        );

        usedHome.add(home.id);
        rounds.push({ home: home.name, imposter: imposter.name, tiles });
    }
    return rounds;
}

/* ---------- judging what the player did ---------- */

/* Ratrospect: the moves are replayed. A card is placed into a gap in the
   line as it stood AT THAT MOMENT, so the line has to be rebuilt move by
   move — a card placed correctly joins it and changes where everything
   after it belongs. Sending the whole run rather than a score is what makes
   this checkable at all. */
function scoreRatrospect(cards, moves) {
    if (!cards.length) return null;
    let lives = LIVES;
    let points = 0;
    const grid = [];
    let down = [cards[0]];

    for (let i = 0; i < moves.length; i++) {
        if (i >= ROUNDS || lives <= 0) break;
        const move = moves[i];
        const card = cards[i + 1];
        if (!card) break;
        const gap = Number(move && move.gap);
        if (!Number.isInteger(gap) || gap < 0 || gap > down.length) return null;

        const correct = down.filter(c => c.at < card.at).length;
        const right = gap === correct;
        grid.push(right ? 1 : 0);
        if (right) {
            points += POINTS_EACH;
            down = down.concat([card]).sort((a, b) => a.at - b.at);
        } else {
            lives -= 1;
        }
    }
    return { points, solved: grid.filter(Boolean).length, grid };
}

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

        return json(200, {
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
        });
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
        // Only today. Yesterday's board is finished, and a day that has not
        // happened cannot have been played.
        if (day !== today()) return json(400, { error: "That day is not open" });

        const moves = Array.isArray(body.moves) ? body.moves.slice(0, ROUNDS) : null;
        if (!moves || !moves.length) return json(400, { error: "Bad moves" });

        let scored;
        try {
            scored = game === "ratrospect"
                ? scoreRatrospect(await ratrospectDay(day), moves)
                : scoreOdd(await oddDay(day), moves);
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
