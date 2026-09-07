/* /.netlify/functions/guess-scores — the daily game's leaderboards.

   GET  ?day=YYYY-MM-DD   today's top scorers and the all-time table
   POST {day, rounds}     records the signed-in player's finished day

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

const COLLECTION = "guess_scores";
const ROUNDS = 5;
// Must stay in step with POINTS in js/guess.js — the page shows the number,
// this decides it.
const POINTS = [100, 70, 45, 25];
const BOARD_SIZE = 10;

const json = (statusCode, data) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        // A board that changes as people finish their day, cached briefly so
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
    await col.createIndex({ day: 1, playerId: 1 }, { unique: true }).catch(() => {});
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

function seedFrom(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

const normalise = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* The five maze names for a day, worked out exactly as the page works them
   out. Cached per day on the warm container: it is the same answer for
   every request all day, and it costs a full read of the archive. */
const answerCache = { day: "", names: null };

async function answersFor(day) {
    if (answerCache.day === day && answerCache.names) return answerCache.names;

    const db = await getDb();
    const rooms = await db.collection("rooms")
        .find({}, { projection: { id: 1, name: 1, gallery: 1 } })
        .toArray();

    const pool = [];
    rooms.forEach(room => {
        if (!room.name || !room.id) return;
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

    const rand = seededRandom(seedFrom(day));
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

const iso = (d) => d.toISOString().slice(0, 10);

/* Calendar weeks and months in UTC, matching the day the game itself turns
   over on. Calendar rather than rolling: the point of a shorter board is
   that everyone starts level again on Monday, and a rolling seven days
   never starts anyone level. */
function rangeBounds(kind, todayStr) {
    const today = new Date(todayStr + "T00:00:00Z");
    if (kind === "day") return { from: todayStr, to: todayStr };
    if (kind === "week") {
        // getUTCDay is 0 for Sunday; shift so weeks run Monday to Sunday.
        const back = (today.getUTCDay() + 6) % 7;
        const start = new Date(today);
        start.setUTCDate(start.getUTCDate() - back);
        return { from: iso(start), to: todayStr };
    }
    if (kind === "month") {
        return { from: todayStr.slice(0, 8) + "01", to: todayStr };
    }
    return { from: "0000-01-01", to: "9999-12-31" };   // all time
}

/* One board over a span of days. Grouped per player so a month's board is
   a total rather than a list of days, and ordered by points with fewer days
   winning ties — someone who scored the same in less play was better at it. */
async function board(col, from, to, limit) {
    const rows = await col.aggregate([
        { $match: { day: { $gte: from, $lte: to } } },
        { $group: {
            _id: "$playerId",
            points: { $sum: "$points" },
            solved: { $sum: "$solved" },
            days: { $sum: 1 },
            // Newest row wins the name, so a Discord rename shows through
            // rather than the board keeping whatever they were first called.
            name: { $last: "$name" },
            avatar: { $last: "$avatar" }
        } },
        { $sort: { points: -1, days: 1 } },
        { $limit: limit }
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

    // ---------- read the boards ----------
    if (event.httpMethod === "GET") {
        const day = ((event.queryStringParameters || {}).day || todayIso()).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { error: "Bad day" });

        try {
            const week = rangeBounds("week", day);
            const month = rangeBounds("month", day);
            const all = rangeBounds("all", day);

            /* All four boards in one request rather than one per tab. They
               are small, they are read together, and a results panel whose
               tabs each cost a round trip feels broken in a way that four
               cheap aggregations do not. */
            const [todayRows, weekRows, monthRows, allRows] = await Promise.all([
                // The day's own board keeps its per-player rows rather than
                // being grouped, because it carries the grid for the
                // head-to-head and there is nothing to sum over one day.
                col.find({ day }, { projection: { _id: 0, playerId: 1, name: 1, avatar: 1, points: 1, solved: 1, grid: 1 } })
                    .sort({ points: -1, at: 1 })
                    .limit(BOARD_SIZE)
                    .toArray(),
                board(col, week.from, week.to, BOARD_SIZE),
                board(col, month.from, month.to, BOARD_SIZE),
                board(col, all.from, all.to, BOARD_SIZE)
            ]);

            // "date" is the day these are FOR; "day" is the board itself.
            // Named for how the page reads them, not for how they are stored.
            return json(200, {
                date: day,
                weekFrom: week.from,
                monthFrom: month.from,
                day: todayRows.map(r => ({
                    id: r.playerId, name: r.name, avatar: r.avatar,
                    points: r.points, solved: r.solved,
                    // Older rows predate the grid being stored; an empty one
                    // simply renders as no grid rather than as a wrong one.
                    grid: Array.isArray(r.grid) ? r.grid : null
                })),
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
        // Only today. Yesterday's board is finished, and a day that has not
        // happened cannot have been played.
        if (day !== todayIso()) return json(400, { error: "That day is not open" });
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

        try {
            await col.insertOne({
                day,
                playerId: player.id,
                name: player.name,
                avatar: player.avatar,
                points,
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
