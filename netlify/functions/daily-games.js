/* /.netlify/functions/daily-games — the daily games, from the admin's side.

   Three games run a puzzle a day: Guess the Maze, Ratrospect and Odd One
   Out. This endpoint is how an administrator looks at one player's standing
   in them and, where it is warranted, gives a day back.

   ----------------------------------------------------------------------
   Where a day actually lives, which is the whole difficulty

   All three now keep a scored row per player per day — Guess the Maze in
   guess_scores, the other two in daily_scores since they were given
   leaderboards of their own. None of them keeps the day IN PROGRESS there:
   that lives in the player's own browser, in localStorage, which is not
   something a server can reach into.

   So a reset is two things, and it does both:

     · the scored row for today is deleted, so the day can be played and
       submitted again;

     · a TICKET is written here, and the game claims it the next time that
       player opens it. The page asks "is there a reset waiting for me",
       clears its own stored day if there is, and says so. That is what
       reaches into the browser, and it is the only thing that can.

   A ticket is therefore a promise rather than an act: it takes effect when
   the player next opens the game, on whichever device they open it on. The
   admin page says exactly that rather than claiming the day is already
   gone.

   Both halves need the player to be signed in with Discord, because that is
   the only thing that makes a player identifiable across a page load. Play
   from a signed-out browser is anonymous by construction and cannot be
   addressed by anybody, including us. */
const { getDb } = require("./_db");
const { isAuthorized, canWrite, usernameFromToken, UNAUTHORIZED, READ_ONLY } = require("./_auth");
const { playerFrom } = require("./_player");

const SCORES = "guess_scores";
const RESETS = "daily_resets";
/* Guess the Maze keeps a THIRD copy of the day, and missing it is what made
   the first version of this reset appear to do nothing at all.

   A signed-in player's day in progress is mirrored onto their account in
   player_state.guess, so a day begun on a phone can be finished on a laptop
   (see netlify/functions/player-data.js). On opening, the game clears its
   local day, then asks the account for its state and adopts whatever comes
   back — so deleting the score row and the browser copy while leaving this
   one simply restored the finished day a moment later.

   A reset therefore clears all three: the scored row, the account's mirror,
   and — by ticket — the browser's own copy. */
const PLAYER_STATE = "player_state";

/* The games this endpoint knows about, and where each keeps its scores.

   Guess the Maze has always had its own collection. The other two had none
   at all until they were given leaderboards; they now write to
   daily_scores, one row per player per day per game. `collection` is what a
   reset has to clear on top of the ticket it always writes. */
const GAMES = [
    { key: "guess", name: "Guess the Maze", collection: "guess_scores", filter: {} },
    { key: "ratrospect", name: "Ratrospect", collection: "daily_scores", filter: { game: "ratrospect" } },
    { key: "odd", name: "Odd One Out", collection: "daily_scores", filter: { game: "odd" } }
];

const isGame = key => GAMES.some(g => g.key === key);

const json = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

// The same day boundary the pages use: UTC, so an admin and a player never
// disagree about which day "today" is. See js/daily.js.
const today = () => new Date().toISOString().slice(0, 10);

let ensured = false;
async function ensureIndexes(col) {
    if (ensured) return;
    // One pending ticket per player per game: asking twice is the same ask.
    await col.createIndex({ playerId: 1, game: 1 }, { unique: true }).catch(() => {});
    ensured = true;
}

exports.handler = async (event) => {
    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(500, { error: "Database connection failed", detail: e.message });
    }
    const scores = db.collection(SCORES);
    const resets = db.collection(RESETS);
    await ensureIndexes(resets);

    const params = event.queryStringParameters || {};

    /* ---------- the player's half ----------

       Asked by the games themselves, with the player's own cookie and no
       admin token in sight. It answers only about the caller: there is no
       way to ask this about somebody else. */
    if (params.mine === "1") {
        const player = playerFrom(event);
        if (!player) return json(200, { games: [] });

        if (event.httpMethod === "POST") {
            // Claimed: the page has cleared its stored day, so the ticket is
            // spent. Deleted rather than marked, because a ticket that has
            // been used is not a record of anything worth keeping.
            let body = {};
            try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }
            if (!isGame(body.game)) return json(400, { error: "Unknown game" });
            await resets.deleteOne({ playerId: player.id, game: body.game });
            return json(200, { cleared: body.game });
        }

        const pending = await resets.find({ playerId: player.id }).toArray();
        return json(200, { games: pending.map(r => r.game) });
    }

    // ---------- everything below is the admin's half ----------

    if (!isAuthorized(event)) return UNAUTHORIZED;

    if (event.httpMethod === "GET") {
        /* The players worth listing are the ones the site has actually seen
           play: everyone with a scored row, plus anyone with a ticket
           waiting. A search box over Discord's whole user list would be a
           different feature and a worse one. */
        /* Everyone the games have seen. Guess the Maze's own collection is
           the older and larger one; the other two live in daily_scores, and
           a player who has only ever played those must still be findable
           here. */
        const knownDaily = await db.collection("daily_scores").aggregate([
            { $group: { _id: "$playerId", name: { $last: "$name" }, avatar: { $last: "$avatar" }, days: { $sum: 1 }, points: { $sum: "$points" }, lastDay: { $max: "$day" } } },
            { $sort: { lastDay: -1 } },
            { $limit: 200 }
        ]).toArray();

        const known = await scores.aggregate([
            {
                $group: {
                    _id: "$playerId",
                    name: { $last: "$name" },
                    avatar: { $last: "$avatar" },
                    days: { $sum: 1 },
                    points: { $sum: "$points" },
                    lastDay: { $max: "$day" }
                }
            },
            { $sort: { lastDay: -1 } },
            { $limit: 200 }
        ]).toArray();

        const pending = await resets.find({}).toArray();
        const byPlayer = new Map();
        const addRow = row => {
            const seen = byPlayer.get(row._id);
            if (!seen) {
                byPlayer.set(row._id, {
                    id: row._id,
                    name: row.name || "Someone",
                    avatar: row.avatar || null,
                    days: row.days,
                    points: row.points,
                    lastDay: row.lastDay,
                    pending: []
                });
                return;
            }
            // Somebody who plays more than one of them: their days and
            // points are the total across all three, and the most recent
            // day is whichever game they played last.
            seen.days += row.days;
            seen.points += row.points;
            if (!seen.lastDay || (row.lastDay && row.lastDay > seen.lastDay)) seen.lastDay = row.lastDay;
            if (!seen.avatar && row.avatar) seen.avatar = row.avatar;
        };
        known.forEach(addRow);
        knownDaily.forEach(addRow);
        pending.forEach(t => {
            if (!byPlayer.has(t.playerId)) {
                byPlayer.set(t.playerId, {
                    id: t.playerId, name: t.name || "Someone", avatar: t.avatar || null,
                    days: 0, points: 0, lastDay: null, pending: []
                });
            }
            byPlayer.get(t.playerId).pending.push(t.game);
        });

        const players = [...byPlayer.values()];
        const q = String(params.q || "").trim().toLowerCase();
        const filtered = q
            ? players.filter(p => p.name.toLowerCase().includes(q) || p.id.includes(q))
            : players;

        /* A player's standing in each game, so the admin is deciding with
           the facts in front of them rather than pressing a button and
           hoping. Only asked for one player at a time — the day's row for
           every player in every game is a report, not a control. */
        let detail = null;
        if (params.playerId) {
            const id = String(params.playerId);
            const waiting = pending.filter(t => t.playerId === id).map(t => t.game);

            // Each game's own rows, from wherever that game keeps them.
            const perGame = await Promise.all(GAMES.map(async g => {
                const rows = await db.collection(g.collection)
                    .find(Object.assign({ playerId: id }, g.filter), { projection: { _id: 0 } })
                    .sort({ day: -1 }).limit(30).toArray();
                const todayRow = rows.find(r => r.day === today());
                return {
                    key: g.key,
                    name: g.name,
                    scored: true,
                    playedToday: Boolean(todayRow),
                    todayPoints: todayRow ? todayRow.points : null,
                    days: rows.length,
                    resetWaiting: waiting.includes(g.key),
                    rows
                };
            }));

            detail = {
                id,
                games: perGame.map(({ rows, ...rest }) => rest),
                /* The recent list is Guess the Maze's, because it is the one
                   with a solved-out-of-five to show and the longest history.
                   A merged list of three games' days would need a column to
                   say which game each row was, which is a report rather than
                   the thing this panel is for. */
                recent: (perGame.find(g => g.key === "guess") || { rows: [] }).rows
                    .slice(0, 8).map(r => ({ day: r.day, points: r.points, solved: r.solved }))
            };
        }

        return json(200, { today: today(), games: GAMES, players: filtered, detail });
    }

    if (event.httpMethod === "POST") {
        // canWrite, not isAuthorized: a viewer is a real account and passes
        // the gate above quite correctly, and still may not change anything.
        if (!canWrite(event)) return READ_ONLY;

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch (e) { body = {}; }
        const game = String(body.game || "");
        const playerId = String(body.playerId || "");
        if (!isGame(game)) return json(400, { error: "Unknown game" });
        if (!playerId) return json(400, { error: "Which player?" });

        const meta = GAMES.find(g => g.key === game);
        const by = usernameFromToken(event) || "an admin";
        let deleted = 0;

        if (body.action === "cancel") {
            // Called off before the player ever saw it.
            const gone = await resets.deleteOne({ playerId, game });
            return json(200, { cancelled: Boolean(gone.deletedCount), game });
        }

        let mirrorCleared = false;
        {
            // Today only. Deleting a player's whole history is a different
            // and much larger decision than giving them today back, and it
            // is not one a single button should be able to make.
            const gone = await db.collection(meta.collection)
                .deleteOne(Object.assign({ playerId, day: today() }, meta.filter));
            deleted = gone.deletedCount || 0;

            /* And the account's mirror of the day in progress, which is the
               copy the game reads back the instant it has cleared its own.
               Only cleared if it is TODAY's: a mirror left over from
               yesterday is already ignored by the game, and removing it
               would be tidying up something nobody asked about. */
            const state = meta.key === "guess"
                ? await db.collection(PLAYER_STATE).findOne({ playerId }, { projection: { guess: 1 } })
                : null;
            if (state && state.guess && state.guess.day === today()) {
                await db.collection(PLAYER_STATE).updateOne({ playerId }, { $set: { guess: null } });
                mirrorCleared = true;
            }
        }

        const player = await scores.findOne({ playerId }, { projection: { name: 1, avatar: 1 } });
        await resets.updateOne(
            { playerId, game },
            {
                $set: {
                    playerId, game, by,
                    name: player ? player.name : null,
                    avatar: player ? player.avatar : null,
                    at: new Date().toISOString()
                }
            },
            { upsert: true }
        );

        return json(200, {
            game,
            playerId,
            scoreRowsDeleted: deleted,
            accountDayCleared: mirrorCleared,
            /* Said plainly so the admin page can say it too: the browser
               half has not happened yet and will not until the player opens
               the game. */
            ticket: "waiting"
        });
    }

    return json(405, { error: "Method not allowed" });
};
