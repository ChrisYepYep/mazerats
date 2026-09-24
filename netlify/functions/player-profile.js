/* /.netlify/functions/player-profile — everything the console's Profile page
   says about the signed-in player, in one read.

   GET only, signed in only. Nothing here is stored: every figure is counted
   from rows other functions already keep, for the same reason player-data.js
   derives its stats rather than storing them — a second copy of a total is a
   second answer to argue with.

   What it reads, and from where:
     players          when they first signed in (discord-auth.js)
     guess_scores     Guess the Maze days, points and streaks
     daily_scores     Odd One Out, the same (daily-scores.js; game "odd")
     ff_scores        their best Fallin' Furni run and where it ranks
     dead_end_leads   what they sent through Add Maze Info, by outcome

   RANKS ARE COMPETITION RANKS, as the boards number them (see ranks in
   js/daily.js): a player's place is one more than the number of players
   with strictly more points, so two players level share a place. They are
   worked out over every player, not only the ten a board shows — being
   27th is still worth knowing when the board stops at 10. */
const { getDb } = require("./_db");
const { playerFrom } = require("./_player");
const { today } = require("./_daily");
const { SECURITY_HEADERS } = require("./_headers");

const ROUNDS = 5;
// The live games daily_scores serves; a row from a dropped game is history,
// not a score (see liveGames in daily-scores.js).
const DAILY_GAMES = ["odd"];

const json = (statusCode, data) => ({
    statusCode,
    headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    body: JSON.stringify(data)
});

function yesterdayOf(iso) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

/* Days, points and streaks from one game's rows, sorted by day. The same
   counting as statsFor in player-data.js, over whichever collection the
   game keeps its rows in. The current streak is only current if it reaches
   today or yesterday: a run that ended last week is a best, not a streak. */
function gameStats(rows, day) {
    const out = { days: rows.length, points: 0, solved: 0, rounds: rows.length * ROUNDS, bestDay: 0, streak: 0, best: 0, playedToday: false };
    if (!rows.length) return out;

    rows.forEach(r => {
        out.points += r.points || 0;
        out.solved += r.solved || 0;
        out.bestDay = Math.max(out.bestDay, r.points || 0);
    });

    const days = rows.map(r => r.day);
    const set = new Set(days);
    out.playedToday = set.has(day);

    const last = days[days.length - 1];
    if (last === day || last === yesterdayOf(day)) {
        for (let d = last; set.has(d); d = yesterdayOf(d)) out.streak++;
    }

    let run = 0;
    days.forEach((d, i) => {
        run = (i > 0 && days[i - 1] === yesterdayOf(d)) ? run + 1 : 1;
        out.best = Math.max(out.best, run);
    });
    return out;
}

// Points per player across a collection, as a Map of id -> total.
async function totals(col, match) {
    const rows = await col.aggregate([
        { $match: match },
        { $group: { _id: "$playerId", points: { $sum: "$points" } } }
    ]).toArray();
    const map = new Map();
    rows.forEach(r => { if (r._id) map.set(r._id, r.points || 0); });
    return map;
}

/* EVERYBODY'S TOTALS, remembered for a few minutes.

   A rank needs every player's total, and that was two whole-table
   aggregations on every single open of the Profile page — the most
   expensive read on the site, repeated for a number that barely moves. So
   the maps are kept in this warm instance for TOTALS_TTL_MS. The PROMISE is
   cached, as in _db.js, so a burst of opens shares one aggregation, and a
   failed one is forgotten rather than served for five minutes.

   What goes stale is only OTHER people's totals. The player's own total is
   always counted fresh from their own rows (see handler), so the points
   they just earned show at once; at worst their place is a few minutes
   behind somebody else's. */
const TOTALS_TTL_MS = 5 * 60 * 1000;
let totalsCache = null;             // { at, promise }

function boardTotals(guessCol, dailyCol) {
    if (totalsCache && Date.now() - totalsCache.at < TOTALS_TTL_MS) return totalsCache.promise;
    const promise = Promise.all([
        totals(guessCol, {}),
        totals(dailyCol, { game: { $in: DAILY_GAMES } })
    ]).then(([guess, odd]) => {
        // Both dailies added together, as the combined board adds them.
        const combined = new Map(guess);
        odd.forEach((p, k) => combined.set(k, (combined.get(k) || 0) + p));
        return { guess, odd, combined };
    });
    const entry = { at: Date.now(), promise };
    totalsCache = entry;
    promise.catch(() => { if (totalsCache === entry) totalsCache = null; });
    return promise;
}

const sumPoints = (rows) => rows.reduce((t, r) => t + (r.points || 0), 0);

/* Where `id` stands in a Map of everybody's totals, given their own `mine`
   (null if they have no rows, and so no place). Their entry in the map is
   ignored in favour of `mine`, which is fresh where the map may not be. */
function placeIn(map, id, mine) {
    if (mine == null) return null;
    let above = 0;
    map.forEach((p, k) => { if (k !== id && p > mine) above++; });
    return { rank: above + 1, of: map.size + (map.has(id) ? 0 : 1), points: mine };
}

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
    const player = playerFrom(event);
    if (!player) return json(401, { error: "Not signed in" });

    let db;
    try {
        db = await getDb();
    } catch (e) {
        return json(503, { error: "Database connection failed" });
    }

    const day = today();
    const id = player.id;
    const guessCol = db.collection("guess_scores");
    const dailyCol = db.collection("daily_scores");
    const ffCol = db.collection("ff_scores");

    try {
        const rowShape = { projection: { _id: 0, day: 1, points: 1, solved: 1 } };
        const [profile, guessRows, oddRows, board, ffMine, leadCounts] = await Promise.all([
            db.collection("players").findOne({ id }, { projection: { _id: 0, joinedAt: 1 } }),
            guessCol.find({ playerId: id }, rowShape).sort({ day: 1 }).toArray(),
            dailyCol.find({ playerId: id, game: "odd" }, rowShape).sort({ day: 1 }).toArray(),
            boardTotals(guessCol, dailyCol),
            ffCol.findOne({ playerId: id }, { projection: { _id: 0, points: 1, levels: 1, ms: 1, at: 1 } }),
            db.collection("dead_end_leads").aggregate([
                { $match: { "from.id": id } },
                { $group: { _id: "$status", n: { $sum: 1 } } }
            ]).toArray()
        ]);

        // Their own totals, fresh from their own rows; null means no place.
        const myGuess = guessRows.length ? sumPoints(guessRows) : null;
        const myOdd = oddRows.length ? sumPoints(oddRows) : null;
        const myCombined = myGuess == null && myOdd == null ? null : (myGuess || 0) + (myOdd || 0);

        /* Only runs from launch onwards, as the public board counts them (see
           sinceLaunch in ff-scores.js). The pre-launch test runs are still in
           the collection; without this the owner's profile showed a 9,190
           test run as their best, ranked against a board that no longer
           lists it. settings.launchAt and every `at` are ISO strings, so
           they compare as strings. */
        const settings = await db.collection("settings").findOne({ _id: "site" }, { projection: { launchAt: 1 } });
        const launchMs = settings && settings.launchAt ? Date.parse(settings.launchAt) : NaN;
        const since = isNaN(launchMs) ? {} : { at: { $gte: new Date(launchMs).toISOString() } };
        const ffCounts = ffMine && (!since.at || String(ffMine.at || "") >= since.at.$gte);

        let ff = null;
        if (ffCounts) {
            const points = Number(ffMine.points) || 0;
            const [above, of] = await Promise.all([
                ffCol.countDocuments({ ...since, points: { $gt: points } }),
                ffCol.countDocuments(since)
            ]);
            ff = { points, levels: ffMine.levels || 0, ms: ffMine.ms || 0, rank: above + 1, of };
        }

        const leads = { sent: 0, accepted: 0, waiting: 0 };
        leadCounts.forEach(r => {
            leads.sent += r.n;
            if (r._id === "accepted") leads.accepted += r.n;
            if (r._id === "new") leads.waiting += r.n;
        });

        return json(200, {
            day,
            player: { id, name: player.name, avatar: player.avatar || null, joinedAt: (profile && profile.joinedAt) || null },
            games: {
                guess: { ...gameStats(guessRows, day), place: placeIn(board.guess, id, myGuess) },
                odd: { ...gameStats(oddRows, day), place: placeIn(board.odd, id, myOdd) }
            },
            combined: placeIn(board.combined, id, myCombined),
            ff,
            leads
        });
    } catch (e) {
        return json(500, { error: "Could not read your profile" });
    }
};
